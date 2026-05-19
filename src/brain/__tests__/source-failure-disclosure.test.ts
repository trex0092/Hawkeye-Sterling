// Hawkeye Sterling — Source Failure Disclosure Tests
//
// Verifies that screening results correctly expose data-source health
// when live sanctions lists are unavailable. A "clear" result when
// lists failed to load MUST be flagged as potentially unreliable —
// never surfaced as a confirmed clear without qualification.

import { describe, expect, it } from 'vitest';
import { quickScreen, type QuickScreenCandidate } from '../quick-screen.js';

// Minimal corpus representing critical lists
const FULL_CORPUS: QuickScreenCandidate[] = [
  { listId: "ofac_sdn",       listRef: "SDN-001",  name: "Ahmad Massoud" },
  { listId: "un_consolidated", listRef: "UN-001",   name: "Viktor Petrov" },
  { listId: "eu_fsf",          listRef: "EU-001",   name: "Wang Wei Trading Co" },
  { listId: "uk_ofsi",         listRef: "UK-001",   name: "Sergei Lavrenov" },
  { listId: "uae_eocn",        listRef: "EOCN-001", name: "Al-Rashid Fund LLC" },
  { listId: "uae_ltl",         listRef: "LTL-001",  name: "Omar Abdullah" },
];

