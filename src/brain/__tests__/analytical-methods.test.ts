import { describe, expect, it } from 'vitest';
import { ANALYTICAL_METHODS_MODE_APPLIES } from '../modes/analytical_methods.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}, domains: string[] = ['cdd']): BrainContext {
  return {
    run: { id: 'r-am', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains,
  };
}

describe('analytical_methods — attack_tree', () => {
  it('inconclusive without leaves', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.attack_tree!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on high-residual path', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.attack_tree!(makeCtx({
      attackLeaves: [{ branch: 'phishing', successP: 0.9, detectionP: 0.1, impact: 0.9, sourceRef: 'a-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('analytical_methods — bowtie', () => {
  it('inconclusive without assembly', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.bowtie!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on thin both sides + high impact', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.bowtie!(makeCtx({
      bowtie: { topEvent: 'TFS breach', preventiveControls: 1, preventiveEffectiveness: 0.2, mitigativeControls: 1, mitigativeEffectiveness: 0.2, worstConsequenceImpact: 0.95, sourceRef: 'b-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('analytical_methods — fmea', () => {
  it('inconclusive without items', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.fmea!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on RPN >= 200', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.fmea!(makeCtx({
      fmeaItems: [{ failureMode: 'late STR', severity: 9, occurrence: 5, detection: 6, sourceRef: 'f-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('analytical_methods — fair', () => {
  it('inconclusive without assembly', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.fair!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on ALE > 2× appetite', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.fair!(makeCtx({
      fairAssembly: { lossEventFrequency: 4, lossMagnitudeMin: 100000, lossMagnitudeMostLikely: 500000, lossMagnitudeMax: 2000000, appetiteAleUsd: 500000, sourceRef: 'fa-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('analytical_methods — defence_in_depth', () => {
  it('inconclusive without layers', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.defence_in_depth!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on single-layer path', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.defence_in_depth!(makeCtx({
      defenceLayers: [{ threatPath: 'wire-fraud', layerCount: 1, layerEffectiveness: 0.9, sourceRef: 'd-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('analytical_methods — expected_utility', () => {
  it('inconclusive without probe', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.expected_utility!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('clears when chosen action is EU-optimal', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.expected_utility!(makeCtx({
      euProbe: {
        alternatives: [
          { action: 'escalate', scenarios: [{ probability: 0.5, utility: 10 }, { probability: 0.5, utility: -2 }] },
          { action: 'clear',    scenarios: [{ probability: 0.5, utility: 0 }, { probability: 0.5, utility: -8 }] },
        ],
        chosen: 'escalate',
        sourceRef: 'eu-1',
      },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('analytical_methods — maximin', () => {
  it('inconclusive without probe', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.maximin!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('flags when chosen action is dominated', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.maximin!(makeCtx({
      maximinProbe: {
        alternatives: [
          { action: 'A', worstCasePayoff: -100 },
          { action: 'B', worstCasePayoff: 50 },
        ],
        chosen: 'A',
        sourceRef: 'mm-1',
      },
    }));
    expect(out.verdict).toBe('flag');
  });
});

describe('analytical_methods — cost_benefit', () => {
  it('inconclusive without probe', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.cost_benefit!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('flags when chosen programme has lower NPV', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.cost_benefit!(makeCtx({
      costBenefitProbe: {
        programmes: [
          { name: 'A', oneTimeCostUsd: 100000, recurringCostUsdPerYear: 10000, benefitUsdPerYear: 50000, horizonYears: 5, sourceRef: 'cb-1' },
          { name: 'B', oneTimeCostUsd: 200000, recurringCostUsdPerYear: 5000, benefitUsdPerYear: 30000, horizonYears: 5, sourceRef: 'cb-2' },
        ],
        chosen: 'B',
        sourceRef: 'cb-3',
      },
    }));
    expect(out.verdict).toBe('flag');
  });
});

describe('analytical_methods — fermi', () => {
  it('inconclusive without probe', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.fermi!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('flags estimate >1 order of magnitude off', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.fermi!(makeCtx({
      fermiProbe: { question: 'STRs/year', factors: [10, 100, 5], analystEstimate: 500000, sourceRef: 'fm-1' },
    }));
    expect(out.verdict).toBe('flag');
  });
});

describe('analytical_methods — centrality', () => {
  it('inconclusive without nodes', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.centrality!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on unexpected hub', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.centrality!(makeCtx({
      nodeCentralities: [{ nodeId: 'node-X', degree: 50, betweennessNormalised: 0.9, isExpected: false, sourceRef: 'n-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('analytical_methods — hmm', () => {
  it('inconclusive without observations', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.hmm!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on very-rare transitions', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.hmm!(makeCtx({
      hmmObservations: [{ fromState: 'idle', toState: 'high-volume', transitionProb: 0.005, observedThisCase: true, sourceRef: 'h-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('analytical_methods — kl_divergence', () => {
  it('inconclusive without probe', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.kl_divergence!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on heavy drift', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.kl_divergence!(makeCtx({
      klProbe: {
        metric: 'tx-amounts',
        bins: [
          { label: 'low',  reference: 800, observed: 100 },
          { label: 'mid',  reference: 150, observed: 200 },
          { label: 'high', reference: 50,  observed: 700 },
        ],
        thresholdNats: 0.1,
        sourceRef: 'kl-1',
      },
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('analytical_methods — lbma_rgg_five_step', () => {
  it('inconclusive without steps', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.lbma_rgg_five_step!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on missing step', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.lbma_rgg_five_step!(makeCtx({
      rggSteps: [
        { step: 1, status: 'complete', evidenceCount: 12, sourceRef: 'r-1' },
        { step: 2, status: 'complete', evidenceCount: 8,  sourceRef: 'r-2' },
        { step: 3, status: 'missing',  evidenceCount: 0,  sourceRef: 'r-3' },
        { step: 4, status: 'partial',  evidenceCount: 2,  sourceRef: 'r-4' },
        { step: 5, status: 'partial',  evidenceCount: 1,  sourceRef: 'r-5' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('analytical_methods — mev_scan', () => {
  it('inconclusive without events', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.mev_scan!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on aggregate loss >= USD 50k', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.mev_scan!(makeCtx({
      mevEvents: [
        { txHash: 'tx-1', pattern: 'sandwich', victimLossUsd: 30000, attackerProfitUsd: 28000, sourceRef: 'm-1' },
        { txHash: 'tx-2', pattern: 'sandwich', victimLossUsd: 25000, attackerProfitUsd: 22000, sourceRef: 'm-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('analytical_methods — article_by_article', () => {
  it('inconclusive without walks', async () => {
    expect((await ANALYTICAL_METHODS_MODE_APPLIES.article_by_article!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on unsatisfied applicable article', async () => {
    const out = await ANALYTICAL_METHODS_MODE_APPLIES.article_by_article!(makeCtx({
      articleWalks: [
        { framework: 'FDL 10/2025', article: 'Art.13', applicable: true,  satisfied: false, sourceRef: 'w-1' },
        { framework: 'FDL 10/2025', article: 'Art.15', applicable: true,  satisfied: true,  sourceRef: 'w-2' },
        { framework: 'FATF',         article: 'R.10',   applicable: false, satisfied: null,  sourceRef: 'w-3' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});
