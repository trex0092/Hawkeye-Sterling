export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { USERS, PERMISSION_LOG } from "../_store";
import { adminAuth } from "@/lib/server/admin-auth";

export async function POST(req: Request) {
  const deny = adminAuth(req);
  if (deny) return deny;
  let body: { userId: string; reason: string; revokedBy?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, reason, revokedBy = "System Administrator" } = body;
  if (!userId || !reason) {
    return NextResponse.json({ ok: false, error: "userId and reason are required" }, { status: 400 });
  }

  const userIdx = USERS.findIndex((u) => u.id === userId);
  if (userIdx === -1) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const user = USERS[userIdx]!;
  USERS[userIdx] = { ...user, active: false };

  const logEntry = {
    id: `log-${String(Date.now()).slice(-6)}`,
    timestamp: new Date().toISOString(),
    actor: revokedBy,
    action: "session_revoked" as const,
    targetUserId: userId,
    targetUserName: user.name,
    reason,
  };
  PERMISSION_LOG.push(logEntry);

  return NextResponse.json({ ok: true, user: USERS[userIdx], logEntry });
}
