/**
 * goAML filing candidate detection and draft generator.
 *
 * Invoked by daily-priorities.mjs (or standalone) to:
 *
 *   1. Detect filing-candidate tasks in the day's Asana data. A task is a
 *      candidate for a filing type when its name, notes and tags match the
 *      pattern the compliance function tracks for that type. Five types are
 *      supported: STR, SAR, DPMSR, PNMR, FFR.
 *
 *   2. For each candidate, decide whether to generate a draft narrative. The
 *      decision is governed by scripts/filing-mode.json, which the MLRO
 *      controls. Two modes per filing type:
 *
 *        "manual"    Candidate is flagged but no draft is produced unless
 *                    the MLRO has added the tag `hsv2:draft-now` to the
 *                    specific task. Default for every type, because the
 *                    MLRO is in charge of all filings.
 *
 *        "automatic" Draft is produced on every detection. Flip a type to
 *                    this mode only after the MLRO is confident in the
 *                    detector for that type.
 *
 *   3. Generate drafts in the exact format of samples/filings/*.txt using
 *      the SYSTEM_PROMPT from regulatory-context.mjs and type-specific
 *      task prompts. Drafts are:
 *        - archived under history/filings/YYYY-MM-DD/<reference>.txt
 *        - posted as a comment on the source task in Asana
 *        - validated by validateOutput before storage
 *
 *   4. Never, under any circumstances, submit to the goAML platform. The
 *      MLRO files manually from the draft narrative.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SYSTEM_PROMPT,
  STYLE_REMINDER,
  CONFIRMED_REFERENCES,
  ARTEFACT_PREFIXES,
  validateOutput,
} from "./regulatory-context.mjs";
import { writeFilingDraft, isoDate } from "./history-writer.mjs";

const { CLAUDE_MODEL = "claude-haiku-4-5" } = process.env;

const FILING_MODE_PATH = path.resolve(process.cwd(), "filing-mode.json");

const DRAFT_NOW_TAG = "hsv2:draft-now";

/* ─── Filing mode config ────────────────────────────────────────────────── */

export async function readFilingMode() {
  try {
    const text = await readFile(FILING_MODE_PATH, "utf8");
    const parsed = JSON.parse(text);
    return {
      STR: parsed.STR ?? "manual",
      SAR: parsed.SAR ?? "manual",
      DPMSR: parsed.DPMSR ?? "manual",
      PNMR: parsed.PNMR ?? "manual",
      FFR: parsed.FFR ?? "manual",
    };
  } catch {
    return { STR: "manual", SAR: "manual", DPMSR: "manual", PNMR: "manual", FFR: "manual" };
  }
}

/* ─── Detection patterns ────────────────────────────────────────────────── */

// Simple keyword detectors. The MLRO can edit these in a follow-up commit.
// A candidate is raised if any keyword matches the task name or notes.

const PATTERNS = {
  STR: {
    label: "Suspicious Transaction Report",
    keywords: [
      "suspicious transaction",
      "suspected laundering",
      "structured cash",
      "unable to explain",
      "source of funds inconsistent",
      "source of wealth inconsistent",
      "refused to provide",
      "smuggling",
      "trade-based",
      "sanctions nexus",
      "money laundering",
    ],
  },
  SAR: {
    label: "Suspicious Activity Report",
    keywords: [
      "attempted onboarding",
      "declined cdd",
      "refused cdd",
      "walked out",
      "alternative arrangement",
      "avoided customer file",
      "attempted without cdd",
      "suspicious activity",
      "cdd avoidance",
    ],
  },
  DPMSR: {
    label: "Dealers in Precious Metals and Stones Report",
    keywords: [
      "dpmsr",
      "linked cash transaction",
      "linked transaction",
      "cash aggregation",
      "cash purchase",
      "cash threshold",
      "aed 55",
      "cash in rolling",
    ],
  },
  PNMR: {
    label: "Partial Name Match Report",
    keywords: [
      "partial name match",
      "pnmr",
      "unable to discharge",
      "screening hit",
      "unsc consolidated",
      "local terrorist list",
      "match score",
      "91%",
      "cannot discharge",
    ],
  },
  FFR: {
    label: "Funds Freeze Report",
    keywords: [
      "funds freeze",
      "ffr",
      "confirmed match",
      "freeze without delay",
      "unsc confirmed",
      "asset freeze",
      "confirmed sanctions",
    ],
  },
};

