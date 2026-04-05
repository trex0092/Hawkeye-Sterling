/**
 * Weekly MLRO Report to Senior Management.
 *
 * Runs every Friday at 17:00 Asia/Dubai (13:00 UTC), after the daily retro
 * has recorded the final numbers for the week. Produces the formal weekly
 * report issued in the name of the Money Laundering Reporting Officer to
 * the Senior Management of [Reporting Entity]. The document mirrors the
 * structure of samples/weekly/02-mlro-report-to-senior-management.txt.
 *
 * The report is:
 *   - drafted by the compliance function using data from the current
 *     week's Asana activity and the week's archived artefacts under
 *     history/daily/ and history/retro/;
 *   - archived to history/mlro-weekly/YYYY-Www.txt for the 10-year
 *     retention obligation under Federal Decree-Law No. 10 of 2025;
 *   - posted to the pinned Today's Priorities task inside the
 *     PORTFOLIO_PROJECT_NAME project (default SCREENINGS) so the MLRO
 *     can send it to Senior Management on Friday afternoon.
 *
 * The automation never signs in place of the MLRO. The document ends
 * with a declaration and signature block that the MLRO completes
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
import { isoDate, isoWeek, writeWeeklyMlroReport } from "./history-writer.mjs";
import { readFile, readdir, stat } from "node:fs/promises";
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

/* ─── Asana client ──────────────────────────────────────────────────────── */

