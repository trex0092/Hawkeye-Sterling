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
  if (url === undefined) delete process.env['FEED_WORLDBANK_DEBARRED'];
  else process.env['FEED_WORLDBANK_DEBARRED'] = url;
  const mod = await import('../worldbank-debarred.js');
  const fetchUtil = await import('../../fetch-util.js');
  return { adapter: mod.worldBankDebarredAdapter, mockFetchText: vi.mocked(fetchUtil.fetchText) };
}

describe('worldBankDebarredAdapter — metadata', () => {
  afterEach(() => { delete process.env['FEED_WORLDBANK_DEBARRED']; vi.resetModules(); });

  it('has expected id and displayName', async () => {
    const { adapter } = await getAdapter();
    expect(adapter.id).toBe('worldbank_debarred');
    expect(adapter.displayName).toContain('World Bank');
  });

  it('is always enabled (static seed guarantees MDB coverage)', async () => {
    const { adapter } = await getAdapter();
    expect(adapter.isEnabled!()).toBe(true);
  });
});

describe('worldBankDebarredAdapter.fetch — static seed', () => {
  afterEach(() => { delete process.env['FEED_WORLDBANK_DEBARRED']; vi.resetModules(); });

  it('returns curated debarment seed with worldbank_debarred listings', async () => {
    const { adapter } = await getAdapter();
    const result = await adapter.fetch();
    expect(result.entities.length).toBeGreaterThan(0);
    for (const ent of result.entities) {
      expect(ent.source).toBe('worldbank_debarred');
      expect(ent.listings[0]!.source).toBe('worldbank_debarred');
    }
    expect(result.sourceVersion).toMatch(/static/);
  });
});

describe('worldBankDebarredAdapter.fetch — live feed', () => {
  afterEach(() => { delete process.env['FEED_WORLDBANK_DEBARRED']; vi.resetModules(); });

  it('parses a JSON export', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/wb.json');
    mockFetchText.mockResolvedValue(JSON.stringify([
      { firm_name: 'Bad Firm Ltd', country_name: 'NG', grounds: 'FRAUD' },
      { firm_name: 'Worse Corp', country_name: 'IN', grounds: 'CORRUPTION' },
    ]));
    const result = await adapter.fetch();
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]!.name).toBe('Bad Firm Ltd');
    expect(result.entities[0]!.listings[0]!.program).toBe('FRAUD');
    expect(result.sourceVersion).toMatch(/live/);
  });

  it('falls back to seed when live fetch throws', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/wb.json');
    mockFetchText.mockRejectedValue(new Error('Connection error'));
    const result = await adapter.fetch();
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.sourceVersion).toMatch(/static/);
  });
});
