/**
 * Quarterly Jurisdiction Heatmap.
 *
 * Runs on the first business day of April, July, October and January.
 * Reads history/registers/counterparties.csv, groups the counterparties
 * by jurisdiction and computes a simple exposure index per jurisdiction
 * for the completed quarter (count of counterparties, number of
 * high-risk rows, number of cross-entity rows), then asks Claude to
 * draft a formal narrative quarterly heatmap report for the MLRO.
 */

import Anthropic from "@anthropic-ai/sdk";
import { notify } from "./notify.mjs";
import {
  SYSTEM_PROMPT,
  STYLE_REMINDER,
  CONFIRMED_REFERENCES,
  validateOutput,
} from "./regulatory-context.mjs";
import { writeHistory } from "./history-writer.mjs";
import { readFile } from "node:fs/promises";
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
  TARGET_QUARTER = "",
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

async function asana(reqPath, init = {}) {
  const res = await fetch(`https://app.asana.com/api/1.0${reqPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ASANA_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Asana ${res.status} on ${reqPath}`);
  return res.json();
}

async function listProjects() {
  const params = new URLSearchParams({
    workspace: ASANA_WORKSPACE_ID,
    archived: "false",
    limit: "100",
    opt_fields: "gid,name",
  });
  if (ASANA_TEAM_ID) params.set("team", ASANA_TEAM_ID);
  const page = await asana(`/projects?${params}`);
  return page.data;
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

function targetQuarter() {
  if (TARGET_QUARTER) {
    const m = TARGET_QUARTER.match(/^(\d{4})-Q([1-4])$/);
    if (!m) throw new Error(`Invalid TARGET_QUARTER: ${TARGET_QUARTER}`);
    return { year: Number.parseInt(m[1], 10), quarter: Number.parseInt(m[2], 10), label: TARGET_QUARTER };
  }
  const now = new Date();
  const month = now.getUTCMonth();
  if (month < 3) return { year: now.getUTCFullYear() - 1, quarter: 4, label: `${now.getUTCFullYear() - 1}-Q4` };
  if (month < 6) return { year: now.getUTCFullYear(), quarter: 1, label: `${now.getUTCFullYear()}-Q1` };
  if (month < 9) return { year: now.getUTCFullYear(), quarter: 2, label: `${now.getUTCFullYear()}-Q2` };
  return { year: now.getUTCFullYear(), quarter: 3, label: `${now.getUTCFullYear()}-Q3` };
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(current); current = ""; }
    else current += ch;
  }
  out.push(current);
  return out;
}

async function readRegister() {
  try {
    const text = await readFile(
      path.resolve(process.cwd(), "..", "history", "registers", "counterparties.csv"),
      "utf8",
    );
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length <= 1) return [];
    const header = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map((l) => {
      const cells = parseCsvLine(l);
      const obj = {};
      header.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
      return obj;
    });
    return rows;
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`register read error: ${err.message}`);
    return [];
  }
}

function computeHeatmap(rows) {
  const byJurisdiction = new Map();
  for (const row of rows) {
    const key = (row.jurisdiction || "").trim() || "Unknown jurisdiction";
    const entry = byJurisdiction.get(key) ?? {
      jurisdiction: key,
      total: 0,
      critical: 0,
      high: 0,
      crossEntity: 0,
      underReview: 0,
      sampleNames: [],
    };
    entry.total++;
    if (row.risk_rating === "critical") entry.critical++;
    if (row.risk_rating === "high") entry.high++;
    if ((row.entities_touching || "").split("|").filter(Boolean).length >= 2) entry.crossEntity++;
    if (row.status === "under_review" || row.status === "escalated") entry.underReview++;
    if (entry.sampleNames.length < 3 && row.counterparty_name) entry.sampleNames.push(row.counterparty_name);
    byJurisdiction.set(key, entry);
  }
  const heatmap = [...byJurisdiction.values()];
  heatmap.sort((a, b) => {
    if (a.critical !== b.critical) return b.critical - a.critical;
    if (a.high !== b.high) return b.high - a.high;
    return b.total - a.total;
  });
  return heatmap;
}

async function callClaude(prompt, label) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 3500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (!text) throw new Error("Claude returned an empty response");
      const check = validateOutput(text);
      if (!check.ok && attempt < 4) {
        await sleep(2000);
        continue;
      }
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt >= 4) break;
      await sleep(5000 * attempt);
    }
  }
  throw lastErr;
}

