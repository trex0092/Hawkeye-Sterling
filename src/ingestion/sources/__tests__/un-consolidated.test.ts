import { describe, expect, it, vi, beforeEach } from 'vitest';
import { unConsolidatedAdapter } from '../un-consolidated.js';

vi.mock('../../fetch-util.js', () => ({
  fetchText: vi.fn(),
  sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 8)}`),
}));

import * as fetchUtil from '../../fetch-util.js';
const mockFetchText = vi.mocked(fetchUtil.fetchText);

// ── XML fixture builders ──────────────────────────────────────────────────────

function makeIndividual({
  firstName = 'John',
  secondName = 'Smith',
  thirdName = '',
  ref = 'QDi.123',
  dataId = '',
  aliases = [] as string[],
  nationalities = [] as string[],
  dob = '',
  addresses = [] as string[],
  listType = 'QDe',
  listedOn = '2001-01-01',
  comments = '',
} = {}): string {
  const aliasNodes = aliases.map((a) => `<INDIVIDUAL_ALIAS><ALIAS_NAME>${a}</ALIAS_NAME></INDIVIDUAL_ALIAS>`).join('');
  const natNodes = nationalities.map((n) => `<NATIONALITY>${n}</NATIONALITY>`).join('');
  const addrNodes = addresses.map((a) => `<INDIVIDUAL_ADDRESS>${a}</INDIVIDUAL_ADDRESS>`).join('');
  return `
    <INDIVIDUAL>
      <FIRST_NAME>${firstName}</FIRST_NAME>
      ${secondName ? `<SECOND_NAME>${secondName}</SECOND_NAME>` : ''}
      ${thirdName ? `<THIRD_NAME>${thirdName}</THIRD_NAME>` : ''}
      ${ref ? `<REFERENCE_NUMBER>${ref}</REFERENCE_NUMBER>` : ''}
      ${dataId ? `<DATAID>${dataId}</DATAID>` : ''}
      ${dob ? `<DATE_OF_BIRTH>${dob}</DATE_OF_BIRTH>` : ''}
      ${aliasNodes}
      ${natNodes}
      ${addrNodes}
      <UN_LIST_TYPE>${listType}</UN_LIST_TYPE>
      <LISTED_ON>${listedOn}</LISTED_ON>
      ${comments ? `<COMMENTS1>${comments}</COMMENTS1>` : ''}
    </INDIVIDUAL>`;
}

function makeEntity({
  firstName = '',
  entityName = 'Bad Corp',
  ref = 'QEe.001',
  aliases = [] as string[],
  addresses = [] as string[],
  listType = 'QDe',
  listedOn = '2001-01-01',
  comments = '',
} = {}): string {
  const aliasNodes = aliases.map((a) => `<ENTITY_ALIAS><ALIAS_NAME>${a}</ALIAS_NAME></ENTITY_ALIAS>`).join('');
  const addrNodes = addresses.map((a) => `<ENTITY_ADDRESS>${a}</ENTITY_ADDRESS>`).join('');
  return `
    <ENTITY>
      ${firstName ? `<FIRST_NAME>${firstName}</FIRST_NAME>` : ''}
      ${entityName ? `<ENTITY_NAME>${entityName}</ENTITY_NAME>` : ''}
      ${ref ? `<REFERENCE_NUMBER>${ref}</REFERENCE_NUMBER>` : ''}
      ${aliasNodes}
      ${addrNodes}
      <UN_LIST_TYPE>${listType}</UN_LIST_TYPE>
      <LISTED_ON>${listedOn}</LISTED_ON>
      ${comments ? `<COMMENTS1>${comments}</COMMENTS1>` : ''}
    </ENTITY>`;
}

function makeXml(content: string): string {
  return `<?xml version="1.0"?><CONSOLIDATED_LIST>${content}</CONSOLIDATED_LIST>`;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('unConsolidatedAdapter — metadata', () => {
  it('has the expected id and displayName', () => {
    expect(unConsolidatedAdapter.id).toBe('un_consolidated');
    expect(unConsolidatedAdapter.displayName).toBe('UN Consolidated List');
  });
});

describe('unConsolidatedAdapter.fetch — individuals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses a single individual', async () => {
    const xml = makeXml(makeIndividual());
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.name).toBe('John Smith');
    expect(ent.type).toBe('individual');
    expect(ent.source).toBe('un_consolidated');
    expect(ent.id).toBe('un_consolidated:QDi.123');
  });

  it('joins SECOND_NAME and THIRD_NAME into name', async () => {
    const xml = makeXml(makeIndividual({ firstName: 'Osama', secondName: 'Bin', thirdName: 'Laden' }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.name).toBe('Osama Bin Laden');
  });

  it('uses DATAID as ref fallback when REFERENCE_NUMBER is absent', async () => {
    const xml = makeXml(makeIndividual({ ref: '', dataId: 'DATAID-999' }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.id).toBe('un_consolidated:DATAID-999');
  });

  it('falls back to name when both ref and dataId are absent', async () => {
    const xml = makeXml(makeIndividual({ ref: '', dataId: '', firstName: 'Solo', secondName: '', thirdName: '' }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.id).toBe('un_consolidated:Solo');
  });

  it('collects aliases from INDIVIDUAL_ALIAS nodes', async () => {
    const xml = makeXml(makeIndividual({ aliases: ['J. Smith', 'JS'] }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.aliases).toEqual(['J. Smith', 'JS']);
  });

  it('ignores INDIVIDUAL_ALIAS nodes with empty ALIAS_NAME', async () => {
    const xml = makeXml(`
      <INDIVIDUAL>
        <FIRST_NAME>John</FIRST_NAME>
        <REFERENCE_NUMBER>QDi.001</REFERENCE_NUMBER>
        <INDIVIDUAL_ALIAS><ALIAS_NAME></ALIAS_NAME></INDIVIDUAL_ALIAS>
        <UN_LIST_TYPE>QDe</UN_LIST_TYPE>
        <LISTED_ON>2001-01-01</LISTED_ON>
      </INDIVIDUAL>`);
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.aliases).toEqual([]);
  });

  it('collects nationalities from NATIONALITY nodes', async () => {
    const xml = makeXml(makeIndividual({ nationalities: ['Saudi Arabian', 'Afghan'] }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.nationalities).toEqual(['Saudi Arabian', 'Afghan']);
  });

  it('only includes non-empty nationalities', async () => {
    // NATIONALITY with empty text should not be included
    const xml = makeXml(`
      <INDIVIDUAL>
        <FIRST_NAME>John</FIRST_NAME>
        <REFERENCE_NUMBER>QDi.001</REFERENCE_NUMBER>
        <NATIONALITY></NATIONALITY>
        <NATIONALITY>Afghan</NATIONALITY>
        <UN_LIST_TYPE>QDe</UN_LIST_TYPE>
        <LISTED_ON>2001-01-01</LISTED_ON>
      </INDIVIDUAL>`);
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.nationalities).toEqual(['Afghan']);
  });

  it('sets dateOfBirth when DATE_OF_BIRTH is present', async () => {
    const xml = makeXml(makeIndividual({ dob: '1957-03-10' }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.dateOfBirth).toBe('1957-03-10');
  });

  it('omits dateOfBirth when DATE_OF_BIRTH is absent', async () => {
    const xml = makeXml(makeIndividual({ dob: '' }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.dateOfBirth).toBeUndefined();
  });

  it('collects addresses from INDIVIDUAL_ADDRESS nodes', async () => {
    const xml = makeXml(makeIndividual({ addresses: ['123 Main St', 'Kabul, Afghanistan'] }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.addresses).toContain('123 Main St');
    expect(result.entities[0]!.addresses).toContain('Kabul, Afghanistan');
  });

  it('sets listing fields', async () => {
    const xml = makeXml(makeIndividual({ listType: 'QDe', listedOn: '2001-09-25', comments: 'A key figure' }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    const listing = result.entities[0]!.listings[0]!;
    expect(listing.source).toBe('un_consolidated');
    expect(listing.program).toBe('QDe');
    expect(listing.designatedAt).toBe('2001-09-25');
    expect(listing.reason).toBe('A key figure');
  });

  it('skips individuals with no name (all name parts empty)', async () => {
    const xml = makeXml(`
      <INDIVIDUAL>
        <FIRST_NAME></FIRST_NAME>
        <REFERENCE_NUMBER>QDi.000</REFERENCE_NUMBER>
        <UN_LIST_TYPE>QDe</UN_LIST_TYPE>
        <LISTED_ON>2001-01-01</LISTED_ON>
      </INDIVIDUAL>` + makeIndividual());
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities).toHaveLength(1);
  });
});

describe('unConsolidatedAdapter.fetch — entities', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses a single entity', async () => {
    const xml = makeXml(makeEntity());
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.name).toBe('Bad Corp');
    expect(ent.type).toBe('entity');
    expect(ent.source).toBe('un_consolidated');
    expect(ent.id).toBe('un_consolidated:QEe.001');
  });

  it('uses FIRST_NAME as entity name when ENTITY_NAME is absent', async () => {
    const xml = makeXml(makeEntity({ firstName: 'Org Name', entityName: '' }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.name).toBe('Org Name');
  });

  it('collects entity aliases', async () => {
    const xml = makeXml(makeEntity({ aliases: ['BC', 'BadCo'] }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.aliases).toContain('BC');
    expect(result.entities[0]!.aliases).toContain('BadCo');
  });

  it('collects entity addresses', async () => {
    const xml = makeXml(makeEntity({ addresses: ['PO Box 1, Kabul'] }));
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities[0]!.addresses).toContain('PO Box 1, Kabul');
  });

  it('skips entities with no name', async () => {
    const xml = makeXml(
      makeEntity({ firstName: '', entityName: '' }) + makeEntity({ entityName: 'Good Corp' }),
    );
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('Good Corp');
  });
});

describe('unConsolidatedAdapter.fetch — mixed individual + entity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses both individuals and entities from the same XML', async () => {
    const xml = makeXml(makeIndividual() + makeEntity());
    mockFetchText.mockResolvedValue(xml);
    const result = await unConsolidatedAdapter.fetch();
    expect(result.entities).toHaveLength(2);
    expect(result.entities.map((e) => e.type)).toContain('individual');
    expect(result.entities.map((e) => e.type)).toContain('entity');
  });
});

describe('unConsolidatedAdapter.fetch — error branches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when 0 entities parsed', async () => {
    const xml = makeXml('<SOME_OTHER_ELEMENT />');
    mockFetchText.mockResolvedValue(xml);
    await expect(unConsolidatedAdapter.fetch()).rejects.toThrow('un_consolidated');
  });

  it('propagates fetchText errors', async () => {
    mockFetchText.mockRejectedValue(new Error('DNS failure'));
    await expect(unConsolidatedAdapter.fetch()).rejects.toThrow('DNS failure');
  });
});
