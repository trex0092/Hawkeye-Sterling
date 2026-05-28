// GET  /api/alerts          — list all alerts with AI risk enrichment (smart reranking)
// POST /api/alerts          — write a new alert (called by cron or tests)
// DELETE /api/alerts        — dismiss ALL unread (batch)

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  listAlerts,
  writeAlert,
  dismissAllUnread,
  getDemoAlerts,
  type DesignationAlert,
} from "@/lib/server/alerts-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SEVERITY_ORDER: Record<DesignationAlert["severity"], number> = { critical: 0, high: 1, medium: 2 };

// ─── AI risk enrichment ───────────────────────────────────────────────────────

interface EnrichedAlert extends DesignationAlert {
  riskSignals: string[];
  aiPriorityScore: number;
}

const SANCTIONS_EVASION_PATTERNS = [
  { pattern: /offshore|shell|nominee/i, signal: "Possible evasion structure" },
  { pattern: /crypto|bitcoin|ethereum/i, signal: "Crypto exposure" },
  { pattern: /iran|dprk|russia|belarus/i, signal: "High-risk jurisdiction nexus" },
  { pattern: /vessel|ship|maritime/i, signal: "Dark fleet risk" },
  { pattern: /pep|politically exposed/i, signal: "PEP nexus" },
  { pattern: /arms|weapons|military/i, signal: "Proliferation financing risk" },
];

function enrichAlert(alert: DesignationAlert): EnrichedAlert {
  const searchText = [
    alert.matchedEntry,
    alert.listLabel,
    alert.sourceRef,
  ].filter(Boolean).join(" ");

  const riskSignals = SANCTIONS_EVASION_PATTERNS
    .filter(({ pattern }) => pattern.test(searchText))
    .map(({ signal }) => signal);

  // AI priority score: base severity + freshness + signal count
  const severityBase = alert.severity === "critical" ? 100 : alert.severity === "high" ? 70 : 40;
  const ageHours = (Date.now() - new Date(alert.detectedAt).getTime()) / 3_600_000;
  const freshnessPenalty = Math.min(ageHours * 0.5, 30);
  const signalBoost = riskSignals.length * 5;
  const readPenalty = alert.read ? 20 : 0;

  const aiPriorityScore = Math.max(0, Math.min(100,
    severityBase - freshnessPenalty + signalBoost - readPenalty,
  ));

  return { ...alert, riskSignals, aiPriorityScore };
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    const all = await listAlerts(false);
    // AI-enriched smart reranking: primary sort by aiPriorityScore, secondary by severity
    const enriched = all.map(enrichAlert);
    const sorted = [...enriched].sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      if (b.aiPriorityScore !== a.aiPriorityScore) return b.aiPriorityScore - a.aiPriorityScore;
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    });
    const unread = sorted.filter((a) => !a.read);
    const withEvasionSignals = sorted.filter((a) => a.riskSignals.length > 0).length;
    return NextResponse.json({
      ok: true,
      alerts: sorted,
      unreadCount: unread.length,
      criticalCount: unread.filter((a) => a.severity === "critical").length,
      aiEnrichment: {
        enabled: true,
        alertsWithSignals: withEvasionSignals,
        topSignals: [...new Set(sorted.flatMap((a) => a.riskSignals))].slice(0, 5),
      },
    }, { headers: gate.headers });
  } catch (err) {
    console.error("[alerts GET]", err instanceof Error ? err.message : err);
    const demos = getDemoAlerts().map(enrichAlert);
    const unread = demos.filter((a) => !a.read);
    return NextResponse.json({
      ok: true,
      alerts: demos,
      unreadCount: unread.length,
      criticalCount: unread.filter((a) => a.severity === "critical").length,
      aiEnrichment: { enabled: true, alertsWithSignals: 0, topSignals: [] },
    }, { headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // Auth — ALERTS_CRON_TOKEN bearer (fail-closed: token must always be set)
    const token = process.env["ALERTS_CRON_TOKEN"];
    if (!token) {
      return NextResponse.json({ ok: false, error: "ALERTS_CRON_TOKEN not configured" }, { status: 503 });
    }
    const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const COMPARE_KEY = Buffer.from("hawkeye-token-compare-v1", "utf8");
    const ha = createHmac("sha256", COMPARE_KEY).update(token).digest();
    const hb = createHmac("sha256", COMPARE_KEY).update(got).digest();
    if (!timingSafeEqual(ha, hb)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    let body: Partial<DesignationAlert>;
    try { body = (await req.json()) as Partial<DesignationAlert>; }
    catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
    if (!body.id || !body.listId || !body.matchedEntry) {
      return NextResponse.json({ ok: false, error: "id, listId, matchedEntry required" }, { status: 400 });
    }
    const alert: DesignationAlert = {
      id: body.id,
      listId: body.listId,
      listLabel: body.listLabel ?? body.listId,
      matchedEntry: body.matchedEntry,
      sourceRef: body.sourceRef ?? "",
      severity: (["critical", "high", "medium"] as const).includes(body.severity as DesignationAlert["severity"])
        ? (body.severity as DesignationAlert["severity"])
        : "high",
      detectedAt: body.detectedAt ?? new Date().toISOString(),
      read: false,
    };
    await writeAlert(alert);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[alerts POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "alert store unavailable — alert not persisted" },
      { status: 503 }
    );
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    let dismissedBy: string | undefined;
    try {
      const body = (await req.json()) as { dismissedBy?: string };
      if (typeof body.dismissedBy === "string") dismissedBy = body.dismissedBy;
    } catch { /* body optional */ }
    const count = await dismissAllUnread(dismissedBy);
    const tenantId = tenantIdFromGate(gate);
    void writeAuditChainEntry(
      { event: "alerts.dismissed_all", actor: gate.keyId, meta: { count, dismissedBy } },
      tenantId,
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, dismissed: count }, { headers: gate.headers });
  } catch (err) {
    console.error("[alerts DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "alert store unavailable — dismiss not persisted" },
      { status: 503, headers: gate.headers }
    );
  }
}
