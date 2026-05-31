// Unit tests for the egress gate fail-closed security behaviour.
//
// FDL 10/2025 Art.17 makes tipping-off a criminal offence. The gate must
// NEVER approve an artefact when it cannot verify compliance — missing API
// key, LLM call failure, and unparseable response must all result in
// held_review (not approved).

import { describe, it, expect, vi, afterEach } from "vitest";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Prevents the OTel tracer import from throwing in non-Next.js test environment.
vi.mock("@/lib/server/tracer", () => ({
  startSpan: () => ({
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  }),
  SpanStatus: { OK: 1, ERROR: 2 },
}));

// The LLM client factory — replace with a controllable mock.
const mockCreate = vi.fn();
vi.mock("@/lib/server/llm", () => ({
  getAnthropicClient: () => ({ messages: { create: mockCreate } }),
}));

// Import AFTER mocks are registered.
import { runEgressCheck } from "../egress-check";

const CLEAN_NARRATIVE = "Standard transaction report. Subject XYZ Inc transferred 100,000 AED for import of electronic goods.";
const TIPPING_NARRATIVE = "We are reporting you to the FIU — an STR has been filed against your account.";

afterEach(() => {
  vi.restoreAllMocks();
  // F-02 fix: gate is now ON by default; opt-out via EGRESS_GATE_DISABLED=true
  delete process.env["EGRESS_GATE_DISABLED"];
  delete process.env["ANTHROPIC_API_KEY"];
});

// ── Gate explicitly disabled (opt-out) ───────────────────────────────────────
// F-02: Gate is ON by default. EGRESS_GATE_DISABLED=true is the explicit opt-out.

describe("egress gate — explicitly disabled via EGRESS_GATE_DISABLED=true", () => {
  it("returns allowed:true immediately without calling LLM when gate is explicitly disabled", async () => {
    process.env["EGRESS_GATE_DISABLED"] = "true";
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(true);
    expect(result.verdict).toBe("approved");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── Gate ON by default ────────────────────────────────────────────────────────
// F-02: When EGRESS_GATE_DISABLED is not set, the gate is active.

describe("egress gate — enabled by default (F-02)", () => {
  it("fails closed (held_review) when gate is on but API key is absent", async () => {
    // EGRESS_GATE_DISABLED not set → gate is ON; no API key → fail closed
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("held_review");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── Tipping-off regex pre-check ───────────────────────────────────────────────

describe("egress gate — tipping-off regex", () => {
  it("blocks tipping-off without calling LLM", async () => {
    // Gate is on by default; tipping-off blocked at regex stage before LLM call
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    const result = await runEgressCheck(TIPPING_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("held_tipping_off");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── Fail-closed: missing API key ──────────────────────────────────────────────

describe("egress gate — fail-closed on missing API key", () => {
  it("returns held_review when ANTHROPIC_API_KEY is absent", async () => {
    // Gate is on by default; ANTHROPIC_API_KEY NOT set → fail closed
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("held_review");
    expect(result.reason).toMatch(/ANTHROPIC_API_KEY absent/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── Fail-closed: LLM call throws ─────────────────────────────────────────────

describe("egress gate — fail-closed on LLM failure", () => {
  it("returns held_review when LLM throws a network error", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    mockCreate.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("held_review");
    expect(result.reason).toMatch(/LLM check failed/i);
  });

  it("returns held_review when LLM throws a 503 upstream error", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    mockCreate.mockRejectedValueOnce(new Error("503 Service Unavailable"));
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("held_review");
  });
});

// ── Fail-closed: unparseable LLM response ────────────────────────────────────

describe("egress gate — fail-closed on unparseable response", () => {
  it("returns held_review when LLM returns non-JSON text", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "I cannot assess this document at this time." }],
    });
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("held_review");
    expect(result.reason).toMatch(/unparseable/i);
  });

  it("returns held_review when verdict field is missing from JSON", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{ "reason": "looks fine" }' }],
    });
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    // Missing verdict → defaults to held_review
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("held_review");
  });
});

// ── Happy path: LLM approves ──────────────────────────────────────────────────

describe("egress gate — approval path", () => {
  it("returns allowed:true when LLM returns approved verdict", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"verdict":"approved","reason":"No tipping-off detected, all sections complete."}' }],
    });
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(true);
    expect(result.verdict).toBe("approved");
  });
});
