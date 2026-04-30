// MLRO Advisor — Layer 3 structured-output helpers.
//
// When the request carries `structured: true`, the route asks the
// model to emit an `AdvisorResponseV1` JSON object matching the
// 8-section schema from src/brain/registry/response-schema.ts.
//
// The route then:
//   1. Parses the JSON out of the model's response. Models often
//      wrap JSON in fenced code blocks; this parser handles both.
//   2. Runs Layer-3 `checkCompletion()` against the parsed object.
//   3. On gate trip, the route may retry once with the defects fed
//      back as fix-it hints.
//   4. After retry, if the gate still trips, returns `buildFailClosed()`
//      so the operator gets a structured failure object naming the
//      missing section instead of a half-formed answer.
//
// The legacy free-form `narrative` path remains the default — opt-in
// only — so this PR is zero-risk to existing UI.

import {
  checkCompletion,
  buildFailClosed,
  SECTION_IDS,
  type AdvisorResponseV1,
  type CompletionDefect,
  type FailClosedResponse,
} from "../../../dist/src/brain/registry/index.js";

/** System-prompt addendum that instructs the model to emit JSON.
 *  Inserted at the END of the system message so the prior guidance
 *  on UAE law / scope / refusals still applies. */
export const STRUCTURED_OUTPUT_INSTRUCTION = `

STRUCTURED OUTPUT MODE — emit a single JSON object as your entire response. Do NOT
include any text before or after the JSON. Do NOT wrap the JSON in markdown fences
(\`\`\`json …\`\`\`). The JSON must match this schema:

{
  "schemaVersion": 1,
  "facts": { "bullets": [<string>...] },
  "redFlags": { "flags": [{"indicator": <string>, "typology": <string>}] },
  "frameworkCitations": {
    "byClass": {
      "A": [<string>...],            /* Primary law cites — e.g. "FDL 10/2025 Art.16" */
      "B": [<string>...],            /* Executive Regulation cites — e.g. "Cabinet Decision 134/2025 Art.11" */
      "C": [<string>...],            /* FIU operational guidance cites */
      "D": [<string>...]             /* International standards — e.g. "FATF R.10" */
    }
  },
  "decision": { "verdict": <"proceed"|"decline"|"escalate"|"file_str"|"freeze">, "oneLineRationale": <string> },
  "confidence": { "score": <1..5>, "reason": <string when score < 5> },
  "counterArgument": {
    "inspectorChallenge": <string ≥ 30 chars — how an inspector would challenge this decision>,
    "rebuttal": <string — why the verdict still holds, or empty when verdict is escalate / freeze>
  },
  "auditTrail": {
    "charterVersionHash": "advisor-v1",
    "directivesInvoked": [<string>...],
    "doctrinesApplied": [<string>...],
    "retrievedSources": [{"class": "A|B|C|D", "classLabel": <string>, "sourceId": <string>, "articleRef": <string>}],
    "timestamp": <ISO 8601>,
    "userId": <string>,
    "mode": <"quick"|"speed"|"balanced"|"deep"|"multi_perspective">,
    "modelVersions": {"haiku": <string>, "sonnet": <string>, "opus": <string>}
  },
  "escalationPath": {
    "responsible": <string>,
    "accountable": <string>,
    "consulted": [<string>...],
    "informed": [<string>...],
    "nextAction": <string ≥ 5 chars>
  }
}

Every section is mandatory. The completion gate refuses any output with a missing
or malformed section, so populate every field. If you cannot populate a section
(e.g. no red flags because the verdict is "proceed" with full CDD), still include
the section with its empty-but-shape-correct value (redFlags.flags: []).`;

export function appendStructuredInstruction(systemPrompt: string): string {
  if (systemPrompt.includes("STRUCTURED OUTPUT MODE — emit a single JSON")) return systemPrompt;
  return systemPrompt + STRUCTURED_OUTPUT_INSTRUCTION;
}

/** Try to extract a JSON object from `text`. Handles three common
 *  shapes:
 *    1. Plain JSON     — `{ "facts": ... }`
 *    2. Fenced JSON    — ```json\n{ ... }\n```
 *    3. Prose + JSON   — model preface, then the JSON object
 *
 *  Returns null if no parseable JSON object is found. */
export function tryParseStructured(text: string): { ok: true; value: AdvisorResponseV1 } | { ok: false; error: string; raw?: string } {
  const stripped = text.trim();
  // Pattern 2: fenced.
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : stripped;

  // Find the first balanced JSON object — start at the first `{` and
  // walk to the matching `}`. Naive brace counter handles the cases
  // we expect from a well-prompted model.
  const trimmed = (candidate ?? "").trim();
  const start = trimmed.indexOf("{");
  if (start < 0) return { ok: false, error: "no JSON object found" };
  let depth = 0;
  let end = -1;
  let inStr = false;
  let escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inStr = false; continue; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return { ok: false, error: "unbalanced JSON braces", raw: trimmed.slice(start) };
  const jsonText = trimmed.slice(start, end + 1);
  try {
    const value = JSON.parse(jsonText) as AdvisorResponseV1;
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), raw: jsonText };
  }
}

/** Run the Layer-3 completion gate against the parsed response.
 *  Returns the same `CompletionResult` shape as Layer 3 plus a
 *  convenience `passed` boolean for the route handler. */
export function runStructuredGate(parsed: AdvisorResponseV1): { passed: boolean; defects: CompletionDefect[] } {
  return checkCompletion(parsed);
}

/** Build the rewrite-prompt addendum that feeds verifier defects
 *  back to the model so it can fix them on the second pass.
 *  The route handler builds the final user message by concatenating
 *  the original prompt with this block. */
export function buildStructuredRewritePrompt(originalPrompt: string, draftJson: string, defects: CompletionDefect[]): string {
  const bullets = defects
    .map((d) => `  · [${d.section}] (${d.failure}) ${d.detail}`)
    .join("\n");
  return [
    originalPrompt,
    "",
    "PREVIOUS DRAFT (failed completion gate):",
    "<<<DRAFT_JSON",
    draftJson.trim().slice(0, 4_000),
    "DRAFT_JSON>>>",
    "",
    "GATE DEFECTS — fix every one of these in your rewrite:",
    bullets,
    "",
    "Re-emit the full JSON object with every defect resolved. Same shape constraints as before — single JSON object, no markdown fences, no preface, every section populated.",
  ].join("\n");
}

/** Convenience: produce a fail-closed object the route can return
 *  when the gate trips after retry. Mirrors the Layer-3 helper. */
export function buildStructuredFailClosed(
  finalDefects: CompletionDefect[],
  attempts: CompletionDefect[][],
): FailClosedResponse {
  return buildFailClosed(finalDefects, attempts);
}

/** Public surface — re-exports for the route handler. */
export type { AdvisorResponseV1, CompletionDefect, FailClosedResponse };
export { SECTION_IDS };
