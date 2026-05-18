export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { loadUsers, saveUsers } from "@/app/api/access/_store";
import { verifyPassword, issueSession, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/server/auth";
import { getJson, setJson, del } from "@/lib/server/store";

// ── Per-username brute-force protection ──────────────────────────────────────
// Tracks failed attempts per normalised username. Hard-locks after
// MAX_FAILURES within WINDOW_MS. Lock persisted in Netlify Blobs so it
// survives Lambda cold-starts and is enforced across all concurrent instances.

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding window
const LOCK_PREFIX = "ratelimit/login-lock/";

interface AttemptRecord {
  count: number;
  windowStart: number;
  lockedUntil: number;
}

function usernameKey(username: string): string {
  return createHash("sha256").update(username.toLowerCase().trim()).digest("hex").slice(0, 16);
}

async function checkRateLimit(key: string): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const now = Date.now();
  const rec = await getJson<AttemptRecord>(`${LOCK_PREFIX}${key}`).catch(() => null);
  if (!rec) return { allowed: true };
  if (rec.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  if (now - rec.windowStart > WINDOW_MS) {
    await del(`${LOCK_PREFIX}${key}`).catch(() => undefined);
    return { allowed: true };
  }
  if (rec.count >= MAX_FAILURES) {
    const lockUntil = now + WINDOW_MS;
    await setJson(`${LOCK_PREFIX}${key}`, { ...rec, lockedUntil: lockUntil }).catch(() => undefined);
    return { allowed: false, retryAfterSec: Math.ceil(WINDOW_MS / 1000) };
  }
  return { allowed: true };
}

async function recordFailure(key: string): Promise<void> {
  const now = Date.now();
  const rec = await getJson<AttemptRecord>(`${LOCK_PREFIX}${key}`).catch(() => null);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    await setJson(`${LOCK_PREFIX}${key}`, { count: 1, windowStart: now, lockedUntil: 0 }).catch(() => undefined);
  } else {
    await setJson(`${LOCK_PREFIX}${key}`, { ...rec, count: rec.count + 1 }).catch(() => undefined);
  }
}

async function recordSuccess(key: string): Promise<void> {
  await del(`${LOCK_PREFIX}${key}`).catch(() => undefined);
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

  const rl = await checkRateLimit(key);
  if (!rl.allowed) {
    console.warn("[auth/login] rate-limited", { key, ip, retryAfterSec: rl.retryAfterSec });
    return NextResponse.json(
      { ok: false, error: "Too many failed login attempts. Try again later.", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec ?? 900) } },
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
    await recordFailure(key);
    console.warn("[auth/login] failed attempt", { key, ip, userFound: !!user });
    return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }

  await recordSuccess(key);
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

  // Persist last-login timestamp so it survives cold restarts
  const updatedUsers = users.map((u) =>
    u.id === user.id ? { ...u, lastLogin: new Date().toISOString() } : u,
  );
  await saveUsers(updatedUsers);

  return res;
}
