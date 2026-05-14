// UAE EOCN — Local Terrorist List (XLSX adapter).
//
// The UAE Executive Office for Control and Non-Proliferation publishes
// the Local Terrorist List as an Excel file on the IEC portal. There
// is no public XML/CSV/JSON feed — only the XLSX download. We fetch
// the file by its stable FileID (path: /API/Upload/DownloadFile) and
// parse with exceljs.
//
// FileIDs observed on www.uaeiec.gov.ae/en-us/un-page (2026-05):
//   · LTL Excel (English):     0433bfdb-8a3d-44db-9015-90cbbf48f6f6
//   · UAE Terrorist List (EN): c2b2f915-da02-4dac-bb9d-0144bd35a07d
//   · Identifiers for LTL:     2017e120-bb9f-4e17-ae49-f13984c70a1f
//
// Override the FileID via FEED_UAE_LTL_FILE_ID env var if EOCN
// re-uploads the document with a new ID (they retain the FileID
// across content revisions in practice, but the URL format gives us
// the override knob just in case).
//
// Column detection is permissive: looks for any column header
// containing "name" / "alias" / "designation" / "date" / "passport"
// — adapts to minor schema drift between LTL revisions.

import type { SourceAdapter, NormalisedEntity, EntityType } from '../types.js';
import { mkListing } from '../types.js';
import { sha256Hex } from '../fetch-util.js';

const BASE = 'https://www.uaeiec.gov.ae/API/Upload/DownloadFile';
const LTL_FILE_ID =
  process.env['FEED_UAE_LTL_FILE_ID'] ??
  '0433bfdb-8a3d-44db-9015-90cbbf48f6f6';
const LTL_URL = `${BASE}?FileID=${LTL_FILE_ID}`;
const FETCH_TIMEOUT_MS = 20_000;

// exceljs is dynamic-imported so the adapter degrades to "empty + error
// logged" if the dep isn't present, rather than crashing the entire
// scheduled-function bundle.
interface ExcelJsCellValue {
  text?: string;
  toString?(): string;
}
interface ExcelJsRow {
  values?: Array<unknown>;
  eachCell?(opts: { includeEmpty?: boolean }, callback: (cell: { value: unknown }, colNumber: number) => void): void;
}
interface ExcelJsWorksheet {
  rowCount: number;
  getRow(n: number): ExcelJsRow;
  eachRow?(opts: { includeEmpty?: boolean }, callback: (row: ExcelJsRow, rowNumber: number) => void): void;
}
interface ExcelJsWorkbook {
  worksheets: ExcelJsWorksheet[];
  xlsx: {
    load(buffer: Buffer): Promise<unknown>;
  };
}
interface ExcelJsModule {
  Workbook: new () => ExcelJsWorkbook;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const cv = v as ExcelJsCellValue;
    if (typeof cv.text === 'string') return cv.text.trim();
    if (typeof cv.toString === 'function') {
      const s = cv.toString();
      if (s && s !== '[object Object]') return s.trim();
    }
  }
  return '';
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

interface ColumnMap {
  name: number;
  aliases: number;
  type: number;
  dob: number;
  passport: number;
  nationality: number;
  designationDate: number;
  reference: number;
}

function detectColumns(headers: string[]): ColumnMap {
  const norm = headers.map(normaliseHeader);
  const find = (...needles: string[]): number => {
    for (let i = 0; i < norm.length; i++) {
      for (const needle of needles) {
        if (norm[i]?.includes(needle)) return i;
      }
    }
    return -1;
  };
  return {
    name: find('full name', 'name', 'subject'),
    aliases: find('alias', 'aka', 'alternative name', 'other name'),
    type: find('type', 'entity type', 'category', 'classification'),
    dob: find('date of birth', 'dob', 'birth date'),
    passport: find('passport', 'id number', 'national id'),
    nationality: find('nationality', 'country'),
    designationDate: find('date of designation', 'designation date', 'date listed', 'listing date'),
    reference: find('reference', 'serial', 'ref no', 'ref number', 'id'),
  };
}

