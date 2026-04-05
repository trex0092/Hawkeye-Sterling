/**
 * OFAC Specially Designated Nationals (SDN) list adapter.
 *
 * Dataset:   https://sanctionslist.ofac.treas.gov/Home/SdnList
 * License:   Public domain (US Government work).
 * Format:    sdn.csv — no header row. Documented at
 *            https://home.treasury.gov/system/files/126/dat_spec.txt
 *
 * Columns:
 *   1  ent_num       entity number (primary key)
 *   2  SDN_Name      canonical name
 *   3  SDN_Type      "individual" | "entity" | "aircraft" | "vessel"
 *   4  Program       sanctions program (multi; separated by "; ")
 *   5  Title
 *   6  Call_Sign
 *   7  Vess_type
 *   8  Tonnage
 *   9  GRT
 *  10  Vess_flag
 *  11  Vess_owner
 *  12  Remarks       free-text; often contains DOB/POB/passport info
 *
 * A separate alt.csv file holds aliases, keyed on ent_num. We fetch
 * and merge it so alias hits work as well as primary-name hits.
 */

import { runBulkIngest, parseCsv } from './base.js';
import { fetchCached } from '../lib/http.js';

const SDN_COLUMNS = 12;

function parseSdnRows(text) {
  const rows = parseCsv(text);
  const out = [];
  for (const r of rows) {
    if (r.length < 4) continue;
    const [entNum, name, type, program, title, , , , , , , remarks] = [
      r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11],
    ];
    if (!entNum || !name) continue;
    out.push({
      ent_num: entNum.trim(),
      name: name.replace(/^"|"$/g, '').trim(),
      type: (type || '').trim().toLowerCase(),
      program: (program || '').trim(),
      title: (title || '').trim(),
      remarks: (remarks || '').trim(),
    });
  }
  return out;
}

function parseAltRows(text) {
  const rows = parseCsv(text);
  const byEnt = new Map();
  for (const r of rows) {
    if (r.length < 4) continue;
    const entNum = r[0]?.trim();
    const altName = r[3]?.replace(/^"|"$/g, '').trim();
    if (!entNum || !altName) continue;
    if (!byEnt.has(entNum)) byEnt.set(entNum, []);
    byEnt.get(entNum).push(altName);
  }
  return byEnt;
}

function schemaFromType(t) {
  switch (t) {
    case 'individual': return 'Person';
    case 'entity':     return 'Organization';
    case 'vessel':     return 'Vessel';
    case 'aircraft':   return 'Aircraft';
    default:           return 'Thing';
  }
}

// Remarks field holds semi-structured metadata like
// "DOB 12 Mar 1965; POB Tehran, Iran; nationality Iran; Passport A1234567 (Iran)".
const DOB_RE = /DOB\s+([0-9]{1,2}\s+\w+\s+[0-9]{4}|[0-9]{4}(?:-[0-9]{2}){0,2})/i;
const NATIONALITY_RE = /nationality\s+([A-Z][A-Za-z ,]+?)(?:;|$)/i;
const PASSPORT_RE = /Passport\s+([A-Z0-9\-]+)/gi;

function monthIndex(name) {
  const m = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  return m[name.slice(0, 3).toLowerCase()];
}

function parseRemarkDob(remarks) {
  const m = DOB_RE.exec(remarks);
  if (!m) return null;
  const val = m[1];
  if (/^\d{4}(-\d{2}){0,2}$/.test(val)) return val;
  const parts = val.split(/\s+/);
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0');
    const mo = monthIndex(parts[1]);
    if (mo == null) return null;
    return `${parts[2]}-${String(mo + 1).padStart(2, '0')}-${d}`;
  }
  return null;
}

function parseRemarkCountries(remarks) {
  const m = NATIONALITY_RE.exec(remarks);
  if (!m) return [];
  return m[1].split(',').map(s => s.trim()).filter(Boolean);
}

function parseRemarkPassports(remarks) {
  const out = [];
  let m;
  while ((m = PASSPORT_RE.exec(remarks)) !== null) out.push(`passport:${m[1]}`);
  return out;
}

export async function ingest(ctx) {
  const { source, cacheDir, maxAgeMs, logger } = ctx;

  // Fetch the alias file alongside the main SDN file. It shares caching.
  const aliasUrl = source.aliasUrl;
  const altPromise = aliasUrl
    ? fetchCached(aliasUrl, { cacheDir, maxAgeMs }).catch(err => {
        logger?.(`[${source.id}] alt.csv fetch failed: ${err.message}`);
        return null;
      })
    : Promise.resolve(null);

  return runBulkIngest(ctx, async (body) => {
    const text = body.toString('utf8');
    const main = parseSdnRows(text);
    const altRes = await altPromise;
    const aliases = altRes ? parseAltRows(altRes.body.toString('utf8')) : new Map();

    const out = [];
    for (const row of main) {
      const dob = parseRemarkDob(row.remarks);
      const countries = parseRemarkCountries(row.remarks);
      const passports = parseRemarkPassports(row.remarks);
      const names = [row.name, ...(aliases.get(row.ent_num) || [])];
      out.push({
        id: `ofac-sdn:${row.ent_num}`,
        source: 'ofac-sdn',
        schema: schemaFromType(row.type),
        names,
        dob,
        countries,
        identifiers: passports,
        programs: row.program ? row.program.split(';').map(s => s.trim()).filter(Boolean) : [],
        topics: ['sanction'],
        first_seen: null,
        last_seen: null,
        raw: { title: row.title, remarks: row.remarks, type: row.type },
      });
    }
    return out;
  });
}
