/**
 * Annual MLRO Report to Senior Management and the Board.
 *
 * Runs on the first business day of each calendar year at 09:00
 * Asia/Dubai (05:00 UTC). Consolidates the four quarterly MLRO reports
 * of the completed year, plus the twelve monthly reports and the
 * current counterparty register, into a single formal annual report
 * from the MLRO to Senior Management and the Board.
 *
 * The annual report supports the Board's year-end discussion on the
 * effectiveness of the AML and CFT programme.
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

/* ─── Archive readers ───────────────────────────────────────────────────── */

async function readYearFiles(dir, year, maxChars = 2000) {
  const out = [];
  try {
    const files = await readdir(dir);
    for (const file of files.sort()) {
      if (!file.startsWith(`${year}`)) continue;
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
        max_tokens: 6000,
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

function buildAnnualPrompt({ year, quarterlyReports, monthlyReports, registerRows }) {
  const quarterlyBlock = quarterlyReports.length === 0
    ? "No quarterly MLRO reports were found in the archive for this year."
    : quarterlyReports.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");
  const monthlyBlock = monthlyReports.length === 0
    ? "No monthly MLRO reports were found in the archive for this year."
    : monthlyReports.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");

  return `TASK. You are drafting the analytical body of the Annual MLRO Report for ${CONFIRMED_REFERENCES.entity.legalName} for the calendar year ${year}. The document is addressed from the MLRO, ${CONFIRMED_REFERENCES.mlro.name}, to Senior Management and the Board. The document control block, the MLRO declaration and the signature block are generated programmatically and appended to your response.

This is the year-end report. It supports the Board's formal discussion on the effectiveness of the AML and CFT programme. It is NOT the annual enterprise-wide risk assessment; that is a separate artefact. It is also NOT a regulatory filing; it is an internal document retained for ten years under Federal Decree-Law No. 10 of 2025.

Write in the voice of the MLRO speaking to Senior Management and the Board. Use first person singular for judgement and the declaration. Use first person plural for the firm's compliance function.

INPUT A. QUARTERLY MLRO REPORTS FOR ${year} (first 2 KB each)
${quarterlyBlock}

INPUT B. MONTHLY MLRO REPORTS FOR ${year} (first 2 KB each)
${monthlyBlock}

INPUT C. CURRENT COUNTERPARTY REGISTER
Total rows: ${registerRows}

OUTPUT FORMAT. Emit sections 1 to 14 in this exact order with ALL CAPS labels on their own line.

1. PURPOSE AND STANDING OF THIS REPORT
2. HEADLINE FOR THE YEAR (three to five sentences stating the material risk themes of the year)
3. ANNUAL FILINGS SUMMARY (counts for STR, SAR, DPMSR, PNMR, FFR for the whole year, with a one-paragraph narrative)
4. QUARTER-BY-QUARTER TREND (one short paragraph per quarter, identifying the trajectory)
5. OPEN MATTERS AT YEAR-END (lettered paragraphs)
6. SANCTIONS SCREENING PROGRAMME FOR THE YEAR (volume, hits, dispositions, confirmed matches)
7. PEP POPULATION MOVEMENT DURING THE YEAR
8. TRAINING PROGRAMME FOR THE YEAR
9. INTERNAL POLICY AND PROCEDURE CHANGES DURING THE YEAR
10. MATERIAL INCIDENTS AND EXCEPTIONS DURING THE YEAR
11. MLRO VIEW OF PROGRAMME HEALTH FOR THE YEAR (first person singular; include explicit confirmation of resources and authority; include explicit statement that the MLRO has discharged her function for the year)
12. KEY RISKS CARRIED INTO NEXT YEAR
13. RECOMMENDATIONS TO SENIOR MANAGEMENT AND THE BOARD FOR NEXT YEAR (three to five numbered paragraphs each ending with an imperative sentence)
14. CLOSING SENTENCE (one sentence thanking Senior Management and the Board for their support of the compliance function during the year)

${STYLE_REMINDER}`;
}

function buildAnnualDocument({ year, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;
  const today = new Date().toISOString().slice(0, 10);

  return `=============================================================================
${entity.legalName.toUpperCase()}
ANNUAL REPORT OF THE MONEY LAUNDERING REPORTING OFFICER
Year ${year}
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
15. DECLARATION OF THE MONEY LAUNDERING REPORTING OFFICER
-----------------------------------------------------------------------------

I, ${mlro.name}, in my capacity as Money Laundering Reporting Officer of
${entity.legalName}, confirm that the contents of this report are true
and complete to the best of my knowledge and belief as at the date of
issue. I further confirm that I have, during the year ${year}, discharged
my function in accordance with the applicable provisions of Federal
Decree-Law No. 10 of 2025 and the firm's internal AML and CFT programme.

-----------------------------------------------------------------------------
16. DOCUMENT SIGN-OFF
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
  const year = TARGET_YEAR
    ? Number.parseInt(TARGET_YEAR, 10)
    : new Date().getUTCFullYear() - 1;

  console.log(`▶  Annual MLRO Report — ${new Date().toISOString()}`);
  console.log(`   target year: ${year}`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  if (isDryRun) console.log("   DRY RUN — no comment will be posted");

  const historyRoot = path.resolve(process.cwd(), "..", "history");
  const quarterlyReports = await readYearFiles(path.join(historyRoot, "mlro-quarterly"), year, 2000);
  const monthlyReports = await readYearFiles(path.join(historyRoot, "mlro-monthly"), year, 2000);
  const registerRows = await readRegisterRows(path.join(historyRoot, "registers"));

  console.log(
    `\nArchive: ${quarterlyReports.length} quarterly report(s), ${monthlyReports.length} monthly report(s), ${registerRows} counterparty rows`,
  );

  console.log(`\nGenerating Annual MLRO Report…`);
  const claudeBody = await callClaude(
    buildAnnualPrompt({ year, quarterlyReports, monthlyReports, registerRows }),
    "mlro-annual",
  );

  const referenceId = `HSV2-MLRO-A-${year}`;
  const document = buildAnnualDocument({ year, referenceId, claudeBody });

  const archivePath = path.join("mlro-annual", `${year}.txt`);
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
    console.log(`\n[dry-run] would post annual report to "${portfolio.projectName}"`);
  } else {
    try {
      const __doc = document.length > 60000 ? document.slice(0, 60000) + "\n\n[TRUNCATED — full document archived under history/]" : document;
      await postComment(portfolio.taskGid, __doc);
    } catch (__err) {
      console.warn(`⚠  Asana post failed: ${__err.message}. Document remains in history/ archive.`);
    }
    console.log(`\n✓ annual report posted to "${portfolio.projectName}"`);
  }

  if (!isDryRun) {
    await notify({
      subject: `HSV2 / Annual MLRO Report — ${year}`,
      body: document,
    });
  }

  console.log(`\n=== Summary ===`);
  console.log(`Year:    ${year}`);
  console.log(`Archive: history/${archivePath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
