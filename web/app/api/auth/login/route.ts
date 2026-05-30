export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto";
const RECOVERY_COMPARE_KEY = Buffer.from("hawkeye-token-compare-v1", "utf8");
import { loadUsers, saveUsers, withUsersLock, appendSession, maskIp } from "@/app/api/access/_store";
import { verifyPassword, hashPassword, generateSalt, issueSession, computeRequestFingerprint, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/server/auth";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { getJson, setJson, del } from "@/lib/server/store";
import { incrementCounter } from "@/lib/server/metrics-store";

// ── Brute-force protection ────────────────────────────────────────────────────
// Two independent guards — per-username AND per-IP — to block both targeted
// account attacks and credential-spraying (many usernames from one IP).
// Counters are persisted in Netlify Blobs so they survive Lambda cold-starts
// and are enforced across all concurrent instances.

const WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding window

// Per-username: hard-lock after 10 failures → stops targeted brute-force.
const USER_MAX_FAILURES = 10;
const USER_LOCK_PREFIX = "ratelimit/login-lock/";

// Per-IP: hard-lock after 50 failures → stops credential-spraying while
// tolerating shared IPs (corporate NAT). Raw IP is never stored — only a
// 16-char SHA-256 prefix.
const IP_MAX_FAILURES = 50;
const IP_LOCK_PREFIX = "ratelimit/login-ip/";

// Note: a previous in-memory `failureMap` with FIFO eviction lived here
// (commit 52004ff3). Superseded on this merge by the Blobs-backed counters
// above — Blobs persist across Lambdas and cold-starts.

interface AttemptRecord {
  count: number;
  windowStart: number;
  lockedUntil: number;
}

function usernameKey(username: string): string {
  return createHash("sha256").update(username.toLowerCase().trim()).digest("hex").slice(0, 16);
}

function ipKey(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

async function checkRateLimit(
  prefix: string,
  key: string,
  maxFailures: number,
): Promise<{ allowed: boolean; retryAfterSec?: number; lockoutWriteFailed?: boolean }> {
  const now = Date.now();
  const rec = await getJson<AttemptRecord>(`${prefix}${key}`).catch(() => null);
  if (!rec) return { allowed: true };
  if (rec.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  if (now - rec.windowStart > WINDOW_MS) {
    await del(`${prefix}${key}`).catch(() => undefined);
    return { allowed: true };
  }
  if (rec.count >= maxFailures) {
    const lockUntil = now + WINDOW_MS;
    let lockoutWriteFailed = false;
    try {
      await setJson(`${prefix}${key}`, { ...rec, lockedUntil: lockUntil });
    } catch (err) {
      // Lockout write failure is safety-critical: the lockout won't be
      // persisted across Lambda instances. Signal the caller to return 503
      // rather than quietly allowing the request — failing open on a lockout
      // write error would let an attacker brute-force if the blob store is
      // temporarily degraded.
      console.error("[auth/login] CRITICAL: lockout write failed — returning 503 to caller:", err instanceof Error ? err.message : String(err));
      lockoutWriteFailed = true;
    }
    return { allowed: false, retryAfterSec: Math.ceil(WINDOW_MS / 1000), lockoutWriteFailed };
  }
  return { allowed: true };
}

async function recordFailure(prefix: string, key: string): Promise<void> {
  const now = Date.now();
  const rec = await getJson<AttemptRecord>(`${prefix}${key}`).catch(() => null);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    await setJson(`${prefix}${key}`, { count: 1, windowStart: now, lockedUntil: 0 }).catch((err) => {
      console.warn("[auth/login] failure counter write failed:", err instanceof Error ? err.message : String(err));
    });
  } else {
    await setJson(`${prefix}${key}`, { ...rec, count: rec.count + 1 }).catch((err) => {
      console.warn("[auth/login] failure counter increment failed:", err instanceof Error ? err.message : String(err));
    });
  }
}

async function recordSuccess(prefix: string, key: string): Promise<void> {
  await del(`${prefix}${key}`).catch((err) => {
    console.warn("[auth/login] failure counter clear failed (non-critical):", err instanceof Error ? err.message : String(err));
  });
}

function clientIp(req: Request): string {
  // Use the LAST value in x-forwarded-for: it is appended by the trusted
  // Netlify CDN proxy and cannot be spoofed by the client.  The first value
  // is client-controlled and could be forged to bypass per-IP brute-force
  // protection by cycling through arbitrary source IPs.
  const fwd = req.headers.get("x-forwarded-for");
  const ips = fwd ? fwd.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return ips.length > 0 ? (ips[ips.length - 1] ?? "unknown") : "unknown";
}

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { username, password } = body;
  if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
    return NextResponse.json({ ok: false, error: "Username and password are required" }, { status: 400 });
  }

  // Limit input length to prevent hash-DoS
  if (username.length > 256 || password.length > 1024) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const uKey = usernameKey(username);
  const ip = clientIp(req);
  const iKey = ipKey(ip);

  // Per-IP check first — cheapest signal; catches credential-spraying.
  const ipRl = await checkRateLimit(IP_LOCK_PREFIX, iKey, IP_MAX_FAILURES);
  if (!ipRl.allowed) {
    if (ipRl.lockoutWriteFailed) {
      incrementCounter('hawkeye_auth_failures_total', 1, { reason: 'lockout_write_failed' });
      return NextResponse.json({ ok: false, error: "Service temporarily unavailable" }, { status: 503 });
    }
    console.warn("[auth/login] ip-rate-limited", { iKey, retryAfterSec: ipRl.retryAfterSec });
    return NextResponse.json(
      { ok: false, error: "Too many failed login attempts. Try again later.", retryAfterSec: ipRl.retryAfterSec },
      { status: 429, headers: { "retry-after": String(ipRl.retryAfterSec ?? 900) } },
    );
  }

  // Per-username check — catches targeted single-account attacks.
  const userRl = await checkRateLimit(USER_LOCK_PREFIX, uKey, USER_MAX_FAILURES);
  if (!userRl.allowed) {
    if (userRl.lockoutWriteFailed) {
      incrementCounter('hawkeye_auth_failures_total', 1, { reason: 'lockout_write_failed' });
      return NextResponse.json({ ok: false, error: "Service temporarily unavailable" }, { status: 503 });
    }
    console.warn("[auth/login] rate-limited", { uKey, ipHash: iKey, retryAfterSec: userRl.retryAfterSec });
    return NextResponse.json(
      { ok: false, error: "Too many failed login attempts. Try again later.", retryAfterSec: userRl.retryAfterSec },
      { status: 429, headers: { "retry-after": String(userRl.retryAfterSec ?? 900) } },
    );
  }

  // loadUsers() can throw at seed time if the deployment is missing both
  // LUISA_INITIAL_PASSWORD and AUDIT_CHAIN_SECRET (intentional fail-closed in
  // _store.ts). Surface the misconfiguration in logs but return the uniform
  // "Invalid username or password" 401 — never a 500 with a stack trace —
  // so the response shape stays identical to a real bad-credentials attempt.
  let users: Awaited<ReturnType<typeof loadUsers>>;
  try {
    users = await loadUsers();
  } catch (err) {
    console.error("[auth/login] loadUsers failed — login unavailable", {
      ipHash: iKey,
      reason: err instanceof Error ? err.message : String(err),
    });
    await new Promise((r) => setTimeout(r, 400));
    // Increment both counters on failure.
    await Promise.all([
      recordFailure(USER_LOCK_PREFIX, uKey),
      recordFailure(IP_LOCK_PREFIX, iKey),
    ]);
    console.warn("[auth/login] failed attempt", { uKey, ipHash: iKey, userFound: false });
    return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }
  // Active-user lookup for normal authentication.
  let user = users.find(
    (u) => u.active && u.username?.toLowerCase() === username.toLowerCase(),
  );

  const credentialsOk =
    !!user &&
    !!user.passwordHash &&
    !!user.passwordSalt &&
    verifyPassword(password, user.passwordSalt, user.passwordHash);

  if (!credentialsOk) {
    // Recovery path: LUISA_INITIAL_PASSWORD is a master recovery key for the
    // luisa/MLRO account. Search without the active filter so a deactivated or
    // corrupted account can still be recovered.
    const recoveryPassword = process.env["LUISA_INITIAL_PASSWORD"];
    const luisaRecord =
      user ?? users.find((u) => u.username?.toLowerCase() === "luisa") ?? users.find((u) => u.id === "usr-001");

    if (
      luisaRecord &&
      // Deny the recovery path if it has already been used — the operator must
      // use their re-hashed password. recoveryUsed prevents LUISA_INITIAL_PASSWORD
      // from acting as a permanent backdoor after the first recovery ceremony.
      !luisaRecord.recoveryUsed &&
      username.toLowerCase() === "luisa" &&
      recoveryPassword &&
      recoveryPassword.length >= 8 &&
      (() => {
        const ha = createHmac("sha256", RECOVERY_COMPARE_KEY).update(password).digest();
        const hb = createHmac("sha256", RECOVERY_COMPARE_KEY).update(recoveryPassword.trim()).digest();
        return timingSafeEqual(ha, hb);
      })()
    ) {
      const newSalt = generateSalt();
      const newHash = hashPassword(password, newSalt);
      // Track the new pwVersion so the issued session token matches Blobs.
      let savedPwVersion = (luisaRecord.pwVersion ?? 0) + 1;
      await withUsersLock(async () => {
        const freshUsers = await loadUsers();
        const freshRecord = freshUsers.find((u) => u.id === luisaRecord.id);
        savedPwVersion = (freshRecord?.pwVersion ?? luisaRecord.pwVersion ?? 0) + 1;
        await saveUsers(
          freshUsers.map((u) =>
            u.id === luisaRecord.id
              ? { ...u, passwordHash: newHash, passwordSalt: newSalt, pwVersion: savedPwVersion, active: true, recoveryUsed: true }
              : u,
          ),
        );
      }).catch((err: unknown) => {
        console.warn("[auth/login] recovery hash update failed:", err instanceof Error ? err.message : String(err));
      });
      console.warn("[auth/login] luisa recovery login succeeded — hash updated and recoveryUsed flagged (recovery path now permanently disabled)");
      // Must use the NEW pwVersion so the issued session token matches Blobs.
      // Using the stale luisaRecord.pwVersion causes /api/auth/me to see a
      // version mismatch and immediately invalidate the just-issued session.
      user = { ...luisaRecord, active: true, pwVersion: savedPwVersion };
    } else {
      // Uniform delay to prevent user enumeration via timing side-channel
      await new Promise((r) => setTimeout(r, 400));
      // Increment both counters on failure.
      await Promise.all([
        recordFailure(USER_LOCK_PREFIX, uKey),
        recordFailure(IP_LOCK_PREFIX, iKey),
      ]);
      console.warn("[auth/login] failed attempt", { uKey, ipHash: iKey, userFound: !!user });
      return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
    }
  }

  // TypeScript narrowing: user is guaranteed defined here — either normal auth
  // succeeded (user was found) or the recovery block set user before falling
  // through. The only other path returns 401 above.
  if (!user) return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });

  // Clear the per-username counter on success (the IP counter intentionally
  // stays to limit rapid username cycling from the same address).
  await recordSuccess(USER_LOCK_PREFIX, uKey);

  // Fingerprint binds the session to this login's IP + User-Agent so
  // /api/auth/me can detect mid-session IP changes.
  const userAgent = req.headers.get("user-agent") ?? "";
  const fpHash = computeRequestFingerprint(ip, userAgent);
  const token = issueSession(user.id, user.username!, user.role, user.pwVersion ?? 0, fpHash);

  // Geo-velocity: flag if the login IP changed since the last session.
  // Write the audit event before updating lastIpHash so both old and new
  // hashes are captured in the same record.
  if (user.lastIpHash && user.lastIpHash !== iKey) {
    void writeAuditChainEntry({
      event: "auth.login_ip_changed",
      actor: user.username ?? user.id,
      userId: user.id,
      prevIpHash: user.lastIpHash,
      currIpHash: iKey,
    }, process.env["DEFAULT_TENANT"] ?? "default").catch((err: unknown) => {
      console.warn("[auth/login] audit chain write failed:", err instanceof Error ? err.message : String(err));
    });
  }

  const isSecure = process.env["NODE_ENV"] !== "development";
  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict",
    maxAge: SESSION_TTL_S,
    path: "/",
    partitioned: isSecure,
  });

  // Persist last-login timestamp and IP hash for next-login geo-velocity check.
  // Fire-and-forget: the response is already built; a failed update loses only
  // the lastLogin timestamp — it must not block or fail the login response.
  void withUsersLock(async () => {
    const freshUsers = await loadUsers();
    await saveUsers(
      freshUsers.map((u) =>
        u.id === user.id
          ? { ...u, lastLogin: new Date().toISOString(), lastIpHash: iKey }
          : u,
      ),
    );
  }).catch((err) =>
    console.warn("[auth/login] lastLogin persist failed:", err instanceof Error ? err.message : String(err)),
  );

  // Record session for the Session Monitor (fire-and-forget; must not block login response).
  const now = new Date().toISOString();
  void appendSession({
    id: `sess_${randomBytes(6).toString("hex")}`,
    userId: user.id,
    userName: user.name ?? user.username ?? user.id,
    role: user.role,
    ipDisplay: maskIp(ip),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 120),
    started: now,
    lastActive: now,
    active: true,
  }).catch((err) =>
    console.warn("[auth/login] session record failed:", err instanceof Error ? err.message : String(err)),
  );

  return res;
}
