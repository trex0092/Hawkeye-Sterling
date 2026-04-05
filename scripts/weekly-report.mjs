/**
 * Weekly Compliance Pattern Report — powered by Claude.
 *
 * Runs Fridays at 16:00 Asia/Dubai. Pulls every task modified in the last 7
 * days across every active Asana project in the workspace, asks Claude to
 * find cross-entity patterns / emerging risks / stalled investigations, and
 * posts the single report as a comment on the pinned `📌 Today's Priorities`
 * task inside the project configured by `PORTFOLIO_PROJECT_NAME` (default:
 * SCREENINGS).
 *
 * This is intentionally a *portfolio-level* narrative — not a ranking. It is
 * written for a compliance officer reading it on Friday afternoon to prepare
 * the Monday morning sync.
 *
 *   ASANA_TOKEN=... ANTHROPIC_API_KEY=... ASANA_WORKSPACE_ID=... \
 *     node scripts/weekly-report.mjs
 */

import Anthropic from "@anthropic-ai/sdk";
import { notify } from "./notify.mjs";

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
  MAX_TASKS_PER_PROJECT = "60",
  NOTES_SNIPPET_LENGTH = "100",
  PROJECT_DELAY_MS = "20000",
} = process.env;

const windowDays = Number.parseInt(WEEKLY_WINDOW_DAYS, 10);
const maxTasksPerProject = Number.parseInt(MAX_TASKS_PER_PROJECT, 10);
const notesSnippetLength = Number.parseInt(NOTES_SNIPPET_LENGTH, 10);
const projectDelayMs = Number.parseInt(PROJECT_DELAY_MS, 10);

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

