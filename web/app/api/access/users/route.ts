export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { loadUsers, isUserStoreUnavailable, userStoreUnavailableResponse } from "../_store";
import { adminAuth } from "@/lib/server/admin-auth";

export async function GET(req: Request) {
  const deny = adminAuth(req);
  if (deny) return deny;
  try {
    const users = await loadUsers();
    // Strip password fields before returning to client
    const safe = users.map(({ passwordHash: _h, passwordSalt: _s, ...u }) => u);
    return NextResponse.json({ ok: true, users: safe });
  } catch (err) {
    if (isUserStoreUnavailable(err)) return userStoreUnavailableResponse();
    console.error("[access/users] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load users" }, { status: 500 });
  }
}
