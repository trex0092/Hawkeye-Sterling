// GET  /api/regulatory-changes?days=7  — returns digest for the caller's tenant
// POST /api/regulatory-changes          — record a new regulatory change (admin only)
//
// Auth required for both verbs. POST is restricted to operators whose
// API key resolves to the portal_admin identity (tier=enterprise or
// keyId="portal_admin"). Regular API keys can only read (GET).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  getChangeDigest,
  recordChange,
  type RegulatoryChange,
} from "@/lib/server/regulatory-watcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ── GET /api/regulatory-changes?days=N ────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true, requireJsonBody: false });
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? Math.max(1, Math.min(365, parseInt(daysParam, 10) || 7)) : 7;

  const tenantId = tenantIdFromGate(gate);

  try {
    const digest = await getChangeDigest(tenantId, days);
    return NextResponse.json(
      { ok: true, days, ...digest },
      { headers: gate.headers },
    );
  } catch (err) {
    console.error(
      "[regulatory-changes GET] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { ok: false, error: "Failed to load regulatory changes" },
      { status: 500, headers: gate.headers },
    );
  }
}

// ── POST /api/regulatory-changes ─────────────────────────────────────────────

type NewChangeBody = Omit<RegulatoryChange, "id" | "detectedAt">;

const VALID_SOURCES: RegulatoryChange["source"][] = ["ofac", "un", "eu", "uk", "fatf", "local"];
const VALID_CHANGE_TYPES: RegulatoryChange["changeType"][] = [
  "new_designation",
  "delisting",
  "update",
  "advisory",
  "guidance",
];
const VALID_SEVERITIES: RegulatoryChange["severity"][] = ["critical", "high", "medium", "low"];

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  // Admin-only: only portal_admin or enterprise-tier callers may record changes.
  // This mirrors the "admin only" check used in /api/status and related routes.
  const isAdmin =
    gate.keyId === "portal_admin" || gate.tier?.id === "enterprise";
  if (!isAdmin) {
    return NextResponse.json(
      { ok: false, error: "Insufficient permissions — admin access required" },
      { status: 403, headers: gate.headers },
    );
  }

  let body: Partial<NewChangeBody>;
  try {
    body = (await req.json()) as Partial<NewChangeBody>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  // Validate required fields
  if (!body.source || !VALID_SOURCES.includes(body.source)) {
    return NextResponse.json(
      { ok: false, error: `source must be one of: ${VALID_SOURCES.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.changeType || !VALID_CHANGE_TYPES.includes(body.changeType)) {
    return NextResponse.json(
      { ok: false, error: `changeType must be one of: ${VALID_CHANGE_TYPES.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.severity || !VALID_SEVERITIES.includes(body.severity)) {
    return NextResponse.json(
      { ok: false, error: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }
  if (typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json(
      { ok: false, error: "title is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (typeof body.summary !== "string" || !body.summary.trim()) {
    return NextResponse.json(
      { ok: false, error: "summary is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (typeof body.effectiveDate !== "string" || !body.effectiveDate.trim()) {
    return NextResponse.json(
      { ok: false, error: "effectiveDate is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const change: Omit<RegulatoryChange, "id" | "detectedAt"> = {
    source: body.source,
    changeType: body.changeType,
    severity: body.severity,
    title: body.title.trim(),
    summary: body.summary.trim(),
    effectiveDate: body.effectiveDate.trim(),
    affectedLists: Array.isArray(body.affectedLists)
      ? body.affectedLists.filter((l): l is string => typeof l === "string")
      : [],
    ...(body.url ? { url: body.url } : {}),
  };

  try {
    const saved = await recordChange(change);
    void writeAuditChainEntry(
      { event: "regulatory_change.recorded", actor: gate.keyId, meta: { id: saved.id, source: change.source } },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json(
      { ok: true, change: saved },
      { status: 201, headers: gate.headers },
    );
  } catch (err) {
    console.error(
      "[regulatory-changes POST] recordChange failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { ok: false, error: "Failed to record regulatory change" },
      { status: 500, headers: gate.headers },
    );
  }
}
