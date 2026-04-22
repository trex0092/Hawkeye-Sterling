import { describe, expect, it } from 'vitest';
import { EntityGraph } from '../entity-graph.js';
import { detectSmurfing } from '../smurfing-detector.js';
import { corroborate } from '../evidence-corroboration.js';
import { buildTimeline, summariseByPhase } from '../investigation-timeline.js';
import { computeSanctionDelta, entriesRequiringReScreen } from '../sanction-delta.js';
import { detectCrossRegimeConflict } from '../cross-regime-conflict.js';
import { OutcomeFeedbackJournal } from '../outcome-feedback.js';
import { CalibrationLedger } from '../mlro-calibration.js';

describe('entity-graph', () => {
  it('traverses owns edges to identify effective UBO percent', () => {
    const g = new EntityGraph();
    g.addNode({ id: 'person-a', kind: 'person', label: 'A. Real Person' });
    g.addNode({ id: 'ent-holdco', kind: 'entity', label: 'Holdco' });
    g.addNode({ id: 'ent-opco', kind: 'entity', label: 'Opco (subject)' });
    g.addEdge({ from: 'person-a', to: 'ent-holdco', kind: 'owns', weight: 0.6 });
    g.addEdge({ from: 'ent-holdco', to: 'ent-opco', kind: 'owns', weight: 0.8 });
    const ubo = g.effectiveOwnership('ent-opco');
    expect(ubo[0]!.personId).toBe('person-a');
    expect(ubo[0]!.percent).toBeCloseTo(48, 1); // 0.6 × 0.8 × 100
  });

  it('shortestPath finds the connection between two nodes', () => {
    const g = new EntityGraph();
    for (const id of ['a', 'b', 'c', 'd']) g.addNode({ id, kind: 'entity', label: id });
    g.addEdge({ from: 'a', to: 'b', kind: 'transacted_with' });
    g.addEdge({ from: 'b', to: 'c', kind: 'transacted_with' });
    g.addEdge({ from: 'c', to: 'd', kind: 'transacted_with' });
    const path = g.shortestPath('a', 'd');
    expect(path).toEqual(['a', 'b', 'c', 'd']);
  });

  it('stats reports node / edge counts by kind', () => {
    const g = new EntityGraph();
    g.addNode({ id: 'p1', kind: 'person', label: 'p' });
    g.addNode({ id: 'e1', kind: 'entity', label: 'e' });
    g.addEdge({ from: 'p1', to: 'e1', kind: 'director_of' });
    const s = g.stats();
    expect(s.nodes).toBe(2);
    expect(s.edges).toBe(1);
    expect(s.byKind.person).toBe(1);
    expect(s.byEdgeKind.director_of).toBe(1);
  });
});

describe('smurfing-detector', () => {
  it('flags a single customer with 3+ near-threshold cash deposits inside the window', () => {
    const base = Date.parse('2026-04-01T00:00:00Z');
    const txs = Array.from({ length: 4 }, (_, i) => ({
      id: 't' + i, customerId: 'C1', amountAed: 52_000 + i * 500,
      channel: 'cash' as const, at: new Date(base + i * 86_400_000).toISOString(),
    }));
    const clusters = detectSmurfing(txs);
    expect(clusters.some((c) => c.kind === 'structuring' && c.customerId === 'C1')).toBe(true);
  });

  it('flags a smurfing ring sharing a linkKey across multiple customers', () => {
    const base = Date.parse('2026-04-01T00:00:00Z');
    const txs = [
      { id: 's1', customerId: 'A', amountAed: 52_000, channel: 'cash' as const, at: new Date(base).toISOString(), linkKey: 'dev-001' },
      { id: 's2', customerId: 'B', amountAed: 54_000, channel: 'cash' as const, at: new Date(base + 3600_000).toISOString(), linkKey: 'dev-001' },
      { id: 's3', customerId: 'C', amountAed: 51_000, channel: 'cash' as const, at: new Date(base + 7200_000).toISOString(), linkKey: 'dev-001' },
    ];
    const clusters = detectSmurfing(txs);
    const smurf = clusters.find((c) => c.kind === 'smurfing');
    expect(smurf).toBeDefined();
    expect(smurf!.kind === 'smurfing' && smurf!.customerIds.length).toBe(3);
  });
});

describe('evidence-corroboration', () => {
  it('returns 0 for empty evidence', () => {
    const r = corroborate([]);
    expect(r.score).toBe(0);
  });

  it('caps score at 0.3 when training-data evidence is present', () => {
    const r = corroborate([
      { id: 'e1', kind: 'training_data', title: 't', observedAt: new Date().toISOString(), languageIso: 'en', credibility: 'primary' },
      { id: 'e2', kind: 'corporate_registry', title: 't2', observedAt: new Date().toISOString(), languageIso: 'en', credibility: 'authoritative', publisher: 'UAE MoE' },
    ]);
    expect(r.score).toBeLessThanOrEqual(0.3);
    expect(r.trainingDataPenalty).toBe(1);
  });

  it('rewards multiple independent authoritative sources', () => {
    const r = corroborate([
      { id: 'e1', kind: 'regulator_press_release', title: 't', observedAt: new Date().toISOString(), languageIso: 'en', credibility: 'authoritative', publisher: 'OFAC' },
      { id: 'e2', kind: 'corporate_registry', title: 't', observedAt: new Date().toISOString(), languageIso: 'en', credibility: 'primary', publisher: 'UK CH' },
      { id: 'e3', kind: 'court_filing', title: 't', observedAt: new Date().toISOString(), languageIso: 'en', credibility: 'primary', publisher: 'US DoJ' },
    ]);
    expect(r.score).toBeGreaterThan(0.6);
    expect(r.independentSources).toBe(3);
  });
});

