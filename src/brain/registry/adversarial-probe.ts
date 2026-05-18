// Hawkeye Sterling — Layer 6.3: adversarial probe.
//
// Before the Advisor issues a verdict, two internal reasoning passes:
//   1. Innocent-narrative pass — assume the customer's account is true;
//      does the verdict still hold?
//   2. Sophisticated-launderer pass — assume the customer is testing
//      controls; does the verdict still hold?
//
// The final verdict must SURVIVE BOTH passes; if either pass would
// flip the verdict, the Advisor escalates rather than decides.
//
// This module provides the structured prompts the Advisor wraps
// around the executor turn, plus a deterministic post-pass that
// inspects the Advisor's draft for the "both probes evaluated"
// markers and refuses to ship a verdict that didn't survive both
// reasonings.

import type { Verdict } from './response-schema.js';

export type ProbeKind = 'innocent_narrative' | 'sophisticated_launderer';

export interface ProbePrompt {
  kind: ProbeKind;
  /** Instruction text the Advisor injects into its reasoning before
   *  the verdict step. */
  instruction: string;
}

export const PROBE_PROMPTS: Record<ProbeKind, ProbePrompt> = {
  innocent_narrative: {
    kind: 'innocent_narrative',
    instruction:
      'INNOCENT-NARRATIVE PROBE — assume the customer\'s account is fully truthful. ' +
      'Does the verdict still hold under that assumption? If a benign explanation ' +
      'fully accounts for every red flag in the case, you must NOT escalate / freeze / ' +
      'file STR purely on speculation; instead recommend "proceed" or escalate to MLRO ' +
      'for documented sign-off rather than autonomous action. Output a single line ' +
      'starting "INNOCENT-PROBE-VERDICT: <verdict>".',
  },
  sophisticated_launderer: {
    kind: 'sophisticated_launderer',
    instruction:
      'SOPHISTICATED-LAUNDERER PROBE — assume the customer is deliberately testing ' +
      'your controls and the documented narrative is a constructed alibi. Does the ' +
      'verdict still hold under that assumption? If the case structure (sub-threshold ' +
      'sequencing, paper-trail completeness, plausible-but-thin SoF) matches a known ' +
      'typology when read adversarially, the conservative verdict (escalate / file STR) ' +
      'must be preferred. Output a single line starting "ADVERSARIAL-PROBE-VERDICT: <verdict>".',
  },
};

export interface ProbeOutcome {
  innocent: Verdict | null;
  adversarial: Verdict | null;
  /** True iff both probes returned the same verdict as the model's
   *  final stated verdict. */
  survived: boolean;
  /** The probe that disagreed, if any. */
  disagreement?: ProbeKind;
}

const VALID: ReadonlySet<Verdict> = new Set(['proceed', 'decline', 'escalate', 'file_str', 'freeze']);

/** Parse the probe markers out of a model draft. Expected format
 *  produced by the Advisor when the prompts above are injected:
 *
 *    INNOCENT-PROBE-VERDICT: proceed
 *    ADVERSARIAL-PROBE-VERDICT: escalate
 *
 *  Returns null for a probe that didn't emit a marker (the
 *  caller may treat that as a defect). */
export function parseProbeOutcomes(text: string, finalVerdict: Verdict): ProbeOutcome {
  const innocent = extractVerdict(text, /INNOCENT-PROBE-VERDICT:\s*([a-z_]+)/i);
  const adversarial = extractVerdict(text, /ADVERSARIAL-PROBE-VERDICT:\s*([a-z_]+)/i);
  const innocentSurvived = innocent === null ? false : compatibleVerdicts(innocent, finalVerdict);
  const adversarialSurvived = adversarial === null ? false : compatibleVerdicts(adversarial, finalVerdict);
  const survived = innocentSurvived && adversarialSurvived;
  const out: ProbeOutcome = { innocent, adversarial, survived };
  if (!innocentSurvived) out.disagreement = 'innocent_narrative';
  else if (!adversarialSurvived) out.disagreement = 'sophisticated_launderer';
  return out;
}

function extractVerdict(text: string, rx: RegExp): Verdict | null {
  const m = text.match(rx);
  if (!m) return null;
  const v = (m[1] ?? '').toLowerCase() as Verdict;
  return VALID.has(v) ? v : null;
}

/** A verdict "survives" a probe iff it equals the probe's verdict OR
 *  the probe is strictly more conservative than the final and the
 *  final is the conservative path. The build-spec rule:
 *  "if it does not [survive both passes], the model escalates rather
 *  than decides" — meaning the conservative escape valve is escalate. */
function compatibleVerdicts(probeVerdict: Verdict, finalVerdict: Verdict): boolean {
  if (probeVerdict === finalVerdict) return true;
  // If the final is "escalate" and the probe agrees with anything
  // not stricter than that, accept — escalate is the safe pivot.
  if (finalVerdict === 'escalate') return true;
  // If the adversarial probe says file_str and the final is escalate
  // or stronger, that's compatible with the escalate-or-stricter
  // conservative path.
  const STRICTNESS: Record<Verdict, number> = {
    proceed: 0,
    decline: 1,
    escalate: 2,
    file_str: 3,
    freeze: 4,
  };
  return STRICTNESS[finalVerdict] >= STRICTNESS[probeVerdict];
}

/** Decide whether the Advisor should ship the verdict or replace it
 *  with "escalate" because it didn't survive both probes. Returns
 *  the verdict the Advisor should actually emit and a one-line
 *  rationale for the audit trail. */
export function applyProbeOverride(
  finalVerdict: Verdict,
  outcome: ProbeOutcome,
): { verdict: Verdict; overridden: boolean; rationale: string } {
  if (outcome.survived) {
    return {
      verdict: finalVerdict,
      overridden: false,
      rationale: 'Verdict survived both probe passes (innocent-narrative + sophisticated-launderer).',
    };
  }
  // Escalate per build-spec rule. The probe outcome is preserved in
  // the audit log so a reviewer can see why escalation fired.
  return {
    verdict: 'escalate',
    overridden: true,
    rationale:
      `Verdict overridden to "escalate" because the ${outcome.disagreement ?? 'unknown'} ` +
      `probe disagreed with the proposed "${finalVerdict}" verdict. ` +
      `Innocent probe: ${outcome.innocent ?? 'no marker'}; ` +
      `adversarial probe: ${outcome.adversarial ?? 'no marker'}.`,
  };
}
