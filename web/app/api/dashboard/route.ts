// GET /api/dashboard
//
// Command-centre aggregator. Returns a consolidated snapshot of platform
// health, case pipeline metrics, sanctions alert counts, ongoing-monitor
// overdue subjects, and system status — in a single round trip so the
// dashboard can render without multiple parallel fetches.
//
// All sub-queries run with Promise.allSettled so a partial failure
// degrades gracefully: affected widgets show a "data unavailable" state
// rather than the whole dashboard erroring out.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { listKeys, getJson, isInMemoryFallback } from "@/lib/server/store";
import { listCases } from "@/lib/server/hs-case-store";
import { listBreaches, seedBreachesIfEmpty } from "@/lib/server/breach-store";

interface CaseIndex {
  version: 2;
  updatedAt: string;
  entries: Array<{ id: string; lastActivity: string; subject: string }>;
}

interface StrCaseRecord {
  id: string;
  status: string;
  updatedAt: string;
}

interface AuditMeta {
  lastChangeAt: string;
  lastChangeKind?: string;
}

interface DashboardPanel {
  ok: true;
  generatedAt: string;
  storageMode: "netlify_blobs" | "in_memory";
  cases: {
    total: number;
    byStatus: Record<string, number>;
    lastActivityAt: string | null;
  };
  strCases: {
    total: number;
    pending: number;
    filed: number;
    draft: number;
  };
  ongoingMonitor: {
    total: number;
    overdue: number;
  };
  recentAuditEvents: number;
  alerts: {
    sanctionsRefreshAge: string | null;
    pendingReviews: number;
  };
  systemHealth: {
    storageOk: boolean;
    anthropicConfigured: boolean;
    auditChainConfigured: boolean;
  };
  hsCases: {
    total: number;
    bySeverity: { critical: number; high: number; medium: number; low: number; clear: number };
    byStatus: Record<string, number>;
    slaNearing: number;
    slaBreach: number;
    pendingFourEyes: number;
    reviewDueSoon: number;
  };
  listHealth: {
    uaeEocnAgeHours: number | null;
    uaeLtlAgeHours: number | null;
    uaeEocnStale: boolean;
    uaeLtlStale: boolean;
  };
  breachSummary: {
    total: number;
    open: number;
    critical: number;
    significant: number;
    moderate: number;
    minor: number;
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  void writeAuditChainEntry(
    { event: "dashboard.accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);
  const tenant = tenantIdFromGate(gate);
  const t = tenant.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);

  // Seed breach register on first dashboard load.
  void seedBreachesIfEmpty().catch(() => undefined);

  const [caseIndexResult, strKeysResult, ongoingKeysResult, auditKeysResult, hsCasesResult, breachesResult, listHealthResult] =
    await Promise.allSettled([
      getJson<CaseIndex>(`hawkeye-cases/${t}/_index.json`),
      listKeys(`str-cases/${t}/`),
      listKeys("ongoing/subject/"),
      listKeys("hawkeye-audit-chain/"),
      listCases(tenant, {}),
      listBreaches(),
      Promise.all([
        getJson<{ updatedAt?: string }>("hawkeye-sanctions/uae_eocn/_meta.json").catch(() => null),
        getJson<{ updatedAt?: string }>("hawkeye-sanctions/uae_ltl/_meta.json").catch(() => null),
      ]),
    ]);

  // Cases
  const caseIndex = caseIndexResult.status === "fulfilled" ? caseIndexResult.value : null;
  const caseEntries = caseIndex?.entries ?? [];
  const casesByStatus: Record<string, number> = {};
  for (const _e of caseEntries) {
    // status not stored in index — just count totals
    casesByStatus["total"] = (casesByStatus["total"] ?? 0) + 1;
  }
  const lastActivity =
    caseEntries.length > 0
      ? caseEntries.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))[0]?.lastActivity ?? null
      : null;

  // STR cases
  const strKeys =
    strKeysResult.status === "fulfilled"
      ? strKeysResult.value.filter((k) => !k.endsWith("/_index.json"))
      : [];
  const strItems = await Promise.allSettled(strKeys.slice(0, 200).map((k) => getJson<StrCaseRecord>(k)));
  const strCases = strItems
    .filter((r): r is PromiseFulfilledResult<StrCaseRecord> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);
  const strByStatus = { total: strCases.length, pending: 0, filed: 0, draft: 0 };
  for (const c of strCases) {
    if (c.status === "pending_review" || c.status === "escalated") strByStatus.pending++;
    else if (c.status === "filed") strByStatus.filed++;
    else if (c.status === "draft") strByStatus.draft++;
  }

