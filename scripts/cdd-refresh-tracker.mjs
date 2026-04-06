/**
 * Customer Due Diligence refresh tracker.
 *
 * Reads the counterparty register at history/registers/counterparties.csv
 * and flags records whose Customer Due Diligence (CDD) refresh window
 * is approaching or has lapsed, based on the recorded risk rating.
 *
 * Refresh windows used (standard practice for UAE DNFBPs):
 *   high   risk : 12 months
 *   medium risk : 24 months
 *   low    risk : 36 months
 *
 * The expected CSV columns are inherited from counterparty-register.mjs,
 * with two optional extension columns the MLRO may add by hand:
 *   last_cdd_date        YYYY-MM-DD when CDD was last performed or refreshed
 *   next_cdd_due         YYYY-MM-DD override (takes precedence over risk rating)
 *
 * Rows missing both fields are reported as "no cdd date on file" so the
 * MLRO can fill in the baseline.
 *
 * Deterministic. No Claude calls.
 */

import path from "node:path";
import {
  readCommonEnv,
  createAsanaClient,
  wrapDocument,
  readCounterpartyRegister,
  renderTable,
  CONFIRMED_REFERENCES,
  tryArchive,
} from "./lib/report-scaffold.mjs";
import { writeHistory, isoDate } from "./history-writer.mjs";
import { renderDocxBuffer } from "./lib/docx-writer.mjs";

const env = readCommonEnv({ requireClaude: false });
const today = isoDate();
const asanaClient = createAsanaClient(env);

const REFRESH_MONTHS = { high: 12, medium: 24, low: 36 };

function addMonths(isoDateStr, months) {
  const d = new Date(isoDateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const ms = Date.parse(b) - Date.parse(a);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / (24 * 3600 * 1000));
}

function classifyRow(row) {
  const risk = String(row.risk_rating ?? "").toLowerCase();
  const lastCdd = row.last_cdd_date ?? "";
  const override = row.next_cdd_due ?? "";

  let dueDate = null;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
    dueDate = override;
  } else if (lastCdd && /^\d{4}-\d{2}-\d{2}$/.test(lastCdd)) {
    const months = REFRESH_MONTHS[risk] ?? REFRESH_MONTHS.medium;
    dueDate = addMonths(lastCdd, months);
  }

  if (!dueDate) return { status: "missing", dueDate: null, daysRemaining: null };

  const days = daysBetween(today, dueDate);
  if (days === null) return { status: "missing", dueDate: null, daysRemaining: null };
  if (days < 0) return { status: "overdue", dueDate, daysRemaining: days };
  if (days <= 7) return { status: "critical", dueDate, daysRemaining: days };
  if (days <= 30) return { status: "warning", dueDate, daysRemaining: days };
  return { status: "ok", dueDate, daysRemaining: days };
}

