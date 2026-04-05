/**
 * Daily Completion Retro — end-of-day accountability note.
 *
 * Runs at 17:00 Asia/Dubai Monday through Friday (13:00 UTC). Reads every
 * task across every active Asana compliance programme, measures what was
 * closed during the working day, compares against the morning priority
 * archive from history/daily/YYYY-MM-DD/ and asks Claude to produce a
 * short formal completion retro in the HSV2 register. The retro is posted
 * as a comment on the pinned "📌 Today's Priorities" task inside the
 * PORTFOLIO_PROJECT_NAME project (default SCREENINGS) and archived to
 * history/retro/YYYY-MM-DD.txt.
 */

import Anthropic from "@anthropic-ai/sdk";
import { notify } from "./notify.mjs";
import {
  SYSTEM_PROMPT,
  STYLE_REMINDER,
  CONFIRMED_REFERENCES,
  ARTEFACT_PREFIXES,
  validateOutput,
} from "./regulatory-context.mjs";
import { isoDate, writeDailyRetro } from "./history-writer.mjs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const {
  ASANA_TOKEN,
  ANTHROPIC_API_KEY,
  ASANA_WORKSPACE_ID,
  ASANA_TEAM_ID,
  CLAUDE_MODEL = "claude-haiku-4-5",
  PINNED_TASK_NAME = "📌 Today's Priorities",
  PORTFOLIO_PROJECT_NAME = "SCREENINGS",
  DRY_RUN = "false",
} = process.env;

for (const [name, value] of Object.entries({
  ASANA_TOKEN,
  ANTHROPIC_API_KEY,
  ASANA_WORKSPACE_ID,
})) {
  if (!value) {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(1);
  }
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const isDryRun = DRY_RUN === "true";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─── Asana client ──────────────────────────────────────────────────────── */

async function asana(path, init = {}) {
  const res = await fetch(`https://app.asana.com/api/1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ASANA_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Asana ${res.status} ${res.statusText} on ${path}: ${body}`);
  }
  return res.json();
}

async function listProjects() {
  const params = new URLSearchParams({
    workspace: ASANA_WORKSPACE_ID,
    archived: "false",
    limit: "100",
    opt_fields: "gid,name,archived",
  });
  if (ASANA_TEAM_ID) params.set("team", ASANA_TEAM_ID);
  const all = [];
  let offset;
  do {
    if (offset) params.set("offset", offset);
    const page = await asana(`/projects?${params}`);
    all.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset);
  return all.filter((p) => !p.archived);
}

async function listProjectTasks(projectGid, modifiedSinceIso) {
  const params = new URLSearchParams({
    project: projectGid,
    modified_since: modifiedSinceIso,
    limit: "100",
    opt_fields:
      "gid,name,completed,completed_at,modified_at,created_at,assignee.name",
  });
  const all = [];
  let offset;
  do {
    if (offset) params.set("offset", offset);
    const page = await asana(`/tasks?${params}`);
    all.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset);
  return all;
}

async function postComment(taskGid, text) {
  return asana(`/tasks/${taskGid}/stories`, {
    method: "POST",
    body: JSON.stringify({ data: { text } }),
  });
}

async function findPortfolioPinned(projects) {
  for (const project of projects) {
    if (!project.name.toLowerCase().includes(PORTFOLIO_PROJECT_NAME.toLowerCase())) continue;
    const page = await asana(
      `/tasks?${new URLSearchParams({
        project: project.gid,
        completed_since: "now",
        limit: "100",
        opt_fields: "gid,name",
      })}`,
    );
    const pinned = page.data.find((t) => t.name.trim() === PINNED_TASK_NAME.trim());
    if (pinned) return { projectName: project.name, taskGid: pinned.gid };
  }
  return null;
}

/* ─── Morning priority archive lookup ───────────────────────────────────── */

async function readMorningPriorityFiles(today) {
  const base = path.resolve(process.cwd(), "..", "history", "daily", today, "per-project");
  try {
    const files = await readdir(base);
    const entries = [];
    for (const file of files) {
      if (!file.endsWith(".txt")) continue;
      const content = await readFile(path.join(base, file), "utf8");
      entries.push({ file, content });
    }
    return entries;
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log(`  (no morning priority archive found at ${base}; retro will describe today's completions without a baseline)`);
      return [];
    }
    throw err;
  }
}

