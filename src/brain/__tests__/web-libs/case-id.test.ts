// Unit tests for web/lib/server/case-id.ts

import { describe, it, expect } from "vitest";
import {
  CASE_ID_RE,
  generateCaseId,
  parseCaseId,
} from "../../../../web/lib/server/case-id.js";

describe("CASE_ID_RE", () => {
  it("matches valid case IDs", () => {
    expect(CASE_ID_RE.test("CASE-20260517-a3f9")).toBe(true);
    expect(CASE_ID_RE.test("CASE-20260101-0000")).toBe(true);
    expect(CASE_ID_RE.test("CASE-99991231-ffff")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(CASE_ID_RE.test("case-20260517-a3f9")).toBe(false); // lowercase
    expect(CASE_ID_RE.test("CASE-2026051-a3f9")).toBe(false);  // short date
    expect(CASE_ID_RE.test("CASE-20260517-a3f")).toBe(false);  // short suffix
    expect(CASE_ID_RE.test("CASE-20260517-A3F9")).toBe(false); // uppercase suffix
    expect(CASE_ID_RE.test("CASE-20260517")).toBe(false);       // missing suffix
    expect(CASE_ID_RE.test("20260517-a3f9")).toBe(false);       // missing prefix
  });
});

describe("generateCaseId", () => {
  it("generates valid IDs", () => {
    for (let i = 0; i < 20; i++) {
      const id = generateCaseId();
      expect(CASE_ID_RE.test(id)).toBe(true);
    }
  });

  it("starts with CASE-", () => {
    expect(generateCaseId().startsWith("CASE-")).toBe(true);
  });

  it("embeds today's UTC date", () => {
    const id = generateCaseId();
    const now = new Date();
    const yyyy = now.getUTCFullYear().toString();
    const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
    const dd = now.getUTCDate().toString().padStart(2, "0");
    const dateStr = `${yyyy}${mm}${dd}`;
    expect(id).toContain(`CASE-${dateStr}-`);
  });

  it("produces unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateCaseId()));
    expect(ids.size).toBeGreaterThan(90); // allow very rare collisions
  });
});

describe("parseCaseId", () => {
  it("parses valid IDs", () => {
    const result = parseCaseId("CASE-20260517-a3f9");
    expect(result).not.toBeNull();
    expect(result?.date).toBe("20260517");
    expect(result?.suffix).toBe("a3f9");
  });

  it("parses generated IDs", () => {
    const id = generateCaseId();
    const parsed = parseCaseId(id);
    expect(parsed).not.toBeNull();
    expect(parsed?.date).toHaveLength(8);
    expect(parsed?.suffix).toHaveLength(4);
  });

  it("returns null for invalid IDs", () => {
    expect(parseCaseId("not-a-case-id")).toBeNull();
    expect(parseCaseId("")).toBeNull();
    expect(parseCaseId("CASE-20260517")).toBeNull();
  });

  it("returns null for non-strings", () => {
    expect(parseCaseId(null as unknown as string)).toBeNull();
    expect(parseCaseId(42 as unknown as string)).toBeNull();
  });
});
