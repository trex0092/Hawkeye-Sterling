export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { loadUsers } from "../_store";
import { adminAuth } from "@/lib/server/admin-auth";

export async function GET(req: Request) {
  const deny = adminAuth(req);
  if (deny) return deny;
  const users = await loadUsers();
  // Strip password fields before returning to client
  const safe = users.map(({ passwordHash: _h, passwordSalt: _s, ...u }) => u);
  return NextResponse.json({ ok: true, users: safe });
}
