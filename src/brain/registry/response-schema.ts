// Hawkeye Sterling — Layer 3: 8-section response schema + completion gate.
//
// Mandates a deterministic shape for Balanced and Deep mode responses
// so an auditor reading any past decision can find the same eight
// sections in the same order. The completion gate refuses to ship
// any response with an empty / malformed / under-threshold section.
// One retry on failure; if the second pass still fails, the gate
// returns a structured failure object naming the missing section
// and recommending escalation to the human MLRO.
//
// The eight sections are the build-spec contract. Their order matters:
// later layers (audit log, eval harness) parse responses by section
// index, not by header text.

import type { ValidationReport } from './citation-validator.js';
import type { CitationClass } from './types.js';

/** Verdict enum — bounded so the audit-log query interface can
 *  filter on it deterministically. */
export type Verdict = 'proceed' | 'decline' | 'escalate' | 'file_str' | 'freeze';

/** Confidence scale: 1-to-5 integer per the build spec. Below 5
 *  requires a one-line reason. */
export type ConfidenceScore = 1 | 2 | 3 | 4 | 5;

export interface FactsSection {
  /** Bullet list of "facts as understood" from the operator's question. */
  bullets: string[];
}

export interface RedFlagsSection {
  /** Each red flag mapped to a typology family. */
  flags: Array<{
    indicator: string;
    /** FATF / Wolfsberg / DPMS typology family this flag maps to. */
    typology: string;
  }>;
}

export interface FrameworkCitationsSection {
  /** Citations grouped by class. The validator (Layer 2) populates
   *  this from the actual cites in the narrative; the gate verifies
   *  no group is empty when the question warrants it. */
  byClass: Partial<Record<CitationClass, string[]>>;
}

export interface DecisionSection {
  verdict: Verdict;
  oneLineRationale: string;
}

export interface ConfidenceSection {
  score: ConfidenceScore;
  /** Required iff score < 5 — one-line reason naming the residual
   *  uncertainty. */
  reason?: string;
}

export interface CounterArgumentSection {
  /** "How would an inspector challenge this decision" — the
   *  regulator-perspective stress test. */
  inspectorChallenge: string;
  /** Why the verdict still holds against that challenge (or why it
   *  was changed). Empty only allowed when the verdict is escalate /
   *  freeze, since those are conservative defaults. */
  rebuttal: string;
}

export interface AuditTrailSection {
  charterVersionHash: string;
  directivesInvoked: string[];          // P1 - P10 directive ids
  doctrinesApplied: string[];
  /** Class-tagged source-chunk references. Each entry is "class:sourceId
   *  articleRef" so the audit-log query interface can filter on it. */
  retrievedSources: Array<{
    class: CitationClass;
    classLabel: string;
    sourceId: string;
    articleRef: string;
  }>;
  timestamp: string;                    // ISO 8601
  userId: string;
  mode: 'quick' | 'speed' | 'balanced' | 'deep' | 'multi_perspective';
  modelVersions: {
    haiku?: string;
    sonnet?: string;
    opus?: string;
  };
  /** The Layer 2 citation-validator outcome — passed/defects/ungrounded
   *  claims. Persisted here so a reviewer can see exactly why the
   *  generation passed or was rejected. */
  validation?: ValidationReport;
}

export interface EscalationPathSection {
  /** RACI: Responsible / Accountable / Consulted / Informed. */
  responsible: string;
  accountable: string;
  consulted: string[];
  informed: string[];
  /** Single-line action the operator should take next. */
  nextAction: string;
}

/** The full 8-section response. */
export interface AdvisorResponseV1 {
  schemaVersion: 1;
  facts: FactsSection;
  redFlags: RedFlagsSection;
  frameworkCitations: FrameworkCitationsSection;
  decision: DecisionSection;
  confidence: ConfidenceSection;
  counterArgument: CounterArgumentSection;
  auditTrail: AuditTrailSection;
  escalationPath: EscalationPathSection;
}

/** Section ids — used by the completion gate's defect reports and
 *  the audit-log query DSL. */
export const SECTION_IDS = [
  'facts',
  'redFlags',
  'frameworkCitations',
  'decision',
  'confidence',
  'counterArgument',
  'auditTrail',
  'escalationPath',
] as const satisfies readonly (keyof Omit<AdvisorResponseV1, 'schemaVersion'>)[];

export type SectionId = (typeof SECTION_IDS)[number];

// ── Completion gate ────────────────────────────────────────────────────────

export interface CompletionDefect {
  section: SectionId;
  failure:
    | 'missing'         // section is undefined / null
    | 'empty'           // section exists but has no content
    | 'malformed'       // shape is wrong (e.g. invalid verdict)
    | 'under_threshold' // content shorter than the section minimum
    | 'logic';          // cross-section contradiction
  detail: string;
}

export interface CompletionResult {
  passed: boolean;
  defects: CompletionDefect[];
}

