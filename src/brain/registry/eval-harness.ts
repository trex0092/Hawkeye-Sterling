// Hawkeye Sterling — Layer 7: evaluation harness.
//
// Curated regression set + KPI computation. Produces the time-series
// the auditor reads on the dashboard:
//
//   · citation_accuracy        — % of cited articles that match real
//                                text in the retrieval set (Layer 2)
//   · hallucination_rate       — count of invented articles / timing /
//                                cadences per 100 answers, target zero
//   · completion_rate          — % of Deep-mode answers that populate
//                                all 8 mandated sections (Layer 3)
//   · escalation_precision     — of cases the Advisor escalated, what
//                                proportion the MLRO confirmed needed
//                                escalation (from feedback)
//   · time_to_decision_p50_ms  — median wall-clock per mode
//   · counter_argument_quality — sample audit by MLRO scoring whether
//                                the regulator-perspective section
//                                identified a real weakness or was
//                                pro-forma
//
// The harness ships with a small example regression corpus so the
// dashboard renders end-to-end immediately. The MLRO grows the
// corpus to the build-spec-mandated 50–100 scenarios via the
// addScenario() API. Each scenario has an expert-verified gold-
// standard answer; the harness runs the live Advisor and compares.

import type {
  AuditLogStore,
  AdvisorMode,
} from './audit-log.js';
import { type Verdict, type ConfidenceScore, type AdvisorResponseV1, type CompletionDefect, checkCompletion } from './response-schema.js';
import type { ValidationReport } from './citation-validator.js';

// ── Scenario shape ─────────────────────────────────────────────────────────

export type ScenarioCluster =
  | 'transactional_risk'
  | 'supplier_due_diligence'
  | 'ubo_assessment'
  | 'sanctions_edge_cases'
  | 'responsible_sourcing';

export interface RegressionScenario {
  id: string;
  cluster: ScenarioCluster;
  question: string;
  /** Expected verdict the gold-standard answer carries. */
  goldVerdict: Verdict;
  /** Expected confidence score on the gold answer. */
  goldConfidence: ConfidenceScore;
  /** Citations that MUST appear in the answer (subset match —
   *  the answer may cite more, but every entry here must be present). */
  goldCitations: string[];
  /** Free-text rationale from the expert who curated the scenario.
   *  Stored for audit; not used by the grader. */
  goldRationale: string;
  /** Optional: typology ids the answer should mention. */
  expectedTypologies?: string[];
  /** Optional: country iso2 codes whose 5-list lookup must surface. */
  expectedJurisdictions?: string[];
}

// ── Per-run grading ────────────────────────────────────────────────────────

export interface ScenarioRunResult {
  scenario: RegressionScenario;
  /** The Advisor's actual response. Null if the completion gate
   *  tripped (counts as a structural failure). */
  actual: AdvisorResponseV1 | null;
  /** Validation report from Layer 2 — present iff the answer was
   *  graded by the citation validator. */
  validation?: ValidationReport;
  /** Wall-clock for the run. */
  elapsedMs: number;
  /** Mode the run used. */
  mode: AdvisorMode;
  /** Per-axis grading. */
  grade: {
    verdictMatch: boolean;
    confidenceWithinOne: boolean;
    requiredCitationsPresent: boolean;
    completionPassed: boolean;
    completionDefects: CompletionDefect[];
    /** True iff the Advisor's narrative invented any timing, cadence,
     *  or article (Layer 2 catches these). */
    hallucinated: boolean;
    /** Optional MLRO grade for the counter-argument section
     *  (1=pro-forma, 5=identified real weakness). */
    counterArgumentGrade?: 1 | 2 | 3 | 4 | 5;
  };
}

// ── KPI snapshot (what the dashboard renders) ──────────────────────────────

export interface KpiSnapshot {
  generatedAt: string;
  totalRuns: number;
  byCluster: Record<ScenarioCluster, number>;
  byMode: Record<AdvisorMode, number>;
  /** % cited articles that matched real text (Layer 2). */
  citationAccuracy: number;
  /** Count of hallucinated articles / timing / cadences per 100 runs. */
  hallucinationRatePer100: number;
  /** % Deep-mode runs that passed the completion gate. */
  completionRateDeep: number;
  /** Of escalated runs, % the MLRO agreed needed escalation
   *  (requires user feedback on the audit log). */
  escalationPrecision: number;
  /** Median time-to-decision per mode (ms). */
  timeToDecisionP50Ms: Partial<Record<AdvisorMode, number>>;
  /** Mean MLRO grade for counterArgument across sampled runs. */
  counterArgumentQualityMean: number | null;
  /** Per-axis breach flags — set when a KPI is out of acceptance band.
   *  The build-spec ties an alert to any of these. */
  breaches: KpiBreach[];
}

export interface KpiBreach {
  kpi: keyof KpiSnapshot;
  detail: string;
}

// ── Acceptance bands (configurable) ────────────────────────────────────────

const DEFAULT_ACCEPTANCE = {
  citationAccuracyMin: 0.95,
  hallucinationRatePer100Max: 0.0,
  completionRateDeepMin: 0.98,
  escalationPrecisionMin: 0.85,
  counterArgumentQualityMin: 3.5,
};

