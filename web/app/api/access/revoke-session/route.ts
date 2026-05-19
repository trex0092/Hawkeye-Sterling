export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { loadUsers, saveUsers, appendPermissionLog } from "../_store";
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

  const users = await loadUsers();
  const userIdx = users.findIndex((u) => u.id === userId);
  if (userIdx === -1) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const user = users[userIdx]!;
  const updatedUsers = [...users];
  // Bump pwVersion so auth/me's pwv check immediately rejects any current
  // session token — without this, the old JWT remains valid for up to 8h.
  updatedUsers[userIdx] = { ...user, active: false, pwVersion: (user.pwVersion ?? 0) + 1 };
  await saveUsers(updatedUsers);

  const logEntry = {
    id: `log-${String(Date.now()).slice(-6)}`,
    timestamp: new Date().toISOString(),
    actor: revokedBy,
    action: "session_revoked" as const,
    targetUserId: userId,
    targetUserName: user.name,
    reason,
  };
  await appendPermissionLog(logEntry);

  return NextResponse.json({ ok: true, user: updatedUsers[userIdx], logEntry });
}
