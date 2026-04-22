import { describe, expect, it } from 'vitest';
import { COMPLIANCE_MODE_APPLIES } from '../modes/compliance.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}, domains: string[] = ['sanctions', 'cdd']): BrainContext {
  return {
    run: { id: 'r1', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains,
  };
}

describe('compliance — list_walk', () => {
  it('inconclusive when no list hits supplied', async () => {
    const out = await COMPLIANCE_MODE_APPLIES.list_walk!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
    expect(out.rationale).toMatch(/No authoritative list material/);
    expect(out.score).toBe(0);
  });

  it('escalates on exact/strong match', async () => {
    const out = await COMPLIANCE_MODE_APPLIES.list_walk!(makeCtx({
      listHits: [{ listId: 'un_1267', matchStrength: 'exact', sourceRef: 'ref-1', asOf: '2026-01-01' }],
    }));
    expect(out.verdict).toBe('escalate');
    expect(out.evidence).toEqual(['ref-1']);
    expect(out.score).toBeGreaterThan(0);
  });

  it('flags partial only', async () => {
    const out = await COMPLIANCE_MODE_APPLIES.list_walk!(makeCtx({
      listHits: [{ listId: 'eu_cfsp', matchStrength: 'possible', sourceRef: 'r2', asOf: '2026-01-02' }],
    }));
    expect(out.verdict).toBe('flag');
    expect(out.rationale).toMatch(/partial match/);
  });
});

describe('compliance — ubo_tree_walk', () => {
  it('inconclusive when graph missing', async () => {
    const out = await COMPLIANCE_MODE_APPLIES.ubo_tree_walk!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });

  it('escalates on nominee + bearer-share heavy chain', async () => {
    const parties = [
      { id: 'e1', kind: 'entity' },
      { id: 'e2', kind: 'entity' },
      { id: 'e3', kind: 'entity' },
    ];
    const edges = [
      { from: 'e2', to: 'e1', nominee: true },
      { from: 'e3', to: 'e2', bearerShares: true },
    ];
    const out = await COMPLIANCE_MODE_APPLIES.ubo_tree_walk!(makeCtx({ uboParties: parties, uboEdges: edges }));
    expect(out.verdict === 'escalate' || out.verdict === 'flag').toBe(true);
    expect(out.score).toBeGreaterThan(0.2);
  });

  it('clear on simple person→entity chain', async () => {
    const parties = [
      { id: 'p1', kind: 'person', name: 'Alice' },
      { id: 'e1', kind: 'entity' },
    ];
    const edges = [{ from: 'p1', to: 'e1', sharePercent: 100 }];
    const out = await COMPLIANCE_MODE_APPLIES.ubo_tree_walk!(makeCtx({ uboParties: parties, uboEdges: edges }));
    expect(out.verdict).toBe('clear');
  });
});

