import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// session-expiry.ts and auth-state.ts both hold module-level state (dispatch
// latches, the auth-state value). Re-import fresh copies per test from the
// same module registry so they share one auth-state instance.
async function freshModules() {
  vi.resetModules();
  const sessionExpiry = await import("../session-expiry");
  const authState = await import("../auth-state");
  return { sessionExpiry, authState };
}

// Minimal window stub: same-origin top-level document (isEmbeddedDocument →
// false) with a stubbable location pathname.
function stubWindow(pathname: string): Record<string, unknown> {
  const w: Record<string, unknown> = {
    location: { pathname, search: "", origin: "https://hawkeye.test" },
    dispatchEvent: vi.fn(() => true),
    fetch: vi.fn(),
  };
  w["self"] = w;
  w["top"] = w;
  vi.stubGlobal("window", w);
  return w;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session-expiry → auth-state wiring", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reportNoSession flips auth state to unauthenticated", async () => {
    const { sessionExpiry, authState } = await freshModules();
    stubWindow("/screening");
    sessionExpiry.reportNoSession();
    expect(authState.getAuthState()).toBe("unauthenticated");
  });

  it("reportSessionExpired flips auth state to unauthenticated", async () => {
    const { sessionExpiry, authState } = await freshModules();
    stubWindow("/screening");
    sessionExpiry.reportSessionExpired();
    expect(authState.getAuthState()).toBe("unauthenticated");
  });

  it("sets unauthenticated even on /login where the modal is suppressed", async () => {
    const { sessionExpiry, authState } = await freshModules();
    const w = stubWindow("/login");
    sessionExpiry.reportNoSession();
    // Modal event suppressed on the login page…
    expect(w["dispatchEvent"]).not.toHaveBeenCalled();
    // …but pollers still must halt.
    expect(authState.getAuthState()).toBe("unauthenticated");
  });

  it("sets unauthenticated even after the dispatch latch already fired", async () => {
    const { sessionExpiry, authState } = await freshModules();
    stubWindow("/screening");
    sessionExpiry.reportSessionExpired(); // first call latches the event
    authState.setAuthState("authenticated"); // simulate a later (stale) auth signal
    sessionExpiry.reportSessionExpired(); // latched — no second event…
    // …but the auth state must still be corrected.
    expect(authState.getAuthState()).toBe("unauthenticated");
  });

  it("interceptor marks the session authenticated on a login 200", async () => {
    const { sessionExpiry, authState } = await freshModules();
    const w = stubWindow("/login");
    const original = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    w["fetch"] = original;
    sessionExpiry.installSessionExpiryInterceptor();
    const patched = w["fetch"] as typeof fetch;
    expect(patched).not.toBe(original); // interceptor installed

    await patched("/api/auth/login", { method: "POST" });
    expect(authState.getAuthState()).toBe("authenticated");
  });

  it("interceptor leaves auth state alone on a login 401 (wrong credentials)", async () => {
    const { sessionExpiry, authState } = await freshModules();
    const w = stubWindow("/login");
    w["fetch"] = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 }));
    sessionExpiry.installSessionExpiryInterceptor();
    const patched = w["fetch"] as typeof fetch;

    await patched("/api/auth/login", { method: "POST" });
    expect(authState.getAuthState()).toBe("unknown");
  });
});
