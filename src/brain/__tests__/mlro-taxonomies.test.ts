import { describe, expect, it } from 'vitest';
import {
  MLRO_COMPETENCIES,
  MLRO_REASONING_TYPES,
  MLRO_ANALYSIS_TYPES,
  MLRO_CAPABILITIES,
  MLRO_CAPABILITIES_BY_BUCKET,
  searchCapabilities,
} from '../mlro-capabilities.generated.js';
import {
  MLRO_RED_FLAGS_TAXONOMY,
  MLRO_RED_FLAGS_BY_BUCKET,
  MLRO_RED_FLAG_BUCKET_LABELS,
  searchRedFlags,
} from '../mlro-red-flags-taxonomy.generated.js';

describe('mlro-capabilities', () => {
  it('ships competencies + reasoning + analysis', () => {
    expect(MLRO_COMPETENCIES.length).toBeGreaterThan(100);
    expect(MLRO_REASONING_TYPES.length).toBeGreaterThan(100);
    expect(MLRO_ANALYSIS_TYPES.length).toBeGreaterThan(150);
  });

  it('has unique ids across all buckets', () => {
    const ids = MLRO_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('bucket index is consistent with the flat list', () => {
    const flatTotal = MLRO_CAPABILITIES.length;
    const bucketTotal =
      MLRO_CAPABILITIES_BY_BUCKET.competency.length +
      MLRO_CAPABILITIES_BY_BUCKET.reasoning.length +
      MLRO_CAPABILITIES_BY_BUCKET.analysis.length;
    expect(bucketTotal).toBe(flatTotal);
  });

  it('search tokenises + AND-matches', () => {
    const hits = searchCapabilities('risk assessment');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((c) => /risk/i.test(c.label) && /assess/i.test(c.label))).toBe(true);
  });
});

describe('mlro-red-flags-taxonomy', () => {
  it('ships ~700 flags across 7 buckets', () => {
    expect(MLRO_RED_FLAGS_TAXONOMY.length).toBeGreaterThanOrEqual(700);
    expect(Object.keys(MLRO_RED_FLAG_BUCKET_LABELS).length).toBe(7);
  });

  it('every flag id is unique', () => {
    const ids = MLRO_RED_FLAGS_TAXONOMY.map((rf) => rf.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every bucket is non-empty', () => {
    for (const [bucket, list] of Object.entries(MLRO_RED_FLAGS_BY_BUCKET)) {
      expect(list.length, `bucket ${bucket} empty`).toBeGreaterThan(0);
    }
  });

  it('search surfaces structuring / smurfing flags', () => {
    const hits = searchRedFlags('structuring');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((rf) => rf.bucket === 'transaction' || rf.bucket === 'behavioral')).toBe(true);
  });

  it('search surfaces CAHRA / conflict minerals flags', () => {
    const hits = searchRedFlags('conflict');
    expect(hits.some((rf) => /conflict/i.test(rf.label))).toBe(true);
  });
});
