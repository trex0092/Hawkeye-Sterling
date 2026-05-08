export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { USERS } from "@/app/api/access/_store";
import { verifyPassword, issueSession, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/server/auth";

// ── Per-username brute-force protection ──────────────────────────────────────
// Tracks failed attempts per normalised username. Hard-locks after
// MAX_FAILURES within WINDOW_MS. Lock persists in this function instance
// (resets on cold start — acceptable for MVP; Redis lock preferred for prod,
// set via UPSTASH_REDIS_REST_URL in the operational integration tier).

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding window

interface AttemptRecord {
  count: number;
  windowStart: number;
  lockedUntil: number;
}

const failureMap = new Map<string, AttemptRecord>();

function usernameKey(username: string): string {
  return createHash("sha256").update(username.toLowerCase().trim()).digest("hex").slice(0, 16);
}

function checkRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const rec = failureMap.get(key);
  if (!rec) return { allowed: true };
  if (rec.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  if (now - rec.windowStart > WINDOW_MS) {
    failureMap.delete(key);
    return { allowed: true };
  }
  if (rec.count >= MAX_FAILURES) {
    const lockUntil = now + WINDOW_MS;
    failureMap.set(key, { ...rec, lockedUntil: lockUntil });
    return { allowed: false, retryAfterSec: Math.ceil(WINDOW_MS / 1000) };
  }
  return { allowed: true };
}

function recordFailure(key: string): void {
  const now = Date.now();
  const rec = failureMap.get(key);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    failureMap.set(key, { count: 1, windowStart: now, lockedUntil: 0 });
  } else {
    failureMap.set(key, { ...rec, count: rec.count + 1 });
  }
}

function recordSuccess(key: string): void {
  failureMap.delete(key);
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

  const key = usernameKey(username);
  const ip = clientIp(req);

  const rl = checkRateLimit(key);
  if (!rl.allowed) {
    console.warn("[auth/login] rate-limited", { key, ip, retryAfterSec: rl.retryAfterSec });
    return NextResponse.json(
      { ok: false, error: "Too many failed login attempts. Try again later.", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec ?? 900) } },
    );
  }

  const user = USERS.find(
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
    recordFailure(key);
    console.warn("[auth/login] failed attempt", { key, ip, userFound: !!user });
    return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }

  recordSuccess(key);
  const token = issueSession(user.id, user.username!, user.role);

  const isSecure = process.env["NODE_ENV"] === "production";
  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: SESSION_TTL_S,
    path: "/",
  });

  const idx = USERS.findIndex((u) => u.id === user.id);
  if (idx !== -1) {
    USERS[idx] = { ...USERS[idx]!, lastLogin: new Date().toISOString() };
  }

  return res;
}
