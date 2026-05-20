import { describe, expect, it, vi, beforeEach } from 'vitest';
import { euFsfAdapter } from '../eu-fsf.js';

vi.mock('../../fetch-util.js', () => ({
  fetchText: vi.fn(),
  sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 8)}`),
}));

import * as fetchUtil from '../../fetch-util.js';
const mockFetchText = vi.mocked(fetchUtil.fetchText);

// ── XML fixture builders ──────────────────────────────────────────────────────

function makeEntry({
  logicalId = 'EU-001',
  subjectCode = 'person',
  wholeName = 'John Doe',
  aliases = [] as string[],
  programs = ['UKRAINE REGULATION'],
  addresses = [] as string[],
  citizenships = [] as string[],
} = {}): string {
  const aliasNodes = aliases
    .map((a) => `<nameAlias wholeName="${a}" />`)
    .join('');
  const programNodes = programs
    .map((p) => `<regulation publicationTitle="${p}" />`)
    .join('');
  const addressNodes = addresses
    .map((a) => `<address street="${a}" />`)
    .join('');
  const citizenshipNodes = citizenships
    .map((c) => `<citizenship countryDescription="${c}" />`)
    .join('');
  return `
    <sanctionEntity logicalId="${logicalId}">
      <subjectType code="${subjectCode}" />
      <nameAlias wholeName="${wholeName}" />
      ${aliasNodes}
      ${programNodes}
      ${addressNodes}
      ${citizenshipNodes}
    </sanctionEntity>`;
}

function makeXml(entries: string[]): string {
  return `<?xml version="1.0"?><export>${entries.join('')}</export>`;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('euFsfAdapter — metadata', () => {
  it('has the expected id and displayName', () => {
    expect(euFsfAdapter.id).toBe('eu_fsf');
    expect(euFsfAdapter.displayName).toBe('EU Financial Sanctions Files');
  });
});

describe('euFsfAdapter.fetch — successful parse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses a single person sanctionEntity', async () => {
    const xml = makeXml([makeEntry({ logicalId: 'EU-001', subjectCode: 'person', wholeName: 'Alice Smith' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.name).toBe('Alice Smith');
    expect(ent.type).toBe('individual');
    expect(ent.id).toBe('eu_fsf:EU-001');
    expect(ent.source).toBe('eu_fsf');
  });

  it('maps enterprise subjectCode to entity type', async () => {
    const xml = makeXml([makeEntry({ subjectCode: 'enterprise', wholeName: 'Bad Corp' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities[0]!.type).toBe('entity');
  });

  it('maps unknown subjectCode to unknown type', async () => {
    const xml = makeXml([makeEntry({ subjectCode: 'ship', wholeName: 'Bad Ship' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities[0]!.type).toBe('unknown');
  });

  it('collects aliases from subsequent nameAlias nodes', async () => {
    const xml = makeXml([
      makeEntry({
        wholeName: 'John Doe',
        aliases: ['J. Doe', 'Johnny D'],
      }),
    ]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities[0]!.aliases).toContain('J. Doe');
    expect(result.entities[0]!.aliases).toContain('Johnny D');
  });

  it('uses euReferenceNumber attr as logicalId fallback', async () => {
    const xml = makeXml([`
      <sanctionEntity euReferenceNumber="REF-999">
        <subjectType code="person" />
        <nameAlias wholeName="Test Person" />
      </sanctionEntity>
    `]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities[0]!.id).toBe('eu_fsf:REF-999');
  });

  it('falls back to id attr when logicalId and euReferenceNumber missing', async () => {
    const xml = makeXml([`
      <sanctionEntity id="FALLBACK-42">
        <subjectType code="person" />
        <nameAlias wholeName="Fallback Person" />
      </sanctionEntity>
    `]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities[0]!.id).toBe('eu_fsf:FALLBACK-42');
  });

  it('uses name as final id fallback when no attrs present', async () => {
    const xml = makeXml([`
      <sanctionEntity>
        <subjectType code="person" />
        <nameAlias wholeName="No ID Person" />
      </sanctionEntity>
    `]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities[0]!.id).toBe('eu_fsf:No ID Person');
  });

  it('creates one listing per program', async () => {
    const xml = makeXml([
      makeEntry({ programs: ['UKRAINE', 'RUSSIA', 'IRAN'] }),
    ]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities[0]!.listings).toHaveLength(3);
  });

  it('creates empty listings when no programs', async () => {
    const xml = makeXml([makeEntry({ programs: [] })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities[0]!.listings).toHaveLength(0);
  });

  it('sets nationalities from citizenship nodes', async () => {
    const xml = makeXml([makeEntry({ citizenships: ['Germany', 'France'] })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities[0]!.nationalities).toEqual(['Germany', 'France']);
  });

  it('handles address nodes with multiple parts', async () => {
    const xml = makeXml([`
      <sanctionEntity logicalId="EU-ADDR">
        <subjectType code="person" />
        <nameAlias wholeName="Addr Person" />
        <address street="123 Main" city="Berlin" zipCode="10115" countryDescription="Germany" />
        <regulation publicationTitle="GERMANY" />
      </sanctionEntity>
    `]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities[0]!.addresses[0]).toContain('123 Main');
    expect(result.entities[0]!.addresses[0]).toContain('Berlin');
  });

  it('skips entries with no nameAlias nodes', async () => {
    const xml = makeXml([`
      <sanctionEntity logicalId="NO-NAME">
        <subjectType code="person" />
        <regulation publicationTitle="PROG" />
      </sanctionEntity>
    `, makeEntry({ logicalId: 'EU-OK', wholeName: 'Valid Person' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.id).toBe('eu_fsf:EU-OK');
  });

  it('skips entries where name resolves to empty string', async () => {
    const xml = makeXml([`
      <sanctionEntity logicalId="EMPTY-NAME">
        <subjectType code="person" />
        <nameAlias wholeName="" />
        <regulation publicationTitle="PROG" />
      </sanctionEntity>
    `, makeEntry({ logicalId: 'EU-GOOD', wholeName: 'Good Person' })]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities).toHaveLength(1);
  });

  it('returns rawChecksum', async () => {
    const xml = makeXml([makeEntry()]);
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.rawChecksum).toBeTruthy();
  });
});

describe('euFsfAdapter.fetch — v2 schema fallback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('falls back to <subject> nodes when no <sanctionEntity> found', async () => {
    const xml = `<?xml version="1.0"?><export>
      <subject logicalId="SUB-001">
        <subjectType code="person" />
        <nameAlias wholeName="Subject Person" />
        <regulation publicationTitle="TEST" />
      </subject>
    </export>`;
    mockFetchText.mockResolvedValue(xml);
    const result = await euFsfAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('Subject Person');
  });
});

describe('euFsfAdapter.fetch — error branches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when 0 entities parsed (no sanctionEntity or subject nodes)', async () => {
    const xml = `<?xml version="1.0"?><export><someOtherTag /></export>`;
    mockFetchText.mockResolvedValue(xml);
    await expect(euFsfAdapter.fetch()).rejects.toThrow('[eu_fsf]');
  });

  it('propagates fetchText errors', async () => {
    mockFetchText.mockRejectedValue(new Error('Timeout'));
    await expect(euFsfAdapter.fetch()).rejects.toThrow('Timeout');
  });
});
