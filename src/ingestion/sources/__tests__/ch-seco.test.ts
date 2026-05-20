import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../fetch-util.js', () => ({
  fetchText: vi.fn(),
  sha256Hex: vi.fn(async (_s: string) => 'aabbccdd'),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTarget({
  ssid = 'T-001',
  wholeName = 'John Doe',
  aliases = [] as string[],
  isPerson = false,
  dob = '',
  countries = [] as string[],
  passports = [] as string[],
  idNumbers = [] as string[],
  addresses = [] as string[],
  programs = [] as string[],
} = {}): string {
  const nameBlocks = [wholeName, ...aliases]
    .map((n) => `<name><whole-name>${n}</whole-name></name>`)
    .join('');
  const countryNodes = countries.map((c) => `<country>${c}</country>`).join('');
  const passportNodes = passports.map((p) => `<passport-number>${p}</passport-number>`).join('');
  const idNodes = idNumbers.map((id) => `<identification-number>${id}</identification-number>`).join('');
  const addrNodes = addresses.map((a) => `<address-line>${a}</address-line>`).join('');
  const programNodes = programs.map((p) => `<sanctions-program-set>${p}</sanctions-program-set>`).join('');
  const personMarker = isPerson ? '<individual>true</individual>' : '';
  const dobNode = dob ? `<date-of-birth>${dob}</date-of-birth>` : '';
  return `
    <target ssid="${ssid}">
      ${programNodes}
      ${nameBlocks}
      ${personMarker}
      ${dobNode}
      ${countryNodes}
      ${passportNodes}
      ${idNodes}
      ${addrNodes}
    </target>`;
}

function makeXml(targets: string[]): string {
  return `<?xml version="1.0"?><sanctions>${targets.join('')}</sanctions>`;
}

async function getAdapter(url: string) {
  // Reset module registry so the module re-evaluates FEED_CH_SECO
  vi.resetModules();
  // Re-install the mock after reset
  vi.doMock('../../fetch-util.js', () => ({
    fetchText: vi.fn(),
    sha256Hex: vi.fn(async (_s: string) => 'aabbccdd'),
  }));
  process.env['FEED_CH_SECO'] = url;
  const mod = await import('../ch-seco.js');
  const fetchUtil = await import('../../fetch-util.js');
  return { adapter: mod.chSecoAdapter, mockFetchText: vi.mocked(fetchUtil.fetchText) };
}

