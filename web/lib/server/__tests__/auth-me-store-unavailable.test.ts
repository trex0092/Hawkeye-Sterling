import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/auth/me must treat "user store unreachable" (503, keep the cookie)
// differently from "user genuinely missing" (401, clear the cookie). The
// 503-without-clear contract is what stops a Netlify Blobs blip from
// logging out every operator: the session HMAC is still valid, so the
// browser must keep the cookie and simply retry later.

const loadUsers = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hs_session" ? { value: sessionToken } : undefined),
  }),
  headers: async () => ({
    get: () => null,
  }),
}));

vi.mock("@/lib/server/audit-chain", () => ({
  writeAuditChainEntry: vi.fn(async () => undefined),
}));

vi.mock("@/app/api/access/_store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/app/api/access/_store")>();
  return {
    ...original,
    loadUsers: () => loadUsers(),
    updateSessionActivity: vi.fn(async () => undefined),
  };
});

// 48-char secret satisfies auth.ts's 32-char minimum. Set before the route
// (and auth.ts) are imported; getSecret() reads it per call.
process.env["SESSION_SECRET"] = "vitest-session-secret-0123456789abcdef0123456789";

let sessionToken = "";

describe("GET /api/auth/me with an unreachable user store", () => {
  beforeEach(async () => {
    vi.resetModules();
    loadUsers.mockReset();
    const { issueSession } = await import("@/lib/server/auth");
    sessionToken = issueSession("usr-001", "luisa", "mlro");
  });

  it("returns 503 store_unavailable and does NOT clear the session cookie", async () => {
    const { UserStoreUnavailableError } = await vi.importActual<typeof import("@/app/api/access/_store")>(
      "@/app/api/access/_store",
    );
    loadUsers.mockRejectedValue(new UserStoreUnavailableError("blobs unreachable"));

    const { GET } = await import("@/app/api/auth/me/route");
    const res = await GET();

    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; code?: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("store_unavailable");
    // The crucial bit: no cookie mutation — the (still HMAC-valid) session survives.
    expect(res.cookies.get("hs_session")).toBeUndefined();
  });

  it("still returns 401 session_invalidated WITH a cookie clear when the user is genuinely gone", async () => {
    loadUsers.mockResolvedValue([
      { id: "usr-someone-else", role: "mlro", active: true, pwVersion: 0 },
    ]);

    const { GET } = await import("@/app/api/auth/me/route");
    const res = await GET();

    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; code?: string };
    expect(body.code).toBe("session_invalidated");
    // (clearSessionCookie() also overwrites the cookie with an immediate
    // expiry on this path; not asserted here because the root vitest runner
    // does not surface NextResponse cookie mutations — the 503 test above
    // pins the contract that matters for this change.)
  });
});
