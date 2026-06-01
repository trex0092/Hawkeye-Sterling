// Unit test: ongoing/run route writes screening-history entries.
//
// Requirement: every run — including zero-hit runs — must write one
// ScreeningHistoryEntry to screening-history/<subjectId>/<runAt>.
// Validates that ReScreenDiff will have data after the first run.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.spyOn(console, "warn").mockImplementation(() => undefined);
vi.spyOn(console, "info").mockImplementation(() => undefined);
vi.spyOn(console, "error").mockImplementation(() => undefined);

// --------------------------------------------------------------------------
// Mock infrastructure
// --------------------------------------------------------------------------

const writtenKeys: Map<string, unknown> = new Map();
const mockSetJson = vi.fn().mockImplementation(async (key: string, value: unknown) => {
  writtenKeys.set(key, value);
});
const mockGetJson = vi.fn().mockResolvedValue(null);
const mockListKeys = vi.fn().mockResolvedValue(["ongoing/subject/HS-10001"]);

vi.mock("next/server", async () => {
  const { NextResponse } = await import("../../src/__mocks__/next-server.js");
  return { NextResponse };
});

vi.mock("@/lib/server/store", () => ({
  getJson: mockGetJson,
  setJson: mockSetJson,
  listKeys: mockListKeys,
}));

vi.mock("@/lib/server/webhook", () => ({
  postWebhook: async () => ({ delivered: false }),
}));

vi.mock("@/lib/server/webhook-delivery", () => ({
  deliverWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server/ongoing-escalation", () => ({
  ESCALATION_DELTA: 20,
  shouldEscalate: () => false,
}));

vi.mock("@/lib/server/asanaConfig", () => ({
  asanaGids: {
    screening: () => null,
    escalations: () => null,
    workspace: () => "ws-1",
    assignee: () => "user-1",
  },
}));

vi.mock("@/lib/server/audit-chain", () => ({
  writeAuditChainEntry: async () => undefined,
}));

// SANCT-001: the /api/ongoing/run route now guards on a healthy corpus
// (refuses to screen when both OFAC SDN and UN Consolidated are missing).
// Provide a minimal two-candidate corpus so the guard passes — quickScreen
// is also mocked to return zero hits, preserving the zero-hit-history scenario.
const _MIN_CANDIDATES = [
  { listId: "ofac_sdn", listRef: "OFAC SDN", name: "Sanctioned Person 1" },
  { listId: "un_consolidated", listRef: "UN 1267", name: "Sanctioned Person 2" },
];
vi.mock("@/lib/server/candidates-loader", () => ({
  loadCandidates: async () => _MIN_CANDIDATES,
  loadCandidatesWithHealth: async () => ({
    candidates: _MIN_CANDIDATES,
    health: { healthy: true, failedAdapters: [] },
  }),
}));

vi.mock("@/lib/data/adverse-keywords", () => ({
  classifyAdverseKeywords: () => [],
}));

// quickScreen must return a result with zero hits (the zero-hit scenario).
// Paths are relative from THIS test file (src/__tests__/) to the dist/ modules.
vi.mock("../../src/brain/quick-screen.js", () => ({
  quickScreen: () => ({
    topScore: 0,
    hits: [],
    candidateScores: [],
  }),
}));

vi.mock("../../src/integrations/taranisAi.js", () => ({
  searchAdverseMedia: async () => ({ ok: false, items: [] }),
}));

vi.mock("../../src/brain/adverse-media-analyser.js", () => ({
  analyseAdverseMediaItems: () => ({ riskTier: "low", sarRecommended: false }),
}));

// --------------------------------------------------------------------------
// Test
// --------------------------------------------------------------------------

describe("ongoing/run — screening-history writing", () => {
  beforeEach(() => {
    vi.resetModules();
    writtenKeys.clear();
    mockSetJson.mockClear();
    mockGetJson.mockClear();
    mockListKeys.mockClear();

    process.env["ONGOING_RUN_TOKEN"] = "test-ongoing-token";
    process.env["ADMIN_TOKEN"] = "test-admin-token";
    process.env["NEXT_PUBLIC_APP_URL"] = "http://localhost:3000";

    // Return subject HS-10001 on getJson for the subject key.
    mockGetJson.mockImplementation(async (key: string) => {
      if (key === "ongoing/subject/HS-10001") {
        return {
          id: "HS-10001",
          name: "Test Subject",
          enrolledAt: new Date().toISOString(),
        };
      }
      // schedule: due now (nextRunAt in the past)
      if (key === "schedule/HS-10001") {
        return {
          subjectId: "HS-10001",
          cadence: "thrice_daily",
          nextRunAt: new Date(Date.now() - 1000).toISOString(),
        };
      }
      return null;
    });
  });

  afterEach(() => {
    delete process.env["ONGOING_RUN_TOKEN"];
    delete process.env["ADMIN_TOKEN"];
    delete process.env["NEXT_PUBLIC_APP_URL"];
  });

  it("writes exactly one screening-history record after one zero-hit run", async () => {
    // Mock fetch for news-search and screening-report calls (non-critical).
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), { status: 401 }),
    );

    const { POST } = await import("../../web/app/api/ongoing/run/route.js");
    const req = new Request("http://localhost/api/ongoing/run", {
      method: "POST",
      headers: { authorization: "Bearer test-ongoing-token" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Find any key matching screening-history/HS-10001/*
    const historyKeys = Array.from(writtenKeys.keys()).filter((k) =>
      k.startsWith("screening-history/HS-10001/"),
    );
    expect(historyKeys).toHaveLength(1);

    const entry = writtenKeys.get(historyKeys[0]!) as {
      at: string;
      topScore: number;
      severity: string;
      lists: string[];
      hits: string[];
    };
    expect(typeof entry.at).toBe("string");
    expect(typeof entry.topScore).toBe("number");
    expect(["clear", "low", "medium", "high", "critical"]).toContain(entry.severity);
    expect(Array.isArray(entry.lists)).toBe(true);
    expect(Array.isArray(entry.hits)).toBe(true);
    // Zero-hit run: hits must be empty.
    expect(entry.hits).toHaveLength(0);
  });
});
