// POST /api/admin/issue-regulator-token
//
// Generates a regulator read-only JWT for UAE FIU / FATF / internal-audit
// examiners. Token is scoped to one-or-more tenants OR cases and signed
// with REPORT_ED25519_PRIVATE_KEY (same key as the audit-immutability
// certificate). Verifiers use the public key at
// /.well-known/hawkeye-pubkey.pem.
//
// Auth: ADMIN_TOKEN required (fail-closed). Only the operator may issue
// regulator tokens; the act of issuance is logged for audit linkability.
//
// Body:
//   {
//     examinerId: string,
//     tenants?: string[],
//     cases?: string[],
//     ttlDays?: number,        // default 7, max 90
//     notBefore?: string,      // ISO date — optional windowed audit
//     issuedBy: string         // operator email/GID — audit-trail key
//   }
//
// Response:
//   { ok, token, claims, publicKeyUrl, issuanceLogKey, hint }

import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/admin-auth";
import { setJson } from "@/lib/server/store";
import { issueRegulatorToken, tokenFingerprint } from "@/lib/server/regulator-jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface IssueBody {
  examinerId?: string;
  tenants?: string[];
  cases?: string[];
  ttlDays?: number;
  notBefore?: string;
  issuedBy?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  let body: IssueBody;
  try {
    body = (await req.json()) as IssueBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const examinerId = body.examinerId?.trim();
  const issuedBy = body.issuedBy?.trim();
  if (!examinerId) {
    return NextResponse.json({ ok: false, error: "examinerId required" }, { status: 400 });
  }
  if (!issuedBy) {
    return NextResponse.json({ ok: false, error: "issuedBy required (operator audit-trail attribution)" }, { status: 400 });
  }
  const tenants = (body.tenants ?? []).filter((s) => typeof s === "string" && s.length > 0);
  const cases = (body.cases ?? []).filter((s) => typeof s === "string" && s.length > 0);
  if (tenants.length === 0 && cases.length === 0) {
    return NextResponse.json(
      { ok: false, error: "at least one tenant or case must be supplied in scope" },
      { status: 400 },
    );
  }

  const issued = issueRegulatorToken({
    examinerId,
    scope: { tenants, cases },
    issuedBy,
    ...(typeof body.ttlDays === "number" ? { ttlDays: body.ttlDays } : {}),
    ...(typeof body.notBefore === "string" ? { notBefore: body.notBefore } : {}),
  });

  if (!issued) {
    return NextResponse.json(
      {
        ok: false,
        error: "regulator-token-signing-unavailable",
        hint: "Configure REPORT_ED25519_PRIVATE_KEY in Netlify env to enable regulator-token issuance. Same key as audit-immutability certificate.",
      },
      { status: 503 },
    );
  }

  // Log the issuance — this is itself an audit event (who issued, to whom,
  // scope, when). The token plaintext is NOT stored; only its fingerprint
  // (sha256 of the token, first 16 hex chars) so a stolen log doesn't
  // grant access.
  const fingerprint = tokenFingerprint(issued.token);
  const issuanceLogKey = `regulator-tokens/issued/${issued.claims.jti}.json`;
  await setJson(issuanceLogKey, {
    jti: issued.claims.jti,
    examinerId,
    issuedBy,
    scope: issued.claims.scope,
    iat: issued.claims.iat,
    exp: issued.claims.exp,
    nbf: issued.claims.nbf,
    fingerprint,
    issuedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    token: issued.token,
    claims: issued.claims,
    publicKeyUrl: issued.publicKeyUrl,
    issuanceLogKey,
    fingerprint,
    hint:
      "Pass this token in Authorization: Bearer <token> for read-only access. " +
      "Verifiers fetch the public key from publicKeyUrl and check signature + scope.",
  });
}
