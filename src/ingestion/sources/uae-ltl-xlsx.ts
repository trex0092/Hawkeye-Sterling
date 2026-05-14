// UAE Terrorist List — XLSX adapter (Section C1).
//
// The UAE Executive Office for Control and Non-Proliferation publishes the
// UAE Terrorist List as a separate Excel file from the EOCN Local Terrorist
// List. Both live on the IEC portal but have distinct FileIDs.
//
// FileID "UAE Terrorist List (EN)": c2b2f915-da02-4dac-bb9d-0144bd35a07d
//
// Override via FEED_UAE_TL_FILE_ID env var if the portal re-issues the file
// with a new ID (in practice EOCN retains IDs across content revisions).
//
// Column detection mirrors the EOCN adapter — permissive header scanning so
// minor schema drift between UAE TL revisions is handled gracefully.

import type { SourceAdapter, NormalisedEntity, EntityType } from '../types.js';
import { mkListing } from '../types.js';
import { sha256Hex } from '../fetch-util.js';

const BASE = 'https://www.uaeiec.gov.ae/API/Upload/DownloadFile';
const TL_FILE_ID =
  process.env['FEED_UAE_TL_FILE_ID'] ??
  'c2b2f915-da02-4dac-bb9d-0144bd35a07d';
const TL_URL = `${BASE}?FileID=${TL_FILE_ID}`;
const FETCH_TIMEOUT_MS = 20_000;

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
  xlsx: { load(buffer: Buffer): Promise<unknown> };
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
    name:            find('full name', 'name', 'subject'),
    aliases:         find('alias', 'aka', 'alternative name', 'other name'),
    type:            find('type', 'entity type', 'category', 'classification'),
    dob:             find('date of birth', 'dob', 'birth date'),
    passport:        find('passport', 'id number', 'national id'),
    nationality:     find('nationality', 'country'),
    designationDate: find('date of designation', 'designation date', 'date listed', 'listing date'),
    reference:       find('reference', 'serial', 'ref no', 'ref number', 'id'),
  };
}

function rowToEntity(
  row: ExcelJsRow,
  cols: ColumnMap,
  rowIndex: number,
  fetchedAt: number,
): NormalisedEntity | null {
  const values = (row.values ?? []) as unknown[];
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
    id: `uae_ltl:${ref}`,
    name,
    aliases,
    type: t,
    nationalities: nationality ? [nationality] : [],
    jurisdictions: ['AE'],
    ...(dob ? { dateOfBirth: dob } : {}),
    identifiers,
    addresses: [],
    listings: [
      mkListing('uae_ltl', {
        reference: ref,
        designatedAt: designationDate || undefined,
        authorityUrl: 'https://www.uaeiec.gov.ae/en-us/un-page',
      }),
    ],
    source: 'uae_ltl',
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

export const uaeLtlXlsxAdapter: SourceAdapter = {
  id: 'uae_ltl',
  displayName: 'UAE Terrorist List (XLSX)',
  sourceUrl: TL_URL,
  async fetch() {
    const fetchedAt = Date.now();

    let ExcelJS: ExcelJsModule;
    try {
      ExcelJS = (await import('exceljs' as string)) as unknown as ExcelJsModule;
    } catch (err) {
      throw new Error(
        `uae_ltl requires the 'exceljs' npm package — ` +
        `install it with 'npm install exceljs --save' to enable XLSX ` +
        `parsing of the UAE Terrorist List. ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const buf = await fetchXlsxBuffer(TL_URL);
    const rawChecksum = await sha256Hex(buf.toString('base64'));

    // Audit C-01 (parallel to uae_eocn): detect legacy .xls vs .xlsx so the
    // adapter fails loud instead of silently writing 0 entities when
    // uaeiec.gov.ae serves OLE/CFB (D0 CF 11 E0) instead of ZIP (50 4B 03 04).
    const isXlsx = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    const isOleXls = buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
    if (!isXlsx) {
      const magic = Array.from(buf.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
      throw new Error(
        `uae_ltl: upstream returned ${isOleXls ? 'legacy .xls (OLE/CFB)' : `unknown binary format (magic ${magic})`}, ` +
        `but the adapter only parses .xlsx (PK ZIP). Confirm FEED_UAE_TL_FILE_ID points at the .xlsx variant of the list, ` +
        `or use UAE_LTL_SEED_PATH to feed a local JSON seed instead.`,
      );
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.worksheets[0];
    if (!sheet) return { entities: [], rawChecksum };

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
      const row = sheet.getRow(1);
      headers = ((row.values ?? []) as unknown[]).slice(1).map((v) => cellText(v));
    }

    const cols = detectColumns(headers);
    if (cols.name < 0) return { entities: [], rawChecksum };

    const entities: NormalisedEntity[] = [];
    for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const ent = rowToEntity(row, cols, r, fetchedAt);
      if (ent) entities.push(ent);
    }

    return { entities, rawChecksum };
  },
};
