// GET /api/sanctions/status
//
// Sanctions ingest health endpoint — reports per-list snapshot
// freshness as actually written by the production ingestion pipeline
// (`netlify/functions/refresh-lists.ts` → `src/ingestion/index.ts:SOURCE_ADAPTERS`
// → `getBlobsStore().putDataset(adapterId, …)` → blob `<adapterId>/latest.json`
// in the `hawkeye-lists` store).
//
// Required by HS-OPS-003 Part 2 §A1 (audit readiness self-check) and
// HS-OPS-001 §3.1 (Category 1 — Data Integrity early warning).
//
// Privacy: response NEVER includes feed URLs, secrets, or env-var
// values. Only presence booleans. Safe to expose to operators.
//
// Note on "configured":
//   The mainline adapters (UN/OFAC SDN/OFAC Cons/EU/UK/FATF) are
//   URL-hardcoded in `src/ingestion/sources/*.ts` — there is no
//   *_URL override env var to check. They are always considered
//   configured. The two UAE adapters read a local JSON seed path
//   from UAE_EOCN_SEED_PATH / UAE_LTL_SEED_PATH; if unset, those
//   adapters return empty datasets (the matcher still works, but
//   the UAE lists are silently NOT screened).
//
// Response:
//   {
//     ok, generatedAt,
//     lists: [{
//       listId, displayName, configured, configEnvVar (nullable),
//       blobKey, present, entityCount, lastModified, ageHours,
//       status: 'healthy'|'stale'|'missing'|'unconfigured'
//     }],
//     summary: { healthy, stale, missing, unconfigured },
//     env: { ... booleans only ... },
//     hint
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

type ListStatus = "healthy" | "stale" | "missing" | "unconfigured" | "degraded";

interface ListReport {
  listId: string;
  displayName: string;
  configured: boolean;
  configEnvVar: string | null;
  blobKey: string;
  present: boolean;
  entityCount: number | null;
  lastModified: string | null;
  ageHours: number | null;
  status: ListStatus;
}

interface ListAdapter {
  /** Matches `src/ingestion/index.ts:SOURCE_ADAPTERS` ids. */
  listId: string;
  displayName: string;
  /**
   * Env var the adapter reads, if any. `null` = adapter is URL-hardcoded
   * and always considered configured. The mainline adapters fall in
   * this bucket — only the UAE seed adapters take a env-driven path.
   */
  envVar: string | null;
}

