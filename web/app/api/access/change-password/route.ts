// POST /api/access/change-password
// Self-service password change for any authenticated user.
// Requires: currentPassword (verified before accepting newPassword).
// Unlike /api/access/set-password, this does NOT require compliance role —
// any logged-in user can change their own password.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { USERS } from "../_store";
import {
  generateSalt,
  hashPassword,
  verifyPassword,
  verifySession,
  SESSION_COOKIE,
} from "@/lib/server/auth";
import { cookies } from "next/headers";

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

  const idx = USERS.findIndex((u) => u.id === session.userId);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const user = USERS[idx]!;
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
  USERS[idx] = { ...user, passwordHash: hash, passwordSalt: salt };

  return NextResponse.json({ ok: true });
}
