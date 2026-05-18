// Deep coverage tests for modes/compliance.ts
// Covers: list_walk, sanctions_regime_matrix, cash_courier_ctn, velocity_analysis,
//         jurisdiction_cascade, kpi_dpms_thirty, four_eyes_stress, ubo_tree_walk.

import { describe, it, expect } from 'vitest';
import { COMPLIANCE_MODE_APPLIES } from '../modes/compliance.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: ['cdd', 'sanctions'],
  };
}

// ── list_walk ─────────────────────────────────────────────────────────────────

describe('list_walk', () => {
  const apply = COMPLIANCE_MODE_APPLIES.list_walk;

  it('returns inconclusive when no listHits supplied', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('list_walk');
    expect(f.confidence).toBeLessThanOrEqual(0.3);
  });

  it('returns inconclusive when listHits is empty array', async () => {
    const f = await apply(makeCtx({ listHits: [] }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('escalates on exact match', async () => {
    const f = await apply(makeCtx({
      listHits: [
        { listId: 'un_1267', matchStrength: 'exact', sourceRef: 'ref-001', asOf: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('escalate');
    expect(f.score).toBeGreaterThan(0);
    expect(f.confidence).toBe(0.85);
  });

  it('escalates on strong match', async () => {
    const f = await apply(makeCtx({
      listHits: [
        { listId: 'ofac_sdn', matchStrength: 'strong', sourceRef: 'ref-002', asOf: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('flags on possible match only', async () => {
    const f = await apply(makeCtx({
      listHits: [
        { listId: 'eu_consolidated', matchStrength: 'possible', sourceRef: 'ref-003', asOf: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('flag');
    expect(f.confidence).toBe(0.6);
  });

  it('flags on weak match only', async () => {
    const f = await apply(makeCtx({
      listHits: [
        { listId: 'uk_hmt', matchStrength: 'weak', sourceRef: 'ref-004', asOf: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('flag');
    expect(f.confidence).toBe(0.4);
  });

  it('score is clamped to [0,1]', async () => {
    const hits = Array.from({ length: 5 }, (_, i) => ({
      listId: `list-${i}`,
      matchStrength: 'exact' as const,
      sourceRef: `ref-${i}`,
      asOf: '2026-01-01',
    }));
    const f = await apply(makeCtx({ listHits: hits }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });

  it('evidence list is populated with sourceRefs', async () => {
    const f = await apply(makeCtx({
      listHits: [
        { listId: 'un_1267', matchStrength: 'exact', sourceRef: 'my-source-ref', asOf: '2026-01-01' },
      ],
    }));
    expect(f.evidence).toContain('my-source-ref');
  });
});

// ── sanctions_regime_matrix ────────────────────────────────────────────────────

describe('sanctions_regime_matrix', () => {
  const apply = COMPLIANCE_MODE_APPLIES.sanctions_regime_matrix;

  it('returns inconclusive with no listHits', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('sanctions_regime_matrix');
  });

  it('escalates when a critical UN regime is hit', async () => {
    const f = await apply(makeCtx({
      listHits: [
        { listId: 'un_1267', matchStrength: 'exact', sourceRef: 'ref-un', asOf: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('escalates when UAE EOCN is hit', async () => {
    const f = await apply(makeCtx({
      listHits: [
        { listId: 'uae_eocn', matchStrength: 'strong', sourceRef: 'ref-eocn', asOf: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('flags on multiple non-critical regimes', async () => {
    // Score = 0.15 per non-critical regime; flag if score > 0.3.
    const hits = ['ofac_sdn', 'uk_hmt', 'eu_consolidated'].map((listId) => ({
      listId,
      matchStrength: 'strong' as const,
      sourceRef: `ref-${listId}`,
      asOf: '2026-01-01',
    }));
    const f = await apply(makeCtx({ listHits: hits }));
    // 3 non-critical regimes: score = 3 * 0.15 = 0.45 → flag
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('clears when single non-critical regime has low score', async () => {
    const f = await apply(makeCtx({
      listHits: [
        { listId: 'some_non_critical_list', matchStrength: 'weak', sourceRef: 'ref-nc', asOf: '2026-01-01' },
      ],
    }));
    // 1 non-critical regime: score = 0.15 → clear (≤0.3)
    expect(f.verdict).toBe('clear');
  });

  it('score is in [0,1]', async () => {
    const hits = Array.from({ length: 10 }, (_, i) => ({
      listId: `critical-${i}`,
      matchStrength: 'exact' as const,
      sourceRef: `ref-${i}`,
      asOf: '2026-01-01',
    }));
    const f = await apply(makeCtx({ listHits: hits }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── cash_courier_ctn ──────────────────────────────────────────────────────────

describe('cash_courier_ctn', () => {
  const apply = COMPLIANCE_MODE_APPLIES.cash_courier_ctn;

  it('returns clear when no transactions supplied', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('clear');
    expect(f.modeId).toBe('cash_courier_ctn');
  });

  it('returns clear when no cash/courier transactions', async () => {
    const f = await apply(makeCtx({
      transactions: [
        { id: 'tx1', amountAed: 100000, channel: 'wire', at: '2026-01-01' },
        { id: 'tx2', amountAed: 50000, channel: 'card', at: '2026-01-02' },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when 3 or more near-threshold cash transactions', async () => {
    // Near-threshold: >= 0.85 * 55000 = 46750 and < 55000
    const txs = [
      { id: 'tx1', amountAed: 47000, channel: 'cash', at: '2026-01-01' },
      { id: 'tx2', amountAed: 50000, channel: 'cash', at: '2026-01-02' },
      { id: 'tx3', amountAed: 54000, channel: 'courier', at: '2026-01-03' },
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('flag');
  });

  it('flags when a cash transaction exceeds the CTN threshold of AED 60k', async () => {
    const f = await apply(makeCtx({
      transactions: [
        { id: 'tx1', amountAed: 65000, channel: 'cash', at: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('clears when cash transaction is below near-threshold band', async () => {
    const f = await apply(makeCtx({
      transactions: [
        { id: 'tx1', amountAed: 10000, channel: 'cash', at: '2026-01-01' },
        { id: 'tx2', amountAed: 5000, channel: 'courier', at: '2026-01-02' },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0);
  });

  it('includes cash/courier tx IDs in evidence', async () => {
    const f = await apply(makeCtx({
      transactions: [
        { id: 'cash-001', amountAed: 70000, channel: 'cash', at: '2026-01-01' },
      ],
    }));
    expect(f.evidence).toContain('cash-001');
  });

  it('score is clamped to [0,1]', async () => {
    const txs = Array.from({ length: 20 }, (_, i) => ({
      id: `tx-${i}`,
      amountAed: 65000,
      channel: 'cash' as const,
      at: `2026-01-${String(i + 1).padStart(2, '0')}`,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── velocity_analysis (compliance) ────────────────────────────────────────────

describe('velocity_analysis (compliance)', () => {
  const apply = COMPLIANCE_MODE_APPLIES.velocity_analysis;

  it('returns inconclusive with fewer than 3 transactions', async () => {
    const f = await apply(makeCtx({
      transactions: [
        { id: 'tx1', amountAed: 1000, channel: 'wire', at: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('velocity_analysis');
  });

  it('returns inconclusive when no transactions', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears on evenly-spread transactions', async () => {
    const txs = Array.from({ length: 10 }, (_, i) => {
      const d = new Date('2026-01-01');
      d.setUTCDate(d.getUTCDate() + i * 7); // 1 per week
      return { id: `tx-${i}`, amountAed: 1000, channel: 'wire', at: d.toISOString() };
    });
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when transactions cluster at the end (velocity spike)', async () => {
    // First 5 spread over 60 days, then 10 in 2 days
    const txs: Record<string, unknown>[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date('2026-01-01');
      d.setUTCDate(d.getUTCDate() + i * 12);
      txs.push({ id: `early-${i}`, amountAed: 1000, channel: 'wire', at: d.toISOString() });
    }
    for (let i = 0; i < 10; i++) {
      const d = new Date('2026-04-01');
      d.setUTCHours(d.getUTCHours() + i * 2);
      txs.push({ id: `late-${i}`, amountAed: 1000, channel: 'wire', at: d.toISOString() });
    }
    const f = await apply(makeCtx({ transactions: txs }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('score is in [0, 1]', async () => {
    const txs = Array.from({ length: 5 }, (_, i) => ({
      id: `tx-${i}`,
      amountAed: 1000,
      channel: 'wire',
      at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── jurisdiction_cascade ──────────────────────────────────────────────────────

describe('jurisdiction_cascade', () => {
  const apply = COMPLIANCE_MODE_APPLIES.jurisdiction_cascade;

  it('returns inconclusive with no jurisdictions', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('jurisdiction_cascade');
  });

  it('escalates when all hops are very_high risk', async () => {
    const f = await apply(makeCtx({
      jurisdictions: [
        { iso2: 'IR', role: 'origin', riskTier: 'very_high' },
        { iso2: 'KP', role: 'intermediary', riskTier: 'very_high' },
      ],
    }));
    expect(f.verdict).toBe('escalate');
    expect(f.score).toBeGreaterThan(0.7);
  });

  it('flags when score is moderate (medium+high risk mix)', async () => {
    const f = await apply(makeCtx({
      jurisdictions: [
        { iso2: 'AE', role: 'destination', riskTier: 'medium' },
        { iso2: 'NG', role: 'origin', riskTier: 'high' },
      ],
    }));
    // Score = (0.3 + 0.7) / 2 = 0.5 > 0.4 → flag
    expect(f.verdict).toBe('flag');
  });

  it('clears when all jurisdictions are low risk', async () => {
    const f = await apply(makeCtx({
      jurisdictions: [
        { iso2: 'AE', role: 'origin', riskTier: 'low' },
        { iso2: 'GB', role: 'destination', riskTier: 'low' },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('handles missing riskTier by using medium default', async () => {
    const f = await apply(makeCtx({
      jurisdictions: [
        { iso2: 'XX', role: 'intermediary' }, // no riskTier → defaults to medium (0.3)
      ],
    }));
    // Score = 0.3 → clear (≤0.4)
    expect(f.verdict).toBe('clear');
    expect(f.score).toBeCloseTo(0.3, 5);
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      jurisdictions: Array.from({ length: 10 }, (_, i) => ({
        iso2: `J${i}`,
        role: 'origin' as const,
        riskTier: 'very_high' as const,
      })),
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── kpi_dpms_thirty ───────────────────────────────────────────────────────────

describe('kpi_dpms_thirty', () => {
  const apply = COMPLIANCE_MODE_APPLIES.kpi_dpms_thirty;

  it('returns inconclusive with no dpmsKpis', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('kpi_dpms_thirty');
  });

  it('escalates when any KPI is red', async () => {
    const f = await apply(makeCtx({
      dpmsKpis: [
        { id: 'kpi-01', observed: 0.1, target: 0.9, status: 'red' },
        { id: 'kpi-02', observed: 0.95, target: 0.9, status: 'green' },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('flags when amber KPIs exceed 1/3 of total', async () => {
    // 4 amber out of 6 total → 4/6 > 1/3 → flag (assuming no red)
    const kpis = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `amber-${i}`, observed: 0.5, target: 0.9, status: 'amber' as const })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `green-${i}`, observed: 0.95, target: 0.9, status: 'green' as const })),
    ];
    const f = await apply(makeCtx({ dpmsKpis: kpis }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('clears when all KPIs are green', async () => {
    const kpis = Array.from({ length: 5 }, (_, i) => ({
      id: `kpi-${i}`,
      observed: 0.95,
      target: 0.9,
      status: 'green' as const,
    }));
    const f = await apply(makeCtx({ dpmsKpis: kpis }));
    expect(f.verdict).toBe('clear');
  });

  it('score is in [0, 1]', async () => {
    const kpis = Array.from({ length: 30 }, (_, i) => ({
      id: `kpi-${i}`,
      observed: i % 3 === 0 ? 0.1 : 0.95,
      target: 0.9,
      status: (i % 3 === 0 ? 'red' : 'green') as 'red' | 'green',
    }));
    const f = await apply(makeCtx({ dpmsKpis: kpis }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── four_eyes_stress (compliance) ────────────────────────────────────────────

describe('four_eyes_stress (compliance)', () => {
  const apply = COMPLIANCE_MODE_APPLIES.four_eyes_stress;

  it('returns inconclusive when no controlActions supplied', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('four_eyes_stress');
  });

  it('clears when all actions have valid dual approval', async () => {
    const f = await apply(makeCtx({
      controlActions: [
        { step: 'onboard-review', actor: 'alice', approverA: 'bob', approverB: 'carol', at: '2026-01-01' },
        { step: 'kyc-sign-off', actor: 'dave', approverA: 'eve', approverB: 'frank', at: '2026-01-02' },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0);
  });

  it('escalates when actor equals approverA (self-approval)', async () => {
    const f = await apply(makeCtx({
      controlActions: [
        { step: 'risk-review', actor: 'alice', approverA: 'alice', approverB: 'bob', at: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('escalate');
    expect(f.score).toBeGreaterThan(0);
  });

  it('escalates when actor equals approverB', async () => {
    const f = await apply(makeCtx({
      controlActions: [
        { step: 'risk-review', actor: 'alice', approverA: 'bob', approverB: 'alice', at: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('escalates when both approvers are the same person', async () => {
    const f = await apply(makeCtx({
      controlActions: [
        { step: 'dual-sign', actor: 'alice', approverA: 'bob', approverB: 'bob', at: '2026-01-01' },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('escalates when approver fields are missing', async () => {
    const f = await apply(makeCtx({
      controlActions: [
        { step: 'partial', actor: 'alice', at: '2026-01-01' }, // no approvers
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('violation steps appear in evidence list', async () => {
    const f = await apply(makeCtx({
      controlActions: [
        { step: 'bad-step', actor: 'alice', approverA: 'alice', approverB: 'bob', at: '2026-01-01' },
      ],
    }));
    expect(f.evidence).toContain('bad-step');
  });
});

// ── ubo_tree_walk ─────────────────────────────────────────────────────────────

describe('ubo_tree_walk', () => {
  const apply = COMPLIANCE_MODE_APPLIES.ubo_tree_walk;

  it('returns inconclusive when no uboParties or uboEdges', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('ubo_tree_walk');
  });

  it('returns inconclusive when parties present but no edges', async () => {
    const f = await apply(makeCtx({
      uboParties: [{ id: 'p1', kind: 'entity', name: 'Corp A' }],
      uboEdges: [],
    }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears on a simple transparent ownership chain (no nominee)', async () => {
    const f = await apply(makeCtx({
      uboParties: [
        { id: 'corp-a', kind: 'entity', name: 'Corp A' },
        { id: 'person-1', kind: 'person', name: 'John Smith' },
      ],
      uboEdges: [
        { from: 'corp-a', to: 'person-1', sharePercent: 100 },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBeLessThanOrEqual(0.25);
  });

  it('flags or escalates on nominee-tainted ownership chain', async () => {
    const f = await apply(makeCtx({
      uboParties: [
        { id: 'corp-b', kind: 'entity', name: 'Corp B' },
        { id: 'nominee-co', kind: 'entity', name: 'Nominee Co' },
        { id: 'real-owner', kind: 'person', name: 'Hidden Person' },
      ],
      uboEdges: [
        { from: 'corp-b', to: 'nominee-co', sharePercent: 100, nominee: true },
        { from: 'nominee-co', to: 'real-owner', sharePercent: 100, nominee: true },
      ],
    }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('escalates on bearer share edge', async () => {
    const f = await apply(makeCtx({
      uboParties: [
        { id: 'bearer-corp', kind: 'entity', name: 'Bearer Corp' },
        { id: 'unknown-holder', kind: 'person', name: 'Unknown' },
      ],
      uboEdges: [
        { from: 'bearer-corp', to: 'unknown-holder', bearerShares: true },
      ],
    }));
    // bearer shares are a high opacity signal
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      uboParties: [
        { id: 'e1', kind: 'entity' },
        { id: 'p1', kind: 'person' },
      ],
      uboEdges: [{ from: 'e1', to: 'p1', sharePercent: 51, nominee: true, bearerShares: true }],
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});
