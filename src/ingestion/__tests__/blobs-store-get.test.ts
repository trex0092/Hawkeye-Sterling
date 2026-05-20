// Hawkeye Sterling — getBlobsStore() coverage tests.
// Tests the Netlify Blobs path (lines 97-168) by mocking @netlify/blobs
// and the in-memory fallback path.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Suppress console noise from tests
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

const BASE_REPORT = {
  listId: 'test-list',
  sourceUrl: 'https://example.test/list',
  recordCount: 1,
  checksum: 'abc',
  fetchedAt: Date.now(),
  durationMs: 10,
  errors: [] as string[],
};

const SAMPLE_ENTITY = {
  id: 'e-1',
  name: 'Test Entity',
  aliases: [],
  type: 'individual' as const,
  nationalities: ['AE'],
  jurisdictions: [],
  listings: [{ source: 'test', reference: 'e-1' }],
  source: 'test',
};

describe('getBlobsStore — falls back to inMemoryStore when @netlify/blobs is unavailable', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@netlify/blobs', () => { throw new Error('module not found'); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a working store even when blobs module is absent', async () => {
    const { getBlobsStore } = await import('../blobs-store.js');
    const store = await getBlobsStore();
    expect(store).toBeDefined();
    expect(typeof store.putDataset).toBe('function');
    expect(typeof store.getLatest).toBe('function');
    expect(typeof store.getReport).toBe('function');
  });

  it('can write and read from the fallback in-memory store', async () => {
    const { getBlobsStore } = await import('../blobs-store.js');
    const store = await getBlobsStore();
    const listId = `test-${Math.random()}`;
    await store.putDataset(listId, [SAMPLE_ENTITY], { ...BASE_REPORT, listId });
    const latest = await store.getLatest(listId);
    expect(latest?.entities).toHaveLength(1);
    expect(latest?.entities[0]!.id).toBe('e-1');
  });
});

