// Hawkeye Sterling — session-based RBAC middleware.
//
// Checks that the caller's portal session carries one of the allowedRoles
// before a sensitive operation proceeds. Routes that handle regulatory filings
// (SAR, goAML), AI overrides, four-eyes decisions, and admin operations must
// gate on MLRO or CO role; unrestricted API-key callers do not satisfy this gate
// because external callers are not issued portal sessions with a role claim.
//
// Usage:
//   const roleBlock = await requireRole(req, ['mlro', 'co']);
//   if (roleBlock) return roleBlock;
//
// Relationship to enforce():
//   - enforce() validates API keys / JWTs and enforces rate limits.
//   - requireRole() checks the portal session cookie for human-user role.
//   - Both are independent layers; sensitive routes call both in sequence.

import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "./auth";

export type PortalRole = "mlro" | "co" | "compliance" | "management" | "logistics" | "trading" | "accounts" | "admin";

export interface RoleGateResult {
  ok: true;
  role: string;
  userId: string;
  username: string;
}

/**
 * Verify that the inbound request carries a valid portal session with one of
 * the specified roles. Returns null when the role check passes (caller may
 * proceed), or a NextResponse with status 401/403 to be returned immediately.
 *
 * @param req          The inbound Next.js request (used to read cookies).
 * @param allowedRoles Roles that are permitted to call the route (case-insensitive).
 */
export async function requireRole(
  req: Request | NextRequest,
  allowedRoles: PortalRole[],
): Promise<NextResponse | null> {
  let token: string | undefined;
  try {
    const jar = await cookies();
    token = jar.get(SESSION_COOKIE)?.value;
  } catch {
    // cookies() throws outside the Next.js request context in tests; treat as no session.
    token = undefined;
  }

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Portal session required — this operation requires an authenticated MLRO or CO login.", code: "SESSION_REQUIRED" },
      { status: 401 },
    );
  }

  const session = verifySession(token);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Portal session expired or invalid — please log in again.", code: "SESSION_INVALID" },
      { status: 401 },
    );
  }

  const callerRole = (session.role ?? "").toLowerCase() as PortalRole;
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());

  // admin role is implicitly allowed everywhere if present.
  if (callerRole !== "admin" && !normalizedAllowed.includes(callerRole)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Insufficient privileges — this operation requires one of: ${allowedRoles.join(", ")}. Caller has role: ${callerRole}.`,
        code: "ROLE_FORBIDDEN",
        requiredRoles: allowedRoles,
      },
      { status: 403 },
    );
  }

  return null;
}

/**
 * Convenience: extract the role from the current session for logging/audit
 * without blocking. Returns null if no valid session is present.
 */
export async function sessionRole(): Promise<string | null> {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const session = verifySession(token);
    return session?.role ?? null;
  } catch {
    return null;
  }
}
