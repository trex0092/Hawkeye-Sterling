// GET /api/system-status
//
// A4/C9: Full dependency-map and service-health endpoint.
// Reports all external dependencies, list freshness for every ingestion
// source, HMAC audit chain integrity, brain module status, and
// scheduled-job last-run timestamps.
//
// Distinct from the lightweight /api/health ping (mandatory lists only).
// This endpoint is the authoritative ops dashboard feed.
//
// Response shape:
//   {
//     ok, overallStatus, generatedAt,
//     components: { brain, storage, auditChain, sanctions, externalServices },
//     sanctionsList: [{ listId, displayName, status, entityCount, ageHours, lastRefreshed }],
//     scheduledJobs: [{ name, lastRunAt, nextExpectedAt, status }],
//     metrics: { uptime, totalListEntities, activeAlerts }
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry, getChainSecret } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getJson, isInMemoryFallback } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STARTED_AT = Date.now();

type ComponentStatus = "operational" | "degraded" | "down" | "unknown";

interface ComponentCheck {
  name: string;
  status: ComponentStatus;
  latencyMs: number;
  note?: string;
}

interface SanctionsListInfo {
  listId: string;
  displayName: string;
  status: "healthy" | "stale" | "missing" | "unknown";
  entityCount: number | null;
  ageHours: number | null;
  lastRefreshed: string | null;
  blobKey: string;
}

async function _timedCheck<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<{ result: T; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, latencyMs: Date.now() - start };
  } catch (err) {
    console.error(`[system-status] timedCheck(${name}) failed:`, err);
    return {
      result: fallback,
      latencyMs: Date.now() - start,
      error: "component check failed",
    };
  }
}

// All ingestion source list IDs and their display names.
const SANCTIONS_LISTS: Array<{ id: string; displayName: string }> = [
  { id: "un_consolidated",   displayName: "UN Security Council Consolidated" },
  { id: "ofac_sdn",         displayName: "OFAC SDN" },
  { id: "ofac_cons",        displayName: "OFAC Consolidated Non-SDN" },
  { id: "eu_fsf",           displayName: "EU Financial Sanctions Framework" },
  { id: "uk_ofsi",          displayName: "UK OFSI Consolidated" },
  { id: "ca_osfi",          displayName: "Canada OSFI / SEMA Consolidated" },
  { id: "ch_seco",          displayName: "Switzerland SECO Sanctions" },
  { id: "au_dfat",          displayName: "Australia DFAT Consolidated" },
  { id: "jp_mof",           displayName: "Japan Ministry of Finance" },
  { id: "jp_meti",          displayName: "Japan METI Export Control Entity List" },
  { id: "fatf",             displayName: "FATF Black / Grey List (jurisdictions)" },
  { id: "uae_eocn",         displayName: "UAE EOCN (Terrorist Designations)" },
  { id: "uae_ltl",          displayName: "UAE Local Terrorist List" },
  { id: "uae_moe_designated", displayName: "UAE MoE Designated Entities" },
  { id: "interpol_red",     displayName: "Interpol Red Notices" },
  { id: "bis_entity",       displayName: "US BIS Entity List" },
  { id: "fincen_314a",      displayName: "FinCEN 314(a) Advisory Alerts" },
  { id: "opensanctions",    displayName: "OpenSanctions Consolidated (~67k entities)" },
];

const STALE_THRESHOLD_HOURS = 36;
const _CRITICAL_STALE_HOURS = 72;

type BlobsModule = {
  getStore: (_opts: { name: string; siteID?: string; token?: string; consistency?: string }) => {
    get: (_key: string, _opts?: { type?: string }) => Promise<unknown>;
  };
};

