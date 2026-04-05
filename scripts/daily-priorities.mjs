/**
 * Daily Asana Priorities — powered by Claude.
 *
 * For every Asana project the token can see (optionally filtered to one team),
 * fetches incomplete tasks, asks Claude to pick the top-10 priorities, and
 * posts the result as a comment on a pinned task named `📌 Today's Priorities`
 * inside that project. Projects without that task are skipped, so the pinned
 * task acts as an opt-in list.
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
  DRY_RUN = "false", // set to "true" to skip posting comments
  MAX_TASKS_PER_PROJECT = "75", // cap sent to Claude; keeps prompts under Tier-1 rate limits
  NOTES_SNIPPET_LENGTH = "80",
  PROJECT_DELAY_MS = "30000", // 30s between projects — Tier-1 is 30k input tokens/minute
} = process.env;

const maxTasksPerProject = Number.parseInt(MAX_TASKS_PER_PROJECT, 10);
const notesSnippetLength = Number.parseInt(NOTES_SNIPPET_LENGTH, 10);
const projectDelayMs = Number.parseInt(PROJECT_DELAY_MS, 10);

const REQUIRED = { ASANA_TOKEN, ANTHROPIC_API_KEY, ASANA_WORKSPACE_ID };
for (const [name, value] of Object.entries(REQUIRED)) {
  if (!value) {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(1);
  }
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const isDryRun = DRY_RUN === "true";

/** Minimal Asana REST client using global fetch (Node 20+). */
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
    completed_since: "now", // only tasks not completed as of now
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

/**
 * Pick the most relevant tasks when a project has too many.
 * Priority:
 *   1. Tasks with a due date (any) come before tasks with none
 *   2. Within each group, sort by most recently modified (fresh signals first)
 *   3. Cap at MAX_TASKS_PER_PROJECT
 */
function selectCandidateTasks(tasks) {
  const withDue = [];
  const withoutDue = [];
  for (const t of tasks) {
    (t.due_on || t.due_at ? withDue : withoutDue).push(t);
  }
  const byModifiedDesc = (a, b) =>
    (b.modified_at || b.created_at || "").localeCompare(
      a.modified_at || a.created_at || "",
    );
  withDue.sort(byModifiedDesc);
  withoutDue.sort(byModifiedDesc);
  return [...withDue, ...withoutDue].slice(0, maxTasksPerProject);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postComment(taskGid, text) {
  return asana(`/tasks/${taskGid}/stories`, {
    method: "POST",
    body: JSON.stringify({ data: { text } }),
  });
}

function buildPrompt(projectName, tasks) {
  const lines = tasks.map((t, i) => {
    const parts = [`${i + 1}. ${t.name}`];
    if (t.due_on) parts.push(`due ${t.due_on}`);
    if (t.assignee?.name) parts.push(`@${t.assignee.name}`);
    if (t.notes) {
      const snippet = t.notes.replace(/\s+/g, " ").slice(0, notesSnippetLength);
      parts.push(`notes: ${snippet}`);
    }
    return parts.join(" — ");
  });

  return `You are a compliance program prioritization assistant for HAWKEYE STERLING V2.

Below is the full list of incomplete tasks in the Asana project "${projectName}". These are AML/KYC risk typologies, red-flag reviews, and compliance monitoring items.

Pick the TOP 10 tasks that should be worked on TODAY, ranked from highest to lowest priority.

Ranking criteria, in order of importance:
1. Regulatory severity (sanctions, PEPs, cross-border, high-risk jurisdictions first)
2. Due-date urgency (overdue / nearest due date first)
3. Investigation dependencies (items that unblock others)
4. Quick wins where the effort is clearly small
5. Freshness (newer items before long-stalled ones)

Return ONLY a numbered list (1 to 10) in this exact format, nothing else, no preamble, no headers, no markdown:

1. [Task name] — [one-sentence reason it is a priority today]
2. [Task name] — [one-sentence reason]
...

If fewer than 10 incomplete tasks exist, return only what is available.

=== PROJECT TASKS ===
${lines.join("\n")}`;
}

async function prioritize(projectName, tasks) {
  const prompt = buildPrompt(projectName, tasks);
  console.log(`      prompt size: ~${(prompt.length / 1024).toFixed(1)} KB`);

  // Up to 4 attempts. On 429, honor the Retry-After header (or fall back
  // to a linear backoff) so Tier-1 token-per-minute limits don't kill us.
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
      // 4xx other than 429 are permanent — don't retry.
      if (status && status >= 400 && status < 500 && status !== 429) break;
      if (attempt >= 4) break;

      // Prefer the server-supplied Retry-After header (seconds).
      const retryAfterHeader =
        err?.headers?.["retry-after"] ??
        err?.response?.headers?.get?.("retry-after");
      const retryAfterSec = Number.parseInt(retryAfterHeader, 10);
      const waitMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000 + 1000
          : 30000 * attempt; // 30s, 60s, 90s
      console.warn(`      retrying in ${Math.round(waitMs / 1000)}s…`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

async function main() {
  console.log(`▶  Daily Priorities — ${new Date().toISOString()}`);
  console.log(`   workspace: ${ASANA_WORKSPACE_ID}${ASANA_TEAM_ID ? `, team: ${ASANA_TEAM_ID}` : ""}`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  console.log(`   pinned task: "${PINNED_TASK_NAME}"`);
  if (isDryRun) console.log("   DRY RUN — no comments will be posted");

  const projects = await listProjects();
  console.log(`\nFound ${projects.length} active projects.`);

  const today = new Date().toISOString().slice(0, 10);
  const results = { processed: 0, skipped: 0, errors: [] };

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

      const workTasks = tasks.filter((t) => t.gid !== pinned.gid);
      if (workTasks.length === 0) {
        console.log(`    ⏭  no work tasks — skipping`);
        results.skipped++;
        continue;
      }

      const candidates = selectCandidateTasks(workTasks);
      if (candidates.length < workTasks.length) {
        console.log(
          `    narrowed ${workTasks.length} → ${candidates.length} candidate tasks (by due date, then freshness)`,
        );
      }

      console.log(`    asking Claude to prioritize ${candidates.length} tasks…`);
      const priorities = await prioritize(project.name, candidates);

      const comment = `🤖 Daily priorities — ${today}\n\n${priorities}`;
      if (isDryRun) {
        console.log(`    [dry-run] would post comment:\n${comment.split("\n").map((l) => `      ${l}`).join("\n")}`);
      } else {
        await postComment(pinned.gid, comment);
        console.log(`    ✓ comment posted on pinned task`);
      }
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
