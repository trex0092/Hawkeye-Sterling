// Hawkeye Sterling — goAML XML serialiser.
// Converts a GoAmlEnvelope into a report-shaped XML document that the UAE
// FIU's goAML submission portal accepts for STR/SAR/FFR/PNMR/CTR filings.
// This is a clean subset of the goAML schema — covering the fields we can
// populate from our data model. Callers must extend for any custom fields.
//
// The serialiser is pure + deterministic: same envelope always yields the
// same bytes, so the audit chain can hash the output.

import type { GoAmlEnvelope, GoAmlPerson, GoAmlEntity, GoAmlAddress, GoAmlPhone, GoAmlEmail, GoAmlTransaction } from '../brain/goaml-shapes.js';

function escape(v: string | number | undefined): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function el(tag: string, body: string | number | undefined | null): string {
  if (body === undefined || body === null || body === '') return '';
  return `<${tag}>${escape(body as string | number)}</${tag}>`;
}

function wrap(tag: string, inner: string): string {
  if (!inner) return '';
  return `<${tag}>${inner}</${tag}>`;
}

function addressToXml(a: GoAmlAddress): string {
  return wrap('address', [
    el('address_type', a.type),
    el('address', a.line1),
    el('town', a.city),
    el('zip', a.zip),
    el('country_code', a.countryIso2),
  ].join(''));
}

function phoneToXml(p: GoAmlPhone): string {
  return wrap('phone', [
    el('tph_contact_type', p.type),
    el('tph_communication_type', 'V'),
    el('tph_country_prefix', p.countryPrefix),
    el('tph_number', p.number),
  ].join(''));
}

function emailToXml(e: GoAmlEmail): string {
  return wrap('email', [
    el('email_type', e.type),
    el('email', e.address),
  ].join(''));
}

function personToXml(p: GoAmlPerson): string {
  const ids = (p.identification ?? []).map((i) => wrap('t_person_identification', [
    el('type', i.type),
    el('number', i.number),
    el('issue_country', i.issueCountryIso2),
    el('issue_date', i.issueDate),
    el('expiry_date', i.expiryDate),
  ].join('')));
  return [
    el('gender', p.gender),
    el('title', p.title),
    el('first_name', p.firstName),
    el('middle_name', p.middleName),
    el('last_name', p.lastName),
    el('birthdate', p.dateOfBirth),
    el('birth_place', p.placeOfBirth),
    el('nationality1', p.nationality1),
    el('nationality2', p.nationality2),
    el('nationality3', p.nationality3),
    el('residence', p.residenceIso2),
    el('occupation', p.occupation),
    el('employer_name', p.employer),
    (p.addresses ?? []).map(addressToXml).join(''),
    (p.phones ?? []).map(phoneToXml).join(''),
    (p.emails ?? []).map(emailToXml).join(''),
    ids.join(''),
  ].join('');
}

function entityToXml(e: GoAmlEntity): string {
  return [
    el('name', e.legalName),
    el('commercial_name', e.commercialName),
    el('incorporation_legal_form', ''),
    el('incorporation_number', e.registrationNumber),
    el('business', e.businessActivity),
    el('incorporation_country_code', e.incorporationCountryIso2),
    el('incorporation_date', e.incorporationDate),
    el('tax_number', e.taxNumber),
    (e.addresses ?? []).map(addressToXml).join(''),
    (e.phones ?? []).map(phoneToXml).join(''),
    (e.emails ?? []).map(emailToXml).join(''),
    (e.directors ?? []).map((d) => wrap('director', personToXml(d))).join(''),
  ].join('');
}

function transactionToXml(t: GoAmlTransaction): string {
  return wrap('transaction', [
    el('transactionnumber', t.transactionNumber),
    el('date_transaction', t.date),
    el('amount_local', t.amountLocal),
    el('transmode_code', t.type),
    el('amount_foreign', t.amountForeign),
    el('foreign_currency_code', t.currency),
    el('comments', t.comments),
  ].join(''));
}

export function serialiseGoamlXml(env: GoAmlEnvelope): string {
  const head = [
    el('rentity_id', env.rentityId),
    el('rentity_branch', env.rentityBranch),
    el('submission_code', env.submissionCode),
    el('report_code', env.reportCode),
    el('currency_code_local', env.currencyCodeLocal),
    el('reason', env.reason),
    el('action', env.action),
    el('reporting_person', [
      el('first_name', env.reportingPerson.fullName.split(' ').slice(0, -1).join(' ') || env.reportingPerson.fullName),
      el('last_name', env.reportingPerson.fullName.split(' ').slice(-1).join(' ')),
      el('occupation', env.reportingPerson.occupation),
      el('email', env.reportingPerson.email),
    ].join('') ? wrap('reporting_person', [
      el('first_name', env.reportingPerson.fullName.split(' ').slice(0, -1).join(' ') || env.reportingPerson.fullName),
      el('last_name', env.reportingPerson.fullName.split(' ').slice(-1).join(' ')),
      el('occupation', env.reportingPerson.occupation),
      el('email', env.reportingPerson.email),
    ].join('')) : ''),
    el('internal_reference', env.internalReference),
  ].join('');
  const txs = (env.transactions ?? []).map(transactionToXml).join('');
  const persons = (env.involvedPersons ?? []).map((p) => wrap('person_my_client', personToXml(p))).join('');
  const entities = (env.involvedEntities ?? []).map((e) => wrap('entity_my_client', entityToXml(e))).join('');
  const indicators = (env.reportIndicators ?? []).map((id) => el('report_indicators', id)).join('');
  const body = head + txs + persons + entities + indicators;
  const metaAttr = ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<report${metaAttr}>\n${body}\n<!-- charter ${escape(env.charterIntegrityHash)} · generated ${escape(env.generatedAt)} -->\n</report>`;
}

/** Deterministic-order helper: when preparing batch submissions, sort
 *  envelopes by their internalReference so the output is stable for
 *  diff-friendly regression tests. */
export function serialiseBatch(envs: readonly GoAmlEnvelope[]): string {
  const sorted = [...envs].sort((a, b) => a.internalReference.localeCompare(b.internalReference));
  return sorted.map(serialiseGoamlXml).join('\n');
}
