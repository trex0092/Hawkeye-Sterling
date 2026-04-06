/**
 * HTML compliance dashboard generator.
 *
 * Reads the latest artefacts from history/ and produces a single-page
 * HTML dashboard at docs/index.html that shows traffic-light status
 * across all six entities and every control cadence. Designed to be
 * served from GitHub Pages at zero cost.
 *
 * Deterministic. No Claude calls. No Asana posting.
 */

import { readdir, readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isoDate } from "./history-writer.mjs";
import { CONFIRMED_REFERENCES } from "./regulatory-context.mjs";

const today = isoDate();
const HISTORY_ROOT = path.resolve(process.cwd(), "..", "history");
const DOCS_ROOT = path.resolve(process.cwd(), "..", "docs");

async function latestFileInDir(dir) {
  try {
    const files = await readdir(dir);
    const sorted = files.filter((f) => !f.startsWith(".")).sort();
    return sorted.length > 0 ? sorted[sorted.length - 1] : null;
  } catch { return null; }
}

async function countFilesInDir(dir) {
  try {
    const files = await readdir(dir);
    return files.filter((f) => !f.startsWith(".")).length;
  } catch { return 0; }
}

async function gatherStatus() {
  const status = {};

  // Daily
  const dailyDir = path.join(HISTORY_ROOT, "daily");
  status.dailyLatest = await latestFileInDir(dailyDir);
  status.dailyCount = await countFilesInDir(dailyDir);

  // Weekly
  const weeklyDir = path.join(HISTORY_ROOT, "weekly");
  status.weeklyLatest = await latestFileInDir(weeklyDir);
  status.weeklyCount = await countFilesInDir(weeklyDir);

  // Monthly MLRO
  const mlroMonthlyDir = path.join(HISTORY_ROOT, "mlro-monthly");
  status.mlroMonthlyLatest = await latestFileInDir(mlroMonthlyDir);

  // Retro
  const retroDir = path.join(HISTORY_ROOT, "retro");
  status.retroLatest = await latestFileInDir(retroDir);

  // Sanctions screening
  const sanctionsDir = path.join(HISTORY_ROOT, "registers", "sanctions-screening");
  status.sanctionsLatest = await latestFileInDir(sanctionsDir);

  // PEP screening
  const pepDir = path.join(HISTORY_ROOT, "registers", "pep-screening");
  status.pepLatest = await latestFileInDir(pepDir);

  // Adverse media
  const advDir = path.join(HISTORY_ROOT, "registers", "adverse-media");
  status.adverseLatest = await latestFileInDir(advDir);

  // CDD refresh
  const cddDir = path.join(HISTORY_ROOT, "registers", "cdd-refresh");
  status.cddLatest = await latestFileInDir(cddDir);

  // Deadlines
  const deadlineDir = path.join(HISTORY_ROOT, "registers", "deadlines");
  status.deadlineLatest = await latestFileInDir(deadlineDir);

  // Regulatory watcher
  const regDir = path.join(HISTORY_ROOT, "registers", "regulatory-updates");
  status.regulatoryLatest = await latestFileInDir(regDir);

  // Hash manifest
  const hashDir = path.join(HISTORY_ROOT, "registers", "hash-manifest");
  status.hashLatest = await latestFileInDir(hashDir);

  // Task packs
  const taskPackDir = path.join(HISTORY_ROOT, "task-packs");
  status.taskPackLatest = await latestFileInDir(taskPackDir);

  // Filings
  const filingsDir = path.join(HISTORY_ROOT, "filings");
  status.filingsLatest = await latestFileInDir(filingsDir);
  status.filingsCount = await countFilesInDir(filingsDir);

  // Entity reports
  const entityDir = path.join(HISTORY_ROOT, "daily", today, "entity-reports");
  status.entityReportCount = await countFilesInDir(entityDir);

  // Quality scores
  const qDir = path.join(HISTORY_ROOT, "registers", "quality-scores");
  status.qualityLatest = await latestFileInDir(qDir);

  // Annual
  const annualDir = path.join(HISTORY_ROOT, "annual");
  status.annualLatest = await latestFileInDir(annualDir);

  return status;
}

