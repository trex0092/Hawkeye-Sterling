export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { USERS, PERMISSION_LOG, ROLE_MODULES, type UserRole } from "../_store";

export async function POST(req: Request) {
  let body: { name: string; email: string; role: UserRole; addedBy?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, role, addedBy = "System Administrator" } = body;
  if (!name?.trim() || !email?.trim() || !role) {
    return NextResponse.json({ ok: false, error: "name, email, and role are required" }, { status: 400 });
  }

  const emailLower = email.toLowerCase().trim();
  if (USERS.some((u) => u.email.toLowerCase() === emailLower)) {
    return NextResponse.json({ ok: false, error: "A user with this email already exists" }, { status: 409 });
  }

  const id = `usr-${String(Date.now()).slice(-6)}`;
  const newUser = {
    id,
    name: name.trim(),
    email: emailLower,
    role,
    lastLogin: "Never",
    active: true,
    modules: ROLE_MODULES[role] ?? [],
  };
  USERS.push(newUser);

  const logEntry = {
    id: `log-${String(Date.now()).slice(-6)}`,
    timestamp: new Date().toISOString(),
    actor: addedBy,
    action: "role_assigned" as const,
    targetUserId: id,
    targetUserName: name.trim(),
    newRole: role,
    reason: `User account created with ${role} role.`,
  };
  PERMISSION_LOG.push(logEntry);

  return NextResponse.json({ ok: true, user: newUser, logEntry }, { status: 201 });
}
