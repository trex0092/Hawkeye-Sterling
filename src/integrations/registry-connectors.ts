// Hawkeye Sterling — corporate-registry connector layer (audit follow-up #13).
//
// Adapter-shaped fetchers for UAE MoE registry, GLEIF (Legal Entity
// Identifier Foundation), and OpenCorporates. Each adapter normalises
// the registry response into the CorporateRegistryRecord shape that
// `bo-graph-builder.ts` consumes. Charter P2: never invent; if a
// registry returns no record, we surface 'not_found' explicitly.
//
// Vendor agreements: production needs API keys / authorisation.
// Until those are in place, callers receive a 'NOT_CONFIGURED'
// outcome (not a fake record) so the upstream chain can degrade
// gracefully without polluting evidence with synthesised data.

import type { CorporateRegistryRecord } from '../brain/bo-graph-builder.js';

export type RegistryProvider = 'uae_moe' | 'gleif' | 'opencorporates';

export interface RegistryQuery {
  provider?: RegistryProvider;
  /** Either name or registrationNumber. At least one required. */
  name?: string;
  registrationNumber?: string;
  jurisdictionIso2?: string;
}

export type RegistryOutcome =
  | { ok: true; provider: RegistryProvider; record: CorporateRegistryRecord; fetchedAt: string }
  | { ok: false; provider: RegistryProvider; reason: 'not_found' | 'not_configured' | 'rate_limited' | 'upstream_error' | 'invalid_query'; detail?: string };

const TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─── UAE MoE registry ───────────────────────────────────────────────────────

async function uaeMoe(q: RegistryQuery): Promise<RegistryOutcome> {
  const baseUrl = process.env['REGISTRY_UAE_MOE_URL'];
  const apiKey = process.env['REGISTRY_UAE_MOE_KEY'];
  if (!baseUrl || !apiKey) {
    return { ok: false, provider: 'uae_moe', reason: 'not_configured', detail: 'REGISTRY_UAE_MOE_URL + REGISTRY_UAE_MOE_KEY required.' };
  }
  if (!q.registrationNumber && !q.name) {
    return { ok: false, provider: 'uae_moe', reason: 'invalid_query', detail: 'name or registrationNumber required.' };
  }
  try {
    const params = new URLSearchParams();
    if (q.registrationNumber) params.set('tradeLicense', q.registrationNumber);
    if (q.name) params.set('legalName', q.name);
    const res = await fetchWithTimeout(`${baseUrl}/v1/companies/search?${params.toString()}`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    });
    if (res.status === 404) return { ok: false, provider: 'uae_moe', reason: 'not_found' };
    if (res.status === 429) return { ok: false, provider: 'uae_moe', reason: 'rate_limited' };
    if (!res.ok) return { ok: false, provider: 'uae_moe', reason: 'upstream_error', detail: `HTTP ${res.status}` };
    const data = (await res.json()) as Record<string, unknown>;
    const record: CorporateRegistryRecord = {
      entityName: String(data['legalName'] ?? data['name'] ?? q.name ?? ''),
      ...(data['tradeLicense'] ? { registrationNumber: String(data['tradeLicense']) } : {}),
      ...(data['incorporationDate'] ? { incorporationDate: String(data['incorporationDate']) } : {}),
      ...(data['address'] ? { registeredAddress: String(data['address']) } : {}),
      jurisdiction: 'AE',
      ...(data['status'] ? { status: String(data['status']) } : {}),
      ...(Array.isArray(data['directors']) ? { directors: data['directors'] as never } : {}),
      ...(Array.isArray(data['beneficialOwners']) ? { beneficialOwners: data['beneficialOwners'] as never } : {}),
    };
    return { ok: true, provider: 'uae_moe', record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { ok: false, provider: 'uae_moe', reason: 'upstream_error', detail: err instanceof Error ? err.message : String(err) };
  }
}

// ─── GLEIF (LEI) ────────────────────────────────────────────────────────────

