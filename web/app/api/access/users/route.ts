export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { USERS } from "../_store";
import { adminAuth } from "@/lib/server/admin-auth";

export function GET(req: Request) {
  const deny = adminAuth(req);
  if (deny) return deny;
  // Strip password fields before returning to client
  const safe = USERS.map(({ passwordHash: _h, passwordSalt: _s, ...u }) => u);
  return NextResponse.json({ ok: true, users: safe });
}
