/**
 * Historical Trend Export — on demand.
 *
 * Walks history/daily/*/portfolio-digest.txt, history/retro/*.txt,
 * history/weekly/*.txt, history/weekly-filings/*.txt and
 * history/filings/YYYY-MM-DD/ and produces a single CSV snapshot of
 * the firm's compliance automation activity over a configurable
 * window (default: full history).
 *
 * The CSV is intended as an input for external charting tools (Excel,
 * Google Sheets, Looker Studio, etc.) so the MLRO can visualise
 * trends without needing to extract data manually.
 *
 * The utility does not call Claude. It is pure aggregation from the
 * filesystem. Written to
 * history/on-demand/trend-export-YYYY-MM-DD.csv.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { writeHistory, isoDate } from "./history-writer.mjs";
import { CONFIRMED_REFERENCES } from "./regulatory-context.mjs";
import { notify } from "./notify.mjs";

const {
  WINDOW_DAYS = "", // empty string means full history
  DRY_RUN = "false",
} = process.env;

const isDryRun = DRY_RUN === "true";

const HISTORY_ROOT = path.resolve(process.cwd(), "..", "history");

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function windowStart() {
  if (!WINDOW_DAYS) return null; // full history
  const days = Number.parseInt(WINDOW_DAYS, 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function inWindow(dateStr, start) {
  if (!start) return true;
  return dateStr >= start;
}

async function listFilesSorted(dir) {
  try {
    const files = await readdir(dir);
    return files.sort();
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`read error ${dir}: ${err.message}`);
    return [];
  }
}

async function safeRead(file) {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function countOccurrences(haystack, needle) {
  if (!haystack || !needle) return 0;
  const lower = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = lower.indexOf(n, idx)) !== -1) {
    count++;
    idx += n.length;
  }
  return count;
}

/* ─── Aggregators ───────────────────────────────────────────────────────── */

async function aggregateDaily(start) {
  const rows = [];
  const dailyDir = path.join(HISTORY_ROOT, "daily");
  const days = await listFilesSorted(dailyDir);
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!inWindow(day, start)) continue;
    const portfolioText = await safeRead(path.join(dailyDir, day, "portfolio-digest.txt"));
    const retroText = await safeRead(path.join(HISTORY_ROOT, "retro", `${day}.txt`));
    const perProjectDir = path.join(dailyDir, day, "per-project");
    const perProjectFiles = await listFilesSorted(perProjectDir);

    rows.push({
      date: day,
      type: "daily",
      projects_reported: perProjectFiles.length,
      portfolio_digest_size_bytes: portfolioText.length,
      retro_size_bytes: retroText.length,
      portfolio_has_sanctions_signal: /sanction/i.test(portfolioText) ? 1 : 0,
      portfolio_has_dpmsr_signal: /dpmsr|dealers in precious metals/i.test(portfolioText) ? 1 : 0,
      portfolio_has_pep_signal: /pep|politically exposed/i.test(portfolioText) ? 1 : 0,
      retro_completed_count: extractNumberAfter(retroText, "tasks completed") ?? "",
      retro_touched_count: extractNumberAfter(retroText, "tasks touched") ?? "",
    });
  }
  return rows;
}

function extractNumberAfter(text, phrase) {
  if (!text || !phrase) return null;
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return null;
  const tail = text.slice(idx, idx + 300);
  const m = tail.match(/(\d[\d,]*)/);
  if (!m) return null;
  return Number.parseInt(m[1].replace(/,/g, ""), 10);
}

async function aggregateFilings(start) {
  const rows = [];
  const filingsDir = path.join(HISTORY_ROOT, "filings");
  const days = await listFilesSorted(filingsDir);
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!inWindow(day, start)) continue;
    const files = await listFilesSorted(path.join(filingsDir, day));
    const counts = { STR: 0, SAR: 0, DPMSR: 0, PNMR: 0, FFR: 0 };
    for (const file of files) {
      const m = file.match(/^HSV2-(STR|SAR|DPMSR|PNMR|FFR)-/);
      if (m) counts[m[1]]++;
    }
    rows.push({
      date: day,
      type: "filings",
      str_drafts: counts.STR,
      sar_drafts: counts.SAR,
      dpmsr_drafts: counts.DPMSR,
      pnmr_drafts: counts.PNMR,
      ffr_drafts: counts.FFR,
      total_drafts: Object.values(counts).reduce((a, b) => a + b, 0),
    });
  }
  return rows;
}

