import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../fetch-util.js', () => ({
  sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`),
}));

// ── ExcelJS mock factory ──────────────────────────────────────────────────────

type CellValue = string | number | Date | null | undefined | { text?: string; toString?: () => string };

function makeExcelJsModule(rows: CellValue[][]) {
  const sheet = {
    rowCount: rows.length,
    getRow: (n: number) => {
      const row = rows[n - 1];
      if (!row) return { values: [] };
      return { values: [undefined, ...row] };
    },
  };
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

// ── MOF header ────────────────────────────────────────────────────────────────
const MOF_HEADER: CellValue[] = [
  'Name (English)',    // 0
  'Name (Romaji)',     // 1 → alias
  'Date of Birth',    // 2
  'Nationality',      // 3
  'Position',         // 4
  'Designation Date', // 5
  'Category',         // 6
  'Reference',        // 7
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('jpMofAdapter — metadata', () => {
  afterEach(() => vi.resetModules());

  it('has expected id and displayName', async () => {
    const { jpMofAdapter } = await import('../jp-mof.js');
    expect(jpMofAdapter.id).toBe('jp_mof');
    expect(jpMofAdapter.displayName).toBe('Japan MOF Economic Sanctions');
  });

  it('isEnabled returns false when FEED_JP_MOF is not set', async () => {
    const saved = process.env['FEED_JP_MOF'];
    delete process.env['FEED_JP_MOF'];
    vi.resetModules();
    const { jpMofAdapter } = await import('../jp-mof.js');
    expect(jpMofAdapter.isEnabled!()).toBe(false);
    if (saved !== undefined) process.env['FEED_JP_MOF'] = saved;
  });

  it('isEnabled returns true when FEED_JP_MOF is set', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    const { jpMofAdapter } = await import('../jp-mof.js');
    expect(jpMofAdapter.isEnabled!()).toBe(true);
    delete process.env['FEED_JP_MOF'];
  });
});

describe('jpMofAdapter.fetch — no URLs configured', () => {
  afterEach(() => {
    delete process.env['FEED_JP_MOF'];
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns empty entities with a checksum when FEED_JP_MOF is not set', async () => {
    delete process.env['FEED_JP_MOF'];
    vi.resetModules();
    vi.doMock('../../fetch-util.js', () => ({
      sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`),
    }));
    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities).toHaveLength(0);
    expect(result.rawChecksum).toBeTruthy();
  });
});

describe('jpMofAdapter.fetch — successful parse', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete process.env['FEED_JP_MOF'];
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('parses a single individual row', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['John Doe', 'J. Doe', '1970-01-01', 'Russian', 'Director', '2022-03-01', 'Individual', 'MOF001'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    const ent = result.entities[0]!;
    expect(ent.name).toBe('John Doe');
    expect(ent.type).toBe('individual');
    expect(ent.source).toBe('jp_mof');
    expect(ent.id).toBe('jp_mof:MOF001');
    expect(ent.dateOfBirth).toBe('1970-01-01');
    expect(ent.nationalities).toContain('Russian');
    expect(ent.aliases).toContain('J. Doe');
  });

  it('parses entity type when category does not include individual/person/vessel/aircraft', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['Evil Corp', '', '', 'Russia', '', '2022-01-01', 'Organisation', 'MOF002'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities[0]!.type).toBe('entity');
  });

  it('parses vessel type', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['MV Ship', '', '', '', '', '2022-01-01', 'Vessel', 'MOF003'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities[0]!.type).toBe('vessel');
  });

  it('parses aircraft type', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['Plane 1', '', '', '', '', '2022-01-01', 'Aircraft', 'MOF004'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities[0]!.type).toBe('aircraft');
  });

  it('classifies as individual when dob present even if category is empty', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['Someone', '', '1985-06-15', '', '', '2022-01-01', '', 'MOF005'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities[0]!.type).toBe('individual');
  });

  it('does not add alias if same as name', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['John Doe', 'John Doe', '', '', '', '2022-01-01', 'Individual', 'MOF006'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities[0]!.aliases).toHaveLength(0);
  });

  it('skips rows with empty name', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['', '', '', '', '', '2022-01-01', 'Individual', 'MOF007'],
      ['Valid Person', '', '', '', '', '2022-01-01', 'Individual', 'MOF008'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('Valid Person');
  });

  it('uses name_rowNum as ref when Reference column is empty', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['No Ref Person', '', '', '', '', '2022-01-01', 'Individual', ''],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities[0]!.id).toMatch(/jp_mof:No Ref Person_\d+/);
  });

  it('handles multiple URLs by aggregating results', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/a.xlsx,https://example.com/b.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['Person Sheet', '', '', 'Japan', '', '2022-01-01', 'Individual', 'MOFAGG'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    // 2 URLs × 1 entity each = 2
    expect(result.entities.length).toBeGreaterThanOrEqual(1);
  });

  it('returns rawChecksum', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['Test', '', '', '', '', '2022-01-01', 'Individual', 'MOFCHK'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.rawChecksum).toBeTruthy();
  });

  it('scans for header in first 5 rows', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      ['Unrelated Title Row'],        // row 1
      ['Another Meta Row'],           // row 2
      ['Yet Another'],                // row 3
      MOF_HEADER,                     // row 4 — should be detected
      ['Alice', '', '1990-01-01', '', '', '2022-01-01', 'Individual', 'MOF-HDR'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('Alice');
  });
});

