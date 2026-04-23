// Hawkeye Sterling — adverse-media scorer.
// Consumes free text and the AdverseMedia evidence array, returns per-category
// hit counts, top keywords, and a composite risk score.

import { ADVERSE_MEDIA_CATEGORIES, classifyAdverseMedia } from '../adverse-media.js';
import type { AdverseMediaCategoryId } from '../types.js';

export interface AdverseMediaScore {
  byCategory: Record<AdverseMediaCategoryId, number>;
  total: number;
  distinctKeywords: number;
  topKeywords: Array<{ keyword: string; categoryId: AdverseMediaCategoryId; count: number }>;
  categoriesTripped: AdverseMediaCategoryId[];
  compositeScore: number;  // 0..1
}

const CATEGORY_WEIGHTS: Record<AdverseMediaCategoryId, number> = {
  terrorist_financing: 1.0,
  proliferation_financing: 1.0,
  corruption_organised_crime: 0.85,
  cybercrime: 0.80,
  ml_financial_crime: 0.75,
  ai: 0.65,
  legal_criminal_regulatory: 0.55,
  esg: 0.50,
};

export function scoreAdverseMedia(
  freeText: string | undefined,
  adverseMediaItems: unknown,
): AdverseMediaScore {
  const chunks: string[] = [];
  if (typeof freeText === 'string' && freeText.length > 0) chunks.push(freeText);
  if (Array.isArray(adverseMediaItems)) {
    for (const item of adverseMediaItems) {
      if (typeof item === 'string') chunks.push(item);
      else if (item && typeof item === 'object') {
        for (const k of ['title', 'summary', 'text', 'body', 'content', 'snippet']) {
          const v = (item as Record<string, unknown>)[k];
          if (typeof v === 'string') chunks.push(v);
        }
      }
    }
  }
  const haystack = chunks.join('\n\n');

  const byCategory: Record<AdverseMediaCategoryId, number> = {
    ml_financial_crime: 0,
    terrorist_financing: 0,
    proliferation_financing: 0,
    corruption_organised_crime: 0,
    legal_criminal_regulatory: 0,
    esg: 0,
    cybercrime: 0,
    ai: 0,
  };
  const keywordCounts = new Map<string, { cat: AdverseMediaCategoryId; count: number }>();

  if (haystack.length > 0) {
    const hits = classifyAdverseMedia(haystack);
    for (const h of hits) {
      const cid = h.categoryId as AdverseMediaCategoryId;
      byCategory[cid] = (byCategory[cid] ?? 0) + 1;
      const k = keywordCounts.get(h.keyword);
      if (k) k.count++;
      else keywordCounts.set(h.keyword, { cat: cid, count: 1 });
    }
  }

  const total = Object.values(byCategory).reduce((s, x) => s + x, 0);
  const distinctKeywords = keywordCounts.size;
  const topKeywords = [...keywordCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([keyword, v]) => ({ keyword, categoryId: v.cat, count: v.count }));

  const categoriesTripped = (Object.keys(byCategory) as AdverseMediaCategoryId[])
    .filter((c) => (byCategory[c] ?? 0) > 0);

  // Composite: worst category × coverage breadth × keyword density.
  let composite = 0;
  for (const c of categoriesTripped) {
    const density = Math.min(1, (byCategory[c] ?? 0) / 5);
    composite = Math.max(composite, (CATEGORY_WEIGHTS[c] ?? 0.5) * density);
  }
  // Breadth bonus: multiple categories tripped → up-weight.
  if (categoriesTripped.length >= 2) composite = Math.min(1, composite + 0.1 * (categoriesTripped.length - 1));

  return { byCategory, total, distinctKeywords, topKeywords, categoriesTripped, compositeScore: composite };
}

// Expose category list for downstream reporting.
export function adverseMediaCategoryNames(): string[] {
  return ADVERSE_MEDIA_CATEGORIES.map((c) => c.displayName);
}
