import { describe, it, expect } from "vitest";
import { buildStories } from "../StoryEngine.js";
import type { OsintItem } from "../../integrations/osint-pipeline.js";
import type { NLPExtractionResult } from "../AdverseMediaNLP.js";
import type { ArticleGroup } from "../ArticleGroupingEngine.js";

function makeItem(id: string, title: string, publishedAt: string, source = "reuters.com"): OsintItem {
  return { id, url: `https://example.com/${id}`, title, content: title, publishedAt, source };
}

function makeNLP(persons: string[], entities: string[]): NLPExtractionResult {
  return {
    sourceText: "text",
    wordCount: 20,
    persons: persons.map(name => ({ name, roles: ["suspect"], mentions: 1 })),
    entities: entities.map(name => ({ name, types: ["company"], mentions: 1 })),
    crimes: [{ category: "fraud", keywords: ["fraud"], severity: "high", fatfRecommendations: [] }],
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

function makeGroup(groupId: string, articleIds: string[]): ArticleGroup {
  return {
    groupId,
    label: "fraud — 2023",
    primaryCrimeCategory: "fraud",
    year: 2023,
    articleIds,
    confidence: 0.9,
  };
}

describe("buildStories — same story clustering", () => {
  it("clusters articles sharing a named entity into one story", () => {
    const items = [
      makeItem("a1", "Ali Hassan convicted in Dubai fraud case", "2023-01-01"),
      makeItem("a2", "Ali Hassan sentenced to 5 years for fraud", "2023-01-10"),
      makeItem("a3", "Ali Hassan appeals Dubai fraud conviction", "2023-02-01"),
    ];
    const nlp = new Map<string, NLPExtractionResult>([
      ["a1", makeNLP(["Ali Hassan"], ["Dubai Bank"])],
      ["a2", makeNLP(["Ali Hassan"], ["Dubai Bank"])],
      ["a3", makeNLP(["Ali Hassan"], [])],
    ]);
    const groups = [makeGroup("grp_fraud_2023", ["a1", "a2", "a3"])];
    const stories = buildStories(groups, items, nlp);

    expect(stories).toHaveLength(1);
    expect(stories[0]!.articles).toHaveLength(3);
    expect(stories[0]!.entities).toContain("Ali Hassan");
  });

  it("sets headline from the article with the most entities", () => {
    const items = [
      makeItem("b1", "Short headline", "2023-03-01"),
      makeItem("b2", "Long headline with both Ali Hassan and First Gulf Bank and Dubai Police", "2023-03-02"),
    ];
    const nlp = new Map<string, NLPExtractionResult>([
      ["b1", makeNLP(["Ali Hassan"], [])],                                           // 1 entity total
      ["b2", makeNLP(["Ali Hassan", "Dubai Police"], ["First Gulf Bank"])],           // 3 entities
    ]);
    const groups = [makeGroup("grp_g", ["b1", "b2"])];
    const stories = buildStories(groups, items, nlp);
    expect(stories[0]!.headline).toBe(items[1]!.title);
  });

  it("sorts articles oldest-to-newest within a story", () => {
    const items = [
      makeItem("c1", "Fraud sentencing", "2023-06-15"),
      makeItem("c2", "Fraud arrest", "2023-01-05"),
      makeItem("c3", "Fraud charges filed", "2023-03-20"),
    ];
    const nlp = new Map([
      ["c1", makeNLP(["John Doe"], [])],
      ["c2", makeNLP(["John Doe"], [])],
      ["c3", makeNLP(["John Doe"], [])],
    ]);
    const groups = [makeGroup("grp_c", ["c1", "c2", "c3"])];
    const [story] = buildStories(groups, items, nlp);
    const dates = story!.articles.map(a => a.publishedAt!);
    expect(dates).toEqual([...dates].sort());
  });

  it("sets firstSeen and lastUpdated correctly", () => {
    const items = [
      makeItem("d1", "Early article", "2023-01-01"),
      makeItem("d2", "Later article", "2023-06-30"),
    ];
    const nlp = new Map([
      ["d1", makeNLP(["Jane Smith"], [])],
      ["d2", makeNLP(["Jane Smith"], [])],
    ]);
    const [story] = buildStories([makeGroup("grp_d", ["d1", "d2"])], items, nlp);
    expect(story!.firstSeen).toBe("2023-01-01");
    expect(story!.lastUpdated).toBe("2023-06-30");
  });
});

describe("buildStories — separate events stay separate", () => {
  it("keeps articles beyond the time window in separate stories", () => {
    const items = [
      makeItem("e1", "Ali Hassan arrested", "2018-01-01"),
      makeItem("e2", "Ali Hassan convicted", "2023-09-01"),  // > 90 days apart
    ];
    const nlp = new Map([
      ["e1", makeNLP(["Ali Hassan"], [])],
      ["e2", makeNLP(["Ali Hassan"], [])],
    ]);
    const groups = [makeGroup("grp_e", ["e1", "e2"])];
    const stories = buildStories(groups, items, nlp);
    // 5-year gap → separate stories
    expect(stories).toHaveLength(2);
  });

  it("keeps articles with no shared entities and low title similarity separate", () => {
    const items = [
      makeItem("f1", "Dubai gold refinery fined by CBUAE for compliance failures", "2023-03-01"),
      makeItem("f2", "Singapore property developer convicted of bribery in Indonesia", "2023-03-05"),
    ];
    const nlp = new Map([
      ["f1", makeNLP([], ["Gold Refinery LLC"])],
      ["f2", makeNLP([], ["Property Corp"])],
    ]);
    const groups = [makeGroup("grp_f", ["f1", "f2"])];
    const stories = buildStories(groups, items, nlp);
    expect(stories).toHaveLength(2);
  });
});

describe("buildStories — multiple groups", () => {
  it("processes multiple groups independently", () => {
    const items = [
      makeItem("g1", "ML case 2022", "2022-06-01"),
      makeItem("g2", "Sanctions case 2023", "2023-06-01"),
    ];
    const nlp = new Map([
      ["g1", makeNLP(["Person A"], [])],
      ["g2", makeNLP(["Person B"], [])],
    ]);
    const groups = [
      makeGroup("grp_ml_2022", ["g1"]),
      makeGroup("grp_sanc_2023", ["g2"]),
    ];
    const stories = buildStories(groups, items, nlp);
    expect(stories).toHaveLength(2);
    const groupIds = stories.map(s => s.groupId);
    expect(groupIds).toContain("grp_ml_2022");
    expect(groupIds).toContain("grp_sanc_2023");
  });
});

describe("buildStories — confidence", () => {
  it("returns 0.5 confidence for a solo article", () => {
    const items = [makeItem("h1", "Single article", "2023-01-01")];
    const nlp = new Map([["h1", makeNLP(["Solo Person"], [])]]);
    const [story] = buildStories([makeGroup("grp_h", ["h1"])], items, nlp);
    expect(story!.confidence).toBe(0.5);
  });

  it("returns higher confidence for a multi-article cluster", () => {
    const items = [
      makeItem("j1", "Article one about fraud suspect", "2023-01-01"),
      makeItem("j2", "Article two about fraud suspect", "2023-01-02"),
      makeItem("j3", "Article three about fraud suspect", "2023-01-03"),
    ];
    const nlp = new Map([
      ["j1", makeNLP(["Fraud Suspect"], [])],
      ["j2", makeNLP(["Fraud Suspect"], [])],
      ["j3", makeNLP(["Fraud Suspect"], [])],
    ]);
    const [story] = buildStories([makeGroup("grp_j", ["j1", "j2", "j3"])], items, nlp);
    expect(story!.confidence).toBeGreaterThan(0.5);
  });
});

describe("buildStories — resilience", () => {
  it("returns [] for empty groups", () => {
    expect(buildStories([], [], new Map())).toHaveLength(0);
  });

  it("skips items not present in the items array", () => {
    const items = [makeItem("k1", "Real article", "2023-01-01")];
    const nlp = new Map([["k1", makeNLP(["Person X"], [])]]);
    const groups = [makeGroup("grp_k", ["k1", "k-missing"])];
    const stories = buildStories(groups, items, nlp);
    expect(stories[0]!.articles).toHaveLength(1);
    expect(stories[0]!.articles[0]!.id).toBe("k1");
  });
});