function buildPrompt({ label, heatmap, totalRows }) {
  const heatmapBlock = heatmap.length === 0
    ? "The counterparty register is empty."
    : heatmap.map((e) => {
        return `${e.jurisdiction}: total=${e.total} critical=${e.critical} high=${e.high} crossEntity=${e.crossEntity} underReview=${e.underReview} sample=[${e.sampleNames.join("; ")}]`;
      }).join("\n");

  return `TASK. Draft the analytical body of the Quarterly Jurisdiction Heatmap for ${CONFIRMED_REFERENCES.entity.legalName} for ${label}. The document control block and sign-off are programmatic.

CONTEXT.
- Total counterparty register rows: ${totalRows}
- Jurisdictions observed: ${heatmap.length}

PRE-COMPUTED HEATMAP (one line per jurisdiction, sorted by critical then high then total):
${heatmapBlock}

OUTPUT FORMAT. Emit sections 1 to 6 in this exact order with ALL CAPS labels.

1. PURPOSE
One paragraph stating this is the quarterly jurisdiction heatmap for ${label}, prepared as part of the firm's ongoing geographic risk monitoring under Federal Decree-Law No. 10 of 2025.

2. OVERALL OBSERVATION
Two to three sentences stating the overall pattern of jurisdiction exposure: concentration, diversification, presence of any critical jurisdiction.

3. JURISDICTIONS OF HIGHEST CONCERN
Numbered paragraphs (one per jurisdiction, up to five) for the jurisdictions with critical or high risk counterparties. For each: name the jurisdiction, state the count at each rating, name up to three counterparties from the sample, and state the specific concern in one sentence.

4. CROSS-ENTITY CONCENTRATION BY JURISDICTION
One short paragraph identifying jurisdictions where the same or related counterparties touch more than one HSV2 programme entity.

5. CHANGE FROM THE PREVIOUS QUARTER
One paragraph. If no baseline is available in the current inputs, state explicitly that the change-over-time narrative cannot be produced this cycle and will be available from the next quarter onwards.

6. RECOMMENDED ACTIONS FOR THE MLRO
Three to five numbered paragraphs each ending in an imperative sentence. At minimum include one action on each critical jurisdiction identified in section 3.

${STYLE_REMINDER}`;
}

function buildDocument({ label, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;
  const today = new Date().toISOString().slice(0, 10);

  return `=============================================================================
${entity.legalName.toUpperCase()}
QUARTERLY JURISDICTION HEATMAP
${label}
=============================================================================

Document reference:   HSV2-JUR-${label}
Classification:       Confidential. For MLRO review only.
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Prepared on:          ${today}, 09:45 Asia/Dubai
Addressee:            ${mlro.name}, ${mlro.title}
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

async function main() {
  const target = targetQuarter();
  console.log(`▶  Quarterly Jurisdiction Heatmap — ${new Date().toISOString()}`);
  console.log(`   quarter: ${target.label}`);
  if (isDryRun) console.log("   DRY RUN");

  const rows = await readRegister();
  const heatmap = computeHeatmap(rows);
  console.log(`\nRegister rows: ${rows.length}, jurisdictions: ${heatmap.length}`);

  const claudeBody = await callClaude(
    buildPrompt({ label: target.label, heatmap, totalRows: rows.length }),
    "jurisdiction-heatmap",
  );

  const referenceId = `HSV2-JUR-${target.label}`;
  const document = buildDocument({ label: target.label, referenceId, claudeBody });

  try {
    await writeHistory(path.join("quarterly-jurisdiction", `${target.label}.txt`), document);
    console.log(`✓ archived to history/quarterly-jurisdiction/${target.label}.txt`);
  } catch (err) {
    console.warn(`⚠  archive failed: ${err.message}`);
  }

  const projects = await listProjects();
  const portfolio = await findPortfolioPinned(projects);
  if (!portfolio) {
    console.log(`\n⚠  no pinned task found — archive only`);
  } else if (isDryRun) {
    console.log(`\n[dry-run] would post to "${portfolio.projectName}"`);
  } else {
    try {
      const __doc = document.length > 60000 ? document.slice(0, 60000) + "\n\n[TRUNCATED — full document archived under history/]" : document;
      await postComment(portfolio.taskGid, __doc);
    } catch (__err) {
      console.warn(`⚠  Asana post failed: ${__err.message}. Document remains in history/ archive.`);
    }
    console.log(`\n✓ posted to "${portfolio.projectName}"`);
  }

  if (!isDryRun) {
    await notify({
      subject: `HSV2 / Quarterly Jurisdiction Heatmap — ${target.label}`,
      body: document,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
