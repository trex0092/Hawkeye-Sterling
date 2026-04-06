/**
 * Deadline calendar.
 *
 * Reads scripts/deadlines.json and produces a daily calendar view of
 * every upcoming compliance deadline. Items within 30 days are marked
 * warning, items within 7 days critical, items past their due date
 * overdue. Recurrence is read but not expanded: each item carries the
 * next concrete due date, maintained by the MLRO in the JSON file.
 *
 * The report is archived and attached to the pinned task of the
 * portfolio project with a headline comment.
 *
 * Deterministic. No Claude calls.
 */

import { readFile } from "node:fs/promises";
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
import { renderDocxBuffer } from "./lib/docx-writer.mjs";

const env = readCommonEnv({ requireClaude: false });
const today = isoDate();
const asanaClient = createAsanaClient(env);

async function readDeadlines() {
  const text = await readFile(path.resolve(process.cwd(), "deadlines.json"), "utf8");
  const parsed = JSON.parse(text);
  return parsed.deadlines ?? [];
}

function daysUntil(dueDate) {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const ms = Date.parse(dueDate) - Date.parse(today);
  return Math.round(ms / (24 * 3600 * 1000));
}

function classify(days) {
  if (days === null) return "unscheduled";
  if (days < 0) return "overdue";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  if (days <= 90) return "approaching";
  return "ok";
}

function buildReport(items) {
  const enriched = items
    .map((item) => {
      const days = daysUntil(item.due);
      return { ...item, daysRemaining: days, state: classify(days) };
    })
    .sort((a, b) => {
      if (a.daysRemaining === null) return 1;
      if (b.daysRemaining === null) return -1;
      return a.daysRemaining - b.daysRemaining;
    });

  const counts = {
    overdue: enriched.filter((e) => e.state === "overdue").length,
    critical: enriched.filter((e) => e.state === "critical").length,
    warning: enriched.filter((e) => e.state === "warning").length,
    approaching: enriched.filter((e) => e.state === "approaching").length,
    unscheduled: enriched.filter((e) => e.state === "unscheduled").length,
  };

  const summary = renderTable(
    [
      { bucket: "Overdue", count: String(counts.overdue) },
      { bucket: "Critical (0 to 7 days)", count: String(counts.critical) },
      { bucket: "Warning (8 to 30 days)", count: String(counts.warning) },
      { bucket: "Approaching (31 to 90 days)", count: String(counts.approaching) },
      { bucket: "Unscheduled (no date on file)", count: String(counts.unscheduled) },
      { bucket: "Total tracked deadlines", count: String(enriched.length) },
    ],
    [
      { key: "bucket", header: "Bucket", max: 35 },
      { key: "count", header: "Count", max: 8 },
    ],
  );

  const cols = [
    { key: "title", header: "Deadline", max: 55 },
    { key: "category", header: "Category", max: 22 },
    { key: "due", header: "Due date", max: 12 },
    { key: "daysRemaining", header: "Days", max: 8 },
    { key: "owner", header: "Owner", max: 20 },
  ];

  const overdueRows = enriched.filter((e) => e.state === "overdue").map((e) => ({
    ...e,
    daysRemaining: String(e.daysRemaining ?? ""),
  }));
  const criticalRows = enriched.filter((e) => e.state === "critical").map((e) => ({
    ...e,
    daysRemaining: String(e.daysRemaining ?? ""),
  }));
  const warningRows = enriched.filter((e) => e.state === "warning").map((e) => ({
    ...e,
    daysRemaining: String(e.daysRemaining ?? ""),
  }));
  const approachingRows = enriched.filter((e) => e.state === "approaching").map((e) => ({
    ...e,
    daysRemaining: String(e.daysRemaining ?? ""),
  }));
  const unscheduledRows = enriched.filter((e) => e.state === "unscheduled").map((e) => ({
    ...e,
    daysRemaining: "",
  }));

  const body = [
    "SCOPE",
    "",
    "We reviewed the compliance deadline calendar today. The calendar is maintained",
    "in scripts/deadlines.json and covers annual regulatory submissions, internal",
    "control refresh dates and any MLRO-specific commitments that require a fixed",
    "delivery date.",
    "",
    "SUMMARY",
    "",
    summary,
    "",
    "OVERDUE",
    "",
    overdueRows.length === 0 ? "(none)" : renderTable(overdueRows, cols),
    "",
    "CRITICAL (due within seven days)",
    "",
    criticalRows.length === 0 ? "(none)" : renderTable(criticalRows, cols),
    "",
    "WARNING (due within thirty days)",
    "",
    warningRows.length === 0 ? "(none)" : renderTable(warningRows, cols),
    "",
    "APPROACHING (due within ninety days)",
    "",
    approachingRows.length === 0 ? "(none)" : renderTable(approachingRows, cols),
    "",
    "UNSCHEDULED (no date on file)",
    "",
    unscheduledRows.length === 0 ? "(none)" : renderTable(unscheduledRows, cols),
    "",
    "NEXT ACTIONS",
    "",
    counts.overdue > 0
      ? "Every overdue deadline must be closed or re-baselined today. Document the reason and the new date."
      : "No deadline is currently overdue.",
    "Every critical deadline must have a named owner working on it today.",
    "Every warning deadline must have a plan of action with at least one completed step.",
    "For every unscheduled deadline, obtain the governing date from the relevant authority or internal policy and populate the due field in deadlines.json.",
  ].join("\n");

  return wrapDocument({
    title: "Compliance Deadline Calendar",
    reference: `HSV2-CAL-${today}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Calendar view as of ${today}`,
    preparedOn: today,
    body,
  });
}

