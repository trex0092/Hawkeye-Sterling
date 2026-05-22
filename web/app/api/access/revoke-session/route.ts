export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { loadUsers, saveUsers, withUsersLock, appendPermissionLog } from "../_store";
import { adminAuth } from "@/lib/server/admin-auth";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { randomBytes } from "node:crypto";

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

  type RevokeResult =
    | { status: 'not_found' }
    | { status: 'revoked'; userName: string; safeUser: Record<string, unknown> };

  let revokeResult: RevokeResult = { status: 'not_found' };

  await withUsersLock(async () => {
    const users = await loadUsers();
    const userIdx = users.findIndex((u) => u.id === userId);
    if (userIdx === -1) { revokeResult = { status: 'not_found' }; return; }

    const user = users[userIdx]!;
    const updatedUsers = [...users];
    // Bump pwVersion so auth/me's pwv check immediately rejects any current
    // session token — without this, the old JWT remains valid for up to 8h.
    updatedUsers[userIdx] = { ...user, active: false, pwVersion: (user.pwVersion ?? 0) + 1 };
    await saveUsers(updatedUsers);

    // Strip credentials before surfacing to the caller.
    const { passwordHash: _h, passwordSalt: _s, ...safeUser } = updatedUsers[userIdx]!;
    revokeResult = { status: 'revoked', userName: user.name, safeUser };
  });

  if (revokeResult.status === 'not_found') {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const { userName, safeUser } = revokeResult as { status: 'revoked'; userName: string; safeUser: Record<string, unknown> };

  const logEntry = {
    id: `log-${randomBytes(4).toString("hex")}`,
    timestamp: new Date().toISOString(),
    actor: revokedBy,
    action: "session_revoked" as const,
    targetUserId: userId,
    targetUserName: userName,
    reason,
  };
  await appendPermissionLog(logEntry);

  // FDL 10/2025 Art.20 — session revocation is a privileged access-control event;
  // must be on the tamper-evident server-side chain.
  void writeAuditChainEntry(
    {
      event: "access.session_revoked",
      actor: revokedBy,
      userId,
      targetUserName: userName,
      reason,
    },
    "admin",
  ).catch((err) =>
    console.warn("[access/revoke-session] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );

  return NextResponse.json({ ok: true, user: safeUser, logEntry });
}