// envVar: null    → adapter is hard-coded to a URL or bundled fallback data
//                   file, treated as always-configured.
// envVar: <name>  → adapter only operates when the named env var is set.
//                   Used for genuinely-optional integrations (JP MOF needs
//                   the user to opt in per-country).
//
// UAE adapters have a bundled `data/*.json` seed fallback that the
// adapter resolves automatically when the env var is unset, so they're
// always-configured in practice.
const ADAPTERS: readonly ListAdapter[] = [
  { listId: "un_consolidated", displayName: "UN Security Council Consolidated",     envVar: null                  },
  { listId: "ofac_sdn",        displayName: "US Treasury OFAC (SDN)",                envVar: null                  },
  { listId: "ofac_cons",       displayName: "US Treasury OFAC (Consolidated Non-SDN)", envVar: null                },
  { listId: "eu_fsf",          displayName: "EU Financial Sanctions",                envVar: null                  },
  { listId: "uk_ofsi",         displayName: "UK HM Treasury OFSI",                   envVar: null                  },
  { listId: "ca_osfi",         displayName: "Canada OSFI Consolidated Sanctions",    envVar: null                  },
  { listId: "ch_seco",         displayName: "Switzerland SECO Sanctions",            envVar: null                  },
  { listId: "au_dfat",         displayName: "Australia DFAT Consolidated Sanctions", envVar: null                  },
  // Audit H-03: jp_mof has no canonical consolidated URL — the adapter is
  // dormant by design until FEED_JP_MOF is set to one or more comma-
  // separated XLSX URLs. Declaring envVar here flips the status from
  // misleading "healthy 0 entities" to honest "unconfigured" when unset.
  { listId: "jp_mof",          displayName: "Japan MOF Economic Sanctions",          envVar: "FEED_JP_MOF"          },
  { listId: "fatf",            displayName: "FATF call-for-action / monitoring",     envVar: null                  },
  { listId: "uae_eocn",        displayName: "UAE EOCN Sanctions List",               envVar: null                  },
  { listId: "uae_ltl",         displayName: "UAE Local Terrorist List",              envVar: null                  },
  // LSEG CFS supplements — populated when /api/admin/import-cfs has been
  // run against a CFS subscription with sanctions/World-Check entitlements.
  // Treated as additional independently-reported adapters so operators see
  // exactly which regimes have LSEG backfill in addition to (or in lieu
  // of) the primary cron feeds.
  { listId: "lseg_un_consolidated", displayName: "UN Consolidated (LSEG supplement)",          envVar: null         },
  { listId: "lseg_ofac_sdn",        displayName: "OFAC SDN (LSEG supplement)",                envVar: null         },
  { listId: "lseg_ofac_cons",       displayName: "OFAC Consolidated Non-SDN (LSEG supplement)", envVar: null        },
  { listId: "lseg_eu_fsf",          displayName: "EU Financial Sanctions (LSEG supplement)",  envVar: null         },
  { listId: "lseg_uk_ofsi",         displayName: "UK OFSI (LSEG supplement)",                 envVar: null         },
  { listId: "lseg_ca_osfi",         displayName: "Canada OSFI (LSEG supplement)",             envVar: null         },
  { listId: "lseg_au_dfat",         displayName: "Australia DFAT (LSEG supplement)",          envVar: null         },
  { listId: "lseg_ch_seco",         displayName: "Switzerland SECO (LSEG supplement)",        envVar: null         },
  { listId: "lseg_jp_mof",          displayName: "Japan MOF (LSEG supplement)",               envVar: null         },
  { listId: "lseg_uae_eocn",        displayName: "UAE EOCN (LSEG supplement)",                envVar: null         },
  { listId: "lseg_uae_ltl",         displayName: "UAE Local Terrorist List (LSEG supplement)", envVar: null        },
];

const STALE_HOURS_DEFAULT = 36; // beyond 36h = stale (cron is daily 03:00 UTC)
const HOUR_MS = 60 * 60 * 1_000;

interface SnapshotShape {
  entities?: unknown[];
  fetchedAt?: number | string;
  lastModified?: string;
  generatedAt?: string;
  report?: { fetchedAt?: number | string };
}

interface BlobStore {
  get: (key: string, opts?: { type?: string }) => Promise<unknown>;
}

interface BlobMod {
  getStore: (opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: string;
  }) => BlobStore;
}

async function loadStore(): Promise<BlobStore | null> {
  let mod: BlobMod;
  try {
    mod = (await import("@netlify/blobs")) as unknown as BlobMod;
  } catch {
    return null;
  }
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  const opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: string;
  } =
    siteID && token
      ? { name: "hawkeye-lists", siteID, token, consistency: "strong" }
      : { name: "hawkeye-lists" };
  try {
    return mod.getStore(opts);
  } catch {
    return null;
  }
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function snapshotKey(adapterId: string): string {
  return `${adapterId}/latest.json`;
}

function readFetchedAtMs(snapshot: SnapshotShape | null): number | null {
  if (!snapshot) return null;
  const candidates: Array<unknown> = [
    snapshot.fetchedAt,
    snapshot.report?.fetchedAt,
    snapshot.lastModified,
    snapshot.generatedAt,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string") {
      const t = Date.parse(c);
      if (Number.isFinite(t)) return t;
    }
  }
  return null;
}

// entityCount=0 is expected for seed/supplement adapters that may not yet
// have been populated. URL-driven adapters returning 0 entities indicate a
// parser or upstream gap and should be flagged "degraded", not "healthy".
function emptyEntityCountExpected(listId: string): boolean {
  return listId === "uae_eocn" || listId === "uae_ltl" || listId.startsWith("lseg_");
}

