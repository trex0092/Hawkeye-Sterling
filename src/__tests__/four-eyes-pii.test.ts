// Unit test: four-eyes-gate conflict messages must not leak raw actor PII.
//
// Security requirement (UAE PDPL + FDL 10/2025 Art.16): when a same-actor
// double-approval is detected, the conflict message must contain the actor's
// SHA-256 hash (first 12 hex chars) — NOT the raw email address or GID.
// Violating this would embed PII in error responses visible to API callers.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.spyOn(console, "warn").mockImplementation(() => undefined);
vi.spyOn(console, "info").mockImplementation(() => undefined);
vi.spyOn(console, "error").mockImplementation(() => undefined);

// --------------------------------------------------------------------------
// Mock infrastructure
// --------------------------------------------------------------------------

// We capture all setJson writes and replay them via getJson/listKeys
// so the four-eyes-gate has a consistent in-memory store for the test.
const store = new Map<string, unknown>();

vi.mock("@/lib/server/store", () => ({
  getJson: async (key: string) => store.get(key) ?? null,
  setJson: async (key: string, value: unknown) => { store.set(key, value); },
  del: async (key: string) => { store.delete(key); },
  listKeys: async (prefix: string) => Array.from(store.keys()).filter((k) => k.startsWith(prefix)),
}));

vi.mock("@/lib/server/tracer", () => ({
  startSpan: () => ({
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  }),
  SpanStatus: { OK: 1, ERROR: 2 },
}));

vi.mock("@/lib/server/audit-chain", () => ({
  writeAuditChainEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server/metrics-store", () => ({
  incrementCounter: vi.fn(),
  getCounter: vi.fn().mockReturnValue(0),
  getAllCounters: vi.fn().mockReturnValue({}),
}));

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const ACTOR_EMAIL = "mlro.officer@hawkeye-sterling.com";
const LONG_RATIONALE = "Dual-attestation: first sign-off for STR case X — full review completed.";

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("four-eyes-gate — conflict message PII hygiene", () => {
  beforeEach(() => {
    vi.resetModules();
    store.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("conflict message does not contain the raw actor email on same-actor double-approval", async () => {
    const { recordApproval } = await import("@/lib/server/four-eyes-gate");
    const caseId = `test-case-${Date.now()}`;

    // First approval succeeds.
    await recordApproval({ caseId, actor: ACTOR_EMAIL, decision: "approve", rationale: LONG_RATIONALE });

    // Second approval from the same actor triggers conflict.
    const result = await recordApproval({ caseId, actor: ACTOR_EMAIL, decision: "approve", rationale: LONG_RATIONALE });

    expect(result.conflict).toBeDefined();
    // Raw email must NOT appear in the conflict string.
    expect(result.conflict).not.toContain(ACTOR_EMAIL);
  });

  it("conflict message contains a hex hash (not plaintext) as actor identifier", async () => {
    const { recordApproval } = await import("@/lib/server/four-eyes-gate");
    const caseId = `test-case-${Date.now()}`;

    await recordApproval({ caseId, actor: ACTOR_EMAIL, decision: "approve", rationale: LONG_RATIONALE });
    const result = await recordApproval({ caseId, actor: ACTOR_EMAIL, decision: "approve", rationale: LONG_RATIONALE });

    expect(result.conflict).toBeDefined();
    // hashActor produces 12 hex characters — the conflict should reference it.
    expect(result.conflict).toMatch(/[0-9a-f]{12}/);
  });

  it("two distinct actors can both approve without a conflict", async () => {
    const { recordApproval } = await import("@/lib/server/four-eyes-gate");
    const caseId = `test-case-${Date.now()}`;

    const r1 = await recordApproval({ caseId, actor: "officer-a@bank.ae", decision: "approve", rationale: LONG_RATIONALE });
    const r2 = await recordApproval({ caseId, actor: "officer-b@bank.ae", decision: "approve", rationale: LONG_RATIONALE });

    expect(r1.conflict).toBeUndefined();
    expect(r2.conflict).toBeUndefined();
    // With two distinct approvers the case should now be passed.
    expect(r2.status.passed).toBe(true);
  });

  it("returns an error when rationale is too short (< 20 chars)", async () => {
    const { recordApproval } = await import("@/lib/server/four-eyes-gate");
    const caseId = `test-case-${Date.now()}`;

    await expect(
      recordApproval({ caseId, actor: ACTOR_EMAIL, decision: "approve", rationale: "too short" }),
    ).rejects.toThrow(/rationale must be at least 20 characters/);
  });
});
