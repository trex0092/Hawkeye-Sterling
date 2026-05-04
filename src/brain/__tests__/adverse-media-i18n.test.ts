import { describe, expect, it } from "vitest";
import { classifyI18n, detectLanguage, I18N_PACKS } from "../adverse-media-i18n.js";
import { classifyAdverseMedia } from "../adverse-media.js";

describe("adverse-media-i18n", () => {
  it("detects Arabic, Chinese, Russian and French scripts", () => {
    expect(detectLanguage("غسل الأموال في دبي")).toBe("ar");
    expect(detectLanguage("洗钱被起诉")).toBe("zh");
    expect(detectLanguage("отмывание денег")).toBe("ru");
    expect(detectLanguage("blanchiment d'argent à Paris")).toBe("fr");
    expect(detectLanguage("plain english laundering")).toBe("en");
  });

  it("classifies Arabic ML phrase under i18n", () => {
    const hits = classifyI18n("تم القبض على المتهم في قضية غسل الأموال");
    // Arabic catalogue is stored in normalised form (hamza-folded); the
    // bigram match comes back as "غسل الاموال" rather than "غسل الأموال".
    expect(hits.some((h) => h.lang === "ar" && h.keyword.startsWith("غسل"))).toBe(true);
  });

  it("classifies Chinese 洗钱 via CJK n-gram tokeniser", () => {
    const hits = classifyI18n("某公司因涉嫌洗钱被调查并冻结资产。");
    expect(hits.some((h) => h.lang === "zh" && h.keyword === "洗钱")).toBe(true);
  });

  it("classifies Russian отмывание via Cyrillic whitespace tokeniser", () => {
    const hits = classifyI18n("Подозреваемый арестован за отмывание денег.");
    expect(hits.some((h) => h.lang === "ru" && h.keyword.includes("отмывание"))).toBe(true);
  });

  it("classifies French blanchiment via Latin tokeniser", () => {
    const hits = classifyI18n("Le suspect a été condamné pour blanchiment d'argent.");
    expect(hits.some((h) => h.lang === "fr" && h.keyword.includes("blanchiment"))).toBe(true);
  });

  it("classifyAdverseMedia surfaces i18n hits with lang-prefixed keyword", () => {
    const hits = classifyAdverseMedia("تجميد الأصول وفقاً لقائمة العقوبات");
    expect(hits.some((h) => h.keyword.startsWith("ar:"))).toBe(true);
  });

  it("supplies non-empty packs for all four supported languages", () => {
    for (const lang of ["ar", "fr", "ru", "zh"] as const) {
      expect(I18N_PACKS[lang].keywords.length).toBeGreaterThan(20);
    }
  });
});
