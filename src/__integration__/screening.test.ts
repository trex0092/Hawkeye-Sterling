/**
 * Integration tests for screening API routes.
 *
 * Covers /api/screening/run (production entry point) and additional
 * /api/quick-screen scenarios not tested in api-routes.test.ts:
 *   - UN 1267 pre-screen match path
 *   - Too-many-aliases validation
 *   - LISTS_MISSING (empty corpus) path
 *
 * All external I/O is replaced with vi.mock() stubs so the suite runs in
 * plain Node.js without any infrastructure or network access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Capture mock refs before any imports ──────────────────────────────────
const { writeAuditChainEntryMock, screeningAuditWriteMock, loadCandidatesMock, loadCandidatesWithHealthMock } = vi.hoisted(() => ({
  writeAuditChainEntryMock: vi.fn(async () => true),
  screeningAuditWriteMock: vi.fn(async () => true),
  loadCandidatesMock: vi.fn(async (): Promise<unknown[]> => []),
  loadCandidatesWithHealthMock: vi.fn(async () => ({
    candidates: [] as unknown[],
    health: {
      source: 'static' as const,
      loadedAt: new Date().toISOString(),
      candidateCount: 0,
      healthy: false,
      failedAdapters: [],
    },
  })),
}));

// ─── @netlify/blobs — in-memory store ────────────────────────────────────────
vi.mock('@netlify/blobs', () => {
  const memStore = new Map<string, string>();
  const store = {
    get: async (key: string, opts?: { type?: string }) => {
      const raw = memStore.get(key) ?? null;
      if (raw === null) return null;
      if (opts?.type === 'json') return JSON.parse(raw);
      return raw;
    },
    set: async (key: string, value: string) => { memStore.set(key, value); },
    delete: async (key: string) => { memStore.delete(key); },
    list: async (opts?: { prefix?: string }) => {
      const prefix = opts?.prefix ?? '';
      return { blobs: [...memStore.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) };
    },
  };
  return {
    getStore: () => store,
    getDeployStore: () => store,
  };
});

// ─── enforce — always allow ────────────────────────────────────────────────
vi.mock('@/lib/server/enforce', () => ({
  enforce: vi.fn(async () => ({
    ok: true,
    tier: { id: 'enterprise', callsPerSecond: 100, callsPerMinute: 1000, monthlyQuota: null },
    keyId: 'test-key',
    record: null,
    remainingMonthly: null,
    headers: {},
  })),
}));

// ─── audit-chain spy ──────────────────────────────────────────────────────
vi.mock('@/lib/server/audit-chain', () => ({
  writeAuditChainEntry: writeAuditChainEntryMock,
}));

// ─── ScreeningAuditWriter spy ─────────────────────────────────────────────
// Must use a regular function (not arrow) so `new ScreeningAuditWriter()` works.
vi.mock('@/lib/server/screening-audit', () => ({
  ScreeningAuditWriter: vi.fn(function(this: unknown) {
    return { write: screeningAuditWriteMock };
  }),
}));

// ─── adversarial-guard — no threats ──────────────────────────────────────
vi.mock('@/lib/server/adversarial-guard', () => ({
  checkAdversarialInput: vi.fn(async () => ({ risk: 'none', reasons: [] })),
}));

// ─── bias-monitor — no-op ────────────────────────────────────────────────
vi.mock('@/lib/server/bias-monitor', () => ({
  recordScreeningBias: vi.fn(async () => undefined),
  recordPepNationalityScreening: vi.fn(async () => undefined),
}));

// ─── candidates-loader — variable per-test ────────────────────────────────
vi.mock('@/lib/server/candidates-loader', () => ({
  loadCandidates: loadCandidatesMock,
  loadCandidatesWithHealth: loadCandidatesWithHealthMock,
  getCandidateLoadHealth: vi.fn(async () => null),
  invalidateCandidateCache: vi.fn(() => undefined),
}));

// ─── whitelist — always miss ─────────────────────────────────────────────
vi.mock('@/lib/server/whitelist', () => ({
  lookupWhitelist: vi.fn(async () => null),
}));

// ─── Intelligence adapters ────────────────────────────────────────────────
vi.mock('@/lib/intelligence/liveAdapters', () => ({
  LIVE_OPENSANCTIONS_ADAPTER: {
    lookup: vi.fn(async () => []),
    isAvailable: vi.fn(() => false),
  },
  activeOnChainProviders: vi.fn(() => []),
}));
vi.mock('@/lib/intelligence/commercialAdapters', () => ({
  bestCommercialAdapter: vi.fn(() => ({
    lookup: vi.fn(async () => []),
    isAvailable: vi.fn(() => false),
  })),
  activeCommercialProvider: vi.fn(() => null),
  activeCommercialProviders: vi.fn(() => []),
}));
vi.mock('@/lib/intelligence/registryAdapters', () => ({
  searchAllRegistries: vi.fn(async () => ({ records: [], providersUsed: [] })),
  activeRegistryProviders: vi.fn(() => []),
}));
vi.mock('@/lib/intelligence/countryRegistries', () => ({
  searchCountryRegistries: vi.fn(async () => ({ records: [], jurisdictions: [] })),
}));
vi.mock('@/lib/intelligence/countrySanctions', () => ({
  searchCountrySanctions: vi.fn(async () => ({ records: [], lists: [] })),
}));
vi.mock('@/lib/intelligence/freeAlwaysOnAdapters', () => ({
  searchFreeAdapters: vi.fn(async () => ({ records: [], providersUsed: [] })),
  activeFreeProviders: vi.fn(() => []),
}));
vi.mock('@/lib/intelligence/newsAdapters', () => ({
  activeNewsProviders: vi.fn(() => []),
  searchAllNews: vi.fn(async () => ({ articles: [], providersUsed: [] })),
  NULL_NEWS_ADAPTER: { isAvailable: () => false, search: async () => [] },
}));
vi.mock('@/lib/intelligence/llmAdverseMedia', () => ({
  llmAdverseMediaAdapter: vi.fn(() => ({
    isAvailable: vi.fn(() => false),
    search: vi.fn(async () => []),
  })),
}));
vi.mock('@/lib/intelligence/llmAdverseMediaAlt', () => ({
  groqAdverseMediaAdapter: vi.fn(() => ({
    isAvailable: vi.fn(() => false),
    search: vi.fn(async () => []),
  })),
  geminiAdverseMediaAdapter: vi.fn(() => ({
    isAvailable: vi.fn(() => false),
    search: vi.fn(async () => []),
  })),
}));
vi.mock('@/lib/intelligence/publicApiAdapters', () => ({
  runEnrichmentAdapters: vi.fn(async () => ({ fraudShield: { available: false, reason: 'no_key' } })),
  activeEnrichmentProviders: vi.fn(() => []),
}));
vi.mock('@/lib/intelligence/urlIngestion', () => ({
  ingestUrls: vi.fn(async () => []),
}));
vi.mock('@/lib/intelligence/kycVendorAdapters', () => ({
  activeKycProviders: vi.fn(() => []),
}));
vi.mock('@/lib/intelligence/googleAiModeAdapter', () => ({
  googleAiModeAdapter: vi.fn(() => ({
    isAvailable: vi.fn(() => false),
    search: vi.fn(async () => []),
  })),
  isGoogleAiModeAvailable: vi.fn(() => false),
}));

// ─── Session secret ───────────────────────────────────────────────────────
process.env['SESSION_SECRET'] = 'a'.repeat(64);

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(
  url: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Request {
  const { method = 'POST', body, headers = {} } = options;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    if (!(init.headers as Record<string, string>)['content-type']) {
      (init.headers as Record<string, string>)['content-type'] = 'application/json';
    }
  }
  return new Request(url, init);
}

async function jsonBody(res: Response): Promise<unknown> {
  return res.json();
}

// ─── Minimal candidates ───────────────────────────────────────────────────
// Two entries — one from ofac_sdn and one from un_consolidated — so the
// critical-list check in quick-screen passes without hitting Blobs.
const MINIMAL_CANDIDATES = [
  { listId: 'ofac_sdn', listRef: 'SDN-MIN-001', name: 'Test Candidate SDN' },
  { listId: 'un_consolidated', listRef: 'UN-MIN-001', name: 'Test Candidate UN' },
];

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/screening/run
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/screening/run', () => {
  let POST: (req: Request) => Promise<Response>;
  let OPTIONS: () => Promise<Response>;

  beforeEach(async () => {
    writeAuditChainEntryMock.mockClear();
    screeningAuditWriteMock.mockClear();
    // Default: return a non-empty corpus so the route proceeds past the corpus check.
    loadCandidatesMock.mockResolvedValue(MINIMAL_CANDIDATES);
    const mod = await import('@/app/api/screening/run/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
    OPTIONS = mod.OPTIONS as () => Promise<Response>;
  });

  // ── Input validation ────────────────────────────────────────────────────

  it('returns 400 for non-JSON body', async () => {
    const req = new Request('http://localhost/api/screening/run', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 when subject is missing from the body', async () => {
    const req = makeRequest('http://localhost/api/screening/run', {
      body: { candidates: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string; errors: Array<{ field: string }> };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('validation_error');
    expect(body.errors.some(e => e.field === 'subject')).toBe(true);
  });

  it('returns 400 when subject.name is an empty string', async () => {
    const req = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: '   ' } },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string; errors: Array<{ field: string }> };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('validation_error');
    expect(body.errors.some(e => e.field === 'subject.name')).toBe(true);
  });

  it('returns 400 when subject.name exceeds 512 characters', async () => {
    const req = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: 'x'.repeat(513) } },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string; errors: Array<{ field: string; message: string }> };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('validation_error');
    const nameError = body.errors.find(e => e.field === 'subject.name');
    expect(nameError).toBeTruthy();
    expect(nameError?.message).toMatch(/512/);
  });

  it('returns 400 when aliases exceed 50 entries', async () => {
    const aliases = Array.from({ length: 51 }, (_, i) => `Alias ${i + 1}`);
    const req = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: 'Test Subject', aliases } },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string; errors: Array<{ field: string }> };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('validation_error');
    expect(body.errors.some(e => e.field === 'subject.aliases')).toBe(true);
  });

  it('returns 400 when entityType is not a recognised value', async () => {
    const req = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: 'Test Corp', entityType: 'unicorn' } },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string; errors: Array<{ field: string }> };
    expect(body.ok).toBe(false);
    expect(body.errors.some(e => e.field === 'subject.entityType')).toBe(true);
  });

  // ── Auth ────────────────────────────────────────────────────────────────

  it('returns 401 when enforce() denies the request', async () => {
    const { enforce } = await import('@/lib/server/enforce');
    const enforceMock = enforce as ReturnType<typeof vi.fn>;
    enforceMock.mockImplementationOnce(async () => ({
      ok: false,
      response: new Response(
        JSON.stringify({ ok: false, error: 'API key required' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    }));

    const req = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: 'Test Subject' } },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  // ── Corpus unavailable ──────────────────────────────────────────────────

  it('returns 503 corpus_unavailable when loadCandidates returns an empty array', async () => {
    loadCandidatesMock.mockResolvedValueOnce([]);
    const req = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: 'Any Subject' } },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await jsonBody(res) as { ok: boolean; error: string; degraded: boolean };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('corpus_unavailable');
    expect(body.degraded).toBe(true);
  });

  it('returns 503 corpus_unavailable when loadCandidates throws', async () => {
    loadCandidatesMock.mockRejectedValueOnce(new Error('Blobs unreachable'));
    const req = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: 'Any Subject' } },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await jsonBody(res) as { ok: boolean; degraded: boolean };
    expect(body.ok).toBe(false);
    expect(body.degraded).toBe(true);
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it('returns 200 with ok:true for a clear subject (caller-supplied candidates, no match)', async () => {
    const req = makeRequest('http://localhost/api/screening/run', {
      body: {
        subject: { name: 'Zxqwvuty Nomatch Fictional', entityType: 'individual' },
        candidates: [
          { listId: 'ofac_sdn', listRef: 'SDN-001', name: 'Completely Unrelated Person' },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as {
      ok: boolean;
      severity: string;
      hits: unknown[];
      resultId: string;
      requestId: string;
      schemaVersion: string;
      negativeEvidence: string[];
      confidenceNote: string;
      latencyMs: number;
    };
    expect(body.ok).toBe(true);
    expect(body.severity).toBe('clear');
    expect(Array.isArray(body.hits)).toBe(true);
    expect(body.hits).toHaveLength(0);
    // Schema contract fields
    expect(typeof body.resultId).toBe('string');
    expect(body.resultId).toHaveLength(32); // sha256 slice(0,32)
    expect(typeof body.requestId).toBe('string');
    expect(body.schemaVersion).toBe('1.0');
    expect(Array.isArray(body.negativeEvidence)).toBe(true);
    expect(body.negativeEvidence.length).toBeGreaterThan(0);
    expect(typeof body.confidenceNote).toBe('string');
    expect(body.confidenceNote).toBeTruthy();
    expect(typeof body.latencyMs).toBe('number');
  });

  it('returns 200 with a hit when subject name exactly matches a candidate (rule-based or AI)', async () => {
    const req = makeRequest('http://localhost/api/screening/run', {
      body: {
        subject: { name: 'Suspicious Corp LLC' },
        candidates: [
          { listId: 'ofac_sdn', listRef: 'SDN-BAD-001', name: 'Suspicious Corp LLC' },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; hits: Array<{ listId: string }>; severity: string };
    expect(body.ok).toBe(true);
    // Either brain or rule-based fallback should find a high-similarity match.
    expect(body.hits.length).toBeGreaterThan(0);
    expect(body.hits[0]!.listId).toBe('ofac_sdn');
    expect(['critical', 'high', 'medium']).toContain(body.severity);
  });

  it('resultId is a 32-character hex string and differs between two independent requests', async () => {
    const req1 = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: 'Subject Alpha' }, candidates: MINIMAL_CANDIDATES },
    });
    const req2 = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: 'Subject Beta' }, candidates: MINIMAL_CANDIDATES },
    });
    const [res1, res2] = await Promise.all([POST(req1), POST(req2)]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const b1 = await jsonBody(res1) as { resultId: string };
    const b2 = await jsonBody(res2) as { resultId: string };
    expect(b1.resultId).toMatch(/^[0-9a-f]{32}$/);
    expect(b2.resultId).toMatch(/^[0-9a-f]{32}$/);
    // Different subjects produce different resultIds.
    expect(b1.resultId).not.toBe(b2.resultId);
  });

  // ── Audit trail ─────────────────────────────────────────────────────────

  it('fires a ScreeningAuditWriter.write call on a successful screen', async () => {
    screeningAuditWriteMock.mockClear();
    const req = makeRequest('http://localhost/api/screening/run', {
      body: {
        subject: { name: 'Audit Test Subject' },
        candidates: MINIMAL_CANDIDATES,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Allow micro-task queue to flush fire-and-forget audit write.
    await new Promise((r) => setTimeout(r, 10));
    expect(screeningAuditWriteMock).toHaveBeenCalledOnce();
    const [auditBody, _tenant] = screeningAuditWriteMock.mock.calls[0]!;
    expect((auditBody as Record<string, unknown>)['event']).toBe('screening.completed');
    expect(typeof (auditBody as Record<string, unknown>)['resultId']).toBe('string');
    expect(typeof (auditBody as Record<string, unknown>)['subjectName']).toBe('string');
  });

  it('x-schema-version response header is set to 1.0', async () => {
    const req = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: 'Header Test' }, candidates: MINIMAL_CANDIDATES },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-schema-version')).toBe('1.0');
  });

  it('OPTIONS returns 204 with POST in Access-Control-Allow-Methods', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    const methods = res.headers.get('access-control-allow-methods') ?? '';
    expect(methods).toMatch(/post/i);
  });

  it('response includes unresolvedAmbiguity array', async () => {
    const req = makeRequest('http://localhost/api/screening/run', {
      body: { subject: { name: 'Ambiguity Test' }, candidates: MINIMAL_CANDIDATES },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { unresolvedAmbiguity: unknown[] };
    expect(Array.isArray(body.unresolvedAmbiguity)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/quick-screen — additional scenarios not covered in api-routes.test.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/quick-screen — UN 1267 pre-screen and corpus validation', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    screeningAuditWriteMock.mockClear();
    loadCandidatesWithHealthMock.mockResolvedValue({
      candidates: MINIMAL_CANDIDATES,
      health: {
        source: 'static' as const,
        loadedAt: new Date().toISOString(),
        candidateCount: MINIMAL_CANDIDATES.length,
        healthy: true,
        failedAdapters: [],
      },
    });
    const mod = await import('@/app/api/quick-screen/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 400 when aliases exceed 50 entries', async () => {
    const aliases = Array.from({ length: 51 }, (_, i) => `Alias ${i + 1}`);
    const req = makeRequest('http://localhost/api/quick-screen', {
      body: { subject: { name: 'Test Name', aliases }, candidates: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/aliases/i);
  });

  it('returns 503 LISTS_MISSING when corpus is empty (no candidates in body, empty loader)', async () => {
    // Clear the global in-memory screen cache to prevent hitting a cached response.
    if (typeof globalThis.__hs_screen_cache !== 'undefined') {
      globalThis.__hs_screen_cache.clear();
    }
    loadCandidatesWithHealthMock.mockResolvedValueOnce({
      candidates: [],
      health: {
        source: 'static' as const,
        loadedAt: new Date().toISOString(),
        candidateCount: 0,
        healthy: false,
        failedAdapters: [],
      },
    });
    // No candidates in body — route will call loadCandidatesWithHealth
    const req = makeRequest('http://localhost/api/quick-screen', {
      body: { subject: { name: 'Empty Corpus Test' } },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await jsonBody(res) as { ok: boolean; errorCode: string; degraded: boolean };
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe('LISTS_MISSING');
    expect(body.degraded).toBe(true);
  });

  it('returns 503 LISTS_MISSING when corpus has neither ofac_sdn nor un_consolidated', async () => {
    if (typeof globalThis.__hs_screen_cache !== 'undefined') {
      globalThis.__hs_screen_cache.clear();
    }
    // Corpus has entries, but neither critical list is present
    const nonCriticalCandidates = [
      { listId: 'eu_fsf', listRef: 'EU-001', name: 'Some EU Entity' },
      { listId: 'uk_ofsi', listRef: 'UK-001', name: 'Some UK Entity' },
    ];
    loadCandidatesWithHealthMock.mockResolvedValueOnce({
      candidates: nonCriticalCandidates,
      health: {
        source: 'static' as const,
        loadedAt: new Date().toISOString(),
        candidateCount: 2,
        healthy: false,
        failedAdapters: ['ofac_sdn', 'un_consolidated'],
      },
    });
    const req = makeRequest('http://localhost/api/quick-screen', {
      body: { subject: { name: 'Critical Lists Missing Test' } },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await jsonBody(res) as {
      ok: boolean;
      errorCode: string;
      missingLists: string[];
      degraded: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe('LISTS_MISSING');
    expect(body.degraded).toBe(true);
    // Both critical lists should be named in missingLists
    expect(body.missingLists).toContain('ofac_sdn');
    expect(body.missingLists).toContain('un_consolidated');
  });

  it('UN 1267 pre-screen: subject matching "Al-Qaida" returns critical with un1267DesignatedEntityMatch', async () => {
    // "Al-Qaida" is verbatim in UN_1267_DESIGNATED_ENTITIES — token-set
    // similarity = 1.0 which exceeds the 0.80 threshold.
    const req = makeRequest('http://localhost/api/quick-screen', {
      body: {
        subject: { name: 'Al-Qaida' },
        candidates: MINIMAL_CANDIDATES,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as {
      ok: boolean;
      severity: string;
      un1267DesignatedEntityMatch: boolean;
      matchedDesignatedEntity: string;
      matchSimilarity: number;
      hits: Array<{ listId: string }>;
      adverseMedia?: unknown;
    };
    expect(body.ok).toBe(true);
    expect(body.severity).toBe('critical');
    expect(body.un1267DesignatedEntityMatch).toBe(true);
    expect(typeof body.matchedDesignatedEntity).toBe('string');
    expect(body.matchSimilarity).toBeGreaterThanOrEqual(0.80);
    expect(body.hits.length).toBeGreaterThan(0);
    expect(body.hits[0]!.listId).toBe('un_1267');
    // UN 1267 fast-path returns before any news source is queried — the
    // response must NOT claim an adverse-media check that never ran.
    expect(body.adverseMedia).toBeUndefined();
  });

  it('UN 1267 pre-screen: fires audit write with event=screening.completed', async () => {
    screeningAuditWriteMock.mockClear();
    const req = makeRequest('http://localhost/api/quick-screen', {
      body: {
        subject: { name: 'Islamic State' },
        candidates: MINIMAL_CANDIDATES,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(screeningAuditWriteMock).toHaveBeenCalledOnce();
    const [auditBody] = screeningAuditWriteMock.mock.calls[0]!;
    expect((auditBody as Record<string, unknown>)['event']).toBe('screening.completed');
    expect((auditBody as Record<string, unknown>)['severity']).toBe('critical');
  });

  it('UN 1267 pre-screen fires before whitelist check (whitelist cannot clear a designated entity)', async () => {
    // Even if whitelist is wired up to return a match, the UN 1267 check fires
    // first and returns critical before the whitelist path is reached.
    // (lookupWhitelist is already mocked to return null — but the test verifies
    // that the un1267DesignatedEntityMatch flag is present regardless.)
    const req = makeRequest('http://localhost/api/quick-screen', {
      body: {
        subject: { name: 'Al-Qaida', aliases: ['Al Qaeda', 'AQ'] },
        candidates: MINIMAL_CANDIDATES,
      },
    });
    const res = await POST(req);
    const body = await jsonBody(res) as { un1267DesignatedEntityMatch: boolean; severity: string };
    expect(body.un1267DesignatedEntityMatch).toBe(true);
    expect(body.severity).toBe('critical');
  });

  it('non-matching name returns 200 clear with no un1267 flag', async () => {
    const req = makeRequest('http://localhost/api/quick-screen', {
      body: {
        subject: { name: 'Totally Innocent Corp' },
        candidates: MINIMAL_CANDIDATES,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; severity: string; un1267DesignatedEntityMatch?: boolean };
    expect(body.ok).toBe(true);
    expect(body.un1267DesignatedEntityMatch).toBeFalsy();
  });

  it('evidenceUrls exceeding 20 entries returns 400', async () => {
    const evidenceUrls = Array.from({ length: 21 }, (_, i) => `https://example.com/article-${i}`);
    const req = makeRequest('http://localhost/api/quick-screen', {
      body: {
        subject: { name: 'Test Subject' },
        candidates: MINIMAL_CANDIDATES,
        evidenceUrls,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/evidenceUrls/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Frontend contract: response shape consumed by the screening page
// Both routes must satisfy this contract so the UI can render results.
// ─────────────────────────────────────────────────────────────────────────────

describe('Screening API response contract', () => {
  it('/api/screening/run response includes all fields required by the frontend', async () => {
    const { POST } = await import('@/app/api/screening/run/route') as {
      POST: (req: Request) => Promise<Response>;
    };
    loadCandidatesMock.mockResolvedValueOnce(MINIMAL_CANDIDATES);

    const req = makeRequest('http://localhost/api/screening/run', {
      body: {
        subject: { name: 'Contract Test Corp', entityType: 'organisation' },
        candidates: MINIMAL_CANDIDATES,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as Record<string, unknown>;

    // Fields the frontend reads to update subject card state
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('resultId');
    expect(body).toHaveProperty('hits');
    expect(body).toHaveProperty('topScore');
    expect(body).toHaveProperty('severity');
    // Audit / observability fields
    expect(body).toHaveProperty('requestId');
    expect(body).toHaveProperty('schemaVersion');
    expect(body).toHaveProperty('latencyMs');
    // Compliance fields
    expect(body).toHaveProperty('negativeEvidence');
    expect(body).toHaveProperty('confidenceNote');
    expect(body).toHaveProperty('unresolvedAmbiguity');
    // Adverse media (Lane C) — always present on this route, with the scored
    // article array and a lane-health entry the UI badge reads.
    expect(body).toHaveProperty('adverseMedia');
    const am = body['adverseMedia'] as Record<string, unknown>;
    expect(Array.isArray(am['scoredArticles'])).toBe(true);
    const laneHealth = body['laneHealth'] as Record<string, string> | undefined;
    if (laneHealth) {
      expect(['ok', 'degraded']).toContain(laneHealth['adverse_media']);
    }
    // Subject echo
    expect(body).toHaveProperty('subject');
    const subject = body['subject'] as Record<string, unknown>;
    expect(subject['name']).toBe('Contract Test Corp');
  });

  it('/api/quick-screen response includes topScore, severity, hits, and reasoning fields', async () => {
    if (typeof globalThis.__hs_screen_cache !== 'undefined') {
      globalThis.__hs_screen_cache.clear();
    }
    const { POST } = await import('@/app/api/quick-screen/route') as {
      POST: (req: Request) => Promise<Response>;
    };

    const req = makeRequest('http://localhost/api/quick-screen', {
      body: {
        subject: { name: 'Contract Test Individual', entityType: 'individual' },
        candidates: MINIMAL_CANDIDATES,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as Record<string, unknown>;

    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('topScore');
    expect(body).toHaveProperty('severity');
    expect(body).toHaveProperty('hits');
    expect(Array.isArray(body['hits'])).toBe(true);
    // Default mocks: searchAllNews returns zero articles AND zero providers —
    // nothing was queried, so the response must omit adverseMedia rather than
    // claim a "checked, clear" negative finding.
    expect(body['adverseMedia']).toBeUndefined();
  });

  it('/api/quick-screen surfaces adverseMedia when news adapters return articles', async () => {
    if (typeof globalThis.__hs_screen_cache !== 'undefined') {
      globalThis.__hs_screen_cache.clear();
    }
    const { searchAllNews } = await import('@/lib/intelligence/newsAdapters');
    vi.mocked(searchAllNews).mockResolvedValueOnce({
      articles: [
        {
          source: 'newsapi',
          outlet: 'example.com',
          title: 'Adverse Contract Person indicted for money laundering',
          url: 'https://news.example.com/adverse-1',
          publishedAt: '2026-05-01T00:00:00Z',
          snippet: 'Adverse Contract Person was charged in a money laundering and fraud investigation.',
        },
        {
          source: 'newsapi',
          outlet: 'example.com',
          title: 'Quarterly agricultural exports rise in unrelated region',
          url: 'https://news.example.com/unrelated-1',
          publishedAt: '2026-05-01T00:00:00Z',
          snippet: 'Commodity prices were stable.',
        },
      ],
      providersUsed: ['newsapi'],
    });
    const { POST } = await import('@/app/api/quick-screen/route') as {
      POST: (req: Request) => Promise<Response>;
    };

    const req = makeRequest('http://localhost/api/quick-screen', {
      body: {
        subject: { name: 'Adverse Contract Person', entityType: 'individual' },
        candidates: MINIMAL_CANDIDATES,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as Record<string, unknown>;

    const am = body['adverseMedia'] as Record<string, unknown> | undefined;
    expect(am).toBeTruthy();
    expect(am!['found']).toBe(true);
    expect(['critical', 'high', 'medium']).toContain(am!['severity']);
    expect(am!['provider']).toBe('newsapi');
    expect(am!['fatfPredicates']).toContain('FATF R.3 (ML offence)');
    const items = am!['items'] as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;
    expect(typeof first['id']).toBe('string');
    expect(String(first['title'])).toMatch(/indicted/i);
    expect(first['url']).toBe('https://news.example.com/adverse-1');
    expect(Array.isArray(first['categories'])).toBe(true);
    expect((first['categories'] as string[]).length).toBeGreaterThan(0);
    expect(first['severity']).toBeTruthy();
  });
});
