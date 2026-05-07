import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getStore } from "@netlify/blobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/dpmsr-trigger — evaluate a transaction or set of transactions
//   against the AED 55,000 DPMSR threshold (CR134/2025 Art.3) and either
//   create a new obligation record or return the evaluation result without saving.
//
// GET  /api/dpmsr-trigger — return all pending/filed DPMSR obligations.
//
// CR134/2025 Art.3: any single cash transaction OR linked cash transactions
// totalling AED 55,000 or above must be reported as a DPMSR via goAML.
// This is NOT the same as a STR — it is triggered by amount alone.

export interface DpmsrTransaction {
  txnId: string;
  amountAed: number;
  channel: "cash" | "cash_courier" | "wire" | "card" | "crypto" | "other";
  at: string;
  customerId?: string;
  customerName?: string;
  linkedGroupId?: string;
  goldGrams?: number;
  goldSpec?: string;
}

export interface DpmsrObligation {
  id: string;
  createdAt: string;
  triggerType: "single" | "linked";
  totalAmountAed: number;
  transactionIds: string[];
  customerId?: string;
  customerName?: string;
  detectedAt: string;
  legalBasis: string;
  deadlineDate: string;
  status: "pending" | "filed" | "overdue";
  goAmlRef?: string;
  mlroSignedOff: boolean;
  mlroSignedOffAt?: string;
  filedAt?: string;
  notes?: string;
}

const THRESHOLD = 55_000;
const LINK_WINDOW_DAYS = 3;
const LEGAL_BASIS = "CR134/2025 Art.3 + MoE Circ.08/AML/2021";
const STORE = "hawkeye-dpmsr";

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

function addHours(from: Date, h: number): Date {
  return new Date(from.getTime() + h * 3_600_000);
}

function evaluateObligations(txns: DpmsrTransaction[]): Omit<DpmsrObligation, "id" | "createdAt" | "mlroSignedOff" | "status">[] {
  const cashTxns = txns.filter((t) => t.channel === "cash" || t.channel === "cash_courier");
  const now = new Date();
  const results: Omit<DpmsrObligation, "id" | "createdAt" | "mlroSignedOff" | "status">[] = [];

  // 1. Single transaction breaches
  for (const t of cashTxns) {
    if (t.amountAed >= THRESHOLD) {
      results.push({
        triggerType: "single",
        totalAmountAed: t.amountAed,
        transactionIds: [t.txnId],
        customerId: t.customerId,
        customerName: t.customerName,
        detectedAt: now.toISOString(),
        legalBasis: LEGAL_BASIS,
        deadlineDate: addHours(now, 24).toISOString(),
      });
    }
  }

  // 2. Linked-transaction aggregation — same customer within LINK_WINDOW_DAYS
  const byCustomer = new Map<string, DpmsrTransaction[]>();
  for (const t of cashTxns) {
    if (!t.customerId) continue;
    const arr = byCustomer.get(t.customerId);
    if (arr) arr.push(t); else byCustomer.set(t.customerId, [t]);
  }

  for (const [customerId, cts] of byCustomer) {
    const sorted = [...cts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    for (let i = 0; i < sorted.length; i++) {
      const anchor = sorted[i]!;
      const window = [anchor];
      let total = anchor.amountAed;
      for (let j = i + 1; j < sorted.length; j++) {
        const next = sorted[j]!;
        if (daysBetween(anchor.at, next.at) <= LINK_WINDOW_DAYS) {
          window.push(next);
          total += next.amountAed;
        }
      }
      if (window.length >= 2 && total >= THRESHOLD) {
        const txnIds = window.map((t) => t.txnId);
        if (!results.some((r) => txnIds.some((id) => r.transactionIds.includes(id)))) {
          results.push({
            triggerType: "linked",
            totalAmountAed: total,
            transactionIds: txnIds,
            customerId,
            customerName: anchor.customerName,
            detectedAt: now.toISOString(),
            legalBasis: LEGAL_BASIS,
            deadlineDate: addHours(now, 24).toISOString(),
          });
        }
        break;
      }
    }
  }

  // 3. Explicit linked groups
  const byGroup = new Map<string, DpmsrTransaction[]>();
  for (const t of cashTxns) {
    if (!t.linkedGroupId) continue;
    const arr = byGroup.get(t.linkedGroupId);
    if (arr) arr.push(t); else byGroup.set(t.linkedGroupId, [t]);
  }
  for (const [, gts] of byGroup) {
    const total = gts.reduce((s, t) => s + t.amountAed, 0);
    if (total >= THRESHOLD) {
      const txnIds = gts.map((t) => t.txnId);
      const firstGts = gts[0];
      if (!results.some((r) => txnIds.some((id) => r.transactionIds.includes(id)))) {
        results.push({
          triggerType: "linked",
          totalAmountAed: total,
          transactionIds: txnIds,
          customerId: firstGts?.customerId,
          customerName: firstGts?.customerName,
          detectedAt: now.toISOString(),
          legalBasis: LEGAL_BASIS,
          deadlineDate: addHours(now, 24).toISOString(),
        });
      }
    }
  }

  return results;
}

async function loadObligations(tenant: string): Promise<DpmsrObligation[]> {
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    const raw = await store.get(`obligations-${tenant}`, { type: "text" });
    return raw ? (JSON.parse(raw) as DpmsrObligation[]) : [];
  } catch { return []; }
}

