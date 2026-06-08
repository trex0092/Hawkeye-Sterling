// GET /api/auth/me — returns the current session's user profile (no password fields).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { verifySession, computeRequestFingerprint, SESSION_COOKIE, issueSession, SESSION_TTL_S } from "@/lib/server/auth";
import { loadUsers, ROLE_LABEL, updateSessionActivity } from "../../access/_store";
import { cookies, headers } from "next/headers";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

// Build a Set-Cookie that clears the session cookie. Used on every 401/403
// path where the operator sent a cookie that we rejected, so the next
// /api/auth/me call returns `no_session` (silent) instead of re-firing the
// "Your session has expired" modal on every page reload. Attributes mirror
// the login route's set-cookie (same path, httpOnly, sameSite, secure — no
// `partitioned`) so the browser actually overwrites the existing cookie
// instead of creating a sibling entry that lingers in the cookie jar.
function clearSessionCookie(res: NextResponse): void {
  const isSecure = process.env["NODE_ENV"] !== "development";
  res.cookies.set(SESSION_COOKIE, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
  });
}

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
    const res = NextResponse.json(
      { ok: false, error: "Not authenticated", code: "session_invalid" },
      { status: 401 },
    );
    clearSessionCookie(res);
    return res;
  }

  const users = await loadUsers();
  const user = users.find((u) => u.id === session.userId);
  if (!user) {
    const res = NextResponse.json(
      { ok: false, error: "Session invalidated — please log in again", code: "session_invalidated" },
      { status: 401 },
    );
    clearSessionCookie(res);
    return res;
  }
  if (!user.active) {
    const res = NextResponse.json(
      { ok: false, error: "Account deactivated — contact your administrator", code: "account_deactivated" },
      { status: 403 },
    );
    clearSessionCookie(res);
    return res;
  }

  // Reject sessions issued before the most recent password change. This
  // catches the admin-reset case where the target user's cookie was not
  // cleared server-side. Sessions missing pwv (pre-field legacy tokens)
  // are treated as version 0 — they match users who have never had a reset.
  if ((session.pwv ?? 0) !== (user.pwVersion ?? 0)) {
    const res = NextResponse.json(
      { ok: false, error: "Session invalidated — please log in again", code: "session_invalidated" },
      { status: 401 },
    );
    clearSessionCookie(res);
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

  // Sliding-window renewal: refresh the session on every visit once the cookie
  // is more than 7 days old. With SESSION_TTL_S = 1 year, this ensures any
  // active user's session never expires — only logout or a password change ends
  // it. Preserves the original fpHash so the IP-change detector keeps its
  // login-time baseline.
  const nowSec = Math.floor(Date.now() / 1000);
  const RENEW_THRESHOLD_SEC = SESSION_TTL_S - 7 * 24 * 60 * 60; // renew if issued > 7 days ago
  let sessionExp = session.exp;
  let renewedToken: string | undefined;
  if (session.exp - nowSec < RENEW_THRESHOLD_SEC) {
    renewedToken = issueSession(
      session.userId,
      session.username,
      session.role,
      session.pwv ?? 0,
      session.fpHash ?? "",
      session.tenantId,
    );
    sessionExp = nowSec + SESSION_TTL_S;
  }

  const res = NextResponse.json({
    ok: true,
    user: {
      ...safe,
      roleLabel: ROLE_LABEL[user.role] ?? user.role,
      sessionExp,
    },
    ...(ipChanged ? { warning: { code: "IP_CHANGED", message: "Session IP changed since login — possible session theft." } } : {}),
  });

  if (renewedToken) {
    const isSecure = process.env["NODE_ENV"] !== "development";
    res.cookies.set(SESSION_COOKIE, renewedToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: SESSION_TTL_S,
      path: "/",
    });
  }

  return res;
}