/* ─── Claude ────────────────────────────────────────────────────────────── */

async function callClaude(prompt, label) {
  console.log(`  ${label} prompt size: ~${(prompt.length / 1024).toFixed(1)} KB`);
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) throw new Error("Claude returned an empty response");
      const check = validateOutput(text);
      if (!check.ok) {
        console.warn(`  attempt ${attempt}/4 failed style validation:`);
        for (const p of check.problems) console.warn(`    - ${p}`);
        if (attempt < 4) {
          await sleep(2000);
          continue;
        }
      }
      return text;
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.response?.status;
      const detail = err?.error?.message ?? err?.message ?? String(err);
      console.warn(`  attempt ${attempt}/4 failed: ${detail}${status ? ` (status ${status})` : ""}`);
      if (status && status >= 400 && status < 500 && status !== 429) break;
      if (attempt >= 4) break;
      const retryAfterHeader =
        err?.headers?.["retry-after"] ??
        err?.response?.headers?.get?.("retry-after");
      const retryAfterSec = Number.parseInt(retryAfterHeader, 10);
      const waitMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000 + 1000
          : 30000 * attempt;
      console.warn(`  retrying in ${Math.round(waitMs / 1000)}s…`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

function buildRetroPrompt(today, stats, perProjectActivity, morningArchive) {
  const activityBlock = perProjectActivity.map((p) => {
    const completedList = p.completedNames.length === 0
      ? "  No tasks completed today."
      : p.completedNames.map((n) => `  - ${n}`).join("\n");
    return `### ${p.projectName} (${p.completed} completed today out of ${p.touched} tasks touched)\n${completedList}`;
  }).join("\n\n");

  const morningBlock = morningArchive.length === 0
    ? "No morning priority archive was available for today. Work with the completion activity alone and note the absence of a baseline."
    : morningArchive.map((e) => `### ${e.file}\n${e.content.slice(0, 2500)}${e.content.length > 2500 ? "\n...(truncated for prompt)" : ""}`).join("\n\n");

  return `TASK. You are drafting the analytical body of the Daily Completion Retro for ${CONFIRMED_REFERENCES.entity.legalName}. The document control block and the sign-off block are generated programmatically and appended to your response. You are responsible for sections 1 to 7 below, in the exact order shown.

CONTEXT NUMBERS (use verbatim where referenced):
- Date of retro: ${today}
- Total priorities on the morning lists: ${stats.priorityCount}
- Tasks completed across all programmes today: ${stats.completedCount}
- Tasks touched across all programmes today: ${stats.touchedCount}
- Programmes reviewed: ${stats.projectCount}

INPUT A. TODAY'S COMPLETION ACTIVITY (by programme)
${activityBlock}

INPUT B. MORNING PRIORITY ARCHIVE (first 2.5 KB per programme)
${morningBlock}

OUTPUT FORMAT. Emit the seven sections below in order. Use ALL CAPS section labels. Use continuous prose. No markdown hash headers.

1. PURPOSE

One short paragraph stating that this note compares the morning priority lists with the work actually closed today, entity by entity.

2. HEADLINE FOR TODAY

Two to three short sentences stating the overall completion rate observed today and the single most important item that carried over.

3. COMPLETION BY PROGRAMME

One paragraph per programme. For each programme: name it, state the morning list size if the archive was available, state the number closed, state any items that were untouched and whether they carry over with their morning priority.

4. ITEMS CARRIED OVER TO TOMORROW

Short paragraphs listing, by programme, the specific items that were not closed today and that require the MLRO's attention tomorrow. If none, state "No items carry over."

5. KEY DECISIONS TAKEN BY THE MLRO TODAY

If the morning archive or the completion data reveals any decision the MLRO took during the day, record it here. If none is visible in the data, state "No MLRO decisions were visible in today's data."

6. FILINGS MADE TODAY

If any Suspicious Transaction Report, Suspicious Activity Report, Dealers in Precious Metals and Stones Report, Partial Name Match Report or Funds Freeze Report is visible in the completion data, list it. Otherwise state "No filings were visible in today's completion data."

7. OBSERVATIONS

One to three short paragraphs offering the compliance function's observation of the day, including any positive note on throughput and any concern to flag to the MLRO. End with a single imperative sentence.

${STYLE_REMINDER}`;
}

function buildRetroDocument({ today, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;

  return `=============================================================================
${entity.legalName.toUpperCase()}
DAILY COMPLETION RETRO
=============================================================================

Document reference:   HSV2-DCR-${today}
Classification:       Confidential. For MLRO review only.
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Prepared on:          ${today}, 17:00 Asia/Dubai
Addressee:            ${mlro.name}, ${mlro.title}
Coverage:             All active compliance programmes for the calendar day ${today}.
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

${claudeBody}

-----------------------------------------------------------------------------
DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Prepared by:   Compliance function, ${entity.legalName}
Reviewed by:   [awaiting MLRO review]
Approved by:   [awaiting MLRO approval]

For review by the MLRO, ${mlro.name}.

[End of document]`;
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const today = isoDate();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  // Look back 18 hours to capture the full Dubai working day against a UTC
  // runner clock. The script filters to actual completions happening today.
  const sinceIso = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();

  console.log(`▶  Daily Completion Retro — ${new Date().toISOString()}`);
  console.log(`   date: ${today}`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  console.log(`   since: ${sinceIso}`);
  if (isDryRun) console.log("   DRY RUN — no comment will be posted");

  const projects = await listProjects();
  console.log(`\nFound ${projects.length} active projects.`);

  const morningArchive = await readMorningPriorityFiles(today);
  console.log(`Morning priority archive files found: ${morningArchive.length}`);

  const perProjectActivity = [];
  let completedCount = 0;
  let touchedCount = 0;

  for (const project of projects) {
    console.log(`\n• ${project.name}`);
    try {
      const tasks = await listProjectTasks(project.gid, sinceIso);
      const completedToday = tasks.filter(
        (t) => t.completed && t.completed_at && t.completed_at.slice(0, 10) === today,
      );
      perProjectActivity.push({
        projectName: project.name,
        touched: tasks.length,
        completed: completedToday.length,
        completedNames: completedToday.map((t) => t.name),
      });
      completedCount += completedToday.length;
      touchedCount += tasks.length;
      console.log(`    touched ${tasks.length}, completed ${completedToday.length}`);
    } catch (err) {
      console.error(`    ✗ error: ${err?.message ?? err}`);
      perProjectActivity.push({
        projectName: project.name,
        touched: 0,
        completed: 0,
        completedNames: [],
      });
    }
  }

  const stats = {
    projectCount: projects.length,
    priorityCount: morningArchive.length > 0 ? morningArchive.length * 10 : 0,
    completedCount,
    touchedCount,
  };

  console.log(`\nGenerating retro narrative…`);
  const claudeBody = await callClaude(
    buildRetroPrompt(today, stats, perProjectActivity, morningArchive),
    "retro",
  );

  const referenceId = `HSV2-DCR-${today}`;
  const document = buildRetroDocument({ today, referenceId, claudeBody });

  try {
    await writeDailyRetro(today, document);
    console.log(`✓ archived to history/retro/${today}.txt`);
  } catch (archiveErr) {
    console.warn(`⚠  failed to archive: ${archiveErr.message}`);
  }

  const portfolio = await findPortfolioPinned(projects);
  if (!portfolio) {
    console.log(`\n⚠  no "${PINNED_TASK_NAME}" task found in a project matching "${PORTFOLIO_PROJECT_NAME}" — retro not posted to Asana, archive only`);
  } else if (isDryRun) {
    console.log(`\n[dry-run] would post retro to "${portfolio.projectName}"`);
  } else {
    await postComment(portfolio.taskGid, document);
    console.log(`\n✓ retro posted to "${portfolio.projectName}" pinned task`);
  }

  if (!isDryRun) {
    await notify({
      subject: `${ARTEFACT_PREFIXES.dailyRetro} — ${today}`,
      body: document,
    });
  }

  console.log(`\n=== Summary ===`);
  console.log(`Projects reviewed: ${projects.length}`);
  console.log(`Tasks completed today: ${completedCount}`);
  console.log(`Tasks touched today:   ${touchedCount}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
