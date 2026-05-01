export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export type UserRole = "viewer" | "analyst" | "supervisor" | "mlro" | "admin";

export interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastLogin: string;
  active: boolean;
  modules: string[];
}

const ALL_MODULES = [
  "Screening",
  "STR Cases",
  "MLRO Advisor",
  "Oversight",
  "Responsible AI",
  "EWRA",
  "Playbook",
  "Investigation",
  "Audit Trail",
  "Access Control",
];

const ROLE_MODULES: Record<UserRole, string[]> = {
  viewer: ["Screening", "Audit Trail"],
  analyst: ["Screening", "STR Cases", "Investigation", "Audit Trail"],
  supervisor: ["Screening", "STR Cases", "MLRO Advisor", "Oversight", "Investigation", "Audit Trail", "EWRA", "Playbook"],
  mlro: ALL_MODULES.filter((m) => m !== "Access Control"),
  admin: ALL_MODULES,
};

// In-memory user store (shared across requests in the same process)
export const USERS: AccessUser[] = [
  {
    id: "usr-001",
    name: "Luisa Fernanda",
    email: "l.fernanda@hawkeyesterling.ae",
    role: "mlro",
    lastLogin: "2025-04-30T08:14:22Z",
    active: true,
    modules: ROLE_MODULES.mlro,
  },
  {
    id: "usr-002",
    name: "Ahmed Rahman",
    email: "a.rahman@hawkeyesterling.ae",
    role: "analyst",
    lastLogin: "2025-04-30T07:55:11Z",
    active: true,
    modules: ROLE_MODULES.analyst,
  },
  {
    id: "usr-003",
    name: "Nisha Patel",
    email: "n.patel@hawkeyesterling.ae",
    role: "analyst",
    lastLogin: "2025-04-29T16:42:05Z",
    active: true,
    modules: ROLE_MODULES.analyst,
  },
  {
    id: "usr-004",
    name: "Tariq Ibrahim",
    email: "t.ibrahim@hawkeyesterling.ae",
    role: "supervisor",
    lastLogin: "2025-04-30T09:01:33Z",
    active: true,
    modules: ROLE_MODULES.supervisor,
  },
  {
    id: "usr-005",
    name: "System Administrator",
    email: "sysadmin@hawkeyesterling.ae",
    role: "admin",
    lastLogin: "2025-04-28T11:22:00Z",
    active: true,
    modules: ROLE_MODULES.admin,
  },
];

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
