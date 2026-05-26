// POST /api/regulator/token
//
// Admin-only endpoint to issue regulator read-only JWTs (Ed25519-signed).
// UAE FIU / FATF / internal-audit examiners need scoped access to a tenant's
// audit trail and case history without operator involvement.
//
// Auth: requires ADMIN_TOKEN (same header as portal). API keys rejected.
//
// Request:
//   {
//     examinerId: string,
//     scope: { tenants?: string[], cases?: string[] },
//     ttlDays?: number,           // 1–90, default 7
//     notBefore?: string,         // ISO 8601 date string (optional)
//   }
//
// Response:
//   { ok: true, token: string, claims: RegulatorTokenClaims, publicKeyUrl: string }

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { issueRegulatorToken } from "@/lib/server/regulator-jwt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { log } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  // Admin-only: validate ADMIN_TOKEN via constant-time compare
  const adminToken = process.env["ADMIN_TOKEN"];
  if (!adminToken) {
    return NextResponse.json({ ok: false, error: "Regulator token issuance not configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!presented) {
    return NextResponse.json({ ok: false, error: "Authorization: Bearer <ADMIN_TOKEN> required" }, { status: 401 });
  }

  const enc = new TextEncoder();
  const a = enc.encode(adminToken);
  const b = enc.encode(presented);
  const adminMatch = a.byteLength === b.byteLength && timingSafeEqual(a, b);
  if (!adminMatch) {
    log({ level: "warn", route: "/api/regulator/token", event: "regulator_token.unauthorized_issue_attempt" });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    examinerId?: string;
    scope?: { tenants?: string[]; cases?: string[] };
    ttlDays?: number;
    notBefore?: string;
    issuedBy?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.examinerId) {
    return NextResponse.json({ ok: false, error: "examinerId is required" }, { status: 422 });
  }
  if (!body.scope?.tenants?.length && !body.scope?.cases?.length) {
    return NextResponse.json({ ok: false, error: "scope must include at least one tenant or case" }, { status: 422 });
  }

  let result: ReturnType<typeof issueRegulatorToken>;
  try {
    result = issueRegulatorToken({
      examinerId: body.examinerId,
      scope: body.scope,
      ttlDays: body.ttlDays,
      notBefore: body.notBefore,
      issuedBy: body.issuedBy ?? "admin",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 422 },
    );
  }

  if (!result) {
    return NextResponse.json(
      { ok: false, error: "REPORT_ED25519_PRIVATE_KEY not configured — cannot issue regulator tokens", hint: "Set REPORT_ED25519_PRIVATE_KEY in environment variables" },
      { status: 503 },
    );
  }

  // Audit log: every token issuance is recorded. Token itself is NOT logged.
  for (const tenantId of body.scope.tenants ?? ["default"]) {
    void writeAuditChainEntry({
      actor: "admin",
      event: "regulator_token.issued",
      examinerId: body.examinerId,
      jti: result.claims.jti,
      scope: result.claims.scope,
      exp: result.claims.exp,
      issuedBy: result.claims.issuedBy,
    }, tenantId).catch(() => undefined);
  }

  log({
    level: "info",
    route: "/api/regulator/token",
    event: "regulator_token.issued",
    examinerId: body.examinerId,
    jti: result.claims.jti,
    scope: result.claims.scope,
    ttlDays: body.ttlDays ?? 7,
  });

  return NextResponse.json({
    ok: true,
    token: result.token,
    claims: result.claims,
    publicKeyUrl: result.publicKeyUrl,
  });
}
