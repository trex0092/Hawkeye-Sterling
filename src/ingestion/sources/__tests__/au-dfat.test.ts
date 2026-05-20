import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch-util (sha256Hex used for checksum)
vi.mock('../../fetch-util.js', () => ({
  sha256Hex: vi.fn(async (_s: string) => 'aabbccddee'),
}));

// ── ExcelJS mock factory ──────────────────────────────────────────────────────

type CellValue = string | number | Date | null | undefined | { text?: string; toString?: () => string };

function makeSheet(rows: CellValue[][]) {
  return {
    rowCount: rows.length,
    getRow: (n: number) => {
      const row = rows[n - 1];
      if (!row) return { values: [] };
      return { values: [undefined, ...row] }; // ExcelJS row.values[0] is unused
    },
  };
}

function makeExcelJsModule(rows: CellValue[][]) {
  const sheet = makeSheet(rows);
  class Workbook {
    worksheets = [sheet];
    xlsx = { load: vi.fn().mockResolvedValue(undefined) };
  }
  return { Workbook };
}

function makeEmptyExcelJsModule() {
  class Workbook {
    worksheets: unknown[] = [];
    xlsx = { load: vi.fn().mockResolvedValue(undefined) };
  }
  return { Workbook };
}

// ── Global fetch mock ─────────────────────────────────────────────────────────

function mockFetchOk() {
  const buf = Buffer.from('fake xlsx');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: vi.fn().mockResolvedValue(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
  }));
}

function mockFetchError(status: number) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
}

// ── DFAT header row ───────────────────────────────────────────────────────────
const DFAT_HEADER: CellValue[] = [
  'Name of Listed Item', // 0
  'Name Type',           // 1
  'Date of Birth',       // 2
  'Place of Birth',      // 3
  'Citizenship',         // 4
  'Address',             // 5
  'Listing Information', // 6
  'Control Date',        // 7
  'Reference',           // 8
  'Committees',          // 9
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('auDfatAdapter — metadata', () => {
  it('has expected id and displayName', async () => {
    vi.resetModules();
    vi.doMock('exceljs', () => makeEmptyExcelJsModule());
    const { auDfatAdapter } = await import('../au-dfat.js');
    expect(auDfatAdapter.id).toBe('au_dfat');
    expect(auDfatAdapter.displayName).toBe('Australia DFAT Consolidated Sanctions');
  });
});

describe('auDfatAdapter.fetch — successful parse', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('parses a single individual entity (has DOB)', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['John Doe', 'Primary Name', '1970-01-01', 'Sydney', 'Australian', '123 Main St', 'Terror', '2020-01-01', 'DFAT001', 'UN 1267'],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.name).toBe('John Doe');
    expect(ent.type).toBe('individual');
    expect(ent.source).toBe('au_dfat');
    expect(ent.id).toBe('au_dfat:DFAT001');
    expect(ent.dateOfBirth).toBe('1970-01-01');
    expect(ent.nationalities).toContain('Australian');
    expect(ent.addresses).toContain('123 Main St');
    expect(ent.listings[0]!.program).toBe('UN 1267');
    expect(ent.listings[0]!.designatedAt).toBe('2020-01-01');
  });

  it('parses an entity type (no DOB, no POB, no individual/person in type)', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['Evil Corp', 'Legal Entity', '', '', 'Russia', '', '', '2021-05-01', 'DFAT002', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities[0]!.type).toBe('entity');
  });

  it('detects individual from "individual" in name type', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['Jane Roe', 'Individual', '', '', '', '', '', '2021-01-01', 'DFAT003', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities[0]!.type).toBe('individual');
  });

  it('merges alias rows into primary entity', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['John Doe', 'Primary Name', '1970-01-01', '', '', '', '', '2020-01-01', 'DFAT004', ''],
      ['Johnny D', 'aka', '', '', '', '', '', '', 'DFAT004', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.aliases).toContain('Johnny D');
  });

  it('also merges "alias" type rows', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['John Doe', 'Primary Name', '1970-01-01', '', '', '', '', '2020-01-01', 'DFAT004B', ''],
      ['Alt Name', 'alias', '', '', '', '', '', '', 'DFAT004B', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.aliases).toContain('Alt Name');
  });

  it('does not add duplicate alias (same name as primary)', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['John Doe', 'Primary Name', '1970-01-01', '', '', '', '', '2020-01-01', 'DFAT005', ''],
      ['John Doe', 'alias', '', '', '', '', '', '', 'DFAT005', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities[0]!.aliases).toHaveLength(0);
  });

  it('skips secondary rows that are not aka/alias/alternative', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['John Doe', 'Primary Name', '1970-01-01', '', '', '', '', '2020-01-01', 'DFAT006', ''],
      ['Other row', 'secondary', '', '', '', '', '', '', 'DFAT006', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.aliases).toHaveLength(0);
  });

  it('skips rows with empty name', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['', 'Primary Name', '', '', '', '', '', '', 'DFAT007', ''],
      ['Valid Person', 'Primary Name', '', '', '', '', '', '2020-01-01', 'DFAT008', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('Valid Person');
  });

  it('generates ref from name_rowNum when Reference column is empty', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['Person No Ref', 'Primary Name', '', '', '', '', '', '2020-01-01', '', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities[0]!.id).toMatch(/au_dfat:Person No Ref_\d+/);
  });

  it('returns rawChecksum', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['Test Person', 'Primary Name', '', '', '', '', '', '2020-01-01', 'DFAT009', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.rawChecksum).toBeTruthy();
  });

  it('handles numeric cell values (converts to string)', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      [42 as CellValue, 'Primary Name', '', '', '', '', '', '2020-01-01', 'DFAT010', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities[0]!.name).toBe('42');
  });

  it('handles Date cell values', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['Date Person', 'Primary Name', new Date('2020-06-15T00:00:00Z') as CellValue, '', '', '', '', '2020-01-01', 'DFAT011', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities[0]!.dateOfBirth).toMatch(/2020-06-15/);
  });

  it('handles object cell with .text property', async () => {
    const richText = { text: 'Rich Text Name', toString: () => '[object Object]' };
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      [richText as CellValue, 'Primary Name', '', '', '', '', '', '2020-01-01', 'DFAT012', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities[0]!.name).toBe('Rich Text Name');
  });

  it('handles object cell with toString() returning a non-[object Object] string', async () => {
    const cellObj = { toString: () => 'toString Name' };
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      [cellObj as CellValue, 'Primary Name', '', '', '', '', '', '2020-01-01', 'DFAT013', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities[0]!.name).toBe('toString Name');
  });

  it('handles null/undefined cell values gracefully', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      [null as CellValue, 'Primary Name', undefined as CellValue, '', '', '', '', '2020-01-01', 'DFAT014', ''],
      ['Valid Person', 'Primary Name', '', '', '', '', '', '2020-01-01', 'DFAT015', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    // First row has null name → skipped, only second row parsed
    expect(result.entities).toHaveLength(1);
  });
});

