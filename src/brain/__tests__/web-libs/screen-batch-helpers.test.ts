// Unit tests for pure helper functions in web/app/api/screen/batch/route.ts.
//
// normaliseSubjectName, scoreToBand, and scoreToRecommendation are not
// exported from the route handler. They are re-implemented here verbatim
// so their logic can be verified independently of the Next.js runtime.

import { describe, it, expect } from "vitest";

// ─── Re-implementations of pure helpers from screen/batch/route.ts ──────────

function normaliseSubjectName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreToBand(score: number): string {
  if (score >= 95) return "critical";
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  if (score > 0) return "low";
  return "clear";
}

function scoreToRecommendation(score: number): "match" | "review" | "dismiss" {
  if (score >= 70) return "match";
  if (score >= 35) return "review";
  return "dismiss";
}

// ─────────────────────────────────────────────────────────────────────────────

describe("normaliseSubjectName", () => {
  it("lowercases the name", () => {
    expect(normaliseSubjectName("JOHN SMITH")).toBe("john smith");
    expect(normaliseSubjectName("Acme Corp")).toBe("acme corp");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normaliseSubjectName("  john  ")).toBe("john");
    expect(normaliseSubjectName("\tjohn doe\n")).toBe("john doe");
  });

  it("collapses internal whitespace to a single space", () => {
    expect(normaliseSubjectName("john   doe")).toBe("john doe");
    expect(normaliseSubjectName("acme  corp  ltd")).toBe("acme corp ltd");
  });

  it("is idempotent — already-normalised names are unchanged", () => {
    const normalised = "john doe";
    expect(normaliseSubjectName(normalised)).toBe(normalised);
  });

  it("makes duplicate detection case-insensitive", () => {
    const a = normaliseSubjectName("John Smith");
    const b = normaliseSubjectName("JOHN SMITH");
    expect(a).toBe(b);
  });

  it("preserves non-ASCII characters (Arabic, CJK) after lowercasing", () => {
    // AML systems must handle multi-script names.
    expect(normaliseSubjectName("محمد علي")).toBe("محمد علي");
    expect(normaliseSubjectName("山田太郎")).toBe("山田太郎");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("scoreToBand", () => {
  it("score >= 95 → critical", () => {
    expect(scoreToBand(95)).toBe("critical");
    expect(scoreToBand(100)).toBe("critical");
    expect(scoreToBand(97)).toBe("critical");
  });

  it("score in [85, 95) → high", () => {
    expect(scoreToBand(85)).toBe("high");
    expect(scoreToBand(94)).toBe("high");
    expect(scoreToBand(90)).toBe("high");
  });

  it("score in [70, 85) → medium", () => {
    expect(scoreToBand(70)).toBe("medium");
    expect(scoreToBand(84)).toBe("medium");
    expect(scoreToBand(75)).toBe("medium");
  });

  it("score in (0, 70) → low", () => {
    expect(scoreToBand(1)).toBe("low");
    expect(scoreToBand(69)).toBe("low");
    expect(scoreToBand(35)).toBe("low");
  });

  it("score === 0 → clear", () => {
    expect(scoreToBand(0)).toBe("clear");
  });

  it("boundary: 95 is critical, 94 is high", () => {
    expect(scoreToBand(95)).toBe("critical");
    expect(scoreToBand(94)).toBe("high");
  });

  it("boundary: 85 is high, 84 is medium", () => {
    expect(scoreToBand(85)).toBe("high");
    expect(scoreToBand(84)).toBe("medium");
  });

  it("boundary: 70 is medium, 69 is low", () => {
    expect(scoreToBand(70)).toBe("medium");
    expect(scoreToBand(69)).toBe("low");
  });

  it("boundary: 1 is low, 0 is clear", () => {
    expect(scoreToBand(1)).toBe("low");
    expect(scoreToBand(0)).toBe("clear");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("scoreToRecommendation", () => {
  it("score >= 70 → match", () => {
    expect(scoreToRecommendation(70)).toBe("match");
    expect(scoreToRecommendation(85)).toBe("match");
    expect(scoreToRecommendation(100)).toBe("match");
  });

  it("score in [35, 70) → review", () => {
    expect(scoreToRecommendation(35)).toBe("review");
    expect(scoreToRecommendation(69)).toBe("review");
    expect(scoreToRecommendation(50)).toBe("review");
  });

  it("score < 35 → dismiss", () => {
    expect(scoreToRecommendation(0)).toBe("dismiss");
    expect(scoreToRecommendation(34)).toBe("dismiss");
    expect(scoreToRecommendation(10)).toBe("dismiss");
  });

  it("boundary: 70 is match, 69 is review", () => {
    expect(scoreToRecommendation(70)).toBe("match");
    expect(scoreToRecommendation(69)).toBe("review");
  });

  it("boundary: 35 is review, 34 is dismiss", () => {
    expect(scoreToRecommendation(35)).toBe("review");
    expect(scoreToRecommendation(34)).toBe("dismiss");
  });

  it("recommendation thresholds align with FATF risk-based approach: match = actionable", () => {
    // High-risk jurisdictions (FATF black/grey list members) require immediate
    // action at match level — the threshold of 70 must remain stable.
    expect(scoreToRecommendation(70)).toBe("match");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dedup guard logic (inline — not exported from route)
// ─────────────────────────────────────────────────────────────────────────────

describe("batch dedup guard", () => {
  function findDuplicates(names: string[]): string[] {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const name of names) {
      const key = normaliseSubjectName(name);
      if (seen.has(key)) duplicates.push(name);
      seen.add(key);
    }
    return duplicates;
  }

  it("returns empty array when all names are unique", () => {
    expect(findDuplicates(["Alice", "Bob", "Carol"])).toHaveLength(0);
  });

  it("detects exact duplicate", () => {
    const dups = findDuplicates(["Alice", "Bob", "Alice"]);
    expect(dups).toContain("Alice");
  });

  it("detects case-insensitive duplicate", () => {
    const dups = findDuplicates(["john smith", "John Smith"]);
    expect(dups.length).toBeGreaterThan(0);
  });

  it("detects whitespace-normalised duplicate", () => {
    const dups = findDuplicates(["john  doe", "john doe"]);
    expect(dups.length).toBeGreaterThan(0);
  });

  it("handles a batch of one with no duplicates", () => {
    expect(findDuplicates(["Solo Subject"])).toHaveLength(0);
  });
});
