import { beforeEach, describe, expect, it, vi } from "vitest";

// The store is a module-level singleton — re-import a fresh copy per test so
// state from one test can't leak into the next.
async function freshStore() {
  vi.resetModules();
  return import("../auth-state");
}

describe("auth-state store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts unknown", async () => {
    const s = await freshStore();
    expect(s.getAuthState()).toBe("unknown");
  });

  it("setAuthState transitions and getAuthState reflects it", async () => {
    const s = await freshStore();
    s.setAuthState("authenticated");
    expect(s.getAuthState()).toBe("authenticated");
    s.setAuthState("unauthenticated");
    expect(s.getAuthState()).toBe("unauthenticated");
  });

  it("subscribe replays the current state immediately", async () => {
    const s = await freshStore();
    s.setAuthState("authenticated");
    const seen: string[] = [];
    s.subscribeAuthState((st) => seen.push(st));
    expect(seen).toEqual(["authenticated"]);
  });

  it("notifies subscribers on every transition but not on idempotent sets", async () => {
    const s = await freshStore();
    const seen: string[] = [];
    s.subscribeAuthState((st) => seen.push(st));
    s.setAuthState("authenticated");
    s.setAuthState("authenticated"); // no-op — must not re-notify
    s.setAuthState("unauthenticated");
    expect(seen).toEqual(["unknown", "authenticated", "unauthenticated"]);
  });

  it("unsubscribe stops notifications", async () => {
    const s = await freshStore();
    const seen: string[] = [];
    const unsubscribe = s.subscribeAuthState((st) => seen.push(st));
    unsubscribe();
    s.setAuthState("authenticated");
    expect(seen).toEqual(["unknown"]); // only the replay
  });

  it("a throwing listener does not break other listeners", async () => {
    const s = await freshStore();
    const seen: string[] = [];
    s.subscribeAuthState(() => {
      throw new Error("bad listener");
    });
    s.subscribeAuthState((st) => seen.push(st));
    s.setAuthState("authenticated");
    expect(seen).toEqual(["unknown", "authenticated"]);
  });

  it("isAuthHaltStatus is true only for 401/403", async () => {
    const s = await freshStore();
    expect(s.isAuthHaltStatus(401)).toBe(true);
    expect(s.isAuthHaltStatus(403)).toBe(true);
    expect(s.isAuthHaltStatus(200)).toBe(false);
    expect(s.isAuthHaltStatus(404)).toBe(false);
    expect(s.isAuthHaltStatus(500)).toBe(false);
    expect(s.isAuthHaltStatus(502)).toBe(false);
    expect(s.isAuthHaltStatus(503)).toBe(false);
  });
});
