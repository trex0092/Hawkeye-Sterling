// Canada — Consolidated Canadian Autonomous Sanctions List (SEMA + JVCFOA).
//
// Global Affairs Canada publishes the consolidated list covering all
// Canadian autonomous sanctions plus UN-derived designations.
// Comparable in scope to OFAC SDN for Canada.
//
// FORMAT CHANGE (2026-06, audit follow-up): GAC retired the legacy CSV at
// /world-monde/assets/csv/sanctions/sema_dnu.csv (now HTTP 404 — the cause
// of ca_osfi "missing from blob storage"). The list is now published as XML:
//   https://www.international.gc.ca/world-monde/assets/office_docs/
//     international_relations-relations_internationales/sanctions/sema-lmes.xml
// (same source URL the OpenSanctions ca_dfatd_sema_sanctions crawler uses).
//
// XML schema: <record> elements with child tags
//   EntityOrShip | GivenName | LastName | DateOfBirthOrShipBuildDate |
//   TitleOrShip | ShipIMONumber | Schedule | Country | Aliases | Item |
//   DateOfListing
// Classification: ShipIMONumber → vessel; GivenName/LastName/DOB → individual;
// otherwise entity.
//
// Override via FEED_CA_OSFI env var if GAC migrates again. The parser
// auto-detects XML vs CSV by leading "<", so a CSV mirror URL keeps working.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';

// `||` (not `??`): an empty FEED_CA_OSFI in a copied .env must not blank the URL.
const SOURCE_URL = process.env['FEED_CA_OSFI']
  || 'https://www.international.gc.ca/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/sema-lmes.xml';

const AUTHORITY_URL = 'https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx';

export const caOsfiAdapter: SourceAdapter = {
  id: 'ca_osfi',
  displayName: 'Canada OSFI Consolidated Sanctions',
  sourceUrl: SOURCE_URL,
  async fetch() {
    const body = await fetchText(SOURCE_URL, { accept: 'application/xml, text/csv;q=0.9, */*;q=0.8' });
    const rawChecksum = await sha256Hex(body);
    const fetchedAt = Date.now();
    const entities = body.trimStart().startsWith('<')
      ? parseXmlRecords(body, fetchedAt)
      : parseCsvRecords(body, fetchedAt);
    if (entities.length === 0) {
      throw new Error(
        `[ca_osfi] parsed 0 entities — refusing to write empty dataset. ` +
        `Check that ${SOURCE_URL} still returns the GAC consolidated sanctions XML (sema-lmes.xml).`,
      );
    }
    console.info(`[ca_osfi] parsed ${entities.length} entities`);
    return { entities, rawChecksum };
  },
};

// ── XML path (current GAC publication format) ────────────────────────────────

function parseXmlRecords(xml: string, fetchedAt: number): NormalisedEntity[] {
  const trimmed = xml.trimStart();
  const looksLikeHtml = /<!DOCTYPE\s+html|<html[\s>]/i.test(trimmed.slice(0, 500));
  const records = Array.from(trimmed.matchAll(/<record(?:\s[^>]*)?>([\s\S]*?)<\/record>/gi), (m) => m[1] ?? '');
  if (looksLikeHtml || records.length === 0) {
    throw new Error(
      `[ca_osfi] response is not the SEMA consolidated XML — got ${trimmed.length} bytes` +
      (looksLikeHtml ? ' (HTML page detected)' : ' (no <record> elements found)') +
      `. The GAC endpoint may have moved again; set FEED_CA_OSFI to the current data URL.`,
    );
  }

  const entities: NormalisedEntity[] = [];
  for (const block of records) {
    const entityOrShip = xmlField(block, 'EntityOrShip');
    const givenName = xmlField(block, 'GivenName');
    const lastName = xmlField(block, 'LastName');
    const imo = xmlField(block, 'ShipIMONumber');
    const dobOrBuild = xmlField(block, 'DateOfBirthOrShipBuildDate');
    const country = xmlField(block, 'Country');
    const schedule = xmlField(block, 'Schedule');
    const item = xmlField(block, 'Item');
    const dateListed = xmlField(block, 'DateOfListing');
    const aliasStr = xmlField(block, 'Aliases');

    const isVessel = Boolean(imo);
    const isIndividual = !isVessel && Boolean(givenName || lastName || dobOrBuild);
    const name = isIndividual
      ? [givenName, lastName].filter(Boolean).join(' ').trim() || entityOrShip
      : entityOrShip || [givenName, lastName].filter(Boolean).join(' ').trim();
    if (!name) continue;

    const t: EntityType = isVessel ? 'vessel' : isIndividual ? 'individual' : 'entity';
    const aliases = aliasStr ? aliasStr.split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [];
    const identifiers: Record<string, string> = {};
    if (imo) identifiers['imo'] = imo;

    entities.push({
      id: `ca_osfi:${item || name}`,
      name,
      aliases,
      type: t,
      nationalities: country ? [country] : [],
      jurisdictions: country ? [country] : [],
      ...(isIndividual && dobOrBuild ? { dateOfBirth: dobOrBuild } : {}),
      identifiers,
      addresses: [],
      listings: [
        mkListing('ca_osfi', {
          program: schedule || undefined,
          reference: item || undefined,
          designatedAt: dateListed || undefined,
          authorityUrl: AUTHORITY_URL,
        }),
      ],
      source: 'ca_osfi',
      fetchedAt,
    });
  }
  return entities;
}

