// Hawkeye Sterling — OpenSanctions ingestion (Phase 5).
// Stub fetcher + normaliser for the OpenSanctions PEP + sanctions API.
// Reads OPENSANCTIONS_API_KEY from env. Returns normalised list entries
// the rest of the engine already understands.

declare const process: { env?: Record<string, string | undefined> } | undefined;

import type { NormalisedListEntry } from '../brain/watchlist-adapters.js';

export interface OpenSanctionsSearchOptions {
  query: string;
  /** e.g. 'peps' | 'sanctions' | 'crime' | 'all'. Default 'sanctions'. */
  dataset?: string;
  limit?: number;
  apiKey?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

interface OpenSanctionsEntity {
  id: string;
  caption?: string;
  schema?: string;
  datasets?: string[];
  properties?: Record<string, unknown>;
}

export async function searchOpenSanctions(opts: OpenSanctionsSearchOptions): Promise<NormalisedListEntry[]> {
  const apiKey = opts.apiKey ?? (typeof process !== 'undefined' ? process.env?.OPENSANCTIONS_API_KEY : undefined);
  const endpoint = opts.endpoint ?? 'https://api.opensanctions.org/search';
  const dataset = opts.dataset ?? 'sanctions';
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = new URL(`${endpoint}/${encodeURIComponent(dataset)}`);
  url.searchParams.set('q', opts.query);
  url.searchParams.set('limit', String(opts.limit ?? 25));

  const headers: Record<string, string> = { accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetchImpl(url.toString(), { method: 'GET', headers });
  if (!res.ok) throw new Error(`OpenSanctions HTTP ${res.status}`);
  const json = (await res.json()) as { results?: OpenSanctionsEntity[] };
  return (json.results ?? []).map(normalise);
}

function normalise(e: OpenSanctionsEntity): NormalisedListEntry {
  const props = (e.properties ?? {}) as Record<string, unknown>;
  const entityType: NormalisedListEntry['entityType'] =
    (e.schema ?? '').toLowerCase().includes('person') ? 'individual'
    : (e.schema ?? '').toLowerCase().includes('vessel') ? 'vessel'
    : (e.schema ?? '').toLowerCase().includes('aircraft') ? 'aircraft'
    : (e.schema ?? '').toLowerCase().includes('organization') ? 'organisation'
    : 'other';
  const aliases = Array.isArray(props.alias) ? (props.alias as string[])
    : Array.isArray(props.weakAlias) ? (props.weakAlias as string[])
    : [];
  const nationalities = Array.isArray(props.nationality) ? (props.nationality as string[]) : undefined;
  const identifiers: NormalisedListEntry['identifiers'] = [];
  const passportProp = props.passportNumber ?? props.passport;
  if (Array.isArray(passportProp)) {
    for (const p of passportProp as string[]) identifiers.push({ kind: 'passport', number: String(p) });
  }
  const idNumber = props.idNumber;
  if (Array.isArray(idNumber)) {
    for (const p of idNumber as string[]) identifiers.push({ kind: 'national_id', number: String(p) });
  }
  const programs = Array.isArray(props.program) ? (props.program as string[])
    : Array.isArray(e.datasets) ? e.datasets : [];
  const publishedAt = typeof props.modifiedAt === 'string' ? props.modifiedAt : undefined;
  const remarks = typeof props.summary === 'string' ? (props.summary as string) : undefined;
  const rawHash = fnv1a(JSON.stringify(e));
  return {
    listId: 'opensanctions',
    sourceRef: e.id,
    primaryName: e.caption ?? String(props.name ?? e.id),
    aliases,
    entityType,
    identifiers,
    ...(nationalities !== undefined ? { nationalities } : {}),
    programs: [...programs],
    ...(remarks !== undefined ? { remarks } : {}),
    ...(publishedAt !== undefined ? { publishedAt } : {}),
    ingestedAt: new Date().toISOString(),
    rawHash,
  };
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