async function main() {
  console.log(`▶ Deadline calendar ${today}`);

  const deadlines = await readDeadlines();
  console.log(`   tracked deadlines: ${deadlines.length}`);

  const report = buildReport(deadlines);
  await tryArchive(
    () => writeHistory(path.join("registers", "deadlines", `${today}.md`), report),
    `deadlines ${today} (md + docx)`,
  );

  if (env.DRY_RUN) {
    console.log("(dry) skipping Asana posting");
    return;
  }

  try {
    const projects = await asanaClient.listProjects();
    const target = await asanaClient.findPortfolioPinned(projects);
    if (!target) {
      console.log(`   no pinned task in "${env.PORTFOLIO_PROJECT_NAME}" project — skipping Asana post`);
      return;
    }
    const docxBuf = renderDocxBuffer(report);
    const mdBuf = Buffer.from(report, "utf8");
    await asanaClient.attachFile(target.taskGid, mdBuf, `deadline-calendar-${today}.md`, "text/markdown");
    await asanaClient.attachFile(target.taskGid, docxBuf, `deadline-calendar-${today}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    const overdue = deadlines.filter((d) => {
      const days = daysUntil(d.due);
      return days !== null && days < 0;
    }).length;
    const critical = deadlines.filter((d) => {
      const days = daysUntil(d.due);
      return days !== null && days >= 0 && days <= 7;
    }).length;
    const warning = deadlines.filter((d) => {
      const days = daysUntil(d.due);
      return days !== null && days > 7 && days <= 30;
    }).length;

    const headline = [
      `HSV2 / Compliance Deadline Calendar / ${today}`,
      "",
      `Tracked deadlines: ${deadlines.length}`,
      `Overdue: ${overdue}`,
      `Critical (0-7 days): ${critical}`,
      `Warning (8-30 days): ${warning}`,
      "",
      `For review by the MLRO, ${CONFIRMED_REFERENCES.mlro.name}.`,
    ].join("\n");
    await asanaClient.postComment(target.taskGid, headline);
    console.log(`   📎 attached + comment posted on ${target.projectName}`);
  } catch (err) {
    console.warn(`   Asana post failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
