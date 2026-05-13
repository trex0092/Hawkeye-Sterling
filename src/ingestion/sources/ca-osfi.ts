// Canada — OSFI Consolidated Sanctions List (SEMA + UN regulations).
//
// Office of the Superintendent of Financial Institutions publishes a CSV
// covering all Canadian autonomous sanctions plus UN-derived designations.
// Comparable in scope to OFAC SDN for Canada.
//
// Schema (post-2024 format):
//   Country, Schedule, Item, "Last Name, First Name" or Entity name,
//   DateOfBirth, Place of Birth, Aliases, Title, Address, Citizenship,
//   Passport, Other identifying info, Date Listed, ...
//
// Override via FEED_CA_OSFI env var if OSFI migrates.

import type { SourceAdapter, NormalisedEntity, EntityType } from '../types.js';
import { mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';

const SOURCE_URL = process.env['FEED_CA_OSFI']
  ?? 'https://www.international.gc.ca/world-monde/assets/csv/sanctions/sema_dnu.csv';

export const caOsfiAdapter: SourceAdapter = {
  id: 'ca_osfi',
  displayName: 'Canada OSFI Consolidated Sanctions',
  sourceUrl: SOURCE_URL,
  async fetch() {
    const csv = await fetchText(SOURCE_URL, { accept: 'text/csv' });
    const rawChecksum = await sha256Hex(csv);
    const fetchedAt = Date.now();
    const rows = parseCsv(csv);
    if (rows.length < 2) return { entities: [], rawChecksum };

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
            authorityUrl: 'https://www.international.gc.ca/world-monde/issues_development-enjeux_developpement/responsible_business-entreprise_responsable/sanctions/consolidated-consolide.aspx',
          }),
        ],
        source: 'ca_osfi',
        fetchedAt,
      };
      entities.push(ent);
    }
    return { entities, rawChecksum };
  },
};

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
