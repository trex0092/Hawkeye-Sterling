// Watchman client — moov-io/watchman (github.com/moov-io/watchman)
// Optional OFAC / global sanctions cross-validation.
// Activate by setting WATCHMAN_URL to a running Watchman instance, e.g.:
//   docker run -p 8084:8084 moov/watchman
//   WATCHMAN_URL=http://localhost:8084
//
// If WATCHMAN_URL is not set, all calls return null (no-op, fail-soft).

export interface WatchmanEntity {
  entityID: string;
  sdnName: string;
  sdnType: string;
  programs: string[];
  match: number;
}

export interface WatchmanResult {
  hits: WatchmanEntity[];
  hitCount: number;
}

export async function checkWatchman(name: string): Promise<WatchmanResult | null> {
  const base = process.env["WATCHMAN_URL"];
  if (!base) return null;

  try {
    const url = `${base}/search?q=${encodeURIComponent(name)}&limit=5`;
    const res = await fetch(url, {
      headers: { "x-user-id": "hawkeye-batch", accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      // Audit DR-07: log HTTP failures so silent nulls become diagnosable.
      console.warn(`[watchman-client] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      SDNs?: WatchmanEntity[];
      altNames?: WatchmanEntity[];
    };

    const hits = [...(data.SDNs ?? []), ...(data.altNames ?? [])].filter(
      (e) => e.match >= 0.82,
    );
    return { hits, hitCount: hits.length };
  } catch (err) {
    console.warn(`[watchman-client] request failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