function xmlField(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')); // nosemgrep: detect-non-literal-regexp -- safe: controlled internal value, not user-HTTP-input; no ReDoS risk
  return xmlUnescape((m?.[1] ?? '').trim());
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

// ── CSV path (legacy format — kept for FEED_CA_OSFI mirror overrides) ────────

function parseCsvRecords(csv: string, fetchedAt: number): NormalisedEntity[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error(
      `[ca_osfi] CSV has fewer than 2 rows (got ${rows.length}) — no data to parse. ` +
      `Check that ${SOURCE_URL} still returns the SEMA/OSFI consolidated CSV.`,
    );
  }

  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const idx = (...candidates: string[]): number => {
    for (const c of candidates) {
      const i = header.indexOf(c.toLowerCase());
      if (i >= 0) return i;
    }
    return -1;
  };
  const iCountry = idx('country');
  const iName = idx('name', 'last name, first name', 'entity', 'entity name');
  const iDob = idx('dateofbirth', 'date of birth', 'dob');
  const iAliases = idx('aliases', 'alias');
  const iAddress = idx('address');
  const iCitizenship = idx('citizenship', 'nationality');
  const iPassport = idx('passport');
  const iDateListed = idx('date listed', 'datelisted', 'listed');
  const iSchedule = idx('schedule', 'regulation');
  const iItem = idx('item', 'item number', 'ref');

  const entities: NormalisedEntity[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = iName >= 0 ? (r[iName] ?? '').trim() : '';
    if (!name) continue;
    const item = iItem >= 0 ? (r[iItem] ?? '').trim() : '';
    const country = iCountry >= 0 ? (r[iCountry] ?? '').trim() : '';
    const dob = iDob >= 0 ? (r[iDob] ?? '').trim() : '';
    const citizenship = iCitizenship >= 0 ? (r[iCitizenship] ?? '').trim() : '';
    const passport = iPassport >= 0 ? (r[iPassport] ?? '').trim() : '';
    const dateListed = iDateListed >= 0 ? (r[iDateListed] ?? '').trim() : '';
    const schedule = iSchedule >= 0 ? (r[iSchedule] ?? '').trim() : '';
    const aliases = iAliases >= 0
      ? (r[iAliases] ?? '').split(/[;|]/).map((s) => s.trim()).filter(Boolean)
      : [];
    const identifiers: Record<string, string> = {};
    if (passport) identifiers['passport'] = passport;

    const ent: NormalisedEntity = {
      id: `ca_osfi:${item || name}`,
      name,
      aliases,
      type: nameLooksIndividual(name) ? 'individual' : 'entity',
      nationalities: citizenship ? [citizenship] : country ? [country] : [],
      jurisdictions: country ? [country] : [],
      ...(dob ? { dateOfBirth: dob } : {}),
      identifiers,
      addresses: iAddress >= 0 && r[iAddress] ? [(r[iAddress] ?? '').trim()] : [],
      listings: [
        mkListing('ca_osfi', {
          program: schedule || undefined,
          reference: item || undefined,
          designatedAt: dateListed || undefined,
          authorityUrl: AUTHORITY_URL,
        }),
      ],
      source: 'ca_osfi',
      fetchedAt,
    };
    entities.push(ent);
  }
  return entities;
}

function nameLooksIndividual(name: string): boolean {
  // Canadian OSFI rows alternate between "Last, First" (individuals) and
  // single-token entity names. Comma-separated names → individual.
  return name.includes(',');
}

// Minimal RFC-4180 CSV parser.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    if (inQuotes) {
      if (c === '"' && i + 1 < text.length && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
