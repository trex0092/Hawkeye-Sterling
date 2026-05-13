// Hawkeye Sterling — adapter-failure log.
//
// Writes every adapter failure (fetch error, HTTP non-200, parse error,
// blob-write error) to a dedicated `hawkeye-ingest-errors` Blob store
// so operators can see WHY a sanctions refresh failed without needing
// access to Netlify Function logs.
//
// Read path: GET /api/sanctions/last-errors returns the most recent
// 20 entries. Lexicographic key order = reverse-chronological for the
// timestamp prefix used below.
//
// Privacy: error messages are passed through verbatim — they should
// NEVER contain subject PII because adapters fetch public watchlists,
// not customer data. Defensive `truncate` keeps any one entry from
// burning blob quota.

interface BlobsModuleShape {
  getStore: (opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: 'strong' | 'eventual';
  }) => {
    setJSON: (key: string, value: unknown) => Promise<void>;
    list: (opts?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string }> }>;
    get: (key: string, opts?: { type?: string }) => Promise<unknown>;
  };
}

const STORE_NAME = 'hawkeye-ingest-errors';
const MAX_MESSAGE_LEN = 1_000;

export interface IngestErrorEntry {
  at: string;            // ISO timestamp
  source: string;        // which cron / function logged it (e.g. "refresh-lists", "sanctions-watch-15min")
  adapterId: string;     // e.g. "ofac_sdn"
  phase: 'fetch' | 'parse' | 'write' | 'verify';
  message: string;
  httpStatus?: number;
}

function truncate(s: string, n = MAX_MESSAGE_LEN): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function loadBlobs(): Promise<BlobsModuleShape | null> {
  try {
    return (await import('@netlify/blobs')) as unknown as BlobsModuleShape;
  } catch {
    return null;
  }
}

function credentials(): { siteID?: string; token?: string } {
  const siteID = process.env['NETLIFY_SITE_ID'] ?? process.env['SITE_ID'];
  const token =
    process.env['NETLIFY_BLOBS_TOKEN'] ??
    process.env['NETLIFY_API_TOKEN'] ??
    process.env['NETLIFY_AUTH_TOKEN'];
  const out: { siteID?: string; token?: string } = {};
  if (siteID) out.siteID = siteID;
  if (token) out.token = token;
  return out;
}

/**
 * Append one error entry. Fire-and-forget: never throws, never blocks the
 * caller. If the blob store itself is unavailable the entry is silently
 * dropped (a fallback console.error is emitted so it still appears in
 * Netlify Function logs).
 */
export async function logIngestError(entry: IngestErrorEntry): Promise<void> {
  const safe: IngestErrorEntry = { ...entry, message: truncate(entry.message) };
  try {
    const mod = await loadBlobs();
    if (!mod) {
      console.error(`[ingest-error] ${safe.source}/${safe.adapterId}/${safe.phase}: ${safe.message}`);
      return;
    }
    const creds = credentials();
    const store = mod.getStore({
      name: STORE_NAME,
      ...(creds.siteID ? { siteID: creds.siteID } : {}),
      ...(creds.token ? { token: creds.token } : {}),
      consistency: 'strong',
    });
    // Key: entry/<ISO>-<rand6>. Lexicographic order matches chronological
    // order so `list({prefix: "entry/"})` returns earliest-first; the read
    // route reverses for "most recent first".
    const ts = safe.at.replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 8);
    await store.setJSON(`entry/${ts}-${rand}`, safe);
  } catch (err) {
    console.error(
      `[ingest-error] blob write failed (entry NOT persisted): ${err instanceof Error ? err.message : String(err)}`,
      JSON.stringify(safe),
    );
  }
}

/**
 * Returns the most-recent `limit` error entries (default 20). Used by
 * GET /api/sanctions/last-errors so the operator-side dashboard can
 * surface the actual failure reason without needing Netlify dashboard
 * access.
 */
export async function listRecentIngestErrors(limit = 20): Promise<IngestErrorEntry[]> {
  try {
    const mod = await loadBlobs();
    if (!mod) return [];
    const creds = credentials();
    const store = mod.getStore({
      name: STORE_NAME,
      ...(creds.siteID ? { siteID: creds.siteID } : {}),
      ...(creds.token ? { token: creds.token } : {}),
      consistency: 'strong',
    });
    const listing = await store.list({ prefix: 'entry/' });
    const keys = (listing.blobs ?? []).map((b) => b.key).sort().reverse().slice(0, limit);
    const entries: IngestErrorEntry[] = [];
    for (const k of keys) {
      try {
        const v = (await store.get(k, { type: 'json' })) as IngestErrorEntry | null;
        if (v && typeof v === 'object' && typeof v.adapterId === 'string') {
          entries.push(v);
        }
      } catch {
        // Skip unreadable entries.
      }
    }
    return entries;
  } catch (err) {
    console.error(
      `[ingest-error] read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}