async function asana(path, init = {}) {
  const res = await fetch(`https://app.asana.com/api/1.0${path}`, {
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
    throw new Error(`Asana ${res.status} ${res.statusText} on ${path}: ${body}`);
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

async function listProjectTasks(projectGid, modifiedSinceIso) {
  const params = new URLSearchParams({
    project: projectGid,
    modified_since: modifiedSinceIso,
    limit: "100",
    opt_fields:
      "gid,name,completed,completed_at,due_on,due_at,modified_at,created_at,assignee.name",
  });
  const all = [];
  let offset;
  do {
    if (offset) params.set("offset", offset);
    const page = await asana(`/tasks?${params}`);
    all.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset);
  return all;
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

/* ─── Archive readers for the week's history ────────────────────────────── */

async function collectWeekArchive(today) {
  const historyRoot = path.resolve(process.cwd(), "..", "history");
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const retroSummaries = [];
  const portfolioDigests = [];

  // Retro files
  try {
    const retroDir = path.join(historyRoot, "retro");
    const files = await readdir(retroDir);
    for (const file of files.sort()) {
      if (!file.endsWith(".txt")) continue;
      const dateStr = file.replace(".txt", "");
      if (Date.parse(dateStr) < windowStart.getTime()) continue;
      const content = await readFile(path.join(retroDir, file), "utf8");
      retroSummaries.push({ date: dateStr, content: content.slice(0, 2000) });
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`retro archive read error: ${err.message}`);
  }

  // Portfolio digest files
  try {
    const dailyDir = path.join(historyRoot, "daily");
    const dayDirs = await readdir(dailyDir);
    for (const dayDir of dayDirs.sort()) {
      if (Date.parse(dayDir) < windowStart.getTime()) continue;
      const portfolioPath = path.join(dailyDir, dayDir, "portfolio-digest.txt");
      try {
        const content = await readFile(portfolioPath, "utf8");
        portfolioDigests.push({ date: dayDir, content: content.slice(0, 2000) });
      } catch { /* no digest that day */ }
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`daily archive read error: ${err.message}`);
  }

  return { retroSummaries, portfolioDigests };
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

function buildMlroPrompt(today, weekId, stats, activity, archive) {
  const perProjectBlock = activity.map((p) => {
    return `### ${p.projectName}\n  touched: ${p.touched}\n  completed: ${p.completed}\n  top closed items this week: ${p.sampleCompleted.join("; ") || "none visible"}`;
  }).join("\n\n");

  const digestBlock = archive.portfolioDigests.length === 0
    ? "No daily portfolio digests were found in the archive for this week. Work from the Asana activity alone."
    : archive.portfolioDigests.map((d) => `### ${d.date}\n${d.content}`).join("\n\n");

  const retroBlock = archive.retroSummaries.length === 0
    ? "No daily retros were found in the archive for this week."
    : archive.retroSummaries.map((r) => `### ${r.date}\n${r.content}`).join("\n\n");

  return `TASK. You are drafting the analytical body of the Weekly MLRO Report to Senior Management for ${CONFIRMED_REFERENCES.entity.legalName}. The document is issued in the name of the MLRO, ${CONFIRMED_REFERENCES.mlro.name}, and is addressed to Senior Management. The document control block, the final MLRO declaration and the signature block are generated programmatically and appended to your response.

You are responsible for sections 1 to 9 below, in the exact order shown, using ALL CAPS section labels on their own line. You must write in the voice of the MLRO speaking to Senior Management in the first person plural ("we") where appropriate, and in the first person singular ("I", "in my view", "I confirm") for the judgement and declaration content.

CONTEXT NUMBERS (use these verbatim where referenced):
- Week identifier: ${weekId}
- Week ending: ${today}
- Programmes reviewed: ${stats.projectCount}
- Tasks touched across all programmes this week: ${stats.touched}
- Tasks completed across all programmes this week: ${stats.completed}

INPUT A. PER-PROJECT ACTIVITY FOR THIS WEEK
${perProjectBlock}

INPUT B. DAILY PORTFOLIO DIGESTS FROM THIS WEEK (first 2 KB each)
${digestBlock}

INPUT C. DAILY COMPLETION RETROS FROM THIS WEEK (first 2 KB each)
${retroBlock}

OUTPUT FORMAT. Emit sections 1 to 9 below in order. Continuous prose. ALL CAPS section labels. No markdown hash headers.

1. PURPOSE AND STANDING OF THIS REPORT

One paragraph stating that this is the weekly report of the Money Laundering Reporting Officer to Senior Management for the week ending ${today}, that it is issued under Federal Decree-Law No. 10 of 2025 and is an internal report retained for 10 years.

2. HEADLINE OF THE WEEK

Two to three short sentences. State the single most material risk event of the week and what the MLRO is asking Senior Management to note.

3. FILINGS MADE THROUGH THE GOAML PLATFORM THIS WEEK

One short introduction paragraph, then a clean list of the five filing types (Suspicious Transaction Reports, Suspicious Activity Reports, Dealers in Precious Metals and Stones Reports, Partial Name Match Reports, Funds Freeze Reports) each with a count for the week, followed by one paragraph of narrative on the nature of the filings if the data supports it.

4. MATTERS UNDER REVIEW BY THE MLRO AT WEEK-END

Three to six short lettered paragraphs identifying specific items still open on the MLRO's personal review queue at the close of the week, with the programme name, the task name, and the current status.

5. SANCTIONS SCREENING ACTIVITY

One paragraph reporting the number of screening queries performed this week if visible in the data, the number of hits returned, the number cleared as false positives, and the number still under review. If the data is incomplete state so.

6. PEP POPULATION AND ENHANCED DUE DILIGENCE

One paragraph on the current PEP population size, any new PEPs identified this week, any PEPs moved out of the population, and confirmation that all current PEPs carry MLRO authorisation to continue. If the data is incomplete, state so.

7. TRAINING AND COMPETENCE

One short paragraph on any training delivered or due this week.

8. RISK ASSESSMENT AND PROGRAMME HEALTH

One paragraph stating the MLRO's view of the programme's health for the week, expressed in the first person singular, and explicitly confirming that the MLRO has the resources and authority needed to discharge the function.

9. RECOMMENDATIONS TO SENIOR MANAGEMENT

Three numbered paragraphs. Each paragraph names a specific matter for Senior Management to note and ends with one imperative sentence. Write in the first person singular as the MLRO addressing Senior Management directly.

${STYLE_REMINDER}`;
}

function buildMlroDocument({
  today,
  weekId,
  referenceId,
  claudeBody,
}) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;

  return `=============================================================================
${entity.legalName.toUpperCase()}
WEEKLY REPORT OF THE MONEY LAUNDERING REPORTING OFFICER
Week ${weekId}, ending ${today}
=============================================================================

Document reference:   ${referenceId}
Classification:       Confidential. For Senior Management only.
Version:              1.0
From:                 ${mlro.name}, ${mlro.title}
To:                   Senior Management, ${entity.legalName}
Issued on:            ${today}, 17:00 Asia/Dubai
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

${claudeBody}

-----------------------------------------------------------------------------
10. DECLARATION OF THE MONEY LAUNDERING REPORTING OFFICER
-----------------------------------------------------------------------------

I, ${mlro.name}, in my capacity as Money Laundering Reporting Officer of
${entity.legalName}, confirm that the contents of this report are true
and complete to the best of my knowledge and belief as at the date of
issue. I further confirm that I have, during the week covered by this
report, discharged my function in accordance with the applicable
provisions of Federal Decree-Law No. 10 of 2025 and the firm's internal
AML and CFT programme.

-----------------------------------------------------------------------------
11. DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Issued by:     ${mlro.name}, Money Laundering Reporting Officer
Signature:     __________________________
Date:          __________________________
Acknowledged:  __________________________ (Senior Management)
Date:          __________________________

[End of document]`;
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const today = isoDate();
  const weekId = isoWeek();
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  console.log(`▶  Weekly MLRO Report — ${new Date().toISOString()}`);
  console.log(`   week: ${weekId}, ending ${today}`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  console.log(`   window: last ${windowDays} days (since ${sinceIso})`);
  if (isDryRun) console.log("   DRY RUN — no comment will be posted");

  const projects = await listProjects();
  console.log(`\nFound ${projects.length} active projects.`);

  const activity = [];
  let touched = 0;
  let completed = 0;

  for (const project of projects) {
    console.log(`\n• ${project.name}`);
    try {
      const tasks = await listProjectTasks(project.gid, sinceIso);
      const completedThisWeek = tasks.filter((t) => t.completed);
      activity.push({
        projectName: project.name,
        touched: tasks.length,
        completed: completedThisWeek.length,
        sampleCompleted: completedThisWeek.slice(0, 5).map((t) => t.name),
      });
      touched += tasks.length;
      completed += completedThisWeek.length;
      console.log(`    touched ${tasks.length}, completed ${completedThisWeek.length}`);
    } catch (err) {
      console.error(`    ✗ error: ${err?.message ?? err}`);
      activity.push({
        projectName: project.name,
        touched: 0,
        completed: 0,
        sampleCompleted: [],
      });
    }
  }

  const archive = await collectWeekArchive(today);
  console.log(`\nArchive contents: ${archive.portfolioDigests.length} portfolio digests, ${archive.retroSummaries.length} retros`);

  const stats = { projectCount: projects.length, touched, completed };

  console.log(`\nGenerating Weekly MLRO Report…`);
  const claudeBody = await callClaude(
    buildMlroPrompt(today, weekId, stats, activity, archive),
    "mlro-weekly",
  );

  const referenceId = `HSV2-MLRO-WR-${weekId}`;
  const document = buildMlroDocument({ today, weekId, referenceId, claudeBody });

  try {
    await writeWeeklyMlroReport(weekId, document);
    console.log(`✓ archived to history/mlro-weekly/${weekId}.txt`);
  } catch (archiveErr) {
    console.warn(`⚠  failed to archive: ${archiveErr.message}`);
  }

  const portfolio = await findPortfolioPinned(projects);
  if (!portfolio) {
    console.log(`\n⚠  no "${PINNED_TASK_NAME}" task found in a project matching "${PORTFOLIO_PROJECT_NAME}" — report not posted to Asana, archive only`);
  } else if (isDryRun) {
    console.log(`\n[dry-run] would post MLRO report to "${portfolio.projectName}"`);
  } else {
    try {
      const __doc = document.length > 60000 ? document.slice(0, 60000) + "\n\n[TRUNCATED — full document archived under history/]" : document;
      await postComment(portfolio.taskGid, __doc);
    } catch (__err) {
      console.warn(`⚠  Asana post failed: ${__err.message}. Document remains in history/ archive.`);
    }
    console.log(`\n✓ MLRO report posted to "${portfolio.projectName}" pinned task`);
  }

  if (!isDryRun) {
    await notify({
      subject: `${ARTEFACT_PREFIXES.mlroMonthly.replace("Monthly", "Weekly")} — ${weekId}`,
      body: document,
    });
  }

  console.log(`\n=== Summary ===`);
  console.log(`Week:     ${weekId} (ending ${today})`);
  console.log(`Touched:  ${touched}`);
  console.log(`Completed: ${completed}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