// ── Harness ────────────────────────────────────────────────────────────────

export class EvalHarness {
  private scenarios: RegressionScenario[] = [];

  addScenario(s: RegressionScenario): void {
    if (this.scenarios.some((x) => x.id === s.id)) {
      throw new Error(`eval: scenario id already registered: ${s.id}`);
    }
    this.scenarios.push(s);
  }

  list(): RegressionScenario[] {
    return [...this.scenarios];
  }

  size(): number {
    return this.scenarios.length;
  }

  /** Grade a single scenario run. Pure — does not call the Advisor;
   *  the orchestrator is responsible for invocation and passes the
   *  result in. */
  grade(
    scenario: RegressionScenario,
    actual: AdvisorResponseV1 | null,
    opts: { elapsedMs: number; mode: AdvisorMode; validation?: ValidationReport; counterArgumentGrade?: 1 | 2 | 3 | 4 | 5 },
  ): ScenarioRunResult {
    const completion = actual ? checkCompletion(actual) : { passed: false, defects: [{ section: 'facts', failure: 'missing', detail: 'no answer produced' } as CompletionDefect] };
    const verdictMatch = !!actual && actual.decision.verdict === scenario.goldVerdict;
    const confidenceWithinOne = !!actual && Math.abs(actual.confidence.score - scenario.goldConfidence) <= 1;
    let citationsHit = 0;
    if (actual) {
      const flat: string[] = Object.values(actual.frameworkCitations.byClass).flatMap((arr) => arr ?? []);
      const blob = flat.join(' ').toLowerCase();
      citationsHit = scenario.goldCitations.filter((c) => blob.includes(c.toLowerCase())).length;
    }
    const requiredCitationsPresent = citationsHit === scenario.goldCitations.length;
    const hallucinated = !!opts.validation && (
      opts.validation.defects.some((d) => d.failure === 'no_matching_chunk' || d.failure === 'invented_timing_claim' || d.failure === 'unknown_source')
    );
    return {
      scenario,
      actual,
      ...(opts.validation ? { validation: opts.validation } : {}),
      elapsedMs: opts.elapsedMs,
      mode: opts.mode,
      grade: {
        verdictMatch,
        confidenceWithinOne,
        requiredCitationsPresent,
        completionPassed: completion.passed,
        completionDefects: completion.defects,
        hallucinated,
        ...(opts.counterArgumentGrade !== undefined ? { counterArgumentGrade: opts.counterArgumentGrade } : {}),
      },
    };
  }

