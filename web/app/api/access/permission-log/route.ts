export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { loadPermissionLog, appendPermissionLog, type PermissionLogEntry } from "../_store";
import { adminAuth } from "@/lib/server/admin-auth";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

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
    id: `log-${randomBytes(4).toString("hex")}`,
    timestamp: new Date().toISOString(),
    actor: "admin",
    action: body.action as PermissionLogEntry["action"],
    targetUserId: body.targetUserId,
    targetUserName: body.targetUserName,
    oldRole: body.oldRole,
    newRole: body.newRole,
    reason: body.reason,
  };

  await appendPermissionLog(entry);
  void writeAuditChainEntry(
    { event: "access.permission_log.created", actor: "portal_admin", meta: { action: entry.action, targetUserId: entry.targetUserId } },
    "admin",
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json({ ok: true, entry }, { status: 201 });
}
