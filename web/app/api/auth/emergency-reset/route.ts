export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { generateSalt, hashPassword } from "@/lib/server/auth";
import { loadUsers, saveUsers, withUsersLock, isUserStoreUnavailable, userStoreUnavailableResponse } from "@/app/api/access/_store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { enforce } from "@/lib/server/enforce";

/**
 * Emergency password reset for the luisa MLRO account.
 *
 * Preferred: POST /api/auth/emergency-reset
 *   Body (JSON): { "secret": "<LUISA_INITIAL_PASSWORD>", "password": "<new_password>" }
 *   Keeps credentials out of server access logs and browser history.
 *
 * Legacy: GET /api/auth/emergency-reset?secret=<...>&password=<...>
 *   Credentials appear in Netlify access logs — rotate LUISA_INITIAL_PASSWORD
 *   immediately after use when called via GET.
 *
 * - Requires LUISA_INITIAL_PASSWORD to be set in Netlify env vars.
 * - The `secret` param must match that env var exactly.
 * - Resets the luisa account password to `password`, sets active=true.
 * - Returns JSON so the result is visible immediately.
 */

async function handleReset(gateHeaders: Record<string, string>, secret: string, newPassword: string): Promise<NextResponse> {
  const expectedSecret = process.env["LUISA_INITIAL_PASSWORD"]?.trim() ?? "";

  if (!expectedSecret) {
    return NextResponse.json({ ok: false, error: "LUISA_INITIAL_PASSWORD is not configured in Netlify env vars." }, { status: 503, headers: gateHeaders });
  }
  const COMPARE_KEY = Buffer.from("hawkeye-token-compare-v1", "utf8");
  const ha = createHmac("sha256", COMPARE_KEY).update(expectedSecret).digest();
  const hb = createHmac("sha256", COMPARE_KEY).update(secret).digest();
  if (!secret || !timingSafeEqual(ha, hb)) {
    return NextResponse.json({ ok: false, error: "Invalid secret." }, { status: 403, headers: gateHeaders });
  }
  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: "password param must be at least 8 characters." }, { status: 400, headers: gateHeaders });
  }

  let updated = false;
  let username = "";

  const storeOk = await withUsersLock(async () => {
    const users = await loadUsers();
    const idx = users.findIndex(
      (u) => u.username?.toLowerCase() === "luisa" || u.id === "usr-001",
    );
    if (idx === -1) {
      return;
    }
    // Block repeated use — recoveryUsed is set to true after first successful use
    // (by either this route or the login recovery path) so LUISA_INITIAL_PASSWORD
    // cannot be used indefinitely. If a second reset is needed, the operator must
    // reconfigure the LUISA_INITIAL_PASSWORD env var (single-use design).
    if (users[idx]!.recoveryUsed) {
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
      recoveryUsed: true,
    };
    await saveUsers(updatedUsers);
    updated = true;
    username = updatedUsers[idx]!.username ?? "luisa";
  }).then(() => true, (err: unknown) => {
    if (isUserStoreUnavailable(err)) return false;
    throw err;
  });
  if (!storeOk) return userStoreUnavailableResponse();

  if (!updated) {
    // Distinguish between "not found" and "already used" so the operator knows
    // whether to look for a different account name or reconfigure the env var.
    let users: Awaited<ReturnType<typeof loadUsers>>;
    try {
      users = await loadUsers();
    } catch (err) {
      if (isUserStoreUnavailable(err)) return userStoreUnavailableResponse();
      throw err;
    }
    const luisa = users.find((u) => u.username?.toLowerCase() === "luisa" || u.id === "usr-001");
    if (luisa?.recoveryUsed) {
      return NextResponse.json(
        { ok: false, error: "Recovery already used. Reconfigure LUISA_INITIAL_PASSWORD in env vars to enable another reset." },
        { status: 403, headers: gateHeaders },
      );
    }
    return NextResponse.json({ ok: false, error: "luisa account not found in store." }, { status: 404, headers: gateHeaders });
  }

  void writeAuditChainEntry(
    { event: "auth.emergency_password_reset", actor: "emergency_reset", meta: { username } },
    process.env["DEFAULT_TENANT"] ?? "default",
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({
    ok: true,
    message: `Password for '${username}' has been reset. You can now log in with the new password.`,
  }, { headers: gateHeaders });
}

/** POST — preferred path: credentials in request body, not URL */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: false, cost: 5 });
  if (!gate.ok) return gate.response;

  let body: { secret?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  return handleReset(gate.headers, body.secret ?? "", body.password ?? "");
}

/** GET — legacy path: credentials in query string (logged by Netlify access logs) */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: false, cost: 5 });
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") ?? "";
  const newPassword = searchParams.get("password") ?? "";

  return handleReset(gate.headers, secret, newPassword);
}
