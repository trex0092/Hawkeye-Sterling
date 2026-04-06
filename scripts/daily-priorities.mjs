/**
 * Daily Asana Priorities — powered by Claude.
 *
 * For every Asana project the token can see (optionally filtered to one team),
 * fetches incomplete tasks, asks Claude to pick the top-10 priorities, and
 * posts the result as a comment on a pinned task named `📌 Today's Priorities`
 * inside that project. Projects without that task are skipped, so the pinned
 * task acts as an opt-in list.
 *
 * After the per-project run, the script also generates a cross-entity
 * "portfolio digest" (top 5 across everything) and posts it as a single
 * comment on the pinned task inside the project configured by
 * `PORTFOLIO_PROJECT_NAME` (default: SCREENINGS).
 *
 * Run manually:
 *   ASANA_TOKEN=... ANTHROPIC_API_KEY=... ASANA_WORKSPACE_ID=... \
 *     node scripts/daily-priorities.mjs
 *
 * Or on a cron via the GitHub Action at
 * `.github/workflows/daily-priorities.yml`.
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
import {
  isoDate,
  writeDailyPerProject,
  writeDailyPortfolio,
} from "./history-writer.mjs";
import { upsertFromTasks } from "./counterparty-register.mjs";
import { detectAndDraft } from "./filing-drafts.mjs";

const {
  ASANA_TOKEN,
  ANTHROPIC_API_KEY,
  ASANA_WORKSPACE_ID,
  ASANA_TEAM_ID, // optional — scopes the project list to a single team
  CLAUDE_MODEL = "claude-haiku-4-5",
  PINNED_TASK_NAME = "📌 Today's Priorities",
  PORTFOLIO_PROJECT_NAME = "SCREENINGS",
  DRY_RUN = "false", // set to "true" to skip posting comments
  MAX_TASKS_PER_PROJECT = "75", // cap sent to Claude; keeps prompts under Tier-1 rate limits
  NOTES_SNIPPET_LENGTH = "80",
  PROJECT_DELAY_MS = "30000", // 30s between projects — Tier-1 is 30k input tokens/minute
  AT_RISK_DAYS = "3", // "due within N business days" counts as at-risk
} = process.env;

const maxTasksPerProject = Number.parseInt(MAX_TASKS_PER_PROJECT, 10);
const notesSnippetLength = Number.parseInt(NOTES_SNIPPET_LENGTH, 10);
const projectDelayMs = Number.parseInt(PROJECT_DELAY_MS, 10);
const atRiskDays = Number.parseInt(AT_RISK_DAYS, 10);

const REQUIRED = { ASANA_TOKEN, ANTHROPIC_API_KEY, ASANA_WORKSPACE_ID };
for (const [name, value] of Object.entries(REQUIRED)) {
  if (!value) {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(1);
  }
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const isDryRun = DRY_RUN === "true";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Short project slug for document references (first 3 alphanumerics). */
function slugifyShort(input) {
  return String(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

/**
 * Heuristic extraction of counterparty candidates from an Asana task. Looks
 * for trading-name patterns (LLC, FZ LLC, DMCC, Trading, Bullion, Metals,
 * etc.) in the task name and the first 500 characters of the notes. This
 * is intentionally conservative; the MLRO can edit the register by hand
 * after review. The compliance function never invents a counterparty name
 * that is not literally present in the input.
 */
const COUNTERPARTY_PATTERNS = [
  /[A-Z][A-Za-z&.\- ]{2,}?\s+(?:FZ\s*LLC|FZE|DMCC|LLC|LLP|Ltd\.?|Limited|Trading|Bullion|Metals|Jewellery|Jewelry)\b/g,
];
const TYPOLOGY_KEYWORDS = [
  ["sanctions", ["sanctioned", "UNSC", "Local Terrorist", "sanction"]],
  ["recycled gold", ["recycled gold", "recycling", "scrap"]],
  ["cash intensity", ["high cash", "cash intensity", "cash purchase"]],
  ["PEP", ["PEP", "politically exposed", "political office"]],
  ["cross-border", ["cross-border", "cross border", "smuggling", "trade-based"]],
  ["structuring", ["structuring", "linked transaction", "aggregation"]],
  ["CDD exemption", ["CDD exemption", "cdd avoidance"]],
  ["hawala", ["hawala"]],
];

function extractCounterpartiesFromTask(task) {
  const text = `${task.name ?? ""}\n${(task.notes ?? "").slice(0, 600)}`;
  const names = new Set();
  for (const pattern of COUNTERPARTY_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const m of matches) {
      const name = m[0].trim();
      if (name.length >= 6 && name.length <= 120) names.add(name);
    }
  }
  const typologies = new Set();
  const lower = text.toLowerCase();
  for (const [label, keywords] of TYPOLOGY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) typologies.add(label);
  }
  return {
    names: [...names],
    typologies: [...typologies],
  };
}

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

