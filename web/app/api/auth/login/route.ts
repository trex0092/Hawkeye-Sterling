export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { USERS } from "@/app/api/access/_store";
import { verifyPassword, issueSession, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/server/auth";

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Username and password are required" }, { status: 400 });
  }

  const user = USERS.find(
    (u) => u.active && u.username?.toLowerCase() === username.toLowerCase(),
  );

  if (
    !user ||
    !user.passwordHash ||
    !user.passwordSalt ||
    !verifyPassword(password, user.passwordSalt, user.passwordHash)
  ) {
    // Uniform delay to prevent user enumeration
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }

  const token = issueSession(user.id, user.username!, user.role);

  const isSecure = process.env["NODE_ENV"] === "production";
  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: SESSION_TTL_S,
    path: "/",
  });

  // Update lastLogin in memory
  const idx = USERS.findIndex((u) => u.id === user.id);
  if (idx !== -1) {
    USERS[idx] = { ...USERS[idx]!, lastLogin: new Date().toISOString() };
  }

  return res;
}
