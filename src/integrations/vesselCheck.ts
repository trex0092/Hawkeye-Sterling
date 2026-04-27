// Hawkeye Sterling — Vessel / maritime sanctions screening client.
// Wraps the vessel-check-api (github.com/alexboia/vessel-check-api) or
// any compatible REST endpoint that resolves IMO numbers to sanctions and
// ownership information.
//
// Env vars:
//   VESSEL_CHECK_URL     — base URL of the vessel-check service (required)
//   VESSEL_CHECK_API_KEY — API key (optional)

import { fetchJsonWithRetry } from './httpRetry.js';

declare const process: { env?: Record<string, string | undefined> } | undefined;

function env(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env?.[key] : undefined;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface VesselOwner {
  name: string;
  role: 'registered-owner' | 'operator' | 'manager' | 'beneficial-owner' | string;
  country?: string;
  lei?: string;
}

export interface VesselSanctionHit {
  list: string;           // e.g. "OFAC SDN", "EU Consolidated", "UN Sanctions"
  entryId?: string;
  reason?: string;
  listedAt?: string;      // ISO date
}

export interface VesselRecord {
  imoNumber: string;
  vesselName: string;
  flag?: string;           // ISO 3166-1 alpha-3 country code
  type?: string;           // cargo, tanker, bulk carrier, etc.
  grossTonnage?: number;
  yearBuilt?: number;
  callSign?: string;
  mmsi?: string;
  owners: VesselOwner[];
  sanctionHits: VesselSanctionHit[];
  lastUpdated?: string;    // ISO timestamp
}

export interface VesselCheckResult {
  ok: boolean;
  imoNumber: string;
  vessel?: VesselRecord;
  sanctioned: boolean;
  riskLevel: 'clean' | 'elevated' | 'high' | 'blocked';
  riskDetail: string;
  error?: string;
}

export interface VesselCheckOptions {
  endpoint?: string;
  apiKey?: string;
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Raw API response shapes (permissive — we normalise into typed output)
// ---------------------------------------------------------------------------

interface RawVesselApiResponse {
  imo?: string;
  name?: string;
  vessel_name?: string;
  flag?: string;
  type?: string;
  vessel_type?: string;
  gross_tonnage?: number;
  grt?: number;
  year_built?: number;
  built?: number;
  call_sign?: string;
  mmsi?: string;
  owners?: Array<{
    name?: string;
    role?: string;
    country?: string;
    lei?: string;
  }>;
  sanctions?: Array<{
    list?: string;
    id?: string;
    reason?: string;
    listed_at?: string;
    date?: string;
  }>;
  last_updated?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function checkVessel(
  imoNumber: string,
  options: VesselCheckOptions = {},
): Promise<VesselCheckResult> {
  const baseUrl = options.endpoint ?? env('VESSEL_CHECK_URL');
  const apiKey = options.apiKey ?? env('VESSEL_CHECK_API_KEY');

  if (!baseUrl) {
    return {
      ok: false, imoNumber, sanctioned: false, riskLevel: 'clean',
      riskDetail: 'VESSEL_CHECK_URL not configured',
      error: 'VESSEL_CHECK_URL not configured',
    };
  }

  const normalised = imoNumber.toUpperCase().replace(/^IMO\s*/i, '');
  const url = `${baseUrl.replace(/\/$/, '')}/api/vessel/${encodeURIComponent(normalised)}`;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const result = await fetchJsonWithRetry<RawVesselApiResponse>(
    url,
    { method: 'GET', headers },
    { perAttemptMs: options.timeoutMs ?? 12_000, maxAttempts: 2 },
  );

  if (!result.ok || !result.json) {
    const notFound = result.status === 404;
    return {
      ok: false, imoNumber: normalised, sanctioned: false,
      riskLevel: 'clean',
      riskDetail: notFound ? `IMO ${normalised} not found in vessel registry` : `Vessel lookup failed`,
      error: result.error ?? `HTTP ${result.status ?? 'unknown'}`,
    };
  }

  const raw = result.json;

  const owners: VesselOwner[] = (raw.owners ?? []).map((o) => ({
    name: o.name ?? '',
    role: o.role ?? 'registered-owner',
    ...(o.country !== undefined ? { country: o.country } : {}),
    ...(o.lei !== undefined ? { lei: o.lei } : {}),
  }));

  const sanctionHits: VesselSanctionHit[] = (raw.sanctions ?? []).map((s) => ({
    list: s.list ?? 'unknown',
    ...(s.id !== undefined ? { entryId: s.id } : {}),
    ...(s.reason !== undefined ? { reason: s.reason } : {}),
    ...(s.listed_at ?? s.date ? { listedAt: s.listed_at ?? s.date } : {}),
  }));

  const vessel: VesselRecord = {
    imoNumber: normalised,
    vesselName: raw.name ?? raw.vessel_name ?? normalised,
    ...(raw.flag !== undefined ? { flag: raw.flag } : {}),
    ...(raw.type ?? raw.vessel_type ? { type: raw.type ?? raw.vessel_type } : {}),
    ...(raw.gross_tonnage ?? raw.grt ? { grossTonnage: raw.gross_tonnage ?? raw.grt } : {}),
    ...(raw.year_built ?? raw.built ? { yearBuilt: raw.year_built ?? raw.built } : {}),
    ...(raw.call_sign !== undefined ? { callSign: raw.call_sign } : {}),
    ...(raw.mmsi !== undefined ? { mmsi: raw.mmsi } : {}),
    owners,
    sanctionHits,
    ...(raw.last_updated ?? raw.updated_at ? { lastUpdated: raw.last_updated ?? raw.updated_at } : {}),
  };

  const sanctioned = sanctionHits.length > 0;
  const riskLevel = sanctioned
    ? sanctionHits.some((h) => h.list.toLowerCase().includes('ofac') || h.list.toLowerCase().includes('un'))
      ? 'blocked'
      : 'high'
    : 'clean';

  const riskDetail = sanctioned
    ? `${sanctionHits.length} sanction hit(s): ${sanctionHits.map((h) => h.list).join(', ')}`
    : `No sanctions found for IMO ${normalised} (${vessel.vesselName})`;

  return { ok: true, imoNumber: normalised, vessel, sanctioned, riskLevel, riskDetail };
}

// ---------------------------------------------------------------------------
// Batch screening helper
// ---------------------------------------------------------------------------

export interface VesselBatchResult {
  total: number;
  blocked: number;
  high: number;
  results: VesselCheckResult[];
}

export async function screenVessels(
  imoNumbers: string[],
  options: VesselCheckOptions = {},
): Promise<VesselBatchResult> {
  const results = await Promise.all(imoNumbers.map((imo) => checkVessel(imo, options)));
  return {
    total: results.length,
    blocked: results.filter((r) => r.riskLevel === 'blocked').length,
    high: results.filter((r) => r.riskLevel === 'high').length,
    results: results.sort((a, b) => {
      const order: Record<string, number> = { blocked: 0, high: 1, elevated: 2, clean: 3 };
      return (order[a.riskLevel] ?? 3) - (order[b.riskLevel] ?? 3);
    }),
  };
}