/**
 * Examine a single Asana task and return the set of filing types for which
 * this task is a candidate. Returns an empty set if no pattern matches.
 *
 * The detector is intentionally permissive for flagging and conservative
 * for drafting. Flagging a candidate is cheap. Drafting is gated by
 * filing-mode.json and the draft-now tag.
 */
export function detectCandidatesForTask(task) {
  const haystack = `${task.name ?? ""}\n${(task.notes ?? "").slice(0, 1200)}`.toLowerCase();
  const matched = new Set();
  for (const [type, pattern] of Object.entries(PATTERNS)) {
    for (const keyword of pattern.keywords) {
      if (haystack.includes(keyword.toLowerCase())) {
        matched.add(type);
        break;
      }
    }
  }
  return matched;
}

function taskHasDraftNowTag(task) {
  if (!task?.tags) return false;
  // task.tags may be an array of objects with `name`, or an array of strings.
  return task.tags.some((t) => {
    const name = typeof t === "string" ? t : t?.name ?? "";
    return name.toLowerCase().trim() === DRAFT_NOW_TAG;
  });
}

/* ─── Prompts per filing type ───────────────────────────────────────────── */

function buildFilingPrompt(type, { projectName, task, today, referenceId }) {
  const label = PATTERNS[type].label;
  const taskBlock = [
    `Programme: ${projectName}`,
    `Asana task GID: ${task.gid}`,
    `Task name: ${task.name}`,
    task.assignee?.name ? `Assignee: ${task.assignee.name}` : "",
    task.due_on ? `Due date: ${task.due_on}` : "",
    task.permalink_url ? `Asana link: ${task.permalink_url}` : "",
    `Notes excerpt (first 1500 characters):\n${(task.notes ?? "").slice(0, 1500)}`,
  ].filter(Boolean).join("\n");

  const headerCommon = `TASK. You are drafting a ${label} candidate review for the attention of the MLRO, ${CONFIRMED_REFERENCES.mlro.name}, of ${CONFIRMED_REFERENCES.entity.legalName}. The document control block at the top and the sign-off block at the bottom are generated programmatically and appended to your response. You are responsible for sections 1 to 11 (or the analogous sections shown below) only.

You MUST:
- Write in the formal UAE compliance officer register.
- Cite only Federal Decree-Law No. 10 of 2025 and the authorities named in the system prompt, and never invent article numbers.
- Mark any field for which data is missing with the literal placeholder [DATA REQUIRED FROM MLRO] rather than guess.
- Never assert that the draft has been filed. The draft has no legal effect until the MLRO files it through goAML.

DRAFT REFERENCE: ${referenceId}
DATE OF PREPARATION: ${today}

SOURCE TASK:
${taskBlock}

`;

  const sectionSkeleton = {
    STR: `OUTPUT STRUCTURE. Emit these sections in this exact order with ALL CAPS labels on their own line, followed by a blank line, then prose.

1. STATUS OF THIS DOCUMENT
2. REPORTING ENTITY
3. SUBJECT PERSON (use [DATA REQUIRED FROM MLRO] for any identifying fields not visible in the task)
4. TRANSACTION THE SUBJECT OF THIS REPORT
5. GROUNDS FOR SUSPICION (three independent grounds if possible; one is acceptable if the data supports only one)
6. ACTIONS TAKEN TO DATE
7. RECORDS RETAINED
8. REGULATORY BASIS (Federal Decree-Law No. 10 of 2025; FIU through goAML; no article numbers)
9. PROPOSED NEXT STEPS (a numbered list of steps for the MLRO)
10. LIMITATIONS OF THIS DRAFT
11. QUALITY ASSURANCE STATEMENT

Model your output on samples/filings/01-str-candidate-review.txt.`,
    SAR: `OUTPUT STRUCTURE. Emit these sections in this exact order:

1. STATUS OF THIS DOCUMENT
2. REPORTING ENTITY
3. SUBJECT PERSON
4. ACTIVITY THE SUBJECT OF THIS REPORT
5. GROUNDS FOR SUSPICION
6. ACTIONS TAKEN TO DATE
7. RECORDS RETAINED
8. REGULATORY BASIS
9. PROPOSED NEXT STEPS
10. LIMITATIONS OF THIS DRAFT
11. QUALITY ASSURANCE STATEMENT

Model your output on samples/filings/02-sar-candidate-review.txt.`,
    DPMSR: `OUTPUT STRUCTURE. Emit these sections in this exact order:

1. STATUS OF THIS DOCUMENT
2. REPORTING ENTITY
3. SUBJECT PERSON
4. AGGREGATED LINKED CASH TRANSACTIONS (list them with dates and amounts; if only partially visible, mark gaps)
5. CUSTOMER DUE DILIGENCE STATUS
6. BASIS FOR THE REPORT
7. ACTIONS TAKEN TO DATE
8. RECORDS RETAINED
9. REGULATORY BASIS (explicitly ask the MLRO to verify the current cash transaction threshold before filing; do not quote a specific AED threshold unless the threshold has been provided by the MLRO)
10. PROPOSED NEXT STEPS
11. LIMITATIONS OF THIS DRAFT
12. QUALITY ASSURANCE STATEMENT

Model your output on samples/filings/03-dpmsr-candidate-review.txt.`,
    PNMR: `OUTPUT STRUCTURE. Emit these sections in this exact order:

1. STATUS OF THIS DOCUMENT
2. REPORTING ENTITY
3. SUBJECT OF THE SCREENING (counterparty name, trade licence if visible, country of registration if visible, date of screening, list consulted)
4. THE LIST ENTRY TRIGGERING THE MATCH
5. GROUNDS FOR FILING
6. ACTIONS TAKEN TO DATE
7. RECORDS RETAINED
8. REGULATORY BASIS (cite the applicable targeted financial sanctions framework, EOCN as implementing body, FIU through goAML, Federal Decree-Law No. 10 of 2025 as primary legal basis)
9. PROPOSED NEXT STEPS
10. LIMITATIONS OF THIS DRAFT
11. QUALITY ASSURANCE STATEMENT

Model your output on samples/filings/04-pnmr-candidate-review.txt.`,
    FFR: `OUTPUT STRUCTURE. This draft is CONDITIONAL and must be explicitly marked as such in section 1. Emit these sections in this exact order:

1. STATUS OF THIS DOCUMENT (state that the draft is conditional on confirmation of the sanctions match and must not be filed without confirmation)
2. REPORTING ENTITY
3. SUBJECT OF THE FREEZE
4. FUNDS AND ECONOMIC RESOURCES SUBJECT TO THE FREEZE (list every asset currently under the firm's control attributable to the subject; use [DATA REQUIRED FROM MLRO] for values not visible)
5. ACTIONS TAKEN OR TO BE TAKEN IMMEDIATELY ON CONFIRMATION (numbered a, b, c, ... covering the hold, the non-release of payment, written instructions to the branch, the letter to the counterparty, the filing through goAML, and the cross-entity communication)
6. RECORDS RETAINED
7. REGULATORY BASIS
8. LIMITATIONS OF THIS DRAFT (emphasise conditionality)
9. QUALITY ASSURANCE STATEMENT

Model your output on samples/filings/05-ffr-candidate-review.txt.`,
  };

  return headerCommon + sectionSkeleton[type] + "\n\n" + STYLE_REMINDER;
}

