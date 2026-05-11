export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { loadUsers } from "../_store";
import { enforce } from "@/lib/server/enforce";

export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const users = await loadUsers();
  // Strip password fields before returning to client
  const safe = users.map(({ passwordHash: _h, passwordSalt: _s, ...u }) => u);
  return NextResponse.json({ ok: true, users: safe }, { headers: gate.headers });
}