function rowToEntity(
  row: ExcelJsRow,
  cols: ColumnMap,
  rowIndex: number,
  fetchedAt: number,
): NormalisedEntity | null {
  const values = (row.values ?? []) as unknown[];
  // exceljs rows have a 1-based values array (index 0 is undefined).
  const at = (col: number): string => (col >= 0 ? cellText(values[col + 1]) : '');

  const name = at(cols.name);
  if (!name) return null;

  const aliasesRaw = at(cols.aliases);
  const aliases = aliasesRaw
    ? aliasesRaw.split(/[;|/]|(?:\sor\s)|(?:\saka\s)/i).map((s) => s.trim()).filter((s) => s && s !== name)
    : [];

  const rawType = at(cols.type).toLowerCase();
  const t: EntityType =
    rawType.includes('individual') || rawType.includes('person') ? 'individual' :
    rawType.includes('vessel') || rawType.includes('ship') ? 'vessel' :
    rawType.includes('aircraft') ? 'aircraft' :
    rawType.includes('entity') || rawType.includes('organi') || rawType.includes('group') || rawType.includes('company') ? 'entity' :
    'unknown';

  const dob = at(cols.dob);
  const passport = at(cols.passport);
  const nationality = at(cols.nationality);
  const designationDate = at(cols.designationDate);
  const ref = at(cols.reference) || String(rowIndex);

  const identifiers: Record<string, string> = {};
  if (passport) identifiers['passport'] = passport;

  return {
    id: `uae_eocn:${ref}`,
    name,
    aliases,
    type: t,
    nationalities: nationality ? [nationality] : [],
    jurisdictions: ['AE'],
    ...(dob ? { dateOfBirth: dob } : {}),
    identifiers,
    addresses: [],
    listings: [
      mkListing('uae_eocn', {
        reference: ref,
        designatedAt: designationDate || undefined,
        authorityUrl: 'https://www.uaeiec.gov.ae/en-us/un-page',
      }),
    ],
    source: 'uae_eocn',
    fetchedAt,
  };
}

async function fetchXlsxBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } finally {
    clearTimeout(t);
  }
}

export const uaeEocnXlsxAdapter: SourceAdapter = {
  id: 'uae_eocn',
  displayName: 'UAE EOCN Local Terrorist List (XLSX)',
  sourceUrl: LTL_URL,
  async fetch() {
    const fetchedAt = Date.now();

    // Dynamic import with `as string` cast so TypeScript does NOT try to
    // resolve 'exceljs' at build time. The package is opt-in: install it
    // via `npm install exceljs --save` to activate this adapter. Without
    // it, the adapter throws a clear error captured by run-all.ts and
    // logged to /api/sanctions/last-errors — never blocks the build.
    let ExcelJS: ExcelJsModule;
    try {
      ExcelJS = (await import('exceljs' as string)) as unknown as ExcelJsModule;
    } catch (err) {
      throw new Error(
        `uae_eocn requires the 'exceljs' npm package — ` +
        `install it with 'npm install exceljs --save' to enable XLSX ` +
        `parsing of the UAE EOCN Local Terrorist List. ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const buf = await fetchXlsxBuffer(LTL_URL);
    const rawChecksum = await sha256Hex(buf.toString('base64'));

    // Audit C-01: the uaeiec.gov.ae endpoint serves application/vnd.ms-excel
    // with OLE/CFB magic bytes (D0 CF 11 E0), i.e. the legacy .xls binary
    // format. `exceljs.xlsx.load` only handles the ZIP-based .xlsx format
    // (50 4B 03 04 magic) so on .xls payloads it silently parses nothing
    // and the adapter writes an empty dataset — the exact silent-failure
    // mode the audit called out. Detect the format up front and throw a
    // clear error if exceljs can't parse it.
    const isXlsx = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    const isOleXls = buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
    if (!isXlsx) {
      const magic = Array.from(buf.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
      throw new Error(
        `uae_eocn: upstream returned ${isOleXls ? 'legacy .xls (OLE/CFB)' : `unknown binary format (magic ${magic})`}, ` +
        `but the adapter only parses .xlsx (PK ZIP). Confirm FEED_UAE_LTL_FILE_ID points at the .xlsx variant of the list, ` +
        `or use UAE_EOCN_SEED_PATH to feed a local JSON seed instead.`,
      );
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.worksheets[0];
    if (!sheet) return { entities: [], rawChecksum };

    // Locate header row. EOCN sheets sometimes have title/preamble rows
    // before the actual header; scan first 5 rows for one with at least
    // 3 recognisable column names.
    let headerRowNum = 1;
    let headers: string[] = [];
    for (let r = 1; r <= Math.min(5, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      const vals = (row.values ?? []) as unknown[];
      const candidate = vals.slice(1).map((v) => cellText(v));
      const recognised = candidate.filter((h) => normaliseHeader(h).match(/name|alias|type|date|passport|nationality|reference/)).length;
      if (recognised >= 3) {
        headerRowNum = r;
        headers = candidate;
        break;
      }
    }
    if (headers.length === 0) {
      // Couldn't find a header — assume row 1.
      const row = sheet.getRow(1);
      headers = ((row.values ?? []) as unknown[]).slice(1).map((v) => cellText(v));
    }

    const cols = detectColumns(headers);
    if (cols.name < 0) {
      // No name column — return empty rather than emit garbage rows.
      return { entities: [], rawChecksum };
    }

    const entities: NormalisedEntity[] = [];
    for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const ent = rowToEntity(row, cols, r, fetchedAt);
      if (ent) entities.push(ent);
    }

    return { entities, rawChecksum };
  },
};