describe('investigation-timeline', () => {
  it('merges evidence + audit + transactions into a time-ordered sequence', () => {
    const tl = buildTimeline({
      evidence: [{ id: 'e1', kind: 'news_article', title: 'ft', observedAt: '2026-04-01T00:00:00Z', languageIso: 'en', credibility: 'reputable', publisher: 'FT' }],
      audit: [
        { seq: 1, timestamp: '2026-03-30T00:00:00Z', actor: 'analyst', action: 'case.open', payload: { caseId: 'c1' }, prevHash: '0', entryHash: 'a' },
        { seq: 2, timestamp: '2026-04-02T00:00:00Z', actor: 'mlro', action: 'disposition.set', payload: { decision: 'edd' }, prevHash: 'a', entryHash: 'b' },
      ],
      transactions: [
        { id: 'tx1', at: '2026-04-01T12:00:00Z', amountAed: 60_000, channel: 'cash' },
      ],
    });
    expect(tl.length).toBe(4);
    expect(tl[0]!.at < tl[3]!.at).toBe(true);
    const phases = summariseByPhase(tl);
    expect(phases.some((p) => p.phase === 'alert')).toBe(true);
    expect(phases.some((p) => p.phase === 'disposition')).toBe(true);
  });
});

describe('sanction-delta', () => {
  const makeEntry = (sourceRef: string, name: string, rawHash = 'h'): import('../watchlist-adapters.js').NormalisedListEntry => ({
    listId: 'ofac_sdn', sourceRef, primaryName: name,
    aliases: [], entityType: 'individual', identifiers: [], programs: ['SDN'],
    publishedAt: '2026-04-20', ingestedAt: '2026-04-22T06:00:00Z', rawHash,
  });

  it('detects additions + removals + amendments', () => {
    const prev = [makeEntry('A', 'Alpha Ltd'), makeEntry('B', 'Bravo Ltd')];
    const curr = [makeEntry('B', 'Bravo Ltd', 'h2'), makeEntry('C', 'Charlie Ltd')];
    const delta = computeSanctionDelta(prev, curr);
    expect(delta.additions.map((a) => a.sourceRef)).toEqual(['C']);
    expect(delta.removals.map((r) => r.sourceRef)).toEqual(['A']);
    expect(delta.amendments.map((a) => a.sourceRef)).toEqual(['B']);
    expect(entriesRequiringReScreen(delta)).toEqual(expect.arrayContaining(['C']));
  });
});

describe('cross-regime-conflict', () => {
  it('unanimous designation → freeze', () => {
    const r = detectCrossRegimeConflict([
      { regimeId: 'un_1267', hit: 'designated', asOf: new Date().toISOString() },
      { regimeId: 'ofac_sdn', hit: 'designated', asOf: new Date().toISOString() },
      { regimeId: 'uae_eocn', hit: 'designated', asOf: new Date().toISOString() },
    ]);
    expect(r.unanimousDesignated).toBe(true);
    expect(r.recommendedAction).toBe('freeze');
  });

  it('split designation flags a high-severity conflict', () => {
    const r = detectCrossRegimeConflict([
      { regimeId: 'un_1267', hit: 'designated', asOf: new Date().toISOString() },
      { regimeId: 'eu_consolidated', hit: 'not_designated', asOf: new Date().toISOString() },
    ]);
    expect(r.split).toBe(true);
    expect(r.conflicts.some((c) => c.severity === 'high')).toBe(true);
    expect(r.recommendedAction).toBe('block');
  });

  it('stale snapshots (> 7d) surface a coverage warning', () => {
    const r = detectCrossRegimeConflict([
      { regimeId: 'uae_eocn', hit: 'not_designated', asOf: '2025-01-01T00:00:00Z' },
    ]);
    expect(r.staleRegimes).toContain('uae_eocn');
    expect(r.rationale.some((x) => /stale/i.test(x))).toBe(true);
  });
});

describe('outcome-feedback', () => {
  it('computes agreement rate + bias signals', () => {
    const j = new OutcomeFeedbackJournal();
    // MLRO downgrades 4 of 5 hard proposals → bias signal.
    for (let i = 0; i < 5; i++) {
      j.record({
        runId: 'r' + i, at: new Date().toISOString(), caseId: 'c' + i, modeIds: ['data'],
        autoProposed: 'D05_frozen_ffr', autoConfidence: 0.9,
        mlroDecided: i < 4 ? 'D03_edd_required' : 'D05_frozen_ffr',
        overridden: i < 4, reviewerId: 'mlro-01',
      });
    }
    const rep = j.agreement();
    expect(rep.total).toBe(5);
    expect(rep.overridden).toBe(4);
    expect(rep.agreementRate).toBe(0.2);
    expect(rep.biasSignals.some((s) => s.signal === 'mlro_softens_hard_proposals')).toBe(true);
  });

  it('hydrateCalibration pushes records into the ledger', () => {
    const j = new OutcomeFeedbackJournal();
    j.record({
      runId: 'r1', at: new Date().toISOString(), caseId: 'c1', modeIds: ['data'],
      autoProposed: 'D02_cleared_proceed', autoConfidence: 0.85, mlroDecided: 'D02_cleared_proceed',
      overridden: false, reviewerId: 'mlro-01', groundTruth: 'confirmed',
    });
    const ledger = new CalibrationLedger();
    const n = j.hydrateCalibration(ledger);
    expect(n).toBe(1);
    expect(ledger.report().hits).toBe(1);
  });
});