async function getAdapterNoUrl() {
  vi.resetModules();
  vi.doMock('../../fetch-util.js', () => ({
    fetchText: vi.fn(),
    sha256Hex: vi.fn(async (_s: string) => 'aabbccdd'),
  }));
  delete process.env['FEED_CH_SECO'];
  const mod = await import('../ch-seco.js');
  const fetchUtil = await import('../../fetch-util.js');
  return { adapter: mod.chSecoAdapter, mockFetchText: vi.mocked(fetchUtil.fetchText) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('chSecoAdapter — metadata', () => {
  afterEach(() => {
    delete process.env['FEED_CH_SECO'];
    vi.resetModules();
  });

  it('has expected id and displayName', async () => {
    const { adapter } = await getAdapter('https://example.com/seco.xml');
    expect(adapter.id).toBe('ch_seco');
    expect(adapter.displayName).toBe('Switzerland SECO Sanctions');
  });

  it('isEnabled returns false when FEED_CH_SECO is not set', async () => {
    const { adapter } = await getAdapterNoUrl();
    expect(adapter.isEnabled!()).toBe(false);
  });

  it('isEnabled returns true when FEED_CH_SECO is set', async () => {
    const { adapter } = await getAdapter('https://example.com/seco.xml');
    expect(adapter.isEnabled!()).toBe(true);
  });
});

describe('chSecoAdapter.fetch — successful parse', () => {
  afterEach(() => {
    delete process.env['FEED_CH_SECO'];
    vi.resetModules();
  });

  it('parses a single entity target', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-001', wholeName: 'Evil Corp', isPerson: false })]));
    const result = await adapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.name).toBe('Evil Corp');
    expect(ent.type).toBe('entity');
    expect(ent.source).toBe('ch_seco');
    expect(ent.id).toBe('ch_seco:T-001');
  });

  it('parses a person target when <individual> marker is present', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-002', wholeName: 'John Doe', isPerson: true })]));
    const result = await adapter.fetch();
    expect(result.entities[0]!.type).toBe('individual');
  });

  it('parses a person target when date-of-birth is present', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-003', wholeName: 'Jane Roe', dob: '1970-01-01' })]));
    const result = await adapter.fetch();
    expect(result.entities[0]!.type).toBe('individual');
    expect(result.entities[0]!.dateOfBirth).toBe('1970-01-01');
  });

  it('omits dateOfBirth when dob is absent', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-003B', wholeName: 'No Dob', dob: '' })]));
    const result = await adapter.fetch();
    expect(result.entities[0]!.dateOfBirth).toBeUndefined();
  });

  it('collects aliases from secondary name blocks', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-004', wholeName: 'Primary Name', aliases: ['Alias One', 'Alias Two'] })]));
    const result = await adapter.fetch();
    expect(result.entities[0]!.aliases).toContain('Alias One');
    expect(result.entities[0]!.aliases).toContain('Alias Two');
  });

  it('collects nationalities from <country> nodes', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-005', wholeName: 'Someone', countries: ['RU', 'IR'] })]));
    const result = await adapter.fetch();
    expect(result.entities[0]!.nationalities).toContain('RU');
    expect(result.entities[0]!.nationalities).toContain('IR');
  });

  it('sets passport identifier from first passport-number node', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-006', wholeName: 'Passport Person', passports: ['P12345', 'P99999'] })]));
    const result = await adapter.fetch();
    expect(result.entities[0]!.identifiers['passport']).toBe('P12345');
  });

  it('sets national_id identifier from first identification-number node', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-007', wholeName: 'ID Person', idNumbers: ['NID-001'] })]));
    const result = await adapter.fetch();
    expect(result.entities[0]!.identifiers['national_id']).toBe('NID-001');
  });

  it('skips passport/id identifier when nodes are absent', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-007B', wholeName: 'No IDs' })]));
    const result = await adapter.fetch();
    expect(result.entities[0]!.identifiers).toEqual({});
  });

  it('collects addresses from address-line nodes', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-008', wholeName: 'Addr Person', addresses: ['123 Main St', 'Moscow'] })]));
    const result = await adapter.fetch();
    expect(result.entities[0]!.addresses).toContain('123 Main St');
  });

  it('sets program from sanctions-program-set', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-009', wholeName: 'Prog Person', programs: ['UKRAINE-2022'] })]));
    const result = await adapter.fetch();
    expect(result.entities[0]!.listings[0]!.program).toBe('UKRAINE-2022');
  });

  it('uses primaryName as id fallback when ssid is absent from target block', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    const xml = `<?xml version="1.0"?><sanctions>
      <target>
        <name><whole-name>No SSID Person</whole-name></name>
        <sanctions-program-set>PROG</sanctions-program-set>
      </target>
    </sanctions>`;
    mockFetchText.mockResolvedValue(xml);
    const result = await adapter.fetch();
    expect(result.entities[0]!.id).toBe('ch_seco:No SSID Person');
  });

  it('also parses sanction-target tag variant', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    const xml = `<?xml version="1.0"?><sanctions>
      <sanction-target ssid="ST-001">
        <name><whole-name>Alt Tag Person</whole-name></name>
        <sanctions-program-set>PROG</sanctions-program-set>
      </sanction-target>
    </sanctions>`;
    mockFetchText.mockResolvedValue(xml);
    const result = await adapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('Alt Tag Person');
  });

  it('builds name from first-name + family-name when whole-name absent', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    const xml = `<?xml version="1.0"?><sanctions>
      <target ssid="N-001">
        <name><first-name>John</first-name><family-name>Doe</family-name></name>
        <sanctions-program-set>PROG</sanctions-program-set>
      </target>
    </sanctions>`;
    mockFetchText.mockResolvedValue(xml);
    const result = await adapter.fetch();
    expect(result.entities[0]!.name).toBe('John Doe');
  });

  it('builds name using last-name variant', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    const xml = `<?xml version="1.0"?><sanctions>
      <target ssid="N-002">
        <name><first-name>Jane</first-name><last-name>Roe</last-name></name>
        <sanctions-program-set>PROG</sanctions-program-set>
      </target>
    </sanctions>`;
    mockFetchText.mockResolvedValue(xml);
    const result = await adapter.fetch();
    expect(result.entities[0]!.name).toBe('Jane Roe');
  });

  it('skips targets with no name', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    const xml = `<?xml version="1.0"?><sanctions>
      <target ssid="N-EMPTY">
        <sanctions-program-set>PROG</sanctions-program-set>
      </target>
      <target ssid="N-VALID">
        <name><whole-name>Valid Person</whole-name></name>
        <sanctions-program-set>PROG</sanctions-program-set>
      </target>
    </sanctions>`;
    mockFetchText.mockResolvedValue(xml);
    const result = await adapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('Valid Person');
  });

  it('returns rawChecksum', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue(makeXml([makeTarget({ ssid: 'T-001', wholeName: 'Test Person' })]));
    const result = await adapter.fetch();
    expect(result.rawChecksum).toBeTruthy();
  });

  it('uses program from general-info fallback when sanctions-program-set absent', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    const xml = `<?xml version="1.0"?><sanctions>
      <target ssid="GI-001">
        <name><whole-name>General Info Person</whole-name></name>
        <general-info>sanctions-program: GENERAL-PROG sanctions info here</general-info>
      </target>
    </sanctions>`;
    mockFetchText.mockResolvedValue(xml);
    const result = await adapter.fetch();
    // programFallback matches the regex from general-info
    expect(result.entities[0]!.listings[0]!.program).toContain('GENERAL-PROG');
  });
});

describe('chSecoAdapter.fetch — error branches', () => {
  afterEach(() => {
    delete process.env['FEED_CH_SECO'];
    vi.resetModules();
  });

  it('throws when FEED_CH_SECO is not set (SOURCE_URL empty)', async () => {
    const { adapter } = await getAdapterNoUrl();
    await expect(adapter.fetch()).rejects.toThrow('[ch_seco] FEED_CH_SECO is not set');
  });

  it('throws when response looks like XHTML portal page', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue('<?xml version="1.0"?><!DOCTYPE html><html><body>Portal</body></html>');
    await expect(adapter.fetch()).rejects.toThrow('ch_seco');
  });

  it('throws when response has no <sanctions>/<target> root', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue('<?xml version="1.0"?><some-other-root/>');
    await expect(adapter.fetch()).rejects.toThrow('ch_seco');
  });

  it('throws when 0 entities parsed from valid XML structure', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockResolvedValue('<?xml version="1.0"?><sanctions><target ssid="T-001"></target></sanctions>');
    await expect(adapter.fetch()).rejects.toThrow('[ch_seco]');
  });

  it('propagates fetchText errors', async () => {
    const { adapter, mockFetchText } = await getAdapter('https://example.com/seco.xml');
    mockFetchText.mockRejectedValue(new Error('Connection error'));
    await expect(adapter.fetch()).rejects.toThrow('Connection error');
  });
});
