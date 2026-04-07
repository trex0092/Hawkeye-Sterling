/**
 * Training Record Tracker.
 *
 * Reads Asana tasks tagged with training-related tags (hsv2:training,
 * hsv2:training-complete, hsv2:training-overdue) and produces a training
 * completion register at history/registers/training-records/YYYY-MM-DD.csv.
 *
 * CSV format: date, staff_name, module, completion_date, score, status
 *
 * The register feeds the annual training report and provides the MLRO
 * with an up-to-date view of staff AML/CFT training compliance. Retained
 * for the full ten-year period mandated by Federal Decree-Law No. 10 of 2025.
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

const TRAINING_TAGS = [
  "hsv2:training",
  "hsv2:training-complete",
  "hsv2:training-overdue",
];

/* ─── Asana helpers ────────────────────────────────────────────────────── */

async function findTagsByNames(tagNames) {
  const params = new URLSearchParams({
    workspace: env.ASANA_WORKSPACE_ID,
    limit: "100",
    opt_fields: "gid,name",
  });
  const all = [];
  let offset;
  do {
    if (offset) params.set("offset", offset);
    const page = await asanaClient.asana(`/tags?${params}`);
    all.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset);

  const lowerNames = new Set(tagNames.map((n) => n.toLowerCase().trim()));
  return all.filter((t) => lowerNames.has(t.name.toLowerCase().trim()));
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

/* ─── Field extraction from task ───────────────────────────────────────── */

function extractStaffName(task) {
  if (task.assignee?.name) return task.assignee.name;
  // Try notes for "Staff:" or "Name:" line
  const lines = (task.notes ?? "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(?:staff|name|attendee)\s*:\s*(.+)/i);
    if (match) return match[1].trim();
  }
  return "Unknown";
}

function extractModule(task) {
  // Try custom field first
  for (const cf of task.custom_fields ?? []) {
    if (
      cf.name &&
      cf.name.toLowerCase().replace(/[\s_-]+/g, "").includes("module")
    ) {
      if (cf.display_value) return cf.display_value;
    }
  }
  // Try notes for "Module:" line
  const lines = (task.notes ?? "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^module\s*:\s*(.+)/i);
    if (match) return match[1].trim();
  }
  // Fall back to task name
  return task.name ?? "Unknown";
}

function extractCompletionDate(task) {
  if (task.completed && task.completed_at) {
    return task.completed_at.slice(0, 10);
  }
  // Try notes for "Completed:" or "Completion date:" line
  const lines = (task.notes ?? "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(
      /^(?:completed|completion\s*date)\s*:\s*(\d{4}-\d{2}-\d{2})/i,
    );
    if (match) return match[1];
  }
  return "";
}

function extractScore(task) {
  // Try custom field
  for (const cf of task.custom_fields ?? []) {
    if (
      cf.name &&
      cf.name.toLowerCase().replace(/[\s_-]+/g, "").includes("score")
    ) {
      if (cf.display_value) return cf.display_value;
    }
  }
  // Try notes for "Score:" line
  const lines = (task.notes ?? "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^score\s*:\s*(.+)/i);
    if (match) return match[1].trim();
  }
  return "";
}

