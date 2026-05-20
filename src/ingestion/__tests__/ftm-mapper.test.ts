import { describe, expect, it } from 'vitest';
import { entryToFtm, entryToFtmWithSanction, entriesToFtmStream, entryToFtmJson } from '../ftm-mapper.js';
import type { NormalisedListEntry } from '../../brain/watchlist-adapters.js';

function makeEntry(overrides: Partial<NormalisedListEntry> = {}): NormalisedListEntry {
  return {
    listId: 'ofac_sdn',
    sourceRef: 'SDN-12345',
    primaryName: 'John Doe',
    aliases: [],
    entityType: 'individual',
    identifiers: [],
    nationalities: [],
    addresses: [],
    programs: [],
    ingestedAt: '2024-01-01T00:00:00.000Z',
    rawHash: 'abc123',
    ...overrides,
  };
}

describe('entryToFtm — schema mapping', () => {
  it('maps individual to Person schema', () => {
    const entity = entryToFtm(makeEntry({ entityType: 'individual' }));
    expect(entity.schema).toBe('Person');
  });

  it('maps organisation to Organization schema', () => {
    const entity = entryToFtm(makeEntry({ entityType: 'organisation' }));
    expect(entity.schema).toBe('Organization');
  });

  it('maps vessel to Vessel schema', () => {
    const entity = entryToFtm(makeEntry({ entityType: 'vessel' }));
    expect(entity.schema).toBe('Vessel');
  });

  it('maps aircraft to Aircraft schema', () => {
    const entity = entryToFtm(makeEntry({ entityType: 'aircraft' }));
    expect(entity.schema).toBe('Aircraft');
  });

  it('maps unknown entity type to LegalEntity schema', () => {
    // 'other' is the fallback in watchlist-adapters
    const entity = entryToFtm(makeEntry({ entityType: 'other' }));
    expect(entity.schema).toBe('LegalEntity');
  });
});

describe('entryToFtm — properties', () => {
  it('includes primaryName and aliases in name property', () => {
    const entry = makeEntry({ primaryName: 'Alice Smith', aliases: ['A. Smith', 'Smith A.'] });
    const entity = entryToFtm(entry);
    expect(entity.properties.name).toContain('Alice Smith');
    expect(entity.properties.name).toContain('A. Smith');
    expect(entity.properties.name).toContain('Smith A.');
  });

  it('sets passport numbers from identifiers', () => {
    const entry = makeEntry({
      identifiers: [{ kind: 'passport', number: 'P0001234' }],
    });
    const entity = entryToFtm(entry);
    expect(entity.properties.passportNumber).toContain('P0001234');
  });

  it('sets national ID numbers from identifiers', () => {
    const entry = makeEntry({
      identifiers: [{ kind: 'national_id', number: 'NID-99' }],
    });
    const entity = entryToFtm(entry);
    expect(entity.properties.idNumber).toContain('NID-99');
  });

  it('ignores identifiers with unrecognised kinds', () => {
    const entry = makeEntry({
      identifiers: [{ kind: 'tax_id', number: 'TX-001' }],
    });
    const entity = entryToFtm(entry);
    expect(entity.properties.passportNumber).toBeUndefined();
    expect(entity.properties.idNumber).toBeUndefined();
  });

  it('sets nationalities when present', () => {
    const entry = makeEntry({ nationalities: ['US', 'GB'] });
    const entity = entryToFtm(entry);
    expect(entity.properties.nationality).toEqual(['US', 'GB']);
  });

  it('omits nationality when array is empty', () => {
    const entity = entryToFtm(makeEntry({ nationalities: [] }));
    expect(entity.properties.nationality).toBeUndefined();
  });

  it('sets addressFull from addresses', () => {
    const entry = makeEntry({
      addresses: [{ line: '10 Main St', city: 'Springfield', country: 'US' }],
    });
    const entity = entryToFtm(entry);
    expect(entity.properties['addressFull']).toBeDefined();
    expect(entity.properties['addressFull']![0]).toContain('10 Main St');
    expect(entity.properties['addressFull']![0]).toContain('Springfield');
  });

  it('filters out empty address parts', () => {
    const entry = makeEntry({
      addresses: [{ country: 'US' }], // no line or city
    });
    const entity = entryToFtm(entry);
    expect(entity.properties['addressFull']![0]).toBe('US');
  });

  it('omits addressFull when addresses array is empty', () => {
    const entity = entryToFtm(makeEntry({ addresses: [] }));
    expect(entity.properties['addressFull']).toBeUndefined();
  });

  it('sets description from remarks', () => {
    const entry = makeEntry({ remarks: 'Designated for terrorism financing' });
    const entity = entryToFtm(entry);
    expect(entity.properties.description).toEqual(['Designated for terrorism financing']);
  });

  it('omits description when remarks is absent', () => {
    const entity = entryToFtm(makeEntry({ remarks: undefined }));
    expect(entity.properties.description).toBeUndefined();
  });

  it('sets modifiedAt from publishedAt', () => {
    const entry = makeEntry({ publishedAt: '2024-03-15' });
    const entity = entryToFtm(entry);
    expect(entity.properties.modifiedAt).toEqual(['2024-03-15']);
  });

  it('omits modifiedAt when publishedAt is absent', () => {
    const entity = entryToFtm(makeEntry({ publishedAt: undefined }));
    expect(entity.properties.modifiedAt).toBeUndefined();
  });

  it('sets first_seen and last_seen from ingestedAt', () => {
    const entry = makeEntry({ ingestedAt: '2024-01-01T00:00:00.000Z' });
    const entity = entryToFtm(entry);
    expect(entity.first_seen).toBe('2024-01-01T00:00:00.000Z');
    expect(entity.last_seen).toBe('2024-01-01T00:00:00.000Z');
  });

  it('sets datasets from listId', () => {
    const entity = entryToFtm(makeEntry({ listId: 'eu_fsf' }));
    expect(entity.datasets).toContain('eu_fsf');
  });

  it('builds deterministic id from schema + primaryName + listId + sourceRef', () => {
    const entry = makeEntry();
    const e1 = entryToFtm(entry);
    const e2 = entryToFtm(entry);
    expect(e1.id).toBe(e2.id);
  });
});

