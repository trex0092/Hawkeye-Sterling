import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('../../fetch-util.js', () => ({
  fetchText: vi.fn(),
  sha256Hex: vi.fn(async (_s: string) => 'aabbccdd'),
}));

async function getAdapter(url?: string) {
  vi.resetModules();
  vi.doMock('../../fetch-util.js', () => ({
    fetchText: vi.fn(),
    sha256Hex: vi.fn(async (_s: string) => 'aabbccdd'),
  }));
  if (url === undefined) delete process.env['FEED_TR_MASAK'];
  else process.env['FEED_TR_MASAK'] = url;
  const mod = await import('../tr-masak.js');
  const fetchUtil = await import('../../fetch-util.js');
  return { adapter: mod.trMasakAdapter, mockFetchText: vi.mocked(fetchUtil.fetchText) };
}

describe('trMasakAdapter — metadata', () => {
  afterEach(() => {
    delete process.env['FEED_TR_MASAK'];
    vi.resetModules();
  });

  it('has expected id and displayName', async () => {
    const { adapter } = await getAdapter();
    expect(adapter.id).toBe('tr_masak');
    expect(adapter.displayName).toContain('MASAK');
  });

  it('is always enabled (static seed guarantees coverage)', async () => {
    const { adapter } = await getAdapter();
    expect(adapter.isEnabled!()).toBe(true);
  });
});

describe('trMasakAdapter.fetch — static seed fallback', () => {
  afterEach(() => {
    delete process.env['FEED_TR_MASAK'];
    vi.resetModules();
  });

  it('returns the curated seed when no feed URL is set', async () => {
    const { adapter } = await getAdapter();
    const result = await adapter.fetch();
    expect(result.entities.length).toBeGreaterThan(0);
    // Every seed entity is a TR-jurisdiction tr_masak listing.
    for (const ent of result.entities) {
      expect(ent.source).toBe('tr_masak');
      expect(ent.jurisdictions).toContain('TR');
      expect(ent.listings[0]!.source).toBe('tr_masak');
    }
    expect(result.sourceVersion).toMatch(/static/);
  });

  it('seed includes well-known TR-designated organisations with aliases', async () => {
    const { adapter } = await getAdapter();
    const result = await adapter.fetch();
    const allAliases = result.entities.flatMap((e) => [e.name, ...e.aliases]);
    expect(allAliases).toContain('PKK');
    expect(allAliases).toContain('DHKP-C');
  });

  it('falls back to seed when live fetch throws', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/masak.csv');
    mockFetchText.mockRejectedValue(new Error('Connection error'));
    const result = await adapter.fetch();
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.sourceVersion).toMatch(/static/);
  });
});

describe('trMasakAdapter.fetch — live feed parse', () => {
  afterEach(() => {
    delete process.env['FEED_TR_MASAK'];
    vi.resetModules();
  });

  it('parses a CSV export from FEED_TR_MASAK', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/masak.csv');
    mockFetchText.mockResolvedValue(
      'name,aliases,type,program,reference\n' +
        'Test Org,"Alias A;Alias B",entity,LAW_6415_TERROR_FREEZE,REF-1\n' +
        'Test Person,,individual,LAW_7262_PROLIF,REF-2\n',
    );
    const result = await adapter.fetch();
    expect(result.entities).toHaveLength(2);
    const org = result.entities[0]!;
    expect(org.name).toBe('Test Org');
    expect(org.type).toBe('entity');
    expect(org.aliases).toContain('Alias A');
    expect(org.aliases).toContain('Alias B');
    expect(org.listings[0]!.source).toBe('tr_masak');
    expect(org.listings[0]!.program).toBe('LAW_6415_TERROR_FREEZE');
    const person = result.entities[1]!;
    expect(person.type).toBe('individual');
    expect(result.sourceVersion).toMatch(/live/);
  });

  it('skips rows with no name and falls back to seed when feed yields nothing', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/masak.csv');
    mockFetchText.mockResolvedValue('name,program\n,LAW_6415_TERROR_FREEZE\n');
    const result = await adapter.fetch();
    // No usable live rows → static seed.
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.sourceVersion).toMatch(/static/);
  });
});
