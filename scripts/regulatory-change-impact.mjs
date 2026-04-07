/**
 * Regulatory Change Impact Assessment.
 *
 * Reads the output of the regulatory-watcher (the daily change report
 * at history/registers/regulatory-updates/) and, when changes or new
 * sources are detected, produces a formal impact assessment report
 * archived at history/registers/regulatory-impact/YYYY-MM-DD.txt.
 *
 * The impact assessment evaluates each detected change against the
 * firm's existing controls, procedures and training materials and
 * classifies the impact as high, medium, low or informational. This
 * provides the MLRO with a structured basis for deciding whether
 * controls need updating.
 *
 * Deterministic. No Claude calls.
 */

import { readFile, readdir } from "node:fs/promises";
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

/* ─── Environment guards ───────────────────────────────────────────────── */

const env = readCommonEnv({ requireClaude: false });
const today = isoDate();
const asanaClient = createAsanaClient(env);

const UPDATES_DIR = path.resolve(
  process.cwd(),
  "..",
  "history",
  "registers",
  "regulatory-updates",
);

/* ─── Regulatory-watcher output parser ─────────────────────────────────── */

/**
 * Parse the most recent regulatory-watcher report to extract changed
 * and new sources. Returns an array of { source, authority, status, url }.
 */
async function parseLatestWatcherReport() {
  let reportPath;

  // Try today's report first, then scan for the most recent one
  const candidates = [`${today}.md`, `${today}.txt`];
  for (const fname of candidates) {
    try {
      await readFile(path.join(UPDATES_DIR, fname), "utf8");
      reportPath = path.join(UPDATES_DIR, fname);
      break;
    } catch {
      // not found, continue
    }
  }

  if (!reportPath) {
    // Find the most recent report
    try {
      const files = await readdir(UPDATES_DIR);
      const sorted = files
        .filter((f) => f.endsWith(".md") || f.endsWith(".txt"))
        .sort();
      if (sorted.length > 0) {
        reportPath = path.join(UPDATES_DIR, sorted[sorted.length - 1]);
      }
    } catch (err) {
      if (err.code !== "ENOENT") console.warn(`readdir: ${err.message}`);
      return { changes: [], reportDate: today, reportFile: null };
    }
  }

  if (!reportPath) {
    return { changes: [], reportDate: today, reportFile: null };
  }

  const text = await readFile(reportPath, "utf8");
  const reportDate = path.basename(reportPath).replace(/\.(md|txt)$/, "");

  // Extract lines from the "CHANGED OR NEW SOURCES" section
  const changes = [];
  const lines = text.split(/\r?\n/);
  let inChangedSection = false;
  let inUnchangedSection = false;

  for (const line of lines) {
    if (/^CHANGED OR NEW SOURCES/i.test(line)) {
      inChangedSection = true;
      inUnchangedSection = false;
      continue;
    }
    if (/^UNCHANGED SOURCES/i.test(line) || /^FETCH ERRORS/i.test(line) || /^NEXT ACTIONS/i.test(line)) {
      inChangedSection = false;
      inUnchangedSection = true;
      continue;
    }
    if (!inChangedSection) continue;

    // Skip header rows, separator lines and empty lines
    if (!line.trim() || /^-+/.test(line.trim())) continue;
    if (/^Source\s/i.test(line.trim())) continue;
    if (/no change detected/i.test(line)) continue;

    // Parse the fixed-width table row
    const parts = line.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      changes.push({
        source: parts[0] ?? "",
        authority: parts[1] ?? "",
        status: parts[2] ?? "changed",
        url: parts[3] ?? "",
      });
    }
  }

  return { changes, reportDate, reportFile: reportPath };
}

/* ─── Impact classification ────────────────────────────────────────────── */

/**
 * Classify the potential impact of a detected regulatory change based on
 * the authority and source name. This is a heuristic classification; the
 * MLRO must review and may override.
 */
