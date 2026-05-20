import { describe, it, expect, vi } from 'vitest';
import {
  captureListVersions,
  normaliseMatchThreshold,
  buildListVersionAuditFields,
  DEFAULT_MATCH_THRESHOLD,
  SNAPSHOT_LIST_IDS,
  type ListVersionStore,
} from '../list-versions';

function makeStore(map: Record<string, unknown>): ListVersionStore {
  return {
    get: vi.fn(async (key: string) => map[key] ?? null),
  };
}

function makeBlob(entityCount: number, fetchedAt: string, sha256?: string) {
  return {
    metadata: { entityCount, fetchedAt, sha256 },
    entities: Array.from({ length: entityCount }, (_, i) => ({ id: `e${i}` })),
  };
}

describe('captureListVersions', () => {
  it('returns storeUnavailable: true when store is null', async () => {
    const cap = await captureListVersions(null);
    expect(cap.storeUnavailable).toBe(true);
    expect(cap.versions).toEqual({});
    expect(Number.isFinite(Date.parse(cap.capturedAt))).toBe(true);
  });

  it('snapshots every requested list id', async () => {
    const store = makeStore({
      'un_consolidated/latest.json': makeBlob(1009, '2026-05-19T03:00:00.000Z', 'sha_un_1'),
      'ofac_sdn/latest.json':       makeBlob(18969, '2026-05-19T03:00:01.000Z', 'sha_ofac_1'),
    });
    const cap = await captureListVersions(store, ['un_consolidated', 'ofac_sdn']);
    expect(cap.storeUnavailable).toBe(false);
    expect(cap.versions['un_consolidated']).toEqual({
      entityCount: 1009,
      fetchedAt: '2026-05-19T03:00:00.000Z',
      sha256: 'sha_un_1',
    });
    expect(cap.versions['ofac_sdn']).toEqual({
      entityCount: 18969,
      fetchedAt: '2026-05-19T03:00:01.000Z',
      sha256: 'sha_ofac_1',
    });
  });

  it('records null for a list whose blob is missing (vs zero entries)', async () => {
    const store = makeStore({
      'un_consolidated/latest.json': makeBlob(1009, '2026-05-19T03:00:00.000Z'),
      // ofac_sdn intentionally absent
    });
    const cap = await captureListVersions(store, ['un_consolidated', 'ofac_sdn']);
    expect(cap.versions['un_consolidated']).not.toBeNull();
    expect(cap.versions['ofac_sdn']).toBeNull();
  });

  it('records entityCount: 0 when the blob is present but empty (CORPUS_INCOMPLETE signal)', async () => {
    const store = makeStore({
      'ch_seco/latest.json': { metadata: { entityCount: 0, fetchedAt: '2026-05-19T03:00:00.000Z' }, entities: [] },
    });
    const cap = await captureListVersions(store, ['ch_seco']);
    expect(cap.versions['ch_seco']).toEqual({
      entityCount: 0,
      fetchedAt: '2026-05-19T03:00:00.000Z',
    });
  });

  it('derives entityCount from the entities array when metadata.entityCount is absent', async () => {
    const store = makeStore({
      'un_consolidated/latest.json': {
        metadata: { fetchedAt: '2026-05-19T03:00:00.000Z' },
        entities: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      },
    });
    const cap = await captureListVersions(store, ['un_consolidated']);
    expect(cap.versions['un_consolidated']?.entityCount).toBe(3);
  });

  it('coerces entityCount to 0 when neither metadata nor entities array is present', async () => {
    const store = makeStore({ 'eu_fsf/latest.json': { metadata: {}, weird: 'shape' } });
    const cap = await captureListVersions(store, ['eu_fsf']);
    expect(cap.versions['eu_fsf']).toEqual({ entityCount: 0, fetchedAt: null });
  });

  it('omits the sha256 field when the metadata does not include it', async () => {
    const store = makeStore({ 'uk_ofsi/latest.json': makeBlob(5135, '2026-05-19T03:00:00.000Z') });
    const cap = await captureListVersions(store, ['uk_ofsi']);
    expect(cap.versions['uk_ofsi']).toEqual({
      entityCount: 5135,
      fetchedAt: '2026-05-19T03:00:00.000Z',
    });
    expect(cap.versions['uk_ofsi']).not.toHaveProperty('sha256');
  });

  it('records null when a single list read throws (must not break the whole capture)', async () => {
    const store: ListVersionStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'ofac_sdn/latest.json') throw new Error('transient blob read failure');
        if (key === 'un_consolidated/latest.json') return makeBlob(1009, '2026-05-19T03:00:00.000Z');
        return null;
      }),
    };
    const cap = await captureListVersions(store, ['un_consolidated', 'ofac_sdn']);
    expect(cap.storeUnavailable).toBe(false);
    expect(cap.versions['un_consolidated']?.entityCount).toBe(1009);
    expect(cap.versions['ofac_sdn']).toBeNull();
  });

  it('defaults to all SNAPSHOT_LIST_IDS when no list filter is given', async () => {
    const store = makeStore({});
    const cap = await captureListVersions(store);
    // Every well-known id appears in the result (null because store is empty).
    for (const id of SNAPSHOT_LIST_IDS) {
      expect(cap.versions[id]).toBeNull();
    }
  });
});

