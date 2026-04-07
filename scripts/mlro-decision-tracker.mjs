/**
 * MLRO Decision Tracker.
 *
 * Reads Asana tasks tagged with "hsv2:mlro-decision" across the
 * workspace and records every MLRO decision (approve, reject, escalate)
 * with timestamps and rationale in a CSV register at
 * history/registers/mlro-decisions/YYYY-MM-DD.csv.
 *
 * The CSV is the formal decision register required by the firm's AML/CFT
 * programme and retained for the full ten-year period mandated by
 * Federal Decree-Law No. 10 of 2025.
 *
 * Deterministic. No Claude calls.
 */

import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  renderTable,
  CONFIRMED_REFERENCES,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, isoDate } from "./history-writer.mjs";

/* ─── Environment guards ───────────────────────────────────────────────── */

const env = readCommonEnv({ requireClaude: false });
const today = isoDate();
const asanaClient = createAsanaClient(env);

const DECISION_TAG = "hsv2:mlro-decision";

const VALID_DECISIONS = new Set(["approve", "reject", "escalate"]);

/* ─── Asana helpers ────────────────────────────────────────────────────── */

async function findTagByName(tagName) {
  const params = new URLSearchParams({
    workspace: env.ASANA_WORKSPACE_ID,
    limit: "100",
    opt_fields: "gid,name",
  });
  const { data } = await asanaClient.asana(`/tags?${params}`);
  return data.find(
    (t) => t.name.toLowerCase().trim() === tagName.toLowerCase().trim(),
  );
}

async function fetchTasksForTag(tagGid) {
  const params = new URLSearchParams({
    tag: tagGid,
    limit: "100",
    opt_fields:
      "gid,name,notes,completed,completed_at,modified_at,assignee.name,tags.name,custom_fields.name,custom_fields.display_value",
  });
  const all = [];
  let offset;
  do {
    if (offset) params.set("offset", offset);
    const page = await asanaClient.asana(`/tasks?${params}`);
    all.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset);
  return all;
}

/* ─── Decision extraction ──────────────────────────────────────────────── */

/**
 * Extract the MLRO decision from a task. Looks for a custom field named
 * "mlro_decision" or parses the notes for a line beginning with
 * "Decision:" or "MLRO Decision:".
 */
function extractDecision(task) {
  // Try custom fields first
  for (const cf of task.custom_fields ?? []) {
    if (
      cf.name &&
      cf.name.toLowerCase().replace(/[\s_-]+/g, "").includes("mlrodecision")
    ) {
      const val = (cf.display_value ?? "").toLowerCase().trim();
      if (VALID_DECISIONS.has(val)) return val;
    }
  }

  // Fall back to notes parsing
  const lines = (task.notes ?? "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(
      /^(?:mlro\s+)?decision\s*:\s*(approve|reject|escalate)/i,
    );
    if (match) return match[1].toLowerCase();
  }

  return "pending";
}

/**
 * Extract the rationale string from the task notes. Looks for a line
 * beginning with "Rationale:" or "Reason:".
 */
function extractRationale(task) {
  const lines = (task.notes ?? "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(?:rationale|reason)\s*:\s*(.+)/i);
    if (match) return match[1].trim();
  }
  return "";
}

/**
 * Extract the MLRO name: prefer the assignee, fall back to the
 * confirmed MLRO in the regulatory references.
 */
function extractMlroName(task) {
  if (task.assignee?.name) return task.assignee.name;
  return CONFIRMED_REFERENCES.mlro.name;
}

/* ─── CSV assembly ─────────────────────────────────────────────────────── */

