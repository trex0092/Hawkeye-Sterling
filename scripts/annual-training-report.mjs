/**
 * Annual AML and CFT Training Completion Report.
 *
 * Runs on 31 January at 09:00 Asia/Dubai (05:00 UTC) once per year so
 * the firm's documented annual training record is ready on the MLRO's
 * desk before the first Board meeting of the new year.
 *
 * Walks the previous calendar year's monthly and quarterly MLRO
 * reports for any mention of training activity, and asks Claude to
 * assemble a formal annual training completion report mirroring the
 * structure in samples/annual/02-training-completion-report.txt.
 *
 * The automation produces a DRAFT. The MLRO adds any missing data
 * (trainer name, attendee list, assessment score) from the firm's
 * internal training log before finalising.
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

async function readYearFiles(dir, year, maxChars = 1500) {
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

function buildPrompt({ year, monthlyReports, quarterlyReports }) {
  const monthlyBlock = monthlyReports.length === 0
    ? "No monthly MLRO reports available for this year."
    : monthlyReports.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");
  const quarterlyBlock = quarterlyReports.length === 0
    ? "No quarterly MLRO reports available for this year."
    : quarterlyReports.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");

  return `TASK. You are drafting the Annual AML and CFT Training Completion Report for ${CONFIRMED_REFERENCES.entity.legalName} for the calendar year ${year}. The document control block and sign-off block are generated programmatically.

Walk the inputs below, extract every mention of training activity during the year, and assemble sections 1 to 6 of the formal training record mirroring samples/annual/02-training-completion-report.txt.

INPUT A. MONTHLY MLRO REPORTS FOR ${year}
${monthlyBlock}

INPUT B. QUARTERLY MLRO REPORTS FOR ${year}
${quarterlyBlock}

OUTPUT FORMAT. Emit sections 1 to 6 in this exact order with ALL CAPS labels.

1. PURPOSE AND STANDING OF THIS REPORT
One paragraph stating that this records AML and CFT training delivered during ${year}, prepared under the 10-year retention obligation of Federal Decree-Law No. 10 of 2025, for MLRO review and Board acknowledgement.

2. HEADLINE FOR THE YEAR
Two to three short sentences stating total modules delivered, total unique staff trained, and overall completion rate if visible in the inputs. If the inputs do not state exact numbers, use phrases like "Data not available in automation archive; MLRO to confirm before submission."

3. TRAINING MODULES DELIVERED DURING THE YEAR
One paragraph per module identified in the inputs. For each module give: delivery date, format, required audience, attendees, completion rate, competence assessment outcome. If a field is not in the inputs, mark it [DATA REQUIRED FROM MLRO].

4. SCHEDULED TRAINING PROGRAMME FOR THE NEXT YEAR
Lettered paragraphs sketching a reasonable programme for the following year based on the pattern in the inputs. Clearly state this is a draft for MLRO approval.

5. RECORDS RETAINED
One paragraph listing the types of records retained for each training event (attendance sheets, materials, assessment results, trainer summaries, external trainer correspondence) and confirming the 10-year retention.

6. LIMITATIONS OF THIS REPORT
One paragraph stating what the automation had access to and what the MLRO must complete manually from the firm's internal training log.

${STYLE_REMINDER}`;
}

function buildDocument({ year, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;
  const today = new Date().toISOString().slice(0, 10);

  return `=============================================================================
${entity.legalName.toUpperCase()}
ANNUAL AML AND CFT TRAINING COMPLETION REPORT
Year ending 31 December ${year}
=============================================================================

Document reference:   HSV2-TCR-${year}
Classification:       Confidential. For Senior Management and the Board.
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Addressee:            ${mlro.name}, ${mlro.title}
Prepared on:          ${today}
Coverage period:      01 January ${year} to 31 December ${year} inclusive
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

${claudeBody}

-----------------------------------------------------------------------------
7. DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Prepared by:       Compliance function, ${entity.legalName}
Reviewed by:       [awaiting MLRO review]
Approved by:       [awaiting MLRO approval]
Noted by Board on: __________________________ (Board minute reference)

For review by the MLRO, ${mlro.name}.

[End of document]`;
}

async function main() {
  const year = TARGET_YEAR ? Number.parseInt(TARGET_YEAR, 10) : new Date().getUTCFullYear() - 1;
  console.log(`▶  Annual Training Completion Report — ${new Date().toISOString()}`);
  console.log(`   year: ${year}`);
  if (isDryRun) console.log("   DRY RUN");

  const historyRoot = path.resolve(process.cwd(), "..", "history");
  const monthlyReports = await readYearFiles(path.join(historyRoot, "mlro-monthly"), year, 1500);
  const quarterlyReports = await readYearFiles(path.join(historyRoot, "mlro-quarterly"), year, 1500);
  console.log(`\nArchive: ${monthlyReports.length} monthly, ${quarterlyReports.length} quarterly`);

  const claudeBody = await callClaude(buildPrompt({ year, monthlyReports, quarterlyReports }), "annual-training");
  const referenceId = `HSV2-TCR-${year}`;
  const document = buildDocument({ year, referenceId, claudeBody });

  try {
    await writeHistory(path.join("annual", `training-completion-${year}.txt`), document);
    console.log(`✓ archived to history/annual/training-completion-${year}.txt`);
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
    try {
      const __doc = document.length > 60000 ? document.slice(0, 60000) + "\n\n[TRUNCATED — full document archived under history/]" : document;
      await postComment(portfolio.taskGid, __doc);
    } catch (__err) {
      console.warn(`⚠  Asana post failed: ${__err.message}. Document remains in history/ archive.`);
    }
    console.log(`\n✓ posted to "${portfolio.projectName}"`);
  }

  if (!isDryRun) {
    await notify({
      subject: `HSV2 / Annual Training Completion Report — ${year}`,
      body: document,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
