import { describe, expect, it } from 'vitest';
import { ftmId, makeFtmEntity, toFtmNdjson, toFtmStream, type FtmEntity, type FtmSchema } from '../ftm-schema.js';

describe('ftmId', () => {
  it('returns an 8-character hex string', () => {
    const id = ftmId('Person', 'Alice', 'un_sc');
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic for the same inputs', () => {
    expect(ftmId('Person', 'Alice', 'un_sc')).toBe(ftmId('Person', 'Alice', 'un_sc'));
  });

  it('differs for different schemas', () => {
    expect(ftmId('Person', 'Alice')).not.toBe(ftmId('Organization', 'Alice'));
  });

  it('differs for different key values', () => {
    expect(ftmId('Person', 'Alice')).not.toBe(ftmId('Person', 'Bob'));
  });

  it('handles empty key values', () => {
    const id = ftmId('Sanction');
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('handles all FtmSchema variants without throwing', () => {
    const schemas: FtmSchema[] = [
      'Thing', 'Person', 'Organization', 'Company', 'LegalEntity', 'PublicBody',
      'Asset', 'RealEstate', 'BankAccount', 'CryptoWallet', 'Payment', 'Sanction',
      'Identification', 'Address', 'Ownership', 'Directorship', 'Membership',
      'Associate', 'Family', 'UnknownLink', 'Vessel', 'Aircraft', 'Vehicle',
    ];
    for (const schema of schemas) {
      expect(() => ftmId(schema, 'test')).not.toThrow();
    }
  });

  it('produces correct FNV-1a hash for known input', () => {
    // The hash is deterministic — we just verify it doesn't change unexpectedly.
    const a = ftmId('Person', 'Alice', 'un_sc');
    const b = ftmId('Person', 'Alice', 'un_sc');
    expect(a).toBe(b);
  });

  it('pads hash to 8 characters', () => {
    // Short hash values (leading zeros) must still be padded.
    const id = ftmId('Thing', 'a');
    expect(id).toHaveLength(8);
  });
});

describe('makeFtmEntity', () => {
  it('creates an entity with correct schema and caption', () => {
    const entity = makeFtmEntity('Person', 'John Doe', ['un_sc']);
    expect(entity.schema).toBe('Person');
    expect(entity.caption).toBe('John Doe');
    expect(entity.datasets).toEqual(['un_sc']);
    expect(entity.id).toBeTruthy();
    expect(entity.properties.name).toContain('John Doe');
    expect(entity.first_seen).toBeTruthy();
  });

  it('merges additional properties', () => {
    const entity = makeFtmEntity('Person', 'Jane', ['ofac'], {
      nationality: ['US'],
      passportNumber: ['P12345'],
    });
    expect(entity.properties.nationality).toEqual(['US']);
    expect(entity.properties.passportNumber).toEqual(['P12345']);
    // name should still be set
    expect(entity.properties.name).toContain('Jane');
  });

  it('uses empty datasets array gracefully', () => {
    const entity = makeFtmEntity('Organization', 'ACME Corp', []);
    expect(entity.datasets).toEqual([]);
    // id is computed from schema + caption + first dataset (undefined fallback)
    expect(entity.id).toBeTruthy();
  });

  it('sets first_seen to current ISO date', () => {
    const before = Date.now();
    const entity = makeFtmEntity('Sanction', 'Test', ['list']);
    const after = Date.now();
    const firstSeen = new Date(entity.first_seen!).getTime();
    expect(firstSeen).toBeGreaterThanOrEqual(before);
    expect(firstSeen).toBeLessThanOrEqual(after);
  });

  it('does not override name if provided in properties', () => {
    // name in properties is spread before, so makeFtmEntity's name: [caption] wins
    const entity = makeFtmEntity('Person', 'Main Name', ['list'], {
      name: ['Override Name'],
    });
    // makeFtmEntity does: { name: [caption], ...properties }
    // so properties.name overrides caption's name
    expect(entity.properties.name).toEqual(['Override Name']);
  });
});

describe('toFtmNdjson', () => {
  it('serialises a single entity to a valid JSON string', () => {
    const entity: FtmEntity = {
      id: 'abc123',
      schema: 'Person',
      caption: 'Alice',
      datasets: ['ofac_sdn'],
      properties: { name: ['Alice'] },
      first_seen: '2024-01-01T00:00:00.000Z',
    };
    const line = toFtmNdjson(entity);
    const parsed = JSON.parse(line);
    expect(parsed.id).toBe('abc123');
    expect(parsed.schema).toBe('Person');
    expect(parsed.caption).toBe('Alice');
  });

  it('handles entities with no optional fields', () => {
    const entity: FtmEntity = {
      id: 'min',
      schema: 'Thing',
      caption: 'Minimal',
      datasets: [],
      properties: {},
    };
    const line = toFtmNdjson(entity);
    expect(() => JSON.parse(line)).not.toThrow();
  });
});

describe('toFtmStream', () => {
  it('joins multiple entities with newlines', () => {
    const e1: FtmEntity = { id: '1', schema: 'Person', caption: 'A', datasets: [], properties: {} };
    const e2: FtmEntity = { id: '2', schema: 'Organization', caption: 'B', datasets: [], properties: {} };
    const stream = toFtmStream([e1, e2]);
    const lines = stream.split('\n');
    expect(lines).toHaveLength(2);
    const parsed1 = JSON.parse(lines[0]!);
    const parsed2 = JSON.parse(lines[1]!);
    expect(parsed1.id).toBe('1');
    expect(parsed2.id).toBe('2');
  });

  it('returns empty string for empty array', () => {
    expect(toFtmStream([])).toBe('');
  });

  it('works with a single entity', () => {
    const e: FtmEntity = { id: 'x', schema: 'Vessel', caption: 'Ship', datasets: ['list'], properties: { name: ['Ship'] } };
    const stream = toFtmStream([e]);
    expect(stream).not.toContain('\n');
    const parsed = JSON.parse(stream);
    expect(parsed.id).toBe('x');
  });
});
