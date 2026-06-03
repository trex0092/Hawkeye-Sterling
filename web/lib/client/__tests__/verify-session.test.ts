import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySessionDead } from "../verify-session";

const stubFetch = (impl: typeof fetch): void => {
  vi.stubGlobal("fetch", impl);
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifySessionDead", () => {
  it("returns true when /api/auth/me returns 401 with a real-invalidation code", async () => {
    stubFetch(async () => jsonResponse(401, { ok: false, code: "session_invalid" }));
    expect(await verifySessionDead()).toBe(true);
  });

  it("returns true when /api/auth/me returns 403 (deactivated account)", async () => {
    stubFetch(async () => jsonResponse(403, { ok: false, code: "account_deactivated" }));
    expect(await verifySessionDead()).toBe(true);
  });

  it("returns false on 401 with code:no_session (operator was never signed in — no modal)", async () => {
    stubFetch(async () => jsonResponse(401, { ok: false, code: "no_session" }));
    expect(await verifySessionDead()).toBe(false);
  });

  it("returns true on a legacy 401 with no JSON body (back-compat)", async () => {
    stubFetch(async () => new Response(null, { status: 401 }));
    expect(await verifySessionDead()).toBe(true);
  });

  it("returns false on a 200 response (session is still valid)", async () => {
    stubFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    expect(await verifySessionDead()).toBe(false);
  });

  it("returns false fail-open on a network error (do not flash modal on a blip)", async () => {
    stubFetch(async () => { throw new TypeError("Failed to fetch"); });
    expect(await verifySessionDead()).toBe(false);
  });

  it("calls /api/auth/me with no-store and credentials:include", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    stubFetch(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 200 });
    });
    await verifySessionDead();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/auth/me");
    expect(calls[0]?.init?.cache).toBe("no-store");
    expect(calls[0]?.init?.credentials).toBe("include");
  });
});
