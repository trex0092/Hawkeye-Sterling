export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { loadUsers, saveUsers } from "@/app/api/access/_store";
import { verifyPassword, issueSession, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/server/auth";
import { getJson, setJson, del } from "@/lib/server/store";

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
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
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
    await setJson(`${prefix}${key}`, { ...rec, lockedUntil: lockUntil }).catch(() => undefined);
    return { allowed: false, retryAfterSec: Math.ceil(WINDOW_MS / 1000) };
  }
  return { allowed: true };
}

async function recordFailure(prefix: string, key: string): Promise<void> {
  const now = Date.now();
  const rec = await getJson<AttemptRecord>(`${prefix}${key}`).catch(() => null);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    await setJson(`${prefix}${key}`, { count: 1, windowStart: now, lockedUntil: 0 }).catch(() => undefined);
  } else {
    await setJson(`${prefix}${key}`, { ...rec, count: rec.count + 1 }).catch(() => undefined);
  }
}

async function recordSuccess(prefix: string, key: string): Promise<void> {
  await del(`${prefix}${key}`).catch(() => undefined);
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
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
    console.warn("[auth/login] ip-rate-limited", { iKey, retryAfterSec: ipRl.retryAfterSec });
    return NextResponse.json(
      { ok: false, error: "Too many failed login attempts. Try again later.", retryAfterSec: ipRl.retryAfterSec },
      { status: 429, headers: { "retry-after": String(ipRl.retryAfterSec ?? 900) } },
    );
  }

  // Per-username check — catches targeted single-account attacks.
  const userRl = await checkRateLimit(USER_LOCK_PREFIX, uKey, USER_MAX_FAILURES);
  if (!userRl.allowed) {
    console.warn("[auth/login] rate-limited", { uKey, ip, retryAfterSec: userRl.retryAfterSec });
    return NextResponse.json(
      { ok: false, error: "Too many failed login attempts. Try again later.", retryAfterSec: userRl.retryAfterSec },
      { status: 429, headers: { "retry-after": String(userRl.retryAfterSec ?? 900) } },
    );
  }

  const users = await loadUsers();
  const user = users.find(
    (u) => u.active && u.username?.toLowerCase() === username.toLowerCase(),
  );

  if (
    !user ||
    !user.passwordHash ||
    !user.passwordSalt ||
    !verifyPassword(password, user.passwordSalt, user.passwordHash)
  ) {
    // Uniform delay to prevent user enumeration via timing side-channel
    await new Promise((r) => setTimeout(r, 400));
    // Increment both counters on failure.
    await Promise.all([
      recordFailure(USER_LOCK_PREFIX, uKey),
      recordFailure(IP_LOCK_PREFIX, iKey),
    ]);
    console.warn("[auth/login] failed attempt", { uKey, ip, userFound: !!user });
    return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }

  // Clear the per-username counter on success (the IP counter intentionally
  // stays to limit rapid username cycling from the same address).
  await recordSuccess(USER_LOCK_PREFIX, uKey);
  const token = issueSession(user.id, user.username!, user.role, user.pwVersion ?? 0);

  const isSecure = process.env["NODE_ENV"] === "production";
  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: SESSION_TTL_S,
    path: "/",
  });

  // Persist last-login timestamp so it survives cold restarts
  const updatedUsers = users.map((u) =>
    u.id === user.id ? { ...u, lastLogin: new Date().toISOString() } : u,
  );
  await saveUsers(updatedUsers);

  return res;
}