function light(latest, maxAgeDays) {
  if (!latest) return "grey";
  const dateMatch = latest.match(/(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return "grey";
  const days = Math.round((Date.parse(today) - Date.parse(dateMatch[1])) / 86400000);
  if (days <= maxAgeDays) return "green";
  if (days <= maxAgeDays * 2) return "amber";
  return "red";
}

function buildHtml(status) {
  const entityCodes = CONFIRMED_REFERENCES.entityCodes ?? [];
  const mlro = CONFIRMED_REFERENCES.mlro.name;

  const rows = [
    { control: "Daily Priorities", latest: status.dailyLatest, maxAge: 1 },
    { control: "Daily Entity Reports", latest: status.entityReportCount > 0 ? today : null, maxAge: 1 },
    { control: "Daily Retro", latest: status.retroLatest, maxAge: 1 },
    { control: "Sanctions Screening", latest: status.sanctionsLatest, maxAge: 1 },
    { control: "PEP Screening", latest: status.pepLatest, maxAge: 7 },
    { control: "Adverse Media Sweep", latest: status.adverseLatest, maxAge: 7 },
    { control: "Regulatory Watcher", latest: status.regulatoryLatest, maxAge: 1 },
    { control: "Deadline Calendar", latest: status.deadlineLatest, maxAge: 1 },
    { control: "CDD Refresh Tracker", latest: status.cddLatest, maxAge: 7 },
    { control: "Weekly Pattern Report", latest: status.weeklyLatest, maxAge: 7 },
    { control: "Task Compliance Packs", latest: status.taskPackLatest, maxAge: 7 },
    { control: "Filing Quality Score", latest: status.qualityLatest, maxAge: 7 },
    { control: "Hash Manifest", latest: status.hashLatest, maxAge: 7 },
    { control: "Monthly MLRO Report", latest: status.mlroMonthlyLatest, maxAge: 35 },
    { control: "Annual Reports", latest: status.annualLatest, maxAge: 400 },
  ];

  const tableRows = rows.map((r) => {
    const color = light(r.latest, r.maxAge);
    const dot = color === "green" ? "&#x1F7E2;" : color === "amber" ? "&#x1F7E1;" : color === "red" ? "&#x1F534;" : "&#x26AA;";
    return `<tr><td>${dot}</td><td>${r.control}</td><td>${r.latest ?? "(none)"}</td></tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Compliance Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; }
  h1 { font-size: 1.4em; margin-bottom: 4px; color: #58a6ff; }
  .meta { color: #8b949e; font-size: 0.85em; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #30363d; color: #8b949e; font-size: 0.8em; text-transform: uppercase; }
  td { padding: 8px 12px; border-bottom: 1px solid #21262d; font-size: 0.9em; }
  tr:hover { background: #161b22; }
  .entities { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .entity-badge { background: #21262d; border: 1px solid #30363d; border-radius: 6px; padding: 8px 16px; font-weight: 600; color: #58a6ff; }
  .footer { color: #484f58; font-size: 0.75em; margin-top: 24px; border-top: 1px solid #21262d; padding-top: 12px; }
</style>
</head>
<body>
<h1>Compliance Automation Dashboard</h1>
<p class="meta">Generated ${today} | MLRO: ${mlro} | Entities: ${entityCodes.length}</p>

<div class="entities">
${entityCodes.map((c) => `  <div class="entity-badge">${c}</div>`).join("\n")}
</div>

<table>
<thead>
<tr><th></th><th>Control</th><th>Latest artefact</th></tr>
</thead>
<tbody>
${tableRows}
</tbody>
</table>

<p class="meta">
  Daily archive folders: ${status.dailyCount} |
  Weekly archive files: ${status.weeklyCount} |
  Filing drafts: ${status.filingsCount}
</p>

<div class="footer">
  Auto-generated by Hawkeye-Sterling compliance automation.
  Federal Decree-Law No. 10 of 2025. Ten-year retention.
  This page refreshes on every workflow run.
</div>
</body>
</html>`;
}

async function main() {
  console.log(`▶ Dashboard generation ${today}`);

  const status = await gatherStatus();
  const html = buildHtml(status);

  await mkdir(DOCS_ROOT, { recursive: true });
  await writeFile(path.join(DOCS_ROOT, "index.html"), html, "utf8");
  console.log(`   wrote docs/index.html`);
}

main().catch((err) => { console.error("fatal:", err); process.exit(1); });