function classifyImpact(change) {
  const combined = `${change.source} ${change.authority} ${change.url}`.toLowerCase();

  // High impact: primary AML/CFT authorities and sanctions lists
  if (
    combined.includes("eocn") ||
    combined.includes("executive office") ||
    combined.includes("unsc") ||
    combined.includes("sanctions") ||
    combined.includes("designated person") ||
    combined.includes("fatf") ||
    combined.includes("mutual evaluation") ||
    combined.includes("grey list") ||
    combined.includes("black list")
  ) {
    return {
      impact: "high",
      rationale:
        "Change from a primary sanctions or standard-setting body. May require immediate updates to screening lists, controls or procedures.",
    };
  }

  // Medium impact: supervisory guidance and regulations
  if (
    combined.includes("cbuae") ||
    combined.includes("central bank") ||
    combined.includes("moe") ||
    combined.includes("ministry of economy") ||
    combined.includes("regulation") ||
    combined.includes("guidance") ||
    combined.includes("circular")
  ) {
    return {
      impact: "medium",
      rationale:
        "Change from a supervisory authority. May require updates to internal procedures, training materials or reporting templates.",
    };
  }

  // Low impact: informational or secondary sources
  if (
    combined.includes("news") ||
    combined.includes("press release") ||
    combined.includes("blog") ||
    combined.includes("newsletter")
  ) {
    return {
      impact: "low",
      rationale:
        "Informational update. Review for awareness but unlikely to require immediate control changes.",
    };
  }

  // Default: medium for unknown sources
  return {
    impact: "medium",
    rationale:
      "Source type not classified with high confidence. MLRO review required to determine actual impact.",
  };
}

/* ─── Report assembly ──────────────────────────────────────────────────── */

function buildImpactReport(changes, reportDate) {
  if (changes.length === 0) {
    const body = [
      "SCOPE",
      "",
      `This impact assessment covers the regulatory-watcher output for ${reportDate}.`,
      "No changes or new sources were detected, so no formal impact assessment is required.",
      "",
      "OUTCOME",
      "",
      "No regulatory changes to assess. Close the file for today.",
    ].join("\n");

    return wrapDocument({
      title: "Regulatory Change Impact Assessment",
      reference: `HSV2-REG-IMPACT-${today}`,
      classification: "Confidential. For MLRO review only.",
      coverage: `Regulatory monitoring day ${reportDate}`,
      preparedOn: today,
      body,
    });
  }

  const assessed = changes.map((c) => ({
    ...c,
    ...classifyImpact(c),
  }));

  const highCount = assessed.filter((a) => a.impact === "high").length;
  const medCount = assessed.filter((a) => a.impact === "medium").length;
  const lowCount = assessed.filter((a) => a.impact === "low").length;

  const summaryTable = renderTable(
    [
      { bucket: "High impact", count: String(highCount) },
      { bucket: "Medium impact", count: String(medCount) },
      { bucket: "Low impact", count: String(lowCount) },
      { bucket: "Total changes assessed", count: String(assessed.length) },
    ],
    [
      { key: "bucket", header: "Classification", max: 30 },
      { key: "count", header: "Count", max: 8 },
    ],
  );

  const detailCols = [
    { key: "source", header: "Source", max: 35 },
    { key: "authority", header: "Authority", max: 25 },
    { key: "impact", header: "Impact", max: 8 },
    { key: "rationale", header: "Rationale", max: 70 },
  ];

  const sections = [];

  if (highCount > 0) {
    sections.push(
      "HIGH-IMPACT CHANGES",
      "",
      renderTable(
        assessed.filter((a) => a.impact === "high").map((a) => ({
          source: a.source.slice(0, 35),
          authority: a.authority.slice(0, 25),
          impact: a.impact,
          rationale: a.rationale.slice(0, 70),
        })),
        detailCols,
      ),
      "",
    );
  }

  if (medCount > 0) {
    sections.push(
      "MEDIUM-IMPACT CHANGES",
      "",
      renderTable(
        assessed.filter((a) => a.impact === "medium").map((a) => ({
          source: a.source.slice(0, 35),
          authority: a.authority.slice(0, 25),
          impact: a.impact,
          rationale: a.rationale.slice(0, 70),
        })),
        detailCols,
      ),
      "",
    );
  }

  if (lowCount > 0) {
    sections.push(
      "LOW-IMPACT CHANGES",
      "",
      renderTable(
        assessed.filter((a) => a.impact === "low").map((a) => ({
          source: a.source.slice(0, 35),
          authority: a.authority.slice(0, 25),
          impact: a.impact,
          rationale: a.rationale.slice(0, 70),
        })),
        detailCols,
      ),
      "",
    );
  }

  const body = [
    "SCOPE",
    "",
    `This impact assessment covers ${assessed.length} regulatory change(s) detected by`,
    `the regulatory-watcher on ${reportDate}. Each change is classified by its`,
    "potential impact on the firm's AML/CFT controls, procedures and training",
    "materials. The MLRO must review each classification and record a formal",
    "response action where warranted.",
    "",
    "SUMMARY",
    "",
    summaryTable,
    "",
    ...sections,
    "REQUIRED ACTIONS",
    "",
    highCount > 0
      ? "HIGH: Every high-impact change must be reviewed by the MLRO within one business day. Open a task in the compliance workspace with a clear owner, deadline and remediation plan."
      : "No high-impact changes detected.",
    "",
    medCount > 0
      ? "MEDIUM: Every medium-impact change must be reviewed within five business days. Update internal procedures, training materials or reporting templates as needed."
      : "No medium-impact changes detected.",
    "",
    lowCount > 0
      ? "LOW: Low-impact changes are noted for awareness. No immediate action required unless the MLRO determines otherwise on review."
      : "No low-impact changes detected.",
    "",
    "Record all response actions and retain this assessment for the full ten-year retention period.",
  ].join("\n");

  return wrapDocument({
    title: "Regulatory Change Impact Assessment",
    reference: `HSV2-REG-IMPACT-${today}`,
    classification: "Confidential. For MLRO review only.",
    coverage: `Regulatory monitoring day ${reportDate}`,
    preparedOn: today,
    body,
  });
}

