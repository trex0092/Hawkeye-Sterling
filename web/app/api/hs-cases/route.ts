// POST /api/hs-cases         — create a new compliance case
// GET  /api/hs-cases         — list cases (filter: status, severity, subjectId, riskCategory)
//
// This is the spec-compliant compliance case management endpoint,
// separate from the localStorage-sync /api/cases endpoint.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  createCase,
  listCases,
  findOpenCaseForSubject,
  appendAuditSeq,
  type HsCaseStatus,
  type HsCaseHit,
} from "@/lib/server/hs-case-store";
import { categorize, slaDeadline, type ScreeningSeverity } from "@/lib/server/categorize";
import { seedBreachesIfEmpty } from "@/lib/server/breach-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const status      = url.searchParams.get("status")      as HsCaseStatus | null;
  const severity    = url.searchParams.get("severity");
  const subjectId   = url.searchParams.get("subjectId");
  const riskCategory = url.searchParams.get("riskCategory") as "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"|null;

  const cases = await listCases(tenant, {
    ...(status      ? { status }      : {}),
    ...(severity    ? { severity }    : {}),
    ...(subjectId   ? { subjectId }   : {}),
    ...(riskCategory ? { riskCategory } : {}),
  });

  // Summary stats for dashboard widgets.
  const summary = {
    total:    cases.length,
    bySeverity: {
      critical: cases.filter((c) => c.severity === "critical").length,
      high:     cases.filter((c) => c.severity === "high").length,
      medium:   cases.filter((c) => c.severity === "medium").length,
      low:      cases.filter((c) => c.severity === "low").length,
      clear:    cases.filter((c) => c.severity === "clear").length,
    },
    byStatus: cases.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    slaNearing: cases.filter((c) => {
      if (c.status === "closed") return false;
      const remaining = new Date(c.slaDeadline).getTime() - Date.now();
      return remaining > 0 && remaining < 24 * 60 * 60 * 1000;
    }).length,
    slaBreach: cases.filter((c) => c.slaBreach).length,
  };

  return NextResponse.json({ ok: true, cases, summary }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  const {
    subjectName, subjectId, severity,
    hits, linkedAuditSeq, isPep, hasStrSarOnRecord,
    provisionalScreening, createdBy, notes,
  } = body;

  if (!subjectName || typeof subjectName !== "string") {
    return NextResponse.json({ ok: false, error: "subjectName required" }, { status: 400, headers: gate.headers });
  }
  if (!subjectId || typeof subjectId !== "string") {
    return NextResponse.json({ ok: false, error: "subjectId required" }, { status: 400, headers: gate.headers });
  }

  const VALID_SEVERITIES = new Set(["clear", "low", "medium", "high", "critical"]);
  const normSeverity: ScreeningSeverity = VALID_SEVERITIES.has(severity as string)
    ? (severity as ScreeningSeverity)
    : "medium";

  const hitList = Array.isArray(hits) ? (hits as HsCaseHit[]) : [];
  const hitListIds = hitList.map((h) => h.listId ?? "").filter(Boolean);

  // Auto-dedup: if an open case already exists for this subject,
  // append the audit seq and return the existing case.
  const existing = await findOpenCaseForSubject(tenant, subjectId);
  if (existing) {
    if (typeof linkedAuditSeq === "number") {
      await appendAuditSeq(tenant, existing.caseId, linkedAuditSeq);
    }
    return NextResponse.json(
      { ok: true, case: existing, deduplicated: true },
      { headers: gate.headers },
    );
  }

  // Seed breaches on first case creation (ensures 7 pre-populated records exist).
  void seedBreachesIfEmpty().catch(() => undefined);

  // Categorize.
  const cat = categorize({
    severity: normSeverity,
    hitListIds,
    isPep: Boolean(isPep),
    hasStrSarOnRecord: Boolean(hasStrSarOnRecord),
  });

  const now = new Date().toISOString();
  const sla = slaDeadline(now, cat.riskCategory);

  const newCase = await createCase(tenant, {
    subjectName:    subjectName as string,
    subjectId:      subjectId as string,
    createdBy:      typeof createdBy === "string" ? createdBy : gate.keyId,
    status:         "open",
    severity:       normSeverity,
    riskCategory:   cat.riskCategory,
    dueDiligence:   cat.dueDiligence,
    reviewDueDate:  cat.nextReviewDate,
    hits:           hitList,
    enrichmentPending: true,
    slaDeadline:    sla,
    fourEyesRequired: cat.riskCategory === "CRITICAL" && hitListIds.some(
      (id) => ["ofac_sdn", "uae_ltl", "uae_eocn", "un_consolidated"].includes(id),
    ),
    seniorMgmtApproval: cat.seniorManagementApproval,
    autoFreezeRequired: cat.autoFreezeRequired,
    transactionSuspendRequired: cat.transactionSuspendRequired,
    provisionalScreening: Boolean(provisionalScreening),
    overrideReasons: cat.overrideReasons,
    notes: typeof notes === "string" ? notes : undefined,
  });

  if (typeof linkedAuditSeq === "number") {
    await appendAuditSeq(tenant, newCase.caseId, linkedAuditSeq);
  }

  void writeAuditChainEntry(
    { event: "case.created", actor: gate.keyId, meta: { caseId: newCase.caseId, subjectName: subjectName as string, severity: normSeverity } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json(
    { ok: true, case: newCase, categorization: cat },
    { status: 201, headers: gate.headers },
  );
}
