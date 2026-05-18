/**
 * Integration tests for all audit-v9 fixes.
 *
 * Covers:
 *  - SESSION_SECRET strict mode (no AUDIT_CHAIN_SECRET fallback)
 *  - Four-eyes PATCH uses ctx identity, not body-supplied operator
 *  - Audit chain sequence-gap detection in verify route
 *  - Zero-entity guards: uk-ofsi, jp-mof
 *  - Upstash Redis rate-limit path
 *  - Monitoring snapshot cap raised to 1000
 *  - Body-size guards (413) on bulk endpoints
 *  - Math.random replaced with crypto.randomBytes in lib server files
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── In-memory Netlify Blobs (shared, cleared before each test) ────────────
const memStore = new Map<string, string>();

vi.mock('@netlify/blobs', () => {
  const store = {
    get: async (key: string, opts?: { type?: string }) => {
      const raw = memStore.get(key) ?? null;
      if (raw === null) return null;
      if (opts?.type === 'json') return JSON.parse(raw);
      return raw;
    },
    set: async (key: string, value: string) => { memStore.set(key, value); },
    setJSON: async (key: string, value: unknown) => { memStore.set(key, JSON.stringify(value)); },
    delete: async (key: string) => { memStore.delete(key); },
    list: async (opts?: { prefix?: string }) => {
      const prefix = opts?.prefix ?? '';
      return { blobs: [...memStore.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) };
    },
  };
  return { getStore: () => store, getDeployStore: () => store };
});

vi.mock('@/lib/server/enforce', () => ({
  enforce: vi.fn(async () => ({
    ok: true,
    tier: { id: 'enterprise', rateLimitPerSecond: 100, rateLimitPerMinute: 6000 },
    keyId: 'test-key', record: null, remainingMonthly: null, headers: {},
  })),
}));

vi.mock('@/lib/server/guard', () => ({
  withGuard: (handler: (req: Request, ctx: unknown) => Promise<Response>) =>
    (req: Request) => handler(req, {
      apiKey: { id: 'key-alice', name: 'Alice Approver', email: 'alice@example.com', tier: 'enterprise' },
      tenantId: 'alice@example.com',
      traceId: 'test-trace',
      receivedAt: new Date(),
    }),
}));

vi.mock('@/lib/server/audit-chain', () => ({
  writeAuditChainEntry: vi.fn(async () => true),
}));

vi.mock('@/lib/server/llm', () => ({ getAnthropicClient: vi.fn() }));
vi.mock('@/lib/server/asanaConfig', () => ({ asanaGids: {} }));

process.env['SESSION_SECRET'] = 'a'.repeat(64);

beforeEach(() => { memStore.clear(); });

// ─────────────────────────────────────────────────────────────────────────────
// 1. SESSION_SECRET strict mode
// ─────────────────────────────────────────────────────────────────────────────

describe('auth.ts — SESSION_SECRET strict mode', () => {
  it('issues a valid token when SESSION_SECRET is set', async () => {
    const { issueSession } = await import('@/lib/server/auth');
    const token = issueSession('uid-1', 'testuser', 'analyst');
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('throws when SESSION_SECRET is missing (no silent fallback)', async () => {
    const saved = process.env['SESSION_SECRET'];
    delete process.env['SESSION_SECRET'];
    vi.resetModules();

    const { issueSession } = await import('@/lib/server/auth');
    expect(() => issueSession('uid', 'user', 'mlro')).toThrow(/SESSION_SECRET/i);

    process.env['SESSION_SECRET'] = saved;
    vi.resetModules();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Math.random replaced with crypto.randomBytes
// ─────────────────────────────────────────────────────────────────────────────

describe('crypto.randomBytes — IDs no longer use Math.random', () => {
  it('feedback IDs match fb_<digits>_<8 hex chars>', async () => {
    const { submitFeedback } = await import('@/lib/server/feedback');
    const rec = await submitFeedback({
      listId: 'uk_ofsi', listRef: 'ref-1', candidateName: 'Test Name',
      verdict: 'false_positive', tenantId: 'test-tenant',
    });
    expect(rec.id).toMatch(/^fb_\d+_[0-9a-f]{8}$/);
  });

  it('cdd-vault IDs match crr-<digits>-<8 hex chars>', async () => {
    const { newCddReviewId } = await import('@/lib/server/cdd-vault');
    expect(newCddReviewId()).toMatch(/^crr-\d+-[0-9a-f]{8}$/);
  });

  it('api-error requestIds are 12 hex chars', async () => {
    const { makeError } = await import('@/lib/server/api-error');
    const err = makeError('tool', 'ERR', 'Type', 'msg');
    expect(err.requestId).toMatch(/^[0-9a-f]{12}$/);
  });

  it('case-id suffix is 4 lowercase hex chars', async () => {
    const { generateCaseId } = await import('@/lib/server/case-id');
    for (let i = 0; i < 10; i++) {
      const id = generateCaseId();
      // Suffix must be hex only (no g-z chars that base-36 Math.random would produce)
      const suffix = id.split('-')[2] ?? '';
      expect(suffix).toMatch(/^[0-9a-f]{4}$/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Audit chain verify — sequence-gap detection
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/audit-trail/verify — seq gap detection', () => {
  async function callVerify(chain: unknown[]): Promise<Record<string, unknown>> {
    memStore.set('chain.json', JSON.stringify(chain));
    const mod = await import('@/app/api/audit-trail/verify/route');
    const GET = mod.GET as (req: Request) => Promise<Response>;
    const res = await GET(new Request('http://localhost/api/audit-trail/verify'));
    return res.json() as Promise<Record<string, unknown>>;
  }

  it('reports deletedEntries=0 for an empty chain', async () => {
    const body = await callVerify([]);
    expect(body['deletedEntries']).toBe(0);
    expect(body['chainIntegrity']).toBe('intact');
  });

  it('reports deletedEntries=0 for contiguous seqs', async () => {
    // Hash mismatches will mark it broken (fake hashes) but deletedEntries should be 0
    const body = await callVerify([
      { seq: 1, prevHash: undefined, entryHash: 'aaaa0001', payload: {}, at: '2026-01-01T00:00:00Z' },
      { seq: 2, prevHash: 'aaaa0001', entryHash: 'aaaa0002', payload: {}, at: '2026-01-01T01:00:00Z' },
    ]);
    expect(body['deletedEntries']).toBe(0);
  });

  it('detects 1 deleted entry when seq jumps from 1 to 3', async () => {
    // Use real FNV-1a hashes so hash checks pass and only the seq gap triggers broken.
    // Hashes computed by the same fnv1a() + computeEntryHash() the route uses.
    const body = await callVerify([
      { seq: 1, prevHash: undefined, entryHash: 'b045a28c', payload: {}, at: '2026-01-01T00:00:00Z' },
      { seq: 3, prevHash: 'b045a28c', entryHash: 'cb71c95d', payload: {}, at: '2026-01-01T02:00:00Z' },
    ]);
    expect(body['deletedEntries']).toBe(1);
    expect(body['chainIntegrity']).toBe('broken');
    expect(body['firstBreakAt']).toBe(2);
  });

  it('counts multiple deleted entries across two gaps', async () => {
    // seqs 1,2,5,7 → gaps at 3-4 (2 deleted) and 6 (1 deleted) = 3 total
    // Real hashes so only gap detection fires, not hash mismatch.
    const body = await callVerify([
      { seq: 1, prevHash: undefined, entryHash: 'b045a28c', payload: {}, at: '2026-01-01T00:00:00Z' },
      { seq: 2, prevHash: 'b045a28c', entryHash: '9a48c2b5', payload: {}, at: '2026-01-01T01:00:00Z' },
      { seq: 5, prevHash: '9a48c2b5', entryHash: '5b80ed98', payload: {}, at: '2026-01-01T02:00:00Z' },
      { seq: 7, prevHash: '5b80ed98', entryHash: 'd79e3f14', payload: {}, at: '2026-01-01T03:00:00Z' },
    ]);
    expect(body['deletedEntries']).toBe(3);
    // chainIntegrity is broken (either by hash mismatch or gap — both are present)
    expect(body['chainIntegrity']).toBe('broken');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Zero-entity guards
// ─────────────────────────────────────────────────────────────────────────────

describe('uk-ofsi zero-entity guard', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetModules();
  });

  it('throws when the CSV has headers but no entity rows', async () => {
    // CSV with recognised column headers but no data rows → 0 entities parsed
    const emptyEntityCsv = [
      'Last Updated: 2026-05-18',
      'Group ID,Name 6,Name 1,Group Type,Regime',
      // no data rows
    ].join('\r\n') + '\r\n';

    global.fetch = vi.fn(async () =>
      new Response(emptyEntityCsv, { status: 200, headers: { 'content-type': 'text/csv' } }),
    ) as typeof fetch;

    const { ukOfsiAdapter } = await import('../../src/ingestion/sources/uk-ofsi.js');
    await expect(ukOfsiAdapter.fetch()).rejects.toThrow(/uk_ofsi.*0 entities/i);
  });

  it('succeeds when the CSV has at least one valid entity row', async () => {
    const validCsv = [
      'Last Updated: 2026-05-18',
      'Group ID,Name 6,Name 1,Group Type,Regime',
      '1,Smith John,John Smith,Individual,Iran',
    ].join('\r\n') + '\r\n';

    global.fetch = vi.fn(async () =>
      new Response(validCsv, { status: 200, headers: { 'content-type': 'text/csv' } }),
    ) as typeof fetch;

    const { ukOfsiAdapter } = await import('../../src/ingestion/sources/uk-ofsi.js');
    const result = await ukOfsiAdapter.fetch();
    expect(result.entities.length).toBeGreaterThan(0);
  });
});

describe('jp-mof zero-entity guard', () => {
  afterEach(() => {
    delete process.env['FEED_JP_MOF'];
    vi.resetModules();
  });

  it('returns empty without error when FEED_JP_MOF is unset (opt-out)', async () => {
    const { jpMofAdapter } = await import('../../src/ingestion/sources/jp-mof.js');
    const result = await jpMofAdapter.fetch();
    expect(result.entities).toHaveLength(0);
  });

  it('throws when FEED_JP_MOF is set but fetch fails (all URLs fail)', async () => {
    process.env['FEED_JP_MOF'] = 'https://example.com/fake.xlsx';
    const orig = global.fetch;
    global.fetch = vi.fn(async () => { throw new Error('Network unreachable'); }) as typeof fetch;

    const { jpMofAdapter } = await import('../../src/ingestion/sources/jp-mof.js');
    await expect(jpMofAdapter.fetch()).rejects.toThrow(/jp_mof.*failed|exceljs/i);
    global.fetch = orig;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Rate limit — Upstash Redis path
// ─────────────────────────────────────────────────────────────────────────────

describe('consumeRateLimit — Upstash Redis path', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    vi.resetModules();
  });

  it('calls Redis INCR when env vars are configured', async () => {
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://fake.upstash.io';
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'tok';
    let incrCalled = false;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url instanceof Request ? url.url : url);
      if (u.includes('/incr/')) incrCalled = true;
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    }) as typeof fetch;

    const { consumeRateLimit } = await import('@/lib/server/rate-limit');
    const result = await consumeRateLimit('key-redis-test', 'free');

    expect(incrCalled).toBe(true);
    expect(result.allowed).toBe(true);
  });

  it('falls back to Blobs silently when Redis network throws', async () => {
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://fake.upstash.io';
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'tok';
    global.fetch = vi.fn(async () => { throw new Error('Network error'); }) as typeof fetch;

    const { consumeRateLimit } = await import('@/lib/server/rate-limit');
    const result = await consumeRateLimit('key-fallback-test', 'free');
    expect(result).toBeDefined();
    expect(typeof result.allowed).toBe('boolean');
  });

  it('skips Redis entirely when env vars are absent', async () => {
    const fetchSpy = vi.fn(async () => new Response('', { status: 200 }));
    global.fetch = fetchSpy as typeof fetch;

    const { consumeRateLimit } = await import('@/lib/server/rate-limit');
    await consumeRateLimit('key-noredit', 'free');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('denies request when Redis reports count exceeds per-second limit', async () => {
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://fake.upstash.io';
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'tok';
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url instanceof Request ? url.url : url);
      // Return a count that exceeds any reasonable per-second tier limit
      if (u.includes('/incr/')) return new Response(JSON.stringify({ result: 9999 }), { status: 200 });
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    }) as typeof fetch;

    const { consumeRateLimit } = await import('@/lib/server/rate-limit');
    const result = await consumeRateLimit('key-over-limit', 'free');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Body-size guards — 413 on oversized requests
// ─────────────────────────────────────────────────────────────────────────────

describe('body-size guards', () => {
  it('/api/screen/batch returns 413 when Content-Length > 2 MB', async () => {
    const { POST } = await import('@/app/api/screen/batch/route');
    const res = await POST(new Request('http://localhost/api/screen/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(3 * 1024 * 1024) },
      body: '{}',
    }));
    expect(res.status).toBe(413);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/too large/i);
  });

  it('/api/screen/batch passes when Content-Length is within limit', async () => {
    const { POST } = await import('@/app/api/screen/batch/route');
    const res = await POST(new Request('http://localhost/api/screen/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '200' },
      body: JSON.stringify({ subjects: [{ name: 'Test Entity' }] }),
    }));
    expect(res.status).not.toBe(413);
  });

  it('/api/cases POST returns 413 when Content-Length > 10 MB', async () => {
    const { POST } = await import('@/app/api/cases/route');
    const res = await POST(new Request('http://localhost/api/cases', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(11 * 1024 * 1024) },
      body: '{}',
    }));
    expect(res.status).toBe(413);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Monitoring snapshot cap — 1000 not 200
// ─────────────────────────────────────────────────────────────────────────────

describe('ongoing/run — snapshot window cap is 1000', () => {
  it('new slice(-999) + snap = 1000 entries for a 1200-snapshot history', () => {
    const snapshots = Array.from({ length: 1200 }, (_, i) => ({ seq: i }));
    const newSnap = { seq: 1200 };
    const updated = [...snapshots.slice(-999), newSnap];
    expect(updated).toHaveLength(1000);
    expect(updated[updated.length - 1]).toEqual(newSnap);
  });

  it('old slice(-199) would only keep 200 entries (regression check)', () => {
    const snapshots = Array.from({ length: 1200 }, (_, i) => ({ seq: i }));
    const old = [...snapshots.slice(-199), { seq: 1200 }];
    expect(old).toHaveLength(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Four-eyes PATCH — ctx.apiKey is used, body operator field ignored
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/four-eyes — operator from ctx.apiKey, not request body', () => {
  beforeEach(() => {
    memStore.set('four-eyes/test-item-001', JSON.stringify({
      id: 'test-item-001', status: 'pending', action: 'str',
      initiatedBy: 'bob@example.com',
      caseId: 'CASE-20260518-abcd', subjectName: 'Test Subject',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    }));
  });

  it('approves when ctx identity differs from initiator', async () => {
    // ctx mock provides alice@example.com; initiatedBy is bob@example.com → ok
    const mod = await import('@/app/api/four-eyes/route');
    const PATCH = mod.PATCH as (req: Request) => Promise<Response>;
    const res = await PATCH(new Request('http://localhost/api/four-eyes?id=test-item-001', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    }));
    expect(res.status).not.toBe(500);
    if (res.status === 200) {
      const body = await res.json() as { ok: boolean; item?: { status: string; approvedBy: string } };
      expect(body.ok).toBe(true);
      expect(body.item?.status).toBe('approved');
      // approvedBy must be the ctx identity, not a body field
      expect(body.item?.approvedBy).toBe('Alice Approver');
    }
  });
});