async function inspectList(
  store: BlobStore | null,
  adapter: ListAdapter,
  staleHours: number,
): Promise<ListReport> {
  // URL-hardcoded adapters are always considered configured.
  // Env-driven adapters report based on env var presence.
  const configured =
    adapter.envVar === null ? true : Boolean(process.env[adapter.envVar]);
  const blobKey = snapshotKey(adapter.listId);

  if (!store) {
    return {
      listId: adapter.listId,
      displayName: adapter.displayName,
      configured,
      configEnvVar: adapter.envVar,
      blobKey,
      present: false,
      entityCount: null,
      lastModified: null,
      ageHours: null,
      status: configured ? "missing" : "unconfigured",
    };
  }

  let snapshot: SnapshotShape | null = null;
  try {
    const raw = await store.get(blobKey, { type: "json" });
    snapshot = (raw as SnapshotShape | null) ?? null;
  } catch {
    snapshot = null;
  }

  const hasEntities =
    snapshot !== null &&
    Array.isArray(snapshot.entities);
  const present = hasEntities;
  const entityCount = hasEntities ? (snapshot!.entities as unknown[]).length : null;
  const fetchedTs = readFetchedAtMs(snapshot);
  const ageHours =
    fetchedTs !== null ? (Date.now() - fetchedTs) / HOUR_MS : null;

  let status: ListStatus;
  if (!configured) status = "unconfigured";
  else if (!present) status = "missing";
  else if (entityCount === 0 && !emptyEntityCountExpected(adapter.listId)) status = "degraded";
  else if (ageHours !== null && ageHours > staleHours) status = "stale";
  else status = "healthy";

  return {
    listId: adapter.listId,
    displayName: adapter.displayName,
    configured,
    configEnvVar: adapter.envVar,
    blobKey,
    present,
    entityCount,
    lastModified: fetchedTs !== null ? new Date(fetchedTs).toISOString() : null,
    ageHours: ageHours !== null ? Math.round(ageHours * 10) / 10 : null,
    status,
  };
}

