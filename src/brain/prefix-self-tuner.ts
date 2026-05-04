// Hawkeye Sterling — self-improving prefix retuner (audit follow-up #20).
//
// When OutcomeFeedbackJournal.agreement().biasSignals fires
// `mode_low_agreement:<modeId>`, this module produces a draft revised
// MLRO prefix for that mode, derived from the disagreement transcripts.
// The output is NOT auto-deployed — it is queued for MLRO review and
// applied via a controlled prefix-update API (separate). Charter P9:
// every prefix change is auditable and the rationale string preserves
// the MLRO transcripts that motivated it.

import type { OutcomeRecord } from './outcome-feedback.js';
import type { CaseSignals } from './mlro-context-builder.js';

export interface PrefixRetuneCandidate {
  modeId: string;
  reasonSignal: string;        // e.g. "mode_low_agreement:list_walk"
  agreementsAgainst: number;
  agreementsFor: number;
  observedOverrides: number;
  draftRevisedPrefix: string;
  draftRationale: string;
  exampleRunIds: string[];
}

export interface PrefixRetuneOptions {
  /** Minimum total runs touching the mode before retuning is suggested. */
  minRunsForSignal?: number;
  /** Minimum override-rate threshold (0..1). */
  minOverrideRate?: number;
  /** Cap on example run IDs included for traceability. */
  maxExamples?: number;
}

const DEFAULTS = {
  minRunsForSignal: 5,
  minOverrideRate: 0.6,
  maxExamples: 8,
};

/** Identify modes whose override rate exceeds the threshold + draft a
 *  revised prefix using a deterministic rewrite scaffold. The actual
 *  semantic rewrite is handled downstream by an Anthropic call; this
 *  module is the data-prep layer (which mode, which transcripts,
 *  which signals). */
export function suggestPrefixRetunes(
  records: readonly OutcomeRecord[],
  currentPrefixes: Readonly<Record<string, string>>,
  opts: PrefixRetuneOptions = {},
): PrefixRetuneCandidate[] {
  const minRuns = opts.minRunsForSignal ?? DEFAULTS.minRunsForSignal;
  const minRate = opts.minOverrideRate ?? DEFAULTS.minOverrideRate;
  const maxEx = opts.maxExamples ?? DEFAULTS.maxExamples;

  // Group records by mode (each record may touch many modes).
  const byMode = new Map<string, { total: number; overridden: number; runIds: string[]; reasons: string[] }>();
  for (const r of records) {
    for (const modeId of r.modeIds ?? []) {
      const slot = byMode.get(modeId) ?? { total: 0, overridden: 0, runIds: [], reasons: [] };
      slot.total++;
      if (r.overridden) slot.overridden++;
      slot.runIds.push(r.runId);
      if (r.overridden && r.overrideReason) slot.reasons.push(r.overrideReason);
      byMode.set(modeId, slot);
    }
  }

  const out: PrefixRetuneCandidate[] = [];
  for (const [modeId, s] of byMode) {
    if (s.total < minRuns) continue;
    const rate = s.overridden / s.total;
    if (rate < minRate) continue;
    const reasonSummary = topReasonThemes(s.reasons).slice(0, 4);
    const currentPrefix = currentPrefixes[modeId] ?? '(no prefix on file)';
    out.push({
      modeId,
      reasonSignal: `mode_low_agreement:${modeId}`,
      agreementsAgainst: s.overridden,
      agreementsFor: s.total - s.overridden,
      observedOverrides: s.overridden,
      draftRevisedPrefix: scaffoldRevisedPrefix(currentPrefix, modeId, reasonSummary),
      draftRationale: `Mode '${modeId}' was overridden by MLRO on ${s.overridden}/${s.total} runs (${(rate * 100).toFixed(0)}%). Recurring themes in override reasons: ${reasonSummary.join('; ')}. Suggest revising the prefix to address those themes; queued for MLRO review before deploying.`,
      exampleRunIds: s.runIds.slice(0, maxEx),
    });
  }
  return out.sort((a, b) => b.observedOverrides - a.observedOverrides);
}

/** Tally repeated phrases in override reasons. Cheap unigram bag. */
function topReasonThemes(reasons: string[]): string[] {
  const counts = new Map<string, number>();
  const stop = new Set(['the', 'a', 'an', 'this', 'that', 'is', 'was', 'and', 'or', 'of', 'on', 'in', 'for', 'to', 'with', 'no', 'not', 'but', 'as', 'be', 'it']);
  for (const r of reasons) {
    const tokens = r.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !stop.has(t));
    const ngrams = new Set<string>();
    for (let i = 0; i + 1 < tokens.length; i++) {
      const a = tokens[i] ?? '';
      const b = tokens[i + 1] ?? '';
      if (a && b) ngrams.add(`${a} ${b}`);
    }
    for (const g of ngrams) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, c]) => c >= 2)
    .map(([g]) => g);
}

/** Deterministic scaffold for a revised prefix. The Anthropic-driven
 *  semantic rewrite consumes this scaffold + the override transcripts
 *  to produce the final candidate. */
function scaffoldRevisedPrefix(currentPrefix: string, modeId: string, themes: string[]): string {
  const themesBlock = themes.length === 0
    ? 'No recurring themes detected; review override transcripts manually.'
    : `Recurring MLRO override themes:\n${themes.map((t) => `  - ${t}`).join('\n')}`;
  return [
    `=== PREFIX RETUNE CANDIDATE (mode=${modeId}) ===`,
    '',
    'CURRENT PREFIX:',
    currentPrefix.length > 1200 ? currentPrefix.slice(0, 1200) + '…' : currentPrefix,
    '',
    'ISSUES FROM MLRO OVERRIDES:',
    themesBlock,
    '',
    'REVISION GUIDANCE:',
    '- Address each recurring theme above explicitly in the prefix.',
    '- Do NOT remove existing safety / charter language (P1-P10).',
    '- Preserve the structural section headers that downstream parsers expect.',
    '- Tighten ambiguity wherever the override reasons cite the mode being "too aggressive" or "too lenient".',
    '',
    '=== END CANDIDATE ===',
  ].join('\n');
}