/* ─── Claude caller ─────────────────────────────────────────────────────── */

async function callClaude(anthropic, prompt, label) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
        console.warn(`      ${label} attempt ${attempt}/4 failed style validation:`);
        for (const p of check.problems) console.warn(`        - ${p}`);
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
      console.warn(`      ${label} attempt ${attempt}/4 failed: ${detail}${status ? ` (status ${status})` : ""}`);
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

/* ─── Document wrapper ──────────────────────────────────────────────────── */

function buildFilingDocument({ type, task, today, referenceId, claudeBody }) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title;
  const prefix = {
    STR: ARTEFACT_PREFIXES.strFlag.replace("STR Candidate Review", "SUSPICIOUS TRANSACTION REPORT — CANDIDATE REVIEW").toUpperCase(),
    SAR: "HSV2 / SUSPICIOUS ACTIVITY REPORT — CANDIDATE REVIEW".toUpperCase(),
    DPMSR: "HSV2 / DEALERS IN PRECIOUS METALS AND STONES REPORT — CANDIDATE REVIEW".toUpperCase(),
    PNMR: "HSV2 / PARTIAL NAME MATCH REPORT — CANDIDATE REVIEW".toUpperCase(),
    FFR: "HSV2 / FUNDS FREEZE REPORT — CANDIDATE REVIEW".toUpperCase(),
  }[type];

  const classificationNote = type === "FFR"
    ? "Confidential. For MLRO review only. Draft, conditional. Highest\n                      priority. To be handled within the applicable timeline\n                      for confirmed sanctions matches."
    : "Confidential. For MLRO review only. Draft.";

  return `=============================================================================
${entity.legalName.toUpperCase()}
${prefix}
=============================================================================

Document reference:   ${referenceId}
Classification:       ${classificationNote}
Version:              1.0
Prepared by:          Compliance function, ${entity.legalName}
Prepared on:          ${today}, ${new Date().toISOString().slice(11, 16)} Asia/Dubai
Addressee:            ${mlro.name}, ${mlro.title}
Source task:          ${task.name}
Asana task GID:       ${task.gid}
Filing channel:       Financial Intelligence Unit through the goAML platform
Retention period:     ${retentionYears} years, in accordance with the applicable provision
                      of ${primaryLaw.split(" on ")[0]}.

${claudeBody}

-----------------------------------------------------------------------------
DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Prepared by:   Compliance function, ${entity.legalName}
Reviewed by:   [awaiting MLRO review]
Approved by:   [awaiting MLRO approval and filing decision]
Filing status: Draft${type === "FFR" ? ", conditional" : ""}. Not filed.

For review and decision by the MLRO, ${mlro.name}.

[End of document]`;
}

