// UAE IEC XLSX adapter factory.
//
// The UAE Executive Office for Control and Non-Proliferation publishes
// two separate XLSX files on the same IEC portal — EOCN Local Terrorist
// List and the broader UAE Terrorist List — distinguished only by a
// FileID query parameter. The original codebase had two near-identical
// adapter modules (uae-eocn-xlsx.ts + uae-ltl-xlsx.ts, ~244 LOC each)
// that duplicated XLSX cell parsing, header detection, format-magic
// validation, and entity normalisation.
//
// This module centralises that logic. Both list-specific adapters now
// resolve to a one-line `makeUaeIecXlsxAdapter(...)` call, eliminating
// ~200 LOC of duplicated parser code while preserving each list's
// independent FileID env override, source URL, and listing metadata.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { sha256Hex } from '../fetch-util.js';

const BASE_DOWNLOAD_URL = 'https://www.uaeiec.gov.ae/API/Upload/DownloadFile';
const FETCH_TIMEOUT_MS = 20_000;
const AUTHORITY_URL = 'https://www.uaeiec.gov.ae/en-us/un-page';

// ── exceljs type stubs (dynamic import — package is opt-in) ──────────────────

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

// ── shared cell + header utilities ───────────────────────────────────────────

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
  listId: string,
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
    id: `${listId}:${ref}`,
    name,
    aliases,
    type: t,
    nationalities: nationality ? [nationality] : [],
    jurisdictions: ['AE'],
    ...(dob ? { dateOfBirth: dob } : {}),
    identifiers,
    addresses: [],
    listings: [
      mkListing(listId, {
        reference: ref,
        designatedAt: designationDate || undefined,
        authorityUrl: AUTHORITY_URL,
      }),
    ],
    source: listId,
    fetchedAt,
  };
}

async function loadSeedFallback(
  listId: string,
  seedPathEnvVar: string,
): Promise<{ entities: NormalisedEntity[]; rawChecksum: string } | null> {
  const seedPath = process.env[seedPathEnvVar];
  if (!seedPath) return null;
  try {
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync(seedPath, 'utf8');
    const entities = JSON.parse(raw) as NormalisedEntity[];
    if (!Array.isArray(entities)) {
      console.warn(`[${listId}] seed at ${seedPath} is not an array — ignoring`);
      return null;
    }
    const rawChecksum = await sha256Hex(`seed:${seedPath}:${entities.length}`);
    console.info(`[${listId}] loaded ${entities.length} entities from seed ${seedPath}`);
    return { entities, rawChecksum };
  } catch (err) {
    console.warn(`[${listId}] seed load failed (${seedPath}): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
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

// ── factory ──────────────────────────────────────────────────────────────────

export interface UaeIecXlsxAdapterConfig {
  /** Internal listId used for entity IDs and listing source attribution. */
  listId: string;
  /** Human-readable name for /api/sanctions/status and logs. */
  displayName: string;
  /** Env var that overrides the default FileID (e.g. FEED_UAE_LTL_FILE_ID). */
  fileIdEnvVar: string;
  /** Default FileID used when the env var is unset. */
  defaultFileId: string;
  /**
   * Env var that points to a local JSON seed file (absolute path) containing
   * a pre-parsed NormalisedEntity array. Used as fallback when the XLSX
   * download or parsing fails. Example: UAE_EOCN_SEED_PATH=/data/eocn.json
   */
  seedPathEnvVar: string;
}

export function makeUaeIecXlsxAdapter(config: UaeIecXlsxAdapterConfig): SourceAdapter {
  const fileId = process.env[config.fileIdEnvVar] ?? config.defaultFileId;
  const sourceUrl = `${BASE_DOWNLOAD_URL}?FileID=${fileId}`;

  return {
    id: config.listId,
    displayName: config.displayName,
    sourceUrl,
    async fetch() {
      const fetchedAt = Date.now();

      // Inner helper so XLSX errors can fall through to seed.
      const tryXlsx = async (): Promise<{ entities: NormalisedEntity[]; rawChecksum: string }> => {
        let ExcelJS: ExcelJsModule;
        try {
          ExcelJS = (await import('exceljs' as string)) as unknown as ExcelJsModule;
        } catch (err) {
          throw new Error(
            `${config.listId} requires the 'exceljs' npm package — install it with 'npm install exceljs --save'. ` +
            `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        const buf = await fetchXlsxBuffer(sourceUrl);
        const rawChecksum = await sha256Hex(buf.toString('base64'));

        // Audit C-01: uaeiec.gov.ae has been observed to serve application/
        // vnd.ms-excel with OLE/CFB magic bytes (D0 CF 11 E0) — that's legacy
        // .xls, not .xlsx (PK ZIP, 50 4B 03 04). exceljs.xlsx.load cannot
        // parse the legacy format and silently produces zero rows. Detect
        // the format up front and fail loud so the alert webhook fires.
        const isXlsx = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
        const isOleXls = buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
        if (!isXlsx) {
          const magic = Array.from(buf.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
          throw new Error(
            `${config.listId}: upstream returned ${isOleXls ? 'legacy .xls (OLE/CFB)' : `unknown binary format (magic ${magic})`}, ` +
            `but the adapter only parses .xlsx (PK ZIP). Confirm ${config.fileIdEnvVar} points at the .xlsx variant of the list, ` +
            `or set ${config.seedPathEnvVar} to a JSON seed file path as a fallback.`,
          );
        }

        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const sheet = wb.worksheets[0];
        if (!sheet) {
          throw new Error(
            `${config.listId}: XLSX workbook has no worksheets. ` +
            `The file at FileID=${fileId} may be empty or corrupt. ` +
            `Set ${config.seedPathEnvVar} to a JSON seed file path as a fallback.`,
          );
        }

        // Locate header row — EOCN/LTL sheets sometimes have title/preamble
        // rows; scan first 5 for one with ≥3 recognisable column names.
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
        if (cols.name < 0) {
          throw new Error(
            `${config.listId}: no 'name' column found in XLSX headers [${headers.slice(0, 10).join(', ')}]. ` +
            `The portal file format may have changed — verify FileID=${fileId} serves the correct list. ` +
            `Set ${config.seedPathEnvVar} to a JSON seed file path as a fallback.`,
          );
        }

        const entities: NormalisedEntity[] = [];
        for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
          const row = sheet.getRow(r);
          const ent = rowToEntity(config.listId, row, cols, r, fetchedAt);
          if (ent) entities.push(ent);
        }

        return { entities, rawChecksum };
      };

      try {
        return await tryXlsx();
      } catch (xlsxErr) {
        // XLSX fetch/parse failed — attempt seed fallback before re-throwing.
        const seed = await loadSeedFallback(config.listId, config.seedPathEnvVar);
        if (seed && seed.entities.length > 0) {
          console.warn(
            `[${config.listId}] XLSX failed (${xlsxErr instanceof Error ? xlsxErr.message : String(xlsxErr)}); ` +
            `using ${seed.entities.length}-entity JSON seed from ${config.seedPathEnvVar}.`,
          );
          return seed;
        }
        // No seed available — re-throw so run-all logs the error and fires
        // the alert webhook. Do NOT write 0-entity blob silently.
        throw xlsxErr;
      }
    },
  };
}