async function listIncompleteTasks(projectGid) {
  const params = new URLSearchParams({
    project: projectGid,
    completed_since: "now",
    limit: "100",
    opt_fields:
      "gid,name,notes,due_on,due_at,completed,modified_at,created_at,assignee.name,permalink_url,tags.name",
  });

  const all = [];
  let offset;
  do {
    if (offset) params.set("offset", offset);
    const page = await asana(`/tasks?${params}`);
    all.push(...page.data.filter((t) => !t.completed));
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

/* ─── Task selection and risk scoring ───────────────────────────────────── */

/**
 * Pick the most relevant tasks when a project has too many.
 * Priority:
 *   1. Tasks that are at-risk (overdue / due within N days) come first
 *   2. Then tasks with any due date, most recently modified first
 *   3. Then everything else, most recently modified first
 *   4. Cap at MAX_TASKS_PER_PROJECT
 */
function selectCandidateTasks(tasks) {
  const atRisk = [];
  const withDue = [];
  const withoutDue = [];
  for (const t of tasks) {
    if (isAtRisk(t)) atRisk.push(t);
    else if (t.due_on || t.due_at) withDue.push(t);
    else withoutDue.push(t);
  }
  const byModifiedDesc = (a, b) =>
    (b.modified_at || b.created_at || "").localeCompare(
      a.modified_at || a.created_at || "",
    );
  atRisk.sort(byModifiedDesc);
  withDue.sort(byModifiedDesc);
  withoutDue.sort(byModifiedDesc);
  return [...atRisk, ...withDue, ...withoutDue].slice(0, maxTasksPerProject);
}

/** True if the task is overdue or due within AT_RISK_DAYS business days. */
function isAtRisk(task) {
  const due = task.due_on || (task.due_at ? task.due_at.slice(0, 10) : null);
  if (!due) return false;
  const dueMs = Date.parse(`${due}T23:59:59Z`);
  if (Number.isNaN(dueMs)) return false;
  const now = Date.now();
  if (dueMs < now) return true; // overdue
  const daysAhead = (dueMs - now) / (1000 * 60 * 60 * 24);
  return daysAhead <= atRiskDays;
}

function formatAtRiskSection(tasks) {
  const risky = tasks.filter(isAtRisk);
  if (risky.length === 0) return "";
  const lines = risky
    .sort((a, b) => {
      const da = a.due_on || a.due_at || "";
      const db = b.due_on || b.due_at || "";
      return da.localeCompare(db);
    })
    .slice(0, 10)
    .map((t) => {
      const due = t.due_on || (t.due_at ? t.due_at.slice(0, 10) : "?");
      const overdue =
        Date.parse(`${due}T23:59:59Z`) < Date.now() ? " (OVERDUE)" : "";
      const link = t.permalink_url ? ` — ${t.permalink_url}` : "";
      return `• ${t.name} — due ${due}${overdue}${link}`;
    });
  return `⚠️ AT RISK (${risky.length} task${risky.length === 1 ? "" : "s"} overdue or due within ${atRiskDays} day${atRiskDays === 1 ? "" : "s"}):\n${lines.join("\n")}\n\n`;
}

/* ─── Claude prompting ──────────────────────────────────────────────────── */

function buildDailyPrompt(projectName, tasks, stats) {
  const lines = tasks.map((t, i) => {
    const parts = [`${i + 1}. ${t.name}`];
    parts.push(`id:${t.gid}`);
    if (t.due_on || t.due_at) {
      const due = t.due_on || t.due_at.slice(0, 10);
      parts.push(`due:${due}${isAtRisk(t) ? " (AT RISK)" : ""}`);
    }
    if (t.assignee?.name) parts.push(`assignee:${t.assignee.name}`);
    if (t.notes) {
      const snippet = t.notes.replace(/\s+/g, " ").slice(0, notesSnippetLength);
      parts.push(`notes: ${snippet}`);
    }
    return parts.join(" — ");
  });

  return `TASK. You are drafting the analytical body of the Daily Compliance Priorities memo for the Asana project "${projectName}" within the [Reporting Entity] programme. The document control block, the purpose note, the at-risk section and the sign-off block are generated programmatically and appended to your response. You are responsible for sections 3 and 4 only, using the exact labels and format below.

CONTEXT NUMBERS (use these verbatim where referenced):
- Total open tasks in the programme today: ${stats.totalOpen}
- Candidate tasks reviewed in detail: ${stats.candidates}
- Tasks currently at risk (overdue or due within ${atRiskDays} days): ${stats.atRiskCount}

INPUT. Below is the curated candidate list. Each line shows the task, a stable id, an optional due date, an optional assignee and a truncated notes snippet.

=== PROJECT TASKS ===
${lines.join("\n")}

OUTPUT FORMAT. Emit the two sections below and nothing else. Do not repeat the document control block. Do not repeat the at-risk section. Do not add a sign-off line. Use ALL CAPS section labels followed by a blank line, then continuous prose where the content justifies prose, and a numbered list for the ten items in section 3.

3. TOP TEN ITEMS FOR TODAY

For each of the top ten items, write one numbered paragraph with:
- the task name verbatim as it appears in the input,
- a risk score from 0 to 100 on the compliance function's internal scale (90-100 immediate regulatory risk, 70-89 high risk, 50-69 moderate, 30-49 routine, 0-29 informational),
- two to four sentences of analysis in the formal UAE compliance register explaining the basis for the score and the specific regulatory hook if any,
- a single imperative next action on its own sentence at the end of the paragraph,
- the GID in square brackets at the very end of the paragraph in the form [id:GID], copied verbatim from the input.

Example of the expected shape (not the content):

Item 1. [Task name verbatim]. Risk score 94. Two to four sentences of analysis. Single imperative next action. [id:1234567890]

Return between three and ten items depending on how many are present in the input. If the input has fewer than three substantive items, return only what is substantive and explain in one sentence why the list is short.

4. RECOMMENDED DECISIONS FOR THE MLRO TODAY

Two to four short paragraphs identifying specific decisions the compliance function is asking the MLRO to take today. Each decision should reference the item number from section 3 that it concerns. End each paragraph with a single imperative sentence.

${STYLE_REMINDER}`;
}

function buildPortfolioPrompt(perProjectResults) {
  const blocks = perProjectResults.map(({ projectName, priorities }) => {
    return `ENTITY: ${projectName}\n${priorities}`;
  });

  return `TASK. You are drafting the analytical body of the Daily Portfolio Digest for ${CONFIRMED_REFERENCES.entity.legalName}. The document control block at the top and the sign-off block at the bottom are generated programmatically and appended to your response. You are responsible for sections 1 to 4 below, using the exact labels and order.

INPUT. Below are the per-entity top-ten lists produced earlier today by the compliance function, already in the formal register. Your job is to synthesise them into a single cross-entity view for the attention of the MLRO.

=== PER-ENTITY TOP TEN LISTS ===
${blocks.join("\n\n")}

OUTPUT FORMAT. Emit the four sections below and nothing else. Do not repeat the document control block. Do not add a sign-off. Use ALL CAPS section labels on their own line followed by a blank line, then continuous prose.

1. HEADLINE FOR TODAY

Two to three short sentences summarising the single most important risk theme across the portfolio today, and what the compliance function is asking the MLRO to do about it first.

2. THE FIVE PORTFOLIO PRIORITIES FOR TODAY

Five numbered paragraphs. Each paragraph names the entity, names the task, and explains in two to three sentences why the item deserves to appear in the portfolio top five, including any specific regulatory hook such as a sanctions nexus, a DPMSR trigger, a possible STR or SAR candidacy, or a PEP consideration.

3. CROSS-ENTITY PATTERNS OBSERVED TODAY

One to three short paragraphs describing patterns visible across two or more entities. A pattern may be a typology, a counterparty overlap, a jurisdiction concentration or a control-breakdown signal. If no cross-entity pattern is visible on today's data, state that explicitly in one sentence and move on.

4. RECOMMENDED ACTIONS FOR THE MLRO

Two to four short paragraphs listing the specific decisions the compliance function is asking the MLRO to take during the course of today. Each paragraph ends with a single imperative sentence.

${STYLE_REMINDER}`;
}

async function callClaude(prompt, label) {
  console.log(`      ${label} prompt size: ~${(prompt.length / 1024).toFixed(1)} KB`);

  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });

      const text = msg.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (!text) throw new Error("Claude returned an empty response");

      // Validate the response against the 0% AI-tells rules. Rejections are
      // treated as a transient failure and retried on the same prompt, which
      // usually clears the issue because the model regenerates.
      const check = validateOutput(text);
      if (!check.ok) {
        console.warn(
          `      attempt ${attempt}/4 produced a response that failed style validation:`,
        );
        for (const p of check.problems) console.warn(`        - ${p}`);
        if (attempt < 4) {
          await sleep(2000);
          continue;
        }
        // On the last attempt, accept the response anyway rather than fail
        // the whole run. The problems will be visible in the log for the
        // MLRO to act on.
      }
      return text;
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.response?.status;
      const detail = err?.error?.message ?? err?.message ?? String(err);
      console.warn(
        `      attempt ${attempt}/4 failed: ${detail}${status ? ` (status ${status})` : ""}`,
      );
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
      console.warn(`      retrying in ${Math.round(waitMs / 1000)}s…`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

/* ─── Comment formatting ────────────────────────────────────────────────── */

/**
 * After Claude returns its numbered list with [id:GID] annotations, rewrite
 * each line to include a direct Asana permalink to the task.
 */
function linkifyPriorities(claudeOutput, tasks) {
  const byGid = new Map(tasks.map((t) => [t.gid, t]));
  return claudeOutput
    .split("\n")
    .map((line) => {
      const match = line.match(/\[id:(\d+)\]/);
      if (!match) return line;
      const task = byGid.get(match[1]);
      if (!task?.permalink_url) return line.replace(/\s*\[id:\d+\]\s*$/, "");
      return line.replace(/\s*\[id:\d+\]\s*$/, ` → ${task.permalink_url}`);
    })
    .join("\n");
}

/**
 * Assemble the full formal Daily Compliance Priorities document for one
 * project. Sections 1, 2 and 5 are generated programmatically so the
 * document always has the correct document control block, the correct
 * at-risk section populated from real data, and the correct MLRO sign-off
 * line. Sections 3 and 4 are filled in by the Claude call, which returns
 * the analytical body only and never the scaffolding.
 */
function buildDailyDocument({
  today,
  projectName,
  referenceId,
  stats,
  atRiskTasks,
  linkedClaudeBody,
}) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;

  const atRiskBlock = atRiskTasks.length === 0
    ? `No tasks in this programme are currently overdue or due within the next ${atRiskDays} business days.\n`
    : atRiskTasks
        .sort((a, b) => (a.due_on || a.due_at || "").localeCompare(b.due_on || b.due_at || ""))
        .slice(0, 10)
        .map((t) => {
          const due = t.due_on || (t.due_at ? t.due_at.slice(0, 10) : "unspecified");
          const overdue = Date.parse(`${due}T23:59:59Z`) < Date.now() ? ", overdue" : "";
          const link = t.permalink_url ? `\n   ${t.permalink_url}` : "";
          return `- ${t.name}, due ${due}${overdue}.${link}`;
        })
        .join("\n");

  return `=============================================================================
${entity.legalName.toUpperCase()}
DAILY COMPLIANCE PRIORITIES
${projectName.toUpperCase()}
=============================================================================

Document reference:   ${referenceId}
Classification:       Confidential. For MLRO review only.
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Prepared on:          ${today}, 09:00 Asia/Dubai
Addressee:            ${mlro.name}, ${mlro.title}
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

-----------------------------------------------------------------------------
1. PURPOSE OF THIS NOTE
-----------------------------------------------------------------------------

This note sets out the compliance items in the ${projectName} programme that,
in the view of the compliance function, warrant the MLRO's attention today.
The selection is drawn from ${stats.totalOpen} open tasks on the programme
and ${stats.candidates} candidate tasks reviewed in detail. ${stats.atRiskCount === 0
  ? "No task is currently at risk on the basis of its due date."
  : `${stats.atRiskCount} task${stats.atRiskCount === 1 ? " is" : "s are"} currently at risk on the basis of the due date or the lack thereof.`}

-----------------------------------------------------------------------------
2. ITEMS AT RISK TODAY
-----------------------------------------------------------------------------

${atRiskBlock}

-----------------------------------------------------------------------------
${linkedClaudeBody}

-----------------------------------------------------------------------------
5. DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Prepared by:   Compliance function, ${entity.legalName}
Reviewed by:   [awaiting MLRO review]
Approved by:   [awaiting MLRO approval]

For review by the MLRO, ${mlro.name}.

[End of document]`;
}

function buildPortfolioDocument({
  today,
  referenceId,
  successCount,
  totalProjects,
  claudeBody,
}) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;

  return `=============================================================================
${entity.legalName.toUpperCase()}
DAILY PORTFOLIO DIGEST — ALL PROGRAMMES
=============================================================================

Document reference:   ${referenceId}
Classification:       Confidential. For MLRO review only.
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Prepared on:          ${today}, 09:15 Asia/Dubai
Addressee:            ${mlro.name}, ${mlro.title}
Coverage:             ${successCount} of ${totalProjects} programme entities.
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
  console.log(`▶  Daily Priorities — ${new Date().toISOString()}`);
  console.log(`   workspace: ${ASANA_WORKSPACE_ID}${ASANA_TEAM_ID ? `, team: ${ASANA_TEAM_ID}` : ""}`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  console.log(`   pinned task: "${PINNED_TASK_NAME}"`);
  console.log(`   portfolio digest target project: "${PORTFOLIO_PROJECT_NAME}"`);
  console.log(`   at-risk window: ${atRiskDays} day(s)`);
  if (isDryRun) console.log("   DRY RUN — no comments will be posted");

  const projects = await listProjects();
  console.log(`\nFound ${projects.length} active projects.`);

  const today = new Date().toISOString().slice(0, 10);
  const results = {
    processed: 0,
    skipped: 0,
    errors: [],
    perProject: [], // [{projectName, priorities}] for portfolio digest
  };
  const counterpartyObservations = [];
  let portfolioPinnedGid = null;
  let portfolioProjectName = null;

  for (const project of projects) {
    console.log(`\n• ${project.name}`);
    try {
      const tasks = await listIncompleteTasks(project.gid);
      console.log(`    ${tasks.length} incomplete tasks`);

      const pinned = tasks.find((t) => t.name.trim() === PINNED_TASK_NAME.trim());
      if (!pinned) {
        console.log(`    ⏭  no "${PINNED_TASK_NAME}" task — skipping`);
        results.skipped++;
        continue;
      }

      // Remember the portfolio-digest target if this is the designated project.
      if (
        project.name.toLowerCase().includes(PORTFOLIO_PROJECT_NAME.toLowerCase())
      ) {
        portfolioPinnedGid = pinned.gid;
        portfolioProjectName = project.name;
      }

      const workTasks = tasks.filter((t) => t.gid !== pinned.gid);
      if (workTasks.length === 0) {
        console.log(`    ⏭  no work tasks — skipping daily prioritize`);
        results.skipped++;
        continue;
      }

      const candidates = selectCandidateTasks(workTasks);
      if (candidates.length < workTasks.length) {
        console.log(
          `    narrowed ${workTasks.length} → ${candidates.length} candidate tasks (at-risk first, then due-date, then freshness)`,
        );
      }

      const atRiskCount = workTasks.filter(isAtRisk).length;
      if (atRiskCount > 0) {
        console.log(`    ⚠️  ${atRiskCount} task(s) overdue or due within ${atRiskDays} day(s)`);
      }

      console.log(`    asking Claude to prioritize ${candidates.length} tasks…`);
      const stats = {
        totalOpen: tasks.length,
        candidates: candidates.length,
        atRiskCount,
      };
      const rawPriorities = await callClaude(
        buildDailyPrompt(project.name, candidates, stats),
        "daily",
      );

      const linkedClaudeBody = linkifyPriorities(rawPriorities, candidates);
      const atRiskTasks = workTasks.filter(isAtRisk);
      const referenceId = `HSV2-DCP-${slugifyShort(project.name)}-${today}`;
      const document = buildDailyDocument({
        today,
        projectName: project.name,
        referenceId,
        stats,
        atRiskTasks,
        linkedClaudeBody,
      });

      if (isDryRun) {
        console.log(
          `    [dry-run] would post comment:\n${document.split("\n").slice(0, 20).map((l) => `      ${l}`).join("\n")}\n      ... [document continues]`,
        );
      } else {
        try {
          const __doc = document.length > 60000 ? document.slice(0, 60000) + "\n\n[TRUNCATED — full document archived under history/]" : document;
          await postComment(pinned.gid, __doc);
          console.log(`    ✓ comment posted on pinned task`);
        } catch (__err) {
          console.warn(`    ⚠  Asana post failed: ${__err.message}. Document remains in history/ archive.`);
        }
      }

      // Archive the full document to history/ for the ten-year retention
      // requirement. Writes a plain UTF-8 text file; the GitHub workflow
      // commits the history folder at the end of the run.
      try {
        await writeDailyPerProject(today, project.name, document);
        console.log(`    ✓ archived to history/daily/${today}/per-project/`);
      } catch (archiveErr) {
        console.warn(`    ⚠  failed to archive: ${archiveErr.message}`);
      }

      // Run the goAML filing detection pass on the work tasks. Flags
      // STR / SAR / DPMSR / PNMR / FFR candidates. Drafts are produced
      // only when scripts/filing-mode.json puts the type into "automatic"
      // mode, or when the individual task carries the hsv2:draft-now tag.
      try {
        const filingSummary = await detectAndDraft({
          anthropic,
          tasks: workTasks,
          projectName: project.name,
          postComment,
          isDryRun,
        });
        const flaggedTotal = Object.values(filingSummary.flagged).reduce((a, b) => a + b, 0);
        const draftedTotal = Object.values(filingSummary.drafted).reduce((a, b) => a + b, 0);
        if (flaggedTotal > 0) {
          console.log(
            `    🧭 filing detection: ${flaggedTotal} candidate(s) flagged (${JSON.stringify(filingSummary.flagged)}), ${draftedTotal} drafted, ${filingSummary.skippedManual} held in manual mode`,
          );
        }
      } catch (err) {
        console.warn(`    ⚠  filing detection failed: ${err.message}`);
      }

      // Collect counterparty observations for the cross-entity register.
      // We only look at the candidates sent to Claude (at-risk + top due
      // date + recent) to keep the extraction targeted.
      for (const t of candidates) {
        const extracted = extractCounterpartiesFromTask(t);
        for (const name of extracted.names) {
          counterpartyObservations.push({
            name,
            entity: project.name,
            typologies: extracted.typologies,
            taskGid: t.gid,
            jurisdiction: null,
            today,
          });
        }
      }

      // Keep a lean version of the priorities for the portfolio digest
      // (strip GID annotations; they'd be noise for the cross-entity call).
      results.perProject.push({
        projectName: project.name,
        priorities: rawPriorities.replace(/\s*\[id:\d+\]/g, ""),
      });
      results.processed++;
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      const detail = err?.error?.message ?? err?.message ?? String(err);
      const suffix = status ? ` (status ${status})` : "";
      console.error(`    ✗ error: ${detail}${suffix}`);
      if (err?.stack) console.error(err.stack.split("\n").slice(0, 3).join("\n"));
      results.errors.push({ project: project.name, error: `${detail}${suffix}` });
    }
    if (projectDelayMs > 0) await sleep(projectDelayMs);
  }

  /* ─── Portfolio digest ─────────────────────────────────────────────── */

  if (results.perProject.length >= 2) {
    console.log(`\n🎯 Generating cross-entity portfolio digest…`);
    try {
      const digest = await callClaude(
        buildPortfolioPrompt(results.perProject),
        "portfolio",
      );
      const portfolioReferenceId = `HSV2-DPD-${today}`;
      const portfolioComment = buildPortfolioDocument({
        today,
        referenceId: portfolioReferenceId,
        successCount: results.perProject.length,
        totalProjects: projects.length,
        claudeBody: digest,
      });

      if (!portfolioPinnedGid) {
        console.log(
          `    ⚠  no "${PINNED_TASK_NAME}" task found in a project matching "${PORTFOLIO_PROJECT_NAME}" — skipping portfolio post`,
        );
        console.log(`    (digest preview, first 400 chars:)`);
        console.log(`    ${digest.slice(0, 400).replace(/\n/g, "\n    ")}`);
      } else if (isDryRun) {
        console.log(
          `    [dry-run] would post portfolio digest to "${portfolioProjectName}":\n${portfolioComment.split("\n").map((l) => `      ${l}`).join("\n")}`,
        );
      } else {
        try {
          const __pDoc = portfolioComment.length > 60000 ? portfolioComment.slice(0, 60000) + "\n\n[TRUNCATED — full document archived under history/]" : portfolioComment;
          await postComment(portfolioPinnedGid, __pDoc);
          console.log(`    ✓ portfolio digest posted to "${portfolioProjectName}"`);
        } catch (__err) {
          console.warn(`    ⚠  Asana post failed: ${__err.message}. Document remains in history/ archive.`);
        }
      }

      // Archive the portfolio digest to history/ for ten-year retention.
      try {
        await writeDailyPortfolio(today, portfolioComment);
        console.log(`    ✓ archived to history/daily/${today}/portfolio-digest.txt`);
      } catch (archiveErr) {
        console.warn(`    ⚠  failed to archive: ${archiveErr.message}`);
      }

      // Email notification (Gmail), in parallel with the Asana post.
      if (!isDryRun) {
        await notify({
          subject: `${ARTEFACT_PREFIXES.dailyPortfolio} — ${today}`,
          body: portfolioComment,
        });
      }
    } catch (err) {
      const detail = err?.error?.message ?? err?.message ?? String(err);
      console.error(`    ✗ portfolio digest failed: ${detail}`);
      results.errors.push({ project: "portfolio-digest", error: detail });
    }
  } else if (results.perProject.length === 1) {
    console.log(
      `\n(Only 1 project succeeded — skipping portfolio digest, need at least 2.)`,
    );
  }

  /* ─── Counterparty register ────────────────────────────────────────── */

  if (counterpartyObservations.length > 0) {
    console.log(`\n📒 Updating cross-entity counterparty register with ${counterpartyObservations.length} observation(s)…`);
    try {
      const registerResult = await upsertFromTasks(counterpartyObservations);
      console.log(
        `    added ${registerResult.added}, updated ${registerResult.updated}, cross-entity entries: ${registerResult.crossEntityHits.length}`,
      );
      if (registerResult.crossEntityHits.length > 0) {
        console.log(`    cross-entity counterparties currently in the register:`);
        for (const e of registerResult.crossEntityHits.slice(0, 10)) {
          console.log(`      - ${e.counterparty_name} (${e.entities_touching}) [${e.risk_rating}]`);
        }
      }
    } catch (err) {
      console.warn(`    ⚠  counterparty register update failed: ${err.message}`);
    }
  } else {
    console.log(`\n📒 No counterparty candidates extracted from today's tasks.`);
  }

  /* ─── Summary ──────────────────────────────────────────────────────── */

  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${results.processed}`);
  console.log(`Skipped:   ${results.skipped}`);
  console.log(`Errors:    ${results.errors.length}`);
  if (results.errors.length > 0) {
    console.log("\nErrors:");
    for (const e of results.errors) console.log(`  - ${e.project}: ${e.error}`);
    // Do not exit(1) — the archive commit step must still run, and
    // partial success (some projects processed, some failed due to
    // rate limits) is better than no output at all.
    if (results.processed === 0) process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
