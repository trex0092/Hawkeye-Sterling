import { describe, it, expect } from "vitest";
import { groupArticles } from "../ArticleGroupingEngine.js";
import type { OsintItem } from "../../integrations/osint-pipeline.js";
import type { NLPExtractionResult } from "../AdverseMediaNLP.js";

function makeItem(id: string, publishedAt: string): OsintItem {
  return { id, url: `https://example.com/${id}`, title: `Article ${id}`, content: "content", publishedAt, source: "test" };
}

function makeNLP(id: string, crimes: string[]): NLPExtractionResult {
  return {
    sourceText: "text",
    wordCount: 10,
    persons: [],
    entities: [],
    crimes: crimes.map(cat => ({ category: cat, keywords: [cat], severity: "high" as const, fatfRecommendations: [] })),
    penalties: [],
    dates: [],
    jurisdictions: [],
    sanctionsMentioned: false,
    convictionMentioned: false,
    arrestMentioned: false,
    sarRelevant: false,
    confidenceScore: 0.8,
    extractedAt: new Date().toISOString(),
  };
}

describe("groupArticles — basic grouping", () => {
  it("groups articles with the same crime + year into one group", () => {
    const items = [
      makeItem("a1", "2023-03-01"),
      makeItem("a2", "2023-06-15"),
      makeItem("a3", "2023-09-20"),
    ];
    const nlp = new Map<string, NLPExtractionResult>([
      ["a1", makeNLP("a1", ["money_laundering"])],
      ["a2", makeNLP("a2", ["money_laundering"])],
      ["a3", makeNLP("a3", ["money_laundering"])],
    ]);
    const groups = groupArticles(items, nlp);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.articleIds).toHaveLength(3);
    expect(groups[0]!.primaryCrimeCategory).toBe("money_laundering");
    expect(groups[0]!.year).toBe(2023);
  });

  it("separates articles from different years into different groups", () => {
    const items = [
      makeItem("b1", "2019-01-10"),
      makeItem("b2", "2023-05-20"),
    ];
    const nlp = new Map<string, NLPExtractionResult>([
      ["b1", makeNLP("b1", ["money_laundering"])],
      ["b2", makeNLP("b2", ["money_laundering"])],
    ]);
    const groups = groupArticles(items, nlp);
    expect(groups).toHaveLength(2);
    const years = groups.map(g => g.year).sort();
    expect(years).toEqual([2019, 2023]);
  });

  it("separates articles with different primary crime categories", () => {
    const items = [
      makeItem("c1", "2023-01-01"),
      makeItem("c2", "2023-02-01"),
    ];
    const nlp = new Map<string, NLPExtractionResult>([
      ["c1", makeNLP("c1", ["money_laundering"])],
      ["c2", makeNLP("c2", ["sanctions_evasion"])],
    ]);
    const groups = groupArticles(items, nlp);
    expect(groups).toHaveLength(2);
    const cats = groups.map(g => g.primaryCrimeCategory).sort();
    expect(cats).toContain("money_laundering");
    expect(cats).toContain("sanctions_evasion");
  });
});

describe("groupArticles — group metadata", () => {
  it("produces a human-readable label with crime and year", () => {
    const items = [makeItem("d1", "2022-07-15")];
    const nlp = new Map([["d1", makeNLP("d1", ["bribery_corruption"])]]);
    const groups = groupArticles(items, nlp);
    expect(groups[0]!.label).toContain("bribery_corruption");
    expect(groups[0]!.label).toContain("2022");
  });

  it("generates a stable groupId", () => {
    const items = [makeItem("e1", "2021-04-01")];
    const nlp = new Map([["e1", makeNLP("e1", ["fraud"])]]);
    const groups = groupArticles(items, nlp);
    expect(groups[0]!.groupId).toMatch(/^grp_/);
  });

  it("confidence is 0.5 for single-article groups", () => {
    const items = [makeItem("f1", "2023-01-01")];
    const nlp = new Map([["f1", makeNLP("f1", ["fraud"])]]);
    const groups = groupArticles(items, nlp);
    expect(groups[0]!.confidence).toBe(0.5);
  });

  it("confidence > 0.5 for groups with identical crime sets", () => {
    const items = [makeItem("g1", "2023-01-01"), makeItem("g2", "2023-02-01")];
    const nlp = new Map([
      ["g1", makeNLP("g1", ["money_laundering"])],
      ["g2", makeNLP("g2", ["money_laundering"])],
    ]);
    const groups = groupArticles(items, nlp);
    // Two articles with same crime set → Jaccard = 1.0
    expect(groups[0]!.confidence).toBeGreaterThan(0.5);
  });
});

describe("groupArticles — articles without NLP results", () => {
  it("places articles with no NLP into the 'unknown' group", () => {
    const items = [makeItem("h1", "2023-01-01"), makeItem("h2", "2023-02-01")];
    const nlp = new Map<string, NLPExtractionResult>(); // empty
    const groups = groupArticles(items, nlp);
    expect(groups[0]!.primaryCrimeCategory).toBe("unknown");
    expect(groups[0]!.articleIds).toHaveLength(2);
  });
});

describe("groupArticles — sort order", () => {
  it("returns groups sorted by article count descending", () => {
    const items = [
      makeItem("i1", "2023-01-01"),
      makeItem("i2", "2023-01-02"),
      makeItem("i3", "2023-01-03"),
      makeItem("i4", "2022-01-01"),
    ];
    const nlp = new Map([
      ["i1", makeNLP("i1", ["fraud"])],
      ["i2", makeNLP("i2", ["fraud"])],
      ["i3", makeNLP("i3", ["fraud"])],
      ["i4", makeNLP("i4", ["fraud"])],
    ]);
    const groups = groupArticles(items, nlp);
    // 2023 fraud group has 3 articles, 2022 fraud group has 1
    expect(groups[0]!.articleIds.length).toBeGreaterThanOrEqual(groups[1]!.articleIds.length);
  });
});

describe("groupArticles — empty input", () => {
  it("returns empty array for no items", () => {
    expect(groupArticles([], new Map())).toHaveLength(0);
  });
});
