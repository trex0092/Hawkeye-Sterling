/**
 * Quarterly MLRO Report to Senior Management and the Board.
 *
 * Runs on the first business day of the month following each quarter end
 * (so on the first working day of April, July, October and January). The
 * script consolidates the three Monthly MLRO Consolidation Reports of the
 * completed quarter, the corresponding Weekly Pattern Reports and the
 * current counterparty register into a single formal quarterly report
 * issued from the MLRO to Senior Management and the
 * Board of [Reporting Entity].
 *
 * Archived to history/mlro-quarterly/YYYY-Qn.txt and posted as a comment
 * on the pinned Today's Priorities task inside the SCREENINGS project.
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
  TARGET_QUARTER = "", // format YYYY-Qn, optional override
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

/* ─── Asana ─────────────────────────────────────────────────────────────── */

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

/* ─── Quarter maths ─────────────────────────────────────────────────────── */

function quarterToResolve(now) {
  if (TARGET_QUARTER) {
    const m = TARGET_QUARTER.match(/^(\d{4})-Q([1-4])$/);
    if (!m) {
      throw new Error(`Invalid TARGET_QUARTER format. Expected YYYY-Qn, got ${TARGET_QUARTER}`);
    }
    const year = Number.parseInt(m[1], 10);
    const q = Number.parseInt(m[2], 10);
    return { year, quarter: q };
  }
  // Target the quarter BEFORE the current date.
  const month = now.getUTCMonth(); // 0-indexed
  if (month < 3) return { year: now.getUTCFullYear() - 1, quarter: 4 };
  if (month < 6) return { year: now.getUTCFullYear(), quarter: 1 };
  if (month < 9) return { year: now.getUTCFullYear(), quarter: 2 };
  return { year: now.getUTCFullYear(), quarter: 3 };
}

function quarterRange(year, quarter) {
  const startMonth = (quarter - 1) * 3; // 0, 3, 6, 9
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0)); // last day of the third month
  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
    label: `${year}-Q${quarter}`,
    monthsInQuarter: [
      String(startMonth + 1).padStart(2, "0"),
      String(startMonth + 2).padStart(2, "0"),
      String(startMonth + 3).padStart(2, "0"),
    ],
    year,
    quarter,
  };
}

/* ─── Archive readers ───────────────────────────────────────────────────── */

async function readMonthlyMlrosForQuarter(dir, year, monthsInQuarter, maxChars = 2500) {
  const out = [];
  try {
    const files = await readdir(dir);
    for (const file of files.sort()) {
      const m = file.match(/^(\d{4})-(\d{2})\.txt$/);
      if (!m) continue;
      if (Number.parseInt(m[1], 10) !== year) continue;
      if (!monthsInQuarter.includes(m[2])) continue;
      const content = await readFile(path.join(dir, file), "utf8");
      out.push({ file, content: content.slice(0, maxChars) });
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`read error on ${dir}: ${err.message}`);
  }
  return out;
}

async function readWeeklyPatternsForRange(dir, startIso, endIso, maxChars = 1500) {
  const out = [];
  try {
    const files = await readdir(dir);
    for (const file of files.sort()) {
      const m = file.match(/^(\d{4})-W(\d{2})\.txt$/);
      if (!m) continue;
      // Convert YYYY-Wnn to an approximate date for filtering.
      const year = Number.parseInt(m[1], 10);
      const week = Number.parseInt(m[2], 10);
      const janFirst = new Date(Date.UTC(year, 0, 1));
      const approx = new Date(janFirst.getTime() + ((week - 1) * 7 + 3) * 24 * 60 * 60 * 1000);
      const iso = approx.toISOString().slice(0, 10);
      if (iso < startIso || iso > endIso) continue;
      const content = await readFile(path.join(dir, file), "utf8");
      out.push({ file, content: content.slice(0, maxChars) });
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`read error on ${dir}: ${err.message}`);
  }
  return out;
}