async function aggregateWeekly(start) {
  const rows = [];
  const weeklyDir = path.join(HISTORY_ROOT, "weekly");
  const files = await listFilesSorted(weeklyDir);
  for (const file of files) {
    const m = file.match(/^(\d{4}-W\d{2})\.txt$/);
    if (!m) continue;
    const weekId = m[1];
    const content = await safeRead(path.join(weeklyDir, file));
    rows.push({
      date: weekId,
      type: "weekly",
      weekly_pattern_size_bytes: content.length,
      mentions_sanctions: countOccurrences(content, "sanction"),
      mentions_pep: countOccurrences(content, "PEP"),
      mentions_cross_border: countOccurrences(content, "cross-border") + countOccurrences(content, "cross border"),
      mentions_stalled: countOccurrences(content, "stalled"),
    });
  }
  return rows;
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const today = isoDate();
  const start = windowStart();
  console.log(`▶  Historical Trend Export — ${new Date().toISOString()}`);
  console.log(`   window: ${start ? `${start} to ${today}` : "full history"}`);
  if (isDryRun) console.log("   DRY RUN");

  const [dailyRows, filingRows, weeklyRows] = await Promise.all([
    aggregateDaily(start),
    aggregateFilings(start),
    aggregateWeekly(start),
  ]);

  console.log(
    `\nAggregated: ${dailyRows.length} daily rows, ${filingRows.length} filing-day rows, ${weeklyRows.length} weekly rows`,
  );

  // Three distinct CSV tables concatenated into one file, each with its
  // own header row, separated by a blank line. This is the most
  // spreadsheet-friendly shape for a compliance reviewer.
  const dailyHeader = [
    "date",
    "type",
    "projects_reported",
    "portfolio_digest_size_bytes",
    "retro_size_bytes",
    "portfolio_has_sanctions_signal",
    "portfolio_has_dpmsr_signal",
    "portfolio_has_pep_signal",
    "retro_completed_count",
    "retro_touched_count",
  ];
  const filingHeader = [
    "date",
    "type",
    "str_drafts",
    "sar_drafts",
    "dpmsr_drafts",
    "pnmr_drafts",
    "ffr_drafts",
    "total_drafts",
  ];
  const weeklyHeader = [
    "date",
    "type",
    "weekly_pattern_size_bytes",
    "mentions_sanctions",
    "mentions_pep",
    "mentions_cross_border",
    "mentions_stalled",
  ];

  const dailyCsv = [dailyHeader.join(",")]
    .concat(dailyRows.map((r) => dailyHeader.map((h) => csvEscape(r[h])).join(",")))
    .join("\n");
  const filingCsv = [filingHeader.join(",")]
    .concat(filingRows.map((r) => filingHeader.map((h) => csvEscape(r[h])).join(",")))
    .join("\n");
  const weeklyCsv = [weeklyHeader.join(",")]
    .concat(weeklyRows.map((r) => weeklyHeader.map((h) => csvEscape(r[h])).join(",")))
    .join("\n");

  const preamble = [
    `# [Reporting Entity] — Historical Trend Export`,
    `# Generated: ${today}`,
    `# Window: ${start ? `${start} to ${today}` : "full history"}`,
    `# Retention period: ${CONFIRMED_REFERENCES.recordRetention.years} years under Federal Decree-Law No. 10 of 2025`,
    `# Prepared for the attention of the MLRO, ${CONFIRMED_REFERENCES.mlro.name}`,
    "",
    "## DAILY TABLE",
  ].join("\n");

  const body = `${preamble}\n${dailyCsv}\n\n## FILING TABLE\n${filingCsv}\n\n## WEEKLY TABLE\n${weeklyCsv}\n`;

  const archivePath = path.join("on-demand", `trend-export-${today}.csv`);
  if (isDryRun) {
    console.log(`\n[dry-run] would write ${body.length} bytes to history/${archivePath}`);
  } else {
    await writeHistory(archivePath, body);
    console.log(`\n✓ written to history/${archivePath}`);
  }

  if (!isDryRun) {
    await notify({
      subject: `HSV2 / Historical Trend Export — ${today}`,
      body: `Trend export generated on ${today}.\n\nDaily rows: ${dailyRows.length}\nFiling rows: ${filingRows.length}\nWeekly rows: ${weeklyRows.length}\n\nFile committed to history/${archivePath}.`,
    });
  }

  console.log(`\n=== Summary ===`);
  console.log(`Rows: ${dailyRows.length + filingRows.length + weeklyRows.length}`);
  console.log(`File: history/${archivePath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
