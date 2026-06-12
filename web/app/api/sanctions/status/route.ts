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
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  getSla,
  computeActiveAlerts,
  computeCorpusHash,
  loadIngestMetaStore,
  loadLastIngestTimestamps,
  type ListAlert,
  type LastIngestTimestamps,
} from "@/lib/server/sanctions-freshness-sla";

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
  /** SLA thresholds for this specific list */
  sla: {
    warningHours: number;
    criticalHours: number;
    minEntities?: number;
  };
  /** Alert level derived from staleness + entity count relative to this list's SLA */
  alertLevel: "ok" | "warning" | "critical";
  /** Human-readable reason for the current alert level */
  alertReason: string;
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
  // of) the primary cron feeds. envVar stays null: their "configured" state
  // comes from lsegCfsImported() (CFS index manifest presence), so they sit
  // at "unconfigured"/ok — not "missing"/critical — until the import runs.
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
  metadata?: { entityCount?: number; fetchedAt?: string };
  fetchedAt?: number | string;
  lastModified?: string;
  generatedAt?: string;
  report?: { fetchedAt?: number | string };
}

interface BlobStore {
  get: (_key: string, _opts?: { type?: string }) => Promise<unknown>;
}

interface BlobMod {
  getStore: (_opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: string;
  }) => BlobStore;
}

async function loadStore(name = "hawkeye-lists"): Promise<BlobStore | null> {
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
      ? { name, siteID, token, consistency: "strong" }
      : { name };
  try {
    return mod.getStore(opts);
  } catch {
    return null;
  }
}