/** Per-section minimum content thresholds. Below these, the gate
 *  treats the section as effectively empty. */
const MIN_LENGTHS: Record<SectionId, number> = {
  facts: 1,                  // ≥ 1 bullet
  redFlags: 0,               // can be empty if genuinely no flags — separate logic check
  frameworkCitations: 1,     // ≥ 1 citation in any class
  decision: 1,               // verdict required
  confidence: 1,             // score required
  counterArgument: 30,       // inspector challenge ≥ 30 chars
  auditTrail: 1,             // ≥ 1 retrieved source
  escalationPath: 5,         // nextAction ≥ 5 chars
};

const VALID_VERDICTS: ReadonlySet<Verdict> = new Set(['proceed', 'decline', 'escalate', 'file_str', 'freeze']);

function isFilled(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Check a complete response against the gate. */
export function checkCompletion(resp: Partial<AdvisorResponseV1>): CompletionResult {
  const defects: CompletionDefect[] = [];

  // facts
  if (!resp.facts) defects.push({ section: 'facts', failure: 'missing', detail: 'facts section absent' });
  else if (!Array.isArray(resp.facts.bullets) || resp.facts.bullets.length < MIN_LENGTHS.facts) {
    defects.push({ section: 'facts', failure: 'under_threshold', detail: 'facts must have ≥ 1 bullet' });
  } else if (resp.facts.bullets.some((b) => !isFilled(b))) {
    defects.push({ section: 'facts', failure: 'malformed', detail: 'facts contains an empty bullet' });
  }

  // redFlags — the section MUST exist (auditors look for it). Empty
  // flags array is allowed iff the decision is "proceed" with high
  // confidence; otherwise the absence of red flags on an
  // escalate/decline/file_str/freeze verdict is a logical defect.
  if (!resp.redFlags) {
    defects.push({ section: 'redFlags', failure: 'missing', detail: 'redFlags section absent' });
  } else {
    if (!Array.isArray(resp.redFlags.flags)) {
      defects.push({ section: 'redFlags', failure: 'malformed', detail: 'redFlags.flags must be an array' });
    } else {
      for (const f of resp.redFlags.flags) {
        if (!isFilled(f.indicator) || !isFilled(f.typology)) {
          defects.push({ section: 'redFlags', failure: 'malformed', detail: 'each red flag must have indicator + typology' });
          break;
        }
      }
      const verdict = resp.decision?.verdict;
      if (resp.redFlags.flags.length === 0 && verdict && verdict !== 'proceed') {
        defects.push({
          section: 'redFlags',
          failure: 'logic',
          detail: `verdict "${verdict}" requires at least one red flag — a non-proceed decision must be evidenced`,
        });
      }
    }
  }

  // frameworkCitations
  if (!resp.frameworkCitations) {
    defects.push({ section: 'frameworkCitations', failure: 'missing', detail: 'frameworkCitations section absent' });
  } else {
    const totalCites = Object.values(resp.frameworkCitations.byClass ?? {}).reduce(
      (acc, arr) => acc + (arr?.length ?? 0),
      0,
    );
    if (totalCites < MIN_LENGTHS.frameworkCitations) {
      defects.push({
        section: 'frameworkCitations',
        failure: 'empty',
        detail: 'frameworkCitations must contain at least one citation across any class',
      });
    }
  }

  // decision
  if (!resp.decision) {
    defects.push({ section: 'decision', failure: 'missing', detail: 'decision section absent' });
  } else {
    if (!VALID_VERDICTS.has(resp.decision.verdict)) {
      defects.push({
        section: 'decision',
        failure: 'malformed',
        detail: `verdict "${resp.decision.verdict}" not in {proceed, decline, escalate, file_str, freeze}`,
      });
    }
    if (!isFilled(resp.decision.oneLineRationale)) {
      defects.push({ section: 'decision', failure: 'empty', detail: 'decision.oneLineRationale missing' });
    }
  }

  // confidence
  if (!resp.confidence) {
    defects.push({ section: 'confidence', failure: 'missing', detail: 'confidence section absent' });
  } else {
    const s = resp.confidence.score;
    if (typeof s !== 'number' || ![1, 2, 3, 4, 5].includes(s)) {
      defects.push({
        section: 'confidence',
        failure: 'malformed',
        detail: `confidence.score "${s}" not in 1..5`,
      });
    } else if (s < 5 && !isFilled(resp.confidence.reason)) {
      defects.push({
        section: 'confidence',
        failure: 'malformed',
        detail: 'confidence.reason required when score < 5',
      });
    }
  }

  // counterArgument
  if (!resp.counterArgument) {
    defects.push({ section: 'counterArgument', failure: 'missing', detail: 'counterArgument section absent' });
  } else {
    if (!isFilled(resp.counterArgument.inspectorChallenge) ||
        resp.counterArgument.inspectorChallenge.length < MIN_LENGTHS.counterArgument) {
      defects.push({
        section: 'counterArgument',
        failure: 'under_threshold',
        detail: `counterArgument.inspectorChallenge must be ≥ ${MIN_LENGTHS.counterArgument} chars (regulator-perspective stress test)`,
      });
    }
    const verdict = resp.decision?.verdict;
    if (verdict && !['escalate', 'freeze'].includes(verdict) && !isFilled(resp.counterArgument.rebuttal)) {
      defects.push({
        section: 'counterArgument',
        failure: 'empty',
        detail: 'counterArgument.rebuttal required when verdict is not escalate / freeze',
      });
    }
  }

  // auditTrail
  if (!resp.auditTrail) {
    defects.push({ section: 'auditTrail', failure: 'missing', detail: 'auditTrail section absent' });
  } else {
    const at = resp.auditTrail;
    if (!isFilled(at.charterVersionHash)) defects.push({ section: 'auditTrail', failure: 'empty', detail: 'auditTrail.charterVersionHash missing' });
    if (!isFilled(at.timestamp)) defects.push({ section: 'auditTrail', failure: 'empty', detail: 'auditTrail.timestamp missing' });
    if (!isFilled(at.userId)) defects.push({ section: 'auditTrail', failure: 'empty', detail: 'auditTrail.userId missing' });
    if (!at.mode) defects.push({ section: 'auditTrail', failure: 'empty', detail: 'auditTrail.mode missing' });
    if (!Array.isArray(at.retrievedSources) || at.retrievedSources.length < MIN_LENGTHS.auditTrail) {
      defects.push({
        section: 'auditTrail',
        failure: 'under_threshold',
        detail: 'auditTrail.retrievedSources must list at least one class-tagged source',
      });
    } else {
      for (const s of at.retrievedSources) {
        if (!s.class || !s.classLabel || !s.sourceId || !s.articleRef) {
          defects.push({
            section: 'auditTrail',
            failure: 'malformed',
            detail: 'every retrievedSources entry must carry class, classLabel, sourceId, articleRef',
          });
          break;
        }
      }
    }
  }

  // escalationPath
  if (!resp.escalationPath) {
    defects.push({ section: 'escalationPath', failure: 'missing', detail: 'escalationPath section absent' });
  } else {
    const e = resp.escalationPath;
    if (!isFilled(e.responsible)) defects.push({ section: 'escalationPath', failure: 'empty', detail: 'escalationPath.responsible missing' });
    if (!isFilled(e.accountable)) defects.push({ section: 'escalationPath', failure: 'empty', detail: 'escalationPath.accountable missing' });
    if (!isFilled(e.nextAction) || e.nextAction.length < MIN_LENGTHS.escalationPath) {
      defects.push({
        section: 'escalationPath',
        failure: 'under_threshold',
        detail: `escalationPath.nextAction must be ≥ ${MIN_LENGTHS.escalationPath} chars`,
      });
    }
  }

  return { passed: defects.length === 0, defects };
}

// ── Fail-closed object ────────────────────────────────────────────────────
//
// When the gate trips after the second-pass retry, the executor
// returns this structured object instead of a partial AdvisorResponse.
// The UI renders it as a single warning panel naming exactly which
// section couldn't be completed and routing the operator to the human
// MLRO.

export interface FailClosedResponse {
  ok: false;
  reason: 'completion_gate_tripped';
  message: string;
  /** Defects from the final attempt — the audit log persists these
   *  so a reviewer can see what the model couldn't produce. */
  defects: CompletionDefect[];
  /** The two earlier attempts (initial + retry), so a reviewer can
   *  see whether the retry made it better or worse. Truncated for
   *  log size. */
  attempts: Array<{ defectCount: number; firstDefect?: SectionId | undefined }>;
  /** Pre-canned escalation banner. */
  escalation: {
    to: string;
    nextAction: string;
  };
}

export function buildFailClosed(
  finalDefects: CompletionDefect[],
  attempts: CompletionDefect[][],
): FailClosedResponse {
  const firstFailing = finalDefects[0]?.section;
  return {
    ok: false,
    reason: 'completion_gate_tripped',
    message:
      'The Advisor could not produce a complete regulator-grade response after one retry. ' +
      `Section "${firstFailing ?? 'unknown'}" remained ${finalDefects[0]?.failure ?? 'incomplete'}. ` +
      'Routing to the human MLRO — do not rely on a partial output.',
    defects: finalDefects,
    attempts: attempts.map((d) => {
      const o: { defectCount: number; firstDefect?: SectionId } = { defectCount: d.length };
      if (d[0]?.section) o.firstDefect = d[0].section;
      return o;
    }),
    escalation: {
      to: 'Human MLRO (Module 09 owner)',
      nextAction:
        'Review the question manually. The completion gate refused to ship a partial answer; ' +
        'this is a feature, not a failure mode.',
    },
  };
}
