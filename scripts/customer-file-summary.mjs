/**
 * Single-Customer File Summary — on demand.
 *
 * Given an Asana task GID on the command line, fetches the task, its
 * notes, its comment history and any subtasks, walks the counterparty
 * register for related entries, and asks Claude to produce a formal
 * one-page customer file summary that the MLRO can hand to an auditor
 * or to an MOE inspector during an interview.
 *
 * Triggered only by workflow_dispatch with a required TASK_GID input.
 * Never on a schedule.
 */

import Anthropic from "@anthropic-ai/sdk";
import { notify } from "./notify.mjs";
import {
  SYSTEM_PROMPT,
  STYLE_REMINDER,
  CONFIRMED_REFERENCES,
  validateOutput,
} from "./regulatory-context.mjs";
import { writeHistory, isoDate, slugify } from "./history-writer.mjs";
import { readFile } from "node:fs/promises";
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
  TASK_GID = "",
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

if (!TASK_GID) {
  console.error("❌ TASK_GID is required. Provide via workflow_dispatch input or environment variable.");
  process.exit(1);
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
    const body = await res.text();
    throw new Error(`Asana ${res.status} on ${reqPath}: ${body}`);
  }
  return res.json();
}

async function getTask(gid) {
  const params = new URLSearchParams({
    opt_fields:
      "gid,name,notes,completed,completed_at,created_at,modified_at,due_on,due_at,assignee.name,permalink_url,projects.name,tags.name,num_subtasks",
  });
  const page = await asana(`/tasks/${gid}?${params}`);
  return page.data;
}

async function getStories(gid) {
  const params = new URLSearchParams({
    opt_fields: "gid,text,created_at,created_by.name,type,resource_subtype",
    limit: "100",
  });
  const page = await asana(`/tasks/${gid}/stories?${params}`);
  return page.data;
}

async function getSubtasks(gid) {
  const params = new URLSearchParams({
    opt_fields: "gid,name,completed,due_on,assignee.name",
    limit: "100",
  });
  const page = await asana(`/tasks/${gid}/subtasks?${params}`);
  return page.data;
}

async function postComment(taskGid, text) {
  return asana(`/tasks/${taskGid}/stories`, {
    method: "POST",
    body: JSON.stringify({ data: { text } }),
  });
}