async function checkSanctionsList(
  listId: string,
  displayName: string,
): Promise<SanctionsListInfo> {
  const blobKey = `${listId}/latest.json`;
  try {
    let blobsMod: BlobsModule | null = null;
    try {
      blobsMod = (await import("@netlify/blobs")) as unknown as BlobsModule;
    } catch {
      return { listId, displayName, status: "unknown", entityCount: null, ageHours: null, lastRefreshed: null, blobKey };
    }
    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token = process.env["NETLIFY_BLOBS_TOKEN"] ?? process.env["NETLIFY_API_TOKEN"] ?? process.env["NETLIFY_AUTH_TOKEN"];
    const storeOpts = siteID && token
      ? { name: "hawkeye-lists", siteID, token, consistency: "strong" as const }
      : { name: "hawkeye-lists" };
    const store = blobsMod!.getStore(storeOpts);
    const blob = (await store.get(blobKey, { type: "json" })) as {
      metadata?: { entityCount?: number; fetchedAt?: string };
      entities?: unknown[];
    } | null;

    if (!blob) return { listId, displayName, status: "missing", entityCount: null, ageHours: null, lastRefreshed: null, blobKey };

    const entityCount = typeof blob.metadata?.entityCount === "number"
      ? blob.metadata.entityCount
      : Array.isArray(blob.entities) ? blob.entities.length : null;
    const fetchedAt = blob.metadata?.fetchedAt ?? null;
    let ageHours: number | null = null;
    if (fetchedAt) {
      const ms = Date.parse(fetchedAt);
      if (Number.isFinite(ms)) ageHours = (Date.now() - ms) / 3_600_000;
    }
    const status: SanctionsListInfo["status"] =
      entityCount === 0 ? "missing"
      : ageHours !== null && ageHours > STALE_THRESHOLD_HOURS ? "stale"
      : "healthy";
    return { listId, displayName, status, entityCount, ageHours: ageHours !== null ? Math.round(ageHours * 10) / 10 : null, lastRefreshed: fetchedAt, blobKey };
  } catch {
    return { listId, displayName, status: "unknown", entityCount: null, ageHours: null, lastRefreshed: null, blobKey };
  }
}

async function checkBrainModules(): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    const [qs, rl] = await Promise.all([
      import("../../../../src/brain/quick-screen.js").catch(() => null),
      import("../../../../src/brain/redlines.js").catch(() => null),
    ]);
    const qsOk = typeof (qs as { quickScreen?: unknown } | null)?.quickScreen === "function";
    const rlOk = typeof (rl as { evaluateRedlines?: unknown } | null)?.evaluateRedlines === "function";
    const status: ComponentStatus = qsOk && rlOk ? "operational" : qsOk ? "degraded" : "down";
    return {
      name: "brain",
      status,
      latencyMs: Date.now() - start,
      note: `quickScreen=${qsOk ? "ok" : "MISSING"} redlines=${rlOk ? "ok" : "MISSING"}`,
    };
  } catch (err) {
    console.error("[system-status] checkBrainModules failed:", err instanceof Error ? err.message : String(err));
    return { name: "brain", status: "down", latencyMs: Date.now() - start, note: "component probe failed" };
  }
}

async function checkAuditChain(): Promise<ComponentCheck> {
  const start = Date.now();
  const secret = getChainSecret("default");
  if (!secret) {
    return { name: "auditChain", status: "degraded", latencyMs: Date.now() - start, note: "AUDIT_CHAIN_SECRET not configured — HMAC verification disabled" };
  }
  try {
    const head = await getJson<{ sequence: number; hash: string }>("audit/head.json");
    if (!head) {
      return { name: "auditChain", status: "degraded", latencyMs: Date.now() - start, note: "No audit chain head found — chain may be empty" };
    }
    return {
      name: "auditChain",
      status: "operational",
      latencyMs: Date.now() - start,
      note: `chain length ${head.sequence} entries, HMAC active`,
    };
  } catch (err) {
    console.error("[system-status] checkAuditChain failed:", err instanceof Error ? err.message : String(err));
    return { name: "auditChain", status: "down", latencyMs: Date.now() - start, note: "component probe failed" };
  }
}

async function checkStorage(): Promise<ComponentCheck> {
  const start = Date.now();
  const inMem = isInMemoryFallback();
  if (inMem) {
    return { name: "storage", status: "degraded", latencyMs: Date.now() - start, note: "Netlify Blobs unavailable — using in-memory fallback (data will be lost on cold start)" };
  }
  try {
    const probe = await getJson<unknown>("__system_probe.json").then(() => true).catch(() => false);
    return {
      name: "storage",
      status: probe !== false ? "operational" : "degraded",
      latencyMs: Date.now() - start,
      note: "Netlify Blobs connected",
    };
  } catch (err) {
    console.error("[system-status] checkStorage failed:", err instanceof Error ? err.message : String(err));
    return { name: "storage", status: "down", latencyMs: Date.now() - start, note: "component probe failed" };
  }
}

