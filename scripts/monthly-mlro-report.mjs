/**
 * Monthly MLRO Consolidation Report to Senior Management and the Board.
 *
 * Runs on the first business day of each month at 09:00 Asia/Dubai
 * (05:00 UTC). Consolidates the four weekly MLRO reports issued during
 * the previous month, the four weekly pattern reports, the ~22 daily
 * retros and the ~22 daily portfolio digests into a single formal
 * monthly report addressed from the MLRO to Senior
 * Management and the Board of [Reporting Entity].
 *
 * The report is archived to history/mlro-monthly/YYYY-MM.txt and
 * posted as a comment on the pinned Today's Priorities task inside the
 * PORTFOLIO_PROJECT_NAME project (default SCREENINGS).
 *
 * The automation never signs in place of the MLRO. The document ends
 * with a declaration block and signature lines the MLRO completes
 * manually before distribution.
 */

import Anthropic from "@anthropic-ai/sdk";
import { notify } from "./notify.mjs";
import {
  SYSTEM_PROMPT,
  STYLE_REMINDER,
  CONFIRMED_REFERENCES,
  ARTEFACT_PREFIXES,
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

/* ─── Archive readers ───────────────────────────────────────────────────── */

function monthRange(targetDate) {
  // Target the MONTH BEFORE the current run. If the script runs on 01 May
  // 2026, it should consolidate April 2026. If it runs on 01 April 2026,
  // it should consolidate March 2026.
  const d = new Date(targetDate);
  d.setUTCDate(1);
  const endOfMonthBefore = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  const startOfMonthBefore = new Date(Date.UTC(
    endOfMonthBefore.getUTCFullYear(),
    endOfMonthBefore.getUTCMonth(),
    1,
  ));
  const yearMonth = `${startOfMonthBefore.getUTCFullYear()}-${String(startOfMonthBefore.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    startIso: startOfMonthBefore.toISOString().slice(0, 10),
    endIso: endOfMonthBefore.toISOString().slice(0, 10),
    yearMonth,
  };
}

function inRange(dateStr, startIso, endIso) {
  return dateStr >= startIso && dateStr <= endIso;
}

async function readFilesInRange(dir, startIso, endIso, maxChars = 2000) {
  const out = [];
  try {
    const files = await readdir(dir);
    for (const file of files.sort()) {
      const match = file.match(/(\d{4}-\d{2}-\d{2}|\d{4}-W\d{2})/);
      if (!match) continue;
      // Handle ISO weeks approximately by matching on the start or end dates.
      if (match[1].includes("W")) {
        // Convert year-week to a date in the middle of that week for filtering.
        const [year, week] = match[1].split("-W").map(Number);
        const janFirst = new Date(Date.UTC(year, 0, 1));
        const dayOffset = (week - 1) * 7 + 3;
        const approxDate = new Date(janFirst.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const iso = approxDate.toISOString().slice(0, 10);
        if (!inRange(iso, startIso, endIso)) continue;
      } else {
        if (!inRange(match[1], startIso, endIso)) continue;
      }
      const content = await readFile(path.join(dir, file), "utf8");
      out.push({ file, content: content.slice(0, maxChars) });
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`read error on ${dir}: ${err.message}`);
  }
  return out;
}

/* ─── Claude ────────────────────────────────────────────────────────────── */

async function callClaude(prompt, label) {
  console.log(`  ${label} prompt size: ~${(prompt.length / 1024).toFixed(1)} KB`);
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
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
        console.warn("  ⚠  all 4 validation attempts failed — returning best-effort text with warning");
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

function buildMonthlyPrompt({ yearMonth, startIso, endIso, weeklyMlro, weeklyPattern, retros, portfolios }) {
  const weeklyMlroBlock = weeklyMlro.length === 0
    ? "No weekly MLRO reports were found in the archive for this month."
    : weeklyMlro.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");
  const weeklyPatternBlock = weeklyPattern.length === 0
    ? "No weekly pattern reports were found in the archive for this month."
    : weeklyPattern.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");
  const retroBlock = retros.length === 0
    ? "No daily retros were found in the archive for this month."
    : retros.map((e) => `### ${e.file}\n${e.content.slice(0, 1000)}`).join("\n\n");
  const portfoliosBlock = portfolios.length === 0
    ? "No daily portfolio digests were found in the archive for this month."
    : portfolios.map((e) => `### ${e.file}\n${e.content.slice(0, 1000)}`).join("\n\n");

  return `TASK. You are drafting the analytical body of the Monthly MLRO Consolidation Report for ${CONFIRMED_REFERENCES.entity.legalName}, addressed from the MLRO (${CONFIRMED_REFERENCES.mlro.name}) to Senior Management and the Board. The document control block and the declaration and signature block are generated programmatically and appended to your response. You are responsible for sections 1 to 11 below.

Write in the voice of the MLRO speaking to Senior Management and the Board. Use the first person singular for judgement and for the declaration (I, in my view, I confirm). Use the first person plural (we) for the firm's compliance function.

CONTEXT. This report covers the month of ${yearMonth}, from ${startIso} to ${endIso} inclusive. It consolidates the weekly MLRO reports, the weekly pattern reports, the daily retros and the daily portfolio digests written during the month.

INPUT A. WEEKLY MLRO REPORTS (first 2 KB each)
${weeklyMlroBlock}

INPUT B. WEEKLY PATTERN REPORTS (first 2 KB each)
${weeklyPatternBlock}

INPUT C. DAILY COMPLETION RETROS (first 1 KB each)
${retroBlock}

INPUT D. DAILY PORTFOLIO DIGESTS (first 1 KB each)
${portfoliosBlock}

OUTPUT FORMAT. Emit sections 1 to 11 in this exact order with ALL CAPS labels on their own line.

1. PURPOSE AND STANDING OF THIS REPORT

One paragraph stating that this is the monthly consolidation report of the MLRO of ${CONFIRMED_REFERENCES.entity.legalName} for the month of ${yearMonth}, that it is prepared for Senior Management and the Board, that it is an internal report under Federal Decree-Law No. 10 of 2025, and that it is retained in the firm's archive for 10 years.

2. HEADLINE FOR THE MONTH

Two to four short sentences summarising the most material risk themes of the month and what the MLRO wants the Board to note.

3. FILINGS MADE THROUGH THE GOAML PLATFORM DURING THE MONTH

One paragraph of introduction, then counts for each filing type (STR, SAR, DPMSR, PNMR, FFR) derived from the weekly reports above if the numbers are visible there. If the weekly reports did not state the numbers, say so explicitly and give a range where possible. End with one narrative paragraph describing the nature of the filings.

4. FILINGS IN PREPARATION AT MONTH-END

Lettered paragraphs listing any filing candidate reviews still under the MLRO's personal review at month-end.

5. SANCTIONS SCREENING AND TARGETED FINANCIAL SANCTIONS

One paragraph summarising monthly screening activity, hits returned, false positives cleared, and any matches still under review.

6. CUSTOMER DUE DILIGENCE AND PEP POPULATION

One paragraph on the PEP population at month-end and any movements during the month.

7. TRAINING AND COMPETENCE

One short paragraph on training delivered during the month.

8. INTERNAL POLICY AND PROCEDURE CHANGES DURING THE MONTH

Any change to the firm's internal AML or CFT policies, procedures or controls made during the month. If none, state "No internal policy or procedure changes were made during the month."

9. INCIDENTS AND EXCEPTIONS

Any reportable incident during the month. If none, state "No reportable incidents during the month."

10. RISK ASSESSMENT AND PROGRAMME HEALTH

One paragraph stating the MLRO's view of the programme's health for the month, in the first person singular, with an explicit confirmation that the MLRO has the resources and the authority she needs.

11. RECOMMENDATIONS TO SENIOR MANAGEMENT AND THE BOARD

Three to five numbered paragraphs each ending in an imperative sentence, asking the Board to note or act on specific items.

${STYLE_REMINDER}`;
}

function buildMonthlyDocument({ yearMonth, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;

  return `=============================================================================
${entity.legalName.toUpperCase()}
MONTHLY CONSOLIDATION REPORT OF THE MONEY LAUNDERING REPORTING OFFICER
Month of ${yearMonth}
=============================================================================

Document reference:   ${referenceId}
Classification:       Confidential. For Senior Management and the Board.
Version:              1.0
From:                 ${mlro.name}, ${mlro.title}
To:                   Senior Management and the Board of ${entity.legalName}
Issued on:            ${new Date().toISOString().slice(0, 10)}, 09:00 Asia/Dubai
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

${claudeBody}

-----------------------------------------------------------------------------
12. DECLARATION OF THE MONEY LAUNDERING REPORTING OFFICER
-----------------------------------------------------------------------------

I, ${mlro.name}, in my capacity as Money Laundering Reporting Officer of
${entity.legalName}, confirm that the contents of this report are true
and complete to the best of my knowledge and belief as at the date of
issue. I further confirm that I have, during the month covered by this
report, discharged my function in accordance with the applicable
provisions of Federal Decree-Law No. 10 of 2025 and the firm's internal
AML and CFT programme.

-----------------------------------------------------------------------------
13. DOCUMENT SIGN-OFF
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
  const { startIso, endIso, yearMonth } = monthRange(new Date());

  console.log(`▶  Monthly MLRO Consolidation — ${new Date().toISOString()}`);
  console.log(`   target month: ${yearMonth} (${startIso} to ${endIso})`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  if (isDryRun) console.log("   DRY RUN — no comment will be posted");

  const historyRoot = path.resolve(process.cwd(), "..", "history");
  const weeklyMlro = await readFilesInRange(
    path.join(historyRoot, "mlro-weekly"),
    startIso,
    endIso,
    2000,
  );
  const weeklyPattern = await readFilesInRange(
    path.join(historyRoot, "weekly"),
    startIso,
    endIso,
    2000,
  );
  const retros = await readFilesInRange(
    path.join(historyRoot, "retro"),
    startIso,
    endIso,
    1000,
  );

  // Daily portfolios are nested one level deeper under daily/YYYY-MM-DD/.
  const portfolios = [];
  try {
    const dailyDir = path.join(historyRoot, "daily");
    const days = await readdir(dailyDir);
    for (const day of days.sort()) {
      if (!inRange(day, startIso, endIso)) continue;
      try {
        const content = await readFile(path.join(dailyDir, day, "portfolio-digest.txt"), "utf8");
        portfolios.push({ file: `${day}/portfolio-digest.txt`, content: content.slice(0, 1000) });
      } catch { /* no digest that day */ }
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`daily digest read error: ${err.message}`);
  }

  console.log(
    `\nArchive found: ${weeklyMlro.length} weekly MLRO, ${weeklyPattern.length} weekly pattern, ${retros.length} retros, ${portfolios.length} portfolio digests`,
  );

  console.log(`\nGenerating Monthly MLRO Consolidation…`);
  const claudeBody = await callClaude(
    buildMonthlyPrompt({ yearMonth, startIso, endIso, weeklyMlro, weeklyPattern, retros, portfolios }),
    "mlro-monthly",
  );

  const referenceId = `HSV2-MLRO-M-${yearMonth}`;
  const document = buildMonthlyDocument({ yearMonth, referenceId, claudeBody });

  const archivePath = path.join("mlro-monthly", `${yearMonth}.txt`);
  try {
    await writeHistory(archivePath, document);
    console.log(`✓ archived to history/${archivePath}`);
  } catch (archiveErr) {
    console.warn(`⚠  failed to archive: ${archiveErr.message}`);
  }

  const projects = await listProjects();
  const portfolio = await findPortfolioPinned(projects);
  if (!portfolio) {
    console.log(`\n⚠  no "${PINNED_TASK_NAME}" task found in a project matching "${PORTFOLIO_PROJECT_NAME}" — archive only`);
  } else if (isDryRun) {
    console.log(`\n[dry-run] would post monthly report to "${portfolio.projectName}"`);
  } else {
    try {
      const __doc = document.length > 60000 ? document.slice(0, 60000) + "\n\n[TRUNCATED — full document archived under history/]" : document;
      await postComment(portfolio.taskGid, __doc);
    } catch (__err) {
      console.warn(`⚠  Asana post failed: ${__err.message}. Document remains in history/ archive.`);
    }
    console.log(`\n✓ monthly report posted to "${portfolio.projectName}" pinned task`);
  }

  if (!isDryRun) {
    await notify({
      subject: `${ARTEFACT_PREFIXES.mlroMonthly} — ${yearMonth}`,
      body: document,
    });
  }

  console.log(`\n=== Summary ===`);
  console.log(`Month:    ${yearMonth}`);
  console.log(`Archive:  history/${archivePath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
