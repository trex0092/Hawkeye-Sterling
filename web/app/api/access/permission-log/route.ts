export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { loadPermissionLog, appendPermissionLog, type PermissionLogEntry } from "../_store";
import { adminAuth } from "@/lib/server/admin-auth";

export async function GET(req: Request) {
  const deny = adminAuth(req);
  if (deny) return deny;
  const log = await loadPermissionLog();
  return NextResponse.json({ ok: true, log });
}

export async function POST(req: Request) {
  const deny = adminAuth(req);
  if (deny) return deny;
  let body: Partial<PermissionLogEntry>;
  try {
    body = (await req.json()) as Partial<PermissionLogEntry>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const ALLOWED_ACTIONS: PermissionLogEntry["action"][] = ["role_assigned", "role_revoked", "session_revoked", "manual"];
  if (!body.actor || !body.action || !body.targetUserId || !body.targetUserName || !body.reason) {
    return NextResponse.json(
      { ok: false, error: "actor, action, targetUserId, targetUserName and reason are required" },
      { status: 400 },
    );
  }
  if (!(ALLOWED_ACTIONS as string[]).includes(body.action)) {
    return NextResponse.json(
      { ok: false, error: `action must be one of: ${ALLOWED_ACTIONS.join(", ")}` },
      { status: 400 },
    );
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

  await appendPermissionLog(entry);
  return NextResponse.json({ ok: true, entry }, { status: 201 });
}
