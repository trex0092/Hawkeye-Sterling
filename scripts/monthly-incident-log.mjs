/**
 * Monthly Incident Log.
 *
 * Runs on the first business day of each month at 09:30 Asia/Dubai
 * (05:30 UTC), 30 minutes after the monthly MLRO report. Walks the
 * previous month's daily retro archive, monthly MLRO report and
 * filings archive for any reportable incident, exception or
 * corrective action, and assembles a formal monthly incident log
 * in the HSV2 register.
 *
 * An incident, in the sense used here, covers:
 *   - refused transactions
 *   - declined onboardings
 *   - compliance exceptions (e.g. cash transaction escalated outside
 *     the standard procedure)
 *   - screening engine failures
 *   - policy breaches identified by the compliance function
 *   - corrective actions recorded during the month
 *
 * The log is retained for 10 years under Federal Decree-Law No. 10 of
 * 2025 and is one of the first artefacts an MOE inspector asks for
 * during a supervisory visit.
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
  TARGET_MONTH = "", // format YYYY-MM, optional override
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

function targetMonth() {
  if (TARGET_MONTH) {
    const m = TARGET_MONTH.match(/^(\d{4})-(\d{2})$/);
    if (!m) throw new Error(`Invalid TARGET_MONTH: ${TARGET_MONTH}`);
    return { year: Number.parseInt(m[1], 10), month: Number.parseInt(m[2], 10), label: TARGET_MONTH };
  }
  const now = new Date();
  const firstOfThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastOfPrev = new Date(firstOfThis.getTime() - 24 * 60 * 60 * 1000);
  const year = lastOfPrev.getUTCFullYear();
  const month = lastOfPrev.getUTCMonth() + 1;
  return { year, month, label: `${year}-${String(month).padStart(2, "0")}` };
}

function monthRange({ year, month }) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}

async function readFilesInRange(dir, startIso, endIso, maxChars = 1500) {
  const out = [];
  try {
    const files = await readdir(dir);
    for (const file of files.sort()) {
      const match = file.match(/(\d{4}-\d{2}-\d{2})/);
      if (!match) continue;
      if (match[1] < startIso || match[1] > endIso) continue;
      const content = await readFile(path.join(dir, file), "utf8");
      out.push({ file, content: content.slice(0, maxChars) });
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`read error ${dir}: ${err.message}`);
  }
  return out;
}

async function readMonthlyMlro(dir, label) {
  try {
    const content = await readFile(path.join(dir, `${label}.txt`), "utf8");
    return content.slice(0, 4000);
  } catch {
    return null;
  }
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

function buildPrompt({ label, startIso, endIso, retros, mlroMonthly, filingsCount }) {
  const retroBlock = retros.length === 0
    ? "No daily retros were found in the archive for this month."
    : retros.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");
  const monthlyBlock = mlroMonthly
    ? mlroMonthly
    : "No monthly MLRO report was found for this month.";

  return `TASK. Draft the analytical body of the Monthly Incident Log for ${CONFIRMED_REFERENCES.entity.legalName} for ${label} (${startIso} to ${endIso}). The document control block and sign-off are programmatic.

For this document, "incident" means any of the following observed during the month: a refused transaction, a declined onboarding, a compliance exception (for example a cash transaction escalated outside standard procedure), a screening engine failure, a policy breach, or a corrective action recorded by the compliance function. A successful goAML filing is not an incident; it is a normal output.

INPUT A. DAILY RETROS FOR ${label}
${retroBlock}

INPUT B. MONTHLY MLRO CONSOLIDATION FOR ${label}
${monthlyBlock}

INPUT C. FILING DRAFTS PRODUCED DURING THE MONTH: ${filingsCount}

OUTPUT FORMAT. Emit sections 1 to 6 in this exact order with ALL CAPS labels.

1. PURPOSE
One paragraph stating this is the monthly incident log for ${label}, prepared under the firm's internal incident management procedure and retained for 10 years.

2. HEADLINE FOR THE MONTH
Two to three short sentences summarising the nature and severity of incidents observed during the month. If none, state so explicitly.

3. INCIDENT ENTRIES
Lettered paragraphs (a, b, c, ...) one per identified incident. For each incident state: date observed, programme affected (or "portfolio-wide"), incident category, short factual description, the corrective action taken, and the status at month-end (open, closed, under review). If no incident was identified in the inputs, emit one paragraph stating that and explaining that the automation walked the daily retros and the monthly MLRO report for keywords such as refused, declined, exception, breach, corrective action, and failure.

4. TRENDS AND PATTERNS
One or two short paragraphs identifying any pattern across incidents (same root cause, same programme, same category). If no pattern is visible, state so.

5. RECOMMENDED FOLLOW-UP
Three to five numbered paragraphs each ending with an imperative sentence. At minimum include one follow-up on each open incident.

6. LIMITATIONS
One paragraph stating the inputs the automation walked and any gap the MLRO should fill in from the firm's internal incident log.

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
MONTHLY INCIDENT LOG
Month ${label}
=============================================================================

Document reference:   HSV2-INC-${label}
Classification:       Confidential. For MLRO review only.
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Prepared on:          ${today}, 09:30 Asia/Dubai
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
  const target = targetMonth();
  const range = monthRange(target);
  console.log(`▶  Monthly Incident Log — ${new Date().toISOString()}`);
  console.log(`   month: ${target.label} (${range.startIso} to ${range.endIso})`);
  if (isDryRun) console.log("   DRY RUN");

  const historyRoot = path.resolve(process.cwd(), "..", "history");
  const retros = await readFilesInRange(path.join(historyRoot, "retro"), range.startIso, range.endIso, 1500);
  const mlroMonthly = await readMonthlyMlro(path.join(historyRoot, "mlro-monthly"), target.label);
  const filings = await readFilesInRange(path.join(historyRoot, "filings"), range.startIso, range.endIso, 100);
  console.log(`\nArchive: ${retros.length} retros, monthly MLRO ${mlroMonthly ? "present" : "absent"}, ${filings.length} filing references`);

  const claudeBody = await callClaude(
    buildPrompt({ label: target.label, startIso: range.startIso, endIso: range.endIso, retros, mlroMonthly, filingsCount: filings.length }),
    "monthly-incident",
  );

  const referenceId = `HSV2-INC-${target.label}`;
  const document = buildDocument({ label: target.label, referenceId, claudeBody });

  try {
    await writeHistory(path.join("monthly-incidents", `${target.label}.txt`), document);
    console.log(`✓ archived to history/monthly-incidents/${target.label}.txt`);
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
      subject: `HSV2 / Monthly Incident Log — ${target.label}`,
      body: document,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