async function gleif(q: RegistryQuery): Promise<RegistryOutcome> {
  if (!q.registrationNumber && !q.name) {
    return { ok: false, provider: 'gleif', reason: 'invalid_query', detail: 'LEI or name required.' };
  }
  try {
    const url = q.registrationNumber && /^[A-Z0-9]{20}$/.test(q.registrationNumber.toUpperCase())
      ? `https://api.gleif.org/api/v1/lei-records/${q.registrationNumber.toUpperCase()}`
      : `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${encodeURIComponent(q.name ?? '')}`;
    const res = await fetchWithTimeout(url, { headers: { accept: 'application/vnd.api+json' } });
    if (res.status === 404) return { ok: false, provider: 'gleif', reason: 'not_found' };
    if (res.status === 429) return { ok: false, provider: 'gleif', reason: 'rate_limited' };
    if (!res.ok) return { ok: false, provider: 'gleif', reason: 'upstream_error', detail: `HTTP ${res.status}` };
    const json = (await res.json()) as { data?: unknown };
    const data = Array.isArray(json.data) ? (json.data[0] as Record<string, unknown>) : (json.data as Record<string, unknown>);
    if (!data || typeof data !== 'object') return { ok: false, provider: 'gleif', reason: 'not_found' };
    const attrs = (data['attributes'] as Record<string, unknown> | undefined) ?? {};
    const entity = (attrs['entity'] as Record<string, unknown> | undefined) ?? {};
    const legalAddress = (entity['legalAddress'] as Record<string, unknown> | undefined) ?? {};
    const record: CorporateRegistryRecord = {
      entityName: String(entity['legalName'] ?? q.name ?? ''),
      registrationNumber: String(data['id'] ?? attrs['lei'] ?? q.registrationNumber ?? ''),
      ...(legalAddress['country'] ? { jurisdiction: String(legalAddress['country']) } : {}),
      ...(legalAddress['addressLines'] ? { registeredAddress: (legalAddress['addressLines'] as string[]).join(', ') } : {}),
      ...(entity['status'] ? { status: String(entity['status']) } : {}),
    };
    return { ok: true, provider: 'gleif', record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { ok: false, provider: 'gleif', reason: 'upstream_error', detail: err instanceof Error ? err.message : String(err) };
  }
}

// ─── OpenCorporates ─────────────────────────────────────────────────────────

async function openCorporates(q: RegistryQuery): Promise<RegistryOutcome> {
  const apiKey = process.env['REGISTRY_OPENCORP_KEY'];
  if (!apiKey) {
    return { ok: false, provider: 'opencorporates', reason: 'not_configured', detail: 'REGISTRY_OPENCORP_KEY required.' };
  }
  if (!q.name && !q.registrationNumber) return { ok: false, provider: 'opencorporates', reason: 'invalid_query' };
  try {
    const params = new URLSearchParams({ api_token: apiKey });
    if (q.name) params.set('q', q.name);
    if (q.jurisdictionIso2) params.set('jurisdiction_code', q.jurisdictionIso2.toLowerCase());
    const res = await fetchWithTimeout(`https://api.opencorporates.com/v0.4/companies/search?${params.toString()}`);
    if (res.status === 429) return { ok: false, provider: 'opencorporates', reason: 'rate_limited' };
    if (!res.ok) return { ok: false, provider: 'opencorporates', reason: 'upstream_error', detail: `HTTP ${res.status}` };
    const json = (await res.json()) as { results?: { companies?: Array<{ company?: Record<string, unknown> }> } };
    const co = json.results?.companies?.[0]?.company;
    if (!co) return { ok: false, provider: 'opencorporates', reason: 'not_found' };
    const record: CorporateRegistryRecord = {
      entityName: String(co['name'] ?? q.name ?? ''),
      registrationNumber: String(co['company_number'] ?? ''),
      ...(co['incorporation_date'] ? { incorporationDate: String(co['incorporation_date']) } : {}),
      ...(co['registered_address_in_full'] ? { registeredAddress: String(co['registered_address_in_full']) } : {}),
      ...(co['jurisdiction_code'] ? { jurisdiction: String(co['jurisdiction_code']).toUpperCase() } : {}),
      ...(co['current_status'] ? { status: String(co['current_status']) } : {}),
    };
    return { ok: true, provider: 'opencorporates', record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { ok: false, provider: 'opencorporates', reason: 'upstream_error', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Fetch a corporate-registry record. Auto-routes by provider; if no
 *  provider given, tries UAE MoE → GLEIF → OpenCorporates in order
 *  and returns the first successful record. */
export async function fetchRegistryRecord(q: RegistryQuery): Promise<RegistryOutcome> {
  if (q.provider === 'uae_moe') return uaeMoe(q);
  if (q.provider === 'gleif') return gleif(q);
  if (q.provider === 'opencorporates') return openCorporates(q);
  for (const fn of [uaeMoe, gleif, openCorporates]) {
    const out = await fn(q);
    if (out.ok) return out;
  }
  return { ok: false, provider: q.provider ?? 'opencorporates', reason: 'not_found', detail: 'no provider returned a record' };
}