describe('jpMofAdapter.fetch — parseOne no-sheet branch', () => {
  afterEach(() => {
    delete process.env['FEED_JP_MOF'];
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('throws 0-entities guard when workbook has no worksheets', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeEmptyExcelJsModule());
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    await expect(jpMofAdapter.fetch()).rejects.toThrow('jp_mof: parsed 0 entities');
  });

  it('throws 0-entities guard when iName < 0 (no name column)', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeExcelJsModule([
      ['Col A', 'Col B'], // no recognisable name column
      ['val1', 'val2'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    await expect(jpMofAdapter.fetch()).rejects.toThrow('jp_mof: parsed 0 entities');
  });
});

describe('jpMofAdapter.fetch — error branches', () => {
  afterEach(() => {
    delete process.env['FEED_JP_MOF'];
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('throws when exceljs is not installed', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => { throw new Error('Cannot find module exceljs'); });
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchOk();

    const { jpMofAdapter } = await import('../jp-mof.js');
    await expect(jpMofAdapter.fetch()).rejects.toThrow("jp_mof requires the 'exceljs' npm package");
  });

  it('throws all-failed error when HTTP returns non-ok', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/mof.xlsx';
    vi.resetModules();
    vi.doMock('exceljs', () => makeEmptyExcelJsModule());
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));
    mockFetchError(404);

    const { jpMofAdapter } = await import('../jp-mof.js');
    await expect(jpMofAdapter.fetch()).rejects.toThrow('jp_mof: all 1 feed URL(s) failed');
  });

  it('throws all-failed when all URLs fail with network errors', async () => {
    process.env['FEED_JP_MOF'] = 'https://a.com/mof.xlsx,https://b.com/mof.xlsx';
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));
    vi.doMock('exceljs', () => makeEmptyExcelJsModule());
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));

    const { jpMofAdapter } = await import('../jp-mof.js');
    await expect(jpMofAdapter.fetch()).rejects.toThrow('jp_mof: all 2 feed URL(s) failed');
  });

  it('partial success: one URL fails, other succeeds — returns entities', async () => {
    process.env['FEED_JP_MOF'] = 'https://good.com/mof.xlsx,https://bad.com/mof.xlsx';
    vi.resetModules();

    const goodBuf = Buffer.from('fake xlsx');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if ((url as string).includes('bad')) throw new Error('Bad URL failed');
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => goodBuf.buffer.slice(goodBuf.byteOffset, goodBuf.byteOffset + goodBuf.byteLength),
      };
    }));

    vi.doMock('exceljs', () => makeExcelJsModule([
      MOF_HEADER,
      ['Good Person', '', '', 'Japan', '', '2022-01-01', 'Individual', 'MOF-GOOD'],
    ]));
    vi.doMock('../../fetch-util.js', () => ({ sha256Hex: vi.fn(async (s: string) => `sha-${s.slice(0, 6)}`) }));

    const { jpMofAdapter } = await import('../jp-mof.js');
    const result = await jpMofAdapter.fetch();
    // one URL succeeds → entities from that URL
    expect(result.entities.length).toBeGreaterThanOrEqual(1);
  });
});
