import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySessionDead } from "../verify-session";

const stubFetch = (impl: typeof fetch): void => {
  vi.stubGlobal("fetch", impl);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifySessionDead", () => {
  it("returns true when /api/auth/me returns 401", async () => {
    stubFetch(async () => new Response(null, { status: 401 }));
    expect(await verifySessionDead()).toBe(true);
  });

  it("returns true when /api/auth/me returns 403", async () => {
    stubFetch(async () => new Response(null, { status: 403 }));
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
