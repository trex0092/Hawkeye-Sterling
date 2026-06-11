import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// loadUsers() must never confuse "store unreachable" with "first deploy".
// Before this guard, a transient Blobs read failure returned null from
// getJson, loadUsers seeded the default MLRO account over the live users
// blob, and every operator's session was invalidated on the next
// /api/auth/me. These tests pin the repaired contract: seed ONLY on a
// confirmed-empty read; throw UserStoreUnavailableError otherwise; and on
// the failure path NEVER write.

const getJsonChecked = vi.fn();
const setJson = vi.fn();

vi.mock("@/lib/server/store", () => ({
  getJson: vi.fn(),
  getJsonChecked: (key: string) => getJsonChecked(key),
  setJson: (key: string, value: unknown) => setJson(key, value),
}));

async function freshAccessStore() {
  vi.resetModules();
  return import("@/app/api/access/_store");
}

describe("loadUsers store-failure handling", () => {
  beforeEach(() => {
    getJsonChecked.mockReset();
    setJson.mockReset();
    setJson.mockResolvedValue(undefined);
    // buildDefaultLuisa needs a boot credential to seed with.
    vi.stubEnv("LUISA_INITIAL_PASSWORD", "test-boot-credential");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws UserStoreUnavailableError on a failed read and never reseeds", async () => {
    getJsonChecked.mockResolvedValue({ ok: false, error: "blobs unreachable" });
    const mod = await freshAccessStore();
    await expect(mod.loadUsers()).rejects.toBeInstanceOf(mod.UserStoreUnavailableError);
    expect(setJson).not.toHaveBeenCalled();
  });

  it("throws on a malformed (non-array) users blob and never reseeds", async () => {
    getJsonChecked.mockResolvedValue({ ok: true, value: { not: "an array" } });
    const mod = await freshAccessStore();
    await expect(mod.loadUsers()).rejects.toBeInstanceOf(mod.UserStoreUnavailableError);
    expect(setJson).not.toHaveBeenCalled();
  });

  it("seeds the default account exactly once on a confirmed-empty store", async () => {
    getJsonChecked.mockResolvedValue({ ok: true, value: null });
    const mod = await freshAccessStore();
    const users = await mod.loadUsers();
    expect(users).toHaveLength(1);
    expect(users[0]?.id).toBe("usr-001");
    expect(setJson).toHaveBeenCalledTimes(1);
    expect(setJson.mock.calls[0]?.[0]).toBe("users/all.v1.json");
  });

  it("returns the persisted users untouched when the read succeeds", async () => {
    const persisted = [{ id: "usr-007", name: "Op", email: "", role: "mlro", lastLogin: "", active: true, modules: [] }];
    getJsonChecked.mockResolvedValue({ ok: true, value: persisted });
    const mod = await freshAccessStore();
    expect(await mod.loadUsers()).toEqual(persisted);
    expect(setJson).not.toHaveBeenCalled();
  });

  it("isUserStoreUnavailable identifies only the dedicated error", async () => {
    const mod = await freshAccessStore();
    expect(mod.isUserStoreUnavailable(new mod.UserStoreUnavailableError("x"))).toBe(true);
    expect(mod.isUserStoreUnavailable(new Error("x"))).toBe(false);
    expect(mod.isUserStoreUnavailable(undefined)).toBe(false);
  });

  it("userStoreUnavailableResponse is a 503 with the store_unavailable code", async () => {
    const mod = await freshAccessStore();
    const res = mod.userStoreUnavailableResponse();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; code?: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("store_unavailable");
  });
});
