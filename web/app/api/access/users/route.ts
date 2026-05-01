export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { USERS, ROLE_MODULES, type AccessUser, type UserRole } from "../_store";

export function GET() {
  return NextResponse.json({ ok: true, users: USERS });
}

export async function POST(req: Request) {
  let body: Partial<AccessUser>;
  try {
    body = (await req.json()) as Partial<AccessUser>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name || !body.email || !body.role) {
    return NextResponse.json({ ok: false, error: "name, email and role are required" }, { status: 400 });
  }

  const role = body.role as UserRole;
  const newUser: AccessUser = {
    id: `usr-${String(Date.now()).slice(-6)}`,
    name: body.name,
    email: body.email,
    role,
    lastLogin: new Date().toISOString(),
    active: body.active ?? true,
    modules: body.modules ?? ROLE_MODULES[role] ?? [],
  };

  USERS.push(newUser);
  return NextResponse.json({ ok: true, user: newUser }, { status: 201 });
}