describe('getBlobsStore — with mocked @netlify/blobs module', () => {
  let mockGetStore: ReturnType<typeof vi.fn>;
  let mockDataStore: { get: ReturnType<typeof vi.fn>; setJSON: ReturnType<typeof vi.fn> };
  let mockReportStore: { get: ReturnType<typeof vi.fn>; setJSON: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetModules();

    mockDataStore = {
      get: vi.fn().mockResolvedValue(null),
      setJSON: vi.fn().mockResolvedValue(undefined),
    };
    mockReportStore = {
      get: vi.fn().mockResolvedValue(null),
      setJSON: vi.fn().mockResolvedValue(undefined),
    };

    let callCount = 0;
    mockGetStore = vi.fn().mockImplementation(() => {
      callCount++;
      // First call is data store, second is reports store
      return callCount === 1 ? mockDataStore : mockReportStore;
    });

    vi.doMock('@netlify/blobs', () => ({ getStore: mockGetStore }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates data and report stores with correct names', async () => {
    const { getBlobsStore } = await import('../blobs-store.js');
    await getBlobsStore();
    expect(mockGetStore).toHaveBeenCalledTimes(2);
    expect(mockGetStore).toHaveBeenCalledWith(expect.objectContaining({ name: 'hawkeye-lists' }));
    expect(mockGetStore).toHaveBeenCalledWith(expect.objectContaining({ name: 'hawkeye-list-reports' }));
  });

  it('passes explicit credentials when NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN are set', async () => {
    process.env['NETLIFY_SITE_ID'] = 'site-abc';
    process.env['NETLIFY_BLOBS_TOKEN'] = 'token-xyz';

    try {
      const { getBlobsStore } = await import('../blobs-store.js');
      await getBlobsStore();
      expect(mockGetStore).toHaveBeenCalledWith(expect.objectContaining({
        siteID: 'site-abc',
        token: 'token-xyz',
      }));
    } finally {
      delete process.env['NETLIFY_SITE_ID'];
      delete process.env['NETLIFY_BLOBS_TOKEN'];
    }
  });

  it('uses SITE_ID as fallback when NETLIFY_SITE_ID is absent', async () => {
    delete process.env['NETLIFY_SITE_ID'];
    process.env['SITE_ID'] = 'fallback-site';
    process.env['NETLIFY_API_TOKEN'] = 'api-token';

    try {
      const { getBlobsStore } = await import('../blobs-store.js');
      await getBlobsStore();
      expect(mockGetStore).toHaveBeenCalledWith(expect.objectContaining({
        siteID: 'fallback-site',
        token: 'api-token',
      }));
    } finally {
      delete process.env['SITE_ID'];
      delete process.env['NETLIFY_API_TOKEN'];
    }
  });

  it('putDataset calls setJSON on both data and report stores', async () => {
    const { getBlobsStore } = await import('../blobs-store.js');
    const store = await getBlobsStore();
    const listId = 'ofac-sdn';
    await store.putDataset(listId, [SAMPLE_ENTITY], { ...BASE_REPORT, listId });
    expect(mockDataStore.setJSON).toHaveBeenCalledWith(
      `${listId}/latest.json`,
      expect.objectContaining({ entities: [SAMPLE_ENTITY] }),
    );
    expect(mockReportStore.setJSON).toHaveBeenCalledWith(
      `${listId}/latest.json`,
      expect.objectContaining({ entities: [SAMPLE_ENTITY] }),
    );
  });

  it('getLatest returns data from the data store', async () => {
    const payload = { entities: [SAMPLE_ENTITY], report: { ...BASE_REPORT, listId: 'test' } };
    mockDataStore.get.mockResolvedValue(payload);

    const { getBlobsStore } = await import('../blobs-store.js');
    const store = await getBlobsStore();
    const result = await store.getLatest('test');
    expect(result).toEqual(payload);
  });

  it('getReport returns data from the report store', async () => {
    mockReportStore.get.mockResolvedValue({ ...BASE_REPORT, listId: 'test' });

    const { getBlobsStore } = await import('../blobs-store.js');
    const store = await getBlobsStore();
    const result = await store.getReport('test');
    expect(result?.listId).toBe('test');
  });

  it('returns cached store on second call (no duplicate getStore calls)', async () => {
    const { getBlobsStore } = await import('../blobs-store.js');
    await getBlobsStore();
    await getBlobsStore();
    // getStore called exactly twice (once for data, once for reports) — not 4 times
    expect(mockGetStore).toHaveBeenCalledTimes(2);
  });

  it('putDataset refuses empty overwrite when prior data store has entities', async () => {
    // First get returns prior healthy data
    mockDataStore.get.mockResolvedValueOnce({ entities: [SAMPLE_ENTITY] });

    const { getBlobsStore, EmptyOverwriteRefusedError } = await import('../blobs-store.js');
    const store = await getBlobsStore();
    await expect(
      store.putDataset('ofac-sdn', [], { ...BASE_REPORT, listId: 'ofac-sdn' }),
    ).rejects.toBeInstanceOf(EmptyOverwriteRefusedError);
  });

  it('putDataset still refuses even when rejected report write fails', async () => {
    mockDataStore.get.mockResolvedValueOnce({ entities: [SAMPLE_ENTITY] });
    mockReportStore.setJSON.mockRejectedValueOnce(new Error('blobs write error'));

    const { getBlobsStore, EmptyOverwriteRefusedError } = await import('../blobs-store.js');
    const store = await getBlobsStore();
    await expect(
      store.putDataset('ofac-sdn', [], { ...BASE_REPORT, listId: 'ofac-sdn' }),
    ).rejects.toBeInstanceOf(EmptyOverwriteRefusedError);
  });

  it('putDataset allows empty write when no prior snapshot exists', async () => {
    mockDataStore.get.mockResolvedValue(null);

    const { getBlobsStore } = await import('../blobs-store.js');
    const store = await getBlobsStore();
    // Should not throw
    await expect(
      store.putDataset('ofac-sdn', [], { ...BASE_REPORT, listId: 'ofac-sdn' }),
    ).resolves.toBeUndefined();
  });

  it('putDataset allows empty overwrite with explicit allowEmpty=true', async () => {
    mockDataStore.get.mockResolvedValueOnce({ entities: [SAMPLE_ENTITY] });

    const { getBlobsStore } = await import('../blobs-store.js');
    const store = await getBlobsStore();
    await expect(
      store.putDataset('ofac-sdn', [], { ...BASE_REPORT, listId: 'ofac-sdn' }, { allowEmpty: true }),
    ).resolves.toBeUndefined();
  });
});
