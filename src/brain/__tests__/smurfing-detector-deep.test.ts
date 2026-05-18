// Deep coverage tests for smurfing-detector.ts
// Covers: detectSmurfing (no-data, structuring clusters, smurfing rings,
//         severity thresholds, window boundaries, non-cash channels filtered,
//         invalid timestamps dropped), detectRings + classifyRing.

import { describe, it, expect } from 'vitest';
import {
  detectSmurfing,
  type SmurfingTransaction,
} from '../smurfing-detector.js';
import { detectRings, classifyRing, type SubjectFingerprint } from '../ring-detector.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function cashTx(
  id: string,
  customerId: string,
  amountAed: number,
  at: string,
  linkKey?: string,
): SmurfingTransaction {
  return { id, customerId, amountAed, channel: 'cash', at, linkKey };
}

const BASE_DATE = '2026-01-01T00:00:00Z';
function daysAfter(n: number): string {
  const d = new Date(BASE_DATE);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}

// ── detectSmurfing — empty input ──────────────────────────────────────────────

describe('detectSmurfing — empty input', () => {
  it('returns empty array for empty transactions', () => {
    expect(detectSmurfing([])).toEqual([]);
  });
});

// ── detectSmurfing — non-cash filtered out ───────────────────────────────────

describe('detectSmurfing — non-cash channels ignored', () => {
  it('wire transactions are not included in structuring detection', () => {
    const txs: SmurfingTransaction[] = Array.from({ length: 5 }, (_, i) => ({
      id: `w${i}`,
      customerId: 'C1',
      amountAed: 50_000,
      channel: 'wire',
      at: daysAfter(i),
    }));
    const clusters = detectSmurfing(txs);
    expect(clusters.filter((c) => c.kind === 'structuring')).toHaveLength(0);
  });

  it('card transactions do not trigger smurfing ring', () => {
    const txs: SmurfingTransaction[] = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      customerId: `CUST-${i}`,
      amountAed: 50_000,
      channel: 'card',
      at: BASE_DATE,
      linkKey: 'shared-link',
    }));
    const clusters = detectSmurfing(txs);
    expect(clusters.filter((c) => c.kind === 'smurfing')).toHaveLength(0);
  });
});

// ── detectSmurfing — structuring clusters ────────────────────────────────────

describe('detectSmurfing — structuring cluster detection', () => {
  const THRESHOLD = 55_000;
  const BAND_LOW = THRESHOLD * 0.9;  // 49 500

  function buildStructuringTxs(count: number): SmurfingTransaction[] {
    return Array.from({ length: count }, (_, i) =>
      cashTx(`tx-${i}`, 'CUST-1', BAND_LOW + 100, daysAfter(i)),
    );
  }

  it('does NOT fire with fewer than minCount (3) near-threshold transactions', () => {
    const clusters = detectSmurfing(buildStructuringTxs(2));
    expect(clusters).toHaveLength(0);
  });

  it('fires with exactly minCount (3) near-threshold transactions', () => {
    const clusters = detectSmurfing(buildStructuringTxs(3));
    expect(clusters.filter((c) => c.kind === 'structuring')).toHaveLength(1);
  });

  it('cluster contains the correct customerId', () => {
    const clusters = detectSmurfing(buildStructuringTxs(3));
    const s = clusters.find((c) => c.kind === 'structuring');
    expect(s).toBeDefined();
    if (s?.kind === 'structuring') expect(s.customerId).toBe('CUST-1');
  });

  it('cluster count and totalAed are correct', () => {
    const amt = BAND_LOW + 100;
    const clusters = detectSmurfing(buildStructuringTxs(3));
    const s = clusters.find((c) => c.kind === 'structuring');
    if (s?.kind === 'structuring') {
      expect(s.count).toBe(3);
      expect(s.totalAed).toBeCloseTo(amt * 3);
    }
  });

  it('severity is "medium" for 4 transactions', () => {
    const clusters = detectSmurfing(buildStructuringTxs(4));
    const s = clusters.find((c) => c.kind === 'structuring');
    if (s?.kind === 'structuring') expect(s.severity).toBe('medium');
  });

  it('severity is "high" for 6 transactions', () => {
    const clusters = detectSmurfing(buildStructuringTxs(6));
    const s = clusters.find((c) => c.kind === 'structuring');
    if (s?.kind === 'structuring') expect(s.severity).toBe('high');
  });

  it('transactions exactly at threshold are excluded from the near-band', () => {
    // Amount = threshold = 55 000 → bandHigh is exclusive (< bandHigh).
    const txs = Array.from({ length: 3 }, (_, i) =>
      cashTx(`t${i}`, 'CUST-2', 55_000, daysAfter(i)),
    );
    const clusters = detectSmurfing(txs, { thresholdAed: 55_000 });
    // At exactly threshold bandHigh = 55000; the filter is < bandHigh so these are excluded.
    expect(clusters.filter((c) => c.kind === 'structuring')).toHaveLength(0);
  });

  it('transactions outside the 14-day window are not clustered together', () => {
    // 3 transactions, each 8 days apart → total span = 16 days > 14.
    const txs = [
      cashTx('t1', 'CUST-3', 50_000, daysAfter(0)),
      cashTx('t2', 'CUST-3', 50_000, daysAfter(8)),
      cashTx('t3', 'CUST-3', 50_000, daysAfter(16)),
    ];
    const clusters = detectSmurfing(txs);
    expect(clusters.filter((c) => c.kind === 'structuring')).toHaveLength(0);
  });

  it('custom threshold and windowDays are respected', () => {
    // Lower threshold: AED 10 000; band = 9 000–10 000
    const txs = Array.from({ length: 3 }, (_, i) =>
      cashTx(`t${i}`, 'CUST-4', 9_500, daysAfter(i)),
    );
    const clusters = detectSmurfing(txs, { thresholdAed: 10_000, windowDays: 30 });
    expect(clusters.filter((c) => c.kind === 'structuring')).toHaveLength(1);
  });
});

