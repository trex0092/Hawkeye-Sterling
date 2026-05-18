export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/server/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const isSecure = process.env["NODE_ENV"] !== "development";
  res.cookies.set(SESSION_COOKIE, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
  });
  return res;
}
