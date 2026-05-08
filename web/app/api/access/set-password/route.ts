export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { loadUsers, saveUsers } from "../_store";
import { generateSalt, hashPassword, verifySession, SESSION_COOKIE } from "@/lib/server/auth";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  // Require an active session (only a logged-in CO/MLRO can reset passwords)
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  const session = verifySession(token);
  if (!session || session.role !== "compliance") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  let body: { userId: string; newPassword: string; username?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, newPassword, username } = body;
  if (!userId || !newPassword) {
    return NextResponse.json({ ok: false, error: "userId and newPassword are required" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const users = await loadUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const salt = generateSalt();
  const hash = hashPassword(newPassword, salt);
  const updatedUsers = [...users];
  updatedUsers[idx] = {
    ...users[idx]!,
    passwordHash: hash,
    passwordSalt: salt,
    ...(username ? { username } : {}),
  };
  await saveUsers(updatedUsers);

  return NextResponse.json({ ok: true, username: updatedUsers[idx]!.username });
}