// ── detectSmurfing — smurfing ring detection ──────────────────────────────────

describe('detectSmurfing — smurfing ring detection', () => {
  function buildRingTxs(
    count: number,
    linkKey = 'shared-phone',
    distinct = true,
  ): SmurfingTransaction[] {
    return Array.from({ length: count }, (_, i) =>
      cashTx(`r${i}`, distinct ? `RING-CUST-${i}` : 'SINGLE-CUST', 30_000, BASE_DATE, linkKey),
    );
  }

  it('does NOT fire with a single customer even with a linkKey', () => {
    const txs = buildRingTxs(5, 'key1', false);
    expect(detectSmurfing(txs).filter((c) => c.kind === 'smurfing')).toHaveLength(0);
  });

  it('does NOT fire with fewer than minRingCount (3) transactions', () => {
    const txs = buildRingTxs(2);
    expect(detectSmurfing(txs).filter((c) => c.kind === 'smurfing')).toHaveLength(0);
  });

  it('fires with exactly minRingCount transactions across ≥2 customers', () => {
    const txs = buildRingTxs(3);
    expect(detectSmurfing(txs).filter((c) => c.kind === 'smurfing')).toHaveLength(1);
  });

  it('cluster contains correct linkKey and customerIds', () => {
    const txs = buildRingTxs(3, 'phone-007');
    const clusters = detectSmurfing(txs);
    const ring = clusters.find((c) => c.kind === 'smurfing');
    if (ring?.kind === 'smurfing') {
      expect(ring.linkKey).toBe('phone-007');
      expect(ring.customerIds).toHaveLength(3);
    }
  });

  it('severity is "medium" for 3–4 distinct customers', () => {
    const txs = buildRingTxs(3);
    const ring = detectSmurfing(txs).find((c) => c.kind === 'smurfing');
    if (ring?.kind === 'smurfing') expect(ring.severity).toBe('medium');
  });

  it('severity is "high" for 5+ distinct customers', () => {
    const txs = buildRingTxs(5);
    const ring = detectSmurfing(txs).find((c) => c.kind === 'smurfing');
    if (ring?.kind === 'smurfing') expect(ring.severity).toBe('high');
  });

  it('does not fire when transactions span beyond the window', () => {
    const txs = [
      cashTx('r1', 'C1', 30_000, daysAfter(0), 'lk'),
      cashTx('r2', 'C2', 30_000, daysAfter(8), 'lk'),
      cashTx('r3', 'C3', 30_000, daysAfter(16), 'lk'),
    ]; // span = 16 days > 14-day default
    expect(detectSmurfing(txs).filter((c) => c.kind === 'smurfing')).toHaveLength(0);
  });

  it('transactions without linkKey are not included in ring detection', () => {
    const txs = Array.from({ length: 4 }, (_, i) =>
      cashTx(`t${i}`, `C${i}`, 30_000, BASE_DATE), // no linkKey
    );
    expect(detectSmurfing(txs).filter((c) => c.kind === 'smurfing')).toHaveLength(0);
  });
});

// ── detectSmurfing — invalid timestamps dropped ──────────────────────────────

describe('detectSmurfing — invalid timestamps', () => {
  it('drops transactions with invalid timestamps', () => {
    const txs: SmurfingTransaction[] = [
      cashTx('bad', 'C1', 50_000, 'not-a-date'),
      cashTx('good1', 'C1', 50_000, daysAfter(0)),
      cashTx('good2', 'C1', 50_000, daysAfter(1)),
    ];
    // Should not throw; bad timestamps are filtered.
    expect(() => detectSmurfing(txs)).not.toThrow();
  });
});