async function readRegisterLines() {
  try {
    const content = await readFile(
      path.resolve(process.cwd(), "..", "history", "registers", "counterparties.csv"),
      "utf8",
    );
    return content.split(/\r?\n/).filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

function findRelatedRegisterEntries(lines, taskName, taskGid) {
  if (lines.length === 0) return [];
  const header = lines[0];
  const hits = [];
  const nameHaystack = taskName.toLowerCase();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (lower.includes(taskGid)) {
      hits.push(line);
      continue;
    }
    const firstComma = line.indexOf(",");
    if (firstComma === -1) continue;
    // Simple heuristic: if any word of 4+ chars from the task name appears
    // in this register row, include the row for MLRO inspection.
    for (const word of taskName.split(/\W+/).filter((w) => w.length >= 4)) {
      if (lower.includes(word.toLowerCase())) {
        hits.push(line);
        break;
      }
    }
  }
  return hits.length > 0 ? [header, ...hits] : [];
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

function buildPrompt({ task, stories, subtasks, registerHits }) {
  const metaBlock = [
    `Task GID: ${task.gid}`,
    `Task name: ${task.name}`,
    `Project(s): ${(task.projects ?? []).map((p) => p.name).join(", ") || "unknown"}`,
    `Assignee: ${task.assignee?.name ?? "none"}`,
    `Completed: ${task.completed ? "yes" : "no"}`,
    task.completed_at ? `Completed at: ${task.completed_at}` : "",
    `Created at: ${task.created_at}`,
    `Modified at: ${task.modified_at}`,
    task.due_on ? `Due on: ${task.due_on}` : "",
    `Permalink: ${task.permalink_url ?? "n/a"}`,
    `Tags: ${(task.tags ?? []).map((t) => t.name).join(", ") || "none"}`,
  ].filter(Boolean).join("\n");

  const notesBlock = task.notes
    ? task.notes.slice(0, 3000)
    : "(no notes on file)";

  const storiesBlock = stories.length === 0
    ? "(no stories on file)"
    : stories
        .slice(0, 50)
        .map((s) => {
          const date = s.created_at ? s.created_at.slice(0, 16).replace("T", " ") : "unknown";
          const who = s.created_by?.name ?? "unknown";
          return `${date}  ${who}: ${(s.text ?? "").slice(0, 500)}`;
        })
        .join("\n");

  const subtasksBlock = subtasks.length === 0
    ? "(no subtasks on file)"
    : subtasks
        .map((s) => `- ${s.name}${s.completed ? " [completed]" : ""}${s.due_on ? ` (due ${s.due_on})` : ""}`)
        .join("\n");

  const registerBlock = registerHits.length === 0
    ? "(no related entries found in the cross-entity counterparty register)"
    : registerHits.join("\n");

  return `TASK. Draft the analytical body of a Single-Customer File Summary for ${CONFIRMED_REFERENCES.entity.legalName}. This document will be handed by the MLRO, ${CONFIRMED_REFERENCES.mlro.name}, to an auditor or an MOE inspector during an interview about this specific customer. It must be one page, factual, and confined to what is present in the inputs.

INPUT A. TASK METADATA
${metaBlock}

INPUT B. TASK NOTES (first 3 KB)
${notesBlock}

INPUT C. TASK STORIES (comment history, first 50)
${storiesBlock}

INPUT D. SUBTASKS
${subtasksBlock}

INPUT E. RELATED ENTRIES IN THE CROSS-ENTITY COUNTERPARTY REGISTER
${registerBlock}

OUTPUT FORMAT. Emit sections 1 to 7 in this exact order with ALL CAPS labels. Keep the whole response under ~1.2 KB so the document fits on one printed page.

1. FILE IDENTIFICATION
One paragraph naming the task, the source programme and the current status.

2. CUSTOMER OR COUNTERPARTY
One paragraph extracting any identifying information present in the inputs. Use [DATA NOT ON FILE] for any identifying field not present.

3. TRANSACTIONS OR ACTIVITY ON FILE
One paragraph summarising any transaction, delivery, valuation or assay mentioned in the inputs.

4. REGULATORY HOOKS
One short paragraph naming any typology, sanctions exposure, PEP status or filing obligation visible in the file, citing the inputs.

5. ACTIONS TAKEN
One paragraph listing the specific compliance actions recorded on the file (holds, Enhanced Due Diligence, filings prepared, filings filed, escalations).

6. CURRENT STATUS AND OPEN POINTS
One paragraph stating the file's current disposition and any open point awaiting action.

7. MLRO VIEW REQUESTED
One sentence stating what the MLRO should decide or confirm on this file in the next working day.

${STYLE_REMINDER}`;
}

function buildDocument({ task, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;
  const today = isoDate();

  return `=============================================================================
${entity.legalName.toUpperCase()}
SINGLE-CUSTOMER FILE SUMMARY
=============================================================================

Document reference:   ${referenceId}
Classification:       Confidential. For MLRO review only.
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Prepared on:          ${today}, on demand
Addressee:            ${mlro.name}, ${mlro.title}
Source task:          ${task.name}
Asana task GID:       ${task.gid}
Asana link:           ${task.permalink_url ?? "n/a"}
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
  const today = isoDate();
  console.log(`▶  Single-Customer File Summary — ${new Date().toISOString()}`);
  console.log(`   task GID: ${TASK_GID}`);

  const task = await getTask(TASK_GID);
  console.log(`   task name: ${task.name}`);

  const [stories, subtasks, registerLines] = await Promise.all([
    getStories(TASK_GID),
    getSubtasks(TASK_GID),
    readRegisterLines(),
  ]);
  console.log(`   stories: ${stories.length}, subtasks: ${subtasks.length}, register lines: ${registerLines.length}`);

  const registerHits = findRelatedRegisterEntries(registerLines, task.name ?? "", TASK_GID);
  console.log(`   register hits: ${Math.max(0, registerHits.length - 1)}`);

  const claudeBody = await callClaude(
    buildPrompt({ task, stories, subtasks, registerHits }),
    "customer-summary",
  );

  const refId = `HSV2-CFS-${today}-${TASK_GID}`;
  const document = buildDocument({ task, referenceId: refId, claudeBody });

  const fileSlug = slugify(task.name ?? TASK_GID);
  const archivePath = path.join("on-demand", `customer-summary-${today}-${fileSlug}.txt`);
  try {
    await writeHistory(archivePath, document);
    console.log(`✓ archived to history/${archivePath}`);
  } catch (err) {
    console.warn(`⚠  archive failed: ${err.message}`);
  }

  if (isDryRun) {
    console.log(`\n[dry-run] would post summary as a comment on the source task`);
  } else {
    await postComment(TASK_GID, document);
    console.log(`\n✓ summary posted as a comment on the source task`);
  }

  if (!isDryRun) {
    await notify({
      subject: `HSV2 / Customer File Summary — ${task.name.slice(0, 60)}`,
      body: document,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
