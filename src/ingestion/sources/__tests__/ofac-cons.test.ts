import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ofacConsAdapter } from '../ofac-cons.js';

vi.mock('../../fetch-util.js', () => ({
  fetchText: vi.fn(),
  sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 8)}`),
}));

import * as fetchUtil from '../../fetch-util.js';
const mockFetchText = vi.mocked(fetchUtil.fetchText);

// ── XML fixture builders ──────────────────────────────────────────────────────

function makeSdnEntry({
  uid = '5678',
  sdnType = 'Individual',
  firstName = 'Jane',
  lastName = 'Smith',
  akas = [] as Array<{ firstName?: string; lastName?: string }>,
  programs = ['IRAN'],
} = {}): string {
  const akaNodes = akas
    .map((a) => `<aka><firstName>${a.firstName ?? ''}</firstName><lastName>${a.lastName ?? ''}</lastName></aka>`)
    .join('');
  const programNodes = programs.map((p) => `<program>${p}</program>`).join('');
  return `
    <sdnEntry>
      <uid>${uid}</uid>
      <sdnType>${sdnType}</sdnType>
      <firstName>${firstName}</firstName>
      <lastName>${lastName}</lastName>
      ${akaNodes}
      ${programNodes}
    </sdnEntry>`;
}

function makeXml(entries: string[]): string {
  return `<?xml version="1.0"?><sdnList>${entries.join('')}</sdnList>`;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ofacConsAdapter — metadata', () => {
  it('has the expected id and displayName', () => {
    expect(ofacConsAdapter.id).toBe('ofac_cons');
    expect(ofacConsAdapter.displayName).toBe('OFAC Consolidated Non-SDN');
  });
});

describe('ofacConsAdapter.fetch — successful parse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses a single individual entry', async () => {
    const xml = makeXml([makeSdnEntry()]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.name).toBe('Jane Smith');
    expect(ent.type).toBe('individual');
    expect(ent.source).toBe('ofac_cons');
    expect(ent.id).toBe('ofac_cons:5678');
  });

  it('maps entity sdnType to entity type', async () => {
    const xml = makeXml([makeSdnEntry({ sdnType: 'Entity', firstName: '', lastName: 'Bad Corp' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities[0]!.type).toBe('entity');
    expect(result.entities[0]!.name).toBe('Bad Corp');
  });

  it('maps vessel sdnType to vessel type', async () => {
    const xml = makeXml([makeSdnEntry({ sdnType: 'Vessel', firstName: '', lastName: 'MV TEST' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities[0]!.type).toBe('vessel');
  });

  it('maps aircraft sdnType to aircraft type', async () => {
    const xml = makeXml([makeSdnEntry({ sdnType: 'Aircraft', firstName: '', lastName: 'AIR-1' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities[0]!.type).toBe('aircraft');
  });

  it('maps unknown sdnType to unknown', async () => {
    const xml = makeXml([makeSdnEntry({ sdnType: 'Cargo', firstName: '', lastName: 'CARGO-1' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities[0]!.type).toBe('unknown');
  });

  it('collects aliases from aka nodes', async () => {
    const xml = makeXml([makeSdnEntry({ akas: [{ firstName: 'J', lastName: 'S' }] })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities[0]!.aliases).toContain('J S');
  });

  it('creates one listing per program', async () => {
    const xml = makeXml([makeSdnEntry({ programs: ['IRAN', 'UKRAINE'] })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities[0]!.listings).toHaveLength(2);
  });

  it('creates empty listings array when no programs', async () => {
    const xml = makeXml([makeSdnEntry({ programs: [] })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities[0]!.listings).toHaveLength(0);
  });

  it('uses firstName as name fallback for non-individual', async () => {
    const xml = makeXml([makeSdnEntry({ sdnType: 'Entity', firstName: 'Only First', lastName: '' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities[0]!.name).toBe('Only First');
  });

  it('uses name as id fallback when uid is empty', async () => {
    const xml = makeXml([makeSdnEntry({ uid: '', firstName: 'Jane', lastName: 'Smith' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities[0]!.id).toBe('ofac_cons:Jane Smith');
  });

  it('skips entries with empty name', async () => {
    const noName = makeSdnEntry({ sdnType: 'Individual', firstName: '', lastName: '' });
    const valid = makeSdnEntry({ uid: '9', firstName: 'Valid', lastName: 'One' });
    const xml = makeXml([noName, valid]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.id).toBe('ofac_cons:9');
  });

  it('returns rawChecksum', async () => {
    const xml = makeXml([makeSdnEntry()]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.rawChecksum).toBeTruthy();
  });

  it('sets nationalities and jurisdictions to empty arrays', async () => {
    const xml = makeXml([makeSdnEntry()]);
    mockFetchText.mockResolvedValue(xml);
    const result = await ofacConsAdapter.fetch();
    expect(result.entities[0]!.nationalities).toEqual([]);
    expect(result.entities[0]!.jurisdictions).toEqual([]);
    expect(result.entities[0]!.addresses).toEqual([]);
  });
});

describe('ofacConsAdapter.fetch — error branches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when 0 entities parsed', async () => {
    const xml = `<?xml version="1.0"?><sdnList></sdnList>`;
    mockFetchText.mockResolvedValue(xml);
    await expect(ofacConsAdapter.fetch()).rejects.toThrow('ofac_cons');
  });

  it('propagates fetchText errors', async () => {
    mockFetchText.mockRejectedValue(new Error('HTTP 404'));
    await expect(ofacConsAdapter.fetch()).rejects.toThrow('HTTP 404');
  });
});
