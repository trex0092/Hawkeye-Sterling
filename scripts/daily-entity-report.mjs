/**
 * Daily per-entity compliance report.
 *
 * For every Asana project that carries the pinned task
 * "📌 Today's Priorities", this script produces a formal daily report
 * structured for MLRO review and for MOE inspection. The report is:
 *
 *   1. Written to history/daily/YYYY-MM-DD/entity-reports/<slug>.md
 *   2. Rendered to Word (.docx) at the same path
 *   3. Uploaded as attachments on the pinned task in Asana
 *   4. Accompanied by a short headline comment on the same task
 *
 * If scripts/entities.json exists and maps multiple Asana projects to
 * a single entity name, the report consolidates those projects into one
 * document per entity. The default behaviour (no mapping file) treats
 * every project as its own entity.
 *
 * This script does not call Claude for the whole document. The header,
 * counters, tables and footer are deterministic. Only the short
 * "analytical commentary" section uses Claude, with the standard
 * SYSTEM_PROMPT and validateOutput style guard.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  createClaudeCaller,
  wrapDocument,
  renderTable,
  classifyTask,
  CONFIRMED_REFERENCES,
  STYLE_REMINDER,
  validateOutput,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, slugify, isoDate } from "./history-writer.mjs";
import { renderDocxBuffer } from "./lib/docx-writer.mjs";

const env = readCommonEnv();
const today = isoDate();
const asanaClient = createAsanaClient(env);
const { callClaude } = createClaudeCaller(env);

async function readEntitiesMap() {
  try {
    const text = await readFile(
      path.resolve(process.cwd(), "entities.json"),
      "utf8",
    );
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.entities) return parsed;
    return null;
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`entities.json read: ${err.message}`);
    return null;
  }
}

function groupProjectsByEntity(projects, entitiesMap) {
  if (!entitiesMap) {
    return projects.map((p) => ({
      entityName: p.name,
      entitySlug: slugify(p.name),
      projects: [p],
    }));
  }
  const groups = [];
  const claimed = new Set();
  for (const entity of entitiesMap.entities) {
    const matched = projects.filter((p) => entity.projects?.includes(p.name));
    matched.forEach((m) => claimed.add(m.gid));
    if (matched.length > 0) {
      groups.push({
        entityName: entity.name,
        entitySlug: slugify(entity.name),
        projects: matched,
      });
    }
  }
  const unclaimed = projects.filter((p) => !claimed.has(p.gid));
  for (const p of unclaimed) {
    groups.push({
      entityName: p.name,
      entitySlug: slugify(p.name),
      projects: [p],
    });
  }
  return groups;
}

function classifyStatus(task) {
  if (task.completed) return "completed";
  const now = Date.now();
  if (task.due_on) {
    const due = Date.parse(task.due_on);
    if (Number.isFinite(due)) {
      if (due < now - 24 * 3600 * 1000) return "overdue";
      if (due < now + 2 * 24 * 3600 * 1000) return "at-risk";
    }
  }
  return "open";
}

function summariseCounters(tasks) {
  const c = { open: 0, overdue: 0, atRisk: 0, completed24h: 0, new24h: 0 };
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  for (const t of tasks) {
    const status = classifyStatus(t);
    if (status === "open") c.open++;
    else if (status === "overdue") c.overdue++;
    else if (status === "at-risk") c.atRisk++;
    if (t.completed && t.completed_at && Date.parse(t.completed_at) >= dayAgo) c.completed24h++;
    if (t.created_at && Date.parse(t.created_at) >= dayAgo) c.new24h++;
  }
  return c;
}

function summariseTypologies(tasks) {
  const totals = {};
  for (const t of tasks) {
    const cls = classifyTask(t);
    for (const [k, v] of Object.entries(cls)) {
      totals[k] = (totals[k] ?? 0) + (v > 0 ? 1 : 0);
    }
  }
  return totals;
}

function buildOverdueTable(tasks) {
  const overdue = tasks
    .filter((t) => classifyStatus(t) === "overdue")
    .sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)))
    .slice(0, 15);
  if (overdue.length === 0) return "(no overdue items)";
  return renderTable(
    overdue.map((t) => ({
      due: t.due_on ?? "",
      task: (t.name ?? "").slice(0, 70),
      assignee: t.assignee?.name ?? "unassigned",
    })),
    [
      { key: "due", header: "Due date", max: 12 },
      { key: "task", header: "Task", max: 70 },
      { key: "assignee", header: "Assignee", max: 25 },
    ],
  );
}

function buildRedFlagTable(tasks) {
  const flagged = [];
  for (const t of tasks) {
    const cls = classifyTask(t);
    const hits = Object.entries(cls).filter(([, v]) => v > 0).map(([k]) => k);
    if (hits.length > 0 && !t.completed) {
      flagged.push({
        task: (t.name ?? "").slice(0, 60),
        flags: hits.join(", "),
        due: t.due_on ?? "",
      });
    }
  }
  if (flagged.length === 0) return "(no red-flag tags matched today)";
  return renderTable(flagged.slice(0, 20), [
    { key: "task", header: "Task", max: 60 },
    { key: "flags", header: "Typology flags", max: 40 },
    { key: "due", header: "Due", max: 12 },
  ]);
}

async function buildCommentary(entityName, counters, typologies, hasRedFlags) {
  const prompt = [
    `Draft a short analytical commentary for the daily compliance report of ${entityName}.`,
    `Today is ${today}.`,
    "",
    "FACTS:",
    `- Open items: ${counters.open}`,
    `- Overdue items: ${counters.overdue}`,
    `- At-risk items (due within 48 hours): ${counters.atRisk}`,
    `- Completed in the last 24 hours: ${counters.completed24h}`,
    `- New items raised in the last 24 hours: ${counters.new24h}`,
    `- Typology matches today: ${JSON.stringify(typologies)}`,
    `- Red-flag items present: ${hasRedFlags ? "yes" : "no"}`,
    "",
    "Write three short paragraphs.",
    "Paragraph 1: the state of the book today in one or two sentences, using the numbers above.",
    "Paragraph 2: the typologies that warrant MLRO attention today and why.",
    "Paragraph 3: next actions, each expressed as an imperative verb sentence, no more than four actions.",
    "",
    "No em-dashes. No markdown hash headings. No AI phrasing. First person plural for the compliance function.",
    "",
    STYLE_REMINDER,
  ].join("\n");
  try {
    return await callClaude(prompt, { label: `entity-report ${entityName}`, maxTokens: 900 });
  } catch (err) {
    console.warn(`  commentary fallback for ${entityName}: ${err.message}`);
    return [
      `We reviewed the position for ${entityName} on ${today}.`,
      `There are ${counters.open} open items, ${counters.overdue} overdue and ${counters.atRisk} at risk within 48 hours.`,
      `In the last 24 hours ${counters.completed24h} items closed and ${counters.new24h} new items were raised.`,
      "",
      "We note the typology distribution recorded above and the red-flag items listed in the table.",
      "",
      "Next actions. Review every overdue item with the assignee before end of day.",
      "Next actions. Escalate any unresolved red-flag item to the MLRO for direction.",
      "Next actions. Confirm that no filing candidate has slipped past its internal deadline.",
    ].join("\n");
  }
}

function buildReport(entityName, tasks, commentaryText) {
  const counters = summariseCounters(tasks);
  const typologies = summariseTypologies(tasks);
  const overdueTable = buildOverdueTable(tasks);
  const redFlagTable = buildRedFlagTable(tasks);

  const countersBlock = renderTable(
    [
      { label: "Open items", value: String(counters.open) },
      { label: "Overdue items", value: String(counters.overdue) },
      { label: "At-risk items (48h)", value: String(counters.atRisk) },
      { label: "Closed in last 24h", value: String(counters.completed24h) },
      { label: "New in last 24h", value: String(counters.new24h) },
    ],
    [
      { key: "label", header: "Metric", max: 30 },
      { key: "value", header: "Count", max: 8 },
    ],
  );

  const typologyRows = Object.entries(typologies)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ typology: k, hits: String(v) }));
  const typologyBlock = typologyRows.length === 0
    ? "(no typology matches today)"
    : renderTable(typologyRows, [
        { key: "typology", header: "Typology", max: 25 },
        { key: "hits", header: "Tasks", max: 8 },
      ]);

  const body = [
    "ENTITY IDENTIFICATION",
    "",
    `Reporting entity: ${entityName}`,
    `Sector: ${CONFIRMED_REFERENCES.entity.sector}`,
    `Classification: ${CONFIRMED_REFERENCES.entity.classification}`,
    `Supervisor: ${CONFIRMED_REFERENCES.entity.supervisor}`,
    "",
    "OPEN EXPOSURE SNAPSHOT",
    "",
    countersBlock,
    "",
    "TYPOLOGY DISTRIBUTION TODAY",
    "",
    typologyBlock,
    "",
    "OVERDUE ITEMS REQUIRING ATTENTION",
    "",
    overdueTable,
    "",
    "RED-FLAG ITEMS RAISED OR OPEN",
    "",
    redFlagTable,
    "",
    "ANALYTICAL COMMENTARY",
    "",
    commentaryText,
    "",
    "ITEMS REQUIRING MLRO DECISION BEFORE END OF DAY",
    "",
    counters.overdue > 0 || typologyRows.some((r) => ["sanctions", "pep", "escalation"].includes(r.typology))
      ? "One or more items above are flagged for MLRO attention. The MLRO is asked to review the red-flag table and the overdue table and to direct the compliance function accordingly."
      : "No item requires MLRO intervention today. Routine oversight applies.",
  ].join("\n");

  const reference = `HSV2-DER-${today}-${slugify(entityName).slice(0, 20)}`;
  return wrapDocument({
    title: "Daily Compliance Report",
    subtitle: entityName,
    reference,
    classification: "Confidential. For MLRO review only.",
    coverage: `Operational day ending ${today}`,
    preparedOn: today,
    body,
  });
}

function buildHeadlineComment(entityName, counters) {
  return [
    `HSV2 / Daily Compliance Report / ${entityName} / ${today}`,
    "",
    `Open: ${counters.open}  |  Overdue: ${counters.overdue}  |  At-risk 48h: ${counters.atRisk}  |  Closed 24h: ${counters.completed24h}  |  New 24h: ${counters.new24h}`,
    "",
    "Full report attached above. Markdown and Word.",
    "",
    `For review by the MLRO, ${CONFIRMED_REFERENCES.mlro.name}.`,
  ].join("\n");
}

async function main() {
  console.log(`▶ Daily per-entity report for ${today}`);
  if (env.DRY_RUN) console.log("   DRY RUN — no Asana posts or uploads");

  const [projects, entitiesMap] = await Promise.all([
    asanaClient.listProjects(),
    readEntitiesMap(),
  ]);
  console.log(`   projects: ${projects.length}`);
  if (entitiesMap) console.log(`   entity mapping: ${entitiesMap.entities.length} entities`);

  const groups = groupProjectsByEntity(projects, entitiesMap);
  console.log(`   entity groups: ${groups.length}`);

  const results = { built: 0, attached: 0, skipped: 0, failed: 0 };

  for (const group of groups) {
    console.log(`\n▶ ${group.entityName}`);
    let pinnedTaskGid = null;
    const allTasks = [];
    for (const project of group.projects) {
      try {
        const tasks = await asanaClient.listProjectTasks(project.gid);
        const pinned = tasks.find((t) => t.name.trim() === env.PINNED_TASK_NAME.trim());
        if (!pinnedTaskGid && pinned) pinnedTaskGid = pinned.gid;
        allTasks.push(...tasks.filter((t) => t.name.trim() !== env.PINNED_TASK_NAME.trim()));
      } catch (err) {
        console.warn(`  listProjectTasks failed for ${project.name}: ${err.message}`);
      }
    }

    if (!pinnedTaskGid) {
      console.log(`  ⏭  no "${env.PINNED_TASK_NAME}" task in any project of this entity — skipping`);
      results.skipped++;
      continue;
    }

    const counters = summariseCounters(allTasks);
    const typologies = summariseTypologies(allTasks);
    const hasRedFlags = Object.values(typologies).some((v) => v > 0);

    let commentary;
    try {
      commentary = await buildCommentary(group.entityName, counters, typologies, hasRedFlags);
    } catch (err) {
      console.warn(`  commentary generation failed: ${err.message}`);
      commentary = "Commentary generation failed. The MLRO is asked to review the tables above and direct the compliance function accordingly.";
    }

    const report = buildReport(group.entityName, allTasks, commentary);
    const check = validateOutput(report);
    if (!check.ok) {
      console.warn(`  ⚠  style validation warnings: ${check.problems.join("; ")}`);
    }

    const mdRelPath = path.join("daily", today, "entity-reports", `${group.entitySlug}.md`);
    await tryArchive(() => writeHistory(mdRelPath, report), `entity-report ${group.entitySlug} (md + docx)`);
    results.built++;

    if (env.DRY_RUN) {
      console.log(`  (dry) would attach ${group.entitySlug}.md and .docx to pinned task ${pinnedTaskGid}`);
      continue;
    }

    try {
      const docxBuf = renderDocxBuffer(report);
      const mdBuf = Buffer.from(report, "utf8");
      await asanaClient.attachFile(pinnedTaskGid, mdBuf, `${group.entitySlug}-${today}.md`, "text/markdown");
      await asanaClient.attachFile(pinnedTaskGid, docxBuf, `${group.entitySlug}-${today}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await asanaClient.postComment(pinnedTaskGid, buildHeadlineComment(group.entityName, counters));
      console.log(`  📎 attached md + docx to pinned task`);
      results.attached++;
    } catch (err) {
      console.warn(`  attach/post failed: ${err.message}`);
      results.failed++;
    }
  }

  console.log(`\n✓ done. built=${results.built} attached=${results.attached} skipped=${results.skipped} failed=${results.failed}`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
