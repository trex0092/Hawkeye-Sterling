export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export interface PermissionLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: "role_assigned" | "role_revoked" | "session_revoked" | "manual";
  targetUserId: string;
  targetUserName: string;
  oldRole?: string;
  newRole?: string;
  reason: string;
}

// Shared in-memory log — imported and mutated by assign-role and revoke-session routes
export const PERMISSION_LOG: PermissionLogEntry[] = [
  {
    id: "log-001",
    timestamp: "2025-04-15T09:00:00Z",
    actor: "System Administrator",
    action: "role_assigned",
    targetUserId: "usr-002",
    targetUserName: "Ahmed Rahman",
    oldRole: "viewer",
    newRole: "analyst",
    reason: "Promoted following successful probation review.",
  },
  {
    id: "log-002",
    timestamp: "2025-04-20T14:30:00Z",
    actor: "System Administrator",
    action: "role_assigned",
    targetUserId: "usr-004",
    targetUserName: "Tariq Ibrahim",
    oldRole: "analyst",
    newRole: "supervisor",
    reason: "Appointed as Compliance Team Lead — expanded oversight responsibilities.",
  },
];

export function GET() {
  return NextResponse.json({ ok: true, log: PERMISSION_LOG });
}

export async function POST(req: Request) {
  let body: Partial<PermissionLogEntry>;
  try {
    body = (await req.json()) as Partial<PermissionLogEntry>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.actor || !body.action || !body.targetUserId || !body.targetUserName || !body.reason) {
    return NextResponse.json({ ok: false, error: "actor, action, targetUserId, targetUserName and reason are required" }, { status: 400 });
  }

  const entry: PermissionLogEntry = {
    id: `log-${String(Date.now()).slice(-6)}`,
    timestamp: new Date().toISOString(),
    actor: body.actor,
    action: body.action as PermissionLogEntry["action"],
    targetUserId: body.targetUserId,
    targetUserName: body.targetUserName,
    oldRole: body.oldRole,
    newRole: body.newRole,
    reason: body.reason,
  };

  PERMISSION_LOG.push(entry);
  return NextResponse.json({ ok: true, entry }, { status: 201 });
}
