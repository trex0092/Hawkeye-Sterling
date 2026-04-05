/**
 * Weekly Filings Summary.
 *
 * Runs every Friday at 17:30 Asia/Dubai (13:30 UTC), after the daily
 * retro and the weekly MLRO report have landed. Walks the week's
 * history/filings/YYYY-MM-DD/ folders, counts every filing draft
 * produced during the week by type (STR, SAR, DPMSR, PNMR, FFR),
 * extracts the filing status line, and assembles a short formal
 * summary for the MLRO.
 *
 * Archived to history/weekly-filings/YYYY-Www.txt and posted to the
 * SCREENINGS pinned task. No Claude call unless the archive contains
 * at least one draft; an empty week produces a simple "no filings"
 * one-page summary programmatically.
 */

import Anthropic from "@anthropic-ai/sdk";
import { notify } from "./notify.mjs";
import {
  SYSTEM_PROMPT,
  STYLE_REMINDER,
  CONFIRMED_REFERENCES,
  validateOutput,
} from "./regulatory-context.mjs";
import { writeWeeklyPatternReport, writeHistory, isoDate, isoWeek } from "./history-writer.mjs";
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
  WEEKLY_WINDOW_DAYS = "7",
} = process.env;

const windowDays = Number.parseInt(WEEKLY_WINDOW_DAYS, 10);

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
  if (!res.ok) {
    throw new Error(`Asana ${res.status} ${res.statusText} on ${reqPath}`);
  }
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

/* ─── Filings archive walker ────────────────────────────────────────────── */

