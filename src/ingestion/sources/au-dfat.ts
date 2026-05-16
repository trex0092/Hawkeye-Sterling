// Australia — DFAT Consolidated List (autonomous + UN-derived).
//
// The Department of Foreign Affairs and Trade publishes the consolidated
// sanctions list exclusively as an XLSX file at a stable URL. Same opt-in
// exceljs pattern as the UAE EOCN adapter — install `exceljs` to
// activate.
//
// Schema (post-2022 DFAT format):
//   Name of Listed Item | Name Type | Date of Birth | Place of Birth |
//   Citizenship | Address | Listing Information | Control Date |
//   Reference (UN Ref. No. or DFAT Ref) | Committees | Listing Type
//
// Override URL via FEED_AU_DFAT.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { sha256Hex } from '../fetch-util.js';

const SOURCE_URL = process.env['FEED_AU_DFAT']
  ?? 'https://www.dfat.gov.au/sites/default/files/regulation8_consolidated.xlsx';
const FETCH_TIMEOUT_MS = 20_000;

interface ExcelJsCellValue {
  text?: string;
  toString?(): string;
}
interface ExcelJsRow {
  values?: Array<unknown>;
}
interface ExcelJsWorksheet {
  rowCount: number;
  getRow(n: number): ExcelJsRow;
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
  type: number;
  dob: number;
  pob: number;
  citizenship: number;
  address: number;
  reference: number;
  controlDate: number;
  listing: number;
  committees: number;
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
    name: find('name of listed item', 'name', 'subject'),
    type: find('name type', 'type', 'entity type'),
    dob: find('date of birth', 'dob'),
    pob: find('place of birth', 'pob'),
    citizenship: find('citizenship', 'nationality'),
    address: find('address'),
    reference: find('reference', 'ref', 'un ref'),
    controlDate: find('control date', 'date listed', 'listing date'),
    listing: find('listing information', 'reason', 'narrative'),
    committees: find('committees', 'committee'),
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

export const auDfatAdapter: SourceAdapter = {
  id: 'au_dfat',
  displayName: 'Australia DFAT Consolidated Sanctions',
  sourceUrl: SOURCE_URL,
  async fetch() {
    const fetchedAt = Date.now();

    let ExcelJS: ExcelJsModule;
    try {
      // `as string` cast bypasses TS module resolution — exceljs is opt-in.
      ExcelJS = (await import('exceljs' as string)) as unknown as ExcelJsModule;
    } catch (err) {
      throw new Error(
        `au_dfat requires the 'exceljs' npm package — ` +
        `install it with 'npm install exceljs --save' to enable XLSX ` +
        `parsing of the Australian DFAT Consolidated List. ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const buf = await fetchXlsxBuffer(SOURCE_URL);
    const rawChecksum = await sha256Hex(buf.toString('base64'));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.worksheets[0];
    if (!sheet) return { entities: [], rawChecksum };

    // DFAT puts a title row in row 1 and headers in row 2 — scan first 4.
    let headerRowNum = 1;
    let headers: string[] = [];
    for (let r = 1; r <= Math.min(4, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      const vals = (row.values ?? []) as unknown[];
      const candidate = vals.slice(1).map((v) => cellText(v));
      const recognised = candidate.filter((h) => normaliseHeader(h).match(/name|type|birth|citizen|address|reference|control|committee|listing/)).length;
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

    // DFAT groups individuals with multiple Name Type rows (Primary / aka).
    // Group by reference to merge aliases into the primary entity.
    type Pending = { primary: NormalisedEntity; aliases: string[] };
    const byRef = new Map<string, Pending>();

    for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const values = (row.values ?? []) as unknown[];
      const at = (col: number): string => (col >= 0 ? cellText(values[col + 1]) : '');

      const name = at(cols.name);
      if (!name) continue;
      const nameType = at(cols.type).toLowerCase();
      const ref = at(cols.reference) || `${name}_${r}`;
      const existing = byRef.get(ref);

      if (existing && (nameType.includes('aka') || nameType.includes('alias') || nameType.includes('alternative'))) {
        if (!existing.aliases.includes(name) && name !== existing.primary.name) {
          existing.aliases.push(name);
        }
        continue;
      }
      if (existing) continue;

      const dob = at(cols.dob);
      const pob = at(cols.pob);
      const citizenship = at(cols.citizenship);
      const address = at(cols.address);
      const controlDate = at(cols.controlDate);
      const listingInfo = at(cols.listing);
      const committees = at(cols.committees);

      const isIndividual = !!dob || !!pob || nameType.includes('individual') || nameType.includes('person');
      const t: EntityType = isIndividual ? 'individual' : 'entity';

      const ent: NormalisedEntity = {
        id: `au_dfat:${ref}`,
        name,
        aliases: [],
        type: t,
        nationalities: citizenship ? [citizenship] : [],
        jurisdictions: citizenship ? [citizenship] : [],
        ...(dob ? { dateOfBirth: dob } : {}),
        identifiers: {},
        addresses: address ? [address] : [],
        listings: [
          mkListing('au_dfat', {
            program: committees || undefined,
            reference: ref,
            designatedAt: controlDate || undefined,
            reason: listingInfo || undefined,
            authorityUrl: 'https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list',
          }),
        ],
        source: 'au_dfat',
        fetchedAt,
      };
      byRef.set(ref, { primary: ent, aliases: [] });
    }

    const entities: NormalisedEntity[] = [];
    for (const { primary, aliases } of byRef.values()) {
      primary.aliases = aliases;
      entities.push(primary);
    }
    return { entities, rawChecksum };
  },
};
