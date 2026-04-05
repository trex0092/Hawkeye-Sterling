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
      "gid,name,notes,due_on,due_at,completed,modified_at,created_at,assignee.name,permalink_url",
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

function buildDailyPrompt(projectName, tasks) {
  const lines = tasks.map((t, i) => {
    const parts = [`${i + 1}. ${t.name}`];
    parts.push(`id:${t.gid}`);
    if (t.due_on || t.due_at) {
      const due = t.due_on || t.due_at.slice(0, 10);
      parts.push(`due:${due}${isAtRisk(t) ? "⚠️" : ""}`);
    }
    if (t.assignee?.name) parts.push(`@${t.assignee.name}`);
    if (t.notes) {
      const snippet = t.notes.replace(/\s+/g, " ").slice(0, notesSnippetLength);
      parts.push(`notes: ${snippet}`);
    }
    return parts.join(" — ");
  });

  return `You are a compliance program prioritization assistant for HAWKEYE STERLING V2.

Below is a curated list of incomplete tasks from the Asana project "${projectName}". These are AML/KYC risk typologies, red-flag reviews, and compliance monitoring items.

Pick the TOP 10 tasks to work on TODAY, ranked highest to lowest priority.

Ranking criteria, in order of importance:
1. Items marked ⚠️ (overdue or due within ${atRiskDays} days) — always rank first
2. Regulatory severity (sanctions, PEPs, cross-border, high-risk jurisdictions)
3. Investigation dependencies (items that unblock others)
4. Quick wins where the effort is clearly small
5. Freshness (newer items before long-stalled ones)

Return ONLY a numbered list (1 to 10) in this exact format, nothing else, no preamble, no headers, no markdown:

1. [Task name] — [one-sentence reason] [id:GID]
2. [Task name] — [one-sentence reason] [id:GID]
...

ALWAYS include the [id:GID] at the end of each line — copy the GID from the input list verbatim.

If fewer than 10 tasks exist, return only what is available.

=== PROJECT TASKS ===
${lines.join("\n")}`;
}

function buildPortfolioPrompt(perProjectResults) {
  const blocks = perProjectResults.map(({ projectName, priorities }) => {
    return `### ${projectName}\n${priorities}`;
  });

  return `You are a compliance portfolio analyst for HAWKEYE STERLING V2.

Below are today's top-10 priority lists from each compliance programme entity. Each list was generated independently by project.

Your job:
1. Pick the TOP 5 tasks across the ENTIRE portfolio that deserve attention first today, regardless of which entity they belong to.
2. Identify any CROSS-ENTITY PATTERNS — if two or more entities have similar typologies or share a counterparty, call it out.
3. Keep it short. Compliance officers read this on their phone.

Return in this exact format, no markdown headers:

TOP 5 PORTFOLIO PRIORITIES
1. [Entity] — [Task name] — [one-sentence reason]
2. ...
3. ...
4. ...
5. ...

CROSS-ENTITY PATTERNS
• [one-line pattern if any; otherwise "None detected today."]
• [additional patterns if any]

=== PER-ENTITY TOP 10 ===
${blocks.join("\n\n")}`;
}

async function callClaude(prompt, label) {
  console.log(`      ${label} prompt size: ~${(prompt.length / 1024).toFixed(1)} KB`);

  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });

      const text = msg.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (!text) throw new Error("Claude returned an empty response");
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

function buildDailyComment({ today, atRiskSection, linkedPriorities }) {
  return `🤖 Daily priorities — ${today}

${atRiskSection}TOP 10 FOR TODAY
${linkedPriorities}`;
}

function buildPortfolioComment({ today, digest, successCount, totalProjects }) {
  return `🎯 Portfolio digest — ${today}

Aggregated across ${successCount} of ${totalProjects} programme entities.

${digest}`;
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
      const rawPriorities = await callClaude(
        buildDailyPrompt(project.name, candidates),
        "daily",
      );

      const linkedPriorities = linkifyPriorities(rawPriorities, candidates);
      const atRiskSection = formatAtRiskSection(workTasks);
      const comment = buildDailyComment({ today, atRiskSection, linkedPriorities });

      if (isDryRun) {
        console.log(
          `    [dry-run] would post comment:\n${comment.split("\n").map((l) => `      ${l}`).join("\n")}`,
        );
      } else {
        await postComment(pinned.gid, comment);
        console.log(`    ✓ comment posted on pinned task`);
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
      const portfolioComment = buildPortfolioComment({
        today,
        digest,
        successCount: results.perProject.length,
        totalProjects: projects.length,
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
        await postComment(portfolioPinnedGid, portfolioComment);
        console.log(`    ✓ portfolio digest posted to "${portfolioProjectName}"`);
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

  /* ─── Summary ──────────────────────────────────────────────────────── */

  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${results.processed}`);
  console.log(`Skipped:   ${results.skipped}`);
  console.log(`Errors:    ${results.errors.length}`);
  if (results.errors.length > 0) {
    console.log("\nErrors:");
    for (const e of results.errors) console.log(`  - ${e.project}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
