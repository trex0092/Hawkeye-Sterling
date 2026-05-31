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
  /** ISO date of last expert review — catches stale gold answers when regulations change. */
  lastReviewedAt?: string;
  /** Identity of the MLRO or compliance officer who last reviewed the gold answer. */
  lastReviewedBy?: string;
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

  /**
   * Load MLRO-created scenarios from Netlify Blobs and merge them into the
   * in-memory set. Scenarios stored at key `eval-scenarios/{tenantId}` as a
   * JSON array of RegressionScenario. IDs already registered are skipped.
   *
   * This allows the MLRO to create and persist scenarios via the UI without a
   * code deploy (L-13). Requires `NETLIFY_TOKEN` + `NETLIFY_SITE_ID` env vars.
   */
  async loadScenariosFromBlob(tenantId: string): Promise<void> {
    try {
      // Dynamic import keeps the Netlify Blobs SDK optional — eval-harness
      // is also consumed in Node CLI scripts that don't have Blobs configured.
      const { getStore } = await import("@netlify/blobs") as { getStore: (name: string) => { get: (key: string, opts: { type: string }) => Promise<string | null> } };
      const store = getStore("hawkeye-eval");
      const raw = await store.get(`eval-scenarios/${tenantId}`, { type: "text" });
      if (!raw || raw.length < 2) return;
      const external = JSON.parse(raw) as RegressionScenario[];
      let added = 0;
      for (const s of external) {
        if (!s.id || this.scenarios.some((x) => x.id === s.id)) continue;
        this.scenarios.push(s);
        added++;
      }
      if (added > 0) {
        console.info(`[eval-harness] loaded ${added} MLRO scenario(s) from Blobs for tenant '${tenantId}'`);
      }
    } catch (err) {
      // Non-fatal — fall back to seeded scenarios only.
      console.warn("[eval-harness] loadScenariosFromBlob failed (using seed scenarios only):", err instanceof Error ? err.message : String(err));
    }
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
      (elapsedByMode.get(r.mode) ?? []).push(r.elapsedMs);
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
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

// ── Worked-example seed scenarios (to be grown by MLRO) ────────────────────
//
// Three scenarios so the dashboard renders end-to-end on first run.
// The build spec mandates 50–100; the MLRO populates the rest via
// addScenario(). Each entry's gold answer is curated; modify in
// data/eval/scenarios/*.json once the corpus moves out of code.

export const SEED_SCENARIOS: RegressionScenario[] = [
  // ── Transactional Risk (10 scenarios) ────────────────────────────────────
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
    id: 'tx-002',
    cluster: 'transactional_risk',
    question: 'Customer makes five AED 55,000 cash purchases on consecutive days at different branches of the same gold retailer. Combined value AED 275,000. Risk assessment?',
    goldVerdict: 'escalate',
    goldConfidence: 5,
    goldCitations: ['FDL 10/2025 Art.15', 'Cabinet Decision 10/2019 Art.4', 'FATF R.10', 'FATF Guidance DPMS para.4.3'],
    goldRationale:
      'Classic sub-threshold structuring: five transactions each below the AED 55,000 single-transaction reporting threshold, all within one week, totalling AED 275,000. FATF Guidance para.4.3 and FDL Art.15 require aggregation. File STR immediately.',
    expectedTypologies: ['sub_threshold_structuring'],
  },
  {
    id: 'tx-003',
    cluster: 'transactional_risk',
    question: 'Customer presents large volumes of gold jewellery for melt and sale, claiming inherited estate. No probate documentation available. Proceed?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.16', 'FDL 10/2025 Art.20', 'FATF Guidance DPMS para.3.2'],
    goldRationale:
      'Inheritance claims without probate documentation are a known red flag for recycled proceeds. EDD required: obtain estate grant, supporting ID for deceased and beneficiary. Inability to provide documentation after reasonable opportunity triggers STR.',
    expectedTypologies: ['scrap_to_kilobar'],
  },
  {
    id: 'tx-004',
    cluster: 'transactional_risk',
    question: 'Third party pays cash on behalf of a customer for a AED 900,000 gold bar purchase. Payer refuses to provide ID. What controls apply?',
    goldVerdict: 'decline',
    goldConfidence: 5,
    goldCitations: ['FDL 10/2025 Art.12', 'FDL 10/2025 Art.16', 'Cabinet Decision 10/2019 Art.6'],
    goldRationale:
      'Third-party payer who refuses CDD is a mandatory decline under FDL Art.12 (CDD failure triggers refusal of business). Cannot proceed; file STR per FDL Art.20 if suspicion exists.',
    expectedTypologies: ['third_party_funding'],
  },
  {
    id: 'tx-005',
    cluster: 'transactional_risk',
    question: 'A UAE free-zone company with no apparent business purpose wires USD 2.5M for wholesale gold bars. BO structure shows nominee directors in BVI. EDD?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.18', 'FDL 10/2025 Art.22', 'Cabinet Decision 134/2025 Art.8', 'FATF R.24'],
    goldRationale:
      'Free-zone shell with nominee directors is a UBO opacity red flag. EDD required per Art.18; wire threshold exceeds Art.22 wire-transfer record-keeping minimum. BVI nominee structure must be resolved to natural persons before proceeding.',
    expectedTypologies: ['shell_company_layering'],
    expectedJurisdictions: ['AE', 'VG'],
  },
  {
    id: 'tx-006',
    cluster: 'transactional_risk',
    question: 'Established customer suddenly requests 20 same-day cross-border wire transfers of AED 49,000 each to different recipients in Turkey, Pakistan, and Egypt. Pattern assessment?',
    goldVerdict: 'escalate',
    goldConfidence: 5,
    goldCitations: ['FDL 10/2025 Art.15', 'FDL 10/2025 Art.20', 'Cabinet Decision 10/2019 Art.4', 'FATF R.16'],
    goldRationale:
      'Twenty same-day wires just below the AED 50,000 wire-transfer threshold to multiple jurisdictions is textbook structuring. Total AED 980,000. Behaviour change from established pattern amplifies suspicion. Immediate STR and transaction hold pending MLRO review.',
    expectedTypologies: ['wire_structuring', 'sub_threshold_structuring'],
    expectedJurisdictions: ['TR', 'PK', 'EG'],
  },
  {
    id: 'tx-007',
    cluster: 'transactional_risk',
    question: 'Customer deposits large amounts of small-denomination UAE banknotes totalling AED 480,000, all wrapped in identical bank bands from a foreign bank. Trade-based laundering risk?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.15', 'FDL 10/2025 Art.20', 'FATF Guidance TBML'],
    goldRationale:
      'Uniform banding from a foreign institution on AED cash is a TBML indicator: proceeds may have been repatriated via over/under-invoiced trade. Source-of-funds required; if unavailable within 5 business days, file STR.',
    expectedTypologies: ['tbml_cash_cycling'],
  },
  {
    id: 'tx-008',
    cluster: 'transactional_risk',
    question: 'Cryptocurrency exchange customer requests to purchase AED 3M in gold bars and pay via stablecoin transfer from a wallet with a prior OFAC SDN designation. Risk?',
    goldVerdict: 'decline',
    goldConfidence: 5,
    goldCitations: ['FDL 10/2025 Art.31', 'FDL 10/2025 Art.32', 'OFAC 50% Rule'],
    goldRationale:
      'A wallet with a prior OFAC SDN designation triggers OFAC 50% Rule analysis. If the wallet owner is or was an SDN, proceeding constitutes a sanctions violation. Decline; conduct sanctions screening via Module 02 before any re-engagement.',
    expectedTypologies: ['crypto_sanctions_evasion'],
  },
  {
    id: 'tx-009',
    cluster: 'transactional_risk',
    question: 'Retail customer completes 12 gold jewellery purchases over 3 months, each priced at AED 4,800. Total AED 57,600 — just above the AED 55,000 cash threshold. STR required?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['FDL 10/2025 Art.15', 'Cabinet Decision 134/2025 Art.5', 'FATF R.10'],
    goldRationale:
      'Aggregate exceeds the threshold but individual transactions do not raise structuring flags as clearly as same-day patterns. Linked-transaction aggregation under Art.15 applies. File STR if no business rationale; medium confidence because pattern is consistent with legitimate jewellery purchases.',
    expectedTypologies: ['sub_threshold_structuring'],
  },
  {
    id: 'tx-010',
    cluster: 'transactional_risk',
    question: 'A politically exposed person (PEP) from a high-risk jurisdiction requests a AED 4.5M gold bullion purchase via bank transfer. Documented wealth consistent with position. Proceed?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['FDL 10/2025 Art.18', 'FDL 10/2025 Art.19', 'FATF R.12'],
    goldRationale:
      'PEP from high-risk jurisdiction mandates EDD under Art.18/19 and FATF R.12 regardless of documented wealth. Senior management approval required before proceeding. Documented wealth consistent with position does not remove EDD obligation — it satisfies source-of-funds; origin-of-wealth still required.',
    expectedTypologies: ['pep_high_value'],
    expectedJurisdictions: [],
  },

  // ── Supplier Due Diligence (10 scenarios) ─────────────────────────────────
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
    id: 'sdd-002',
    cluster: 'supplier_due_diligence',
    question: 'Existing Swiss refiner supplier changes ownership; new parent is a private equity fund registered in the Cayman Islands. Supplier CDD refresh required?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.17', 'LBMA RGG v9 Step 5', 'FATF R.22'],
    goldRationale:
      'Change of UBO structure is a trigger event requiring full CDD refresh under FDL Art.17 and LBMA RGG Step 5. PE fund in Cayman Islands requires UBO look-through to natural persons before continuing to trade.',
    expectedJurisdictions: ['KY', 'CH'],
  },
  {
    id: 'sdd-003',
    cluster: 'supplier_due_diligence',
    question: 'Artisanal gold supplier in DRC provides a chain-of-custody certificate from an unaccredited third-party auditor. Accept?',
    goldVerdict: 'escalate',
    goldConfidence: 5,
    goldCitations: ['OECD Due Diligence Guidance Annex II', 'LBMA RGG v9 Step 2', 'FDL 10/2025 Art.16'],
    goldRationale:
      'DRC is a designated conflict-affected area under OECD DDG Annex II. Chain-of-custody must be certified by an LBMA/RJC-accredited auditor. Unaccredited certificate does not satisfy the standard; do not proceed until proper audit is obtained.',
    expectedJurisdictions: ['CD'],
    expectedTypologies: ['cahra_origin_laundering'],
  },
  {
    id: 'sdd-004',
    cluster: 'supplier_due_diligence',
    question: "Long-standing UAE supplier is identified as a 52% subsidiary of a Russian state-owned bank that appeared on the EU's sectoral sanctions list after the Ukraine conflict. Impact?",
    goldVerdict: 'decline',
    goldConfidence: 5,
    goldCitations: ['EU Regulation 833/2014', 'FDL 10/2025 Art.31', 'OFAC 50% Rule'],
    goldRationale:
      'EU sectoral sanctions on Russian state banks extend to majority-owned subsidiaries. OFAC 50% Rule and EU Regulation 833/2014 prohibit transactions. Suspend relationship immediately; obtain MLRO and legal sign-off before any re-engagement.',
    expectedJurisdictions: ['RU'],
    expectedTypologies: ['sanctions_subsidiary_evasion'],
  },
  {
    id: 'sdd-005',
    cluster: 'supplier_due_diligence',
    question: 'Supplier from Sudan claims gold originates from a mine certified by the Sudanese government. LBMA RGG compliance?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['LBMA RGG v9 Step 2', 'OECD Due Diligence Guidance', 'FATF R.22'],
    goldRationale:
      'Sudan is a FATF-monitored jurisdiction and conflict-affected region. Government certification alone is insufficient under LBMA RGG v9; independent third-party chain-of-custody audit required. EDD on mine-level due diligence before any purchase.',
    expectedJurisdictions: ['SD'],
    expectedTypologies: ['cahra_origin_laundering'],
  },
  {
    id: 'sdd-006',
    cluster: 'supplier_due_diligence',
    question: 'Prospective silver and platinum metals supplier has no website, minimal online presence, and provides a single reference from a related company. Onboarding risk?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['FDL 10/2025 Art.16', 'LBMA RGG v9 Step 1', 'FATF R.10'],
    goldRationale:
      'Shell-company indicators: no independent web presence, circular reference. Risk-based approach requires enhanced CDD. Request audited financial statements, independent trade references, and site visit before onboarding.',
    expectedTypologies: ['shell_company_layering'],
  },
  {
    id: 'sdd-007',
    cluster: 'supplier_due_diligence',
    question: 'Supplier whose gold is certified conflict-free under ICGLR is also flagged in adverse media for association with armed militia payments in 2019. Continue onboarding?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['OECD Due Diligence Guidance Annex II', 'LBMA RGG v9 Step 2', 'FDL 10/2025 Art.16'],
    goldRationale:
      'Adverse-media flag for past militia association is a material EDD trigger regardless of current certification status. ICGLR regional certification does not override OECD DDG Annex II risk signal. MLRO must review adverse-media findings before sign-off.',
    expectedTypologies: ['cahra_origin_laundering'],
  },
  {
    id: 'sdd-008',
    cluster: 'supplier_due_diligence',
    question: 'A recently-formed UAE company with no trading history offers to act as intermediary for a large gold consignment from a known LBMA-accredited refiner. Due diligence required on the intermediary?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['LBMA RGG v9 Step 3', 'FDL 10/2025 Art.16', 'FATF Guidance DPMS para.4.2'],
    goldRationale:
      'Intermediary CDD required even when the underlying refiner is accredited. A newly-formed entity with no trading history is a layering red flag. Full CDD including UBO look-through required on the intermediary per LBMA RGG Step 3.',
  },
  {
    id: 'sdd-009',
    cluster: 'supplier_due_diligence',
    question: 'Supplier discloses that mine site workers were paid in gold in kind rather than UAE dirham. Labour rights and AML concerns?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['OECD Due Diligence Guidance Chapter 2', 'FDL 10/2025 Art.16', 'ILO Convention 95'],
    goldRationale:
      'Payment in kind is an ILO Convention 95 violation and an AML red flag for informal value transfer. OECD DDG Chapter 2 human rights due diligence applies. Flag for responsible-sourcing review and consider STR if informal value flows constitute ML typology.',
    expectedTypologies: ['informal_value_transfer'],
  },
  {
    id: 'sdd-010',
    cluster: 'supplier_due_diligence',
    question: 'Established supplier is acquired by a previously-unknown entity that claims to be a family office with no public filings. Ongoing monitoring obligations?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.17', 'FDL 10/2025 Art.22', 'LBMA RGG v9 Step 5'],
    goldRationale:
      'Material change in UBO ownership is a CDD refresh trigger. A family office with no public filings must provide certified constitutional documents and identify natural person UBOs. Suspend new purchases until refresh completed.',
  },

  // ── Sanctions Edge Cases (15 scenarios) ───────────────────────────────────
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
  {
    id: 'sa-002',
    cluster: 'sanctions_edge_cases',
    question: 'Screening returns a name match against the OFAC SDN list for an individual with a very common Arabic name. 14 other individuals with the same name exist on the list. How to resolve?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['FDL 10/2025 Art.31', 'OFAC Guidance on Screening', 'FDL 10/2025 Art.16'],
    goldRationale:
      'High-volume name collision requires disambiguation: compare DOB, nationality, aliases, and address. If distinguishing attributes cannot rule out all 14 SDN entries, treat as a potential match and escalate to MLRO. Do not proceed without positive disqualification.',
    expectedTypologies: ['false_positive_name_collision'],
  },
  {
    id: 'sa-003',
    cluster: 'sanctions_edge_cases',
    question: 'An entity was delisted from OFAC SDN 6 months ago following successful OFAC licence application. Historical transactions during the listed period exist in our records. Remediation required?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['OFAC 50% Rule', 'FDL 10/2025 Art.32', 'Cabinet Decision 10/2019 Art.9'],
    goldRationale:
      'Delisting is prospective; transactions executed during the designation period may constitute apparent violations. File OFAC voluntary self-disclosure and UAE CBUAE report for the historical period. Legal counsel review required.',
  },
  {
    id: 'sa-004',
    cluster: 'sanctions_edge_cases',
    question: "Customer's beneficial owner is 48% shareholder of an OFAC-designated entity. OFAC 50% Rule analysis?",
    goldVerdict: 'decline',
    goldConfidence: 5,
    goldCitations: ['OFAC 50% Rule', 'FDL 10/2025 Art.31'],
    goldRationale:
      'OFAC 50% Rule: entities owned 50% or more by an SDN are treated as SDNs. 48% falls below the threshold. However, if two sanctioned persons together own ≥50%, the combined-ownership rule applies. Clarify full ownership structure before proceeding.',
    expectedTypologies: ['sanctions_ownership_evasion'],
  },
  {
    id: 'sa-005',
    cluster: 'sanctions_edge_cases',
    question: 'A vessel flagged in Marshall Islands, chartered by a Singapore company, requests insurance for a gold cargo. Vessel appears in the IMO high-risk shipping list. Risk?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.31', 'OFAC Advisory on Maritime Shipping', 'FATF Guidance on TBML'],
    goldRationale:
      'Marshall Islands open registry plus IMO high-risk flag is a TBML indicator for sanctions-evasion through ship-to-ship transfers. Screen both vessel and charterer. Do not issue insurance until vessel history and cargo origin are confirmed.',
    expectedJurisdictions: ['MH', 'SG'],
    expectedTypologies: ['vessel_sanctions_evasion'],
  },
  {
    id: 'sa-006',
    cluster: 'sanctions_edge_cases',
    question: 'Customer provides a gold purchase invoice denominated in Russian roubles from a Moscow-based refiner not on any sanctions list. Does this require further review?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['EU Regulation 833/2014', 'FDL 10/2025 Art.16', 'FATF R.10'],
    goldRationale:
      "Russian gold imports are subject to EU/UK/US sectoral prohibitions post-February 2022. Even if the specific refiner is not listed, the jurisdictional embargo applies to EU/UK/US-linked transactions. Determine the customer's applicable sanctions framework before proceeding.",
    expectedJurisdictions: ['RU'],
  },
  {
    id: 'sa-007',
    cluster: 'sanctions_edge_cases',
    question: 'Screening flags a close name variant of a UN-listed entity (transliteration difference: "Al-Rashid" vs "Al-Rasheed"). Treat as match?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['UNSCR Consolidated List guidance', 'FDL 10/2025 Art.31', 'FATF R.6'],
    goldRationale:
      'Transliteration variations are explicitly flagged in UNSCR consolidated list guidance as potential matches. Treat as a potential match pending human review. If additional identifiers (DOB, nationality, address) do not positively disqualify, escalate to MLRO.',
    expectedTypologies: ['transliteration_match'],
  },
  {
    id: 'sa-008',
    cluster: 'sanctions_edge_cases',
    question: 'Customer is a diplomat from a country currently under UAE targeted sanctions. Diplomatic immunity claim. Proceed?',
    goldVerdict: 'decline',
    goldConfidence: 5,
    goldCitations: ['FDL 10/2025 Art.31', 'UN Charter Art.105', 'Cabinet Decision 10/2019 Art.9'],
    goldRationale:
      'Diplomatic immunity under UN Charter Art.105 relates to legal process, not sanctions obligations. UAE FDL Art.31 applies to all persons including diplomats where the sanction is UN Security Council-mandated. Decline and refer to MLRO and UAE CBUAE for guidance.',
    expectedJurisdictions: [],
  },
  {
    id: 'sa-009',
    cluster: 'sanctions_edge_cases',
    question: 'An NGO operating in Sudan requests to purchase medical equipment supplies via a UAE trader. No SDN match. Proceed?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['OFAC General License guidance', 'FDL 10/2025 Art.31', 'FATF R.6'],
    goldRationale:
      "Sudan is subject to residual US targeted sanctions despite the 2017 relaxation. Humanitarian exceptions exist but require OFAC general-licence coverage analysis. Verify the specific NGO's licence status and nature of supplies before proceeding.",
    expectedJurisdictions: ['SD'],
  },
  {
    id: 'sa-010',
    cluster: 'sanctions_edge_cases',
    question: 'Post-delisting customer returns to establish a new account 14 months after removal from UNSC list. Enhanced due diligence obligations?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.18', 'FATF R.12', 'Cabinet Decision 10/2019 Art.7'],
    goldRationale:
      'Former UNSC listees are high-risk regardless of current status. EDD required; ongoing enhanced monitoring mandatory. Senior management approval needed for onboarding. 14-month gap does not reduce residual risk profile.',
  },
  {
    id: 'sa-011',
    cluster: 'sanctions_edge_cases',
    question: 'A screening hit is flagged as a "false positive" by the customer who presents a court judgment from a foreign jurisdiction purporting to clear the name. Accept?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['OFAC Guidance on Screening', 'FDL 10/2025 Art.31', 'FDL 10/2025 Art.16'],
    goldRationale:
      'A foreign court judgment does not override OFAC/UNSC/UAE list designations. Only the issuing authority (OFAC, UN 1267 Committee, UAE CBUAE) can delist. Treat as unresolved match; escalate to MLRO before proceeding.',
  },
  {
    id: 'sa-012',
    cluster: 'sanctions_edge_cases',
    question: 'Customer is a UAE national whose close family member (non-account holder) is an OFAC-designated person. Relationship implications?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['FDL 10/2025 Art.18', 'FDL 10/2025 Art.22', 'FATF R.10'],
    goldRationale:
      'Family member designation is not automatically attributed to the UAE national. However, potential for acting on behalf of or on instructions of the SDN warrants EDD. Screen for beneficial interest or control; consider enhanced monitoring of transaction patterns.',
    expectedTypologies: ['proxy_transactions'],
  },
  {
    id: 'sa-013',
    cluster: 'sanctions_edge_cases',
    question: 'Customer claims exemption from UAE targeted financial sanctions as a UAE government entity. Document requirement?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['FDL 10/2025 Art.33', 'Cabinet Decision 10/2019 Art.10', 'UAE CBUAE Circular 24/2020'],
    goldRationale:
      'Government-entity exemptions from targeted sanctions require formal confirmation from the UAE CBUAE or NFIU. Internal claims are insufficient. Request written CBUAE confirmation before proceeding and document in the CDD file.',
  },
  {
    id: 'sa-014',
    cluster: 'sanctions_edge_cases',
    question: 'A Chinese state-owned enterprise (SOE) involved in dual-use technology exports wishes to open a gold trading account. US BIS Entity List status unknown. Screening required?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['US Export Administration Regulations', 'FDL 10/2025 Art.31', 'FATF R.6'],
    goldRationale:
      'Chinese SOEs in dual-use technology sectors carry heightened US BIS Entity List risk. Screen against BIS Entity List, Denied Persons List, and OFAC. Even if not listed, EDD on end-use of gold required given dual-use SOE profile.',
    expectedJurisdictions: ['CN'],
  },
  {
    id: 'sa-015',
    cluster: 'sanctions_edge_cases',
    question: 'Customer is a North Korean national claiming residency in a third country. Should any transaction proceed?',
    goldVerdict: 'decline',
    goldConfidence: 5,
    goldCitations: ['UNSCR 1718', 'UNSCR 2321', 'FDL 10/2025 Art.31', 'FDL 10/2025 Art.32'],
    goldRationale:
      'North Korea (DPRK) is subject to comprehensive UNSC sanctions under UNSCR 1718/2321 with no general licences for precious-metals transactions. Third-country residency does not neutralise DPRK nationality designation. Decline; file STR.',
    expectedJurisdictions: ['KP'],
  },

  // ── UBO Assessment (10 scenarios) ─────────────────────────────────────────
  {
    id: 'ubo-001',
    cluster: 'ubo_assessment',
    question: 'A UAE LLC has six shareholders, none exceeding 25% individually, but three are connected by a family trust. UBO determination?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.12', 'Cabinet Decision 58/2020 Art.4', 'FATF R.24'],
    goldRationale:
      'Cabinet Decision 58/2020 requires aggregation of connected-party interests. If the family trust and the three shareholders constitute a single controlling group, their combined 75% share may meet the UBO threshold. Obtain trust deed to determine beneficiaries and control.',
  },
  {
    id: 'ubo-002',
    cluster: 'ubo_assessment',
    question: 'Nominee shareholder structure with undisclosed principals in a BVI company. FDL 10/2025 UBO disclosure requirements?',
    goldVerdict: 'escalate',
    goldConfidence: 5,
    goldCitations: ['FDL 10/2025 Art.12', 'Cabinet Decision 58/2020', 'FATF R.24', 'BVI Business Companies Act 2004'],
    goldRationale:
      'FDL Art.12 mandates look-through to natural-person UBOs. Nominee arrangements do not satisfy UBO disclosure; actual principals must be identified. If principals cannot be identified within prescribed timeframe, decline and file STR.',
  },
  {
    id: 'ubo-003',
    cluster: 'ubo_assessment',
    question: 'Customer is a listed company on Dubai Financial Market. Simplified due diligence applicable to UBO?',
    goldVerdict: 'proceed',
    goldConfidence: 3,
    goldCitations: ['FDL 10/2025 Art.14', 'Cabinet Decision 10/2019 Art.3', 'FATF R.10'],
    goldRationale:
      'FDL Art.14 permits simplified CDD for regulated entities subject to equivalent AML supervision, including regulated exchanges. DFM listing satisfies this; UBO look-through to all shareholders not required. Standard CDD on the entity itself still mandatory.',
  },
  {
    id: 'ubo-004',
    cluster: 'ubo_assessment',
    question: 'A foundation registered in Liechtenstein controls 60% of a UAE JAFZA entity. Foundation has no identifiable beneficiaries at formation stage. UBO?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.12', 'Cabinet Decision 58/2020', 'FATF Guidance on Beneficial Ownership para.3'],
    goldRationale:
      'Discretionary foundations without identified beneficiaries require identification of the founder, council members, and class of potential beneficiaries per FATF BO Guidance para.3. Liechtenstein foundation controlling 60% makes the foundation the UBO vehicle; its principals must be disclosed.',
    expectedJurisdictions: ['LI', 'AE'],
  },
  {
    id: 'ubo-005',
    cluster: 'ubo_assessment',
    question: 'Corporate customer updates UBO register removing a shareholder who was also on the FATF black-list watchlist. Can old information be purged?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.22', 'Cabinet Decision 10/2019 Art.8', 'FATF R.11'],
    goldRationale:
      'FATF R.11 and FDL Art.22 require retention of CDD records for 5 years after relationship end. A prior UBO who was on the FATF watchlist must remain documented. Purging records of a high-risk UBO is a record-keeping violation; flag to MLRO.',
  },
  {
    id: 'ubo-006',
    cluster: 'ubo_assessment',
    question: 'An investment fund with 200+ unit holders claims no single UBO exceeds 25%. Fund manager refuses to provide investor list citing confidentiality. Proceed?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.12', 'FDL 10/2025 Art.18', 'FATF R.24'],
    goldRationale:
      'For widely-held funds, FDL Art.12 permits senior management identification in lieu of full investor list, but only where the fund is regulated and CDD on the regulated fund manager is completed. If fund manager refuses to cooperate with AML controls, decline relationship.',
  },
  {
    id: 'ubo-007',
    cluster: 'ubo_assessment',
    question: 'A customer entity presents a corporate structure with seven intermediate holding companies across five jurisdictions before reaching natural persons. Adequate?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.12', 'Cabinet Decision 58/2020 Art.4', 'FATF R.24'],
    goldRationale:
      'Multi-layered structures of seven intermediaries across five jurisdictions are classic layering indicators. Full look-through required; document each layer. Consider enhanced monitoring for ongoing relationship given complexity.',
    expectedTypologies: ['shell_company_layering'],
  },
  {
    id: 'ubo-008',
    cluster: 'ubo_assessment',
    question: 'UBO of a UAE company is a senior government minister from a Gulf state. PEP classification and EDD scope?',
    goldVerdict: 'escalate',
    goldConfidence: 5,
    goldCitations: ['FDL 10/2025 Art.18', 'FDL 10/2025 Art.19', 'FATF R.12'],
    goldRationale:
      'Foreign PEPs receive mandatory EDD under FDL Art.18/19 regardless of Gulf state status. Senior minister = prominent public function under FATF R.12. Source-of-wealth and source-of-funds required. Senior management approval mandatory; ongoing enhanced monitoring.',
    expectedTypologies: ['pep_high_value'],
  },
  {
    id: 'ubo-009',
    cluster: 'ubo_assessment',
    question: "A customer's UBO was a PEP 3 years ago (former minister) and has since entered private business. Simplified PEP treatment applicable?",
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['FDL 10/2025 Art.19', 'FATF R.12 para.36', 'Cabinet Decision 10/2019 Art.7'],
    goldRationale:
      'FATF R.12 para.36 states risk is not automatically eliminated by leaving public office; risk-based approach applies. 3 years is insufficient to fully exit PEP treatment under UAE practice. Maintain enhanced monitoring; MLRO judgement on downgrade timing.',
    expectedTypologies: ['pep_high_value'],
  },
  {
    id: 'ubo-010',
    cluster: 'ubo_assessment',
    question: 'UBO holds citizenship of five countries including a FATF black-listed jurisdiction but resides and primarily operates in the UAE. Risk classification?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['FDL 10/2025 Art.18', 'FATF R.10', 'Cabinet Decision 134/2025 Art.8'],
    goldRationale:
      'Multiple citizenships including a FATF black-listed jurisdiction warrants EDD regardless of UAE residency. Risk is additive: all citizenship and residency profiles must be considered. Higher-risk classification persists while black-listed citizenship is retained.',
  },

  // ── Responsible Sourcing (5 scenarios) ────────────────────────────────────
  {
    id: 'rs-001',
    cluster: 'responsible_sourcing',
    question: 'A batch of recycled gold includes scrap from conflict-affected eastern DRC. RJC and LBMA responsible sourcing obligations?',
    goldVerdict: 'escalate',
    goldConfidence: 5,
    goldCitations: ['OECD Due Diligence Guidance Annex II', 'LBMA RGG v9 Step 2', 'RJC Code of Practices 2019 Clause 8'],
    goldRationale:
      'Eastern DRC is an Annex II high-risk area requiring full chain-of-custody trace under OECD DDG and LBMA RGG. RJC CoP 2019 Clause 8 mandates source verification. Conflict-sourced gold without full trace cannot be accepted.',
    expectedJurisdictions: ['CD'],
    expectedTypologies: ['cahra_origin_laundering'],
  },
  {
    id: 'rs-002',
    cluster: 'responsible_sourcing',
    question: 'A mine operator in West Africa claims Fairtrade gold certification but the certificate has expired by 4 months. Accept delivery?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['Fairtrade Gold Standard v2', 'LBMA RGG v9 Step 2', 'FDL 10/2025 Art.16'],
    goldRationale:
      'An expired Fairtrade certificate means the mine has not maintained current audit compliance. Until renewed certificate is provided, treat as uncertified. Do not accept delivery; notify supplier of requirement to provide renewed certification.',
  },
  {
    id: 'rs-003',
    cluster: 'responsible_sourcing',
    question: 'Artisanal mine in Burkina Faso supplies gold via a local aggregator who consolidates output from multiple sites. Chain-of-custody implications?',
    goldVerdict: 'escalate',
    goldConfidence: 4,
    goldCitations: ['OECD Due Diligence Guidance', 'LBMA RGG v9 Step 2', 'FATF Guidance DPMS'],
    goldRationale:
      'Aggregation of multi-site ASM output in a high-risk jurisdiction (Burkina Faso is FATF-monitored) breaks individual mine traceability. Each feeder site must be audited or the aggregator must operate under an IPIS or equivalent multi-site scheme. Obtain per-site source documentation.',
    expectedJurisdictions: ['BF'],
    expectedTypologies: ['cahra_origin_laundering'],
  },
  {
    id: 'rs-004',
    cluster: 'responsible_sourcing',
    question: 'A UAE refiner customer wants to re-export gold to Europe; the EU Battery Regulation requires proof of responsible sourcing from 2026. Does current documentation suffice?',
    goldVerdict: 'escalate',
    goldConfidence: 3,
    goldCitations: ['EU Battery Regulation 2023/1542', 'OECD Due Diligence Guidance', 'LBMA RGG v9'],
    goldRationale:
      'EU Battery Regulation Art.48-55 requires due-diligence disclosures aligned with OECD DDG for battery-material supply chains from 2026. Current LBMA RGG documentation may not fully satisfy EU disclosure requirements. Advise customer to begin gap analysis immediately.',
  },
  {
    id: 'rs-005',
    cluster: 'responsible_sourcing',
    question: 'A gold recycler sources scrap from electronic waste (e-waste) processors. Are OECD responsible sourcing obligations triggered?',
    goldVerdict: 'proceed',
    goldConfidence: 3,
    goldCitations: ['OECD Due Diligence Guidance para.1.3', 'LBMA RGG v9 Scope', 'FATF R.10'],
    goldRationale:
      'OECD DDG para.1.3 applies to gold from artisanal/small-scale and large-scale mines. E-waste recovery is a secondary source and generally outside OECD DDG mineral-extraction scope, though LBMA RGG scope covers all gold entering the market. Standard CDD applies; EDD not triggered solely by e-waste origin.',
  },
];

// Guard: minimum scenario count required for adequate eval coverage.
// Deleting scenarios must fail CI — this assertion prevents silent regression.
if (SEED_SCENARIOS.length < 50) {
  throw new Error(
    `eval-harness: SEED_SCENARIOS has ${SEED_SCENARIOS.length} entries — minimum is 50. Do not delete eval scenarios.`,
  );
}
