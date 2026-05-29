// GET    /api/access/sessions         — list all sessions (admin only)
// DELETE /api/access/sessions?id=<id> — revoke a specific session
//
// GET supports optional query params:
//   ?userId=<id>     — filter by user
//   ?active=true     — only active sessions
//
// DELETE marks the session inactive in the store, then bumps the target
// user's pwVersion to immediately invalidate all current tokens for that user
// (the JWT is stateless so there is no finer-grained per-session revoke).
// Appends to the permission log and the tamper-evident audit chain.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  loadSessions,
  markSessionInactive,
  deactivateUserSessions,
  loadUsers,
  saveUsers,
  withUsersLock,
  appendPermissionLog,
  type AccessSession,
} from "../_store";
import { adminAuth } from "@/lib/server/admin-auth";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export async function GET(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const filterUserId = searchParams.get("userId");
  const filterActive = searchParams.get("active");

  try {
    let sessions = await loadSessions();

    if (filterUserId) sessions = sessions.filter((s) => s.userId === filterUserId);
    if (filterActive === "true") sessions = sessions.filter((s) => s.active);

    // Sort most-recent first
    sessions = sessions.sort((a, b) => b.lastActive.localeCompare(a.lastActive));

    return NextResponse.json({ ok: true, count: sessions.length, sessions });
  } catch (err) {
    console.error("[access/sessions] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load sessions" }, { status: 500 });
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id query param required" }, { status: 400 });
  }

  try {
    // Find the session to get userId before marking inactive
    const sessions = await loadSessions();
    const target = sessions.find((s: AccessSession) => s.id === id);
    if (!target) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    }

    // Mark session inactive in the store
    await markSessionInactive(id);

    // Bump pwVersion for the user so auth/me immediately rejects their JWT
    await withUsersLock(async () => {
      const users = await loadUsers();
      const idx = users.findIndex((u) => u.id === target.userId);
      if (idx !== -1) {
        const user = users[idx]!;
        users[idx] = { ...user, pwVersion: (user.pwVersion ?? 0) + 1 };
        await saveUsers(users);
      }
    });

    // Also mark all other sessions for this user inactive (pwVersion bump kills them all)
    await deactivateUserSessions(target.userId);

    const logEntry = {
      id: `log-${randomBytes(4).toString("hex")}`,
      timestamp: new Date().toISOString(),
      actor: "admin",
      action: "session_revoked" as const,
      targetUserId: target.userId,
      targetUserName: target.userName,
      reason: `Session ${id} revoked via Session Monitor`,
    };
    await appendPermissionLog(logEntry);

    void writeAuditChainEntry(
      {
        event: "access.session_revoked",
        actor: "admin",
        sessionId: id,
        userId: target.userId,
        targetUserName: target.userName,
      },
      "admin",
    ).catch((err: unknown) =>
      console.warn("[access/sessions] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );

    return NextResponse.json({ ok: true, revoked: id, userId: target.userId, logEntry });
  } catch (err) {
    console.error("[access/sessions] DELETE failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to revoke session" }, { status: 500 });
  }
}