describe('compliance — sanctions_regime_matrix', () => {
  it('escalates on UN 1267 exposure', async () => {
    const out = await COMPLIANCE_MODE_APPLIES.sanctions_regime_matrix!(makeCtx({
      listHits: [{ listId: 'un_1267', matchStrength: 'strong', sourceRef: 'x', asOf: '2026-01-01' }],
    }));
    expect(out.verdict).toBe('escalate');
  });

  it('clear when no hits', async () => {
    const out = await COMPLIANCE_MODE_APPLIES.sanctions_regime_matrix!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
});

describe('compliance — cash_courier_ctn', () => {
  it('flags 3+ near-threshold cash txns', async () => {
    const txs = [
      { id: 't1', amountAed: 50_000, channel: 'cash', at: '2026-01-01' },
      { id: 't2', amountAed: 52_000, channel: 'cash', at: '2026-01-02' },
      { id: 't3', amountAed: 48_000, channel: 'cash', at: '2026-01-03' },
    ];
    const out = await COMPLIANCE_MODE_APPLIES.cash_courier_ctn!(makeCtx({ transactions: txs }));
    expect(out.verdict).toBe('flag');
  });

  it('flags single over-threshold courier txn', async () => {
    const txs = [{ id: 't1', amountAed: 100_000, channel: 'courier', at: '2026-01-01' }];
    const out = await COMPLIANCE_MODE_APPLIES.cash_courier_ctn!(makeCtx({ transactions: txs }));
    expect(out.verdict).toBe('flag');
  });

  it('clear on wire-only transactions', async () => {
    const txs = [{ id: 't1', amountAed: 500_000, channel: 'wire', at: '2026-01-01' }];
    const out = await COMPLIANCE_MODE_APPLIES.cash_courier_ctn!(makeCtx({ transactions: txs }));
    expect(out.verdict).toBe('clear');
  });
});

describe('compliance — velocity_analysis', () => {
  it('inconclusive below 3 transactions', async () => {
    const out = await COMPLIANCE_MODE_APPLIES.velocity_analysis!(makeCtx({
      transactions: [{ id: 't1', amountAed: 1, channel: 'wire', at: '2026-01-01' }],
    }));
    expect(out.verdict).toBe('inconclusive');
  });

  it('flags burst over stable baseline', async () => {
    const txs = [
      { id: 'a1', amountAed: 10, channel: 'wire', at: '2026-01-01' },
      { id: 'a2', amountAed: 10, channel: 'wire', at: '2026-01-20' },
      { id: 'a3', amountAed: 10, channel: 'wire', at: '2026-02-10' },
      { id: 'b1', amountAed: 10, channel: 'wire', at: '2026-03-01' },
      { id: 'b2', amountAed: 10, channel: 'wire', at: '2026-03-01' },
      { id: 'b3', amountAed: 10, channel: 'wire', at: '2026-03-02' },
      { id: 'b4', amountAed: 10, channel: 'wire', at: '2026-03-02' },
      { id: 'b5', amountAed: 10, channel: 'wire', at: '2026-03-03' },
      { id: 'b6', amountAed: 10, channel: 'wire', at: '2026-03-04' },
    ];
    const out = await COMPLIANCE_MODE_APPLIES.velocity_analysis!(makeCtx({ transactions: txs }));
    expect(out.verdict).toBe('flag');
  });
});

describe('compliance — jurisdiction_cascade', () => {
  it('escalates when average tier is very high', async () => {
    const hops = [
      { iso2: 'IR', role: 'origin', riskTier: 'very_high' },
      { iso2: 'KP', role: 'intermediary', riskTier: 'very_high' },
      { iso2: 'SY', role: 'destination', riskTier: 'very_high' },
    ];
    const out = await COMPLIANCE_MODE_APPLIES.jurisdiction_cascade!(makeCtx({ jurisdictions: hops }));
    expect(out.verdict).toBe('escalate');
  });

  it('clear on low-tier hops', async () => {
    const hops = [
      { iso2: 'AE', role: 'origin', riskTier: 'low' },
      { iso2: 'DE', role: 'destination', riskTier: 'low' },
    ];
    const out = await COMPLIANCE_MODE_APPLIES.jurisdiction_cascade!(makeCtx({ jurisdictions: hops }));
    expect(out.verdict).toBe('clear');
  });
});

describe('compliance — kpi_dpms_thirty', () => {
  it('escalates on red KPI', async () => {
    const kpis = Array.from({ length: 10 }, (_, i) => ({
      id: `k${i}`, observed: 1, target: 1, status: i === 0 ? 'red' : 'green',
    }));
    const out = await COMPLIANCE_MODE_APPLIES.kpi_dpms_thirty!(makeCtx({ dpmsKpis: kpis }));
    expect(out.verdict).toBe('escalate');
  });

  it('clear on all-green', async () => {
    const kpis = Array.from({ length: 5 }, (_, i) => ({
      id: `k${i}`, observed: 1, target: 1, status: 'green',
    }));
    const out = await COMPLIANCE_MODE_APPLIES.kpi_dpms_thirty!(makeCtx({ dpmsKpis: kpis }));
    expect(out.verdict).toBe('clear');
  });
});

describe('compliance — four_eyes_stress', () => {
  it('escalates when same approver signs both sides', async () => {
    const out = await COMPLIANCE_MODE_APPLIES.four_eyes_stress!(makeCtx({
      controlActions: [{ step: 'disburse-aed', actor: 'alice', approverA: 'bob', approverB: 'bob', at: '2026-01-01' }],
    }));
    expect(out.verdict).toBe('escalate');
  });

  it('clear on proper dual approval', async () => {
    const out = await COMPLIANCE_MODE_APPLIES.four_eyes_stress!(makeCtx({
      controlActions: [{ step: 'disburse-aed', actor: 'alice', approverA: 'bob', approverB: 'carol', at: '2026-01-01' }],
    }));
    expect(out.verdict).toBe('clear');
  });

  it('escalates when actor also approves', async () => {
    const out = await COMPLIANCE_MODE_APPLIES.four_eyes_stress!(makeCtx({
      controlActions: [{ step: 'disburse-aed', actor: 'alice', approverA: 'alice', approverB: 'bob', at: '2026-01-01' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});
