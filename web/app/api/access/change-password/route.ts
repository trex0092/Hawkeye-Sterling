// POST /api/access/change-password
// Self-service password change for any authenticated user.
// Requires: currentPassword (verified before accepting newPassword).
// Unlike /api/access/set-password, this does NOT require compliance role —
// any logged-in user can change their own password.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { loadUsers, saveUsers } from "../_store";
import {
  generateSalt,
  hashPassword,
  verifyPassword,
  verifySession,
  SESSION_COOKIE,
} from "@/lib/server/auth";
import { cookies } from "next/headers";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: { currentPassword: string; newPassword: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { ok: false, error: "currentPassword and newPassword are required" },
      { status: 400 },
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { ok: false, error: "New password must be at least 8 characters" },
      { status: 400 },
    );
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { ok: false, error: "New password must differ from current password" },
      { status: 400 },
    );
  }

  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === session.userId);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const user = users[idx]!;
  if (!user.passwordHash || !user.passwordSalt) {
    return NextResponse.json(
      { ok: false, error: "Account has no password set — contact your MLRO" },
      { status: 400 },
    );
  }

  if (!verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
    return NextResponse.json({ ok: false, error: "Current password is incorrect" }, { status: 403 });
  }

  const salt = generateSalt();
  const hash = hashPassword(newPassword, salt);
  const updatedUsers = [...users];
  updatedUsers[idx] = {
    ...user,
    passwordHash: hash,
    passwordSalt: salt,
    pwVersion: (user.pwVersion ?? 0) + 1,
  };
  await saveUsers(updatedUsers);

  // FDL 10/2025 Art.24: every access-control change must be in the audit chain.
  void writeAuditChainEntry({
    event: "access.password_changed",
    actor: session.username,
    target: session.userId,
    body: { role: session.role },
  });

  // Invalidate the current session so the user must re-authenticate with the
  // new password. Using maxAge:0 mirrors the logout route. Without this,
  // the old session token would remain valid for up to SESSION_TTL_S after
  // the password change, which is a security gap.
  const isSecure = process.env["NODE_ENV"] !== "development";
  const res = NextResponse.json({ ok: true, sessionInvalidated: true });
  res.cookies.set(SESSION_COOKIE, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
  });
  return res;
}
