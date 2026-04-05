/**
 * Board Meeting AML Pack — on demand.
 *
 * Utility the MLRO triggers ahead of a Board meeting. Consolidates the
 * most recent Weekly MLRO Report, the most recent Monthly MLRO
 * Consolidation, the last two Weekly Pattern Reports and the current
 * counterparty register into a Board-ready AML pack addressed from the
 * MLRO to the Board of the Reporting Entity.
 *
 * Mirrors the format of samples/on-demand/02-board-meeting-aml-pack.txt.
 */

import Anthropic from "@anthropic-ai/sdk";
import { notify } from "./notify.mjs";
import {
  SYSTEM_PROMPT,
  STYLE_REMINDER,
  CONFIRMED_REFERENCES,
  validateOutput,
} from "./regulatory-context.mjs";
import { writeHistory, isoDate } from "./history-writer.mjs";
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
  BOARD_MEETING_DATE = "",
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

/* ─── Archive reader ────────────────────────────────────────────────────── */

async function readLatest(dir, limit, maxChars) {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".txt")).sort().reverse().slice(0, limit);
    const out = [];
    for (const file of files) {
      const content = await readFile(path.join(dir, file), "utf8");
      out.push({ file, content: content.slice(0, maxChars) });
    }
    return out;
  } catch {
    return [];
  }
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

function buildBoardPrompt({ boardDate, weeklyMlro, monthlyMlro, weekly, registerRows }) {
  const weeklyMlroBlock = weeklyMlro.length === 0
    ? "No weekly MLRO reports in the archive."
    : weeklyMlro.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");
  const monthlyBlock = monthlyMlro.length === 0
    ? "No monthly MLRO consolidation in the archive."
    : monthlyMlro.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");
  const weeklyBlock = weekly.length === 0
    ? "No weekly pattern reports in the archive."
    : weekly.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");

  return `TASK. You are drafting the Board Meeting AML Pack for the standing Board meeting scheduled for ${boardDate}. The document is issued in the name of the MLRO, ${CONFIRMED_REFERENCES.mlro.name}, to the Board of ${CONFIRMED_REFERENCES.entity.legalName}. The document control block and the sign-off block are generated programmatically and appended to your response.

You are responsible for sections 1 to 7 below. Write in the voice of the MLRO addressing the Board. Mix first person singular for judgement and first person plural for the firm's compliance function.

INPUT A. MOST RECENT WEEKLY MLRO REPORTS (first 1.5 KB each)
${weeklyMlroBlock}

INPUT B. MOST RECENT MONTHLY MLRO CONSOLIDATION (first 1.5 KB)
${monthlyBlock}

INPUT C. MOST RECENT WEEKLY PATTERN REPORTS (first 1.5 KB each)
${weeklyBlock}

INPUT D. CURRENT COUNTERPARTY REGISTER
Total rows: ${registerRows}

OUTPUT FORMAT. Emit sections 1 to 7 in this exact order.

1. PURPOSE AND STANDING OF THIS PACK
2. KEY MESSAGE FOR THE BOARD (2 to 4 sentences)
3. FILINGS SUMMARY FOR THE CURRENT PERIOD (numbers drawn from the inputs)
4. SANCTIONS EXPOSURE (the MLRO's current view and proposed approach)
5. PROGRAMME HEALTH INDICATORS (short indicator list)
6. RECOMMENDATIONS FOR BOARD ACKNOWLEDGEMENT (3 to 5 items)
7. DECLARATION OF THE MONEY LAUNDERING REPORTING OFFICER (first person singular attestation paragraph)

${STYLE_REMINDER}`;
}

function buildBoardDocument({ boardDate, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;
  const today = isoDate();

  return `=============================================================================
${entity.legalName.toUpperCase()}
BOARD MEETING AML PACK
For the standing Board meeting scheduled for ${boardDate}
=============================================================================

Document reference:   ${referenceId}
Classification:       Confidential. For Board members only.
Version:              1.0
From:                 ${mlro.name}, ${mlro.title}
To:                   The Board of ${entity.legalName}
Issued on:            ${today}
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

${claudeBody}

-----------------------------------------------------------------------------
8. DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Issued by:            ${mlro.name}, Money Laundering Reporting Officer
Signature:            __________________________
Date:                 __________________________
Board minute:         __________________________ (to be completed)
Date of acknowledgement: __________________________

[End of document]`;
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const today = isoDate();
  const boardDate = BOARD_MEETING_DATE || today;

  console.log(`▶  Board Meeting AML Pack — ${new Date().toISOString()}`);
  console.log(`   Board meeting date: ${boardDate}`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  if (isDryRun) console.log("   DRY RUN — no comment will be posted");

  const projects = await listProjects();
  console.log(`\nFound ${projects.length} active projects.`);

  const historyRoot = path.resolve(process.cwd(), "..", "history");
  const weeklyMlro = await readLatest(path.join(historyRoot, "mlro-weekly"), 2, 1500);
  const monthlyMlro = await readLatest(path.join(historyRoot, "mlro-monthly"), 1, 1500);
  const weekly = await readLatest(path.join(historyRoot, "weekly"), 2, 1500);
  const registerRows = await readRegisterRows(path.join(historyRoot, "registers"));
  console.log(
    `\nArchive: ${weeklyMlro.length} weekly MLRO, ${monthlyMlro.length} monthly MLRO, ${weekly.length} weekly pattern, ${registerRows} counterparty rows`,
  );

  console.log(`\nGenerating Board AML Pack…`);
  const claudeBody = await callClaude(
    buildBoardPrompt({ boardDate, weeklyMlro, monthlyMlro, weekly, registerRows }),
    "board-aml",
  );

  const referenceId = `HSV2-BOARD-AML-${today}`;
  const document = buildBoardDocument({ boardDate, referenceId, claudeBody });

  const archivePath = path.join("on-demand", `board-aml-pack-${today}.txt`);
  try {
    await writeHistory(archivePath, document);
    console.log(`✓ archived to history/${archivePath}`);
  } catch (archiveErr) {
    console.warn(`⚠  failed to archive: ${archiveErr.message}`);
  }

  const portfolio = await findPortfolioPinned(projects);
  if (!portfolio) {
    console.log(`\n⚠  no "${PINNED_TASK_NAME}" task found — archive only`);
  } else if (isDryRun) {
    console.log(`\n[dry-run] would post Board AML pack to "${portfolio.projectName}"`);
  } else {
    await postComment(portfolio.taskGid, document);
    console.log(`\n✓ Board AML pack posted to "${portfolio.projectName}"`);
  }

  if (!isDryRun) {
    await notify({
      subject: `HSV2 / Board Meeting AML Pack — ${boardDate}`,
      body: document,
    });
  }

  console.log(`\n=== Summary ===`);
  console.log(`Archive: history/${archivePath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