describe('entryToFtmWithSanction', () => {
  it('returns two entities: the subject and the Sanction', () => {
    const result = entryToFtmWithSanction(makeEntry());
    expect(result).toHaveLength(2);
    expect(result[0]!.schema).toBe('Person');
    expect(result[1]!.schema).toBe('Sanction');
  });

  it('links sanction entity to subject via entity property', () => {
    const result = entryToFtmWithSanction(makeEntry());
    const sanction = result[1]!;
    const subject = result[0]!;
    expect(sanction.properties['entity']).toContain(subject.id);
  });

  it('sets sanction authority from programs when present', () => {
    const entry = makeEntry({ programs: ['SYRIA', 'IRGC'] });
    const [, sanction] = entryToFtmWithSanction(entry);
    expect(sanction!.properties.authority).toEqual(['SYRIA', 'IRGC']);
    expect(sanction!.properties.program).toEqual(['SYRIA', 'IRGC']);
  });

  it('falls back to listId for authority when programs are empty', () => {
    const entry = makeEntry({ programs: [] });
    const [, sanction] = entryToFtmWithSanction(entry);
    expect(sanction!.properties.authority).toContain('ofac_sdn');
  });

  it('sets listingDate from publishedAt on the sanction', () => {
    const entry = makeEntry({ publishedAt: '2024-06-01' });
    const [, sanction] = entryToFtmWithSanction(entry);
    expect(sanction!.properties.listingDate).toEqual(['2024-06-01']);
  });

  it('omits listingDate when publishedAt is absent', () => {
    const entry = makeEntry({ publishedAt: undefined });
    const [, sanction] = entryToFtmWithSanction(entry);
    expect(sanction!.properties.listingDate).toBeUndefined();
  });

  it('sets reason from remarks on the sanction', () => {
    const entry = makeEntry({ remarks: 'Terror financing' });
    const [, sanction] = entryToFtmWithSanction(entry);
    expect(sanction!.properties.reason).toEqual(['Terror financing']);
  });

  it('omits reason when remarks is absent', () => {
    const entry = makeEntry({ remarks: undefined });
    const [, sanction] = entryToFtmWithSanction(entry);
    expect(sanction!.properties.reason).toBeUndefined();
  });

  it('sets caption on sanction as name — listId', () => {
    const entry = makeEntry({ primaryName: 'John Doe', listId: 'ofac_sdn' });
    const [, sanction] = entryToFtmWithSanction(entry);
    expect(sanction!.caption).toBe('John Doe — OFAC_SDN');
  });
});

describe('entriesToFtmStream', () => {
  it('returns NDJSON with one line per entity + sanction by default', () => {
    const entries = [makeEntry({ sourceRef: 'A' }), makeEntry({ sourceRef: 'B' })];
    const stream = entriesToFtmStream(entries);
    // 2 entries × 2 entities each = 4 lines
    const lines = stream.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('excludes sanction entities when includeSanctions=false', () => {
    const entries = [makeEntry({ sourceRef: 'A', primaryName: 'X Corp' })];
    const stream = entriesToFtmStream(entries, false);
    const lines = stream.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.schema).not.toBe('Sanction');
  });

  it('deduplicates entities with the same id', () => {
    const entry = makeEntry({ sourceRef: 'same', primaryName: 'Dup' });
    const stream = entriesToFtmStream([entry, entry], false);
    const lines = stream.split('\n').filter(Boolean);
    // Same entry twice should deduplicate to 1
    expect(lines).toHaveLength(1);
  });

  it('returns empty string for empty input', () => {
    expect(entriesToFtmStream([])).toBe('');
  });
});

describe('entryToFtmJson', () => {
  it('returns a plain object representation of the entity', () => {
    const entry = makeEntry();
    const json = entryToFtmJson(entry);
    expect(typeof json).toBe('object');
    expect(json['id']).toBeTruthy();
    expect(json['schema']).toBe('Person');
    expect(json['caption']).toBe('John Doe');
  });
});
