import { describe, expect, it, vi, beforeEach } from 'vitest';
import { caOsfiAdapter } from '../ca-osfi.js';

vi.mock('../../fetch-util.js', () => ({
  fetchText: vi.fn(),
  sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 8)}`),
}));

import * as fetchUtil from '../../fetch-util.js';
const mockFetchText = vi.mocked(fetchUtil.fetchText);

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) =>
          cell.includes(',') || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell,
        )
        .join(','),
    )
    .join('\n');
}

const HEADER = [
  'Country',
  'Schedule',
  'Item',
  'Name',
  'DateOfBirth',
  'Place of Birth',
  'Aliases',
  'Title',
  'Address',
  'Citizenship',
  'Passport',
  'Other identifying info',
  'Date Listed',
];

function makeCsv(dataRows: string[][]): string {
  return buildCsv([HEADER, ...dataRows]);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('caOsfiAdapter — metadata', () => {
  it('has the expected id and displayName', () => {
    expect(caOsfiAdapter.id).toBe('ca_osfi');
    expect(caOsfiAdapter.displayName).toBe('Canada OSFI Consolidated Sanctions');
  });
});

describe('caOsfiAdapter.fetch — successful parse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses a single individual row (comma-separated name)', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM001', 'Doe, John', '1980-01-01', 'Ottawa', 'J. Doe', '', '123 Main St', 'Canadian', 'P123456', '', '2020-01-01'],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.type).toBe('individual');
    expect(ent.name).toBe('Doe, John');
    expect(ent.source).toBe('ca_osfi');
    expect(ent.id).toBe('ca_osfi:ITEM001');
  });

  it('parses an entity row (no comma in name)', async () => {
    const csv = makeCsv([
      ['Russia', 'Sch2', 'ITEM002', 'Evil Corp Ltd', '', '', '', '', '', 'Russian', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.type).toBe('entity');
  });

  it('parses aliases split by semicolon', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM003', 'Doe, John', '', '', 'Johnny;JD;J. Doe', '', '', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.aliases).toEqual(['Johnny', 'JD', 'J. Doe']);
  });

  it('parses aliases split by pipe', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM004', 'Doe, John', '', '', 'Johnny|JD', '', '', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.aliases).toEqual(['Johnny', 'JD']);
  });

  it('sets passport identifier when present', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM005', 'Doe, John', '', '', '', '', '', '', 'P987654', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.identifiers['passport']).toBe('P987654');
  });

  it('omits passport identifier when empty', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM006', 'Doe, John', '', '', '', '', '', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.identifiers).toEqual({});
  });

  it('uses citizenship for nationalities when present', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM007', 'Doe, John', '', '', '', '', '', 'British', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.nationalities).toEqual(['British']);
  });

  it('falls back to country for nationalities when citizenship missing', async () => {
    const csv = makeCsv([
      ['Russia', 'Sch1', 'ITEM008', 'Doe, John', '', '', '', '', '', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.nationalities).toEqual(['Russia']);
  });

  it('sets dateOfBirth when present', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM009', 'Doe, John', '1975-06-15', '', '', '', '', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.dateOfBirth).toBe('1975-06-15');
  });

  it('omits dateOfBirth when empty', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM010', 'Doe, John', '', '', '', '', '', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.dateOfBirth).toBeUndefined();
  });

  it('falls back to name in id when item is empty', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', '', 'Doe, John', '', '', '', '', '', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.id).toBe('ca_osfi:Doe, John');
  });

  it('sets addresses when address column is non-empty', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM011', 'Doe, John', '', '', '', '', '100 Maple Ave', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.addresses).toContain('100 Maple Ave');
  });

  it('returns rawChecksum', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM001', 'Doe, John', '', '', '', '', '', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.rawChecksum).toBeTruthy();
  });

  it('skips rows where name is empty', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM001', 'Doe, John', '', '', '', '', '', '', '', '', ''],
      ['Canada', 'Sch1', 'ITEM002', '', '', '', '', '', '', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
  });

  it('includes listing with schedule program and dateListed', async () => {
    const csv = makeCsv([
      ['Canada', 'SEMA Sch1', 'ITEM001', 'Doe, John', '', '', '', '', '', '', '', '', '2022-03-15'],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    const listing = result.entities[0]!.listings[0]!;
    expect(listing.program).toBe('SEMA Sch1');
    expect(listing.designatedAt).toBe('2022-03-15');
  });
});

describe('caOsfiAdapter.fetch — error branches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when CSV has fewer than 2 rows', async () => {
    mockFetchText.mockResolvedValue('Country,Name');
    await expect(caOsfiAdapter.fetch()).rejects.toThrow('[ca_osfi]');
  });

  it('throws when all data rows have empty names (0 entities)', async () => {
    const csv = makeCsv([
      ['Canada', 'Sch1', 'ITEM002', '', '', '', '', '', '', '', '', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    await expect(caOsfiAdapter.fetch()).rejects.toThrow('[ca_osfi]');
  });

  it('propagates fetchText errors', async () => {
    mockFetchText.mockRejectedValue(new Error('Connection refused'));
    await expect(caOsfiAdapter.fetch()).rejects.toThrow('Connection refused');
  });
});

// ── XML path (current GAC sema-lmes.xml format) ──────────────────────────────

interface XmlRecordFields {
  EntityOrShip?: string;
  GivenName?: string;
  LastName?: string;
  DateOfBirthOrShipBuildDate?: string;
  TitleOrShip?: string;
  ShipIMONumber?: string;
  Schedule?: string;
  Country?: string;
  Aliases?: string;
  Item?: string;
  DateOfListing?: string;
}

function makeXmlRecord(fields: XmlRecordFields): string {
  const tags = Object.entries(fields)
    .map(([tag, value]) => `<${tag}>${value}</${tag}>`)
    .join('');
  return `<record>${tags}</record>`;
}

function makeXml(records: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><data-set>${records.join('')}</data-set>`;
}

