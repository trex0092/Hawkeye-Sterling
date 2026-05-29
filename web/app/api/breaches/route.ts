// GET  /api/breaches   — list breach records (filterable by status, category)
// POST /api/breaches   — create a new breach record

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  createBreach,
  listBreaches,
  seedBreachesIfEmpty,
  type BreachCategory,
  type BreachStatus,
} from "@/lib/server/breach-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_CATEGORIES = new Set<BreachCategory>(["minor", "moderate", "significant", "critical"]);
const VALID_STATUSES   = new Set<BreachStatus>(["open", "remediation_in_progress", "closed"]);

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Seed 7 confirmed live-system breaches on first call (idempotent).
  await seedBreachesIfEmpty().catch(() => undefined);

  const url = new URL(req.url);
  const status   = url.searchParams.get("status")   as BreachStatus | null;
  const category = url.searchParams.get("category") as BreachCategory | null;

  const breaches = await listBreaches({
    ...(status   && VALID_STATUSES.has(status)     ? { status }   : {}),
    ...(category && VALID_CATEGORIES.has(category) ? { category } : {}),
  });

  const summary = {
    total:       breaches.length,
    open:        breaches.filter((b) => b.status === "open").length,
    critical:    breaches.filter((b) => b.category === "critical").length,
    significant: breaches.filter((b) => b.category === "significant").length,
    moderate:    breaches.filter((b) => b.category === "moderate").length,
    minor:       breaches.filter((b) => b.category === "minor").length,
  };

  return NextResponse.json({ ok: true, breaches, summary }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  const { category, description, regulatoryBasis, linkedCaseId, linkedAuditSeq, owner } = body;

  if (!category || !VALID_CATEGORIES.has(category as BreachCategory)) {
    return NextResponse.json(
      { ok: false, error: `category must be one of: ${[...VALID_CATEGORIES].join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }
  if (!description || typeof description !== "string") {
    return NextResponse.json({ ok: false, error: "description required" }, { status: 400, headers: gate.headers });
  }
  if (!regulatoryBasis || typeof regulatoryBasis !== "string") {
    return NextResponse.json({ ok: false, error: "regulatoryBasis required" }, { status: 400, headers: gate.headers });
  }

  const breach = await createBreach({
    loggedBy:       gate.keyId,
    category:       category as BreachCategory,
    description:    description as string,
    regulatoryBasis: regulatoryBasis as string,
    owner:          typeof owner === "string" ? owner : "MLRO",
    ...(typeof linkedCaseId === "string"  ? { linkedCaseId }  : {}),
    ...(typeof linkedAuditSeq === "number" ? { linkedAuditSeq } : {}),
  });

  void writeAuditChainEntry(
    { event: "breaches.recorded", actor: gate.keyId, meta: { id: breach.breachId, category: breach.category } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, breach }, { status: 201, headers: gate.headers });
}