/* ─── Public entry points ───────────────────────────────────────────────── */

/**
 * Process a list of tasks and generate drafts where appropriate. Returns
 * a summary object for logging.
 *
 * @param {Object} opts
 * @param {import('@anthropic-ai/sdk').default} opts.anthropic
 * @param {Array}  opts.tasks              Task objects from Asana with tags included
 * @param {string} opts.projectName
 * @param {Function} opts.postComment      async (taskGid, text) => void
 * @param {boolean} opts.isDryRun
 */
export async function detectAndDraft({
  anthropic,
  tasks,
  projectName,
  postComment,
  isDryRun,
}) {
  const filingMode = await readFilingMode();
  const today = isoDate();
  const summary = {
    flagged: { STR: 0, SAR: 0, DPMSR: 0, PNMR: 0, FFR: 0 },
    drafted: { STR: 0, SAR: 0, DPMSR: 0, PNMR: 0, FFR: 0 },
    skippedManual: 0,
    errors: [],
  };

  let draftSequence = 1;

  for (const task of tasks) {
    const candidates = detectCandidatesForTask(task);
    if (candidates.size === 0) continue;

    for (const type of candidates) {
      summary.flagged[type]++;

      const mode = filingMode[type];
      const hasDraftNow = taskHasDraftNowTag(task);
      const shouldDraft = mode === "automatic" || hasDraftNow;

      if (!shouldDraft) {
        summary.skippedManual++;
        console.log(`    🏷  ${type} candidate flagged (manual mode, no draft-now tag): ${task.name.slice(0, 60)}`);
        continue;
      }

      const referenceId = `HSV2-${type}-${today.replace(/-/g, "")}-${String(draftSequence).padStart(4, "0")}`;
      draftSequence++;

      try {
        console.log(`    ✎  drafting ${type} for: ${task.name.slice(0, 60)}`);
        const prompt = buildFilingPrompt(type, { projectName, task, today, referenceId });
        const body = await callClaude(anthropic, prompt, type);
        const document = buildFilingDocument({ type, task, today, referenceId, claudeBody: body });

        await writeFilingDraft(today, referenceId, document);
        console.log(`      ✓ archived to history/filings/${today}/${referenceId}.txt`);

        if (!isDryRun) {
          await postComment(task.gid, document);
          console.log(`      ✓ draft posted as comment on task ${task.gid}`);
        } else {
          console.log(`      [dry-run] would post draft as comment on task ${task.gid}`);
        }

        summary.drafted[type]++;
      } catch (err) {
        const detail = err?.message ?? String(err);
        console.error(`      ✗ ${type} draft failed: ${detail}`);
        summary.errors.push({ type, task: task.gid, error: detail });
      }
    }
  }

  return summary;
}