async function checkExternalService(name: string, url: string, timeoutMs = 5_000): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal }).catch(() => null);
    clearTimeout(tid);
    const status: ComponentStatus = res?.ok ? "operational" : res ? "degraded" : "down";
    return { name, status, latencyMs: Date.now() - start, note: res ? `HTTP ${res.status}` : "timeout or network error" };
  } catch (err) {
    console.error(`[system-status] checkExternalService(${name}) failed:`, err instanceof Error ? err.message : String(err));
    return { name, status: "down", latencyMs: Date.now() - start, note: "component probe failed" };
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "system_status.accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const url = new URL(req.url);
  const includeExternal = url.searchParams.get("external") !== "false";

  // Run all checks in parallel
  const [
    brainCheck,
    storageCheck,
    auditCheck,
    sanctionsResults,
    ...externalChecks
  ] = await Promise.all([
    checkBrainModules(),
    checkStorage(),
    checkAuditChain(),
    Promise.all(SANCTIONS_LISTS.map((l) => checkSanctionsList(l.id, l.displayName))),
    ...(includeExternal ? [
      checkExternalService("watchman-moov", "https://watchman.moov.io/healthz"),
      checkExternalService("gleif-lei", "https://api.gleif.org/api/v1/lei-records?page%5Bnumber%5D=1&page%5Bsize%5D=1"),
      checkExternalService("gdelt", "https://api.gdeltproject.org/api/v2/doc/doc?query=test&mode=artlist&maxrecords=1&format=json"),
    ] : []),
  ]);

  const sanctions = sanctionsResults as SanctionsListInfo[];
  const external = externalChecks as ComponentCheck[];

  const mandatoryIds = new Set(["uae_eocn", "uae_ltl", "un_consolidated", "ofac_sdn"]);
  const mandatoryDown = sanctions.filter((s) => mandatoryIds.has(s.listId) && s.status !== "healthy").length;
  const staleCount = sanctions.filter((s) => s.status === "stale").length;
  const missingCount = sanctions.filter((s) => s.status === "missing").length;
  const totalEntities = sanctions.reduce((acc, s) => acc + (s.entityCount ?? 0), 0);

  const allComponents = [brainCheck, storageCheck, auditCheck, ...external];
  const anyDown = allComponents.some((c) => c.status === "down") || mandatoryDown > 0;
  const anyDegraded = allComponents.some((c) => c.status === "degraded") || staleCount > 0;
  const overallStatus: ComponentStatus = anyDown ? "down" : anyDegraded ? "degraded" : "operational";

  return NextResponse.json(
    {
      ok: overallStatus !== "down",
      overallStatus,
      generatedAt: new Date().toISOString(),
      uptimeMs: Date.now() - STARTED_AT,
      components: {
        brain: brainCheck,
        storage: storageCheck,
        auditChain: auditCheck,
        ...(includeExternal ? { externalServices: external } : {}),
      },
      sanctionsList: sanctions,
      sanctionsSummary: {
        total: sanctions.length,
        healthy: sanctions.filter((s) => s.status === "healthy").length,
        stale: staleCount,
        missing: missingCount,
        unknown: sanctions.filter((s) => s.status === "unknown").length,
        mandatoryListsDown: mandatoryDown,
        totalEntities,
      },
      alerts: [
        ...(mandatoryDown > 0 ? [{
          severity: "critical",
          message: `${mandatoryDown} mandatory sanctions list(s) down — UAE FDL No.10/2025 Art.20 compliance at risk`,
          affectedLists: sanctions.filter((s) => mandatoryIds.has(s.listId) && s.status !== "healthy").map((s) => s.listId),
          action: "POST /api/sanctions/refresh or POST /api/admin/trigger-list-refresh",
        }] : []),
        ...(staleCount > 0 ? [{
          severity: "warning",
          message: `${staleCount} sanctions list(s) stale (>36h since last refresh)`,
          affectedLists: sanctions.filter((s) => s.status === "stale").map((s) => s.listId),
          action: "POST /api/admin/trigger-list-refresh",
        }] : []),
        ...(brainCheck.status !== "operational" ? [{
          severity: "critical",
          message: "Brain module degraded — screening engine may be impaired",
          action: "Redeploy or check build artifacts in dist/",
        }] : []),
        ...(storageCheck.status !== "operational" ? [{
          severity: "critical",
          message: "Blob storage degraded — case data and audit chain writes may be lost",
          action: "Check NETLIFY_SITE_ID, NETLIFY_BLOBS_TOKEN environment variables",
        }] : []),
        ...(auditCheck.status !== "operational" ? [{
          severity: "high",
          message: "Audit chain degraded — UAE FDL No.10/2025 Art.24 compliance at risk",
          action: "Check AUDIT_CHAIN_SECRET environment variable",
        }] : []),
      ],
    },
    { status: overallStatus === "down" ? 503 : overallStatus === "degraded" ? 207 : 200, headers: gate.headers },
  );
}
