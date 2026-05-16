// Deep tests for ring-detector.ts — detectRings(), classifyRing(), all ring types
import { describe, it, expect } from 'vitest';
import { detectRings, classifyRing } from '../ring-detector.js';
import type { SubjectFingerprint, Ring } from '../ring-detector.js';

// ─── detectRings ────────────────────────────────────────────────────────────

describe('detectRings: basic cases', () => {
  it('returns [] for empty population', () => {
    expect(detectRings([])).toEqual([]);
  });

  it('returns [] for single subject', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 's1', counterparties: ['wallet-A'] },
    ];
    expect(detectRings(pop)).toEqual([]);
  });

  it('returns [] when no subjects share any dimension', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 's1', identifiers: ['ID-001'], addresses: ['addr-1'] },
      { subjectId: 's2', identifiers: ['ID-002'], addresses: ['addr-2'] },
    ];
    expect(detectRings(pop)).toEqual([]);
  });

  it('detects a ring via shared counterparty', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 's1', counterparties: ['wallet-X'] },
      { subjectId: 's2', counterparties: ['wallet-X'] },
    ];
    const rings = detectRings(pop);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.size).toBe(2);
    expect(rings[0]!.subjectIds).toContain('s1');
    expect(rings[0]!.subjectIds).toContain('s2');
  });

  it('detects a ring via shared identifier', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', identifiers: ['PASSPORT-7890'] },
      { subjectId: 'b', identifiers: ['PASSPORT-7890'] },
    ];
    const rings = detectRings(pop);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.sharedDimensions[0]!.dimension).toBe('identifier');
    expect(rings[0]!.sharedDimensions[0]!.value).toBe('PASSPORT-7890');
  });

  it('detects a ring via shared address', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', addresses: ['123 High St'] },
      { subjectId: 'b', addresses: ['123 High St'] },
    ];
    const rings = detectRings(pop);
    expect(rings[0]!.sharedDimensions[0]!.dimension).toBe('address');
  });

  it('detects a ring via shared beneficial owner', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'c1', beneficialOwners: ['person-A'] },
      { subjectId: 'c2', beneficialOwners: ['person-A'] },
    ];
    const rings = detectRings(pop);
    expect(rings[0]!.sharedDimensions[0]!.dimension).toBe('beneficial_owner');
  });

  it('detects a ring via shared director', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'd1', director: ['director-Z'] },
      { subjectId: 'd2', director: ['director-Z'] },
    ];
    const rings = detectRings(pop);
    expect(rings[0]!.sharedDimensions[0]!.dimension).toBe('director');
  });

  it('ring size matches subject count', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'x', counterparties: ['wallet-Q'] },
      { subjectId: 'y', counterparties: ['wallet-Q'] },
      { subjectId: 'z', counterparties: ['wallet-Q'] },
    ];
    const rings = detectRings(pop);
    expect(rings[0]!.size).toBe(3);
    expect(rings[0]!.sharedDimensions[0]!.count).toBe(3);
  });

  it('minSize=3 excludes 2-member rings', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', counterparties: ['wallet-W'] },
      { subjectId: 'b', counterparties: ['wallet-W'] },
    ];
    const rings = detectRings(pop, 3);
    expect(rings).toHaveLength(0);
  });

  it('minSize=2 is the default', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', counterparties: ['wallet-V'] },
      { subjectId: 'b', counterparties: ['wallet-V'] },
    ];
    const rings = detectRings(pop);
    expect(rings).toHaveLength(1);
  });

  it('union-find merges transitively connected subjects', () => {
    // a→b via wallet-1, b→c via wallet-2 — all in one ring
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', counterparties: ['wallet-1'] },
      { subjectId: 'b', counterparties: ['wallet-1', 'wallet-2'] },
      { subjectId: 'c', counterparties: ['wallet-2'] },
    ];
    const rings = detectRings(pop);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.size).toBe(3);
    expect(rings[0]!.subjectIds).toContain('a');
    expect(rings[0]!.subjectIds).toContain('b');
    expect(rings[0]!.subjectIds).toContain('c');
  });

  it('produces two separate rings when clusters are disjoint', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', counterparties: ['wallet-1'] },
      { subjectId: 'b', counterparties: ['wallet-1'] },
      { subjectId: 'c', counterparties: ['wallet-9'] },
      { subjectId: 'd', counterparties: ['wallet-9'] },
    ];
    const rings = detectRings(pop);
    expect(rings).toHaveLength(2);
  });

  it('rings are sorted largest first', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', counterparties: ['wallet-A'] },
      { subjectId: 'b', counterparties: ['wallet-A'] },
      { subjectId: 'c', counterparties: ['wallet-B'] },
      { subjectId: 'd', counterparties: ['wallet-B'] },
      { subjectId: 'e', counterparties: ['wallet-B'] },
    ];
    const rings = detectRings(pop);
    expect(rings[0]!.size).toBeGreaterThanOrEqual(rings[1]!.size);
  });

  it('density is ≥ 0 and ≤ 1', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', counterparties: ['w1'], addresses: ['addr-1'] },
      { subjectId: 'b', counterparties: ['w1'], addresses: ['addr-2'] },
    ];
    const rings = detectRings(pop);
    const d = rings[0]!.density;
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('ring id is sequenced ring_1, ring_2 etc.', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', counterparties: ['w-X'] },
      { subjectId: 'b', counterparties: ['w-X'] },
    ];
    const rings = detectRings(pop);
    expect(rings[0]!.id).toMatch(/^ring_\d+$/);
  });

  it('empty values are ignored', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', identifiers: ['', 'ID-001'] },
      { subjectId: 'b', identifiers: ['', 'ID-001'] },
    ];
    const rings = detectRings(pop);
    expect(rings).toHaveLength(1);
    // Empty string should not appear as a shared dimension
    const emptyDim = rings[0]!.sharedDimensions.find((d) => d.value === '');
    expect(emptyDim).toBeUndefined();
  });

  it('subjects with no shared dims each stay solo (no rings)', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'solo-1' },
      { subjectId: 'solo-2' },
    ];
    expect(detectRings(pop)).toHaveLength(0);
  });

  it('sharedDimensions count reflects overlap correctly', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 'a', counterparties: ['w1', 'w2', 'w3'] },
      { subjectId: 'b', counterparties: ['w1', 'w2', 'w3'] },
    ];
    const rings = detectRings(pop);
    // 3 shared wallets → 3 sharedDimensions entries
    expect(rings[0]!.sharedDimensions.length).toBe(3);
    for (const sd of rings[0]!.sharedDimensions) {
      expect(sd.count).toBe(2);
    }
  });

  it('large population with no links returns empty', () => {
    const pop: SubjectFingerprint[] = Array.from({ length: 50 }, (_, i) => ({
      subjectId: `s${i}`,
      counterparties: [`unique-wallet-${i}`],
    }));
    expect(detectRings(pop)).toHaveLength(0);
  });
});