  /** Compute the KPI snapshot from a batch of run results. The
   *  dashboard reads this directly. */
  computeKpis(runs: ScenarioRunResult[], log?: AuditLogStore, acceptance = DEFAULT_ACCEPTANCE): KpiSnapshot {
    const byCluster = {} as Record<ScenarioCluster, number>;
    const byMode = {} as Record<AdvisorMode, number>;
    const elapsedByMode = new Map<AdvisorMode, number[]>();
    let totalCitations = 0;
    let matchedCitations = 0;
    let hallucinationCount = 0;
    let deepRuns = 0;
    let deepCompleted = 0;
    let counterArgumentSampleSum = 0;
    let counterArgumentSampleCount = 0;

    for (const r of runs) {
      byCluster[r.scenario.cluster] = (byCluster[r.scenario.cluster] ?? 0) + 1;
      byMode[r.mode] = (byMode[r.mode] ?? 0) + 1;
      if (!elapsedByMode.has(r.mode)) elapsedByMode.set(r.mode, []);
      elapsedByMode.get(r.mode)!.push(r.elapsedMs);
      if (r.validation) {
        totalCitations += r.validation.summary.citationCount;
        matchedCitations += r.validation.summary.matchedCount;
        if (r.grade.hallucinated) hallucinationCount += r.validation.defects.filter((d) => d.failure === 'no_matching_chunk' || d.failure === 'unknown_source' || d.failure === 'invented_timing_claim').length;
      }
      if (r.mode === 'deep') {
        deepRuns++;
        if (r.grade.completionPassed) deepCompleted++;
      }
      if (r.grade.counterArgumentGrade !== undefined) {
        counterArgumentSampleSum += r.grade.counterArgumentGrade;
        counterArgumentSampleCount++;
      }
    }

    // Escalation precision — needs feedback on the audit log. If no
    // log was passed, we can't compute it; report null-equivalent 0
    // and surface a breach so the dashboard reflects the missing
    // signal rather than silently reporting 0.
    let escalationPrecision = 0;
    let escalationPrecisionAvailable = false;
    if (log) {
      const escalated = log.query({
        verdicts: ['escalate', 'freeze', 'file_str'],
        hasFeedback: true,
      });
      if (escalated.total > 0) {
        const correct = escalated.entries.filter((e) => e.feedback?.verdict === 'thumbs_up').length;
        escalationPrecision = correct / escalated.total;
        escalationPrecisionAvailable = true;
      }
    }

    const timeToDecisionP50Ms: Partial<Record<AdvisorMode, number>> = {};
    for (const [mode, samples] of elapsedByMode) {
      timeToDecisionP50Ms[mode] = median(samples);
    }

    const citationAccuracy = totalCitations === 0 ? 1 : matchedCitations / totalCitations;
    const hallucinationRatePer100 = runs.length === 0 ? 0 : (hallucinationCount / runs.length) * 100;
    const completionRateDeep = deepRuns === 0 ? 1 : deepCompleted / deepRuns;
    const counterArgumentQualityMean = counterArgumentSampleCount === 0 ? null : counterArgumentSampleSum / counterArgumentSampleCount;

    const breaches: KpiBreach[] = [];
    if (citationAccuracy < acceptance.citationAccuracyMin) {
      breaches.push({ kpi: 'citationAccuracy', detail: `citation accuracy ${(citationAccuracy * 100).toFixed(1)}% below ${(acceptance.citationAccuracyMin * 100).toFixed(0)}% floor` });
    }
    if (hallucinationRatePer100 > acceptance.hallucinationRatePer100Max) {
      breaches.push({ kpi: 'hallucinationRatePer100', detail: `hallucination rate ${hallucinationRatePer100.toFixed(2)} per 100 above target ${acceptance.hallucinationRatePer100Max}` });
    }
    if (completionRateDeep < acceptance.completionRateDeepMin) {
      breaches.push({ kpi: 'completionRateDeep', detail: `Deep-mode completion ${(completionRateDeep * 100).toFixed(1)}% below ${(acceptance.completionRateDeepMin * 100).toFixed(0)}% floor` });
    }
    if (!escalationPrecisionAvailable) {
      breaches.push({ kpi: 'escalationPrecision', detail: 'no MLRO feedback on escalated entries — precision cannot be computed' });
    } else if (escalationPrecision < acceptance.escalationPrecisionMin) {
      breaches.push({ kpi: 'escalationPrecision', detail: `escalation precision ${(escalationPrecision * 100).toFixed(1)}% below ${(acceptance.escalationPrecisionMin * 100).toFixed(0)}% floor` });
    }
    if (counterArgumentQualityMean !== null && counterArgumentQualityMean < acceptance.counterArgumentQualityMin) {
      breaches.push({ kpi: 'counterArgumentQualityMean', detail: `counter-argument quality ${counterArgumentQualityMean.toFixed(2)} below ${acceptance.counterArgumentQualityMin} floor` });
    }

    return {
      generatedAt: new Date().toISOString(),
      totalRuns: runs.length,
      byCluster,
      byMode,
      citationAccuracy,
      hallucinationRatePer100,
      completionRateDeep,
      escalationPrecision,
      timeToDecisionP50Ms,
      counterArgumentQualityMean,
      breaches,
    };
  }
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

// ── Worked-example seed scenarios (to be grown by MLRO) ────────────────────
//
// Three scenarios so the dashboard renders end-to-end on first run.
// The build spec mandates 50–100; the MLRO populates the rest via
// addScenario(). Each entry's gold answer is curated; modify in
// data/eval/scenarios/*.json once the corpus moves out of code.

export const SEED_SCENARIOS: RegressionScenario[] = [
  {
    id: 'tx-001',
    cluster: 'transactional_risk',
    question: 'Walk-in customer attempts AED 1.15M cash purchase of gold bullion with thin source-of-funds documentation. CDD obligation?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.16', 'FDL 10/2025 Art.18', 'Cabinet Decision 134/2025 Art.5', 'FATF R.10'],
    goldRationale:
      'Threshold-breaching cash gold purchase by walk-in is a classic DPMS red flag. Even a complete CDD attempt requires EDD trigger per FDL Art.18; documented source-of-funds is required before proceeding.',
    expectedTypologies: ['scrap_to_kilobar', 'sub_threshold_structuring'],
  },
  {
    id: 'sdd-001',
    cluster: 'supplier_due_diligence',
    question: 'New gold supplier in Mali offering doré bars at 5% below market. Onboarding controls?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['LBMA RGG v9 Step 2', 'OECD Due Diligence Guidance', 'FATF R.10'],
    goldRationale:
      'Mali is a CAHRA jurisdiction; doré-bar origin must be traced under OECD DDG and LBMA RGG Step 2. Below-market pricing is itself a red flag for origin laundering.',
    expectedTypologies: ['cahra_origin_laundering', 'dore_misdeclaration'],
    expectedJurisdictions: ['ML'],
  },
  {
    id: 'sa-001',
    cluster: 'sanctions_edge_cases',
    question: 'Counterparty entity is registered in Iran. Should we proceed?',
    goldVerdict: 'decline',
    goldConfidence: 5,
    goldCitations: ['UNSCR 2231', 'FDL 10/2025 Art.31', 'FDL 10/2025 Art.32'],
    goldRationale:
      'Iran is on FATF black list, EU high-risk, UNSC framework, and OFAC SDN country-program. Direct decline absent a specific, sanctions-cleared exception. The Advisor must NOT issue a definitive sanctions verdict — Module 02 (screening) is the source of truth — but jurisdiction-level posture is decline.',
    expectedJurisdictions: ['IR'],
  },
];
