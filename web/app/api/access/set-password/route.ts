export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { loadUsers, saveUsers, withUsersLock, isUserStoreUnavailable, userStoreUnavailableResponse } from "../_store";
import { generateSalt, hashPassword, verifySession, SESSION_COOKIE } from "@/lib/server/auth";
import { cookies } from "next/headers";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export async function POST(req: Request) {
  // Require an active session (only a logged-in CO/MLRO can reset passwords)
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  const session = verifySession(token);
  if (!session || (session.role !== "compliance" && session.role !== "mlro" && session.role !== "co" && session.role !== "managing_director")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { userId: string; newPassword: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, newPassword } = body;
  if (!userId || !newPassword) {
    return NextResponse.json({ ok: false, error: "userId and newPassword are required" }, { status: 400 });
  }
  if (newPassword.trim().length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 non-whitespace characters" }, { status: 400 });
  }
  if (newPassword.length > 1024) {
    return NextResponse.json({ ok: false, error: "Password too long" }, { status: 400 });
  }
  if (newPassword.length > 1024) {
    return NextResponse.json({ ok: false, error: "Password too long" }, { status: 400 });
  }

  // Role power: prevent lower-privilege user from resetting a higher-privilege account.
  const ROLE_POWER: Record<string, number> = {
    analyst: 1, compliance_assistant: 1, co: 2, compliance: 2, mlro: 3, managing_director: 3,
  };
  const callerPower = ROLE_POWER[session.role] ?? 0;

  let notFound = false;
  let privilegeViolation = false;
  let savedUsername: string | undefined;

  const storeOk = await withUsersLock(async () => {
    const users = await loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) { notFound = true; return; }

    const target = users[idx]!;
    const targetPower = ROLE_POWER[target.role] ?? 0;
    if (targetPower >= callerPower && target.id !== session.userId) { privilegeViolation = true; return; }

    const salt = generateSalt();
    const hash = hashPassword(newPassword, salt);
    const updatedUsers = [...users];
    updatedUsers[idx] = {
      ...target,
      passwordHash: hash,
      passwordSalt: salt,
      pwVersion: (target.pwVersion ?? 0) + 1,
    };
    await saveUsers(updatedUsers);
    savedUsername = updatedUsers[idx]!.username;
  }).then(() => true, (err: unknown) => {
    if (isUserStoreUnavailable(err)) return false;
    throw err;
  });
  if (!storeOk) return userStoreUnavailableResponse();

  if (notFound) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }
  if (privilegeViolation) {
    return NextResponse.json({ ok: false, error: "Cannot reset password for a higher-privileged account" }, { status: 403 });
  }

  // Federal Decree-Law No. 10 of 2025 Art.24: privileged password reset must be in the tamper-evident
  // audit chain so regulators can review all access-control changes.
  void writeAuditChainEntry({
    event: "access.password_reset_by_admin",
    actor: session.username,
    target: userId,
    role: session.role,
  }, process.env["DEFAULT_TENANT"] ?? "default").catch((err: unknown) => {
    console.warn("[set-password] audit chain write failed:", err instanceof Error ? err.message : String(err));
  });

  return NextResponse.json({ ok: true, username: savedUsername });
}
