// Worldwide adverse-media deep scan tests.
//
// Verifies: per-country/language fan-out, no result truncation, blob
// persistence + audit-chain entry, fire-and-forget failure isolation, and
// the env kill-switch.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const blobStore = new Map<string, string>();
let storeSetShouldThrow = false;

vi.mock('../store', () => ({
  getStore: () => ({
    set: async (k: string, v: string) => {
      if (storeSetShouldThrow) throw new Error('blob store unavailable');
      blobStore.set(k, v);
    },
    get: async (k: string) => blobStore.get(k) ?? null,
    delete: async (k: string) => { blobStore.delete(k); },
  }),
}));

const auditWrites: Array<Record<string, unknown>> = [];
vi.mock('../audit-chain', () => ({
  writeAuditChainEntry: async (event: Record<string, unknown>) => {
    auditWrites.push(event);
    return true;
  },
}));

const newsCalls: Array<{ name: string; opts?: Record<string, unknown> }> = [];
vi.mock('@/lib/intelligence/newsAdapters', () => ({
  searchAllNews: async (name: string, opts?: Record<string, unknown>) => {
    newsCalls.push({ name, ...(opts ? { opts } : {}) });
    const country = (opts?.['country'] as string | undefined) ?? 'GLOBAL';
    // Global pass returns a large batch (no-truncation check); country passes
    // return a couple of localised articles each.
    const count = country === 'GLOBAL' ? 120 : 2;
    return {
      articles: Array.from({ length: count }, (_, i) => ({
        source: 'mock-news',
        outlet: 'mock.example',
        title: i % 2 === 0
          ? `${name} charged with fraud and money laundering (${country} ${i})`
          : `Weather forecast sunny tomorrow (${country} ${i})`,
        url: `https://news.example/${country}/${i}`,
        publishedAt: '2026-06-01T00:00:00.000Z',
        snippet: i % 2 === 0 ? `${name} investigation sanction probe` : 'nothing relevant here',
      })),
      providersUsed: ['mock-news'],
    };
  },
}));

vi.mock('@/lib/intelligence/gdelt-cache', () => ({
  fetchGdeltCached: async (_subject: string, _opts?: Record<string, unknown>) => ({
    articles: [],
    fetchedAt: Date.now(),
    source: 'memory',
    stale: false,
    serviceError: false,
  }),
}));

vi.mock('@/lib/intelligence/llmAdverseMedia', () => ({
  llmAdverseMediaAdapter: () => ({ isAvailable: () => false, search: async () => [] }),
}));

import { startDeepScan, getDeepScan, deepScanConfig } from '../adverse-media-deep-scan';

const ENV_KEYS = [
  'HAWKEYE_DEEP_SCAN_ENABLED',
  'HAWKEYE_DEEP_SCAN_MAX_COUNTRIES',
  'HAWKEYE_DEEP_SCAN_CONCURRENCY',
  'HAWKEYE_DEEP_SCAN_PER_SOURCE_LIMIT',
];

