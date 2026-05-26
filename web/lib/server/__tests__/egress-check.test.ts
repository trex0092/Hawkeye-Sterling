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
  delete process.env["EGRESS_GATE_ENABLED"];
  delete process.env["ANTHROPIC_API_KEY"];
});

// ── Gate disabled (default) ───────────────────────────────────────────────────

describe("egress gate — disabled (default)", () => {
  it("returns allowed:true immediately without calling LLM", async () => {
    // EGRESS_GATE_ENABLED not set → gate is off
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(true);
    expect(result.verdict).toBe("approved");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── Tipping-off regex pre-check ───────────────────────────────────────────────

describe("egress gate — tipping-off regex", () => {
  it("blocks tipping-off without calling LLM", async () => {
    process.env["EGRESS_GATE_ENABLED"] = "true";
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
    process.env["EGRESS_GATE_ENABLED"] = "true";
    // ANTHROPIC_API_KEY NOT set
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
    process.env["EGRESS_GATE_ENABLED"] = "true";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    mockCreate.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe("held_review");
    expect(result.reason).toMatch(/LLM check failed/i);
  });

  it("returns held_review when LLM throws a 503 upstream error", async () => {
    process.env["EGRESS_GATE_ENABLED"] = "true";
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
    process.env["EGRESS_GATE_ENABLED"] = "true";
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
    process.env["EGRESS_GATE_ENABLED"] = "true";
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
    process.env["EGRESS_GATE_ENABLED"] = "true";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"verdict":"approved","reason":"No tipping-off detected, all sections complete."}' }],
    });
    const result = await runEgressCheck(CLEAN_NARRATIVE, "STR filing");
    expect(result.allowed).toBe(true);
    expect(result.verdict).toBe("approved");
  });
});
