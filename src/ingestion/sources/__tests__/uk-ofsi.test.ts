import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ukOfsiAdapter } from '../uk-ofsi.js';

// Mock fetch-util so no real network calls happen
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
        .map((cell) => (cell.includes(',') || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(','),
    )
    .join('\n');
}

// Standard 2022-format OFSI CSV: metadata row, header row, data rows
function makeCsv(dataRows: string[][]): string {
  const header = ['Group Type', 'Group ID', 'Name 6', 'Name 1', 'Regime', 'DOB', 'Nationality'];
  const metaRow = ['Last updated: 01/01/2024'];
  return buildCsv([metaRow, header, ...dataRows]);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ukOfsiAdapter — metadata', () => {
  it('has the expected id and displayName', () => {
    expect(ukOfsiAdapter.id).toBe('uk_ofsi');
    expect(ukOfsiAdapter.displayName).toBe('UK OFSI Consolidated List');
  });
});

describe('ukOfsiAdapter.fetch — successful parse', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('parses a single individual row', async () => {
    const csv = makeCsv([['Individual', 'GRP001', 'DOE', 'John', 'UKRAINE', '1980-01-01', 'GBR']]);
    mockFetchText.mockResolvedValue(csv);

    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.type).toBe('individual');
    expect(ent.source).toBe('uk_ofsi');
    expect(ent.id).toContain('uk_ofsi:');
    expect(ent.listings[0]!.source).toBe('uk_ofsi');
  });

  it('parses an entity (non-individual) row', async () => {
    const csv = makeCsv([['Entity', 'GRP002', 'EVIL CORP', '', 'RUSSIA', '', 'RUS']]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities[0]!.type).toBe('entity');
  });

  it('parses a vessel row', async () => {
    const csv = makeCsv([['Ship', 'GRP003', 'MV VESSEL', '', 'IRAN', '', '']]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities[0]!.type).toBe('vessel');
  });

  it('unknown group type maps to "unknown"', async () => {
    const csv = makeCsv([['Aircraft', 'GRP004', 'FAKE PLANE', '', 'IRAN', '', '']]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities[0]!.type).toBe('unknown');
  });

  it('merges aliases for rows sharing the same Group ID', async () => {
    const csv = makeCsv([
      ['Individual', 'GRP010', 'DOE', 'John', 'UKRAINE', '1980-01-01', 'GBR'],
      ['Individual', 'GRP010', 'DOE', 'Johnny', 'UKRAINE', '1980-01-01', 'GBR'],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.aliases).toContain('Johnny DOE');
  });

  it('does not duplicate alias if same name appears again for same groupId', async () => {
    const csv = makeCsv([
      ['Individual', 'GRP020', 'DOE', 'John', 'UKRAINE', '', ''],
      ['Individual', 'GRP020', 'DOE', 'John', 'UKRAINE', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    // Name is added once as alias (deduplication works — not added twice)
    expect(result.entities[0]!.aliases).toHaveLength(1);
    expect(result.entities[0]!.aliases).toContain('John DOE');
  });

  it('strips UTF-8 BOM from CSV', async () => {
    const csv = '﻿' + makeCsv([['Individual', 'GRP001', 'DOE', 'John', 'UKRAINE', '', '']]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
  });

  it('skips rows with no name', async () => {
    const csv = makeCsv([
      ['Individual', 'GRP001', 'DOE', 'John', 'UKRAINE', '', ''],
      ['Individual', 'GRP002', '', '', 'UKRAINE', '', ''],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
  });

  it('sets dateOfBirth when DOB column is populated', async () => {
    const csv = makeCsv([['Individual', 'GRP001', 'DOE', 'John', 'UKRAINE', '1990-05-15', '']]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities[0]!.dateOfBirth).toBe('1990-05-15');
  });

  it('omits dateOfBirth when DOB is empty', async () => {
    const csv = makeCsv([['Individual', 'GRP001', 'DOE', 'John', 'UKRAINE', '', '']]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities[0]!.dateOfBirth).toBeUndefined();
  });

  it('sets nationalities and jurisdictions when Nationality column populated', async () => {
    const csv = makeCsv([['Individual', 'GRP001', 'DOE', 'John', 'UKRAINE', '', 'GBR']]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities[0]!.nationalities).toEqual(['GBR']);
    expect(result.entities[0]!.jurisdictions).toEqual(['GBR']);
  });

  it('includes a rawChecksum in the result', async () => {
    const csv = makeCsv([['Individual', 'GRP001', 'DOE', 'John', 'UKRAINE', '', '']]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.rawChecksum).toBeTruthy();
  });

  it('uses regime column for listing program', async () => {
    const csv = makeCsv([['Individual', 'GRP001', 'DOE', 'John', 'UKRAINE', '', '']]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities[0]!.listings[0]!.program).toBe('UKRAINE');
  });

  it('handles rows without a Group ID (uses name as key)', async () => {
    const csv = makeCsv([['Individual', '', 'DOE', 'John', 'UKRAINE', '', '']]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.id).toContain('uk_ofsi:');
  });
});

describe('ukOfsiAdapter.fetch — header detection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detects header in row 0 when first row has recognised column names', async () => {
    // Header in row 0 (no metadata row)
    const header = ['Group Type', 'Group ID', 'Name 6', 'Name 1', 'Regime', 'DOB', 'Nationality'];
    const data = ['Individual', 'GRP001', 'DOE', 'John', 'UKRAINE', '', ''];
    const csv = buildCsv([header, data]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
  });

  it('uses regime name column fallback', async () => {
    const header = ['Group Type', 'Group ID', 'Name 6', 'Name 1', 'Regime Name', 'DOB', 'Nationality'];
    const data = ['Individual', 'GRP001', 'DOE', 'John', 'IRAN', '', ''];
    const csv = buildCsv([header, data]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities[0]!.listings[0]!.program).toBe('IRAN');
  });

  it('uses legal basis column as final regime fallback', async () => {
    const header = ['Group Type', 'Group ID', 'Name 6', 'Name 1', 'Legal Basis', 'DOB', 'Nationality'];
    const data = ['Individual', 'GRP001', 'DOE', 'John', 'JCPOA', '', ''];
    const csv = buildCsv([header, data]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities[0]!.listings[0]!.program).toBe('JCPOA');
  });
});

describe('ukOfsiAdapter.fetch — error branches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty entities when CSV has no rows', async () => {
    mockFetchText.mockResolvedValue('');
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(0);
  });

  it('returns empty entities when no Name 6 or Name 1 columns found', async () => {
    const csv = buildCsv([
      ['Col A', 'Col B', 'Col C'],
      ['val1', 'val2', 'val3'],
    ]);
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(0);
  });

  it('throws when header is detected but all data rows are empty (0 entities)', async () => {
    // CSV has header and columns, but all data rows have no name
    const csv = makeCsv([['Individual', 'GRP001', '', '', 'UKRAINE', '', '']]);
    mockFetchText.mockResolvedValue(csv);
    await expect(ukOfsiAdapter.fetch()).rejects.toThrow('[uk_ofsi]');
  });

  it('propagates fetchText errors', async () => {
    mockFetchText.mockRejectedValue(new Error('Network error'));
    await expect(ukOfsiAdapter.fetch()).rejects.toThrow('Network error');
  });
});

describe('parseCsv internal — via adapter (integration)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('handles quoted fields with embedded commas', async () => {
    // Name 6 contains a comma so it must be quoted
    const csv =
      'Last updated: test\nGroup Type,Group ID,Name 6,Name 1,Regime,DOB,Nationality\n' +
      'Individual,GRP001,"Doe, Jr.",John,UKRAINE,,\n';
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toContain('Doe, Jr.');
  });

  it('handles escaped double-quotes inside quoted fields', async () => {
    const csv =
      'Last updated: test\nGroup Type,Group ID,Name 6,Name 1,Regime,DOB,Nationality\n' +
      'Individual,GRP001,"Doe ""The Man""",John,UKRAINE,,\n';
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities[0]!.name).toContain('Doe "The Man"');
  });

  it('handles Windows-style CRLF line endings', async () => {
    const csv =
      'Last updated: test\r\nGroup Type,Group ID,Name 6,Name 1,Regime,DOB,Nationality\r\nIndividual,GRP001,DOE,John,UKRAINE,,\r\n';
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
  });

  it('handles trailing content after last newline', async () => {
    // No trailing newline — final row must still be pushed
    const csv =
      'Last updated: test\nGroup Type,Group ID,Name 6,Name 1,Regime,DOB,Nationality\nIndividual,GRP001,DOE,John,UKRAINE,,';
    mockFetchText.mockResolvedValue(csv);
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities).toHaveLength(1);
  });
});
