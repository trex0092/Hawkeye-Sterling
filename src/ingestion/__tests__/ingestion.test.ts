import { describe, expect, it } from 'vitest';
import { searchOpenSanctions } from '../opensanctions.js';
import { searchNewsApi, searchGdelt, searchRss, combineAndFilter } from '../adverse-media.js';

type FetchLike = typeof fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('opensanctions', () => {
  it('normalises API result into NormalisedListEntry shape', async () => {
    const fake: FetchLike = async () => jsonResponse({
      results: [
        {
          id: 'Q-12345',
          caption: 'Alice Test',
          schema: 'Person',
          datasets: ['un_sc_sanctions'],
          properties: {
            name: ['Alice Test'],
            alias: ['A. Test'],
            passportNumber: ['P0001'],
            nationality: ['AE'],
            modifiedAt: '2026-04-22T00:00:00Z',
            summary: 'Designated under …',
          },
        },
      ],
    });
    const entries = await searchOpenSanctions({ query: 'alice', apiKey: 'test', fetchImpl: fake });
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(e.listId).toBe('opensanctions');
    expect(e.sourceRef).toBe('Q-12345');
    expect(e.entityType).toBe('individual');
    expect(e.aliases).toContain('A. Test');
    expect(e.identifiers.some((i) => i.kind === 'passport' && i.number === 'P0001')).toBe(true);
    expect(e.nationalities).toContain('AE');
  });

  it('throws on non-OK HTTP', async () => {
    const fake: FetchLike = async () => new Response('no', { status: 401 });
    await expect(searchOpenSanctions({ query: 'x', apiKey: 'bad', fetchImpl: fake })).rejects.toThrow(/HTTP 401/);
  });
});

describe('adverse-media — NewsAPI', () => {
  it('maps articles + classifies taxonomy hits', async () => {
    const fake: FetchLike = async () => jsonResponse({
      articles: [
        { title: 'Company X charged with money laundering', url: 'https://ft.com/x', publishedAt: '2026-04-22', description: 'Prosecutors allege bribery.', source: { name: 'ft.com' } },
        { title: 'Weather update', url: 'https://weather.com/a', description: 'Rainy day.' },
      ],
    });
    process.env!.NEWSAPI_KEY = 'test';
    const out = await searchNewsApi({ subjectName: 'Company X', fetchImpl: fake });
    expect(out).toHaveLength(2);
    const moneyLaundering = out.find((o) => o.headline.includes('money laundering'));
    expect(moneyLaundering!.hits.length).toBeGreaterThan(0);
    const weather = out.find((o) => o.headline.includes('Weather'));
    expect(weather!.hits.length).toBe(0);
  });

  it('requires an API key', async () => {
    delete process.env!.NEWSAPI_KEY;
    const fake: FetchLike = async () => jsonResponse({ articles: [] });
    await expect(searchNewsApi({ subjectName: 'x', fetchImpl: fake })).rejects.toThrow(/NEWSAPI_KEY/);
  });
});

describe('adverse-media — GDELT', () => {
  it('maps artlist response', async () => {
    const fake: FetchLike = async () => jsonResponse({
      articles: [{ title: 'Sanctions evasion scheme uncovered', url: 'https://example.com/a', seendate: '20260422T000000Z', language: 'English', domain: 'example.com' }],
    });
    const out = await searchGdelt({ fetchImpl: fake });
    expect(out[0]!.source).toBe('gdelt');
    expect(out[0]!.hits.length).toBeGreaterThan(0);
  });
});

describe('adverse-media — RSS + combineAndFilter', () => {
  it('parses an RSS feed with regex fallback and filters by taxonomy hits', async () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>Arrest in fraud probe</title><link>https://a/1</link><pubDate>2026-04-22</pubDate><description>Allegations of embezzlement.</description></item>
      <item><title>Weather</title><link>https://a/2</link><description>Sunshine.</description></item>
    </channel></rss>`;
    const fake: FetchLike = async () => new Response(xml, { status: 200, headers: { 'content-type': 'application/rss+xml' } });
    const articles = await searchRss('https://example.com/feed', { fetchImpl: fake });
    expect(articles).toHaveLength(2);
    const combined = combineAndFilter([articles]);
    // Only the fraud item has a taxonomy hit.
    expect(combined).toHaveLength(1);
    expect(combined[0]!.headline).toMatch(/fraud/i);
  });
});
