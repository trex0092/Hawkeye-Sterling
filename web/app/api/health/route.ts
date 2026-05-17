// GET /api/health
//
// Liveness + mandatory-list health probe.
// Returns tiered HTTP status codes (Section 20):
//   200  all mandatory lists healthy AND brain ok
//   207  1–2 mandatory lists down
//   503  3+ mandatory lists down OR brain down
//
// Response shape is always the same JSON regardless of HTTP status:
//   { ok, status, mandatoryListsHealthy, sanctionsDown, brain, ts, runtime }
//
// Mandatory sanctions lists (stale threshold: 36 h):
//   uae_eocn, uae_ltl, un_consolidated, ofac_sdn

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Resolve build identity from CI/CD environment variables injected at
// build time. Checked in priority order: Netlify → Vercel → generic CI.
const BUILD_ID =
  process.env["HAWKEYE_BUILD_COMMIT_REF"] ??  // inlined by next.config.mjs (audit M-06)
  process.env["NETLIFY_BUILD_ID"] ??
  process.env["NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA"] ??
  process.env["BUILD_ID"] ??
  "unknown";

// Audit M-06: Netlify doesn't forward COMMIT_REF to the Lambda runtime,
// so direct process.env reads fall through to "unknown". next.config.mjs
// inlines the build-time SHA as HAWKEYE_BUILD_COMMIT_REF; read that first.
const COMMIT_REF = (
  process.env["HAWKEYE_BUILD_COMMIT_REF"] ??
  process.env["APP_VERSION"] ??
  process.env["GIT_COMMIT_SHA"] ??
  process.env["COMMIT_REF"] ??
  process.env["NETLIFY_COMMIT_REF"] ??
  process.env["VERCEL_GIT_COMMIT_SHA"] ??
  process.env["GIT_COMMIT"] ??
  "unknown"
).slice(0, 7);

let brainOk: boolean | null = null;
let brainDetail: string | null = null;

async function checkBrain(): Promise<{ ok: boolean; detail: string }> {
  if (brainOk !== null) return { ok: brainOk, detail: brainDetail ?? "" };
  try {
    const mod = await import("../../../../dist/src/brain/quick-screen.js").catch(() => null);
    const quickScreen = (mod as { quickScreen?: unknown } | null)?.quickScreen;
    if (typeof quickScreen !== "function") {
      brainOk = false;
      brainDetail = "BRAIN_MODULE_MISSING";
    } else {
      const probe = (quickScreen as (s: unknown, c: unknown[], o: unknown) => unknown)({ name: "HealthProbe" }, [], { maxHits: 0 });
      brainOk = typeof probe === "object" && probe !== null;
      brainDetail = brainOk ? "ok" : "quickScreen returned non-object";
    }
  } catch (err) {
    brainOk = false;
    brainDetail = err instanceof Error ? err.message : String(err);
  }
  return { ok: brainOk!, detail: brainDetail! };
}

// ─── Mandatory list health ────────────────────────────────────────────────────
// Section 20: check the four mandatory sanctions lists from the hawkeye-lists
// blob store. A list is "down" if entityCount is 0 OR ageHours > 36.
// Result is cached in-memory for 60 s so the lightweight health probe stays fast.

const MANDATORY_LIST_IDS = ["uae_eocn", "uae_ltl", "un_consolidated", "ofac_sdn"] as const;
const STALE_THRESHOLD_HOURS = 36;
const LIST_CACHE_TTL_MS = 60 * 1_000; // 60 seconds

interface ListHealthEntry {
  id: string;
  down: boolean;
  reason?: string;
}

interface ListHealthCache {
  cachedAt: number;
  results: ListHealthEntry[];
}

let _listHealthCache: ListHealthCache | null = null;