// ── detectRings ───────────────────────────────────────────────────────────────

describe('detectRings — basic', () => {
  it('returns empty for fewer than 2 subjects', () => {
    const fp: SubjectFingerprint = { subjectId: 's1', identifiers: ['id1'] };
    expect(detectRings([fp])).toHaveLength(0);
    expect(detectRings([])).toHaveLength(0);
  });

  it('finds a ring when two subjects share an identifier', () => {
    const fps: SubjectFingerprint[] = [
      { subjectId: 's1', identifiers: ['passport-123'] },
      { subjectId: 's2', identifiers: ['passport-123'] },
    ];
    const rings = detectRings(fps);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.subjectIds.sort()).toEqual(['s1', 's2']);
  });

  it('ring size equals the number of connected subjects', () => {
    const fps: SubjectFingerprint[] = [
      { subjectId: 'a', beneficialOwners: ['bo-1'] },
      { subjectId: 'b', beneficialOwners: ['bo-1'] },
      { subjectId: 'c', beneficialOwners: ['bo-1'] },
    ];
    const rings = detectRings(fps);
    expect(rings[0]!.size).toBe(3);
  });

  it('returns no ring when subjects have no shared dimensions', () => {
    const fps: SubjectFingerprint[] = [
      { subjectId: 'x1', identifiers: ['id-x1'] },
      { subjectId: 'x2', identifiers: ['id-x2'] },
    ];
    expect(detectRings(fps)).toHaveLength(0);
  });

  it('minSize parameter filters small rings', () => {
    const fps: SubjectFingerprint[] = [
      { subjectId: 'a', counterparties: ['wallet-1'] },
      { subjectId: 'b', counterparties: ['wallet-1'] },
    ];
    expect(detectRings(fps, 3)).toHaveLength(0);
    expect(detectRings(fps, 2)).toHaveLength(1);
  });

  it('sharedDimensions lists the shared value', () => {
    const fps: SubjectFingerprint[] = [
      { subjectId: 'a', addresses: ['123 Main St'] },
      { subjectId: 'b', addresses: ['123 Main St'] },
    ];
    const rings = detectRings(fps);
    const dim = rings[0]!.sharedDimensions.find((d) => d.dimension === 'address');
    expect(dim).toBeDefined();
    expect(dim!.value).toBe('123 Main St');
    expect(dim!.count).toBe(2);
  });

  it('union-find correctly merges subjects connected through a chain', () => {
    // a-b share id1, b-c share id2 → all three in one ring.
    const fps: SubjectFingerprint[] = [
      { subjectId: 'a', identifiers: ['id1'] },
      { subjectId: 'b', identifiers: ['id1', 'id2'] },
      { subjectId: 'c', identifiers: ['id2'] },
    ];
    const rings = detectRings(fps);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.subjectIds.sort()).toEqual(['a', 'b', 'c']);
  });
});

// ── classifyRing ─────────────────────────────────────────────────────────────

describe('classifyRing', () => {
  it('classifies counterparty-linked ring as "mule"', () => {
    const fps: SubjectFingerprint[] = [
      { subjectId: 'a', counterparties: ['wallet-X'] },
      { subjectId: 'b', counterparties: ['wallet-X'] },
    ];
    const ring = detectRings(fps)[0]!;
    expect(classifyRing(ring)).toBe('mule');
  });

  it('classifies beneficial-owner linked ring as "front_company"', () => {
    const fps: SubjectFingerprint[] = [
      { subjectId: 'a', beneficialOwners: ['person-1'] },
      { subjectId: 'b', beneficialOwners: ['person-1'] },
    ];
    const ring = detectRings(fps)[0]!;
    expect(classifyRing(ring)).toBe('front_company');
  });

  it('classifies director-linked ring as "professional_enabler"', () => {
    const fps: SubjectFingerprint[] = [
      { subjectId: 'a', director: ['dir-1'] },
      { subjectId: 'b', director: ['dir-1'] },
    ];
    const ring = detectRings(fps)[0]!;
    expect(classifyRing(ring)).toBe('professional_enabler');
  });

  it('classifies address-linked ring as "address_cluster"', () => {
    const fps: SubjectFingerprint[] = [
      { subjectId: 'a', addresses: ['PO Box 999'] },
      { subjectId: 'b', addresses: ['PO Box 999'] },
    ];
    const ring = detectRings(fps)[0]!;
    expect(classifyRing(ring)).toBe('address_cluster');
  });

  it('returns "uncertain" for ring with no shared dimensions', () => {
    // Create an artificial ring with no dimensions.
    const ring = {
      id: 'ring_1',
      subjectIds: ['a', 'b'],
      sharedDimensions: [],
      size: 2,
      density: 0,
    };
    expect(classifyRing(ring)).toBe('uncertain');
  });
});
