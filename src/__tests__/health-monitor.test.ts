// Unit tests for health-monitor list-source checking.
//
// Covers the per-source independent checking requirement:
// one provider failing must not crash all others — the function must
// still return HTTP 200 with healthy=false for the failing source only.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.spyOn(console, "warn").mockImplementation(() => undefined);
vi.spyOn(console, "info").mockImplementation(() => undefined);
vi.spyOn(console, "error").mockImplementation(() => undefined);

// Build a fresh report that looks healthy (fetched 1h ago, 500 records).
function freshReport(overrides?: { fetchedAt?: string; recordCount?: number }) {
  return {
    fetchedAt: new Date(Date.now() - 1 * 3_600_000).toISOString(), // 1h ago
    recordCount: 500,
    ...overrides,
  };
}

const LIST_IDS = [
  "un_consolidated",
  "ofac_sdn",
  "ofac_cons",
  "eu_fsf",
  "uk_ofsi",
  "uae_eocn",
  "uae_ltl",
];

describe("checkListSources — per-source independent checking", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns healthy=true for all sources when all blobs return fresh reports", async () => {
    vi.doMock("@netlify/blobs", () => ({
      getStore: () => ({
        get: (_key: string) => Promise.resolve(freshReport()),
      }),
    }));
    const { checkListSources } = await import("../../netlify/lib/list-source-check.js");
    const results = await checkListSources();
    expect(results).toHaveLength(LIST_IDS.length);
    for (const r of results) {
      expect(r.healthy).toBe(true);
    }
  });

  it("returns healthy=false only for the failing source; others still pass", async () => {
    // Simulate ofac_sdn throwing (analogous to a provider returning 503)
    const FAILING_SOURCE = "ofac_sdn";
    vi.doMock("@netlify/blobs", () => ({
      getStore: () => ({
        get: (key: string) => {
          if (key.startsWith(FAILING_SOURCE)) {
            return Promise.reject(new Error("simulated 503 from provider"));
          }
          return Promise.resolve(freshReport());
        },
      }),
    }));
    const { checkListSources } = await import("../../netlify/lib/list-source-check.js");
    const results = await checkListSources();

    expect(results).toHaveLength(LIST_IDS.length);

    const failing = results.find((r) => r.id === FAILING_SOURCE);
    expect(failing).toBeDefined();
    expect(failing!.healthy).toBe(false);
    expect(failing!.reason).toBe("read_error");

    // All other sources must still be healthy.
    const others = results.filter((r) => r.id !== FAILING_SOURCE);
    for (const r of others) {
      expect(r.healthy).toBe(true);
    }
  });

  it("returns healthy=false for a source with zero records", async () => {
    const ZERO_SOURCE = "uae_eocn";
    vi.doMock("@netlify/blobs", () => ({
      getStore: () => ({
        get: (key: string) => {
          if (key.startsWith(ZERO_SOURCE)) {
            return Promise.resolve(freshReport({ recordCount: 0 }));
          }
          return Promise.resolve(freshReport());
        },
      }),
    }));
    const { checkListSources } = await import("../../netlify/lib/list-source-check.js");
    const results = await checkListSources();

    const zero = results.find((r) => r.id === ZERO_SOURCE);
    expect(zero).toBeDefined();
    expect(zero!.healthy).toBe(false);
    expect(zero!.reason).toBe("zero_records");
    expect(zero!.recordCount).toBe(0);

    // Other sources unaffected.
    const others = results.filter((r) => r.id !== ZERO_SOURCE);
    for (const r of others) {
      expect(r.healthy).toBe(true);
    }
  });

  it("returns healthy=false for a stale source (ageHours > 30)", async () => {
    const STALE_SOURCE = "uae_ltl";
    vi.doMock("@netlify/blobs", () => ({
      getStore: () => ({
        get: (key: string) => {
          if (key.startsWith(STALE_SOURCE)) {
            return Promise.resolve(
              freshReport({
                fetchedAt: new Date(Date.now() - 161 * 3_600_000).toISOString(), // 161h ago
              }),
            );
          }
          return Promise.resolve(freshReport());
        },
      }),
    }));
    const { checkListSources } = await import("../../netlify/lib/list-source-check.js");
    const results = await checkListSources();

    const stale = results.find((r) => r.id === STALE_SOURCE);
    expect(stale).toBeDefined();
    expect(stale!.healthy).toBe(false);
    expect(stale!.reason).toBe("stale");
    expect(stale!.ageHours).toBeGreaterThan(30);
  });

  it("returns all healthy=false with reason=store_unavailable when getStore throws", async () => {
    vi.doMock("@netlify/blobs", () => ({
      getStore: () => {
        throw new Error("blobs unavailable");
      },
    }));
    const { checkListSources } = await import("../../netlify/lib/list-source-check.js");
    const results = await checkListSources();

    expect(results).toHaveLength(LIST_IDS.length);
    for (const r of results) {
      expect(r.healthy).toBe(false);
      expect(r.reason).toBe("store_unavailable");
    }
  });
});
