import { describe, expect, it } from 'vitest';
import { freshnessFactor, FRESHNESS_HALF_LIFE_DAYS, type EvidenceItem } from '../evidence.js';

function ev(kind: EvidenceItem['kind'], observedAt: string): EvidenceItem {
  return {
    id: 'x', kind, title: 't', observedAt, languageIso: 'en',
    credibility: 'authoritative',
  };
}

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

describe('freshnessFactor — continuous per-source half-life decay', () => {
  const now = new Date('2026-04-30T00:00:00Z');

  it('returns ~1.0 for evidence observed today', () => {
    const f = freshnessFactor(ev('news_article', now.toISOString()), { now });
    expect(f).toBeGreaterThan(0.99);
    expect(f).toBeLessThanOrEqual(1.0);
  });

  it('returns 0.5 at exactly one half-life', () => {
    for (const kind of Object.keys(FRESHNESS_HALF_LIFE_DAYS) as EvidenceItem['kind'][]) {
      const halfLife = FRESHNESS_HALF_LIFE_DAYS[kind];
      if (halfLife <= 0) continue; // training_data sentinel
      const observedAt = isoDaysAgo(halfLife, now);
      const f = freshnessFactor(ev(kind, observedAt), { now });
      expect(f).toBeGreaterThan(0.49);
      expect(f).toBeLessThan(0.51);
    }
  });

  it('returns 0.25 at two half-lives', () => {
    const halfLife = FRESHNESS_HALF_LIFE_DAYS.news_article;
    const f = freshnessFactor(ev('news_article', isoDaysAgo(halfLife * 2, now)), { now });
    expect(f).toBeGreaterThan(0.24);
    expect(f).toBeLessThan(0.26);
  });

  it('treats training_data as instantly stale per Charter P8', () => {
    const f = freshnessFactor(ev('training_data', now.toISOString()), { now });
    expect(f).toBe(0);
  });

  it('court_filing decays slower than social_media', () => {
    const days = 365;
    const observed = isoDaysAgo(days, now);
    const court = freshnessFactor(ev('court_filing', observed), { now });
    const social = freshnessFactor(ev('social_media', observed), { now });
    expect(court).toBeGreaterThan(social);
    // court 5y half-life: 365d → 2^(-365/1825) ≈ 0.87
    expect(court).toBeGreaterThan(0.85);
    // social 30d half-life: 365d → 2^(-365/30) ≈ 0.000235
    expect(social).toBeLessThan(0.001);
  });

  it('honours opts.halfLifeDays override', () => {
    const observedAt = isoDaysAgo(60, now);
    const fDefault = freshnessFactor(ev('news_article', observedAt), { now });
    const fOverride = freshnessFactor(ev('news_article', observedAt), {
      now,
      halfLifeDays: { news_article: 30 },
    });
    expect(fOverride).toBeLessThan(fDefault);
  });

  it('returns 0 for malformed observedAt', () => {
    const f = freshnessFactor(ev('news_article', 'not-a-date'), { now });
    expect(f).toBe(0);
  });
});