function escCsv(value) {
  const s = String(value ?? "").replace(/\r?\n/g, " ");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(rows) {
  const header = "date,task_gid,task_name,decision,rationale,mlro_name";
  const lines = rows.map((r) =>
    [
      escCsv(r.date),
      escCsv(r.task_gid),
      escCsv(r.task_name),
      escCsv(r.decision),
      escCsv(r.rationale),
      escCsv(r.mlro_name),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

/* ─── Report for narrative archive ─────────────────────────────────────── */

function buildReport(rows) {
  const summary = [
    `Total decisions recorded: ${rows.length}`,
    `Approved: ${rows.filter((r) => r.decision === "approve").length}`,
    `Rejected: ${rows.filter((r) => r.decision === "reject").length}`,
    `Escalated: ${rows.filter((r) => r.decision === "escalate").length}`,
    `Pending: ${rows.filter((r) => r.decision === "pending").length}`,
  ].join("\n");

  const table =
    rows.length === 0
      ? "(no MLRO-decision-tagged tasks found)"
      : renderTable(
          rows.map((r) => ({
            task: (r.task_name ?? "").slice(0, 50),
            decision: r.decision,
            mlro: r.mlro_name,
            rationale: (r.rationale ?? "").slice(0, 60),
          })),
          [
            { key: "task", header: "Task", max: 50 },
            { key: "decision", header: "Decision", max: 10 },
            { key: "mlro", header: "MLRO", max: 30 },
            { key: "rationale", header: "Rationale", max: 60 },
          ],
        );

  const body = [
    "SCOPE",
    "",
    "This register records every formal MLRO decision captured from Asana tasks",
    `tagged with "${DECISION_TAG}" as of ${today}. Each row reflects the decision`,
    "(approve, reject or escalate), the rationale provided, and the responsible",
    "officer. Pending items have no decision recorded yet and require MLRO action.",
    "",
    "SUMMARY",
    "",
    summary,
    "",
    "DECISION REGISTER",
    "",
    table,
    "",
    "NEXT ACTIONS",
    "",
    rows.some((r) => r.decision === "pending")
      ? "Pending items require the MLRO to record a formal decision and rationale before the next business day."
      : "All tagged items have a recorded decision.",
    "Retain this register for the full ten-year retention period.",
  ].join("\n");

  return wrapDocument({
    title: "MLRO Decision Register",
    reference: `HSV2-MLRO-DEC-${today}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Decisions as of ${today}`,
    preparedOn: today,
    body,
  });
}

/* ─── Main ─────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`▶ MLRO decision tracker ${today}`);

  const tag = await findTagByName(DECISION_TAG);
  if (!tag) {
    console.log(`   tag "${DECISION_TAG}" not found in workspace — nothing to record`);
    return;
  }
  console.log(`   tag gid: ${tag.gid}`);

  const tasks = await fetchTasksForTag(tag.gid);
  console.log(`   tasks found: ${tasks.length}`);

  const rows = tasks.map((t) => ({
    date: today,
    task_gid: t.gid,
    task_name: t.name ?? "",
    decision: extractDecision(t),
    rationale: extractRationale(t),
    mlro_name: extractMlroName(t),
  }));

  const csv = buildCsv(rows);
  await tryArchive(
    () =>
      writeHistory(
        path.join("registers", "mlro-decisions", `${today}.csv`),
        csv,
      ),
    `mlro-decisions ${today} (csv)`,
  );

  const report = buildReport(rows);
  await tryArchive(
    () =>
      writeHistory(
        path.join("registers", "mlro-decisions", `${today}.txt`),
        report,
      ),
    `mlro-decisions ${today} (txt + docx)`,
  );

  if (env.DRY_RUN) {
    console.log(`(dry) rows=${rows.length}`);
    return;
  }

  try {
    const projects = await asanaClient.listProjects();
    const target = await asanaClient.findPortfolioPinned(projects);
    if (!target) {
      console.log(
        `   no pinned task in "${env.PORTFOLIO_PROJECT_NAME}" project — skipping Asana post`,
      );
      return;
    }
    const headline = [
      `HSV2 / MLRO Decision Register / ${today}`,
      "",
      `Total decisions: ${rows.length}`,
      `Approved: ${rows.filter((r) => r.decision === "approve").length}`,
      `Rejected: ${rows.filter((r) => r.decision === "reject").length}`,
      `Escalated: ${rows.filter((r) => r.decision === "escalate").length}`,
      `Pending: ${rows.filter((r) => r.decision === "pending").length}`,
      "",
      `For review by the MLRO, ${CONFIRMED_REFERENCES.mlro.name}.`,
    ].join("\n");
    await asanaClient.postComment(target.taskGid, headline);
    console.log(`   📎 comment posted on ${target.projectName}`);
  } catch (err) {
    console.warn(`   Asana post failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
