// GET /api/auth/me — returns the current session's user profile (no password fields).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/server/auth";
import { loadUsers, ROLE_LABEL } from "../../access/_store";
import { cookies } from "next/headers";

export async function GET(): Promise<NextResponse> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const users = await loadUsers();
  const user = users.find((u) => u.id === session.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const { passwordHash: _h, passwordSalt: _s, ...safe } = user;
  return NextResponse.json({
    ok: true,
    user: {
      ...safe,
      roleLabel: ROLE_LABEL[user.role] ?? user.role,
      sessionExp: session.exp,
    },
  });
}
