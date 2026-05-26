// GET /api/regulator/audit-trail
//
// Regulator-exclusive read-only view of the tenant audit chain.
// Accepts Ed25519-signed regulator JWT only — standard API keys are rejected.
//
// This provides UAE FIU / FATF / internal-audit examiners with independent
// access to audit evidence without operator involvement or the ability to
// tamper with what they see (chain is HMAC-sealed and read-only).
//
// Auth: Ed25519 regulator JWT (Authorization: Bearer <token>).
//       Token must include a tenant:<id> scope claim.
//
// Query params (same as /api/audit-trail):
//   page, pageSize, verified, fromDate, toDate, subjectId, eventType
//
// Response:
//   { ok, regulator: { examinerId, scope, exp }, totalEntries, page, pageSize, entries }
//
// Every access is written to the audit chain for the examiner's accountability.

import { NextResponse } from "next/server";
import { verifyRegulatorToken, tokenCoversScope } from "@/lib/server/regulator-jwt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { log } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

interface ChainEntry {
  seq: number;
  prevHash?: string;
  entryHash: string;
  payload: unknown;
  at: string;
}

function parsePositiveInt(raw: string | null, fallback: number, max?: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  const v = Number.isFinite(n) && n > 0 ? n : fallback;
  return max !== undefined ? Math.min(v, max) : v;
}

export async function GET(req: Request): Promise<NextResponse> {
  // Regulator-only: only Ed25519-signed regulator JWTs accepted
  const authHeader = req.headers.get("authorization") ?? "";
  const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!rawToken) {
    return NextResponse.json(
      { ok: false, error: "Authorization: Bearer <regulator-token> required" },
      { status: 401 },
    );
  }

  const regResult = await verifyRegulatorToken(rawToken);
  if (!regResult.ok) {
    log({ level: "warn", event: "regulator_access.token_invalid", reason: regResult.reason, route: "/api/regulator/audit-trail" });
    return NextResponse.json(
      { ok: false, error: "invalid regulator token", reason: regResult.reason },
      { status: 401 },
    );
  }

  const claims = regResult.claims;
  // Extract requested tenant from query param, or use first tenant scope
  const url = new URL(req.url);
  const requestedTenant = url.searchParams.get("tenantId");
  const tenantId = requestedTenant ?? claims.scope.find((s) => s.startsWith("tenant:"))?.replace("tenant:", "") ?? "default";

  if (!tokenCoversScope(claims, { tenantId })) {
    return NextResponse.json(
      { ok: false, error: "scope_denied", hint: `Token does not cover tenant:${tenantId}` },
      { status: 403 },
    );
  }

  // Audit the regulator access itself
  void writeAuditChainEntry(tenantId, {
    event: "regulator_access.audit_trail_read",
    examinerId: claims.sub,
    jti: claims.jti,
    tenantId,
    requestedAt: new Date().toISOString(),
  }).catch(() => undefined);

  // Load audit chain from Blobs
  let chain: ChainEntry[] = [];
  try {
    const { getStore } = await import("@netlify/blobs") as unknown as {
      getStore: (_opts: { name: string }) => { get: (_key: string, _opts?: { type?: string }) => Promise<unknown> };
    };
    const store = getStore({ name: `hawkeye-audit-chain-${tenantId}` });
    const raw = await store.get("chain.json", { type: "json" }) as ChainEntry[] | null;
    if (Array.isArray(raw)) chain = raw;
  } catch {
    return NextResponse.json({ ok: false, error: "audit chain temporarily unavailable" }, { status: 503 });
  }

  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 50, 200);
  const fromDate = url.searchParams.get("fromDate");
  const toDate = url.searchParams.get("toDate");
  const subjectId = url.searchParams.get("subjectId");
  const eventType = url.searchParams.get("eventType");

  // Filter
  let filtered = [...chain].reverse();
  if (fromDate) filtered = filtered.filter((e) => e.at >= fromDate);
  if (toDate) filtered = filtered.filter((e) => e.at <= toDate + "T23:59:59Z");
  if (subjectId) filtered = filtered.filter((e) => {
    const p = e.payload as Record<string, unknown> | null;
    return p?.subjectId === subjectId || p?.subjectName === subjectId;
  });
  if (eventType) filtered = filtered.filter((e) => {
    const p = e.payload as Record<string, unknown> | null;
    return typeof p?.event === "string" && p.event.includes(eventType);
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const entries = filtered.slice(start, start + pageSize);

  log({
    level: "info",
    event: "regulator_access.audit_trail_read",
    examinerId: claims.sub,
    tenantId,
    totalEntries: total,
    page,
  });

  return NextResponse.json({
    ok: true,
    regulator: {
      examinerId: claims.sub.replace("regulator:", ""),
      scope: claims.scope,
      exp: claims.exp,
    },
    totalEntries: total,
    page,
    pageSize,
    entries,
  });
}
