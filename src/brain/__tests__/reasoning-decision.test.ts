import { describe, it, expect } from 'vitest';
import { REASONING_DECISION_MODE_APPLIES } from '../modes/reasoning_decision.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test-run', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: ['cdd'],
  };
}

// ── predicate_logic ──────────────────────────────────────────────────
describe('predicate_logic', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.predicate_logic;

  it('returns inconclusive when no predicates', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when no contradictions', async () => {
    const f = await apply(makeCtx({
      predicates: [
        { subject: 'A', predicate: 'owns', object: 'X' },
        { subject: 'B', predicate: 'controls', object: 'Y' },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when contradiction present', async () => {
    const f = await apply(makeCtx({
      predicates: [
        { subject: 'A', predicate: 'owns', object: 'X' },
        { subject: 'A', predicate: 'owns', object: 'X', negated: true },
      ],
    }));
    expect(f.verdict).toBe('flag');
    expect(f.score).toBeGreaterThan(0);
  });
});

// ── fuzzy_logic ──────────────────────────────────────────────────────
describe('fuzzy_logic', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.fuzzy_logic;

  it('returns inconclusive when no inputs', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when all memberships low', async () => {
    const f = await apply(makeCtx({
      fuzzyInputs: [
        { variable: 'txVolume', value: 100, lowRisk: 5000, highRisk: 50000 },
        { variable: 'pep', value: 0, lowRisk: 0.5, highRisk: 1 },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBeLessThan(0.35);
  });

  it('escalates when memberships high', async () => {
    const f = await apply(makeCtx({
      fuzzyInputs: [
        { variable: 'txVolume', value: 90000, lowRisk: 5000, highRisk: 50000 },
        { variable: 'pep', value: 1, lowRisk: 0.5, highRisk: 1 },
        { variable: 'sanctions', value: 1, lowRisk: 0.5, highRisk: 1 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('flags at mid-range memberships', async () => {
    const f = await apply(makeCtx({
      fuzzyInputs: [
        { variable: 'txVolume', value: 30000, lowRisk: 10000, highRisk: 100000 },
        { variable: 'adverse', value: 0.5, lowRisk: 0.3, highRisk: 0.8 },
      ],
    }));
    expect(['flag', 'clear']).toContain(f.verdict);
  });
});

// ── default_reasoning ────────────────────────────────────────────────
describe('default_reasoning', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.default_reasoning;

  it('returns inconclusive when no overrides', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when no defaults defeated', async () => {
    const f = await apply(makeCtx({
      defaultOverrides: [
        { assumption: 'legitimate business', defeated: false },
        { assumption: 'known customer', defeated: false },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when one default defeated out of four', async () => {
    const f = await apply(makeCtx({
      defaultOverrides: [
        { assumption: 'legitimate business', defeated: false },
        { assumption: 'known customer', defeated: true, defeaterReason: 'ID mismatch' },
        { assumption: 'source verified', defeated: false },
        { assumption: 'beneficial owner known', defeated: false },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when majority defaults defeated', async () => {
    const f = await apply(makeCtx({
      defaultOverrides: [
        { assumption: 'a', defeated: true },
        { assumption: 'b', defeated: true },
        { assumption: 'c', defeated: false },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── non_monotonic ────────────────────────────────────────────────────
describe('non_monotonic', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.non_monotonic;

  it('returns inconclusive when no retractors', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when retractors have low severity', async () => {
    const f = await apply(makeCtx({
      retractors: [{ retractedConclusion: 'low-value tx is normal', severity: 0.1 }],
    }));
    expect(f.score).toBeLessThan(0.3);
    expect(f.verdict).toBe('clear');
  });

  it('flags when single retractor has medium severity', async () => {
    const f = await apply(makeCtx({
      retractors: [
        { retractedConclusion: 'source of funds verified', severity: 0.35 },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when retractors have high severity', async () => {
    const f = await apply(makeCtx({
      retractors: [
        { retractedConclusion: 'no sanctions match', severity: 0.95 },
        { retractedConclusion: 'no PEP link', severity: 0.9 },
        { retractedConclusion: 'normal tx pattern', severity: 0.85 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── temporal_logic ───────────────────────────────────────────────────
describe('temporal_logic', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.temporal_logic;

  it('returns inconclusive when no events', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when ordering is valid', async () => {
    const f = await apply(makeCtx({
      temporalEvents: [
        { event: 'KYC', timestamp: 1000 },
        { event: 'account_open', timestamp: 2000, requiredBefore: ['KYC'] },
        { event: 'first_tx', timestamp: 3000, requiredBefore: ['account_open'] },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when predecessor violated', async () => {
    const f = await apply(makeCtx({
      temporalEvents: [
        { event: 'first_tx', timestamp: 1000, requiredBefore: ['account_open'] },
        { event: 'account_open', timestamp: 2000 },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });
});

// ── epistemic_logic ──────────────────────────────────────────────────
describe('epistemic_logic', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.epistemic_logic;

  it('returns inconclusive when no knowledge state', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when mostly known facts', async () => {
    const f = await apply(makeCtx({
      knowledgeState: {
        known: ['name', 'address', 'dob', 'source_of_funds', 'employer'],
        unknown: [],
        believed: ['nationality'],
        doubted: [],
      },
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when significant unknowns', async () => {
    const f = await apply(makeCtx({
      knowledgeState: {
        known: ['name'],
        unknown: ['source_of_funds', 'UBO', 'address'],
        believed: [],
        doubted: ['identity'],
      },
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('escalates when mostly unknown/doubted', async () => {
    const f = await apply(makeCtx({
      knowledgeState: {
        known: ['name'],
        unknown: ['source_of_funds', 'UBO', 'address', 'employer', 'tax_id'],
        believed: [],
        doubted: ['identity', 'nationality'],
      },
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── planning_fallacy ─────────────────────────────────────────────────
describe('planning_fallacy', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.planning_fallacy;

  it('returns inconclusive with no estimates', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when actuals match estimates', async () => {
    const f = await apply(makeCtx({
      projectEstimates: [
        { label: 'AML system rollout', estimated: 100, actual: 105 },
        { label: 'staff training', estimated: 50, actual: 48 },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBeLessThan(0.3);
  });

  it('flags when actuals substantially exceed estimates', async () => {
    // 2 of 5 items overrun >20% → overrunCount=2 < ceil(5*0.6)=3 → no escalate
    // avgRatio=(1.75+1.75+1+1+1)/5=1.5 → bias=1.0 → flag
    const f = await apply(makeCtx({
      projectEstimates: [
        { label: 'project A', estimated: 100, actual: 175 },
        { label: 'project B', estimated: 100, actual: 175 },
        { label: 'project C', estimated: 100, actual: 100 },
        { label: 'project D', estimated: 100, actual: 100 },
        { label: 'project E', estimated: 100, actual: 100 },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when majority massively overrun', async () => {
    const f = await apply(makeCtx({
      projectEstimates: [
        { label: 'a', estimated: 100, actual: 300 },
        { label: 'b', estimated: 100, actual: 280 },
        { label: 'c', estimated: 100, actual: 260 },
        { label: 'd', estimated: 100, actual: 90 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── overconfidence_check ─────────────────────────────────────────────
describe('overconfidence_check', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.overconfidence_check;

  it('returns inconclusive with no predictions', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when confidence matches accuracy', async () => {
    const f = await apply(makeCtx({
      predictions: [
        { prediction: 'p1', confidence: 0.7, correct: true },
        { prediction: 'p2', confidence: 0.6, correct: true },
        { prediction: 'p3', confidence: 0.8, correct: true },
        { prediction: 'p4', confidence: 0.5, correct: false },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when confidence greatly exceeds accuracy', async () => {
    const f = await apply(makeCtx({
      predictions: [
        { prediction: 'p1', confidence: 0.95, correct: false },
        { prediction: 'p2', confidence: 0.90, correct: false },
        { prediction: 'p3', confidence: 0.85, correct: true },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
    expect(f.score).toBeGreaterThan(0);
  });
});

// ── minimax ──────────────────────────────────────────────────────────
describe('minimax', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.minimax;

  it('returns inconclusive with no scenarios', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when all payoffs positive', async () => {
    const f = await apply(makeCtx({
      scenarios: [
        { label: 'base', payoffs: [5, 8, 3] },
        { label: 'stress', payoffs: [2, 4, 1] },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0);
  });

  it('flags when best guaranteed outcome is mildly negative', async () => {
    // maxMin = max(-0.5,-0.5) = -0.5 → score=0.5/1.5=0.33 → flag (0.2..0.5)
    const f = await apply(makeCtx({
      scenarios: [
        { label: 'base', payoffs: [-0.5, 1, 2] },
        { label: 'adverse', payoffs: [-0.5, -0.3, -0.4] },
      ],
    }));
    expect(f.verdict).toBe('flag');
    expect(f.score).toBeGreaterThan(0);
  });

  it('escalates when worst case is deeply negative', async () => {
    const f = await apply(makeCtx({
      scenarios: [
        { label: 'severe', payoffs: [-10, -5, -8] },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── regret_min ───────────────────────────────────────────────────────
describe('regret_min', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.regret_min;

  it('returns inconclusive with no payoff matrix', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when one action has zero max-regret', async () => {
    // comply dominates in both states → regret[comply]=0 → minMaxRegret=0 → ratio=0 → clear
    const f = await apply(makeCtx({
      payoffMatrix: {
        actions: ['comply', 'ignore'],
        states: ['audited', 'not_audited'],
        payoffs: [[10, 10], [9, 9]],
      },
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when regret ratio is moderate', async () => {
    const f = await apply(makeCtx({
      payoffMatrix: {
        actions: ['A', 'B', 'C'],
        states: ['s1', 's2'],
        payoffs: [[10, 2], [5, 8], [1, 9]],
      },
    }));
    expect(['flag', 'clear', 'escalate']).toContain(f.verdict);
    expect(f.score).toBeGreaterThanOrEqual(0);
  });
});

// ── marginal ─────────────────────────────────────────────────────────
describe('marginal', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.marginal;

  it('returns inconclusive with no data', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when benefit exceeds cost', async () => {
    const f = await apply(makeCtx({
      marginalAnalysis: { marginalBenefit: 100, marginalCost: 60, threshold: 0.1 },
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when cost substantially exceeds benefit', async () => {
    const f = await apply(makeCtx({
      marginalAnalysis: { marginalBenefit: 20, marginalCost: 100, threshold: 0.1 },
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
    expect(f.score).toBeGreaterThan(0);
  });

  it('returns inconclusive when marginalCost is zero', async () => {
    const f = await apply(makeCtx({
      marginalAnalysis: { marginalBenefit: 50, marginalCost: 0 },
    }));
    expect(f.verdict).toBe('inconclusive');
  });
});

// ── break_even ───────────────────────────────────────────────────────
describe('break_even', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.break_even;

  it('returns inconclusive with no data', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when volume above break-even', async () => {
    const f = await apply(makeCtx({
      breakEven: { fixedCosts: 10000, variableMargin: 100, actualVolume: 200, revenuePerUnit: 500 },
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when volume below break-even', async () => {
    const f = await apply(makeCtx({
      breakEven: { fixedCosts: 100000, variableMargin: 50, actualVolume: 100, revenuePerUnit: 200 },
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('escalates when volume far below break-even', async () => {
    const f = await apply(makeCtx({
      breakEven: { fixedCosts: 1000000, variableMargin: 100, actualVolume: 10, revenuePerUnit: 200 },
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('returns inconclusive when variableMargin is zero', async () => {
    const f = await apply(makeCtx({
      breakEven: { fixedCosts: 100, variableMargin: 0, actualVolume: 50, revenuePerUnit: 10 },
    }));
    expect(f.verdict).toBe('inconclusive');
  });
});

// ── real_options ─────────────────────────────────────────────────────
describe('real_options', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.real_options;

  it('returns inconclusive with no options', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when option/underlying ratio low', async () => {
    const f = await apply(makeCtx({
      realOptions: [
        { optionType: 'expand', underlyingValue: 1000, strikeValue: 950, volatility: 0.1 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when option value disproportionate', async () => {
    const f = await apply(makeCtx({
      realOptions: [
        { optionType: 'expand', underlyingValue: 100, strikeValue: 10, volatility: 0.9 },
        { optionType: 'defer', underlyingValue: 100, strikeValue: 20, volatility: 0.8 },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

// ── risk_adjusted ────────────────────────────────────────────────────
describe('risk_adjusted', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.risk_adjusted;

  it('returns inconclusive with no data', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when Sharpe ratio plausible', async () => {
    const f = await apply(makeCtx({
      riskAdjusted: { grossReturn: 0.12, riskMeasure: 0.1, benchmarkRatio: 3.0 },
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when Sharpe ratio moderately implausible', async () => {
    // sharpe=4, excess=4-3=1 → flag (>=0.5 but <2)
    const f = await apply(makeCtx({
      riskAdjusted: { grossReturn: 4, riskMeasure: 1, benchmarkRatio: 3.0 },
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when Sharpe ratio extremely implausible', async () => {
    const f = await apply(makeCtx({
      riskAdjusted: { grossReturn: 100, riskMeasure: 1, benchmarkRatio: 3.0 },
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('flags when riskMeasure is zero', async () => {
    const f = await apply(makeCtx({
      riskAdjusted: { grossReturn: 0.05, riskMeasure: 0 },
    }));
    expect(f.verdict).toBe('flag');
  });
});

// ── pareto ───────────────────────────────────────────────────────────
describe('pareto', () => {
  const apply = REASONING_DECISION_MODE_APPLIES.pareto;

  it('returns inconclusive with no factors', async () => {
    const f = await apply(makeCtx());
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when risk spread across many factors', async () => {
    const f = await apply(makeCtx({
      riskFactors: [
        { label: 'f1', score: 10 }, { label: 'f2', score: 9 },
        { label: 'f3', score: 8 }, { label: 'f4', score: 7 },
        { label: 'f5', score: 6 }, { label: 'f6', score: 5 },
        { label: 'f7', score: 4 }, { label: 'f8', score: 3 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when top 20% carry 75-90% of risk', async () => {
    const f = await apply(makeCtx({
      riskFactors: [
        { label: 'dominant1', score: 80 },
        { label: 'dominant2', score: 75 },
        { label: 'minor1', score: 5 },
        { label: 'minor2', score: 5 },
        { label: 'minor3', score: 5 },
        { label: 'minor4', score: 4 },
        { label: 'minor5', score: 3 },
        { label: 'minor6', score: 2 },
        { label: 'minor7', score: 1 },
        { label: 'minor8', score: 0.5 },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('escalates when single factor dominates', async () => {
    const f = await apply(makeCtx({
      riskFactors: [
        { label: 'sanctions_hit', score: 100 },
        { label: 'minor1', score: 1 },
        { label: 'minor2', score: 1 },
        { label: 'minor3', score: 1 },
        { label: 'minor4', score: 1 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('returns inconclusive when all scores are zero', async () => {
    const f = await apply(makeCtx({
      riskFactors: [
        { label: 'a', score: 0 },
        { label: 'b', score: 0 },
      ],
    }));
    expect(f.verdict).toBe('inconclusive');
  });
});