function extractStatus(task) {
  const tagNames = (task.tags ?? []).map((t) => t.name.toLowerCase().trim());
  if (tagNames.includes("hsv2:training-complete")) return "complete";
  if (tagNames.includes("hsv2:training-overdue")) return "overdue";
  if (task.completed) return "complete";
  return "in-progress";
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
  const header = "date,staff_name,module,completion_date,score,status";
  const lines = rows.map((r) =>
    [
      escCsv(r.date),
      escCsv(r.staff_name),
      escCsv(r.module),
      escCsv(r.completion_date),
      escCsv(r.score),
      escCsv(r.status),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

/* ─── Report for narrative archive ─────────────────────────────────────── */

function buildReport(rows) {
  const complete = rows.filter((r) => r.status === "complete");
  const overdue = rows.filter((r) => r.status === "overdue");
  const inProgress = rows.filter((r) => r.status === "in-progress");

  const summary = [
    `Total training records: ${rows.length}`,
    `Complete: ${complete.length}`,
    `In progress: ${inProgress.length}`,
    `Overdue: ${overdue.length}`,
  ].join("\n");

  const cols = [
    { key: "staff", header: "Staff", max: 30 },
    { key: "module", header: "Module", max: 40 },
    { key: "completionDate", header: "Completed", max: 12 },
    { key: "score", header: "Score", max: 8 },
    { key: "status", header: "Status", max: 12 },
  ];

  function formatRows(bucket) {
    return bucket.map((r) => ({
      staff: (r.staff_name ?? "").slice(0, 30),
      module: (r.module ?? "").slice(0, 40),
      completionDate: r.completion_date ?? "",
      score: r.score ?? "",
      status: r.status ?? "",
    }));
  }

  const body = [
    "SCOPE",
    "",
    "This register records AML/CFT and compliance training activity for all",
    `staff as of ${today}. It draws from Asana tasks tagged with training-related`,
    "tags and captures the module, completion date, score and status for each",
    "record. The register feeds the firm's annual training report.",
    "",
    "SUMMARY",
    "",
    summary,
    "",
    "OVERDUE TRAINING",
    "",
    overdue.length === 0
      ? "(none)"
      : renderTable(formatRows(overdue), cols),
    "",
    "IN-PROGRESS TRAINING",
    "",
    inProgress.length === 0
      ? "(none)"
      : renderTable(formatRows(inProgress), cols),
    "",
    "COMPLETED TRAINING",
    "",
    complete.length === 0
      ? "(none)"
      : renderTable(formatRows(complete.slice(0, 50)), cols),
    "",
    "NEXT ACTIONS",
    "",
    overdue.length > 0
      ? "Every overdue training module must be completed or rescheduled within five business days. The MLRO should escalate persistent non-completion to the Board."
      : "No overdue training records.",
    "Retain this register for the full ten-year retention period.",
  ].join("\n");

  return wrapDocument({
    title: "Training Completion Register",
    reference: `HSV2-TRN-${today}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Training records as of ${today}`,
    preparedOn: today,
    body,
  });
}

/* ─── Main ─────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`▶ Training record tracker ${today}`);

  const tags = await findTagsByNames(TRAINING_TAGS);
  if (tags.length === 0) {
    console.log(
      `   no training tags (${TRAINING_TAGS.join(", ")}) found in workspace — nothing to record`,
    );
    return;
  }
  console.log(`   matched ${tags.length} training tag(s)`);

  // Collect tasks from all matching tags, dedup by gid
  const seen = new Set();
  const tasks = [];
  for (const tag of tags) {
    const batch = await fetchTasksForTag(tag.gid);
    for (const t of batch) {
      if (!seen.has(t.gid)) {
        seen.add(t.gid);
        tasks.push(t);
      }
    }
  }
  console.log(`   unique tasks: ${tasks.length}`);

  const rows = tasks.map((t) => ({
    date: today,
    staff_name: extractStaffName(t),
    module: extractModule(t),
    completion_date: extractCompletionDate(t),
    score: extractScore(t),
    status: extractStatus(t),
  }));

  const csv = buildCsv(rows);
  await tryArchive(
    () =>
      writeHistory(
        path.join("registers", "training-records", `${today}.csv`),
        csv,
      ),
    `training-records ${today} (csv)`,
  );

  const report = buildReport(rows);
  await tryArchive(
    () =>
      writeHistory(
        path.join("registers", "training-records", `${today}.txt`),
        report,
      ),
    `training-records ${today} (txt + docx)`,
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
      `HSV2 / Training Completion Register / ${today}`,
      "",
      `Total records: ${rows.length}`,
      `Complete: ${rows.filter((r) => r.status === "complete").length}`,
      `In progress: ${rows.filter((r) => r.status === "in-progress").length}`,
      `Overdue: ${rows.filter((r) => r.status === "overdue").length}`,
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
