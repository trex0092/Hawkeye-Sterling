/**
 * OpenSanctions "default" dataset adapter.
 *
 * Dataset:   https://www.opensanctions.org/datasets/default/
 * License:   CC-BY 4.0 — free for commercial use with attribution.
 * Format:    targets.simple.csv — one row per canonical target with
 *            semicolon-separated multi-value fields.
 *
 * Columns (as of 2025):
 *   id, schema, name, aliases, birth_date, countries, addresses,
 *   identifiers, sanctions, phones, emails, dataset, last_seen,
 *   first_seen, last_change
 *
 * `dataset` is the underlying source list(s) OpenSanctions derived this
 * record from (e.g. "us_ofac_sdn;gb_hmt_sanctions"). It lets us route
 * back to publisher attribution and — more importantly — identifies PEP
 * records via `eu_cor_members`, `wd_peps`, `un_sc_sanctions`, etc.
 *
 * We classify each target into topics so the matcher can tell a sanctions
 * hit from a PEP hit from a wanted-by-Interpol hit:
 *   - any sanctions.* collection → topic "sanction"
 *   - any peps.* / *_pep*        → topic "pep"
 *   - any crime.* / wanted.*     → topic "crime"
 *   - debarment.*                → topic "debarment"
 */

import { runBulkIngest, csvToObjects } from './base.js';

function splitMulti(v) {
  if (!v) return [];
  return v.split(';').map(s => s.trim()).filter(Boolean);
}

function classifyTopics(datasets) {
  const topics = new Set();
  for (const d of datasets) {
    const low = d.toLowerCase();
    if (low.includes('sanction') || /^(us_ofac|eu_fsf|gb_hmt|ch_seco|un_sc|au_dfat|ca_dfatd)/.test(low)) topics.add('sanction');
    if (low.includes('pep') || low.includes('wd_peps') || low.includes('everypolitician')) topics.add('pep');
    if (low.includes('interpol') || low.includes('wanted') || low.includes('crime')) topics.add('crime');
    if (low.includes('debar')) topics.add('debarment');
    if (low.includes('export_controls') || low.includes('bis_')) topics.add('export-control');
  }
  if (!topics.size) topics.add('other');
  return [...topics];
}

export function parse(body) {
  const text = body.toString('utf8');
  const rows = csvToObjects(text);
  const out = [];
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    const datasets = splitMulti(r.dataset);
    const names = [r.name, ...splitMulti(r.aliases)];
    const countries = splitMulti(r.countries);
    const identifiers = [
      ...splitMulti(r.identifiers),
      ...splitMulti(r.passport || ''),
    ];
    const programs = splitMulti(r.sanctions);
    const topics = classifyTopics(datasets);
    out.push({
      id: `opensanctions:${r.id}`,
      source: 'opensanctions-default',
      schema: r.schema || 'Thing',
      names,
      dob: r.birth_date || null,
      countries,
      identifiers,
      programs,
      topics,
      first_seen: r.first_seen || null,
      last_seen: r.last_seen || null,
      raw: {
        dataset: datasets,
        addresses: splitMulti(r.addresses),
        phones: splitMulti(r.phones),
        emails: splitMulti(r.emails),
        last_change: r.last_change || null,
      },
    });
  }
  return out;
}

export async function ingest(ctx) {
  return runBulkIngest(ctx, parse);
}