  // Ongoing monitor — count overdue
  const ongoingKeys = ongoingKeysResult.status === "fulfilled" ? ongoingKeysResult.value : [];
  const ongoingItems = await Promise.allSettled(
    ongoingKeys.slice(0, 500).map((k) =>
      getJson<{ nextDue?: string; status?: string }>(k),
    ),
  );
  const ongoingSubjects = ongoingItems
    .filter((r): r is PromiseFulfilledResult<{ nextDue?: string; status?: string }> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);
  const overdue = ongoingSubjects.filter((s) => {
    if (!s.nextDue) return false;
    return new Date(s.nextDue) < new Date();
  }).length;

  // Audit chain events
  const auditKeys = auditKeysResult.status === "fulfilled" ? auditKeysResult.value : [];

  // Sanctions refresh age — check meta key
  const sanctionsMeta = await getJson<AuditMeta>("hawkeye-sanctions/_meta.json").catch(() => null);

  // HS Cases stats
  const hsCases = hsCasesResult.status === "fulfilled" ? hsCasesResult.value : [];
  const now = Date.now();
  const hsBySeverity = { critical: 0, high: 0, medium: 0, low: 0, clear: 0 };
  const hsByStatus: Record<string, number> = {};
  let slaNearing = 0;
  let slaBreach = 0;
  let pendingFourEyes = 0;
  let reviewDueSoon = 0;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const twentyFourHours = 24 * 60 * 60 * 1000;
  for (const c of hsCases) {
    hsBySeverity[c.severity as keyof typeof hsBySeverity] = (hsBySeverity[c.severity as keyof typeof hsBySeverity] ?? 0) + 1;
    hsByStatus[c.status] = (hsByStatus[c.status] ?? 0) + 1;
    if (c.status !== "closed") {
      const remaining = new Date(c.slaDeadline).getTime() - now;
      if (remaining > 0 && remaining < twentyFourHours) slaNearing++;
      if (c.slaBreach) slaBreach++;
      if (c.fourEyesRequired && c.fourEyesStatus !== "approved") pendingFourEyes++;
      if (c.reviewDueDate) {
        const reviewIn = new Date(c.reviewDueDate).getTime() - now;
        if (reviewIn >= 0 && reviewIn < sevenDays) reviewDueSoon++;
      }
    }
  }

  // Breach summary
  const breaches = breachesResult.status === "fulfilled" ? breachesResult.value : [];
  const breachOpen = breaches.filter((b) => b.status !== "closed");
  const breachSummary = {
    total: breaches.length,
    open: breachOpen.length,
    critical: breachOpen.filter((b) => b.category === "critical").length,
    significant: breachOpen.filter((b) => b.category === "significant").length,
    moderate: breachOpen.filter((b) => b.category === "moderate").length,
    minor: breachOpen.filter((b) => b.category === "minor").length,
  };

  // List health — age of UAE EOCN and LTL lists in hours
  const [eocnMeta, ltlMeta] = listHealthResult.status === "fulfilled" ? listHealthResult.value : [null, null];
  const STALE_THRESHOLD_H = 36;
  const eocnAgeH = eocnMeta?.updatedAt ? Math.floor((now - new Date(eocnMeta.updatedAt).getTime()) / 3_600_000) : null;
  const ltlAgeH = ltlMeta?.updatedAt ? Math.floor((now - new Date(ltlMeta.updatedAt).getTime()) / 3_600_000) : null;

  const panel: DashboardPanel = {
    ok: true,
    generatedAt: new Date().toISOString(),
    storageMode: isInMemoryFallback() ? "in_memory" : "netlify_blobs",
    cases: {
      total: caseEntries.length,
      byStatus: casesByStatus,
      lastActivityAt: lastActivity,
    },
    strCases: strByStatus,
    ongoingMonitor: {
      total: ongoingSubjects.length,
      overdue,
    },
    recentAuditEvents: auditKeys.length,
    alerts: {
      sanctionsRefreshAge: sanctionsMeta?.lastChangeAt ?? null,
      pendingReviews: strByStatus.pending,
    },
    systemHealth: {
      storageOk: !isInMemoryFallback(),
      anthropicConfigured: Boolean(process.env["ANTHROPIC_API_KEY"]),
      auditChainConfigured: Boolean(process.env["AUDIT_CHAIN_SECRET"]),
    },
    hsCases: {
      total: hsCases.length,
      bySeverity: hsBySeverity,
      byStatus: hsByStatus,
      slaNearing,
      slaBreach,
      pendingFourEyes,
      reviewDueSoon,
    },
    listHealth: {
      uaeEocnAgeHours: eocnAgeH,
      uaeLtlAgeHours: ltlAgeH,
      uaeEocnStale: eocnAgeH !== null && eocnAgeH > STALE_THRESHOLD_H,
      uaeLtlStale: ltlAgeH !== null && ltlAgeH > STALE_THRESHOLD_H,
    },
    breachSummary,
  };

  return NextResponse.json(panel, { headers: gate.headers });
}
