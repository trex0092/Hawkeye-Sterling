// Hawkeye Sterling — observable-facts linter.
// Enforces the narrative style required by charter P3 and P5:
//   - verb-first factual statements
//   - allegation vocabulary for unproven claims ("alleged", "reported",
//     "under investigation")
//   - ban on outcome verbs for unproven claims ("is guilty of", "committed")
//   - ban on legal-conclusion verbs ("constitutes", "amounts to", "qualifies
//     as") tied to predicate offences
// Returns per-sentence diagnostics.

export interface SentenceIssue {
  sentence: string;
  ruleId: string;
  suggestion: string;
}

export interface LintReport {
  ok: boolean;
  issues: SentenceIssue[];
  sentences: number;
}

const LEGAL_CONCLUSION = /\b(constitutes|amounts to|qualifies as)\b.*\b(money laundering|terrorist financing|bribery|fraud|corruption|proliferation financing|sanctions evasion)\b/i;
const OUTCOME_WITHOUT_FINAL = /\b(is guilty of|committed|laundered|bribed|embezzled|defrauded|smuggled)\b/i;
const WEAK_ALLEGATION_SOFTENING = /\b(involved in|linked to|connected with|implicated in)\b/i;
const HEDGE_WITHOUT_EVIDENCE = /\b(appears to|seems to|possibly|perhaps|maybe)\b/i;

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasAllegationVocab(s: string): boolean {
  return /\b(alleged|reported|accused|claimed|under investigation|charged|indicted)\b/i.test(s);
}

function hasFinalDetermination(s: string): boolean {
  return /\b(convicted|sentenced|fined by [A-Z][^,.]+ on [A-Z]?\w+ \d{4}|court ruling dated)\b/i.test(s);
}

export function lintObservableFacts(text: string): LintReport {
  const issues: SentenceIssue[] = [];
  const list = sentences(text);
  for (const s of list) {
    if (LEGAL_CONCLUSION.test(s)) {
      issues.push({
        sentence: s,
        ruleId: 'legal_conclusion',
        suggestion:
          'Replace with observable-fact language and flag as indicator/red-flag/typology. Final legal characterisation is reserved to MLRO/FIU/courts (charter P3).',
      });
    }
    if (OUTCOME_WITHOUT_FINAL.test(s) && !hasFinalDetermination(s)) {
      issues.push({
        sentence: s,
        ruleId: 'outcome_without_final_determination',
        suggestion:
          'Use allegation vocabulary ("alleged", "reported", "charged") unless the source explicitly records a final determination (charter P5).',
      });
    }
    if (WEAK_ALLEGATION_SOFTENING.test(s) && !hasAllegationVocab(s)) {
      issues.push({
        sentence: s,
        ruleId: 'softening_without_allegation',
        suggestion:
          'Do not soften "alleged" into "involved in" / "linked to" — restate with the allegation vocabulary.',
      });
    }
    if (HEDGE_WITHOUT_EVIDENCE.test(s) && !/\b(because|based on|per|citing)\b/i.test(s)) {
      issues.push({
        sentence: s,
        ruleId: 'hedge_without_evidence',
        suggestion:
          'Unearned hedging. Either cite the evidence that produces the hedge or state the fact plainly.',
      });
    }
  }
  return { ok: issues.length === 0, issues, sentences: list.length };
}