describe('auDfatAdapter.fetch — header scanning', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('finds headers in row 2 (DFAT title row in row 1)', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      ['Australia DFAT Consolidated Sanctions List'], // row 1: title
      DFAT_HEADER,                                    // row 2: headers
      ['Jane Roe', 'Primary Name', '1975-03-01', '', '', '', '', '2020-01-01', 'DFAT020', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('Jane Roe');
  });

  it('falls back to row 1 when no recognised header found in first 4 rows', async () => {
    // No row has >=3 recognised headers → falls back to row 1 (which has col A, Col B)
    // cols.name < 0 so returns empty
    vi.doMock('exceljs', () => makeExcelJsModule([
      ['Col A', 'Col B', 'Col C'],
      ['val1', 'val2', 'val3'],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities).toHaveLength(0);
  });
});

describe('auDfatAdapter.fetch — no sheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns empty entities when workbook has no worksheets', async () => {
    vi.doMock('exceljs', () => makeEmptyExcelJsModule());
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    const result = await auDfatAdapter.fetch();
    expect(result.entities).toHaveLength(0);
  });
});

describe('auDfatAdapter.fetch — error branches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('throws when exceljs is not installed', async () => {
    vi.doMock('exceljs', () => { throw new Error('Cannot find module exceljs'); });
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    await expect(auDfatAdapter.fetch()).rejects.toThrow("au_dfat requires the 'exceljs' npm package");
  });

  it('throws HTTP error when fetch returns non-ok status', async () => {
    vi.doMock('exceljs', () => makeEmptyExcelJsModule());
    mockFetchError(403);
    const { auDfatAdapter } = await import('../au-dfat.js');
    await expect(auDfatAdapter.fetch()).rejects.toThrow('HTTP 403');
  });

  it('throws when 0 entities parsed from XLSX', async () => {
    vi.doMock('exceljs', () => makeExcelJsModule([
      DFAT_HEADER,
      ['', 'Primary Name', '', '', '', '', '', '2020-01-01', 'DFAT099', ''],
    ]));
    mockFetchOk();
    const { auDfatAdapter } = await import('../au-dfat.js');
    await expect(auDfatAdapter.fetch()).rejects.toThrow('[au_dfat]');
  });
});
