export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { loadUsers, saveUsers, withUsersLock, appendPermissionLog, ROLE_MODULES, type UserRole } from "../_store";
import { generateSalt, hashPassword } from "@/lib/server/auth";
import { adminAuth } from "@/lib/server/admin-auth";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export async function POST(req: Request) {
  const deny = adminAuth(req);
  if (deny) return deny;
  let body: { name: string; email: string; role: UserRole; username?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, role, username, password } = body;
  // addedBy is derived from the Authorization header (ADMIN_TOKEN), never from the request body.
  const addedBy = "admin";
  if (!name?.trim() || !email?.trim() || !role) {
    return NextResponse.json({ ok: false, error: "name, email, and role are required" }, { status: 400 });
  }
  if (!(role in ROLE_MODULES)) {
    return NextResponse.json(
      { ok: false, error: `role must be one of: ${Object.keys(ROLE_MODULES).join(", ")}` },
      { status: 400 },
    );
  }

  const emailLower = email.toLowerCase().trim();
  if (!emailLower || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(emailLower)) {
    return NextResponse.json({ ok: false, error: "A valid email address is required" }, { status: 400 });
  }

  const derivedUsername = (username?.trim() || emailLower.split("@")[0]!.replace(/[^a-z0-9._-]/gi, "").toLowerCase()).slice(0, 64);
  if (!derivedUsername) {
    return NextResponse.json({ ok: false, error: "Could not derive a valid username from the email address" }, { status: 400 });
  }

  if (password && password.length > 1024) {
    return NextResponse.json({ ok: false, error: "Password too long" }, { status: 400 });
  }

  const salt = generateSalt();
  const initialPassword = password?.trim() || randomBytes(16).toString("base64url");
  const hash = hashPassword(initialPassword, salt);

  const id = `usr-${randomBytes(4).toString("hex")}`;
  const newUser = {
    id,
    name: name.trim(),
    email: emailLower,
    role,
    lastLogin: "Never",
    active: true,
    modules: ROLE_MODULES[role] ?? [],
    username: derivedUsername,
    passwordHash: hash,
    passwordSalt: salt,
  };

  // Atomic check-then-write: re-load under the in-process lock so a concurrent
  // add-user request cannot sneak in a duplicate between our earlier check and save.
  const lockError = await withUsersLock(async () => {
    const freshUsers = await loadUsers();
    if (freshUsers.some((u) => u.email.toLowerCase() === emailLower)) {
      return { status: 409, message: "A user with this email already exists" };
    }
    if (freshUsers.some((u) => u.username?.toLowerCase() === derivedUsername.toLowerCase())) {
      return { status: 409, message: "Username already taken — choose a different one" };
    }
    await saveUsers([...freshUsers, newUser]);
    return null;
  });
  if (lockError) {
    return NextResponse.json({ ok: false, error: lockError.message }, { status: lockError.status });
  }

  const logEntry = {
    id: `log-${randomBytes(4).toString("hex")}`,
    timestamp: new Date().toISOString(),
    actor: addedBy,
    action: "role_assigned" as const,
    targetUserId: id,
    targetUserName: name.trim(),
    newRole: role,
    reason: `User account created with ${role} role. Login: ${derivedUsername}`,
  };
  await appendPermissionLog(logEntry);

  // FDL 10/2025 Art.20 — user creation is a privileged access-control event;
  // must be on the tamper-evident server-side chain.
  void writeAuditChainEntry(
    {
      event: "access.user_added",
      actor: addedBy,
      newUserId: id,
      targetUserName: name.trim(),
      email: emailLower,
      role,
    },
    "admin",
  ).catch((err) =>
    console.warn("[access/add-user] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );

  // Return user without exposing hash/salt to the client
  const { passwordHash: _h, passwordSalt: _s, ...safeUser } = newUser;
  return NextResponse.json({ ok: true, user: safeUser, logEntry, initialPassword }, { status: 201 });
}
