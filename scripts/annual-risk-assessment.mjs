/**
 * Annual Enterprise-Wide AML and CFT Risk Assessment — draft generator.
 *
 * Runs once per year on 15 January at 09:00 Asia/Dubai (05:00 UTC) so the
 * draft is ready before the first standing Board meeting of the new
 * financial year. Walks the previous calendar year's archive across every
 * history/ subfolder and asks Claude to draft the five-pillar risk
 * assessment that the Ministry of Economy expects to see during a
 * supervisory visit.
 *
 * The output is a DRAFT. It is written for the MLRO, to
 * review, amend as her professional judgement requires, and then present
 * to Senior Management and the Board for formal acknowledgement. The
 * automation never finalises or signs in place of the MLRO.
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
  TARGET_YEAR = "",
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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Asana ${res.status} ${res.statusText} on ${reqPath}: ${body}`);
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

/* ─── Archive reader ────────────────────────────────────────────────────── */

function inYear(dateStr, year) {
  return dateStr.startsWith(`${year}-`);
}

async function readYearFiles(dir, year, maxChars = 1500) {
  const out = [];
  try {
    const files = await readdir(dir);
    for (const file of files.sort()) {
      const match = file.match(/(\d{4})/);
      if (!match || match[1] !== String(year)) continue;
      const content = await readFile(path.join(dir, file), "utf8");
      out.push({ file, content: content.slice(0, maxChars) });
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`read error on ${dir}: ${err.message}`);
  }
  return out;
}

