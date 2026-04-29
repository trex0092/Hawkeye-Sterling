import { describe, it, expect } from 'vitest';
import { FORENSIC_STRATEGIC_MODE_APPLIES } from '../modes/forensic_strategic.js';
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

// ── swiss_cheese ─────────────────────────────────────────────────────
describe('swiss_cheese', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.swiss_cheese;

  it('returns inconclusive with no layers', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when no layers have holes', async () => {
    const f = await apply(makeCtx({
      defenceLayers: [
        { name: 'KYC', holesPresent: false },
        { name: 'TM', holesPresent: false },
        { name: 'sanctions', holesPresent: false },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when one layer has a low-severity hole', async () => {
    const f = await apply(makeCtx({
      defenceLayers: [
        { name: 'KYC', holesPresent: true, holeSeverity: 0.4 },
        { name: 'TM', holesPresent: false },
        { name: 'sanctions', holesPresent: false },
        { name: 'EDD', holesPresent: false },
      ],
    }));
    expect(['flag', 'clear']).toContain(f.verdict);
  });

  it('escalates when majority of layers have high-severity holes', async () => {
    const f = await apply(makeCtx({
      defenceLayers: [
        { name: 'KYC', holesPresent: true, holeSeverity: 0.9 },
        { name: 'TM', holesPresent: true, holeSeverity: 0.8 },
        { name: 'sanctions', holesPresent: false },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── porter_adapted ───────────────────────────────────────────────────
describe('porter_adapted', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.porter_adapted;

  it('returns inconclusive with no forces', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when all forces low risk', async () => {
    const f = await apply(makeCtx({
      fiveForces: [
        { force: 'supplier_power', riskLevel: 0.1 },
        { force: 'buyer_power', riskLevel: 0.2 },
        { force: 'substitutes', riskLevel: 0.1 },
        { force: 'new_entrants', riskLevel: 0.15 },
        { force: 'rivalry', riskLevel: 0.1 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when average risk is moderate', async () => {
    const f = await apply(makeCtx({
      fiveForces: [
        { force: 'supplier_power', riskLevel: 0.4 },
        { force: 'buyer_power', riskLevel: 0.45 },
        { force: 'substitutes', riskLevel: 0.3 },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when average risk is high', async () => {
    const f = await apply(makeCtx({
      fiveForces: [
        { force: 'supplier_power', riskLevel: 0.8 },
        { force: 'buyer_power', riskLevel: 0.7 },
        { force: 'rivalry', riskLevel: 0.9 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── regression ───────────────────────────────────────────────────────
describe('regression', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.regression;

  it('returns inconclusive with no residuals', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when no outliers', async () => {
    const f = await apply(makeCtx({
      regressionResiduals: [
        { observation: 'tx1', residual: 1.0 },
        { observation: 'tx2', residual: -0.8 },
        { observation: 'tx3', residual: 1.2 },
        { observation: 'tx4', residual: -1.1 },
        { observation: 'tx5', residual: 0.9 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when outlier present', async () => {
    const f = await apply(makeCtx({
      regressionResiduals: [
        { observation: 'tx1', residual: 1.0 },
        { observation: 'tx2', residual: 1.1 },
        { observation: 'tx3', residual: 0.9 },
        { observation: 'tx4', residual: 1.2 },
        { observation: 'tx5', residual: 100.0, leverage: 0.8 }, // high leverage + extreme outlier
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

// ── time_series ──────────────────────────────────────────────────────
describe('time_series', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.time_series;

  it('returns inconclusive with fewer than 3 points', async () => {
    expect((await apply(makeCtx({ timeSeries: [{ t: 1, value: 5 }] }))).verdict).toBe('inconclusive');
  });

  it('clears when stable series', async () => {
    const f = await apply(makeCtx({
      timeSeries: [
        { t: 1, value: 100 }, { t: 2, value: 102 }, { t: 3, value: 101 },
        { t: 4, value: 103 }, { t: 5, value: 100 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when strong upward trend detected', async () => {
    const f = await apply(makeCtx({
      timeSeries: [
        { t: 1, value: 10 }, { t: 2, value: 50 }, { t: 3, value: 100 },
        { t: 4, value: 200 }, { t: 5, value: 400 },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

// ── markov_chain ─────────────────────────────────────────────────────
describe('markov_chain', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.markov_chain;

  it('returns inconclusive with no transitions', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when all transitions within expected range', async () => {
    const f = await apply(makeCtx({
      stateTransitions: [
        { from: 'active', to: 'dormant', observed: 10, expected: 10 },
        { from: 'dormant', to: 'active', observed: 8, expected: 9 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when anomalous transitions present', async () => {
    const f = await apply(makeCtx({
      stateTransitions: [
        { from: 'normal', to: 'suspicious', observed: 50, expected: 5 },
        { from: 'active', to: 'dormant', observed: 10, expected: 10 },
        { from: 'dormant', to: 'active', observed: 1, expected: 15 },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

// ── survival ─────────────────────────────────────────────────────────
describe('survival', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.survival;

  it('returns inconclusive with no events', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when no events occurred', async () => {
    const f = await apply(makeCtx({
      survivalEvents: [
        { id: 's1', duration: 30, event: false },
        { id: 's2', duration: 60, event: false },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when high event rate with short duration', async () => {
    const f = await apply(makeCtx({
      survivalEvents: [
        { id: 's1', duration: 5, event: true },
        { id: 's2', duration: 3, event: true },
        { id: 's3', duration: 60, event: false },
        { id: 's4', duration: 90, event: false },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

// ── mdl ──────────────────────────────────────────────────────────────
describe('mdl', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.mdl;

  it('returns inconclusive with no candidates', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when best model is significantly simpler', async () => {
    const f = await apply(makeCtx({
      mdlCandidates: [
        { modelId: 'simple', modelBits: 10, dataBits: 20 },
        { modelId: 'complex', modelBits: 100, dataBits: 5 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when best model nearly as complex as worst', async () => {
    // complexity=90/105=0.857 ≥ 0.85 → flag; modelBits(50) not > dataBits(45)*2=90 → no escalate
    const f = await apply(makeCtx({
      mdlCandidates: [
        { modelId: 'modelA', modelBits: 50, dataBits: 45 },
        { modelId: 'modelB', modelBits: 55, dataBits: 55 },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });
});

// ── occam ─────────────────────────────────────────────────────────────
describe('occam', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.occam;

  it('returns inconclusive with no hypotheses', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when simplest hypothesis is selected', async () => {
    const f = await apply(makeCtx({
      hypotheses: [
        { id: 'simple', explanatoryPower: 0.8, complexity: 1, selected: true },
        { id: 'complex', explanatoryPower: 0.85, complexity: 5 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when unnecessarily complex hypothesis is selected', async () => {
    const f = await apply(makeCtx({
      hypotheses: [
        { id: 'simple', explanatoryPower: 0.8, complexity: 1 },
        { id: 'complex', explanatoryPower: 0.82, complexity: 10, selected: true },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });
});

// ── motif_detection ──────────────────────────────────────────────────
describe('motif_detection', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.motif_detection;

  it('returns inconclusive with no motifs', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when motif frequencies within expected', async () => {
    const f = await apply(makeCtx({
      graphMotifs: [
        { motifType: 'star', count: 5, expectedCount: 5 },
        { motifType: 'funnel', count: 3, expectedCount: 4 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when motif frequency exceeds 2× expected', async () => {
    const f = await apply(makeCtx({
      graphMotifs: [
        { motifType: 'star', count: 20, expectedCount: 5 },
        { motifType: 'funnel', count: 3, expectedCount: 4 },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

// ── shortest_path ────────────────────────────────────────────────────
describe('shortest_path', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.shortest_path;

  it('returns inconclusive with no data', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('escalates when subject IS the high-risk node (0 hops)', async () => {
    const f = await apply(makeCtx({
      shortestPath: { hops: 0, targetNodeRisk: 1.0 },
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('clears when many hops away from low-risk node', async () => {
    const f = await apply(makeCtx({
      shortestPath: { hops: 10, targetNodeRisk: 0.2 },
    }));
    expect(f.verdict).toBe('clear');
  });

  it('escalates when 1 hop from high-risk node', async () => {
    const f = await apply(makeCtx({
      shortestPath: { hops: 1, targetNodeRisk: 0.9 },
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── stride ───────────────────────────────────────────────────────────
describe('stride', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.stride;

  it('returns inconclusive with no threats', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when no threats present', async () => {
    const f = await apply(makeCtx({
      strideThreats: [
        { category: 'spoofing', present: false },
        { category: 'tampering', present: false },
        { category: 'repudiation', present: false },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when 1-2 threats present', async () => {
    const f = await apply(makeCtx({
      strideThreats: [
        { category: 'spoofing', present: true, severity: 0.4 },
        { category: 'tampering', present: false },
        { category: 'repudiation', present: false },
        { category: 'info_disclosure', present: false },
        { category: 'dos', present: false },
        { category: 'elevation', present: false },
      ],
    }));
    expect(['flag', 'clear']).toContain(f.verdict);
  });

  it('escalates when many high-severity threats present', async () => {
    const f = await apply(makeCtx({
      strideThreats: [
        { category: 'spoofing', present: true, severity: 0.9 },
        { category: 'tampering', present: true, severity: 0.8 },
        { category: 'repudiation', present: true, severity: 0.7 },
        { category: 'info_disclosure', present: true, severity: 0.8 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── pasta ─────────────────────────────────────────────────────────────
describe('pasta', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.pasta;

  it('returns inconclusive with no stages', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when all stages low risk', async () => {
    const f = await apply(makeCtx({
      pastaStages: [
        { stage: 1, riskScore: 0.1 }, { stage: 2, riskScore: 0.1 },
        { stage: 3, riskScore: 0.2 }, { stage: 4, riskScore: 0.1 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('escalates when late-stage risks are high', async () => {
    const f = await apply(makeCtx({
      pastaStages: [
        { stage: 5, riskScore: 0.8 },
        { stage: 6, riskScore: 0.7 },
        { stage: 7, riskScore: 0.9 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── mitre_attack ─────────────────────────────────────────────────────
describe('mitre_attack', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.mitre_attack;

  it('returns inconclusive with no findings', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears with single low-confidence finding', async () => {
    const f = await apply(makeCtx({
      mitreFindings: [{ tactic: 'initial_access', technique: 'T1078', confidence: 0.3 }],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags with one high-confidence finding', async () => {
    const f = await apply(makeCtx({
      mitreFindings: [
        { tactic: 'initial_access', technique: 'T1078', confidence: 0.8 },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates with multiple tactics and high confidence', async () => {
    const f = await apply(makeCtx({
      mitreFindings: [
        { tactic: 'initial_access', technique: 'T1078', confidence: 0.9 },
        { tactic: 'persistence', technique: 'T1098', confidence: 0.8 },
        { tactic: 'exfiltration', technique: 'T1041', confidence: 0.7 },
        { tactic: 'impact', technique: 'T1485', confidence: 0.85 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── tabletop_exercise ─────────────────────────────────────────────────
describe('tabletop_exercise', () => {
  const apply = FORENSIC_STRATEGIC_MODE_APPLIES.tabletop_exercise;

  it('returns inconclusive with no results', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when high detection rate and fast response', async () => {
    const f = await apply(makeCtx({
      tabletopResults: [
        { scenario: 'phishing', detected: true, responseTimeMin: 10, gapsIdentified: [] },
        { scenario: 'insider', detected: true, responseTimeMin: 15, gapsIdentified: [] },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when some gaps and moderate response time', async () => {
    const f = await apply(makeCtx({
      tabletopResults: [
        { scenario: 'phishing', detected: true, responseTimeMin: 35, gapsIdentified: ['logging'] },
        { scenario: 'insider', detected: false, responseTimeMin: 45, gapsIdentified: ['monitoring'] },
        { scenario: 'fraud', detected: true, responseTimeMin: 20, gapsIdentified: [] },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('escalates when low detection rate', async () => {
    const f = await apply(makeCtx({
      tabletopResults: [
        { scenario: 'A', detected: false, responseTimeMin: 90, gapsIdentified: ['g1', 'g2'] },
        { scenario: 'B', detected: false, responseTimeMin: 120, gapsIdentified: ['g3'] },
        { scenario: 'C', detected: true, responseTimeMin: 30, gapsIdentified: [] },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});
