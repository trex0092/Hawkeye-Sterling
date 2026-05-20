import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ofacSdnAdapter } from '../ofac-sdn.js';

vi.mock('../../fetch-util.js', () => ({
  fetchText: vi.fn(),
  sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 8)}`),
}));

import * as fetchUtil from '../../fetch-util.js';
const mockFetchText = vi.mocked(fetchUtil.fetchText);

// ── XML fixture builders ──────────────────────────────────────────────────────

function makeSdnEntry({
  uid = '1234',
  sdnType = 'Individual',
  firstName = 'John',
  lastName = 'Doe',
  akas = [] as Array<{ firstName?: string; lastName?: string }>,
  programs = ['UKRAINE-EO13685'],
  addresses = [] as Array<{ address1?: string; city?: string; country?: string }>,
  nationalities = [] as string[],
  ids = [] as Array<{ idType: string; idNumber: string }>,
} = {}): string {
  const akaNodes = akas
    .map((a) => `<aka><firstName>${a.firstName ?? ''}</firstName><lastName>${a.lastName ?? ''}</lastName></aka>`)
    .join('');
  const programNodes = programs.map((p) => `<program>${p}</program>`).join('');
  const addrNodes = addresses
    .map((a) => `<address><address1>${a.address1 ?? ''}</address1><city>${a.city ?? ''}</city><country>${a.country ?? ''}</country></address>`)
    .join('');
  const natNodes = nationalities
    .map((n) => `<nationality><country>${n}</country></nationality>`)
    .join('');
  const idNodes = ids
    .map((id) => `<id><idType>${id.idType}</idType><idNumber>${id.idNumber}</idNumber></id>`)
    .join('');
  return `
    <sdnEntry>
      <uid>${uid}</uid>
      <sdnType>${sdnType}</sdnType>
      <firstName>${firstName}</firstName>
      <lastName>${lastName}</lastName>
      ${akaNodes}
      ${programNodes}
      ${addrNodes}
      ${natNodes}
      ${idNodes}
    </sdnEntry>`;
}

function makeXml(entries: string[]): string {
  return `<?xml version="1.0"?><sdnList>${entries.join('')}</sdnList>`;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ofacSdnAdapter — metadata', () => {
  it('has the expected id and displayName', () => {
    expect(ofacSdnAdapter.id).toBe('ofac_sdn');
    expect(ofacSdnAdapter.displayName).toBe('OFAC SDN');
  });
});

describe('ofacSdnAdapter.fetch — individual entries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses a single individual', async () => {
    const xml = makeXml([makeSdnEntry()]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.name).toBe('John Doe');
    expect(ent.type).toBe('individual');
    expect(ent.source).toBe('ofac_sdn');
    expect(ent.id).toBe('ofac_sdn:1234');
  });

  it('joins firstName + lastName for individual name', async () => {
    const xml = makeXml([makeSdnEntry({ firstName: 'Jane', lastName: 'Smith' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.name).toBe('Jane Smith');
  });

  it('handles individual with only lastName', async () => {
    const xml = makeXml([makeSdnEntry({ firstName: '', lastName: 'Mononym' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.name).toBe('Mononym');
  });

  it('collects aliases from aka nodes', async () => {
    const xml = makeXml([
      makeSdnEntry({ akas: [{ firstName: 'Johnny', lastName: 'D' }, { firstName: '', lastName: 'JD' }] }),
    ]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.aliases).toContain('Johnny D');
    expect(result.entities[0]!.aliases).toContain('JD');
  });
});

describe('ofacSdnAdapter.fetch — entity/vessel/aircraft types', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps entity sdnType to entity type (uses lastName as name)', async () => {
    const xml = makeXml([makeSdnEntry({ sdnType: 'Entity', firstName: '', lastName: 'Evil Corp' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.type).toBe('entity');
    expect(result.entities[0]!.name).toBe('Evil Corp');
  });

  it('maps vessel sdnType to vessel type', async () => {
    const xml = makeXml([makeSdnEntry({ sdnType: 'Vessel', firstName: '', lastName: 'MV Ship' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.type).toBe('vessel');
  });

  it('maps aircraft sdnType to aircraft type', async () => {
    const xml = makeXml([makeSdnEntry({ sdnType: 'Aircraft', firstName: '', lastName: 'PLANE-001' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.type).toBe('aircraft');
  });

  it('maps unknown sdnType to unknown', async () => {
    const xml = makeXml([makeSdnEntry({ sdnType: 'Submarine', firstName: '', lastName: 'SUB-001' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.type).toBe('unknown');
  });

  it('uses firstName as name for non-individual when lastName is empty', async () => {
    const xml = makeXml([makeSdnEntry({ sdnType: 'Entity', firstName: 'Only First', lastName: '' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.name).toBe('Only First');
  });
});

describe('ofacSdnAdapter.fetch — programs, addresses, nationalities, identifiers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates one listing per program', async () => {
    const xml = makeXml([makeSdnEntry({ programs: ['UKRAINE', 'RUSSIA', 'IRAN'] })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.listings).toHaveLength(3);
    expect(result.entities[0]!.listings.map((l) => l.program)).toContain('UKRAINE');
  });

  it('creates empty listings when no programs', async () => {
    const xml = makeXml([makeSdnEntry({ programs: [] })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.listings).toHaveLength(0);
  });

  it('collects addresses with multiple fields', async () => {
    const xml = makeXml([
      makeSdnEntry({
        addresses: [{ address1: '10 Main St', city: 'Moscow', country: 'Russia' }],
      }),
    ]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.addresses[0]).toContain('10 Main St');
    expect(result.entities[0]!.addresses[0]).toContain('Moscow');
    expect(result.entities[0]!.addresses[0]).toContain('Russia');
  });

  it('filters out empty address strings', async () => {
    const xml = makeXml([makeSdnEntry({ addresses: [{}] })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.addresses).toHaveLength(0);
  });

  it('collects nationalities from nationality nodes', async () => {
    const xml = makeXml([makeSdnEntry({ nationalities: ['Russia', 'Iran'] })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.nationalities).toEqual(['Russia', 'Iran']);
    expect(result.entities[0]!.jurisdictions).toEqual(['Russia', 'Iran']);
  });

  it('collects identifiers from id nodes', async () => {
    const xml = makeXml([
      makeSdnEntry({
        ids: [
          { idType: 'Passport', idNumber: 'P123456' },
          { idType: 'National ID', idNumber: 'NID-789' },
        ],
      }),
    ]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.identifiers['passport']).toBe('P123456');
    expect(result.entities[0]!.identifiers['national id']).toBe('NID-789');
  });

  it('skips id nodes where idType or idNumber is empty', async () => {
    const xml = makeXml([
      makeSdnEntry({ ids: [{ idType: '', idNumber: 'X' }, { idType: 'Passport', idNumber: '' }] }),
    ]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(Object.keys(result.entities[0]!.identifiers)).toHaveLength(0);
  });
});

describe('ofacSdnAdapter.fetch — edge cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips entries with empty name', async () => {
    const noNameEntry = makeSdnEntry({ firstName: '', lastName: '', sdnType: 'Individual' });
    const validEntry = makeSdnEntry({ uid: '9999', firstName: 'Valid', lastName: 'Person' });
    const xml = makeXml([noNameEntry, validEntry]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.id).toBe('ofac_sdn:9999');
  });

  it('uses name as id fallback when uid is empty', async () => {
    const xml = makeXml([makeSdnEntry({ uid: '' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.entities[0]!.id).toBe('ofac_sdn:John Doe');
  });

  it('returns rawChecksum', async () => {
    const xml = makeXml([makeSdnEntry()]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacSdnAdapter.fetch();
    expect(result.rawChecksum).toBeTruthy();
  });
});

describe('ofacSdnAdapter.fetch — error branches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when 0 entities parsed', async () => {
    const xml = `<?xml version="1.0"?><sdnList></sdnList>`;
    mockFetchText.mockResolvedValue(xml);
    await expect(ofacSdnAdapter.fetch()).rejects.toThrow('ofac_sdn');
  });

  it('propagates fetchText errors', async () => {
    mockFetchText.mockRejectedValue(new Error('HTTP 503'));
    await expect(ofacSdnAdapter.fetch()).rejects.toThrow('HTTP 503');
  });
});