async function saveObligations(tenant: string, items: DpmsrObligation[]): Promise<void> {
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    await store.set(`obligations-${tenant}`, JSON.stringify(items));
  } catch { /* local dev */ }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = (gate.record?.id ?? "anon").slice(0, 32);
  const now = Date.now();
  const obligations = await loadObligations(tenant);
  const updated = obligations.map((o) => ({
    ...o,
    status: (o.status === "pending") && new Date(o.deadlineDate).getTime() < now
      ? ("overdue" as DpmsrObligation["status"])
      : o.status,
  }));
  return NextResponse.json({ ok: true, obligations: updated }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = (gate.record?.id ?? "anon").slice(0, 32);

  let body: { transactions?: DpmsrTransaction[]; save?: boolean; patch?: Partial<DpmsrObligation> & { id: string } };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  // PATCH shortcut via POST body
  if (body.patch) {
    const obligations = await loadObligations(tenant);
    const idx = obligations.findIndex((o) => o.id === body.patch!.id);
    if (idx === -1) return NextResponse.json({ ok: false, error: "not found" }, { status: 404, headers: gate.headers });
    const existingObl = obligations[idx]!;
    const updated: DpmsrObligation = { ...existingObl, ...body.patch } as DpmsrObligation;
    if (body.patch.mlroSignedOff && !existingObl.mlroSignedOff) updated.mlroSignedOffAt = new Date().toISOString();
    if (body.patch.status === "filed" && !existingObl.filedAt) updated.filedAt = new Date().toISOString();
    obligations[idx] = updated;
    await saveObligations(tenant, obligations);
    return NextResponse.json({ ok: true, obligation: updated }, { headers: gate.headers });
  }

  if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
    return NextResponse.json({ ok: false, error: "transactions array required" }, { status: 400, headers: gate.headers });
  }

  const evalResults = evaluateObligations(body.transactions);

  if (body.save && evalResults.length > 0) {
    const obligations = await loadObligations(tenant);
    const newObs: DpmsrObligation[] = evalResults.map((r) => ({
      ...r,
      id: `dpmsr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      mlroSignedOff: false,
      status: "pending" as const,
    }));
    obligations.unshift(...newObs);
    await saveObligations(tenant, obligations);
    return NextResponse.json({ ok: true, obligationsCreated: newObs.length, obligations: newObs }, { headers: gate.headers });
  }

  return NextResponse.json({
    ok: true,
    threshold: THRESHOLD,
    legalBasis: LEGAL_BASIS,
    obligationsFound: evalResults.length,
    obligations: evalResults,
  }, { headers: gate.headers });
}
