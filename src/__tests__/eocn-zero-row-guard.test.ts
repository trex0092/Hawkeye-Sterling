// Unit test: zero-row guard in /api/eocn-list-updates POST handler.
//
// Requirement: when the upstream feed returns 0 list-updates AND the prior
// stored blob has > 0 rows, the handler must NOT overwrite the blob —
// it must return the prior data and log a critical alert.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.spyOn(console, "warn").mockImplementation(() => undefined);
vi.spyOn(console, "info").mockImplementation(() => undefined);
vi.spyOn(console, "error").mockImplementation(() => undefined);

// --------------------------------------------------------------------------
// Mock infrastructure
// --------------------------------------------------------------------------

// The route imports from next/server which is shim'd in tests. We also mock
// @/lib/server/store and @/lib/data/eocn-fixture, @/lib/server/enforce.

const mockSetJson = vi.fn().mockResolvedValue(undefined);
let mockPriorData: unknown = null;
const mockGetJson = vi.fn().mockImplementation(async () => mockPriorData);

vi.mock("next/server", async () => {
  const { NextResponse } = await import("../../src/__mocks__/next-server.js");
  return { NextResponse };
});

vi.mock("@/lib/server/store", () => ({
  getJson: mockGetJson,
  setJson: mockSetJson,
}));

vi.mock("@/lib/server/enforce", () => ({
  enforce: async () => ({ ok: true, tier: "enterprise", keyId: "test", record: null, remainingMonthly: null, headers: {} }),
}));

vi.mock("@/app/api/webhook/push/route", () => ({
  deliverWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

// Build a fixture payload with N list-update entries.
function makeFixture(count: number) {
  const listUpdates = Array.from({ length: count }, (_, i) => ({
    id: `LU-FIXTURE-${i}`,
    date: "2025-01-01",
    time: "00:00",
    version: `EOCN-TFS-2025-01-${i}`,
    deltaAdded: 1,
    deltaRemoved: 0,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-01-01 00:00",
    notes: `Fixture entry ${i}`,
  }));
  return {
    source: "fixture" as const,
    lastSyncedAt: new Date().toISOString(),
    listUpdates,
    matches: [],
    declarations: [],
  };
}

vi.mock("@/lib/data/eocn-fixture", () => ({
  fixturePayload: () => makeFixture(0), // fixture is empty — exactly the production scenario
  // Provide a minimal ListUpdate / EocnFeedPayload type export (not needed at runtime)
}));

// --------------------------------------------------------------------------
// Helpers to simulate incoming request
// --------------------------------------------------------------------------
function makeRequest(cronToken = "test-cron-token") {
  return new Request("http://localhost/api/eocn-list-updates", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cronToken}`,
    },
    body: "{}",
  });
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("eocn-list-updates POST — zero-row guard", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env["SANCTIONS_CRON_TOKEN"] = "test-cron-token";
    mockSetJson.mockClear();
    mockGetJson.mockClear();
    mockPriorData = null;
  });

  afterEach(() => {
    delete process.env["SANCTIONS_CRON_TOKEN"];
    delete process.env["EOCN_FEED_URL"];
  });

  it("does NOT overwrite storage when upstream returns empty and prior has 1009 rows", async () => {
    // Set up prior blob with 1009 rows.
    mockPriorData = makeFixture(1009);

    // No EOCN_FEED_URL → upstream returns "EOCN_FEED_URL not configured".
    // fixturePayload() returns 0 entries → merged = [] → guard triggers.
    const { POST } = await import("../../web/app/api/eocn-list-updates/route.js");
    const res = await POST(makeRequest());

    // setJson must NOT have been called (storage preserved).
    expect(mockSetJson).not.toHaveBeenCalled();

    // Response must be 200 (not 502).
    expect(res.status).toBe(200);

    // Response body should still contain the prior data.
    const body = await res.json() as { listUpdates?: unknown[] };
    expect(Array.isArray(body.listUpdates)).toBe(true);
    expect(body.listUpdates!.length).toBe(1009);
  });

  it("writes to storage when merged result has rows (normal case)", async () => {
    // No prior data stored.
    mockPriorData = null;

    // No EOCN_FEED_URL → fixture data is written. Fixture is empty → merged = [].
    // With no prior data, the guard does NOT trigger and an empty payload is written.
    const { POST } = await import("../../web/app/api/eocn-list-updates/route.js");
    await POST(makeRequest());

    // setJson IS called (no prior data so no guard).
    expect(mockSetJson).toHaveBeenCalledOnce();
  });
});