// LSEG CFS supplements are populated only by a manual POST /api/admin/import-cfs
// run, which writes the hawkeye-lseg-pep-index manifest as its final step.
// Until that import has happened the lseg_* blobs are intentionally absent —
// they must report "unconfigured" (informational, no SLA alert), mirroring how
// jp_mof reports before FEED_JP_MOF opts in. Without this check the 12
// supplements show "missing from blob storage" at alertLevel critical and
// permanently drown the genuine feed alerts.
async function lsegCfsImported(): Promise<boolean> {
  const store = await loadStore("hawkeye-lseg-pep-index");
  if (!store) return false;
  try {
    const manifest = await store.get("manifest.json", { type: "json" });
    return manifest !== null && manifest !== undefined;
  } catch {
    return false;
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
  lsegImported: boolean,
): Promise<ListReport> {
  // URL-hardcoded adapters are always considered configured.
  // Env-driven adapters report based on env var presence.
  // LSEG supplements are configured once import-cfs has built the CFS index.
  const configured = adapter.listId.startsWith("lseg_")
    ? lsegImported
    : adapter.envVar === null ? true : Boolean(process.env[adapter.envVar]);
  const unconfiguredReason = adapter.listId.startsWith("lseg_")
    ? "LSEG supplement not imported — run POST /api/admin/import-cfs once lseg-cfs-poll has downloaded CFS bulk files."
    : "List is not configured.";
  const blobKey = snapshotKey(adapter.listId);
  const sla = getSla(adapter.listId);

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
      sla: { warningHours: sla.warningHours, criticalHours: sla.criticalHours, ...(sla.minEntities !== undefined ? { minEntities: sla.minEntities } : {}) },
      alertLevel: configured ? "critical" : "ok",
      alertReason: configured ? "List is missing from blob storage — no snapshot available for screening." : unconfiguredReason,
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
    (Array.isArray(snapshot.entities) || typeof snapshot.metadata?.entityCount === "number");
  const present = hasEntities;
  // Prefer metadata.entityCount (written atomically with the blob) over
  // entities.length (requires loading the full array) so both this route and
  // the health endpoint agree on the count even when the full entities array
  // is not loaded or the blob was written without an inline entities field.
  const entityCount = hasEntities
    ? (typeof snapshot!.metadata?.entityCount === "number"
        ? snapshot!.metadata.entityCount
        : Array.isArray(snapshot!.entities)
          ? (snapshot!.entities as unknown[]).length
          : null)
    : null;
  const fetchedTs = readFetchedAtMs(snapshot);
  const ageHours =
    fetchedTs !== null ? (Date.now() - fetchedTs) / HOUR_MS : null;

  let status: ListStatus;
  if (!configured) status = "unconfigured";
  else if (!present) status = "missing";
  else if (entityCount === 0 && !emptyEntityCountExpected(adapter.listId)) status = "degraded";
  else if (ageHours !== null && ageHours > staleHours) status = "stale";
  else status = "healthy";

  const roundedAgeHours = ageHours !== null ? Math.round(ageHours * 10) / 10 : null;

  // Compute per-list alert using the per-list SLA thresholds (not the
  // global staleHours override). The global staleHours controls the
  // legacy `status` field; alertLevel uses the spec-driven per-list SLA.
  const alertObj = (() => {
    if (!configured || status === "unconfigured") return { alertLevel: "ok" as const, alertReason: unconfiguredReason };
    if (!present || status === "missing") return { alertLevel: "critical" as const, alertReason: "List is missing from blob storage — no snapshot available for screening." };
    if (status === "degraded") return { alertLevel: "critical" as const, alertReason: "Blob is present but contains zero entities — likely a parser or upstream feed regression." };
    if (sla.minEntities !== undefined && entityCount !== null && entityCount < sla.minEntities) {
      return { alertLevel: "critical" as const, alertReason: `Entity count ${entityCount} is below the minimum expected ${sla.minEntities} — possible truncated download or parser regression.` };
    }
    if (roundedAgeHours !== null && roundedAgeHours >= sla.criticalHours) {
      return { alertLevel: "critical" as const, alertReason: `List is ${roundedAgeHours}h stale — exceeds the ${sla.criticalHours}h critical SLA threshold.` };
    }
    if (roundedAgeHours !== null && roundedAgeHours >= sla.warningHours) {
      return { alertLevel: "warning" as const, alertReason: `List is ${roundedAgeHours}h stale — exceeds the ${sla.warningHours}h warning SLA threshold (critical at ${sla.criticalHours}h).` };
    }
    return { alertLevel: "ok" as const, alertReason: "Within SLA thresholds." };
  })();

  return {
    listId: adapter.listId,
    displayName: adapter.displayName,
    configured,
    configEnvVar: adapter.envVar,
    blobKey,
    present,
    entityCount,
    lastModified: fetchedTs !== null ? new Date(fetchedTs).toISOString() : null,
    ageHours: roundedAgeHours,
    status,
    sla: { warningHours: sla.warningHours, criticalHours: sla.criticalHours, ...(sla.minEntities !== undefined ? { minEntities: sla.minEntities } : {}) },
    alertLevel: alertObj.alertLevel,
    alertReason: alertObj.alertReason,
  };
}

async function handleGet(req: Request): Promise<Response> {
  const t0 = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "sanctions.status_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const url = new URL(req.url);
  const staleHours = parsePositiveInt(
    url.searchParams.get("staleHours"),
    STALE_HOURS_DEFAULT,
  );

  try {
  const [store, ingestMetaStore, lsegImported] = await Promise.all([
    loadStore(),
    loadIngestMetaStore(),
    lsegCfsImported(),
  ]);
  const [lists, lastIngestMeta] = await Promise.all([
    Promise.all(ADAPTERS.map((adapter) => inspectList(store, adapter, staleHours, lsegImported))),
    loadLastIngestTimestamps(ingestMetaStore),
  ]);

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
  const dataFreshness: Record<string, { lastRefreshed: string | null; ageHours: number | null; status: ListStatus; alertLevel: "ok" | "warning" | "critical" }> = {};
  for (const l of lists) {
    dataFreshness[l.listId] = {
      lastRefreshed: l.lastModified,
      ageHours: l.ageHours,
      status: l.status,
      alertLevel: l.alertLevel,
    };
  }

  // Corpus hash — SHA-256 over all list metadata.
  // Changes only when entity counts or timestamps actually change, so
  // callers can cheaply detect genuine updates without re-downloading blobs.
  const corpusHash = computeCorpusHash(
    lists.map((l) => ({
      listId: l.listId,
      entityCount: l.entityCount,
      lastModified: l.lastModified,
    })),
  );

  // Per-list SLA active alerts (warning + critical only).
  const activeAlerts: ListAlert[] = computeActiveAlerts(
    lists.map((l) => ({
      listId: l.listId,
      ageHours: l.ageHours,
      entityCount: l.entityCount,
      status: l.status,
      configured: l.configured,
      present: l.present,
    })),
  );

  const latencyMs = Date.now() - t0;
  return NextResponse.json(
    {
      ok,
      degraded,
      warnings,
      generatedAt: new Date().toISOString(),
      staleThresholdHours: staleHours,
      dataFreshness,
      // Corpus hash — use this to detect genuine data changes between polls.
      corpusHash,
      // Per-list SLA active alerts (warning + critical).
      activeAlerts,
      alertSummary: {
        critical: activeAlerts.filter((a) => a.alertLevel === "critical").length,
        warning: activeAlerts.filter((a) => a.alertLevel === "warning").length,
        total: activeAlerts.length,
      },
      // Last successful ingest timestamps (per-list and last full run).
      lastIngest: lastIngestMeta satisfies LastIngestTimestamps | null,
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sanctions/status] unhandled error:", msg);
    return new Response(JSON.stringify({ ok: false, error: "internal_error", detail: msg }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const GET = handleGet;