// ─── classifyRing ────────────────────────────────────────────────────────────

describe('classifyRing', () => {
  function makeRing(dims: Array<[Ring['sharedDimensions'][number]['dimension'], number]>): Ring {
    const sharedDimensions = dims.map(([dimension, count]) => ({
      dimension,
      value: 'v',
      count,
    }));
    return {
      id: 'ring_1',
      subjectIds: ['a', 'b'],
      sharedDimensions,
      size: 2,
      density: 0.5,
    };
  }

  it('dominant counterparty → mule', () => {
    const ring = makeRing([['counterparty', 10], ['address', 1]]);
    expect(classifyRing(ring)).toBe('mule');
  });

  it('dominant beneficial_owner → front_company', () => {
    const ring = makeRing([['beneficial_owner', 8], ['counterparty', 2]]);
    expect(classifyRing(ring)).toBe('front_company');
  });

  it('dominant director → professional_enabler', () => {
    const ring = makeRing([['director', 7]]);
    expect(classifyRing(ring)).toBe('professional_enabler');
  });

  it('dominant address → address_cluster', () => {
    const ring = makeRing([['address', 5], ['identifier', 1]]);
    expect(classifyRing(ring)).toBe('address_cluster');
  });

  it('dominant identifier → uncertain', () => {
    const ring = makeRing([['identifier', 10]]);
    expect(classifyRing(ring)).toBe('uncertain');
  });

  it('empty sharedDimensions → uncertain', () => {
    const ring = makeRing([]);
    expect(classifyRing(ring)).toBe('uncertain');
  });

  it('tie is resolved by summing per-dimension counts', () => {
    // Two counterparty dims each with count 3 → total 6 vs address total 5
    const ring: Ring = {
      id: 'ring_1',
      subjectIds: ['a', 'b', 'c'],
      sharedDimensions: [
        { dimension: 'counterparty', value: 'w1', count: 3 },
        { dimension: 'counterparty', value: 'w2', count: 3 },
        { dimension: 'address', value: 'addr', count: 5 },
      ],
      size: 3,
      density: 0.5,
    };
    expect(classifyRing(ring)).toBe('mule');
  });

  it('real ring from detectRings can be classified', () => {
    const pop: SubjectFingerprint[] = [
      { subjectId: 's1', counterparties: ['w-A', 'w-B'] },
      { subjectId: 's2', counterparties: ['w-A', 'w-B'] },
    ];
    const rings = detectRings(pop);
    const cls = classifyRing(rings[0]!);
    expect(cls).toBe('mule');
  });

  it('beneficial_owner dominates over director', () => {
    const ring = makeRing([['beneficial_owner', 10], ['director', 3]]);
    expect(classifyRing(ring)).toBe('front_company');
  });
});
