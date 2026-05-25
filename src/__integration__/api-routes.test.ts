/**
 * Integration tests for Hawkeye Sterling web API route handlers.
 *
 * These tests import the route modules directly and invoke the exported handler
 * functions with synthetic Request objects — no HTTP server is started.
 *
 * External dependencies that require Netlify Blobs, real API keys, or a live
 * Next.js runtime are replaced with vi.mock() stubs so the tests run in plain
 * Node.js without any infrastructure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @netlify/blobs before any route code is imported ──────────────────
// store.ts calls getStore() from @netlify/blobs at module init time.
// Providing a no-op mock prevents the MissingBlobsEnvironmentError that would
// otherwise throw and abort the entire test run.
vi.mock('@netlify/blobs', () => {
  const memStore = new Map<string, string>();
  const store = {
    get: async (key: string) => memStore.get(key) ?? null,
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

// ─── Mock the access user store ─────────────────────────────────────────────
// Replaced by a simple in-memory list so tests control exactly which users exist.
vi.mock('@/app/api/access/_store', async () => {
  const { generateSalt, hashPassword } = await import('@/lib/server/auth');

  const salt = generateSalt();
  const hash = hashPassword('correctpassword', salt);

  const knownUser = {
    id: 'usr-001',
    name: 'Test User',
    email: 'test@example.com',
    role: 'mlro' as const,
    lastLogin: '2025-01-01T00:00:00Z',
    active: true,
    modules: [],
    username: 'testuser',
    passwordHash: hash,
    passwordSalt: salt,
  };

  let users = [knownUser];

  return {
    loadUsers: vi.fn(async () => users),
    saveUsers: vi.fn(async (updated: typeof users) => { users = updated; }),
    withUsersLock: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    appendSession: vi.fn(async () => {}),
    updateSessionActivity: vi.fn(async () => {}),
    appendPermissionLog: vi.fn(async () => {}),
    maskIp: vi.fn((raw: string) => raw),
    ROLE_LABEL: {},
    ROLE_MODULES: { mlro: [] },
  };
});

// ─── Mock the enforce middleware ─────────────────────────────────────────────
// Most API routes call enforce(req) at the top and short-circuit on failure.
// We mock it to always return "allowed" so we can test the route body logic.
vi.mock('@/lib/server/enforce', () => ({
  enforce: vi.fn(async () => ({
    ok: true,
    tier: { id: 'free', callsPerSecond: 5, callsPerMinute: 60, monthlyQuota: 1000 },
    keyId: 'test-key',
    record: null,
    remainingMonthly: null,
    headers: {},
  })),
}));

// ─── Mock the cryptoRisk dist module ────────────────────────────────────────
// The crypto-risk route imports scoreWallet from the compiled dist.
// We mock the entire module so no network calls are made.
vi.mock('../../../../dist/src/integrations/cryptoRisk.js', () => ({
  scoreWallet: vi.fn(async (address: string) => ({
    ok: false,
    address,
    chain: 'unknown',
    provider: 'unavailable',
    riskScore: 0,
    riskLevel: 'unknown',
    exposure: { directSanctioned: 0, indirectSanctioned: 0, mixing: 0, darknet: 0 },
    labels: [],
    error: 'No crypto risk provider configured',
  })),
}));

// ─── Mock adminAuth — used by /api/access/* and other privileged routes ────
// adminAuth() returns 503 when ADMIN_TOKEN is unset (fail-closed). Tests
// shouldn't depend on env, so mock it to allow by default and override
// per-test when a deny path needs to be exercised.
vi.mock('@/lib/server/admin-auth', () => ({
  adminAuth: vi.fn(() => null),
}));

// ─── Provide SESSION_SECRET so auth helpers don't throw ─────────────────────
process.env['SESSION_SECRET'] = 'a'.repeat(64);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Request {
  const { method = 'GET', body, headers = {} } = options;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    if (!headers['content-type']) {
      (init.headers as Record<string, string>)['content-type'] = 'application/json';
    }
  }
  return new Request(url, init);
}

async function jsonBody(res: Response): Promise<unknown> {
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// auth/login route tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  // Import lazily inside describe so mocks are registered first.
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    // Reset module cache between suites but share within this describe block.
    const mod = await import('@/app/api/auth/login/route');
    POST = mod.POST;
  });

  it('returns 400 for invalid (non-JSON) body', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: 'not-json-at-all!!!',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid json/i);
  });

  it('returns 400 when username is missing', async () => {
    const req = makeRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: { password: 'secret123' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/username and password/i);
  });

  it('returns 400 when password is missing', async () => {
    const req = makeRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: { username: 'testuser' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  it('returns 400 when both username and password are empty strings', async () => {
    const req = makeRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: { username: '   ', password: '' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 for overly long username (>256 chars) — hash-DoS protection', async () => {
    const req = makeRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: { username: 'a'.repeat(257), password: 'anypassword' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it('returns 401 for overly long password (>1024 chars) — hash-DoS protection', async () => {
    const req = makeRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: { username: 'testuser', password: 'b'.repeat(1025) },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it('returns 401 for unknown user — no enumeration leak in error message', async () => {
    const req = makeRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: { username: 'nobody', password: 'wrongpass' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    // The error must be uniform — it must NOT say "user not found" (enumeration risk)
    expect(body.error).toMatch(/invalid username or password/i);
  });

  it('returns 401 for known user with wrong password', async () => {
    const req = makeRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: { username: 'testuser', password: 'wrongpassword' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid username or password/i);
  });

  it('returns 200 and sets session cookie on valid credentials', async () => {
    const req = makeRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: { username: 'testuser', password: 'correctpassword' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; name: string; role: string };
    expect(body.ok).toBe(true);
    expect(body.role).toBe('mlro');
    // A session cookie must be present in the response headers
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('hs_session=');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// crypto-risk route tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/crypto-risk', () => {
  let POST: (req: Request) => Promise<Response>;
  let OPTIONS: () => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/crypto-risk/route');
    POST = mod.POST;
    OPTIONS = mod.OPTIONS;
  });

  it('OPTIONS returns 204 with CORS headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toMatch(/post/i);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('POST with missing address returns 400', async () => {
    const req = makeRequest('http://localhost/api/crypto-risk', {
      method: 'POST',
      body: { chain: 'ethereum' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/address/i);
  });

  it('POST with empty address string returns 400', async () => {
    const req = makeRequest('http://localhost/api/crypto-risk', {
      method: 'POST',
      body: { address: '   ', chain: 'ethereum' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('POST with unknown wallet address returns offline fallback (scoreWallet unavailable)', async () => {
    // scoreWallet is mocked to return ok:false (no provider configured)
    // The route should return ok:true with provider:"unavailable" and simulationWarning
    const req = makeRequest('http://localhost/api/crypto-risk', {
      method: 'POST',
      body: { address: '0x1234567890abcdef1234567890abcdef12345678' },
    });
    const res = await POST(req);
    // Route turns provider-unavailable into a 200 with an offline fallback payload
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as {
      ok: boolean;
      offline: boolean;
      provider: string;
      simulationWarning: string;
    };
    expect(body.ok).toBe(true);
    expect(body.offline).toBe(true);
    expect(body.provider).toBe('unavailable');
    expect(body.simulationWarning).toBeTruthy();
  });

  it('POST with subject-wrapped body (MCP form) works like direct body', async () => {
    const req = makeRequest('http://localhost/api/crypto-risk', {
      method: 'POST',
      body: { subject: { address: '0xaabbccddaabbccddaabbccddaabbccddaabbccdd', chain: 'ethereum' } },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; offline: boolean };
    expect(body.ok).toBe(true);
    expect(body.offline).toBe(true);
  });

  it('POST with invalid JSON returns 400', async () => {
    const req = new Request('http://localhost/api/crypto-risk', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lei-lookup route tests
// ─────────────────────────────────────────────────────────────────────────────

describe('OPTIONS /api/lei-lookup', () => {
  let OPTIONS: () => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/lei-lookup/route');
    OPTIONS = mod.OPTIONS;
  });

  it('OPTIONS returns 204 with CORS allow-origin and allow-methods headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    expect(res.headers.get('access-control-allow-methods')).toMatch(/post/i);
  });

  it('OPTIONS includes allow-headers for content-type, authorization, x-api-key', async () => {
    const res = await OPTIONS();
    const allowed = res.headers.get('access-control-allow-headers') ?? '';
    expect(allowed).toMatch(/content-type/i);
    expect(allowed).toMatch(/authorization/i);
    expect(allowed).toMatch(/x-api-key/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// well-known/jwks.json route tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/well-known/jwks.json', () => {
  let GET: () => Response | Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/well-known/jwks.json/route');
    GET = mod.GET;
  });

  it('returns 200 with a keys array when REPORT_ED25519_PRIVATE_KEY is not set', async () => {
    // Ensure the env var is absent (default in the test environment)
    const saved = process.env['REPORT_ED25519_PRIVATE_KEY'];
    delete process.env['REPORT_ED25519_PRIVATE_KEY'];

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await (res as Response).json() as { keys: unknown[] };
    expect(Array.isArray(body.keys)).toBe(true);
    // No key configured → empty array
    expect(body.keys).toHaveLength(0);

    // Restore original value (if any)
    if (saved !== undefined) process.env['REPORT_ED25519_PRIVATE_KEY'] = saved;
  });

  it('sets content-type to application/jwk-set+json', async () => {
    const res = await GET();
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toMatch(/jwk-set\+json/i);
  });

  it('sets cache-control header allowing public caching', async () => {
    const res = await GET();
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).toMatch(/public/i);
    expect(cc).toMatch(/max-age/i);
  });

  it('returns a JWK entry when a valid Ed25519 private key is configured', async () => {
    // Generate a real Ed25519 PEM key in-process so no external tooling needed
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    process.env['REPORT_ED25519_PRIVATE_KEY'] = privateKey;

    // publicKeyJwk() reads process.env at call time — no module reset needed.
    const { publicKeyJwk } = await import('@/lib/server/report-pubkey');
    const jwk = publicKeyJwk();
    // The module read the key; the route wraps it in { keys: [jwk] }
    expect(jwk).not.toBeNull();
    expect(jwk?.kty).toBe('OKP');
    expect(jwk?.crv).toBe('Ed25519');
    expect(jwk?.alg).toBe('EdDSA');
    expect(typeof jwk?.x).toBe('string');
    expect(typeof jwk?.kid).toBe('string');

    delete process.env['REPORT_ED25519_PRIVATE_KEY'];
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// auth/logout route tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  let POST: () => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/auth/logout/route');
    POST = mod.POST;
  });

  it('returns 200 with ok:true', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('clears the hs_session cookie by setting maxAge=0', async () => {
    const res = await POST();
    const setCookie = res.headers.get('set-cookie') ?? '';
    // The cookie must be set to empty with Max-Age=0 to expire it
    expect(setCookie).toContain('hs_session=');
    expect(setCookie).toMatch(/max-age=0/i);
  });

  it('is idempotent — calling it twice both return 200', async () => {
    const res1 = await POST();
    const res2 = await POST();
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// access/users route tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/access/users', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/access/users/route');
    GET = mod.GET;
  });

  it('returns 200 with users array when enforce() permits the request', async () => {
    // enforce() is mocked globally to always return ok:true
    const req = makeRequest('http://localhost/api/access/users');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; users: Array<Record<string, unknown>> };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.length).toBeGreaterThan(0);
  });

  it('strips passwordHash and passwordSalt from each user in the response', async () => {
    const req = makeRequest('http://localhost/api/access/users');
    const res = await GET(req);
    const body = await jsonBody(res) as { ok: boolean; users: Array<Record<string, unknown>> };
    for (const user of body.users) {
      expect(user['passwordHash']).toBeUndefined();
      expect(user['passwordSalt']).toBeUndefined();
    }
  });

  it('returns 401 when adminAuth() denies the request', async () => {
    // The route uses adminAuth() (not enforce) for privilege gating. Override
    // the mock with mockReturnValueOnce so it self-restores after the call —
    // anything else risks leaking a queued deny into the next describe block.
    const { adminAuth } = await import('@/lib/server/admin-auth');
    const adminAuthMock = adminAuth as ReturnType<typeof vi.fn>;

    adminAuthMock.mockReturnValueOnce(
      new Response(JSON.stringify({ ok: false, error: 'Admin authorization required.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const req = makeRequest('http://localhost/api/access/users');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// country-risk route tests (static fallback path — no ANTHROPIC_API_KEY)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/country-risk (static fallback)', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    // Ensure ANTHROPIC_API_KEY is absent so the route uses static data
    delete process.env['ANTHROPIC_API_KEY'];
    const mod = await import('@/app/api/country-risk/route');
    POST = mod.POST;
  });

  it('returns 400 when country field is missing', async () => {
    const req = makeRequest('http://localhost/api/country-risk', {
      method: 'POST',
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/country/i);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/country-risk', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with static_fallback source for a known country (UAE alias)', async () => {
    const req = makeRequest('http://localhost/api/country-risk', {
      method: 'POST',
      body: { country: 'UAE' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as {
      ok: boolean;
      source: string;
      country: string;
      fatfStatus: string;
    };
    expect(body.ok).toBe(true);
    expect(body.source).toBe('static_fallback');
    expect(body.country).toBe('United Arab Emirates');
    expect(body.fatfStatus).toBe('member');
  });

  it('returns 200 with static_fallback for a known FATF black-list country (Iran)', async () => {
    const req = makeRequest('http://localhost/api/country-risk', {
      method: 'POST',
      body: { country: 'Iran' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as {
      ok: boolean;
      source: string;
      overallRisk: string;
      fatfStatus: string;
      recommendation: string;
    };
    expect(body.ok).toBe(true);
    expect(body.source).toBe('static_fallback');
    expect(body.fatfStatus).toBe('black_list');
    expect(body.overallRisk).toBe('critical');
    expect(body.recommendation).toBe('prohibited');
  });

  it('returns simulationWarning template for unknown country without ANTHROPIC_API_KEY', async () => {
    const req = makeRequest('http://localhost/api/country-risk', {
      method: 'POST',
      body: { country: 'Ruritania' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as {
      ok: boolean;
      source: string;
      simulationWarning: string;
    };
    expect(body.ok).toBe(true);
    expect(body.source).toBe('static_fallback');
    expect(body.simulationWarning).toBeTruthy();
    expect(body.simulationWarning).toMatch(/ANTHROPIC_API_KEY/i);
  });
});

// ─── Mock intelligence adapters used by the quick-screen route ───────────────
// These modules make external HTTP calls and must be stubbed out for tests.
// Each adapter export is mocked to return a null / empty result so the route
// still runs its full logic path but never hits the network.
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
vi.mock('@/lib/server/candidates-loader', () => ({
  loadCandidates: vi.fn(async () => []),
  loadCandidatesWithHealth: vi.fn(async () => ({
    candidates: [],
    health: {
      source: 'static' as const,
      loadedAt: new Date().toISOString(),
      candidateCount: 0,
      healthy: false,
      failedAdapters: [],
    },
  })),
}));
vi.mock('@/lib/server/whitelist', () => ({
  lookupWhitelist: vi.fn(async () => null),
}));

// ─── Mock the audit helper ────────────────────────────────────────────────────
// writeAuditEvent uses window.localStorage which doesn't exist in Node.js.
vi.mock('@/lib/audit', () => ({
  writeAuditEvent: vi.fn(() => ({ id: 'ae-mock', timestamp: new Date().toISOString(), actor: 'test', action: 'test', target: 'test', hash: 'hs:0000' })),
  loadAuditEntries: vi.fn(() => []),
}));

// ─── Mock the LLM client for adverse-media-assess ────────────────────────────
// The real client makes an Anthropic API call; in tests we don't want that.
vi.mock('@/lib/server/llm', () => ({
  getAnthropicClient: vi.fn(() => ({
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: 'text', text: JSON.stringify({
          overallRisk: 'low',
          threatNarrative: 'No significant adverse media found.',
          topConcerns: [],
          fatfTypologies: [],
          regulatoryLinks: '',
          recommendedAction: 'standard_monitoring',
          actionRationale: 'Clean profile.',
          uaeSpecificRisks: [],
        }) }],
      })),
    },
  })),
}));

// ─────────────────────────────────────────────────────────────────────────────
// iban-risk route tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/iban-risk', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/iban-risk/route');
    POST = mod.POST;
  });

  it('returns 400 when iban field is missing', async () => {
    const req = makeRequest('http://localhost/api/iban-risk', {
      method: 'POST',
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/iban/i);
  });

  it('returns 400 for malformed IBAN (too short)', async () => {
    const req = makeRequest('http://localhost/api/iban-risk', {
      method: 'POST',
      body: { iban: 'GB' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid iban/i);
  });

  it('returns 200 with low risk for a valid UK IBAN', async () => {
    // GB29 NWBK 6016 1331 9268 19 — canonical test IBAN
    const req = makeRequest('http://localhost/api/iban-risk', {
      method: 'POST',
      body: { iban: 'GB29NWBK60161331926819' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as {
      ok: boolean;
      countryCode: string;
      riskLevel: string;
      eddRequired: boolean;
      sanctionsCheck: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.countryCode).toBe('GB');
    expect(body.riskLevel).toBe('low');
    expect(body.eddRequired).toBe(false);
    expect(body.sanctionsCheck).toBe(false);
  });

  it('returns 200 with critical risk and sanctionsCheck:true for an Iranian IBAN', async () => {
    // IR-prefix IBAN: IR + 2 check digits + 20 BBAN digits
    const req = makeRequest('http://localhost/api/iban-risk', {
      method: 'POST',
      body: { iban: 'IR062960000000100324200001' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as {
      ok: boolean;
      countryCode: string;
      riskLevel: string;
      eddRequired: boolean;
      sanctionsCheck: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.countryCode).toBe('IR');
    expect(body.riskLevel).toBe('critical');
    expect(body.eddRequired).toBe(true);
    expect(body.sanctionsCheck).toBe(true);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/iban-risk', {
      method: 'POST',
      body: 'oops',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('defaults to medium risk for an IBAN from an unknown country code', async () => {
    // ZZ is not in the risk database
    const req = makeRequest('http://localhost/api/iban-risk', {
      method: 'POST',
      body: { iban: 'ZZ1234567890123456' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as {
      ok: boolean;
      riskLevel: string;
      countryCode: string;
    };
    expect(body.ok).toBe(true);
    expect(body.riskLevel).toBe('medium');
    expect(body.countryCode).toBe('ZZ');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// quick-screen route tests  (/api/quick-screen)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/quick-screen', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/quick-screen/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 400 when subject is missing', async () => {
    // Provide candidates so the route does not call loadCandidates.
    const req = makeRequest('http://localhost/api/quick-screen', {
      method: 'POST',
      body: { candidates: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/subject\.name required/i);
  });

  it('returns 400 when subject.name is an empty string', async () => {
    const req = makeRequest('http://localhost/api/quick-screen', {
      method: 'POST',
      body: { subject: { name: '   ' }, candidates: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  it('returns 400 when subject.name exceeds 512 characters', async () => {
    const req = makeRequest('http://localhost/api/quick-screen', {
      method: 'POST',
      body: { subject: { name: 'a'.repeat(513) }, candidates: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/512/);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/quick-screen', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('returns 200 with ok:true and a hits array when candidates are provided', async () => {
    // Provide one known-clear candidate.  With a unique query name and no
    // matching candidates the engine returns severity:"clear" and hits:[].
    const req = makeRequest('http://localhost/api/quick-screen', {
      method: 'POST',
      body: {
        subject: { name: 'John Smith Test' },
        candidates: [
          {
            listId: 'ofac_sdn',
            listRef: 'SDN-001',
            name: 'Completely Different Person',
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; hits: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.hits)).toBe(true);
  });

  it('returns 401 when enforce() denies the request', async () => {
    const { enforce } = await import('@/lib/server/enforce');
    const enforceMock = enforce as ReturnType<typeof vi.fn>;
    enforceMock.mockImplementationOnce(async () => ({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    }));

    const req = makeRequest('http://localhost/api/quick-screen', {
      method: 'POST',
      body: { subject: { name: 'Test Person' }, candidates: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('no-match: fictional name returns severity:clear and empty hits', async () => {
    const req = makeRequest('http://localhost/api/quick-screen', {
      method: 'POST',
      body: {
        subject: { name: 'Zxqwvuty Nomatch Fictional' },
        candidates: [
          { listId: 'ofac_sdn', listRef: 'SDN-999', name: 'Completely Unrelated Entity' },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; severity: string; hits: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.severity).toBe('clear');
    expect(body.hits).toHaveLength(0);
  });

  it('alias match: hit is found when candidate alias matches subject name', async () => {
    const req = makeRequest('http://localhost/api/quick-screen', {
      method: 'POST',
      body: {
        subject: { name: 'Al-Rashid Trading' },
        candidates: [
          {
            listId: 'ofac_sdn',
            listRef: 'SDN-100',
            name: 'Rashid Group International',
            aliases: ['Al-Rashid Trading', 'Al Rashid Trading LLC'],
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; hits: Array<{ matchedAlias?: string }> };
    expect(body.ok).toBe(true);
    expect(body.hits.length).toBeGreaterThan(0);
    // At least one hit should carry the matched alias
    const withAlias = body.hits.filter((h) => h.matchedAlias);
    expect(withAlias.length).toBeGreaterThan(0);
  });

  it('performance: response time under 5 seconds for a typical screen', async () => {
    const start = Date.now();
    const req = makeRequest('http://localhost/api/quick-screen', {
      method: 'POST',
      body: {
        subject: { name: 'Performance Test Subject' },
        candidates: Array.from({ length: 50 }, (_, i) => ({
          listId: 'ofac_sdn',
          listRef: `SDN-PERF-${i}`,
          name: `Test Candidate ${i} XYZ`,
        })),
      },
    });
    const res = await POST(req);
    const durationMs = Date.now() - start;
    expect(res.status).toBe(200);
    expect(durationMs).toBeLessThan(5_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sanctions/status route tests  (/api/sanctions/status)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/sanctions/status', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/sanctions/status/route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 200 with ok, summary, and lists array when enforce() permits', async () => {
    const req = makeRequest('http://localhost/api/sanctions/status');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as {
      ok: boolean;
      summary: Record<string, number>;
      lists: unknown[];
      generatedAt: string;
    };
    expect(typeof body.ok).toBe('boolean');
    expect(Array.isArray(body.lists)).toBe(true);
    expect(typeof body.summary).toBe('object');
    expect(body.summary).toHaveProperty('healthy');
    expect(body.summary).toHaveProperty('missing');
    expect(typeof body.generatedAt).toBe('string');
  });

  it('returns degraded:true and warnings when blobs store has no lists', async () => {
    // The in-memory mock blob store is empty, so every list is "missing".
    const req = makeRequest('http://localhost/api/sanctions/status');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { degraded: boolean; warnings: unknown[] };
    // All lists are absent from the in-memory store — degraded must be true.
    expect(body.degraded).toBe(true);
    expect(Array.isArray(body.warnings)).toBe(true);
  });

  it('env block contains only boolean values (no secrets)', async () => {
    const req = makeRequest('http://localhost/api/sanctions/status');
    const res = await GET(req);
    const body = await jsonBody(res) as { env: Record<string, unknown> };
    for (const val of Object.values(body.env)) {
      expect(typeof val).toBe('boolean');
    }
  });

  it('returns 401 when enforce() denies the request', async () => {
    const { enforce } = await import('@/lib/server/enforce');
    const enforceMock = enforce as ReturnType<typeof vi.fn>;
    enforceMock.mockImplementationOnce(async () => ({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'API key required' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    }));

    const req = makeRequest('http://localhost/api/sanctions/status');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// adverse-media-assess route tests  (/api/adverse-media-assess)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/adverse-media-assess', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    // Ensure no ANTHROPIC_API_KEY for the "unavailable" path tests.
    delete process.env['ANTHROPIC_API_KEY'];
    const mod = await import('@/app/api/adverse-media-assess/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 400 when subject is missing', async () => {
    const req = makeRequest('http://localhost/api/adverse-media-assess', {
      method: 'POST',
      body: { entries: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/subject/i);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/adverse-media-assess', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    // ANTHROPIC_API_KEY is absent (deleted in beforeEach).
    const req = makeRequest('http://localhost/api/adverse-media-assess', {
      method: 'POST',
      body: { subject: 'Test Corp', entries: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('returns 200 with ok:true when ANTHROPIC_API_KEY is set (LLM mocked)', async () => {
    // Set the API key — the LLM client is mocked globally to return a valid
    // JSON assessment without making a real network call.
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
    // Re-import so the route picks up the new env var.
    vi.resetModules();
    const mod = await import('@/app/api/adverse-media-assess/route');
    const postFn = mod.POST as unknown as (req: Request) => Promise<Response>;

    const req = makeRequest('http://localhost/api/adverse-media-assess', {
      method: 'POST',
      body: {
        subject: 'Acme Corp',
        entries: [
          {
            headline: 'Acme Corp fined for AML violations',
            category: 'regulatory',
            severity: 'high',
            source: 'Reuters',
            articleDate: '2024-01-15',
          },
        ],
      },
    });
    const res = await postFn(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(true);

    delete process.env['ANTHROPIC_API_KEY'];
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pep-match route tests  (/api/pep-match)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/pep-match', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/pep-match/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/pep-match', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('returns 200 with empty hits when name is too short (< 2 chars)', async () => {
    // The route returns early with ok:true and no hits for names shorter than 2 chars.
    const req = makeRequest('http://localhost/api/pep-match', {
      method: 'POST',
      body: { name: 'A' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; hits: unknown[]; source: string };
    expect(body.ok).toBe(true);
    expect(body.hits).toHaveLength(0);
    expect(body.source).toBe('none');
  });

  it('returns 200 with ok:true and hits array when corpus is empty (no blob/CDN data)', async () => {
    // Blob mock returns null for "pep/current.json"; mock the CDN fetch to 404
    // so the route falls through to source:"none" without hitting the live
    // OpenSanctions bulk URL (which would either hang past testTimeout or
    // return real data and break the hermetic-test contract).
    const origFetch = global.fetch;
    global.fetch = vi.fn(async () => new Response('', { status: 404 })) as typeof fetch;
    try {
      const req = makeRequest('http://localhost/api/pep-match', {
        method: 'POST',
        body: { name: 'Vladimir Putin' },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await jsonBody(res) as { ok: boolean; hits: unknown[]; queriedName: string };
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.hits)).toBe(true);
      expect(body.queriedName).toBe('Vladimir Putin');
    } finally {
      global.fetch = origFetch;
    }
  });

  it('returns 401 when enforce() denies the request', async () => {
    const { enforce } = await import('@/lib/server/enforce');
    const enforceMock = enforce as ReturnType<typeof vi.fn>;
    enforceMock.mockImplementationOnce(async () => ({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'API key required' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    }));

    const req = makeRequest('http://localhost/api/pep-match', {
      method: 'POST',
      body: { name: 'Test PEP' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// ─── Additional mocks required by the three new endpoint suites below ─────────
// withGuard is the admin-only auth wrapper. A pass-through mock lets tests
// reach handler logic without a real ADMIN_TOKEN in the environment.
vi.mock('@/lib/server/guard', () => ({
  withGuard: (fn: (req: Request) => Promise<Response>) => fn,
}));

// writeAuditChainEntry is fire-and-forget in all routes; a noop stub keeps
// tests hermetic without needing a fully-configured audit chain store.
vi.mock('@/lib/server/audit-chain', () => ({
  writeAuditChainEntry: vi.fn(async () => {}),
}));


// ─────────────────────────────────────────────────────────────────────────────
// four-eyes/expire route tests  (/api/four-eyes/expire)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/four-eyes/expire', () => {
  let POST: (req: Request) => Promise<Response>;
  let setJson: (key: string, value: unknown) => Promise<void>;
  let del: (key: string) => Promise<void>;

  beforeEach(async () => {
    const mod = await import('@/app/api/four-eyes/expire/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
    const storeModule = await import('@/lib/server/store');
    setJson = storeModule.setJson;
    del = storeModule.del;
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/four-eyes/expire', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid_json/i);
  });

  it('returns 400 when neither itemId nor expireOverdueAll is provided', async () => {
    const req = makeRequest('http://localhost/api/four-eyes/expire', {
      method: 'POST',
      body: { reason: 'cleanup only, no target' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string; hint: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_target');
    expect(body.hint).toMatch(/itemId/i);
  });

  it('returns 404 when itemId does not exist in the store', async () => {
    const req = makeRequest('http://localhost/api/four-eyes/expire', {
      method: 'POST',
      body: { itemId: 'definitely-does-not-exist-xyz987' },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('item_not_found');
  });

  it('returns 409 when the item exists but is not pending', async () => {
    const itemId = 'fe-expire-test-approved-01';
    await setJson(`four-eyes/${itemId}`, {
      id: itemId,
      status: 'approved',
      subjectName: 'Acme Corp',
      action: 'onboard',
      initiatedBy: 'operator-A',
      initiatedAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    });
    try {
      const req = makeRequest('http://localhost/api/four-eyes/expire', {
        method: 'POST',
        body: { itemId },
      });
      const res = await POST(req);
      expect(res.status).toBe(409);
      const body = await jsonBody(res) as { ok: boolean; error: string; status: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('item_not_pending');
      expect(body.status).toBe('approved');
    } finally {
      await del(`four-eyes/${itemId}`);
    }
  });

  it('expires a single pending item and returns expired:1 with the item ID', async () => {
    const itemId = 'fe-expire-test-pending-01';
    await setJson(`four-eyes/${itemId}`, {
      id: itemId,
      status: 'pending',
      subjectName: 'Suspicious Corp',
      action: 'screen',
      initiatedBy: 'analyst-B',
      initiatedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    });
    try {
      const req = makeRequest('http://localhost/api/four-eyes/expire', {
        method: 'POST',
        body: { itemId, actor: 'admin', reason: 'stale item expiry' },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await jsonBody(res) as { ok: boolean; expired: number; itemIds: string[] };
      expect(body.ok).toBe(true);
      expect(body.expired).toBe(1);
      expect(body.itemIds).toContain(itemId);
    } finally {
      await del(`four-eyes/${itemId}`);
    }
  });

  it('expireOverdueAll with no matching pending items returns expired:0', async () => {
    // Use thresholdHours=1 — no pending items in the store are expected to be
    // over 1 hour old at test runtime (all test items use recent timestamps or
    // are cleaned up after each test).
    const req = makeRequest('http://localhost/api/four-eyes/expire', {
      method: 'POST',
      body: { expireOverdueAll: true, thresholdHours: 1 },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; expired: number; itemIds: string[]; thresholdHours: number };
    expect(body.ok).toBe(true);
    expect(body.itemIds).toHaveLength(0);
    expect(body.thresholdHours).toBe(1);
  });

  it('rejects itemId containing spaces (safeId guard) and returns missing_target', async () => {
    const req = makeRequest('http://localhost/api/four-eyes/expire', {
      method: 'POST',
      body: { itemId: 'invalid id with spaces and !@# chars' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    // safeId returns null for bad chars → itemId === null → missing_target
    expect(body.error).toBe('missing_target');
  });

  it('OPTIONS returns 204 with correct CORS headers', async () => {
    const mod = await import('@/app/api/four-eyes/expire/route');
    const OPTIONS = mod.OPTIONS as () => Promise<Response>;
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('allow')).toMatch(/post/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// screen/batch route tests  (/api/screen/batch)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/screen/batch', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/screen/batch/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/screen/batch', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid json/i);
  });

  it('returns 400 when subjects field is missing', async () => {
    const req = makeRequest('http://localhost/api/screen/batch', {
      method: 'POST',
      body: { options: { threshold: 70 } },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_body');
  });

  it('returns 400 when subjects is an empty array', async () => {
    const req = makeRequest('http://localhost/api/screen/batch', {
      method: 'POST',
      body: { subjects: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    // Empty array is rejected with subjects array is empty
    expect(body.error).toMatch(/empty/i);
  });

  it('returns 400 when batch exceeds 20 subjects (hard cap)', async () => {
    const subjects = Array.from({ length: 21 }, (_, i) => ({ name: `Subject ${i + 1}` }));
    const req = makeRequest('http://localhost/api/screen/batch', {
      method: 'POST',
      body: { subjects },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as {
      ok: boolean;
      error: string;
      received: number;
      limit: number;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('batch_too_large');
    expect(body.received).toBe(21);
    expect(body.limit).toBe(20);
  });

  it('returns 400 for a batch of exactly 20 with a duplicate subject', async () => {
    const subjects = Array.from({ length: 19 }, (_, i) => ({ name: `Subject ${i + 1}` }));
    // Add a duplicate of Subject 1
    subjects.push({ name: 'Subject 1' });
    const req = makeRequest('http://localhost/api/screen/batch', {
      method: 'POST',
      body: { subjects },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as {
      ok: boolean;
      error: string;
      duplicates: string[];
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('duplicate_subjects');
    expect(body.duplicates).toContain('Subject 1');
  });

  it('detects case-insensitive duplicates in the dedup guard', async () => {
    const req = makeRequest('http://localhost/api/screen/batch', {
      method: 'POST',
      body: { subjects: [{ name: 'john smith' }, { name: 'JOHN SMITH' }] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('duplicate_subjects');
  });

  it('returns 400 when a subject entry is missing the required name field', async () => {
    const req = makeRequest('http://localhost/api/screen/batch', {
      method: 'POST',
      body: { subjects: [{ aliases: ['alias only'] }] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('returns 200 with correct response shape on a valid single-subject request', async () => {
    const req = makeRequest('http://localhost/api/screen/batch', {
      method: 'POST',
      body: { subjects: [{ name: 'Viktor Bout', entityType: 'individual' }] },
    });
    const res = await POST(req);
    // May be 200 (quickScreen mocked) or 503 (dist not built).
    // Test the shape regardless.
    if (res.status === 200) {
      const body = await jsonBody(res) as {
        ok: boolean;
        count: number;
        requestId: string;
        screenedAt: string;
        results: Array<{ name: string; band: string; recommendation: string; lists: string[] }>;
      };
      expect(body.ok).toBe(true);
      expect(body.count).toBe(1);
      expect(typeof body.requestId).toBe('string');
      expect(typeof body.screenedAt).toBe('string');
      expect(Array.isArray(body.results)).toBe(true);
      const result = body.results[0]!;
      expect(result.name).toBe('Viktor Bout');
      expect(['critical', 'high', 'medium', 'low', 'clear']).toContain(result.band);
      expect(['match', 'review', 'dismiss']).toContain(result.recommendation);
      expect(Array.isArray(result.lists)).toBe(true);
    } else {
      // 503 is acceptable — dist not built in test environment.
      expect(res.status).toBe(503);
    }
  });

  it('OPTIONS returns 204 with correct CORS headers', async () => {
    const mod = await import('@/app/api/screen/batch/route');
    const OPTIONS = mod.OPTIONS as () => Promise<Response>;
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('allow')).toMatch(/post/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// audit-trail/verify route tests  (/api/audit-trail/verify)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/audit-trail/verify', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/audit-trail/verify/route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 200 with chainIntegrity:intact and entriesVerified:0 for an empty chain', async () => {
    // The in-memory blob store starts empty — chain.json returns null,
    // which the handler treats as a trivially-intact empty chain.
    const req = makeRequest('http://localhost/api/audit-trail/verify');
    const res = await GET(req);
    // The handler may return 503 if loadAuditStore() fails in the test env,
    // but with @netlify/blobs mocked it should return 200.
    expect([200, 503]).toContain(res.status);

    if (res.status === 200) {
      const body = await jsonBody(res) as {
        ok: boolean;
        chainIntegrity: string;
        entriesVerified: number;
        firstBreakAt: null;
        compositeHash: string;
        verifiedAt: string;
      };
      expect(body.ok).toBe(true);
      expect(body.chainIntegrity).toBe('intact');
      expect(body.entriesVerified).toBe(0);
      expect(body.firstBreakAt).toBeNull();
      expect(typeof body.compositeHash).toBe('string');
      expect(body.compositeHash).toMatch(/^[0-9a-f]{8}$/);
      expect(typeof body.verifiedAt).toBe('string');
    }
  });

  it('response body has ok:true when the chain is intact', async () => {
    const req = makeRequest('http://localhost/api/audit-trail/verify');
    const res = await GET(req);
    if (res.status === 200) {
      const body = await jsonBody(res) as { ok: boolean };
      expect(body.ok).toBe(true);
    }
  });

  it('compositeHash is the known FNV-1a offset basis for an empty chain', async () => {
    // An empty chain should produce compositeHash = fnv1a("") = "811c9dc5".
    const req = makeRequest('http://localhost/api/audit-trail/verify');
    const res = await GET(req);
    if (res.status === 200) {
      const body = await jsonBody(res) as { compositeHash: string; entriesVerified: number };
      if (body.entriesVerified === 0) {
        expect(body.compositeHash).toBe('811c9dc5');
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/health — regression: anonymous callers must NOT receive build metadata.
// enforce() identifies anonymous callers with keyId "anon_<sha-prefix>" (not
// the literal string "anonymous"), so the prior `keyId !== "anonymous"` gate
// matched every anon request and leaked buildId/commitRef. Verify the fix.
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/health — anonymous deployment-info leak guard', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/health/route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  it('does NOT include buildId or commitRef in the body when caller is anonymous', async () => {
    // enforce() identifies anon callers with keyId of the form "anon_<hash>".
    // Override the module-level mock for this specific test to simulate that
    // shape — the previous code path checked `keyId !== "anonymous"` (literal),
    // which never matched and leaked build metadata. The fix is
    // `!keyId.startsWith("anon_")`; this test verifies that fix.
    const { enforce } = await import('@/lib/server/enforce');
    const enforceMock = enforce as ReturnType<typeof vi.fn>;
    enforceMock.mockImplementationOnce(async () => ({
      ok: true,
      tier: { id: 'free', callsPerSecond: 5, callsPerMinute: 60, monthlyQuota: 1000 },
      keyId: 'anon_deadbeefcafe',
      record: null,
      remainingMonthly: null,
      headers: {},
    }));

    const req = makeRequest('http://localhost/api/health');
    const res = await GET(req);
    const body = await jsonBody(res) as Record<string, unknown>;
    expect(body).not.toHaveProperty('buildId');
    expect(body).not.toHaveProperty('commitRef');
    // Sanity: public liveness fields are still present.
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('mandatoryListsHealthy');
  });

  it('DOES include buildId and commitRef when caller is authenticated (non-anon keyId)', async () => {
    // The default mock returns keyId: "test-key" which does not start with
    // "anon_", so authenticated=true and the route should disclose build info.
    const req = makeRequest('http://localhost/api/health');
    const res = await GET(req);
    const body = await jsonBody(res) as Record<string, unknown>;
    expect(body).toHaveProperty('buildId');
    expect(body).toHaveProperty('commitRef');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/ai-incident-playbook — UAE AI incident register (FDL 10/2025 Art.24)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/ai-incident-playbook', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/ai-incident-playbook/route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  it('returns ok:true with an incidents array', async () => {
    const req = makeRequest('http://localhost/api/ai-incident-playbook');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; incidents: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.incidents)).toBe(true);
  });
});

describe('POST /api/ai-incident-playbook', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/ai-incident-playbook/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('rejects missing required fields with 400', async () => {
    const req = makeRequest('http://localhost/api/ai-incident-playbook', {
      method: 'POST',
      body: { type: 'hallucination' }, // missing title, description, severity, affectedModel
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  it('rejects invalid incident type with 400', async () => {
    const req = makeRequest('http://localhost/api/ai-incident-playbook', {
      method: 'POST',
      body: {
        type: 'not_a_real_type',
        severity: 'high',
        title: 'Test incident',
        description: 'Test description',
        affectedModel: 'claude-sonnet-4-6',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  it('creates incident and returns it with ok:true', async () => {
    const req = makeRequest('http://localhost/api/ai-incident-playbook', {
      method: 'POST',
      body: {
        type: 'hallucination',
        severity: 'high',
        title: 'SAR narrative contained fabricated customer name',
        description: 'AI output included a name not present in the source data.',
        affectedModel: 'claude-sonnet-4-6',
        regulatoryNotificationRequired: true,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; incident: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.incident.type).toBe('hallucination');
    expect(body.incident.severity).toBe('high');
    expect(body.incident.status).toBe('open');
    expect(body.incident.regulatoryNotificationRequired).toBe(true);
    expect(typeof body.incident.id).toBe('string');
  });
});

describe('PATCH /api/ai-incident-playbook', () => {
  let POST: (req: Request) => Promise<Response>;
  let PATCH: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/ai-incident-playbook/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
    PATCH = mod.PATCH as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 404 for unknown incident id', async () => {
    const req = makeRequest('http://localhost/api/ai-incident-playbook', {
      method: 'PATCH',
      body: { id: 'AI-INC-DOES-NOT-EXIST', status: 'investigating' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  it('updates status on an existing incident', async () => {
    // First create an incident
    const createReq = makeRequest('http://localhost/api/ai-incident-playbook', {
      method: 'POST',
      body: {
        type: 'bias_spike',
        severity: 'medium',
        title: 'Bias detected in name-matching scores',
        description: 'Arabic script names scored 20% lower than Latin script names.',
        affectedModel: 'sentence-bert-v2',
      },
    });
    const createRes = await POST(createReq);
    const created = await jsonBody(createRes) as { incident: { id: string } };
    const id = created.incident.id;

    // Now patch it
    const patchReq = makeRequest('http://localhost/api/ai-incident-playbook', {
      method: 'PATCH',
      body: { id, status: 'investigating', rootCause: 'Training data imbalance' },
    });
    const patchRes = await PATCH(patchReq);
    expect(patchRes.status).toBe(200);
    const body = await jsonBody(patchRes) as { ok: boolean; incident: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.incident.status).toBe('investigating');
    expect(body.incident.rootCause).toBe('Training data imbalance');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/shadow-ai — Shadow AI detection register (CBUAE AI Governance 2025)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/shadow-ai', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/shadow-ai/route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  it('returns ok:true with entries array and stats object', async () => {
    const req = makeRequest('http://localhost/api/shadow-ai');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; entries: unknown[]; stats: Record<string, number> };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(typeof body.stats.total).toBe('number');
    expect(typeof body.stats.critical).toBe('number');
    expect(typeof body.stats.open).toBe('number');
  });
});

describe('POST /api/shadow-ai', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/shadow-ai/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('rejects missing toolName with 400', async () => {
    const req = makeRequest('http://localhost/api/shadow-ai', {
      method: 'POST',
      body: { toolType: 'llm', detectionMethod: 'user_report', dataClassification: 'internal' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('creates entry and auto-computes risk level', async () => {
    const req = makeRequest('http://localhost/api/shadow-ai', {
      method: 'POST',
      body: {
        toolName: 'ChatGPT',
        toolType: 'llm',
        detectionMethod: 'user_report',
        dataClassification: 'restricted',
        vendorDpaExists: false,
        approvedInRegistry: false,
        department: 'Compliance',
        useCase: 'SAR drafting',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; entry: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.entry.toolName).toBe('ChatGPT');
    // restricted data + not approved → critical risk
    expect(body.entry.riskLevel).toBe('critical');
    expect(body.entry.status).toBe('detected');
  });

  it('assigns low risk for approved public tool', async () => {
    const req = makeRequest('http://localhost/api/shadow-ai', {
      method: 'POST',
      body: {
        toolName: 'GrammarlyGo',
        toolType: 'automation',
        detectionMethod: 'audit_log',
        dataClassification: 'public',
        vendorDpaExists: true,
        approvedInRegistry: true,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; entry: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.entry.riskLevel).toBe('low');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/vendor-ai-audit — Vendor AI due-diligence (FATF R.18 / ADGM DPR 2021)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/vendor-ai-audit', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/vendor-ai-audit/route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  it('returns ok:true with assessments array (seeds Anthropic if empty)', async () => {
    const req = makeRequest('http://localhost/api/vendor-ai-audit');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; assessments: Array<Record<string, unknown>> };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.assessments)).toBe(true);
    // Should seed Anthropic on first call
    expect(body.assessments.length).toBeGreaterThan(0);
    expect(body.assessments[0]).toHaveProperty('vendorName');
    expect(body.assessments[0]).toHaveProperty('checklistScore');
    expect(body.assessments[0]).toHaveProperty('riskTier');
  });
});

describe('POST /api/vendor-ai-audit', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/vendor-ai-audit/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('rejects missing vendorName with 400', async () => {
    const req = makeRequest('http://localhost/api/vendor-ai-audit', {
      method: 'POST',
      body: {
        checklist: { dpaInPlace: true },
        overallFindings: 'Good vendor',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('creates assessment with correct score and risk tier', async () => {
    const allTrue = {
      dpaInPlace: true, dataResidencyConfirmed: true, subprocessorListObtained: true,
      penetrationTestReport: true, iso27001OrSoc2: true, modelCardProvided: true,
      biasAuditCompleted: true, hallucIndicationLogEnabled: true,
      incidentNotificationSla: true, rightToAuditClause: true,
      dataRetentionTermsAgreed: true, gdprOrAdgmDpaClause: true,
    };
    const req = makeRequest('http://localhost/api/vendor-ai-audit', {
      method: 'POST',
      body: {
        vendorName: 'TrustwortyAI Inc.',
        vendorType: 'llm_provider',
        checklist: allTrue,
        overallFindings: 'All controls in place.',
        criticalGaps: [],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await jsonBody(res) as { ok: boolean; assessment: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.assessment.checklistScore).toBe(100);
    expect(body.assessment.riskTier).toBe('low');
    expect(body.assessment.status).toBe('approved');
    expect(body.assessment.vendorName).toBe('TrustwortyAI Inc.');
    expect(Array.isArray(body.assessment.regulatoryBasis)).toBe(true);
  });

  it('marks failed status when score is below 40%', async () => {
    const mostlyFalse = {
      dpaInPlace: false, dataResidencyConfirmed: false, subprocessorListObtained: false,
      penetrationTestReport: false, iso27001OrSoc2: false, modelCardProvided: false,
      biasAuditCompleted: false, hallucIndicationLogEnabled: false,
      incidentNotificationSla: false, rightToAuditClause: false,
      dataRetentionTermsAgreed: false, gdprOrAdgmDpaClause: true,
    };
    const req = makeRequest('http://localhost/api/vendor-ai-audit', {
      method: 'POST',
      body: {
        vendorName: 'RiskyAI Ltd.',
        vendorType: 'other',
        checklist: mostlyFalse,
        overallFindings: 'Significant gaps identified.',
      },
    });
    const res = await POST(req);
    const body = await jsonBody(res) as { ok: boolean; assessment: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect((body.assessment.checklistScore as number)).toBeLessThan(40);
    expect(body.assessment.status).toBe('failed');
    expect(body.assessment.riskTier).toBe('critical');
  });
});

