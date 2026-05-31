export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { generateSalt, hashPassword } from "@/lib/server/auth";
import { loadUsers, saveUsers, withUsersLock } from "@/app/api/access/_store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { enforce } from "@/lib/server/enforce";

/**
 * Emergency password reset for the luisa MLRO account.
 *
 * GET /api/auth/emergency-reset?secret=<LUISA_INITIAL_PASSWORD>&password=<new_password>
 *
 * - Requires LUISA_INITIAL_PASSWORD to be set in Netlify env vars.
 * - The `secret` param must match that env var exactly.
 * - Resets the luisa account password to `password`, sets active=true.
 * - Safe to call from the browser address bar.
 * - Returns JSON so the result is visible immediately.
 */
export async function GET(req: Request): Promise<NextResponse> {
  // Rate-limit unauthenticated callers to prevent brute-force of LUISA_INITIAL_PASSWORD.
  const gate = await enforce(req, { requireAuth: false, cost: 5 });
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") ?? "";
  const newPassword = searchParams.get("password") ?? "";

  const expectedSecret = process.env["LUISA_INITIAL_PASSWORD"]?.trim() ?? "";

  if (!expectedSecret) {
    return NextResponse.json({ ok: false, error: "LUISA_INITIAL_PASSWORD is not configured in Netlify env vars." }, { status: 503 });
  }
  const COMPARE_KEY = Buffer.from("hawkeye-token-compare-v1", "utf8");
  const ha = createHmac("sha256", COMPARE_KEY).update(expectedSecret).digest();
  const hb = createHmac("sha256", COMPARE_KEY).update(secret).digest();
  if (!secret || !timingSafeEqual(ha, hb)) {
    return NextResponse.json({ ok: false, error: "Invalid secret." }, { status: 403 });
  }
  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: "password param must be at least 8 characters." }, { status: 400 });
  }

  let updated = false;
  let username = "";

  await withUsersLock(async () => {
    const users = await loadUsers();
    const idx = users.findIndex(
      (u) => u.username?.toLowerCase() === "luisa" || u.id === "usr-001",
    );
    if (idx === -1) {
      return;
    }
    const salt = generateSalt();
    const hash = hashPassword(newPassword, salt);
    const updatedUsers = [...users];
    updatedUsers[idx] = {
      ...users[idx]!,
      passwordHash: hash,
      passwordSalt: salt,
      pwVersion: (users[idx]!.pwVersion ?? 0) + 1,
      active: true,
    };
    await saveUsers(updatedUsers);
    updated = true;
    username = updatedUsers[idx]!.username ?? "luisa";
  });

  if (!updated) {
    return NextResponse.json({ ok: false, error: "luisa account not found in store." }, { status: 404 });
  }

  void writeAuditChainEntry(
    { event: "auth.emergency_password_reset", actor: "emergency_reset", meta: { username } },
    process.env["DEFAULT_TENANT"] ?? "default",
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({
    ok: true,
    message: `Password for '${username}' has been reset. You can now log in with the new password.`,
  });
}
