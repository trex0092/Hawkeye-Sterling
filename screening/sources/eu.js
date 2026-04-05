/**
 * EU Financial Sanctions File (FSF) adapter.
 *
 * Dataset: https://webgate.ec.europa.eu/fsd/fsf/public/rest/v1/sanctionsList/content
 * License: The FSF itself is free for public use but the XML endpoint
 *          historically required an EU login token. This adapter supports
 *          three fetch modes:
 *            1. A publicly accessible mirror configured via
 *               `source.url` — default is the EU REST endpoint.
 *            2. A token-authenticated EU endpoint if
 *               `EU_FSF_TOKEN` env var is set.
 *            3. Falls back to the OpenSanctions `eu_fsf` slice, which
 *               is already ingested via the opensanctions adapter — so
 *               disabling this source by default in config.js is safe.
 *
 * The XML follows namespace `http://eu.europa.ec/fpi/fsd/sanctions`.
 * Root element is <export>. Each <sanctionEntity> has a stable
 * `logicalId` attribute and children `nameAlias`, `birthdate`,
 * `citizenship`, `identification`, `regulation`, `remark`.
 */

import { runBulkIngest, parseXml, findAll, childText, childrenOf } from './base.js';
import { fetchCached } from '../lib/http.js';

function parseEntity(node) {
  const logicalId = node.attrs.logicalId || node.attrs.logical_id;
  if (!logicalId) return null;
  const subjectType = node.children.find(c => c.tag.endsWith('subjectType'))?.attrs?.code
    || childText(node, 'subjectType');
  const isPerson = (subjectType || '').toLowerCase() === 'p'
    || (subjectType || '').toLowerCase() === 'person';

  const names = [];
  for (const a of findAll(node, 'nameAlias')) {
    const whole = a.attrs.wholeName || '';
    if (whole) names.push(whole);
  }

  let dob = null;
  for (const b of findAll(node, 'birthdate')) {
    const bd = b.attrs.birthdate || b.attrs.date || '';
    if (bd) { dob = bd; break; }
  }

  const countries = [];
  for (const c of findAll(node, 'citizenship')) {
    const cc = c.attrs.countryDescription || c.attrs.country || '';
    if (cc) countries.push(cc);
  }

  const identifiers = [];
  for (const i of findAll(node, 'identification')) {
    const num = i.attrs.number || i.attrs.latinNumber || '';
    const type = (i.attrs.identificationTypeDescription || i.attrs.identificationTypeCode || 'id').toLowerCase();
    if (num) identifiers.push(`${type}:${num}`);
  }

  const programs = [];
  for (const r of findAll(node, 'regulation')) {
    const pub = r.attrs.publicationDate || '';
    const title = r.attrs.programme || childText(r, 'programme') || '';
    if (title) programs.push(title);
    if (!programs.length && pub) programs.push(`EU ${pub}`);
  }

  return {
    id: `eu-fsf:${logicalId}`,
    source: 'eu-fsf',
    schema: isPerson ? 'Person' : 'Organization',
    names: names.length ? names : [childText(node, 'wholeName')].filter(Boolean),
    dob,
    countries,
    identifiers,
    programs,
    topics: ['sanction'],
    first_seen: null,
    last_seen: null,
    raw: { logicalId, subjectType },
  };
}

export function parse(body) {
  const root = parseXml(body.toString('utf8'));
  const out = [];
  for (const node of findAll(root, 'sanctionEntity')) {
    const ent = parseEntity(node);
    if (ent && ent.names.length) out.push(ent);
  }
  return out;
}

export async function ingest(ctx) {
  const { source } = ctx;
  if (process.env.EU_FSF_TOKEN) {
    // Caller may override URL via env; keep the source declaration clean.
    source.headers = { ...(source.headers || {}), Authorization: `Bearer ${process.env.EU_FSF_TOKEN}` };
  }
  return runBulkIngest(ctx, parse);
}