function buildReport(classified) {
  const overdue = classified.filter((c) => c.status === "overdue");
  const critical = classified.filter((c) => c.status === "critical");
  const warning = classified.filter((c) => c.status === "warning");
  const missing = classified.filter((c) => c.status === "missing");

  const summary = renderTable(
    [
      { bucket: "Overdue", count: String(overdue.length) },
      { bucket: "Critical (0 to 7 days)", count: String(critical.length) },
      { bucket: "Warning (8 to 30 days)", count: String(warning.length) },
      { bucket: "Missing baseline CDD date", count: String(missing.length) },
      { bucket: "Total counterparties", count: String(classified.length) },
    ],
    [
      { key: "bucket", header: "Bucket", max: 35 },
      { key: "count", header: "Count", max: 8 },
    ],
  );

  function rowsForBucket(bucket) {
    return bucket.slice(0, 25).map((c) => ({
      counterparty: (c.row.counterparty_name ?? "").slice(0, 40),
      risk: c.row.risk_rating ?? "",
      lastCdd: c.row.last_cdd_date ?? "",
      dueDate: c.dueDate ?? "",
      daysRemaining: c.daysRemaining === null ? "" : String(c.daysRemaining),
    }));
  }

  const cols = [
    { key: "counterparty", header: "Counterparty", max: 40 },
    { key: "risk", header: "Risk", max: 8 },
    { key: "lastCdd", header: "Last CDD", max: 12 },
    { key: "dueDate", header: "Due by", max: 12 },
    { key: "daysRemaining", header: "Days", max: 6 },
  ];

  const body = [
    "SCOPE",
    "",
    "We reviewed the counterparty register today to identify Customer Due Diligence",
    "records that are due for refresh. The refresh window applied per record is",
    "twelve months for high-risk, twenty-four months for medium-risk and thirty-six",
    "months for low-risk, unless the record carries an explicit next_cdd_due override.",
    "",
    "SUMMARY",
    "",
    summary,
    "",
    "OVERDUE (CDD already lapsed)",
    "",
    overdue.length === 0 ? "(none)" : renderTable(rowsForBucket(overdue), cols),
    "",
    "CRITICAL (due within seven days)",
    "",
    critical.length === 0 ? "(none)" : renderTable(rowsForBucket(critical), cols),
    "",
    "WARNING (due within thirty days)",
    "",
    warning.length === 0 ? "(none)" : renderTable(rowsForBucket(warning), cols),
    "",
    "RECORDS WITHOUT A BASELINE CDD DATE",
    "",
    missing.length === 0
      ? "(none)"
      : renderTable(
          missing.slice(0, 25).map((c) => ({
            counterparty: (c.row.counterparty_name ?? "").slice(0, 40),
            risk: c.row.risk_rating ?? "",
            lastCdd: "(missing)",
            dueDate: "(unknown)",
            daysRemaining: "",
          })),
          cols,
        ),
    "",
    "NEXT ACTIONS",
    "",
    overdue.length > 0
      ? "Every overdue record must be actioned within two business days. Contact the relationship owner, obtain refreshed documentation, and update the last_cdd_date column in the counterparty register."
      : "No record is currently overdue.",
    "Every record in the critical and warning buckets must be scheduled for a refresh interview or desk review before its due date.",
    "For any record without a baseline CDD date, perform a file review and populate the last_cdd_date column before the next working day ends.",
    "Retain all refreshed CDD documentation for the full ten-year retention period.",
  ].join("\n");

  return wrapDocument({
    title: "CDD Refresh Tracker",
    reference: `HSV2-CDD-${today}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Register as of ${today}`,
    preparedOn: today,
    body,
  });
}

async function main() {
  console.log(`▶ CDD refresh tracker ${today}`);

  const counterparties = await readCounterpartyRegister();
  console.log(`   register rows: ${counterparties.length}`);

  const classified = counterparties.map((row) => ({ row, ...classifyRow(row) }));
  const report = buildReport(classified);

  await tryArchive(
    () => writeHistory(path.join("registers", "cdd-refresh", `${today}.md`), report),
    `cdd-refresh ${today} (md + docx)`,
  );

  const overdueCount = classified.filter((c) => c.status === "overdue").length;
  const criticalCount = classified.filter((c) => c.status === "critical").length;

  if (env.DRY_RUN) {
    console.log(`(dry) overdue=${overdueCount} critical=${criticalCount}`);
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
    await asanaClient.attachFile(target.taskGid, mdBuf, `cdd-refresh-${today}.md`, "text/markdown");
    await asanaClient.attachFile(target.taskGid, docxBuf, `cdd-refresh-${today}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const headline = [
      `HSV2 / CDD Refresh Tracker / ${today}`,
      "",
      `Total counterparties: ${classified.length}`,
      `Overdue: ${overdueCount}`,
      `Critical (0-7 days): ${criticalCount}`,
      `Warning (8-30 days): ${classified.filter((c) => c.status === "warning").length}`,
      `Missing baseline: ${classified.filter((c) => c.status === "missing").length}`,
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
