// MLRO Advisor — Layer 6.3 adversarial probe wiring.
//
// Wraps the registry's adversarial-probe helpers so route handlers can:
//
//   1. Append the two probe instructions to the model's system prompt
//      so Haiku / Sonnet / Opus emit the markers near the end of their
//      answer:
//
//        INNOCENT-PROBE-VERDICT: <verdict>
//        ADVERSARIAL-PROBE-VERDICT: <verdict>
//
//   2. Parse the markers out, return a clean answer (markers stripped)
//      and a structured ProbeOutcome the response can carry.
//
// The Quick route is Q&A, not transactional judgment, so a real
// "verdict" doesn't always make sense — but the probe still surfaces
// useful contradiction signal (e.g. an innocent-narrative reading
// would say "proceed", an adversarial reading would say "escalate" —
// the operator should re-examine).

import {
  PROBE_PROMPTS,
  parseProbeOutcomes,
  applyProbeOverride,
} from "../../../dist/src/brain/registry/index.js";
import type { ProbeOutcome, Verdict } from "../../../dist/src/brain/registry/index.js";

const PROBE_BLOCK =
  "\n\nADVERSARIAL PROBE — append the following two markers verbatim at the end of your answer, " +
  "each on its own line. Pick one verdict from {proceed, decline, escalate, file_str, freeze} for each:\n\n" +
  `${PROBE_PROMPTS.innocent_narrative.instruction}\n\n` +
  `${PROBE_PROMPTS.sophisticated_launderer.instruction}\n\n` +
  "Place the two probe-verdict lines AFTER your answer body. Do not surround them with extra punctuation.";

/** Append the probe-instruction block to a system prompt so the
 *  model emits the two markers. Idempotent — adding twice is a
 *  no-op. */
export function appendProbeInstructions(systemPrompt: string): string {
  if (systemPrompt.includes("ADVERSARIAL PROBE — append")) return systemPrompt;
  return systemPrompt + PROBE_BLOCK;
}

const MARKER_RX =
  /^\s*(?:INNOCENT-PROBE-VERDICT|ADVERSARIAL-PROBE-VERDICT)\s*:\s*[a-z_]+\s*$/im;

/** Strip the probe markers from the visible answer. The markers
 *  belong in the audit trail, not in the operator's display. */
export function stripProbeMarkers(answer: string): string {
  // Remove every line that matches a probe-marker pattern. Trim
  // trailing whitespace / extra blank lines that result.
  return answer
    .split("\n")
    .filter((line) => !MARKER_RX.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export interface ProbeWrap {
  /** The answer text with the probe markers removed — what the UI
   *  shows the operator. */
  cleanAnswer: string;
  /** The probe outcome — what each probe pass said, whether the
   *  final verdict survived, and which pass disagreed. Persisted in
   *  the audit log; surfaced on the response for the UI. */
  outcome: ProbeOutcome;
  /** True iff the model emitted both markers. False = the system
   *  prompt was ignored or partially followed; the route should
   *  still ship the answer but flag the probe as "missing markers". */
  bothEmitted: boolean;
}

/** Parse + strip the probe markers from a model answer. The
 *  `finalVerdict` is the one the route inferred from the body
 *  (or "escalate" as a conservative default when the route doesn't
 *  produce a verdict — e.g. Quick mode Q&A). */
export function extractAndStripProbe(answer: string, finalVerdict: Verdict = "escalate"): ProbeWrap {
  const outcome = parseProbeOutcomes(answer, finalVerdict);
  const cleanAnswer = stripProbeMarkers(answer);
  const bothEmitted = outcome.innocent !== null && outcome.adversarial !== null;
  return { cleanAnswer, outcome, bothEmitted };
}

/** Convenience: given a final verdict and a probe outcome, return
 *  the verdict the route should ACTUALLY ship (escalate-on-non-
 *  survivor per the build-spec rule) plus a one-line rationale for
 *  the audit trail. */
export function applyProbeToVerdict(finalVerdict: Verdict, outcome: ProbeOutcome) {
  return applyProbeOverride(finalVerdict, outcome);
}

export type { ProbeOutcome };
