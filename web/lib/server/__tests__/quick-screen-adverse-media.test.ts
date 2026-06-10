import { describe, expect, it } from 'vitest';
import {
  buildAdverseMediaSummary,
  type AdverseMediaInputArticle,
} from '../quick-screen-adverse-media';

const SUBJECT = 'Viktor Orlov';

function article(over: Partial<AdverseMediaInputArticle>): AdverseMediaInputArticle {
  return {
    title: `${SUBJECT} attends industry conference`,
    url: 'https://news.example.com/a1',
    publishedAt: '2026-05-01T00:00:00Z',
    source: 'newsapi',
    outlet: 'example.com',
    snippet: 'Routine coverage.',
    ...over,
  };
}

describe('buildAdverseMediaSummary', () => {
  it('returns null when nothing was queried (no articles, no providers)', () => {
    expect(buildAdverseMediaSummary(SUBJECT, [], [])).toBeNull();
  });

  it('returns a checked-clear summary when providers ran but found nothing', () => {
    const s = buildAdverseMediaSummary(SUBJECT, [], ['newsapi', 'gnews']);
    expect(s).not.toBeNull();
    expect(s?.found).toBe(false);
    expect(s?.severity).toBe('none');
    expect(s?.itemCount).toBe(0);
    expect(s?.items).toEqual([]);
    expect(s?.provider).toBe('newsapi, gnews');
  });

  it('classifies an adverse article: found, categories, FATF predicates, severity', () => {
    const s = buildAdverseMediaSummary(
      SUBJECT,
      [
        article({
          title: `${SUBJECT} indicted for money laundering`,
          snippet: `${SUBJECT} was charged in a money laundering and fraud investigation.`,
        }),
      ],
      ['newsapi'],
    );
    expect(s?.found).toBe(true);
    expect(s?.adverseCount).toBe(1);
    expect(['critical', 'high', 'medium']).toContain(s?.severity);
    expect(s?.categories).toContain('money-laundering');
    expect(s?.fatfPredicates).toContain('FATF R.3 (ML offence)');
    const item = s?.items[0];
    expect(item?.id).toMatch(/^[0-9a-f]{16}$/);
    expect(item?.title).toContain('indicted');
    expect(item?.url).toBe('https://news.example.com/a1');
    expect(item?.source).toBe('example.com');
    expect(item?.categories.length).toBeGreaterThan(0);
  });

  it('drops irrelevant articles (different subject, no overlap)', () => {
    const s = buildAdverseMediaSummary(
      SUBJECT,
      [
        article({
          title: 'Quarterly agricultural exports rise in unrelated region',
          snippet: 'Commodity prices were stable.',
          url: 'https://news.example.com/irrelevant',
        }),
      ],
      ['newsapi'],
    );
    expect(s?.itemCount).toBe(0);
    expect(s?.found).toBe(false);
    expect(s?.severity).toBe('none');
  });

  it('does not let a relevant-but-benign article mark the subject adverse', () => {
    const s = buildAdverseMediaSummary(
      SUBJECT,
      [article({ title: `${SUBJECT} opens new community center` })],
      ['newsapi'],
    );
    expect(s?.itemCount).toBe(1);
    expect(s?.adverseCount).toBe(0);
    expect(s?.found).toBe(false);
    expect(s?.severity).toBe('none');
  });

  it('deduplicates the same story from two providers by URL', () => {
    const dup = {
      title: `${SUBJECT} arrested in fraud probe`,
      snippet: 'Authorities confirmed the arrest.',
      url: 'https://news.example.com/story?utm=a',
    };
    const s = buildAdverseMediaSummary(
      SUBJECT,
      [article({ ...dup, source: 'newsapi' }), article({ ...dup, source: 'gnews' })],
      ['newsapi', 'gnews'],
    );
    expect(s?.itemCount).toBe(1);
  });

  it('caps items at 50 (worldwide default) and categories at 5 per item', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      article({
        title: `${SUBJECT} charged with fraud, bribery, money laundering case ${i}`,
        snippet:
          'fraud bribery corruption money laundering terrorist financing sanctions evasion tax evasion cybercrime hacking',
        url: `https://news.example.com/story-${i}`,
      }),
    );
    const s = buildAdverseMediaSummary(SUBJECT, many, ['newsapi']);
    expect(s?.items.length).toBeLessThanOrEqual(50);
    expect(s?.items.length).toBeGreaterThan(10); // historical 10-item cap removed
    expect(s?.itemCount).toBe(60);
    for (const item of s?.items ?? []) {
      expect(item.categories.length).toBeLessThanOrEqual(5);
    }
  });

  it('passes through non-http URLs (claude:// synthetic refs) unchanged', () => {
    const s = buildAdverseMediaSummary(
      SUBJECT,
      [
        article({
          title: `${SUBJECT} sanctions violation reported`,
          snippet: 'Listed for sanctions evasion.',
          url: 'claude://finding/1',
        }),
      ],
      ['claude'],
    );
    expect(s?.items[0]?.url).toBe('claude://finding/1');
  });

  it('caps the provider label at 20 entries (worldwide default) with +N more', () => {
    const providers = Array.from({ length: 22 }, (_, i) => `p${i + 1}`);
    const s = buildAdverseMediaSummary(SUBJECT, [article({})], providers);
    expect(s?.provider).toBe(`${providers.slice(0, 20).join(', ')} +2 more`);
  });

  it('falls back to news-adapters label when articles exist without provider list', () => {
    const s = buildAdverseMediaSummary(SUBJECT, [article({})], []);
    expect(s?.provider).toBe('news-adapters');
  });

  it('preserves language on items when the source article carries it', () => {
    const s = buildAdverseMediaSummary(
      SUBJECT,
      [
        article({
          title: `${SUBJECT} convicted of fraud`,
          snippet: 'Court confirmed the conviction.',
          language: 'ru',
        }),
      ],
      ['newsapi'],
    );
    expect(s?.items[0]?.language).toBe('ru');
  });
});
