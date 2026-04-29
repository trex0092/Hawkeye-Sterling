// Layer 1 acceptance tests — source-of-truth registry.
//
// These tests are the contract for the regulator-grade build. Every
// later layer (citation validator, completion gate, audit log,
// evaluation harness) assumes these invariants hold.

import { describe, expect, it } from 'vitest';
import {
  buildSeedRegistry,
  retrieve,
  applyTaxonomicGuard,
  RegistryStore,
  hashChunkText,
  type CitationClass,
} from '../registry/index.js';

describe('registry: seed catalogue invariants', () => {
  const store = buildSeedRegistry();

  it('seeds at least one chunk per citation class A–D', () => {
    for (const c of ['A', 'B', 'C', 'D'] as CitationClass[]) {
      expect(store.byClass(c).length, `class ${c} should have seeded chunks`).toBeGreaterThan(0);
    }
  });

  it('every seeded chunk carries class label, source id, version, and content hash', () => {
    for (const ch of store.list()) {
      expect(ch.metadata.class, `chunk ${ch.id} missing class`).toBeTruthy();
      expect(ch.metadata.classLabel, `chunk ${ch.id} missing classLabel`).toBeTruthy();
      expect(ch.metadata.sourceId, `chunk ${ch.id} missing sourceId`).toBeTruthy();
      expect(ch.metadata.version, `chunk ${ch.id} missing version`).toBeTruthy();
      expect(ch.metadata.contentHash, `chunk ${ch.id} missing contentHash`).toMatch(/^[0-9a-f]{64}$/);
      expect(ch.metadata.ingestedAt, `chunk ${ch.id} missing ingestedAt`).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('seeds all 40 FATF Recommendations as Class D', () => {
    const fatf = store.list().filter((c) => c.metadata.sourceId.startsWith('FATF-R'));
    expect(fatf).toHaveLength(40);
    expect(new Set(fatf.map((c) => c.metadata.class))).toEqual(new Set(['D']));
    const nums = fatf.map((c) => c.metadata.articleNumber).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(nums).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it('FDL 10/2025 articles are Class A and tagged Arabic-controlling', () => {
    const fdl = store.bySource('FDL-10-2025');
    expect(fdl.length).toBeGreaterThanOrEqual(20);
    for (const ch of fdl) {
      expect(ch.metadata.class).toBe('A');
      expect(ch.metadata.language).toBe('ar');
      expect(ch.metadata.controlling).toBe(true);
    }
  });

  it('Cabinet Decision 134/2025 articles are Class B with effective date 2025-12-14', () => {
    const cd = store.bySource('CD-134-2025');
    expect(cd.length).toBeGreaterThanOrEqual(15);
    for (const ch of cd) {
      expect(ch.metadata.class).toBe('B');
      expect(ch.metadata.versionDate).toBe('2025-12-14');
    }
  });

  it('all seeded chunks are flagged pending until real-document ingestion', () => {
    // Exactly the contract: shells carry verified citations but not content.
    for (const ch of store.list()) {
      expect(ch.metadata.pending, `chunk ${ch.id} should be pending until ingested`).toBe(true);
    }
  });
});

describe('registry: taxonomic guard — gold ⇎ diamond / Kimberley', () => {
  const store = buildSeedRegistry();

  it('gold query suppresses Kimberley Process chunks even when the question name-checks Kimberley', () => {
    // The gold-context signal must override a lexical hit on Kimberley:
    // a UAE gold-trader asking "do Kimberley certificates apply to gold
    // refining" must NOT see Kimberley chunks surfaced — they were
    // lexically eligible (the question mentions "Kimberley") but the
    // taxonomic guard suppresses them because the query is gold-context.
    const result = retrieve(store, {
      text: 'For a UAE gold trader buying scrap jewellery for refining, do Kimberley Process certificates apply?',
      topK: 30,
    });
    const sourceIds = new Set(result.chunks.map((c) => c.metadata.sourceId));
    expect(sourceIds.has('KIMBERLEY-PROCESS-CS'), 'Kimberley Process must not surface on a gold query').toBe(false);
    const excludedSources = new Set(result.excluded.map((e) => e.chunk.metadata.sourceId));
    expect(excludedSources.has('KIMBERLEY-PROCESS-CS')).toBe(true);
    expect(result.taxonomicGuardActions.some((a) => a.includes('gold-excludes-diamond-kimberley'))).toBe(true);
  });

  it('diamond query suppresses LBMA Responsible Gold Guidance chunks', () => {
    const result = retrieve(store, { text: 'Kimberley Process certification for rough diamond imports' });
    const sourceIds = new Set(result.chunks.map((c) => c.metadata.sourceId));
    expect(sourceIds.has('LBMA-RGG-v9'), 'LBMA RGG must not surface on a diamond query').toBe(false);
  });

  it('guard outcome traces every rule that fired', () => {
    const outcome = applyTaxonomicGuard('LBMA gold bullion refining audit');
    expect(outcome.trace.length).toBeGreaterThan(0);
    expect(outcome.trace[0]!.ruleId).toBe('gold-excludes-diamond-kimberley');
    expect(outcome.excludedTags.has('kimberley')).toBe(true);
    expect(outcome.excludedTags.has('diamond')).toBe(true);
  });
});

describe('registry: STR-on-FDL acceptance test (build-spec acceptance)', () => {
  const store = buildSeedRegistry();
  const result = retrieve(store, {
    text: 'STR filing obligation under FDL 10/2025 — timing and audit-trail requirements',
    topK: 30,
  });

  it('returns at least one chunk from each of Classes A, B, and C', () => {
    const classes = new Set(result.chunks.map((c) => c.metadata.class));
    expect(classes.has('A'), 'must include Class A — primary law').toBe(true);
    expect(classes.has('B'), 'must include Class B — executive regulation').toBe(true);
    expect(classes.has('C'), 'must include Class C — FIU operational guidance').toBe(true);
  });

  it('every returned chunk has its article reference explicitly tagged', () => {
    for (const ch of result.chunks) {
      expect(ch.metadata.articleRef, `chunk ${ch.id} must carry articleRef`).toBeTruthy();
    }
  });

  it('returns Class A (FDL 10/2025) STR-substantive articles 22–24', () => {
    // Per the seed catalogue: Art.22 = STR obligation, Art.23 = timing,
    // Art.24 = confidentiality / audit-trail. (Art.25 is tipping-off,
    // intentionally a separate article — not a hit on this STR query.)
    const fdlArts = result.chunks
      .filter((c) => c.metadata.sourceId === 'FDL-10-2025')
      .map((c) => c.metadata.articleNumber);
    expect(fdlArts).toEqual(expect.arrayContaining([22, 23, 24]));
  });
});

describe('registry: class metadata is always preserved end-to-end', () => {
  const store = buildSeedRegistry();

  it('every chunk surfaced by retrieve() carries class + classLabel', () => {
    const queries = [
      'CDD onboarding for a new corporate customer',
      'tipping-off rule under UAE law',
      'FATF Recommendation 16 wire-transfer rule',
      'cross-border cash declaration obligation',
      'EOCN consolidated sanctions list',
    ];
    for (const q of queries) {
      const r = retrieve(store, { text: q });
      for (const ch of r.chunks) {
        expect(ch.metadata.class).toBeTruthy();
        expect(ch.metadata.classLabel).toBeTruthy();
      }
    }
  });

  it('class filter restricts results to requested classes only', () => {
    const r = retrieve(store, { text: 'CDD onboarding', classes: ['A', 'B'], topK: 50 });
    const classes = new Set(r.chunks.map((c) => c.metadata.class));
    for (const c of classes) {
      expect(['A', 'B']).toContain(c);
    }
  });
});

describe('registry: snapshot integrity', () => {
  it('snapshot round-trips: same hash, same chunks', () => {
    const a = buildSeedRegistry();
    const snap = a.snapshot();
    const b = RegistryStore.fromSnapshot(snap);
    expect(b.size()).toBe(a.size());
    expect(b.snapshot().registryHash).toBe(snap.registryHash);
  });

  it('tampered snapshot fails verification', () => {
    const a = buildSeedRegistry();
    const snap = a.snapshot();
    const tampered = { ...snap, chunks: snap.chunks.slice(0, -1) }; // drop last chunk; hash now mismatches
    expect(() => RegistryStore.fromSnapshot(tampered)).toThrow(/hash mismatch/i);
  });
});

describe('registry: content hashing is deterministic', () => {
  it('whitespace normalisation produces stable hashes', () => {
    const a = hashChunkText('hello  world\n\n');
    const b = hashChunkText('hello world');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('semantic edits change the hash', () => {
    const a = hashChunkText('hello world');
    const b = hashChunkText('hello earth');
    expect(a).not.toBe(b);
  });
});