async function collectFilingsInWindow(startDate, endDate) {
  const historyRoot = path.resolve(process.cwd(), "..", "history", "filings");
  const collected = { STR: [], SAR: [], DPMSR: [], PNMR: [], FFR: [] };
  try {
    const dayDirs = await readdir(historyRoot);
    for (const dayDir of dayDirs.sort()) {
      if (dayDir < startDate || dayDir > endDate) continue;
      const dayPath = path.join(historyRoot, dayDir);
      let files;
      try {
        files = await readdir(dayPath);
      } catch {
        continue;
      }
      for (const file of files) {
        // Expect names like HSV2-STR-YYYYMMDD-NNNN.txt
        const m = file.match(/^HSV2-(STR|SAR|DPMSR|PNMR|FFR)-/);
        if (!m) continue;
        const content = await readFile(path.join(dayPath, file), "utf8");
        const firstLines = content.split("\n").slice(0, 40).join("\n");
        collected[m[1]].push({ file: `${dayDir}/${file}`, excerpt: firstLines.slice(0, 1200) });
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`filings read error: ${err.message}`);
  }
  return collected;
}

function computeStartDate(endDate, days) {
  const d = new Date(endDate);
  d.setUTCDate(d.getUTCDate() - days + 1);
  return d.toISOString().slice(0, 10);
}

/* ─── Claude ────────────────────────────────────────────────────────────── */

async function callClaude(prompt, label) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
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

function buildPrompt({ weekId, startDate, endDate, counts, collected }) {
  const hasAny = Object.values(counts).some((n) => n > 0);
  const excerpts = Object.entries(collected)
    .filter(([_, arr]) => arr.length > 0)
    .map(([type, arr]) => {
      const sample = arr.slice(0, 3).map((e) => `### ${e.file}\n${e.excerpt}`).join("\n\n");
      return `== ${type} ==\n${sample}`;
    })
    .join("\n\n");

  if (!hasAny) {
    return `TASK. Draft sections 1 to 3 of a Weekly Filings Summary for ${CONFIRMED_REFERENCES.entity.legalName} for the week ${weekId} (${startDate} to ${endDate}). No filing drafts are present in the archive for this week. The document control block and sign-off are programmatic.

OUTPUT FORMAT.

1. PURPOSE
One paragraph stating that this is the weekly filings summary for week ${weekId}.

2. FILINGS PRODUCED THIS WEEK
One sentence stating that no filing drafts were produced by the automation during the week, and one paragraph explaining that the absence of drafts is not in itself an issue, because the automation only drafts when the detector flags a candidate and the filing-mode configuration permits it.

3. MLRO REVIEW POINTS
One short paragraph suggesting that the MLRO use this quiet-week note as an opportunity to verify that the detector is active across all six programmes and that filing-mode.json reflects her current intent.

${STYLE_REMINDER}`;
  }

  return `TASK. Draft the analytical body of the Weekly Filings Summary for ${CONFIRMED_REFERENCES.entity.legalName} for the week ${weekId} (${startDate} to ${endDate}). The document control block and sign-off are programmatic.

CONTEXT COUNTS:
- Suspicious Transaction Report drafts:                  ${counts.STR}
- Suspicious Activity Report drafts:                     ${counts.SAR}
- Dealers in Precious Metals and Stones Report drafts:   ${counts.DPMSR}
- Partial Name Match Report drafts:                      ${counts.PNMR}
- Funds Freeze Report drafts:                            ${counts.FFR}
- Total drafts produced:                                 ${Object.values(counts).reduce((a,b)=>a+b,0)}

INPUT. Up to three excerpts per filing type from the drafts produced during the week (first ~1.2 KB each):
${excerpts}

OUTPUT FORMAT. Emit sections 1 to 5 in this exact order with ALL CAPS labels.

1. PURPOSE
One paragraph stating this is the weekly filings summary for week ${weekId}.

2. FILINGS PRODUCED THIS WEEK (BY TYPE)
A short list of the five filing types with counts, and one short narrative paragraph describing the overall character of the week's filings (volume compared with typical weeks if visible, any concentration, any cross-entity pattern).

3. NOTABLE DRAFTS
Two to five numbered paragraphs, each highlighting one specific draft that warrants the MLRO's attention first on Monday morning. For each draft state the filing type, the source programme and task, and the single most important finding.

4. REMINDER ON FILING MODE
One short paragraph confirming that every draft is a draft, none has been filed, and the MLRO files manually through goAML.

5. RECOMMENDED NEXT STEPS FOR THE MLRO
Three to five numbered paragraphs each ending with an imperative sentence.

${STYLE_REMINDER}`;
}

function buildDocument({ weekId, startDate, endDate, counts, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;
  const today = isoDate();
  const total = Object.values(counts).reduce((a,b)=>a+b,0);

  return `=============================================================================
${entity.legalName.toUpperCase()}
WEEKLY FILINGS SUMMARY
Week ${weekId}, ending ${today}
=============================================================================

Document reference:   ${referenceId}
Classification:       Confidential. For MLRO review only.
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Prepared on:          ${today}, 17:30 Asia/Dubai
Addressee:            ${mlro.name}, ${mlro.title}
Coverage:             ${startDate} to ${endDate} inclusive, ${total} draft${total === 1 ? "" : "s"} produced
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

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const today = isoDate();
  const weekId = isoWeek();
  const startDate = computeStartDate(today, windowDays);
  const endDate = today;

  console.log(`▶  Weekly Filings Summary — ${new Date().toISOString()}`);
  console.log(`   week: ${weekId} (${startDate} to ${endDate})`);
  if (isDryRun) console.log("   DRY RUN");

  const collected = await collectFilingsInWindow(startDate, endDate);
  const counts = {
    STR: collected.STR.length,
    SAR: collected.SAR.length,
    DPMSR: collected.DPMSR.length,
    PNMR: collected.PNMR.length,
    FFR: collected.FFR.length,
  };
  console.log(`\nCounts: ${JSON.stringify(counts)}`);

  const claudeBody = await callClaude(
    buildPrompt({ weekId, startDate, endDate, counts, collected }),
    "weekly-filings",
  );

  const referenceId = `HSV2-WFS-${weekId}`;
  const document = buildDocument({ weekId, startDate, endDate, counts, referenceId, claudeBody });

  try {
    await writeHistory(path.join("weekly-filings", `${weekId}.txt`), document);
    console.log(`✓ archived to history/weekly-filings/${weekId}.txt`);
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
    await postComment(portfolio.taskGid, document);
    console.log(`\n✓ posted to "${portfolio.projectName}"`);
  }

  if (!isDryRun) {
    await notify({
      subject: `HSV2 / Weekly Filings Summary — ${weekId}`,
      body: document,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
