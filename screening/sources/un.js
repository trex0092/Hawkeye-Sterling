/**
 * UN Security Council Consolidated List adapter.
 *
 * Dataset: https://scsanctions.un.org/resources/xml/en/consolidated.xml
 * License: Public domain (United Nations).
 * Format:  XML with top-level <INDIVIDUALS> and <ENTITIES>, each child
 *          holding <FIRST_NAME>, <SECOND_NAME>, <THIRD_NAME>, <FOURTH_NAME>,
 *          <UN_LIST_TYPE>, <REFERENCE_NUMBER>, <LISTED_ON>, <INDIVIDUAL_ALIAS>,
 *          <NATIONALITY>, <INDIVIDUAL_DATE_OF_BIRTH>, <INDIVIDUAL_PLACE_OF_BIRTH>,
 *          <INDIVIDUAL_DOCUMENT>, <COMMENTS1>, <DESIGNATION>, ...
 *
 * Each entry's stable key is REFERENCE_NUMBER (e.g. "QDi.001"). The
 * LIST_TYPE prefix (QD=Al-Qaida, IQ=Iraq, KP=DPRK, etc.) tells us which
 * UN sanctions regime applies; we surface it in `programs`.
 */

import { runBulkIngest, parseXml, findAll, childText, childrenOf } from './base.js';

function joinName(parts) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function parseIndividual(node) {
  const ref = childText(node, 'REFERENCE_NUMBER');
  if (!ref) return null;
  const names = [joinName([
    childText(node, 'FIRST_NAME'),
    childText(node, 'SECOND_NAME'),
    childText(node, 'THIRD_NAME'),
    childText(node, 'FOURTH_NAME'),
  ])];
  for (const a of childrenOf(node, 'INDIVIDUAL_ALIAS')) {
    const alias = childText(a, 'ALIAS_NAME');
    if (alias) names.push(alias);
  }
  const nats = childrenOf(node, 'NATIONALITY').flatMap(n => childrenOf(n, 'VALUE').map(v => v.text));
  const dobNodes = childrenOf(node, 'INDIVIDUAL_DATE_OF_BIRTH');
  let dob = null;
  for (const d of dobNodes) {
    const date = childText(d, 'DATE') || childText(d, 'YEAR');
    if (date) { dob = date; break; }
  }
  const idDocs = [];
  for (const d of childrenOf(node, 'INDIVIDUAL_DOCUMENT')) {
    const type = childText(d, 'TYPE_OF_DOCUMENT');
    const num = childText(d, 'NUMBER');
    if (num) idDocs.push(`${(type || 'document').toLowerCase()}:${num}`);
  }
  const listType = childText(node, 'UN_LIST_TYPE');
  const listedOn = childText(node, 'LISTED_ON');
  return {
    id: `un:${ref}`,
    source: 'un-consolidated',
    schema: 'Person',
    names: names.filter(Boolean),
    dob,
    countries: nats.filter(Boolean),
    identifiers: idDocs,
    programs: listType ? [listType] : [],
    topics: ['sanction'],
    first_seen: listedOn || null,
    last_seen: null,
    raw: {
      reference: ref,
      comments: childText(node, 'COMMENTS1'),
      designation: childText(node, 'DESIGNATION'),
    },
  };
}

function parseEntity(node) {
  const ref = childText(node, 'REFERENCE_NUMBER');
  if (!ref) return null;
  const names = [childText(node, 'FIRST_NAME')];
  for (const a of childrenOf(node, 'ENTITY_ALIAS')) {
    const alias = childText(a, 'ALIAS_NAME');
    if (alias) names.push(alias);
  }
  const addresses = childrenOf(node, 'ENTITY_ADDRESS').map(a => childText(a, 'COUNTRY')).filter(Boolean);
  const listType = childText(node, 'UN_LIST_TYPE');
  const listedOn = childText(node, 'LISTED_ON');
  return {
    id: `un:${ref}`,
    source: 'un-consolidated',
    schema: 'Organization',
    names: names.filter(Boolean),
    dob: null,
    countries: addresses,
    identifiers: [],
    programs: listType ? [listType] : [],
    topics: ['sanction'],
    first_seen: listedOn || null,
    last_seen: null,
    raw: {
      reference: ref,
      comments: childText(node, 'COMMENTS1'),
    },
  };
}

export function parse(body) {
  const root = parseXml(body.toString('utf8'));
  const out = [];
  for (const node of findAll(root, 'INDIVIDUAL')) {
    const ent = parseIndividual(node);
    if (ent) out.push(ent);
  }
  for (const node of findAll(root, 'ENTITY')) {
    const ent = parseEntity(node);
    if (ent) out.push(ent);
  }
  return out;
}

export async function ingest(ctx) {
  return runBulkIngest(ctx, parse);
}
