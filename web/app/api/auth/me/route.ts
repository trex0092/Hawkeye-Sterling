// GET /api/auth/me — returns the current session's user profile (no password fields).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { verifySession, computeRequestFingerprint, SESSION_COOKIE } from "@/lib/server/auth";
import { loadUsers, ROLE_LABEL, updateSessionActivity } from "../../access/_store";
import { cookies, headers } from "next/headers";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export async function GET(): Promise<NextResponse> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  // Distinguish "no cookie was sent at all" from "cookie was sent but
  // failed verification" so the client can keep the "Your session has
  // expired" modal silent for unauthenticated visitors. Without this split,
  // every page load on a browser that has never logged in (or whose cookie
  // was cleared) pops the expiry modal — the operator sees it "all the time"
  // even though there was no session to expire.
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated", code: "no_session" },
      { status: 401 },
    );
  }
  const session = verifySession(token);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated", code: "session_invalid" },
      { status: 401 },
    );
  }

  const users = await loadUsers();
  const user = users.find((u) => u.id === session.userId);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Session invalidated — please log in again", code: "session_invalidated" },
      { status: 401 },
    );
  }
  if (!user.active) {
    return NextResponse.json(
      { ok: false, error: "Account deactivated — contact your administrator", code: "account_deactivated" },
      { status: 403 },
    );
  }

  // Reject sessions issued before the most recent password change. This
  // catches the admin-reset case where the target user's cookie was not
  // cleared server-side. Sessions missing pwv (pre-field legacy tokens)
  // are treated as version 0 — they match users who have never had a reset.
  if ((session.pwv ?? 0) !== (user.pwVersion ?? 0)) {
    const isSecure = process.env["NODE_ENV"] !== "development";
    const res = NextResponse.json(
      { ok: false, error: "Session invalidated — please log in again", code: "session_invalidated" },
      { status: 401 },
    );
    res.cookies.set(SESSION_COOKIE, "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      partitioned: isSecure,
    });
    return res;
  }

  // Fingerprint check — detect mid-session IP changes (possible token theft).
  // Uses headers() from next/headers; safe for Node.js runtime.
  const hdrs = await headers();
  const ua = hdrs.get("user-agent") ?? "";
  const forwarded = hdrs.get("x-forwarded-for");
  const ips = forwarded ? forwarded.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const ip = ips.length > 0 ? (ips[ips.length - 1] ?? "unknown") : "unknown";
  const currentFp = computeRequestFingerprint(ip, ua);
  let ipChanged = false;
  if (session.fpHash && session.fpHash !== currentFp) {
    ipChanged = true;
    void writeAuditChainEntry({
      event: "auth.session_ip_change",
      actor: session.username,
      userId: session.userId,
    }, process.env["DEFAULT_TENANT"] ?? "default").catch((err: unknown) => {
      console.warn("[auth/me] audit chain write failed:", err instanceof Error ? err.message : String(err));
    });
  }

  const { passwordHash: _h, passwordSalt: _s, pwVersion: _v, lastIpHash: _ip, ...safe } = user;
  // Bump session lastActive — best-effort, must not block the response.
  void updateSessionActivity(session.userId).catch(() => {});
  return NextResponse.json({
    ok: true,
    user: {
      ...safe,
      roleLabel: ROLE_LABEL[user.role] ?? user.role,
      sessionExp: session.exp,
    },
    ...(ipChanged ? { warning: { code: "IP_CHANGED", message: "Session IP changed since login — possible session theft." } } : {}),
  });
}