describe('caOsfiAdapter.fetch — XML path (sema-lmes.xml)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses an individual record from GivenName + LastName', async () => {
    mockFetchText.mockResolvedValue(makeXml([
      makeXmlRecord({ Country: 'Russia', Item: '42', GivenName: 'John', LastName: 'Doe', DateOfBirthOrShipBuildDate: '1980-01-01', Schedule: 'Part 1', DateOfListing: '2022-03-15' }),
    ]));
    const result = await caOsfiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.type).toBe('individual');
    expect(ent.name).toBe('John Doe');
    expect(ent.dateOfBirth).toBe('1980-01-01');
    expect(ent.id).toBe('ca_osfi:42');
    expect(ent.nationalities).toEqual(['Russia']);
    const listing = ent.listings[0]!;
    expect(listing.program).toBe('Part 1');
    expect(listing.reference).toBe('42');
    expect(listing.designatedAt).toBe('2022-03-15');
  });

  it('parses an entity record from EntityOrShip', async () => {
    mockFetchText.mockResolvedValue(makeXml([
      makeXmlRecord({ Country: 'Iran', Item: '7', EntityOrShip: 'Evil Corp Ltd' }),
    ]));
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.type).toBe('entity');
    expect(result.entities[0]!.name).toBe('Evil Corp Ltd');
  });

  it('parses a vessel record when ShipIMONumber is present', async () => {
    mockFetchText.mockResolvedValue(makeXml([
      makeXmlRecord({ Country: 'North Korea', Item: '9', EntityOrShip: 'MV Bad Ship', ShipIMONumber: '9123456', DateOfBirthOrShipBuildDate: '1999' }),
    ]));
    const result = await caOsfiAdapter.fetch();
    const ent = result.entities[0]!;
    expect(ent.type).toBe('vessel');
    expect(ent.identifiers['imo']).toBe('9123456');
    // Build date is not a date of birth.
    expect(ent.dateOfBirth).toBeUndefined();
  });

  it('splits aliases on semicolons and pipes', async () => {
    mockFetchText.mockResolvedValue(makeXml([
      makeXmlRecord({ Item: '1', GivenName: 'John', LastName: 'Doe', Aliases: 'Johnny; JD | J. Doe' }),
    ]));
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.aliases).toEqual(['Johnny', 'JD', 'J. Doe']);
  });

  it('unescapes XML entities in names', async () => {
    mockFetchText.mockResolvedValue(makeXml([
      makeXmlRecord({ Item: '3', EntityOrShip: 'Defence &amp; Security Co &quot;DSC&quot;' }),
    ]));
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.name).toBe('Defence & Security Co "DSC"');
  });

  it('falls back to name in id when Item is absent', async () => {
    mockFetchText.mockResolvedValue(makeXml([
      makeXmlRecord({ EntityOrShip: 'No Item Corp' }),
    ]));
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.id).toBe('ca_osfi:No Item Corp');
  });

  it('skips records with no name and keeps the rest', async () => {
    mockFetchText.mockResolvedValue(makeXml([
      makeXmlRecord({ Item: '1', Country: 'Russia' }),
      makeXmlRecord({ Item: '2', EntityOrShip: 'Valid Corp' }),
    ]));
    const result = await caOsfiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('Valid Corp');
  });

  it('throws when the body is an HTML page (endpoint moved)', async () => {
    mockFetchText.mockResolvedValue('<!DOCTYPE html><html><body>Page moved</body></html>');
    await expect(caOsfiAdapter.fetch()).rejects.toThrow('[ca_osfi]');
  });

  it('throws when XML has no <record> elements', async () => {
    mockFetchText.mockResolvedValue('<?xml version="1.0"?><data-set></data-set>');
    await expect(caOsfiAdapter.fetch()).rejects.toThrow('[ca_osfi]');
  });

  it('throws when all records parse to 0 entities', async () => {
    mockFetchText.mockResolvedValue(makeXml([makeXmlRecord({ Item: '1', Country: 'Russia' })]));
    await expect(caOsfiAdapter.fetch()).rejects.toThrow('[ca_osfi]');
  });
});

describe('caOsfiAdapter.fetch — CSV parsing edge cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('handles CRLF line endings', async () => {
    const csv =
      'Country,Schedule,Item,Name,DateOfBirth,Place of Birth,Aliases,Title,Address,Citizenship,Passport,Other identifying info,Date Listed\r\n' +
      'Canada,Sch1,ITEM001,Doe John,,,,,,,,, \r\n';
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
  });

  it('handles quoted fields with embedded commas', async () => {
    const csv =
      'Country,Schedule,Item,Name,DateOfBirth,Place of Birth,Aliases,Title,Address,Citizenship,Passport,Other identifying info,Date Listed\n' +
      'Canada,Sch1,ITEM001,"Doe, Jr John",,,,,,,,, \n';
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.name).toBe('Doe, Jr John');
  });

  it('handles escaped double-quotes in quoted fields', async () => {
    const csv =
      'Country,Schedule,Item,Name,DateOfBirth,Place of Birth,Aliases,Title,Address,Citizenship,Passport,Other identifying info,Date Listed\n' +
      'Canada,Sch1,ITEM001,"Doe ""The Man""",,,,,,,,,\n';
    mockFetchText.mockResolvedValue(csv);
    const result = await caOsfiAdapter.fetch();
    expect(result.entities[0]!.name).toContain('Doe "The Man"');
  });
});
