/**
 * UK HM Treasury OFSI Consolidated List adapter.
 *
 * Dataset: https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets
 * License: Open Government Licence v3.0
 * Format:  CSV. The OFSI CSV has two header rows (category banner + real
 *          headers). We skip the banner and key on "Group ID" as the
 *          stable primary key — OFSI keeps this stable across revisions.
 *
 * Key columns we use:
 *   Name 6                — surname / entity name
 *   Name 1..5             — forenames / additional name parts
 *   Group Type            — "Individual" | "Entity" | "Ship"
 *   DOB                   — date of birth (individuals)
 *   Nationality           — nationality
 *   Passport Details
 *   Regime
 *   Listed On
 *   Group ID              — stable key
 *
 * Aliases live in separate rows keyed on the same Group ID with a
 * different "Alias Type". We group rows by Group ID and merge names.
 */

import { runBulkIngest, parseCsv } from './base.js';

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i];
    if (r.some(c => /group\s*id/i.test(c))) return i;
  }
  return 0;
}

function col(headers, name) {
  const idx = headers.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  return idx >= 0 ? idx : -1;
}

export function parse(body) {
  const text = body.toString('utf8');
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headerIdx = findHeaderRow(rows);
  const headers = rows[headerIdx];
  const iGroupId = col(headers, 'Group ID');
  const iGroupType = col(headers, 'Group Type');
  const iName1 = col(headers, 'Name 1');
  const iName2 = col(headers, 'Name 2');
  const iName3 = col(headers, 'Name 3');
  const iName4 = col(headers, 'Name 4');
  const iName5 = col(headers, 'Name 5');
  const iName6 = col(headers, 'Name 6');
  const iDob = col(headers, 'DOB');
  const iNat = col(headers, 'Nationality');
  const iPassport = col(headers, 'Passport Details');
  const iRegime = col(headers, 'Regime');
  const iListed = col(headers, 'Listed On');
  const iAliasType = col(headers, 'Alias Type');

  const groups = new Map(); // groupId → merged entity
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (iGroupId < 0 || !r[iGroupId]) continue;
    const groupId = r[iGroupId].trim();
    const nameParts = [r[iName1], r[iName2], r[iName3], r[iName4], r[iName5], r[iName6]]
      .map(x => (x || '').trim())
      .filter(Boolean);
    if (!nameParts.length) continue;
    const fullName = nameParts.join(' ').replace(/\s+/g, ' ').trim();
    const isAlias = iAliasType >= 0 && r[iAliasType] && /aka|alias/i.test(r[iAliasType]);

    if (!groups.has(groupId)) {
      const type = (iGroupType >= 0 ? r[iGroupType] : '').toLowerCase();
      groups.set(groupId, {
        id: `uk-ofsi:${groupId}`,
        source: 'uk-ofsi',
        schema: type.includes('indiv') ? 'Person' : (type.includes('ship') ? 'Vessel' : 'Organization'),
        names: [],
        dob: iDob >= 0 && r[iDob] ? r[iDob].trim() : null,
        countries: iNat >= 0 && r[iNat] ? [r[iNat].trim()] : [],
        identifiers: iPassport >= 0 && r[iPassport] ? [`passport:${r[iPassport].trim()}`] : [],
        programs: iRegime >= 0 && r[iRegime] ? [r[iRegime].trim()] : [],
        topics: ['sanction'],
        first_seen: iListed >= 0 && r[iListed] ? r[iListed].trim() : null,
        last_seen: null,
        raw: { group_id: groupId },
      });
    }
    const ent = groups.get(groupId);
    if (isAlias) {
      if (!ent.names.includes(fullName)) ent.names.push(fullName);
    } else {
      // Primary name goes first; keep it ahead of any alias already added.
      if (!ent.names.includes(fullName)) ent.names.unshift(fullName);
    }
  }
  return [...groups.values()];
}

export async function ingest(ctx) {
  return runBulkIngest(ctx, parse);
}