async function readRegisterRows(dir) {
  try {
    const content = await readFile(path.join(dir, "counterparties.csv"), "utf8");
    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    return Math.max(0, lines.length - 1);
  } catch {
    return 0;
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

function buildQuarterlyPrompt({ label, startIso, endIso, monthlyReports, weeklyPatterns, registerRows }) {
  const monthlyBlock = monthlyReports.length === 0
    ? "No monthly MLRO consolidation reports were found in the archive for this quarter."
    : monthlyReports.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");
  const weeklyBlock = weeklyPatterns.length === 0
    ? "No weekly pattern reports were found in the archive for this quarter."
    : weeklyPatterns.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");

  return `TASK. You are drafting the analytical body of the Quarterly MLRO Report for ${CONFIRMED_REFERENCES.entity.legalName} for ${label} (${startIso} to ${endIso} inclusive). The document is addressed from the MLRO, ${CONFIRMED_REFERENCES.mlro.name}, to Senior Management and the Board. The document control block, the MLRO declaration and the signature block are generated programmatically and appended to your response.

Write in the voice of the MLRO speaking to Senior Management and the Board. Use first person singular for judgement and the final declaration. Use first person plural for the firm's compliance function.

INPUT A. MONTHLY MLRO CONSOLIDATION REPORTS FOR THE QUARTER (first 2.5 KB each)
${monthlyBlock}

INPUT B. WEEKLY PATTERN REPORTS FOR THE QUARTER (first 1.5 KB each)
${weeklyBlock}

INPUT C. CURRENT COUNTERPARTY REGISTER
Total rows: ${registerRows}

OUTPUT FORMAT. Emit sections 1 to 12 in this exact order with ALL CAPS labels on their own line.

1. PURPOSE AND STANDING OF THIS REPORT
   One paragraph stating that this is the quarterly MLRO report for ${label}, prepared under Federal Decree-Law No. 10 of 2025 as an internal consolidation for Senior Management and the Board, retained for 10 years.

2. HEADLINE FOR THE QUARTER
   Two to four short sentences summarising the most material risk themes of the quarter and what the MLRO wants the Board to note.

3. QUARTERLY FILINGS SUMMARY
   Counts for the five goAML filing types (STR, SAR, DPMSR, PNMR, FFR) aggregated across the three months. Followed by one short narrative paragraph on the nature of the filings.

4. QUARTERLY TREND NARRATIVE
   Two to four short paragraphs comparing month one to month two to month three within the quarter. Identify any trend that became material during the quarter.

5. MATTERS UNDER REVIEW AT QUARTER-END
   Lettered paragraphs listing any candidate review still on the MLRO's desk at the end of the quarter.

6. SANCTIONS SCREENING ACTIVITY FOR THE QUARTER
   One paragraph summarising total screening volume, hits returned, hits cleared, matches still open.

7. PEP POPULATION MOVEMENT DURING THE QUARTER
   One paragraph on new PEPs identified, PEPs moved out, current total, any PEPs without MLRO authorisation.

8. TRAINING DELIVERED DURING THE QUARTER
   One short paragraph listing the training modules delivered.

9. INTERNAL POLICY OR PROCEDURE CHANGES DURING THE QUARTER
   One paragraph stating any change and its reason. If none, say so.

10. MATERIAL INCIDENTS OR EXCEPTIONS DURING THE QUARTER
    One paragraph listing any reportable incident. If none, say so.

11. RISK ASSESSMENT AND PROGRAMME HEALTH
    One paragraph in first person singular stating the MLRO's view of programme health for the quarter and confirming that she has had the resources and authority she needs.

12. RECOMMENDATIONS TO SENIOR MANAGEMENT AND THE BOARD
    Three to five numbered paragraphs each ending in an imperative sentence.

${STYLE_REMINDER}`;
}

function buildQuarterlyDocument({ label, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;
  const today = new Date().toISOString().slice(0, 10);

  return `=============================================================================
${entity.legalName.toUpperCase()}
QUARTERLY REPORT OF THE MONEY LAUNDERING REPORTING OFFICER
${label}
=============================================================================

Document reference:   ${referenceId}
Classification:       Confidential. For Senior Management and the Board.
Version:              1.0
From:                 ${mlro.name}, ${mlro.title}
To:                   Senior Management and the Board of ${entity.legalName}
Issued on:            ${today}, 09:00 Asia/Dubai
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

${claudeBody}

-----------------------------------------------------------------------------
13. DECLARATION OF THE MONEY LAUNDERING REPORTING OFFICER
-----------------------------------------------------------------------------

I, ${mlro.name}, in my capacity as Money Laundering Reporting Officer of
${entity.legalName}, confirm that the contents of this report are true
and complete to the best of my knowledge and belief as at the date of
issue. I further confirm that I have, during the quarter covered by
this report, discharged my function in accordance with the applicable
provisions of Federal Decree-Law No. 10 of 2025 and the firm's internal
AML and CFT programme.

-----------------------------------------------------------------------------
14. DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Issued by:           ${mlro.name}, Money Laundering Reporting Officer
Signature:           __________________________
Date:                __________________________
Acknowledged by:     __________________________ (Senior Management)
Noted by Board on:   __________________________ (Board minute reference)

[End of document]`;
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const now = new Date();
  const { year, quarter } = quarterToResolve(now);
  const range = quarterRange(year, quarter);

  console.log(`▶  Quarterly MLRO Report — ${new Date().toISOString()}`);
  console.log(`   target: ${range.label} (${range.startIso} to ${range.endIso})`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  if (isDryRun) console.log("   DRY RUN — no comment will be posted");

  const historyRoot = path.resolve(process.cwd(), "..", "history");
  const monthlyReports = await readMonthlyMlrosForQuarter(
    path.join(historyRoot, "mlro-monthly"),
    year,
    range.monthsInQuarter,
    2500,
  );
  const weeklyPatterns = await readWeeklyPatternsForRange(
    path.join(historyRoot, "weekly"),
    range.startIso,
    range.endIso,
    1500,
  );
  const registerRows = await readRegisterRows(path.join(historyRoot, "registers"));

  console.log(
    `\nArchive: ${monthlyReports.length} monthly MLRO report(s), ${weeklyPatterns.length} weekly pattern report(s), ${registerRows} counterparty rows`,
  );

  console.log(`\nGenerating Quarterly MLRO Report…`);
  const claudeBody = await callClaude(
    buildQuarterlyPrompt({
      label: range.label,
      startIso: range.startIso,
      endIso: range.endIso,
      monthlyReports,
      weeklyPatterns,
      registerRows,
    }),
    "mlro-quarterly",
  );

  const referenceId = `HSV2-MLRO-Q-${range.label}`;
  const document = buildQuarterlyDocument({ label: range.label, referenceId, claudeBody });

  const archivePath = path.join("mlro-quarterly", `${range.label}.txt`);
  try {
    await writeHistory(archivePath, document);
    console.log(`✓ archived to history/${archivePath}`);
  } catch (archiveErr) {
    console.warn(`⚠  failed to archive: ${archiveErr.message}`);
  }

  const projects = await listProjects();
  const portfolio = await findPortfolioPinned(projects);
  if (!portfolio) {
    console.log(`\n⚠  no "${PINNED_TASK_NAME}" task found — archive only`);
  } else if (isDryRun) {
    console.log(`\n[dry-run] would post quarterly report to "${portfolio.projectName}"`);
  } else {
    await postComment(portfolio.taskGid, document);
    console.log(`\n✓ quarterly report posted to "${portfolio.projectName}"`);
  }

  if (!isDryRun) {
    await notify({
      subject: `HSV2 / Quarterly MLRO Report — ${range.label}`,
      body: document,
    });
  }

  console.log(`\n=== Summary ===`);
  console.log(`Quarter: ${range.label}`);
  console.log(`Archive: history/${archivePath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