/* ─── Main ─────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`▶ Regulatory change impact assessment ${today}`);

  const { changes, reportDate, reportFile } = await parseLatestWatcherReport();

  if (!reportFile) {
    console.log("   no regulatory-watcher report found — nothing to assess");
    return;
  }
  console.log(`   watcher report: ${path.basename(reportFile)} (${reportDate})`);
  console.log(`   changes detected: ${changes.length}`);

  const report = buildImpactReport(changes, reportDate);

  await tryArchive(
    () =>
      writeHistory(
        path.join("registers", "regulatory-impact", `${today}.txt`),
        report,
      ),
    `regulatory-impact ${today} (txt + docx)`,
  );

  if (env.DRY_RUN) {
    console.log(`(dry) changes=${changes.length}`);
    return;
  }

  if (changes.length === 0) {
    console.log("   no changes — skipping Asana post");
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
    const docxBuf = renderDocxBuffer(report);
    const txtBuf = Buffer.from(report, "utf8");
    await asanaClient.attachFile(
      target.taskGid,
      txtBuf,
      `regulatory-impact-${today}.txt`,
      "text/plain",
    );
    await asanaClient.attachFile(
      target.taskGid,
      docxBuf,
      `regulatory-impact-${today}.docx`,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    const assessed = changes.map((c) => ({ ...c, ...classifyImpact(c) }));
    const headline = [
      `HSV2 / Regulatory Change Impact Assessment / ${today}`,
      "",
      `Changes assessed: ${changes.length}`,
      `High impact: ${assessed.filter((a) => a.impact === "high").length}`,
      `Medium impact: ${assessed.filter((a) => a.impact === "medium").length}`,
      `Low impact: ${assessed.filter((a) => a.impact === "low").length}`,
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
