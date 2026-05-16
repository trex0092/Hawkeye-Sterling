// Hawkeye Sterling — game-theoretic evader simulator (audit follow-up #43).
//
// Models AML/sanctions screening as a game between the agent (defender)
// and an evader (attacker). Given the agent's current detection
// thresholds + mode mix, simulates the evader's optimal response —
// what evasion strategy maximises P(undetected) given the screening
// surface? Surfaces strategies that are NEAR-OPTIMAL for the evader,
// so the defender can pre-emptively raise thresholds where they're
// most-evadable.
//
// Strategies modelled:
//   · structuring               — splits below threshold
//   · jurisdictional layering   — route through low-risk jurisdictions
//   · nominee directors         — opacity in UBO chain
//   · timing dispersion         — spread transactions over time
//   · channel mixing            — bank + crypto + cash
//   · nominal substitution      — different name spelling on docs
//   · phantom employment        — fake role string to defeat PEP classifier
//
// Each strategy has a cost (to the evader) and a P(undetected | agent
// configuration). The simulator evaluates the evader's expected
// utility = P(undetected) - cost, and ranks strategies. The agent then
// knows where its weakness is.

export type EvaderStrategy =
  | 'structuring'
  | 'jurisdictional_layering'
  | 'nominee_directors'
  | 'timing_dispersion'
  | 'channel_mixing'
  | 'nominal_substitution'
  | 'phantom_employment';

export interface AgentConfiguration {
  /** Which modes are active in the screening pipeline. */
  activeModes: string[];
  /** Effective threshold for the structuring detector (e.g. AED). */
  structuringThresholdAed?: number;
  /** Whether ubo_tree_walk is wired to entity-graph (centralised taint). */
  uboGraphWired?: boolean;
  /** Whether mixer_forensics is implemented (vs stub). */
  mixerForensicsActive?: boolean;
  /** Whether cross_regime_conflict fires on split-regime cases. */
  crossRegimeActive?: boolean;
  /** Whether classifyPepRole is wired to the context builder. */
  pepClassifierWired?: boolean;
}

export interface StrategyEvaluation {
  strategy: EvaderStrategy;
  pUndetected: number;            // 0..1 — given agent config
  evaderCost: number;             // 0..1 — how expensive the strategy is for the evader
  expectedUtility: number;        // pUndetected - evaderCost  (higher = more attractive to evader)
  rationale: string;
  defenderRecommendation: string;
}

interface StrategyHeuristic {
  strategy: EvaderStrategy;
  baselinePUndetected: number;
  baselineCost: number;
  /** Adjustment when a specific mode is active. Reduces P(undetected). */
  modeImpact: Partial<Record<string, number>>;
  /** Adjustment when a config flag is enabled. */
  configImpact: Partial<Record<keyof AgentConfiguration, number>>;
  rationale: string;
  defenderRecommendation: string;
}

const HEURISTICS: StrategyHeuristic[] = [
  {
    strategy: 'structuring',
    baselinePUndetected: 0.55,
    baselineCost: 0.20,
    modeImpact: { cash_courier_ctn: -0.30, velocity_analysis: -0.25, kpi_dpms_thirty: -0.20 },
    configImpact: { structuringThresholdAed: -0.10 },
    rationale: 'Splits below the cash-reporting threshold; defeats single-transaction screening.',
    defenderRecommendation: 'Lower structuringThresholdAed + ensure cash_courier_ctn fires.',
  },
  {
    strategy: 'jurisdictional_layering',
    baselinePUndetected: 0.50,
    baselineCost: 0.50,
    modeImpact: { jurisdiction_cascade: -0.35, ubo_tree_walk: -0.20, sanctions_regime_matrix: -0.15 },
    configImpact: { crossRegimeActive: -0.20 },
    rationale: 'Routes funds through low-risk jurisdictions to defeat regime-matrix scoring.',
    defenderRecommendation: 'Activate cross_regime_conflict + raise weight on jurisdiction_cascade.',
  },
  {
    strategy: 'nominee_directors',
    baselinePUndetected: 0.65,
    baselineCost: 0.30,
    modeImpact: { ubo_tree_walk: -0.35 },
    configImpact: { uboGraphWired: -0.25 },
    rationale: 'Layers nominee directors to obscure UBO; defeats hand-rolled UBO walks.',
    defenderRecommendation: 'Wire ubo_tree_walk through entity-graph (centralised nominee taint).',
  },
  {
    strategy: 'timing_dispersion',
    baselinePUndetected: 0.45,
    baselineCost: 0.10,
    modeImpact: { velocity_analysis: -0.30 },
    configImpact: {},
    rationale: 'Spreads structured transactions over weeks/months to defeat velocity windows.',
    defenderRecommendation: 'Extend velocity_analysis lookback window beyond 30 days.',
  },
  {
    strategy: 'channel_mixing',
    baselinePUndetected: 0.60,
    baselineCost: 0.40,
    modeImpact: { mixer_forensics: -0.30, utxo_clustering: -0.20, cash_courier_ctn: -0.15 },
    configImpact: { mixerForensicsActive: -0.25 },
    rationale: 'Mixes bank wires + crypto + cash to fragment the trail across screening surfaces.',
    defenderRecommendation: 'Activate mixer_forensics + utxo_clustering + integrate transactions across channels.',
  },
  {
    strategy: 'nominal_substitution',
    baselinePUndetected: 0.40,
    baselineCost: 0.05,
    modeImpact: { list_walk: -0.10 },
    configImpact: {},
    rationale: 'Different name spelling on docs vs sanctions list; relies on weak fuzzy matching.',
    defenderRecommendation: 'Activate cross-script transliteration + double-metaphone phonetic match.',
  },
  {
    strategy: 'phantom_employment',
    baselinePUndetected: 0.50,
    baselineCost: 0.20,
    modeImpact: { classify_pep: -0.40 },
    configImpact: { pepClassifierWired: -0.30 },
    rationale: 'Fake "professor" / "consultant" role string to defeat PEP classification.',
    defenderRecommendation: 'Wire classifyPepRole into mlro-context-builder (already shipped) + cross-check role against external public-source.',
  },
];

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

/** Evaluate every modelled strategy against the agent configuration.
 *  Returns strategies sorted by descending expected utility (most
 *  attractive to the evader first). */
export function simulateEvader(config: AgentConfiguration): StrategyEvaluation[] {
  const out: StrategyEvaluation[] = [];
  for (const h of HEURISTICS) {
    let pUndetected = h.baselinePUndetected;
    for (const [mode, delta] of Object.entries(h.modeImpact)) {
      if (config.activeModes.includes(mode)) pUndetected += delta ?? 0;
    }
    for (const [key, delta] of Object.entries(h.configImpact)) {
      if (config[key as keyof AgentConfiguration]) pUndetected += delta ?? 0;
    }
    const pUndetectedClamped = clamp01(pUndetected);
    const expectedUtility = pUndetectedClamped - h.baselineCost;
    out.push({
      strategy: h.strategy,
      pUndetected: pUndetectedClamped,
      evaderCost: h.baselineCost,
      expectedUtility,
      rationale: h.rationale,
      defenderRecommendation: h.defenderRecommendation,
    });
  }
  return out.sort((a, b) => b.expectedUtility - a.expectedUtility);
}

/** Convenience: return only strategies whose expectedUtility exceeds
 *  the threshold — the actionable defender attention list. */
export function topEvaderThreats(config: AgentConfiguration, threshold = 0.2): StrategyEvaluation[] {
  return simulateEvader(config).filter((s) => s.expectedUtility >= threshold);
}
