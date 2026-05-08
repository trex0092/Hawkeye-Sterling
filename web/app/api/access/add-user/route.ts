export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { loadUsers, saveUsers, appendPermissionLog, ROLE_MODULES, type UserRole } from "../_store";
import { generateSalt, hashPassword } from "@/lib/server/auth";
import { adminAuth } from "@/lib/server/admin-auth";

export async function POST(req: Request) {
  const deny = adminAuth(req);
  if (deny) return deny;
  let body: { name: string; email: string; role: UserRole; username?: string; password?: string; addedBy?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, role, username, password, addedBy = "Luisa Fernanda" } = body;
  if (!name?.trim() || !email?.trim() || !role) {
    return NextResponse.json({ ok: false, error: "name, email, and role are required" }, { status: 400 });
  }

  const users = await loadUsers();
  const emailLower = email.toLowerCase().trim();
  if (users.some((u) => u.email.toLowerCase() === emailLower)) {
    return NextResponse.json({ ok: false, error: "A user with this email already exists" }, { status: 409 });
  }

  const derivedUsername = username?.trim() || emailLower.split("@")[0]!.replace(/[^a-z0-9._-]/gi, "").toLowerCase();
  if (users.some((u) => u.username?.toLowerCase() === derivedUsername.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "Username already taken — choose a different one" }, { status: 409 });
  }

  const salt = generateSalt();
  const initialPassword = password?.trim() || randomBytes(16).toString("base64url");
  const hash = hashPassword(initialPassword, salt);

  const id = `usr-${String(Date.now()).slice(-6)}`;
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
  await saveUsers([...users, newUser]);

  const logEntry = {
    id: `log-${String(Date.now()).slice(-6)}`,
    timestamp: new Date().toISOString(),
    actor: addedBy,
    action: "role_assigned" as const,
    targetUserId: id,
    targetUserName: name.trim(),
    newRole: role,
    reason: `User account created with ${role} role. Login: ${derivedUsername}`,
  };
  await appendPermissionLog(logEntry);

  // Return user without exposing hash/salt to the client
  const { passwordHash: _h, passwordSalt: _s, ...safeUser } = newUser;
  return NextResponse.json({ ok: true, user: safeUser, logEntry, initialPassword }, { status: 201 });
}
