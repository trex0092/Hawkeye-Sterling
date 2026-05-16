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