async function handleGet(req: Request): Promise<Response> {
  const t0 = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const staleHours = parsePositiveInt(
    url.searchParams.get("staleHours"),
    STALE_HOURS_DEFAULT,
  );

  const store = await loadStore();
  const lists = await Promise.all(ADAPTERS.map((adapter) => inspectList(store, adapter, staleHours)));

  const summary = { healthy: 0, stale: 0, missing: 0, unconfigured: 0, degraded: 0 };
  for (const l of lists) summary[l.status]++;

  // Booleans only — never values. Names mirror what netlify.toml +
  // ingestion code actually read, not the spec wishlist.
  const env = {
    AUDIT_CHAIN_SECRET: Boolean(process.env["AUDIT_CHAIN_SECRET"]),
    ADMIN_TOKEN: Boolean(process.env["ADMIN_TOKEN"]),
    ONGOING_RUN_TOKEN: Boolean(process.env["ONGOING_RUN_TOKEN"]),
    SANCTIONS_CRON_TOKEN: Boolean(process.env["SANCTIONS_CRON_TOKEN"]),
    NETLIFY_BLOBS_TOKEN: Boolean(process.env["NETLIFY_BLOBS_TOKEN"]),
    NETLIFY_SITE_ID: Boolean(process.env["NETLIFY_SITE_ID"]),
    EOCN_FEED_URL: Boolean(process.env["EOCN_FEED_URL"]),       // announcements feed (separate from list ingest)
    UAE_EOCN_SEED_PATH: Boolean(process.env["UAE_EOCN_SEED_PATH"]),
    UAE_LTL_SEED_PATH: Boolean(process.env["UAE_LTL_SEED_PATH"]),
    NEWSAPI_API_KEY: Boolean(process.env["NEWSAPI_API_KEY"]),    // canonical name in this deployment
    GNEWS_API_KEY: Boolean(process.env["GNEWS_API_KEY"]),
    NEWSDATA_API_KEY: Boolean(process.env["NEWSDATA_API_KEY"]),
    NEWSCATCHER_API_KEY: Boolean(process.env["NEWSCATCHER_API_KEY"]),
    MEDIASTACK_API_KEY: Boolean(process.env["MEDIASTACK_API_KEY"]),
    MEDIACLOUD_API_KEY: Boolean(process.env["MEDIACLOUD_API_KEY"]),
    MARKETAUX_API_KEY: Boolean(process.env["MARKETAUX_API_KEY"]),
    NYT_API_KEY: Boolean(process.env["NYT_API_KEY"]),
    WORLDNEWS_API_KEY: Boolean(process.env["WORLDNEWS_API_KEY"]),
    CURRENTS_API_KEY: Boolean(process.env["CURRENTS_API_KEY"]),
    TIINGO_API_KEY: Boolean(process.env["TIINGO_API_KEY"]),
    ALPHAVANTAGE_API_KEY: Boolean(process.env["ALPHAVANTAGE_API_KEY"]),
    // Feature-flag env vars are "true"/"false" strings, not presence checks.
    // Boolean("false") === true, so we must compare the string value explicitly.
    GOOGLE_NEWS_RSS_ENABLED: process.env["GOOGLE_NEWS_RSS_ENABLED"] !== "false",
    HS_DISABLED: process.env["HS_DISABLED"] === "true",
  };

  // Audit L-03: `ok` previously flipped false whenever any list was missing
  // or stale, even if 10 of 12 were healthy. That conflated partial
  // degradation with total outage and produced constant red on monitors.
  // Now: `ok=true` means the endpoint is operational and at least one list
  // is healthy. Partial degradation surfaces via `degraded=true` + the
  // `warnings` array. Reserve `ok=false` for total outage (zero healthy
  // lists), where no screen can be trusted.
  const ok = summary.healthy > 0;
  const degraded = summary.missing > 0 || summary.stale > 0 || summary.degraded > 0;
  const warnings: string[] = [];
  for (const l of lists) {
    if (l.status === "missing") warnings.push(`${l.listId} (${l.displayName}): missing from blob storage`);
    else if (l.status === "stale" && l.ageHours !== null) warnings.push(`${l.listId} (${l.displayName}): stale by ${l.ageHours}h`);
    else if (l.status === "degraded") warnings.push(`${l.listId} (${l.displayName}): blob present but zero entities — parser or upstream gap (audit H-03)`);
    else if (l.status === "healthy" && l.entityCount === 0 && emptyEntityCountExpected(l.listId)) {
      // Informational only — don't push to warnings (would flip the
      // dashboard yellow indefinitely). entityCount=0 is visible in
      // the lists[] array for any operator who wants to drill in.
    }
  }

  // Build per-list freshness summary for compliance audit trail
  const dataFreshness: Record<string, { lastRefreshed: string | null; ageHours: number | null; status: ListStatus }> = {};
  for (const l of lists) {
    dataFreshness[l.listId] = {
      lastRefreshed: l.lastModified,
      ageHours: l.ageHours,
      status: l.status,
    };
  }

  const latencyMs = Date.now() - t0;
  return NextResponse.json(
    {
      ok,
      degraded,
      warnings,
      generatedAt: new Date().toISOString(),
      staleThresholdHours: staleHours,
      dataFreshness,
      summary,
      lists,
      env,
      latencyMs,
      hint: !ok
        ? "Total outage — no healthy sanctions lists. Do not perform screening until at least one list is restored."
        : degraded
          ? "Partial degradation — see warnings[]. Check refresh-lists cron logs (03:00 UTC daily). Degraded lists have a blob but zero entities (parser/upstream gap). UAE adapters return empty unless UAE_EOCN_SEED_PATH / UAE_LTL_SEED_PATH point to a local JSON seed."
          : "All adapters present and within freshness threshold.",
    },
    { headers: gate.headers },
  );
}

export const GET = handleGet;
