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
import { listKeys, getJson, isInMemoryFallback } from "@/lib/server/store";

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
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const t = tenant.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);

  const [caseIndexResult, strKeysResult, ongoingKeysResult, auditKeysResult] =
    await Promise.allSettled([
      getJson<CaseIndex>(`hawkeye-cases/${t}/_index.json`),
      listKeys(`str-cases/${t}/`),
      listKeys("ongoing/subject/"),
      listKeys("hawkeye-audit-chain/"),
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
  };

  return NextResponse.json(panel, { headers: gate.headers });
}
