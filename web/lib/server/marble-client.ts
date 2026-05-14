// Marble client — checkmarble/marble (github.com/checkmarble/marble)
// Optional real-time AML decision-engine cross-check.
// Activate by setting MARBLE_API_URL + MARBLE_API_KEY:
//   docker compose -f docker-compose.yml up   (self-hosted)
//   MARBLE_API_URL=https://api.checkmarble.com
//   MARBLE_API_KEY=<your-key>
//
// If env vars are absent, all calls return null (no-op, fail-soft).

export interface MarbleMatch {
  name: string;
  score: number;
  lists: string[];
  status: "match" | "potential_match" | "no_match";
}

export interface MarbleResult {
  status: "match" | "potential_match" | "no_match";
  topMatch?: MarbleMatch;
}

export async function checkMarble(
  name: string,
  entityType?: string,
): Promise<MarbleResult | null> {
  const base = process.env["MARBLE_API_URL"];
  const key = process.env["MARBLE_API_KEY"];
  if (!base || !key) return null;

  try {
    const res = await fetch(`${base}/api/v1/screening/search`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        name,
        type: entityType?.startsWith("ind") ? "individual" : "entity",
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      // Audit DR-07: silent `return null` made HTTP failures
      // indistinguishable from "not configured". Log so ops can tell.
      console.warn(`[marble-client] HTTP ${res.status} from ${base}`);
      return null;
    }

    const data = (await res.json()) as { matches?: MarbleMatch[] };
    const matches = data.matches ?? [];
    if (matches.length === 0) return { status: "no_match" };

    const top = matches[0]!;
    return { status: top.status, topMatch: top };
  } catch (err) {
    console.warn(`[marble-client] request failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
