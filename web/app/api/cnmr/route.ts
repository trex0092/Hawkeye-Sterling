import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getStore } from "@netlify/blobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/cnmr — create a CNMR case record
// GET  /api/cnmr — list CNMR cases
//
// CNMR = Confirmed Name Match Report.
// When a screening hit against the UAE Local Terrorist List or UN Consolidated
// List is resolved as "positive" (same person), UAE law (CD74/2020 Art.21 and
// EOCN guidance) requires a Confirmed Name Match Report to be filed via goAML
// to EOCN and the supervising authority (MoE for DPMS) within 5 business days
// of the freezing measure.

export interface CnmrCase {
  id: string;
  createdAt: string;
  subjectId: string;
  subjectName: string;
  hitId: string;
  sourceList: "uae-local-terrorist" | "un-consolidated" | "un-1267" | "un-1988";
  listEntry: string;
  matchScore: number;
  freezeDate: string;      // ISO — when asset freeze was imposed
  deadlineDate: string;    // ISO — 5 business days from freeze
  status: "pending" | "drafted" | "filed" | "overdue";
  goAmlRef?: string;
  mlroSignedOff: boolean;
  mlroSignedOffAt?: string;
  filedAt?: string;
  narrativeDraft: string;
  supervisoryAuthority: "eocn" | "moe" | "both";
  reportingEntityId?: string;
}

function addBusinessDays(from: Date, days: number): Date {
  let count = 0;
  const d = new Date(from);
  while (count < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++; // skip weekends (UAE: Sat+Sun)
  }
  return d;
}

const STORE = "hawkeye-cnmr";

async function loadCases(tenant: string): Promise<CnmrCase[]> {
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    const raw = await store.get(`cases-${tenant}`, { type: "text" });
    return raw ? (JSON.parse(raw) as CnmrCase[]) : [];
  } catch {
    return [];
  }
}

async function saveCases(tenant: string, cases: CnmrCase[]): Promise<void> {
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    await store.set(`cases-${tenant}`, JSON.stringify(cases));
  } catch { /* blob store may not be available in local dev */ }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = (gate.record?.id ?? "anon").slice(0, 32);
  const cases = await loadCases(tenant);
  const now = Date.now();
  // Mark overdue
  const updated = cases.map((c) => ({
    ...c,
    status: (c.status === "pending" || c.status === "drafted") && new Date(c.deadlineDate).getTime() < now
      ? ("overdue" as CnmrCase["status"])
      : c.status,
  }));
  return NextResponse.json({ ok: true, cases: updated }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = (gate.record?.id ?? "anon").slice(0, 32);

  let body: Partial<CnmrCase>;
  try { body = (await req.json()) as Partial<CnmrCase>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  if (!body.subjectName || !body.sourceList) {
    return NextResponse.json({ ok: false, error: "subjectName and sourceList are required" }, { status: 400, headers: gate.headers });
  }

  const freezeDate = body.freezeDate ? new Date(body.freezeDate) : new Date();
  const deadlineDate = addBusinessDays(freezeDate, 5);

  const newCase: CnmrCase = {
    id: `cnmr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    subjectId: body.subjectId ?? "",
    subjectName: body.subjectName,
    hitId: body.hitId ?? "",
    sourceList: body.sourceList as CnmrCase["sourceList"],
    listEntry: body.listEntry ?? "",
    matchScore: body.matchScore ?? 0,
    freezeDate: freezeDate.toISOString(),
    deadlineDate: deadlineDate.toISOString(),
    status: "pending",
    mlroSignedOff: false,
    narrativeDraft: body.narrativeDraft ?? "",
    supervisoryAuthority: body.supervisoryAuthority ?? "both",
    reportingEntityId: body.reportingEntityId,
  };

  const cases = await loadCases(tenant);
  cases.unshift(newCase);
  await saveCases(tenant, cases);

  return NextResponse.json({ ok: true, case: newCase }, { headers: gate.headers });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = (gate.record?.id ?? "anon").slice(0, 32);

  let body: Partial<CnmrCase> & { id: string };
  try { body = (await req.json()) as Partial<CnmrCase> & { id: string }; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  if (!body.id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400, headers: gate.headers });

  const cases = await loadCases(tenant);
  const idx = cases.findIndex((c) => c.id === body.id);
  if (idx === -1) return NextResponse.json({ ok: false, error: "case not found" }, { status: 404, headers: gate.headers });

  const existing = cases[idx]!;
  const updated: CnmrCase = { ...existing, ...body } as CnmrCase;
  if (body.mlroSignedOff && !existing.mlroSignedOff) {
    updated.mlroSignedOffAt = new Date().toISOString();
  }
  if (body.status === "filed" && !existing.filedAt) {
    updated.filedAt = new Date().toISOString();
  }
  cases[idx] = updated;
  await saveCases(tenant, cases);

  return NextResponse.json({ ok: true, case: updated }, { headers: gate.headers });
}
