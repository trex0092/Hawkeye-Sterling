// GET /api/auth/totp/setup — generate a pending TOTP secret for the signed-in user.
// POST /api/auth/totp/setup — verify a 6-digit code and activate TOTP.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/server/auth";
import { loadUsers, saveUsers, withUsersLock, isUserStoreUnavailable, userStoreUnavailableResponse } from "@/app/api/access/_store";
import { generateTotpSecret, totpUri, verifyTotp, encryptTotpSecret } from "@/lib/server/totp";
import { setJson, getJson, del } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

const PENDING_KEY_PREFIX = "totp-pending/";
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface PendingRecord {
  base32: string;
  expiresAt: number;
}

async function getSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  if (!token) return null;
  return verifySession(token);
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const { secret: _s, base32 } = generateTotpSecret();

  let users: Awaited<ReturnType<typeof loadUsers>>;
  try {
    users = await loadUsers();
  } catch (err) {
    if (isUserStoreUnavailable(err)) return userStoreUnavailableResponse();
    throw err;
  }
  const user = users.find((u) => u.id === session.userId);
  if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  // Store pending secret server-side with 10-minute TTL.
  await setJson(`${PENDING_KEY_PREFIX}${session.userId}`, {
    base32,
    expiresAt: Date.now() + PENDING_TTL_MS,
  } satisfies PendingRecord);

  const uri = totpUri(user.username ?? user.name ?? user.id, base32);
  return NextResponse.json({ ok: true, uri, key: base32 });
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  let body: { code?: string };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const { code } = body;
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "Enter the 6-digit code from your authenticator app" }, { status: 400 });
  }

  const pending = await getJson<PendingRecord>(`${PENDING_KEY_PREFIX}${session.userId}`).catch(() => null);
  if (!pending || Date.now() > pending.expiresAt) {
    return NextResponse.json({ ok: false, error: "Setup session expired — start again" }, { status: 400 });
  }

  if (!verifyTotp(pending.base32, code)) {
    return NextResponse.json({ ok: false, error: "Incorrect code — check your authenticator app and try again" }, { status: 400 });
  }

  const encrypted = encryptTotpSecret(pending.base32);

  try {
    await withUsersLock(async () => {
      const users = await loadUsers();
      await saveUsers(users.map((u) =>
        u.id === session.userId ? { ...u, totpSecret: encrypted, totpEnabled: true } : u,
      ));
    });
  } catch (err) {
    if (isUserStoreUnavailable(err)) return userStoreUnavailableResponse();
    throw err;
  }

  // Clean up pending record.
  await del(`${PENDING_KEY_PREFIX}${session.userId}`).catch(() => {});

  void writeAuditChainEntry({
    event: "auth.totp_enabled",
    actor: session.username,
    userId: session.userId,
  }, process.env["DEFAULT_TENANT"] ?? "default").catch((err: unknown) => {
    console.warn("[auth/totp/setup] audit write failed:", err instanceof Error ? err.message : String(err));
  });

  return NextResponse.json({ ok: true });
}