async function listRecentTasks(projectGid, sinceIso) {
  const params = new URLSearchParams({
    project: projectGid,
    modified_since: sinceIso,
    limit: "100",
    opt_fields:
      "gid,name,notes,due_on,due_at,completed,completed_at,modified_at,created_at,assignee.name,permalink_url",
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

function summarizeProjectForPrompt(projectName, tasks) {
  const completed = tasks.filter((t) => t.completed);
  const open = tasks.filter((t) => !t.completed);
  const sample = [...open.slice(0, maxTasksPerProject)];
  const lines = sample.map((t, i) => {
    const parts = [`${i + 1}. ${t.name}`];
    if (t.due_on || t.due_at) {
      const due = t.due_on || t.due_at.slice(0, 10);
      parts.push(`due:${due}`);
    }
    if (t.assignee?.name) parts.push(`@${t.assignee.name}`);
    if (t.notes) {
      const snippet = t.notes.replace(/\s+/g, " ").slice(0, notesSnippetLength);
      parts.push(`notes: ${snippet}`);
    }
    return parts.join(" — ");
  });
  return {
    header: `### ${projectName} (${open.length} open, ${completed.length} completed this week)`,
    body: lines.join("\n"),
  };
}

function buildWeeklyPrompt(perProjectSummaries) {
  const blocks = perProjectSummaries.map((p) => `${p.header}\n${p.body}`);
  return `You are a compliance portfolio analyst for HAWKEYE STERLING V2.

It is Friday afternoon. Below is a cross-entity snapshot of every Asana compliance programme task that was created or modified in the last ${windowDays} days. Your reader is a compliance officer preparing for the Monday sync.

Write a WEEKLY PATTERN REPORT in this exact structure, plain text, no markdown headers, concise bullets:

HEADLINE
One line: the single most important takeaway from this week across the portfolio.

CROSS-ENTITY PATTERNS
• Typologies, counterparties, jurisdictions, or red flags that appeared in MORE THAN ONE entity this week. Call out the entities by name.
• If nothing obvious, say "None detected."

EMERGING RISKS
• New or escalating risk items that deserve attention next week. Prefer items tied to sanctions, PEPs, cross-border, or high-risk jurisdictions.
• One line each.

STALLED INVESTIGATIONS
• Items that have sat open for multiple weeks without progress. Name entity + task.

WINS OF THE WEEK
• Tasks completed this week that materially reduced risk. Name entity + task.

RECOMMENDED NEXT WEEK FOCUS
Three bullets. Each one = entity, task, why it matters Monday morning.

=== PER-ENTITY WEEKLY SNAPSHOT ===
${blocks.join("\n\n")}`;
}

async function callClaude(prompt, label) {
  console.log(`${label} prompt size: ~${(prompt.length / 1024).toFixed(1)} KB`);
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) throw new Error("Claude returned an empty response");
      return text;
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.response?.status;
      const detail = err?.error?.message ?? err?.message ?? String(err);
      console.warn(
        `attempt ${attempt}/4 failed: ${detail}${status ? ` (status ${status})` : ""}`,
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
      console.warn(`retrying in ${Math.round(waitMs / 1000)}s…`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

async function main() {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`▶  Weekly Pattern Report — ${new Date().toISOString()}`);
  console.log(`   window: last ${windowDays} days (since ${sinceIso})`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  console.log(`   portfolio target project: "${PORTFOLIO_PROJECT_NAME}"`);
  if (isDryRun) console.log("   DRY RUN — no comments will be posted");

  const projects = await listProjects();
  console.log(`\nFound ${projects.length} active projects.`);

  const perProjectSummaries = [];
  let portfolioPinnedGid = null;
  let portfolioProjectName = null;

  for (const project of projects) {
    console.log(`\n• ${project.name}`);
    try {
      const tasks = await listRecentTasks(project.gid, sinceIso);
      console.log(
        `    ${tasks.length} tasks touched in last ${windowDays}d (${tasks.filter((t) => t.completed).length} completed)`,
      );

      if (
        project.name.toLowerCase().includes(PORTFOLIO_PROJECT_NAME.toLowerCase())
      ) {
        // Find the pinned task in this project separately (it might not be in
        // modified_since results if it wasn't touched this week).
        const allOpen = await asana(
          `/tasks?${new URLSearchParams({
            project: project.gid,
            completed_since: "now",
            limit: "100",
            opt_fields: "gid,name",
          })}`,
        );
        const pinned = allOpen.data.find(
          (t) => t.name.trim() === PINNED_TASK_NAME.trim(),
        );
        if (pinned) {
          portfolioPinnedGid = pinned.gid;
          portfolioProjectName = project.name;
        }
      }

      // Skip projects with no activity this week (nothing useful to report)
      if (tasks.length === 0) {
        console.log(`    ⏭  no activity this week — skipping`);
        continue;
      }
      // Skip the pinned task noise itself
      const filtered = tasks.filter(
        (t) => t.name.trim() !== PINNED_TASK_NAME.trim(),
      );
      if (filtered.length === 0) continue;

      perProjectSummaries.push(summarizeProjectForPrompt(project.name, filtered));
    } catch (err) {
      const detail = err?.message ?? String(err);
      console.error(`    ✗ error: ${detail}`);
    }
    if (projectDelayMs > 0) await sleep(projectDelayMs);
  }

  if (perProjectSummaries.length === 0) {
    console.log("\nNo projects had activity this week — nothing to report.");
    return;
  }

  console.log(
    `\n🧠 Asking Claude for a weekly pattern report across ${perProjectSummaries.length} project(s)…`,
  );
  const report = await callClaude(
    buildWeeklyPrompt(perProjectSummaries),
    "weekly",
  );

  const comment = `📊 Weekly pattern report — week ending ${today}

Covers the last ${windowDays} days across ${perProjectSummaries.length} active programme entit${perProjectSummaries.length === 1 ? "y" : "ies"}.

${report}`;

  if (!portfolioPinnedGid) {
    console.log(
      `\n⚠  no "${PINNED_TASK_NAME}" task found in a project matching "${PORTFOLIO_PROJECT_NAME}" — printing report to log only`,
    );
    console.log("\n" + comment);
  } else if (isDryRun) {
    console.log(
      `\n[dry-run] would post weekly report to "${portfolioProjectName}":\n${comment.split("\n").map((l) => `  ${l}`).join("\n")}`,
    );
  } else {
    await postComment(portfolioPinnedGid, comment);
    console.log(`\n✓ weekly report posted to "${portfolioProjectName}"`);
  }

  // Email notification (Gmail). Runs regardless of whether the Asana post
  // succeeded, so you still receive the report even if Asana was down.
  if (!isDryRun) {
    await notify({
      subject: `📊 Weekly compliance pattern report — week ending ${today}`,
      body: comment,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