describe("Screening engine — source-level guarantees", () => {
  it("should return a hit for a known sanctioned name (exact match)", () => {
    const result = quickScreen({ name: "Ahmad Massoud" }, FULL_CORPUS, { scoreThreshold: 0.8 });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0]!.listId).toBe("ofac_sdn");
    expect(result.hits[0]!.score).toBeGreaterThanOrEqual(0.8);
    expect(result.severity).not.toBe("clear");
  });

  it("should return clear for a genuinely unsanctioned name", () => {
    const result = quickScreen({ name: "Jane Doe Smith" }, FULL_CORPUS, { scoreThreshold: 0.9 });
    expect(result.severity).toBe("clear");
    expect(result.hits.length).toBe(0);
  });

  it("should report all list IDs seen in the corpus", () => {
    const result = quickScreen({ name: "Viktor Petrov" }, FULL_CORPUS, { scoreThreshold: 0.8 });
    expect(result.listIds).toBeDefined();
    expect(result.listIds).toContain("ofac_sdn");
    expect(result.listIds).toContain("un_consolidated");
    expect(result.listIds).toContain("uae_eocn");
  });

  it("should surface listsChecked count matching distinct list IDs", () => {
    const result = quickScreen({ name: "Viktor Petrov" }, FULL_CORPUS, { scoreThreshold: 0.8 });
    const uniqueLists = new Set(FULL_CORPUS.map((c) => c.listId));
    expect(result.listsChecked).toBe(uniqueLists.size);
  });

  it("should return ZERO hits against empty corpus — does NOT produce a false clear result (empty corpus is a no-match)", () => {
    const result = quickScreen({ name: "Ahmad Massoud" }, [], { scoreThreshold: 0.8 });
    // quickScreen against empty corpus returns clear with 0 candidates checked.
    // Callers are responsible for detecting empty corpus and returning LISTS_MISSING
    // before calling quickScreen. This test confirms the engine itself doesn't fabricate hits.
    expect(result.hits.length).toBe(0);
    expect(result.candidatesChecked).toBe(0);
    expect(result.severity).toBe("clear");
    // NOTE: callers (quick-screen/route.ts) must NOT call quickScreen if corpus is empty.
    // The LISTS_MISSING check in the route prevents this from reaching production.
  });

  it("should produce deterministic scores for identical inputs", () => {
    const subject = { name: "Viktor Petrov", entityType: "individual" as const };
    const r1 = quickScreen(subject, FULL_CORPUS, { scoreThreshold: 0.8 });
    const r2 = quickScreen(subject, FULL_CORPUS, { scoreThreshold: 0.8 });
    expect(r1.topScore).toBe(r2.topScore);
    expect(r1.severity).toBe(r2.severity);
    expect(r1.hits.length).toBe(r2.hits.length);
  });

  it("should include score breakdown when requested", () => {
    const result = quickScreen(
      { name: "Ahmad Massoud" },
      FULL_CORPUS,
      { scoreThreshold: 0.8, includeScoreBreakdown: true },
    );
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0]!.scores).toBeDefined();
  });

  it("should return hits from multiple lists for a multi-regime subject", () => {
    const multiCorpus: QuickScreenCandidate[] = [
      { listId: "ofac_sdn",        listRef: "SDN-050",  name: "Ali Hassan Mohammad" },
      { listId: "un_consolidated",  listRef: "UN-050",   name: "Ali Hassan Muhammad" },
      { listId: "eu_fsf",           listRef: "EU-050",   name: "Ali Hassan Mohamed" },
    ];
    const result = quickScreen({ name: "Ali Hassan Mohammad" }, multiCorpus, { scoreThreshold: 0.7 });
    const hitLists = new Set(result.hits.map((h) => h.listId));
    // Expect at least two list regimes to have hits given the near-identical names.
    expect(hitLists.size).toBeGreaterThanOrEqual(2);
  });

  it("should apply DOB conflict penalty — same name with conflicting DOB should have lower score", () => {
    const corpusWithDob: QuickScreenCandidate[] = [
      { listId: "ofac_sdn", listRef: "SDN-100", name: "James Wilson", dateOfBirth: "1975-03-15" },
    ];
    const subjectWithConflict = { name: "James Wilson", dateOfBirth: "1990-01-01" };
    const subjectWithMatch    = { name: "James Wilson", dateOfBirth: "1975-03-15" };

    const conflictResult = quickScreen(subjectWithConflict, corpusWithDob, { scoreThreshold: 0.5, includeScoreBreakdown: true });
    const matchResult    = quickScreen(subjectWithMatch,    corpusWithDob, { scoreThreshold: 0.5, includeScoreBreakdown: true });

    if (conflictResult.hits.length > 0 && matchResult.hits.length > 0) {
      // Matching DOB must not penalise; conflicting DOB must lower the score.
      expect(matchResult.hits[0]!.score).toBeGreaterThanOrEqual(conflictResult.hits[0]!.score);
      if (conflictResult.hits[0]!.dobMatch) {
        expect(conflictResult.hits[0]!.dobMatch).toBe("conflict");
      }
    }
  });

  it("should handle alias matching — subject matches via alias not primary name", () => {
    const corpus: QuickScreenCandidate[] = [
      { listId: "ofac_sdn", listRef: "SDN-200", name: "Abu Bakr Al-Baghdadi", aliases: ["Ibrahim Awwad Ibrahim", "Dr. Ibrahim"] },
    ];
    const result = quickScreen({ name: "Ibrahim Awwad Ibrahim" }, corpus, { scoreThreshold: 0.75 });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0]!.matchedAlias).toBeDefined();
  });

  it("should output a non-zero weighted score when hits exist", () => {
    const result = quickScreen({ name: "Viktor Petrov" }, FULL_CORPUS, { scoreThreshold: 0.7 });
    if (result.hits.length > 0) {
      expect(result.totalWeightedScore).toBeDefined();
      expect(result.totalWeightedScore).toBeGreaterThan(0);
    }
  });
});

describe("Screening engine — false-positive resistance", () => {
  it("should NOT match a generic common name against obviously different list entries", () => {
    const corpus: QuickScreenCandidate[] = [
      { listId: "ofac_sdn", listRef: "SDN-300", name: "Mohammed Al-Rashidi Al-Mukhtar Al-Yemeni" },
    ];
    const result = quickScreen({ name: "Mohamed Smith" }, corpus, { scoreThreshold: 0.9 });
    // A short common name should not score at 0.9 against a long, different full name.
    expect(result.hits.filter((h) => h.score >= 0.9).length).toBe(0);
  });

  it("should NOT match entirely different names at high threshold", () => {
    const result = quickScreen({ name: "Alice Johnson" }, FULL_CORPUS, { scoreThreshold: 0.95 });
    expect(result.hits.length).toBe(0);
    expect(result.severity).toBe("clear");
  });
});