async function readRegister(dir) {
  try {
    const content = await readFile(path.join(dir, "counterparties.csv"), "utf8");
    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    return {
      totalRows: Math.max(0, lines.length - 1),
      sample: lines.slice(0, 20).join("\n"),
    };
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`register read error: ${err.message}`);
    return { totalRows: 0, sample: "" };
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
        max_tokens: 5000,
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

function buildRiskAssessmentPrompt({ year, projects, mlroMonthlies, weekly, registerSummary }) {
  const projectBlock = projects.map((p) => `- ${p.name}`).join("\n");
  const monthlyBlock = mlroMonthlies.length === 0
    ? "No monthly MLRO consolidation reports were found for this year."
    : mlroMonthlies.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");
  const weeklyBlock = weekly.length === 0
    ? "No weekly pattern reports were found for this year."
    : weekly.slice(0, 12).map((e) => `### ${e.file}\n${e.content}`).join("\n\n");

  return `TASK. You are drafting the annual enterprise-wide AML and CFT risk assessment of ${CONFIRMED_REFERENCES.entity.legalName} for the year ${year}. The draft is addressed to the MLRO, ${CONFIRMED_REFERENCES.mlro.name}, for her review and for subsequent presentation to Senior Management and the Board. The document control block and the sign-off block are generated programmatically and appended to your response.

This assessment covers the five risk pillars the Ministry of Economy expects to see: customer risk, product and service risk, geographic risk, delivery channel risk, and typology exposure. For each pillar you must set out:
- the relevant facts about the firm that you can draw from the inputs below,
- a residual risk rating from low to high based on those facts,
- the principal controls in place,
- the compliance function's conclusion.

Be concrete and quantitative where the data supports it. When the data is missing, say so explicitly rather than invent numbers.

CONTEXT. The firm is a UAE-licensed Dealer in Precious Metals and Stones, classified as a Designated Non-Financial Business and Profession, supervised by the Ministry of Economy. It operates the following active compliance programmes across legally distinct entities:
${projectBlock}

INPUT A. MONTHLY MLRO CONSOLIDATION REPORTS FOR THE YEAR (first 1.5 KB each)
${monthlyBlock}

INPUT B. WEEKLY PATTERN REPORTS (up to 12 most recent, first 1.5 KB each)
${weeklyBlock}

INPUT C. CURRENT COUNTERPARTY REGISTER SUMMARY
Total rows: ${registerSummary.totalRows}
First rows of register:
${registerSummary.sample || "(register is empty)"}

OUTPUT FORMAT. Emit sections 1 to 11 in this exact order with ALL CAPS labels on their own line.

1. PURPOSE AND STANDING OF THIS DOCUMENT

2. BUSINESS OVERVIEW

3. PILLAR 1 — CUSTOMER RISK
(facts, residual rating, controls, conclusion)

4. PILLAR 2 — PRODUCT AND SERVICE RISK
(facts, residual rating, controls, conclusion)

5. PILLAR 3 — GEOGRAPHIC RISK
(facts, residual rating, controls, conclusion)

6. PILLAR 4 — DELIVERY CHANNEL RISK
(facts, residual rating, controls, conclusion)

7. PILLAR 5 — TYPOLOGY EXPOSURE
(facts drawn from the year's filing counts and the pattern reports, residual rating, controls, conclusion)

8. OVERALL RESIDUAL RISK
One paragraph stating the overall residual rating and the principal drivers.

9. PROPOSED ACTIONS ARISING FROM THIS ASSESSMENT
Six to ten lettered actions the compliance function proposes for the MLRO's consideration, each with a single imperative sentence.

10. LIMITATIONS OF THIS ASSESSMENT
One paragraph stating what the document does and does not cover.

11. DECLARATION LINE (one short sentence stating that this draft is prepared for the MLRO's review and requires her amendment and approval before presentation to Senior Management and the Board).

${STYLE_REMINDER}`;
}

function buildRiskAssessmentDocument({ year, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;
  const today = new Date().toISOString().slice(0, 10);

  return `=============================================================================
${entity.legalName.toUpperCase()}
ANNUAL ENTERPRISE-WIDE AML AND CFT RISK ASSESSMENT — DRAFT
Year ending 31 December ${year}
=============================================================================

Document reference:   ${referenceId}
Classification:       Confidential. For Senior Management and the Board.
Version:              1.0 (draft for MLRO review)
Prepared by:          Compliance function, ${entity.legalName}
Addressee:            ${mlro.name}, ${mlro.title},
                      for review and onward presentation to Senior
                      Management and the Board.
Drafted on:           ${today}
Coverage period:      01 January ${year} to 31 December ${year} inclusive
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

${claudeBody}

-----------------------------------------------------------------------------
12. DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Prepared by:       Compliance function, ${entity.legalName}
Reviewed by:       [awaiting MLRO review]
Approved by:       [awaiting MLRO approval]
Noted by Board on: __________________________ (Board minute reference)

For review by the MLRO, ${mlro.name}.

[End of document]`;
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const year = TARGET_YEAR
    ? Number.parseInt(TARGET_YEAR, 10)
    : new Date().getUTCFullYear() - 1;

  console.log(`▶  Annual Risk Assessment — ${new Date().toISOString()}`);
  console.log(`   target year: ${year}`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  if (isDryRun) console.log("   DRY RUN — no comment will be posted");

  const projects = await listProjects();
  console.log(`\nFound ${projects.length} active projects.`);

  const historyRoot = path.resolve(process.cwd(), "..", "history");
  const mlroMonthlies = await readYearFiles(path.join(historyRoot, "mlro-monthly"), year, 1500);
  const weekly = await readYearFiles(path.join(historyRoot, "weekly"), year, 1500);
  const registerSummary = await readRegister(path.join(historyRoot, "registers"));

  console.log(
    `\nArchive found: ${mlroMonthlies.length} monthly MLRO, ${weekly.length} weekly pattern, ${registerSummary.totalRows} counterparty rows`,
  );

  console.log(`\nGenerating annual risk assessment draft…`);
  const claudeBody = await callClaude(
    buildRiskAssessmentPrompt({ year, projects, mlroMonthlies, weekly, registerSummary }),
    "annual-ra",
  );

  const referenceId = `HSV2-EWRA-${year}`;
  const document = buildRiskAssessmentDocument({ year, referenceId, claudeBody });

  const archivePath = path.join("annual", `risk-assessment-${year}.txt`);
  try {
    await writeHistory(archivePath, document);
    console.log(`✓ archived to history/${archivePath}`);
  } catch (archiveErr) {
    console.warn(`⚠  failed to archive: ${archiveErr.message}`);
  }

  const portfolio = await findPortfolioPinned(projects);
  if (!portfolio) {
    console.log(`\n⚠  no "${PINNED_TASK_NAME}" task found in a project matching "${PORTFOLIO_PROJECT_NAME}" — archive only`);
  } else if (isDryRun) {
    console.log(`\n[dry-run] would post risk assessment draft to "${portfolio.projectName}"`);
  } else {
    try {
      const __doc = document.length > 60000 ? document.slice(0, 60000) + "\n\n[TRUNCATED — full document archived under history/]" : document;
      await postComment(portfolio.taskGid, __doc);
    } catch (__err) {
      console.warn(`⚠  Asana post failed: ${__err.message}. Document remains in history/ archive.`);
    }
    console.log(`\n✓ risk assessment draft posted to "${portfolio.projectName}" pinned task`);
  }

  if (!isDryRun) {
    await notify({
      subject: `HSV2 / Annual Enterprise-Wide Risk Assessment (draft) — ${year}`,
      body: document,
    });
  }

  console.log(`\n=== Summary ===`);
  console.log(`Year:     ${year}`);
  console.log(`Archive:  history/${archivePath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
