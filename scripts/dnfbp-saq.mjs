/**
 * DNFBP Self-Assessment Questionnaire — on demand pre-fill draft.
 *
 * Produces a pre-filled draft of the self-assessment questionnaire the
 * Ministry of Economy periodically collects from Designated Non-Financial
 * Businesses and Professions in the firm's capacity as a Dealer in
 * Precious Metals and Stones. The draft is addressed to the MLRO for
 * review and onward submission through the MOE supervisory portal in
 * the MLRO's own name.
 *
 * The compliance function does not hold the current MOE questionnaire
 * template verbatim. The draft therefore uses generic field names that
 * mirror the headings MOE inspectors ask about. On receipt of the actual
 * questionnaire the MLRO maps the pre-filled answers onto the template.
 *
 * Triggered only by workflow_dispatch, with optional DRY_RUN. Never on a
 * schedule, because MOE does not publish the collection schedule for the
 * firm.
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

async function readLatestMonthly(dir, limit = 3) {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".txt")).sort().reverse().slice(0, limit);
    const out = [];
    for (const file of files) {
      const content = await readFile(path.join(dir, file), "utf8");
      out.push({ file, content: content.slice(0, 1500) });
    }
    return out;
  } catch {
    return [];
  }
}

async function readRegisterSummary(dir) {
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
        console.warn("  ⚠  all 4 validation attempts failed — returning best-effort text with warning");
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

function buildSaqPrompt({ projects, mlroMonthlies, registerRows }) {
  const projectBlock = projects.map((p) => `- ${p.name}`).join("\n");
  const monthlyBlock = mlroMonthlies.length === 0
    ? "No monthly MLRO consolidation reports were found in the archive. The draft will explicitly state where data is incomplete."
    : mlroMonthlies.map((e) => `### ${e.file}\n${e.content}`).join("\n\n");

  return `TASK. You are drafting a pre-fill of the DNFBP Self-Assessment Questionnaire that the Ministry of Economy collects from ${CONFIRMED_REFERENCES.entity.legalName} in its capacity as a Dealer in Precious Metals and Stones. This is a pre-fill for the MLRO, ${CONFIRMED_REFERENCES.mlro.name}, to review, correct and submit through the MOE supervisory portal in her own name. The document control block and the sign-off block are generated programmatically and appended to your response.

You do not have the current MOE questionnaire template verbatim. Use the generic field names listed below, which correspond to the topic areas MOE inspectors consistently ask about. On receipt of the actual template the MLRO will map each answer onto the corresponding field in the official form.

CONTEXT. The firm operates the following active compliance programmes across legally distinct entities:
${projectBlock}

The current counterparty register holds ${registerRows} rows.

INPUT. Up to three most recent Monthly MLRO Consolidation Reports held in the archive (first 1.5 KB each):
${monthlyBlock}

OUTPUT FORMAT. Emit sections 1 to 11 in this exact order with ALL CAPS labels on their own line. Answer each question using the data in the inputs and the firm's general profile. When data is not in the inputs, state "Data not available in automation archive; MLRO to confirm before submission." rather than invent.

1. FIRM IDENTIFICATION
   Include legal name, sector, classification, number of active branches, head office location, MLRO name, Deputy MLRO placeholder, Board composition placeholder.

2. GOVERNANCE AND AML FUNCTION
   Short paragraph on the MLRO appointment, Board approval of AML policy, frequency of Senior Management reporting, Board attendance of the MLRO.

3. CUSTOMER DUE DILIGENCE PROGRAMME
   Paragraph on CDD at onboarding, EDD triggers, current PEP population size, last procedure update date if visible.

4. TARGETED FINANCIAL SANCTIONS PROGRAMME
   Paragraph on daily screening against the UN Security Council Consolidated List and the UAE Local Terrorist List administered by the Executive Office for Control and Non-Proliferation, recent monthly screening volume if visible in the inputs, number of filings.

5. REPORTING OBLIGATIONS AND GOAML ACTIVITY
   Most recent monthly filing counts for STR, SAR, DPMSR, PNMR, FFR through the Financial Intelligence Unit on the goAML platform, drawn from the inputs.

6. RECORD KEEPING
   Explicit confirmation of the 10 year retention period for Customer Due Diligence records, transaction records, sanctions screening logs, training records and reporting files.

7. TRAINING
   Short paragraph on the annual training programme.

8. RISK ASSESSMENT
   Short paragraph on the annual enterprise-wide risk assessment and the current residual rating.

9. INCIDENTS AND EXCEPTIONS
   Any reportable incident from the most recent month in the input.

10. PROPOSED NEXT STEPS
    Short paragraph stating that on receipt of the official template the compliance function will map each answer onto the corresponding field, and the MLRO will review and submit.

11. LIMITATIONS OF THIS PRE-FILL
    One paragraph listing the known gaps in this pre-fill so the MLRO can fill them in before submission.

${STYLE_REMINDER}`;
}

function buildSaqDocument({ referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;
  const today = isoDate();

  return `=============================================================================
${entity.legalName.toUpperCase()}
DNFBP SELF-ASSESSMENT QUESTIONNAIRE — PRE-FILLED DRAFT FOR MLRO REVIEW
=============================================================================

Document reference:   ${referenceId}
Classification:       Confidential. Pre-filing draft. For MLRO review only.
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Prepared on:          ${today}
Addressee:            ${mlro.name}, ${mlro.title}
Intended recipient
after MLRO sign-off:  Ministry of Economy (supervisory authority for
                      Designated Non-Financial Businesses and Professions)
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

${claudeBody}

-----------------------------------------------------------------------------
12. DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Prepared by:       Compliance function, ${entity.legalName}
Reviewed by:       [awaiting MLRO review]
Approved by:       [awaiting MLRO approval and onward submission]
Filing status:     Draft. Not submitted to the Ministry of Economy.

For review and onward submission by the MLRO, ${mlro.name}.

[End of document]`;
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const today = isoDate();

  console.log(`▶  DNFBP Self-Assessment Questionnaire (pre-fill) — ${new Date().toISOString()}`);
  console.log(`   model: ${CLAUDE_MODEL}`);
  if (isDryRun) console.log("   DRY RUN — no comment will be posted");

  const projects = await listProjects();
  console.log(`\nFound ${projects.length} active projects.`);

  const historyRoot = path.resolve(process.cwd(), "..", "history");
  const mlroMonthlies = await readLatestMonthly(path.join(historyRoot, "mlro-monthly"), 3);
  const registerRows = await readRegisterSummary(path.join(historyRoot, "registers"));
  console.log(`\nArchive: ${mlroMonthlies.length} recent monthly report(s), ${registerRows} counterparty rows`);

  console.log(`\nGenerating SAQ pre-fill…`);
  const claudeBody = await callClaude(
    buildSaqPrompt({ projects, mlroMonthlies, registerRows }),
    "dnfbp-saq",
  );

  const quarter = `Q${Math.floor(new Date().getUTCMonth() / 3) + 1}`;
  const referenceId = `HSV2-DNFBP-SAQ-${new Date().getUTCFullYear()}-${quarter}`;
  const document = buildSaqDocument({ referenceId, claudeBody });

  const archivePath = path.join("on-demand", `dnfbp-saq-${today}.txt`);
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
    console.log(`\n[dry-run] would post DNFBP SAQ draft to "${portfolio.projectName}"`);
  } else {
    try {
      const __doc = document.length > 60000 ? document.slice(0, 60000) + "\n\n[TRUNCATED — full document archived under history/]" : document;
      await postComment(portfolio.taskGid, __doc);
    } catch (__err) {
      console.warn(`⚠  Asana post failed: ${__err.message}. Document remains in history/ archive.`);
    }
    console.log(`\n✓ DNFBP SAQ draft posted to "${portfolio.projectName}"`);
  }

  if (!isDryRun) {
    await notify({
      subject: `HSV2 / DNFBP Self-Assessment Questionnaire (pre-fill) — ${today}`,
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
