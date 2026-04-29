import { describe, it, expect } from 'vitest';
import { GOVERNANCE_CRYPTO_MODE_APPLIES } from '../modes/governance_crypto.js';
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

// ── octave ───────────────────────────────────────────────────────────
describe('octave', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.octave;

  it('returns inconclusive with no assets', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when all assets mitigated or low risk', async () => {
    const f = await apply(makeCtx({
      octaveAssets: [
        { asset: 'customer_db', threatLevel: 0.3, vulnerability: 0.3, mitigated: true },
        { asset: 'payment_system', threatLevel: 0.4, vulnerability: 0.2, mitigated: true },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when one unmitigated critical asset', async () => {
    const f = await apply(makeCtx({
      octaveAssets: [
        { asset: 'customer_db', threatLevel: 0.7, vulnerability: 0.7, mitigated: false },
        { asset: 'email', threatLevel: 0.2, vulnerability: 0.2, mitigated: true },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when multiple unmitigated critical assets', async () => {
    const f = await apply(makeCtx({
      octaveAssets: [
        { asset: 'db', threatLevel: 0.8, vulnerability: 0.9, mitigated: false },
        { asset: 'api', threatLevel: 0.7, vulnerability: 0.8, mitigated: false },
        { asset: 'email', threatLevel: 0.3, vulnerability: 0.3, mitigated: false },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── seasonality ──────────────────────────────────────────────────────
describe('seasonality', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.seasonality;

  it('returns inconclusive with fewer than 3 buckets', async () => {
    expect((await apply(makeCtx({ activityBuckets: [{ period: 'Jan', value: 5 }] }))).verdict).toBe('inconclusive');
  });

  it('clears when values are stable', async () => {
    const f = await apply(makeCtx({
      activityBuckets: [
        { period: 'Jan', value: 100 }, { period: 'Feb', value: 102 },
        { period: 'Mar', value: 98 }, { period: 'Apr', value: 101 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when clear spike present', async () => {
    const f = await apply(makeCtx({
      activityBuckets: [
        { period: 'Jan', value: 10 }, { period: 'Feb', value: 12 },
        { period: 'Mar', value: 11 }, { period: 'Apr', value: 90 },
        { period: 'May', value: 10 },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

// ── sentiment_analysis ───────────────────────────────────────────────
describe('sentiment_analysis', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.sentiment_analysis;

  it('returns inconclusive with no scores', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when sentiment neutral/positive', async () => {
    const f = await apply(makeCtx({
      sentimentScores: [
        { source: 'news1', score: 0.3 },
        { source: 'news2', score: 0.1 },
        { source: 'news3', score: 0.5 },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0);
  });

  it('flags when avg sentiment below -0.2 but not majority negative', async () => {
    // avgSentiment=(-0.9+0.1+0.1)/3=-0.233 → flag; negativeSources=1 < ceil(3*0.5)=2 → no escalate
    const f = await apply(makeCtx({
      sentimentScores: [
        { source: 'news1', score: -0.9 },
        { source: 'news2', score: 0.1 },
        { source: 'news3', score: 0.1 },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when sentiment strongly negative across majority', async () => {
    const f = await apply(makeCtx({
      sentimentScores: [
        { source: 'news1', score: -0.8, magnitude: 2 },
        { source: 'news2', score: -0.7, magnitude: 1.5 },
        { source: 'news3', score: -0.6, magnitude: 1 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── ethical_matrix ───────────────────────────────────────────────────
describe('ethical_matrix', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.ethical_matrix;

  it('returns inconclusive with no cells', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when all impacts positive', async () => {
    const f = await apply(makeCtx({
      ethicalMatrix: [
        { stakeholder: 'customers', principle: 'fairness', impact: 0.5 },
        { stakeholder: 'staff', principle: 'welfare', impact: 0.3 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when one stakeholder group negatively affected', async () => {
    const f = await apply(makeCtx({
      ethicalMatrix: [
        { stakeholder: 'customers', principle: 'fairness', impact: -0.4 },
        { stakeholder: 'staff', principle: 'welfare', impact: 0.3 },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('escalates when multiple stakeholders severely affected', async () => {
    const f = await apply(makeCtx({
      ethicalMatrix: [
        { stakeholder: 'customers', principle: 'fairness', impact: -0.8 },
        { stakeholder: 'society', principle: 'harm', impact: -0.7 },
        { stakeholder: 'regulators', principle: 'compliance', impact: -0.6 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── lineage ───────────────────────────────────────────────────────────
describe('lineage', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.lineage;

  it('returns inconclusive with no nodes', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when all nodes high trust', async () => {
    const f = await apply(makeCtx({
      lineageNodes: [
        { nodeId: 'source1', transformations: ['filter'], trustScore: 0.9 },
        { nodeId: 'source2', transformations: ['aggregate'], trustScore: 0.85 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when one low-trust node', async () => {
    const f = await apply(makeCtx({
      lineageNodes: [
        { nodeId: 'source1', transformations: ['filter'], trustScore: 0.9 },
        { nodeId: 'untrusted', transformations: ['redact', 'merge'], trustScore: 0.2 },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

// ── reconciliation ───────────────────────────────────────────────────
describe('reconciliation', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.reconciliation;

  it('returns inconclusive with no items', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when all items matched', async () => {
    const f = await apply(makeCtx({
      reconciliationItems: [
        { id: 'item1', sourceA: 100, sourceB: 100, matched: true },
        { id: 'item2', sourceA: 200, sourceB: 200, matched: true },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when some items unmatched', async () => {
    const f = await apply(makeCtx({
      reconciliationItems: [
        { id: 'item1', sourceA: 100, sourceB: 100, matched: true },
        { id: 'item2', sourceA: 200, sourceB: 185, matched: false },
        { id: 'item3', sourceA: 300, sourceB: 300, matched: true },
        { id: 'item4', sourceA: 150, sourceB: 150, matched: true },
        { id: 'item5', sourceA: 250, sourceB: 250, matched: true },
        { id: 'item6', sourceA: 100, sourceB: 100, matched: true },
        { id: 'item7', sourceA: 100, sourceB: 100, matched: true },
        { id: 'item8', sourceA: 100, sourceB: 100, matched: true },
        { id: 'item9', sourceA: 100, sourceB: 100, matched: true },
        { id: 'item10', sourceA: 100, sourceB: 100, matched: true },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when high mismatch rate', async () => {
    const f = await apply(makeCtx({
      reconciliationItems: [
        { id: 'i1', sourceA: 100, sourceB: 50, matched: false },
        { id: 'i2', sourceA: 200, sourceB: 80, matched: false },
        { id: 'i3', sourceA: 150, sourceB: 150, matched: true },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── conflict_interest ─────────────────────────────────────────────────
describe('conflict_interest', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.conflict_interest;

  it('returns inconclusive with no checks', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when no conflicts', async () => {
    const f = await apply(makeCtx({
      conflictChecks: [
        { decisionMaker: 'analyst_A', interest: 'none', conflictPresent: false },
        { decisionMaker: 'analyst_B', interest: 'none', conflictPresent: false },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when one conflict detected', async () => {
    const f = await apply(makeCtx({
      conflictChecks: [
        { decisionMaker: 'mgr_X', interest: 'shareholding', conflictPresent: true, severity: 0.5 },
        { decisionMaker: 'analyst_B', interest: 'none', conflictPresent: false },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when multiple high-severity conflicts', async () => {
    const f = await apply(makeCtx({
      conflictChecks: [
        { decisionMaker: 'mgr_X', interest: 'shareholding', conflictPresent: true, severity: 0.9 },
        { decisionMaker: 'mgr_Y', interest: 'family_link', conflictPresent: true, severity: 0.8 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── sla_check ─────────────────────────────────────────────────────────
describe('sla_check', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.sla_check;

  it('returns inconclusive with no items', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when no breaches', async () => {
    const now = Date.now();
    const f = await apply(makeCtx({
      slaItems: [
        { action: 'CDD review', dueAt: now - 1000, completedAt: now - 2000, breached: false },
        { action: 'EDD filing', dueAt: now - 500, completedAt: now - 1000, breached: false },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when moderate breach rate', async () => {
    const now = Date.now();
    const oneDayMs = 86400000;
    const f = await apply(makeCtx({
      slaItems: [
        { action: 'A', dueAt: now - 5 * oneDayMs, completedAt: now - 2 * oneDayMs, breached: true },
        { action: 'B', dueAt: now - oneDayMs, completedAt: now, breached: false },
        { action: 'C', dueAt: now - oneDayMs, completedAt: now, breached: false },
        { action: 'D', dueAt: now - oneDayMs, completedAt: now, breached: false },
        { action: 'E', dueAt: now - oneDayMs, completedAt: now, breached: false },
        { action: 'F', dueAt: now - oneDayMs, completedAt: now, breached: false },
        { action: 'G', dueAt: now - oneDayMs, completedAt: now, breached: false },
        { action: 'H', dueAt: now - oneDayMs, completedAt: now, breached: false },
        { action: 'I', dueAt: now - oneDayMs, completedAt: now, breached: false },
        { action: 'J', dueAt: now - oneDayMs, completedAt: now, breached: false },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });
});

// ── training_inadequacy ───────────────────────────────────────────────
describe('training_inadequacy', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.training_inadequacy;

  it('returns inconclusive with no records', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when all required training current and passed', async () => {
    const recentDate = Date.now() - 30 * 24 * 3600 * 1000; // 30 days ago
    const f = await apply(makeCtx({
      trainingRecords: [
        { staffId: 's1', courseId: 'AML101', completedAt: recentDate, passScore: 0.9, required: true },
        { staffId: 's2', courseId: 'AML101', completedAt: recentDate, passScore: 0.85, required: true },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when some required training is stale', async () => {
    const staleDate = Date.now() - 400 * 24 * 3600 * 1000; // >12 months ago
    const recentDate = Date.now() - 30 * 24 * 3600 * 1000;
    const f = await apply(makeCtx({
      trainingRecords: [
        { staffId: 's1', courseId: 'AML101', completedAt: staleDate, passScore: 0.9, required: true },
        { staffId: 's2', courseId: 'AML101', completedAt: recentDate, passScore: 0.9, required: true },
        { staffId: 's3', courseId: 'AML101', completedAt: recentDate, passScore: 0.9, required: true },
        { staffId: 's4', courseId: 'AML101', completedAt: recentDate, passScore: 0.9, required: true },
        { staffId: 's5', courseId: 'AML101', completedAt: recentDate, passScore: 0.9, required: true },
        { staffId: 's6', courseId: 'AML101', completedAt: recentDate, passScore: 0.9, required: true },
        { staffId: 's7', courseId: 'AML101', completedAt: recentDate, passScore: 0.9, required: true },
        { staffId: 's8', courseId: 'AML101', completedAt: recentDate, passScore: 0.9, required: true },
        { staffId: 's9', courseId: 'AML101', completedAt: recentDate, passScore: 0.9, required: true },
        { staffId: 's10', courseId: 'AML101', completedAt: recentDate, passScore: 0.9, required: true },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });
});

// ── staff_workload ────────────────────────────────────────────────────
describe('staff_workload', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.staff_workload;

  it('returns inconclusive with no data', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when utilisation is within capacity', async () => {
    const f = await apply(makeCtx({
      workloadData: { role: 'analyst', casesAssigned: 80, capacityPerMonth: 100, avgResolutionDays: 4 },
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when slightly over-capacity', async () => {
    const f = await apply(makeCtx({
      workloadData: { role: 'analyst', casesAssigned: 115, capacityPerMonth: 100, avgResolutionDays: 12 },
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when severely over-capacity', async () => {
    const f = await apply(makeCtx({
      workloadData: { role: 'analyst', casesAssigned: 200, capacityPerMonth: 100, avgResolutionDays: 25 },
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('returns inconclusive when capacity is zero', async () => {
    const f = await apply(makeCtx({
      workloadData: { role: 'analyst', casesAssigned: 10, capacityPerMonth: 0, avgResolutionDays: 5 },
    }));
    expect(f.verdict).toBe('inconclusive');
  });
});

// ── verdict_replay ────────────────────────────────────────────────────
describe('verdict_replay', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.verdict_replay;

  it('returns inconclusive with no replays', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when all verdicts unchanged', async () => {
    const f = await apply(makeCtx({
      verdictReplays: [
        { caseId: 'c1', originalVerdict: 'clear', replayVerdict: 'clear', deltaScore: 0.02 },
        { caseId: 'c2', originalVerdict: 'flag', replayVerdict: 'flag', deltaScore: 0.05 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when some verdicts changed', async () => {
    const f = await apply(makeCtx({
      verdictReplays: [
        { caseId: 'c1', originalVerdict: 'clear', replayVerdict: 'flag', deltaScore: 0.3 },
        { caseId: 'c2', originalVerdict: 'flag', replayVerdict: 'flag', deltaScore: 0.05 },
        { caseId: 'c3', originalVerdict: 'clear', replayVerdict: 'clear', deltaScore: 0.01 },
        { caseId: 'c4', originalVerdict: 'clear', replayVerdict: 'clear', deltaScore: 0.01 },
        { caseId: 'c5', originalVerdict: 'clear', replayVerdict: 'clear', deltaScore: 0.01 },
        { caseId: 'c6', originalVerdict: 'clear', replayVerdict: 'clear', deltaScore: 0.01 },
        { caseId: 'c7', originalVerdict: 'clear', replayVerdict: 'clear', deltaScore: 0.01 },
        { caseId: 'c8', originalVerdict: 'clear', replayVerdict: 'clear', deltaScore: 0.01 },
        { caseId: 'c9', originalVerdict: 'clear', replayVerdict: 'clear', deltaScore: 0.01 },
        { caseId: 'c10', originalVerdict: 'clear', replayVerdict: 'clear', deltaScore: 0.01 },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when many verdicts upgraded to flag/escalate', async () => {
    const f = await apply(makeCtx({
      verdictReplays: [
        { caseId: 'c1', originalVerdict: 'clear', replayVerdict: 'escalate', deltaScore: 0.6 },
        { caseId: 'c2', originalVerdict: 'clear', replayVerdict: 'flag', deltaScore: 0.4 },
        { caseId: 'c3', originalVerdict: 'clear', replayVerdict: 'escalate', deltaScore: 0.7 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});

// ── taint_propagation ─────────────────────────────────────────────────
describe('taint_propagation', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.taint_propagation;

  it('returns inconclusive with no graph', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when taint is low', async () => {
    const f = await apply(makeCtx({
      taintGraph: [
        { txId: 'tx1', taintIn: 0.05, value: 1000, mixingHops: 0 },
        { txId: 'tx2', taintIn: 0.03, value: 2000, mixingHops: 0 },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when moderate taint', async () => {
    const f = await apply(makeCtx({
      taintGraph: [
        { txId: 'tx1', taintIn: 0.4, value: 1000, mixingHops: 0 },
        { txId: 'tx2', taintIn: 0.3, value: 500, mixingHops: 0 },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('escalates when high taint across large value', async () => {
    const f = await apply(makeCtx({
      taintGraph: [
        { txId: 'tx1', taintIn: 0.9, value: 100000, mixingHops: 0 },
        { txId: 'tx2', taintIn: 0.8, value: 50000, mixingHops: 0 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('reduces taint score with mixing hops', async () => {
    const noHops = await apply(makeCtx({
      taintGraph: [{ txId: 'tx1', taintIn: 0.9, value: 1000, mixingHops: 0 }],
    }));
    const manyHops = await apply(makeCtx({
      taintGraph: [{ txId: 'tx1', taintIn: 0.9, value: 1000, mixingHops: 5 }],
    }));
    expect(manyHops.score).toBeLessThan(noHops.score);
  });
});

// ── yacht_jet ─────────────────────────────────────────────────────────
describe('yacht_jet', () => {
  const apply = GOVERNANCE_CRYPTO_MODE_APPLIES.yacht_jet;

  it('returns inconclusive with no assets', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('clears when low-value single-registration no indicators', async () => {
    const f = await apply(makeCtx({
      movableAssets: [
        { assetType: 'boat', value: 50000, registrations: ['UAE'], riskIndicators: [] },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when single high-value asset with indicator', async () => {
    const f = await apply(makeCtx({
      movableAssets: [
        { assetType: 'yacht', value: 5000000, registrations: ['Cayman'], riskIndicators: ['flag_shopping'] },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('escalates when high-value multi-registered with multiple indicators', async () => {
    const f = await apply(makeCtx({
      movableAssets: [
        {
          assetType: 'superyacht', value: 50000000,
          registrations: ['Cayman', 'Panama', 'Isle_of_Man'],
          riskIndicators: ['opaque_ownership', 'flag_shopping', 'no_lender_disclosed'],
        },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });
});
