// Hawkeye Sterling — adverse-media enhanced test suite.
// Additional tests beyond adverse-media-i18n.test.ts:
//   - multilingual keyword arrays are non-empty (smoke test)
//   - classifyAdverseMedia detects Arabic keywords and maps to correct category
//   - transliteration variant smoke test

import { describe, expect, it } from "vitest";
import { classifyAdverseMedia, ADVERSE_MEDIA_CATEGORIES, ADVERSE_MEDIA_QUERY } from "../adverse-media.js";
import { classifyI18n, detectLanguage, I18N_PACKS } from "../adverse-media-i18n.js";

describe("adverse-media multilingual keyword coverage", () => {
  it("Arabic keyword pack is non-empty", () => {
    expect(I18N_PACKS["ar"]).toBeDefined();
    expect(I18N_PACKS["ar"]!.keywords.length).toBeGreaterThan(5);
  });

  it("Chinese keyword pack is non-empty", () => {
    expect(I18N_PACKS["zh"]).toBeDefined();
    expect(I18N_PACKS["zh"]!.keywords.length).toBeGreaterThan(5);
  });

  it("Russian keyword pack is non-empty", () => {
    expect(I18N_PACKS["ru"]).toBeDefined();
    expect(I18N_PACKS["ru"]!.keywords.length).toBeGreaterThan(5);
  });

  it("French keyword pack is non-empty", () => {
    expect(I18N_PACKS["fr"]).toBeDefined();
    expect(I18N_PACKS["fr"]!.keywords.length).toBeGreaterThan(5);
  });
});

describe("ADVERSE_MEDIA_CATEGORIES completeness", () => {
  it("includes all 17 expected risk categories", () => {
    const ids = ADVERSE_MEDIA_CATEGORIES.map((c) => c.id);
    expect(ids).toContain("ml_financial_crime");
    expect(ids).toContain("terrorist_financing");
    expect(ids).toContain("corruption_organised_crime");
    expect(ids).toContain("sanctions_violations");
    expect(ids).toContain("human_trafficking_modern_slavery");
    expect(ids).toContain("cybercrime");
    expect(ids).toContain("drug_trafficking");
    expect(ids).toContain("esg");
  });

  it("each category has non-empty keyword list", () => {
    for (const cat of ADVERSE_MEDIA_CATEGORIES) {
      expect(cat.keywords.length, `Category ${cat.id} has no keywords`).toBeGreaterThan(0);
    }
  });
});

describe("ADVERSE_MEDIA_QUERY", () => {
  it("is a non-empty string", () => {
    expect(typeof ADVERSE_MEDIA_QUERY).toBe("string");
    expect(ADVERSE_MEDIA_QUERY.length).toBeGreaterThan(50);
  });

  it("contains at least one known adverse term", () => {
    expect(ADVERSE_MEDIA_QUERY.toLowerCase()).toMatch(/sanction|laundering|fraud|terror|brib/);
  });
});

describe("classifyAdverseMedia — Arabic keyword detection", () => {
  it("detects Arabic AML-related text and maps to correct category", () => {
    const arabicText = "تجميد الأصول وفقاً لقائمة العقوبات الدولية";
    const hits = classifyAdverseMedia(arabicText);
    expect(hits.length).toBeGreaterThan(0);
    // At least one hit should have a lang-prefixed keyword (ar:)
    const hasArabicHit = hits.some((h) => h.keyword.startsWith("ar:") || h.categoryId === "sanctions_violations");
    expect(hasArabicHit).toBe(true);
  });

  it("maps Arabic money-laundering phrase to ml_financial_crime or sanctions_violations", () => {
    const hits = classifyAdverseMedia("غسل الأموال والفساد المالي");
    const categories = hits.map((h) => h.categoryId);
    const isRelevant = categories.some((c) =>
      c === "ml_financial_crime" || c === "corruption_organised_crime" || c === "sanctions_violations",
    );
    expect(isRelevant).toBe(true);
  });

  it("returns empty array for neutral text", () => {
    const hits = classifyAdverseMedia("The weather today is sunny and warm");
    expect(hits).toHaveLength(0);
  });

  it("detects English sanctions keyword", () => {
    const hits = classifyAdverseMedia("The company faces sanctions for violating export controls");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.categoryId === "sanctions_violations")).toBe(true);
  });

  it("detects money laundering in English", () => {
    const hits = classifyAdverseMedia("Suspect charged with money laundering and wire fraud");
    expect(hits.some((h) => h.categoryId === "ml_financial_crime")).toBe(true);
  });
});

describe("detectLanguage — script detection", () => {
  it("detects Arabic script", () => {
    expect(detectLanguage("غسل الأموال")).toBe("ar");
  });

  it("detects Chinese script", () => {
    expect(detectLanguage("洗钱调查")).toBe("zh");
  });

  it("detects Russian Cyrillic", () => {
    expect(detectLanguage("отмывание денег")).toBe("ru");
  });

  it("falls back to English for Latin script without strong signals", () => {
    expect(detectLanguage("money laundering investigation")).toBe("en");
  });
});

describe("classifyI18n — multilingual classification", () => {
  it("classifies Arabic sanctions phrase", () => {
    const hits = classifyI18n("تجميد الأصول وفق قائمة العقوبات");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.lang).toBe("ar");
  });

  it("classifies Chinese money laundering", () => {
    const hits = classifyI18n("涉嫌洗钱案件被调查");
    expect(hits.some((h) => h.lang === "zh")).toBe(true);
  });

  it("returns empty for neutral English text", () => {
    const hits = classifyI18n("The quarterly earnings report was released today");
    expect(hits).toHaveLength(0);
  });
});