beforeEach(() => {
  blobStore.clear();
  auditWrites.length = 0;
  newsCalls.length = 0;
  storeSetShouldThrow = false;
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

async function waitForCompletion(scanId: string, timeoutMs = 10_000) {
  const start = Date.now();
  for (;;) {
    const record = await getDeepScan(scanId);
    if (record && record.status !== 'running') return record;
    if (Date.now() - start > timeoutMs) throw new Error('deep scan did not complete in time');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('deepScanConfig', () => {
  it('defaults: enabled, unlimited countries, concurrency 5, 100 per source', () => {
    expect(deepScanConfig()).toEqual({ enabled: true, maxCountries: 0, concurrency: 5, perSourceLimit: 100 });
  });

  it('kill switch disables scans', async () => {
    process.env['HAWKEYE_DEEP_SCAN_ENABLED'] = 'false';
    const scanId = await startDeepScan({ name: 'Test Person' }, 'tenant-a');
    expect(scanId).toBeNull();
  });
});

describe('startDeepScan', () => {
  it('returns a scanId immediately with a running record persisted', async () => {
    // Cap countries so the test sweep is small and fast.
    process.env['HAWKEYE_DEEP_SCAN_MAX_COUNTRIES'] = '3';
    const scanId = await startDeepScan({ name: 'Viktor Petrov', nationality: 'RU' }, 'tenant-a');
    expect(scanId).toMatch(/^dscan-/);
    const record = await getDeepScan(scanId!);
    expect(record).not.toBeNull();
    expect(['running', 'complete']).toContain(record!.status);
    await waitForCompletion(scanId!);
  });

  it('fans out per-country queries in local languages (subject + high-risk registry)', async () => {
    process.env['HAWKEYE_DEEP_SCAN_MAX_COUNTRIES'] = '10';
    const scanId = await startDeepScan({ name: 'Viktor Petrov', nationality: 'RU', jurisdiction: 'AE' }, 'tenant-a');
    const record = await waitForCompletion(scanId!);
    expect(record.status).toBe('complete');

    // Subject countries queried in their press languages.
    const langs = new Set(newsCalls.map((c) => c.opts?.['language']).filter(Boolean));
    const countries = new Set(newsCalls.map((c) => c.opts?.['country']).filter(Boolean));
    expect(countries.has('RU')).toBe(true);
    expect(countries.has('AE')).toBe(true);
    expect(langs.has('ru')).toBe(true);
    expect(langs.has('ar')).toBe(true);
    // Global pass ran with NO language restriction (adapter default).
    expect(newsCalls.some((c) => !c.opts?.['language'] && !c.opts?.['country'])).toBe(true);
    // Registry high-risk countries beyond the subject's own were swept.
    expect(record.countriesPlanned).toBe(10);
    expect(record.passes!.length).toBe(11); // global + 10
  });

  it('retains every scored article — relevant set plus lowRelevance bucket, no caps', async () => {
    process.env['HAWKEYE_DEEP_SCAN_MAX_COUNTRIES'] = '2';
    const scanId = await startDeepScan({ name: 'Viktor Petrov' }, 'tenant-a');
    const record = await waitForCompletion(scanId!);
    expect(record.status).toBe('complete');

    // 120 global + 2×2 country articles, all unique URLs → nothing dropped.
    expect(record.totalRawArticles).toBe(124);
    const kept = (record.articles?.length ?? 0) + (record.lowRelevance?.articles.length ?? 0);
    expect(kept).toBe(124);
    expect(record.articles!.length).toBeGreaterThan(50); // far beyond the old 10-item cap
    expect(record.lowRelevance!.count).toBe(record.lowRelevance!.articles.length);
    // Severity computed from the relevant set.
    expect(['critical', 'high', 'medium', 'low']).toContain(record.severity);
    expect(record.articlesByCountry!['global']).toBe(120);
  });

  it('writes a completion entry to the audit chain', async () => {
    process.env['HAWKEYE_DEEP_SCAN_MAX_COUNTRIES'] = '1';
    const scanId = await startDeepScan({ name: 'Viktor Petrov' }, 'tenant-xyz');
    await waitForCompletion(scanId!);
    const completion = auditWrites.find((e) => e['event'] === 'adverse_media.deep_scan.completed');
    expect(completion).toBeDefined();
    expect(completion!['scanId']).toBe(scanId);
    expect(completion!['totalRawArticles']).toBeGreaterThan(0);
  });

  it('returns null (not a phantom scan) when the blob store is unavailable', async () => {
    storeSetShouldThrow = true;
    const scanId = await startDeepScan({ name: 'Viktor Petrov' }, 'tenant-a');
    expect(scanId).toBeNull();
  });

  it('getDeepScan returns null for unknown scan ids', async () => {
    expect(await getDeepScan('dscan-nonexistent')).toBeNull();
  });
});
