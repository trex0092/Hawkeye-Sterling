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
