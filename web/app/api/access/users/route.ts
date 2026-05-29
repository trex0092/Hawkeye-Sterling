export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { loadUsers } from "../_store";
import { enforce } from "@/lib/server/enforce";

export async function GET(req: Request) {
  const deny = adminAuth(req);
  if (deny) return deny;
  try {
    const users = await loadUsers();
    // Strip password fields before returning to client
    const safe = users.map(({ passwordHash: _h, passwordSalt: _s, ...u }) => u);
    return NextResponse.json({ ok: true, users: safe });
  } catch (err) {
    console.error("[access/users] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load users" }, { status: 500 });
  }
}