async function checkMandatoryLists(): Promise<ListHealthEntry[]> {
  const now = Date.now();
  if (_listHealthCache && now - _listHealthCache.cachedAt < LIST_CACHE_TTL_MS) {
    return _listHealthCache.results;
  }

  let blobsMod: { getStore: (opts: { name: string; siteID?: string; token?: string; consistency?: string }) => { get: (key: string, opts?: { type?: string }) => Promise<unknown> } } | null = null;
  try {
    blobsMod = (await import("@netlify/blobs")) as unknown as typeof blobsMod;
  } catch {
    // Blobs not available — treat all mandatory lists as unknown (not down)
    // so the health endpoint doesn't false-positive in local dev.
    const results: ListHealthEntry[] = MANDATORY_LIST_IDS.map((id) => ({ id, down: false, reason: "blobs-unavailable" }));
    _listHealthCache = { cachedAt: now, results };
    return results;
  }

  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  const storeOpts: { name: string; siteID?: string; token?: string; consistency?: string } =
    siteID && token
      ? { name: "hawkeye-lists", siteID, token, consistency: "strong" }
      : { name: "hawkeye-lists" };

  let store: { get: (key: string, opts?: { type?: string }) => Promise<unknown> } | null = null;
  try {
    store = blobsMod!.getStore(storeOpts);
  } catch {
    const results: ListHealthEntry[] = MANDATORY_LIST_IDS.map((id) => ({ id, down: false, reason: "store-init-failed" }));
    _listHealthCache = { cachedAt: now, results };
    return results;
  }

  const results: ListHealthEntry[] = await Promise.all(
    MANDATORY_LIST_IDS.map(async (id): Promise<ListHealthEntry> => {
      try {
        const blob = (await store!.get(`${id}/latest.json`, { type: "json" })) as {
          metadata?: { entityCount?: number; fetchedAt?: string };
          entities?: unknown[];
        } | null;

        if (!blob) {
          return { id, down: true, reason: "blob-missing" };
        }

        // Derive entityCount: prefer metadata.entityCount, fall back to entities array length
        const entityCount =
          typeof blob.metadata?.entityCount === "number"
            ? blob.metadata.entityCount
            : Array.isArray(blob.entities)
              ? blob.entities.length
              : null;

        // Derive age in hours from metadata.fetchedAt
        let ageHours: number | null = null;
        if (blob.metadata?.fetchedAt) {
          const fetchedMs = Date.parse(blob.metadata.fetchedAt);
          if (Number.isFinite(fetchedMs)) {
            ageHours = (now - fetchedMs) / (60 * 60 * 1_000);
          }
        }

        if (entityCount === 0) {
          return { id, down: true, reason: "entity-count-zero" };
        }
        if (ageHours !== null && ageHours > STALE_THRESHOLD_HOURS) {
          return { id, down: true, reason: `stale-${Math.round(ageHours)}h` };
        }
        return { id, down: false };
      } catch {
        return { id, down: true, reason: "read-error" };
      }
    }),
  );

  _listHealthCache = { cachedAt: now, results };
  return results;
}

export async function GET(req: Request): Promise<NextResponse> {
  const [brain, listResults] = await Promise.all([checkBrain(), checkMandatoryLists()]);

  const downLists = listResults.filter((l) => l.down);
  const sanctionsDown = downLists.length;
  const mandatoryListsHealthy = sanctionsDown === 0;

  // Section 20: tiered HTTP status
  // 503 if 3+ mandatory lists are down OR brain is down
  // 207 if 1–2 mandatory lists are down
  // 200 if all mandatory lists healthy AND brain ok
  let httpStatus: 200 | 207 | 503;
  let overallStatus: "operational" | "degraded" | "down";
  if (!brain.ok || sanctionsDown >= 3) {
    httpStatus = 503;
    overallStatus = "down";
  } else if (sanctionsDown >= 1) {
    httpStatus = 207;
    overallStatus = "degraded";
  } else {
    httpStatus = 200;
    overallStatus = "operational";
  }

  // Only expose deployment details (buildId, commitRef) to authenticated callers.
  const gate = await enforce(req, { requireAuth: false });
  const authenticated = gate.ok && gate.keyId !== "anonymous";

  return NextResponse.json(
    {
      ok: httpStatus < 500,
      status: overallStatus,
      mandatoryListsHealthy,
      sanctionsDown,
      brain: { ok: brain.ok },
      ts: new Date().toISOString(),
      runtime: "nodejs",
      ...(authenticated ? { buildId: BUILD_ID, commitRef: COMMIT_REF } : {}),
    },
    { status: httpStatus },
  );
}
