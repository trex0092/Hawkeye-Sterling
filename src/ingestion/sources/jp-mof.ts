// Japan — MOF (Ministry of Finance) Economic Sanctions Lists.
//
// Japan's MOF publishes sanctions targets under the Foreign Exchange and
// Foreign Trade Act per-country (Iran / North Korea / Russia / etc.) as
// Excel and PDF files at https://www.mof.go.jp/policy/international_policy/
// gaitame_kawase/gaitame/economic_sanctions/list.html — there is no single
// canonical consolidated URL.
//
// This adapter accepts one or more comma-separated FEED_JP_MOF URLs (XLSX
// only) and aggregates the rows. If no URL is supplied via env, the
// adapter returns empty without error so deployments without a JP MOF
// subscription don't break the pipeline.
//
// Same opt-in exceljs pattern as au_dfat and uae_eocn.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { sha256Hex } from '../fetch-util.js';

const FETCH_TIMEOUT_MS = 20_000;

function resolveUrls(): string[] {
  const raw = process.env['FEED_JP_MOF'];
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

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

async function parseOne(
  url: string,
  ExcelJS: ExcelJsModule,
  fetchedAt: number,
): Promise<NormalisedEntity[]> {
  const buf = await fetchXlsxBuffer(url);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];

  // Scan first 5 rows for header. MOF's English exports use headers like
  // "Name (English)", "Name (Romaji)", "Date of Birth", "Place of Birth",
  // "Nationality", "Position", "Designation Date".
  let headerRowNum = 1;
  let headers: string[] = [];
  for (let r = 1; r <= Math.min(5, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    const vals = (row.values ?? []) as unknown[];
    const candidate = vals.slice(1).map((v) => cellText(v));
    const recognised = candidate.filter((h) => normaliseHeader(h).match(/name|birth|nationality|position|designation|country|category/)).length;
    if (recognised >= 2) {
      headerRowNum = r;
      headers = candidate;
      break;
    }
  }
  if (headers.length === 0) {
    const row = sheet.getRow(1);
    headers = ((row.values ?? []) as unknown[]).slice(1).map((v) => cellText(v));
  }

  const norm = headers.map(normaliseHeader);
  const find = (...needles: string[]): number => {
    for (let i = 0; i < norm.length; i++) {
      for (const needle of needles) {
        if (norm[i]?.includes(needle)) return i;
      }
    }
    return -1;
  };
  const iName = find('name english', 'name', 'subject');
  const iAlias = find('name romaji', 'alias', 'aka', 'other name');
  const iDob = find('date of birth', 'dob');
  const iNationality = find('nationality', 'citizenship', 'country');
  const iPosition = find('position', 'title');
  const iDesignationDate = find('designation date', 'date listed');
  const iCategory = find('category', 'classification', 'type');
  const iRef = find('reference', 'id', 'no');

  if (iName < 0) return [];

  const out: NormalisedEntity[] = [];
  for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values = (row.values ?? []) as unknown[];
    const at = (col: number): string => (col >= 0 ? cellText(values[col + 1]) : '');

    const name = at(iName);
    if (!name) continue;
    const alias = at(iAlias);
    const aliases = alias && alias !== name ? [alias] : [];

    const dob = at(iDob);
    const nationality = at(iNationality);
    const position = at(iPosition);
    const designationDate = at(iDesignationDate);
    const category = at(iCategory).toLowerCase();
    const ref = at(iRef) || `${name}_${r}`;

    const t: EntityType =
      category.includes('individual') || category.includes('person') || !!dob ? 'individual' :
      category.includes('vessel') || category.includes('ship') ? 'vessel' :
      category.includes('aircraft') ? 'aircraft' :
      'entity';

    out.push({
      id: `jp_mof:${ref}`,
      name,
      aliases,
      type: t,
      nationalities: nationality ? [nationality] : [],
      jurisdictions: nationality ? [nationality] : [],
      ...(dob ? { dateOfBirth: dob } : {}),
      identifiers: {},
      addresses: [],
      listings: [
        mkListing('jp_mof', {
          reference: ref,
          designatedAt: designationDate || undefined,
          reason: position || undefined,
          authorityUrl: 'https://www.mof.go.jp/policy/international_policy/gaitame_kawase/gaitame/economic_sanctions/list.html',
        }),
      ],
      source: 'jp_mof',
      fetchedAt,
    });
  }
  return out;
}

export const jpMofAdapter: SourceAdapter = {
  id: 'jp_mof',
  displayName: 'Japan MOF Economic Sanctions',
  sourceUrl: 'https://www.mof.go.jp/policy/international_policy/gaitame_kawase/gaitame/economic_sanctions/list.html',
  // Dormant until FEED_JP_MOF is set. run-all.ts skips disabled adapters
  // entirely so no 0-entity blob is written when the env var is absent.
  isEnabled: () => Boolean(process.env['FEED_JP_MOF']),
  async fetch() {
    const fetchedAt = Date.now();
    const urls = resolveUrls();
    if (urls.length === 0) {
      // Guard: isEnabled() should prevent reaching here, but be safe.
      return { entities: [], rawChecksum: await sha256Hex('jp_mof:no-urls-configured') };
    }

    let ExcelJS: ExcelJsModule;
    try {
      ExcelJS = (await import('exceljs' as string)) as unknown as ExcelJsModule;
    } catch (err) {
      throw new Error(
        `jp_mof requires the 'exceljs' npm package — ` +
        `install it with 'npm install exceljs --save' to enable XLSX ` +
        `parsing of the Japanese MOF sanctions lists. ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const all: NormalisedEntity[] = [];
    const errors: string[] = [];
    for (const url of urls) {
      try {
        const rows = await parseOne(url, ExcelJS, fetchedAt);
        all.push(...rows);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${url}: ${msg}`);
      }
    }
    if (errors.length > 0 && all.length === 0) {
      throw new Error(`jp_mof: all ${urls.length} feed URL(s) failed — ${errors.join('; ')}`);
    }
    const rawChecksum = await sha256Hex(JSON.stringify({ urls, count: all.length }));
    return { entities: all, rawChecksum };
  },
};
