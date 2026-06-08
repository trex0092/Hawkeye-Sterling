// POST /api/auth/totp/disable — verify a code then remove TOTP from the account.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/server/auth";
import { loadUsers, saveUsers, withUsersLock } from "@/app/api/access/_store";
import { verifyTotp, decryptTotpSecret } from "@/lib/server/totp";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

async function getSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  if (!token) return null;
  return verifySession(token);
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

  const users = await loadUsers();
  const user = users.find((u) => u.id === session.userId);
  if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  if (!user.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ ok: false, error: "TOTP is not enabled on this account" }, { status: 400 });
  }

  let base32: string;
  try { base32 = decryptTotpSecret(user.totpSecret); }
  catch { return NextResponse.json({ ok: false, error: "TOTP secret error — contact your administrator" }, { status: 500 }); }

  if (!verifyTotp(base32, code)) {
    return NextResponse.json({ ok: false, error: "Incorrect code" }, { status: 400 });
  }

  await withUsersLock(async () => {
    const freshUsers = await loadUsers();
    await saveUsers(freshUsers.map((u) =>
      u.id === session.userId ? { ...u, totpSecret: undefined, totpEnabled: false } : u,
    ));
  });

  void writeAuditChainEntry({
    event: "auth.totp_disabled",
    actor: session.username,
    userId: session.userId,
  }, process.env["DEFAULT_TENANT"] ?? "default").catch((err: unknown) => {
    console.warn("[auth/totp/disable] audit write failed:", err instanceof Error ? err.message : String(err));
  });

  return NextResponse.json({ ok: true });
}
