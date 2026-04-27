// Hawkeye Sterling — GLEIF LEI REST API client.
// Global Legal Entity Identifier Foundation public API (no auth required).
// Implements depth-limited beneficial ownership chain traversal:
// LEI → parent LEI → ultimate parent LEI → ...
//
// API docs: https://www.gleif.org/en/lei-data/gleif-api
// Rate limit: ~60 req/min unauthenticated (sufficient for compliance lookups).

import { fetchJsonWithRetry } from './httpRetry.js';

const GLEIF_BASE = 'https://api.gleif.org/api/v1';

export interface LeiRecord {
  lei: string;
  legalName: string;
  jurisdiction: string;
  legalForm?: string;
  registrationStatus: string;
  registeredAddress?: {
    addressLines: string[];
    city: string;
    country: string;
    postalCode?: string;
  };
  directParentLei?: string;
  ultimateParentLei?: string;
  managingLou?: string;
  lastUpdated?: string;
}

export interface OwnershipChainNode {
  lei: string;
  legalName: string;
  jurisdiction: string;
  registrationStatus: string;
  depth: number;
  relationshipType?: 'direct' | 'ultimate' | 'root';
}

export interface GleifLookupResult {
  ok: boolean;
  lei: string;
  record?: LeiRecord;
  ownershipChain: OwnershipChainNode[];
  error?: string;
}

interface GleifApiEntity {
  attributes?: {
    lei?: string;
    entity?: {
      legalName?: { name?: string };
      jurisdiction?: string;
      legalForm?: { id?: string };
      status?: string;
      registeredAddress?: {
        addressLines?: string[];
        city?: string;
        country?: string;
        postalCode?: string;
      };
    };
    registration?: {
      managingLou?: string;
      lastUpdateDate?: string;
      status?: string;
    };
  };
  relationships?: {
    'direct-parent'?: { data?: { id?: string } };
    'ultimate-parent'?: { data?: { id?: string } };
  };
}

interface GleifApiResponse {
  data?: GleifApiEntity | GleifApiEntity[];
}

async function fetchLeiRecord(lei: string, timeoutMs = 8_000): Promise<LeiRecord | null> {
  const url = `${GLEIF_BASE}/lei-records/${encodeURIComponent(lei)}`;
  const result = await fetchJsonWithRetry<GleifApiResponse>(url, {
    method: 'GET',
    headers: { accept: 'application/vnd.api+json' },
  }, { perAttemptMs: timeoutMs, maxAttempts: 2 });

  if (!result.ok || !result.json?.data) return null;

  const raw = Array.isArray(result.json.data) ? result.json.data[0] : result.json.data;
  if (!raw?.attributes) return null;

  const attr = raw.attributes;
  const entity = attr.entity ?? {};
  const reg = attr.registration ?? {};
  const addr = entity.registeredAddress;

  const directParentId = raw.relationships?.['direct-parent']?.data?.id;
  const ultimateParentId = raw.relationships?.['ultimate-parent']?.data?.id;
  const legalFormId = entity.legalForm?.id;

  return {
    lei: attr.lei ?? lei,
    legalName: entity.legalName?.name ?? '',
    jurisdiction: entity.jurisdiction ?? '',
    ...(legalFormId !== undefined ? { legalForm: legalFormId } : {}),
    registrationStatus: reg.status ?? entity.status ?? '',
    ...(addr ? { registeredAddress: {
      addressLines: addr.addressLines ?? [],
      city: addr.city ?? '',
      country: addr.country ?? '',
      ...(addr.postalCode !== undefined ? { postalCode: addr.postalCode } : {}),
    } } : {}),
    ...(directParentId !== undefined ? { directParentLei: directParentId } : {}),
    ...(ultimateParentId !== undefined ? { ultimateParentLei: ultimateParentId } : {}),
    ...(reg.managingLou !== undefined ? { managingLou: reg.managingLou } : {}),
    ...(reg.lastUpdateDate !== undefined ? { lastUpdated: reg.lastUpdateDate } : {}),
  };
}

// Depth-limited ownership chain traversal. Follows direct-parent links up to
// maxDepth hops. Returns chain ordered from subject (depth 0) to root owner.
export async function lookupLei(
  lei: string,
  options: { maxDepth?: number; timeoutMs?: number } = {},
): Promise<GleifLookupResult> {
  const maxDepth = options.maxDepth ?? 5;
  const timeoutMs = options.timeoutMs ?? 8_000;

  const rootRecord = await fetchLeiRecord(lei, timeoutMs);
  if (!rootRecord) {
    return { ok: false, lei, ownershipChain: [], error: `LEI not found: ${lei}` };
  }

  const chain: OwnershipChainNode[] = [{
    lei: rootRecord.lei,
    legalName: rootRecord.legalName,
    jurisdiction: rootRecord.jurisdiction,
    registrationStatus: rootRecord.registrationStatus,
    depth: 0,
    relationshipType: 'root',
  }];

  const visited = new Set<string>([lei]);
  let current = rootRecord;
  let depth = 0;

  while (depth < maxDepth && current.directParentLei && !visited.has(current.directParentLei)) {
    const parentLei = current.directParentLei;
    visited.add(parentLei);
    const parentRecord = await fetchLeiRecord(parentLei, timeoutMs);
    if (!parentRecord) break;

    depth++;
    const isUltimate = !parentRecord.directParentLei || visited.has(parentRecord.directParentLei);
    chain.push({
      lei: parentRecord.lei,
      legalName: parentRecord.legalName,
      jurisdiction: parentRecord.jurisdiction,
      registrationStatus: parentRecord.registrationStatus,
      depth,
      relationshipType: isUltimate ? 'ultimate' : 'direct',
    });
    current = parentRecord;
  }

  return {
    ok: true,
    lei,
    record: rootRecord,
    ownershipChain: chain,
  };
}

// Search GLEIF by legal name — returns matching LEI records.
export async function searchGleif(
  query: string,
  limit = 10,
  timeoutMs = 8_000,
): Promise<Array<{ lei: string; legalName: string; jurisdiction: string; status: string }>> {
  const url = new URL(`${GLEIF_BASE}/lei-records`);
  url.searchParams.set('filter[entity.legalName]', query);
  url.searchParams.set('page[size]', String(Math.min(limit, 50)));

  const result = await fetchJsonWithRetry<GleifApiResponse>(url.toString(), {
    method: 'GET',
    headers: { accept: 'application/vnd.api+json' },
  }, { perAttemptMs: timeoutMs, maxAttempts: 2 });

  if (!result.ok || !result.json?.data) return [];

  const items = Array.isArray(result.json.data) ? result.json.data : [result.json.data];
  return items.map((item) => ({
    lei: item.attributes?.lei ?? '',
    legalName: item.attributes?.entity?.legalName?.name ?? '',
    jurisdiction: item.attributes?.entity?.jurisdiction ?? '',
    status: item.attributes?.registration?.status ?? '',
  })).filter((r) => r.lei);
}