describe('normaliseMatchThreshold', () => {
  it('returns the documented default when value is missing', () => {
    expect(normaliseMatchThreshold(undefined)).toBe(DEFAULT_MATCH_THRESHOLD);
    expect(normaliseMatchThreshold(null)).toBe(DEFAULT_MATCH_THRESHOLD);
  });

  it('returns the documented default when value is not a number', () => {
    expect(normaliseMatchThreshold('0.9' as unknown)).toBe(DEFAULT_MATCH_THRESHOLD);
    expect(normaliseMatchThreshold({} as unknown)).toBe(DEFAULT_MATCH_THRESHOLD);
    expect(normaliseMatchThreshold(Number.NaN)).toBe(DEFAULT_MATCH_THRESHOLD);
    expect(normaliseMatchThreshold(Number.POSITIVE_INFINITY)).toBe(DEFAULT_MATCH_THRESHOLD);
  });

  it('clamps negative values to 0', () => {
    expect(normaliseMatchThreshold(-0.5)).toBe(0);
    expect(normaliseMatchThreshold(-100)).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    expect(normaliseMatchThreshold(1.5)).toBe(1);
    expect(normaliseMatchThreshold(100)).toBe(1);
  });

  it('passes values in [0, 1] through unchanged', () => {
    expect(normaliseMatchThreshold(0)).toBe(0);
    expect(normaliseMatchThreshold(1)).toBe(1);
    expect(normaliseMatchThreshold(0.5)).toBe(0.5);
    expect(normaliseMatchThreshold(0.92)).toBe(0.92);
  });
});

describe('buildListVersionAuditFields', () => {
  it('produces the audit-chain body fragment expected by writeAuditChainEntry', () => {
    const capture = {
      versions: { un_consolidated: { entityCount: 1009, fetchedAt: '2026-05-19T03:00:00.000Z' } },
      capturedAt: '2026-05-20T00:00:00.000Z',
      storeUnavailable: false,
    };
    const fields = buildListVersionAuditFields(capture, 0.9);
    expect(fields).toEqual({
      listVersions: { un_consolidated: { entityCount: 1009, fetchedAt: '2026-05-19T03:00:00.000Z' } },
      listVersionsCapturedAt: '2026-05-20T00:00:00.000Z',
      listVersionsStoreUnavailable: false,
      matchThreshold: 0.9,
    });
  });

  it('records storeUnavailable: true when the capture failed wholesale', () => {
    const capture = { versions: {}, capturedAt: '2026-05-20T00:00:00.000Z', storeUnavailable: true };
    const fields = buildListVersionAuditFields(capture, 0.92);
    expect(fields.listVersionsStoreUnavailable).toBe(true);
    expect(fields.listVersions).toEqual({});
    expect(fields.matchThreshold).toBe(0.92);
  });

  it('applies threshold normalisation through the wrapper', () => {
    const capture = { versions: {}, capturedAt: '2026-05-20T00:00:00.000Z', storeUnavailable: false };
    expect(buildListVersionAuditFields(capture, 'not-a-number').matchThreshold).toBe(DEFAULT_MATCH_THRESHOLD);
    expect(buildListVersionAuditFields(capture, -1).matchThreshold).toBe(0);
    expect(buildListVersionAuditFields(capture, 99).matchThreshold).toBe(1);
  });
});
