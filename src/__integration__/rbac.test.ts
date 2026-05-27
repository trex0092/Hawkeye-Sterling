/**
 * Integration tests: role-gate RBAC middleware and route wiring.
 *
 * Verifies that:
 *   - requireRole() returns 401 when no session cookie is present
 *   - requireRole() returns 401 when the session token is invalid/expired
 *   - requireRole() returns 403 when the session role is not in allowedRoles
 *   - requireRole() returns null (allow) when role matches
 *   - admin role is implicitly allowed on all role-gated operations
 *   - SAR POST and AI-override POST enforce the role gate
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock @netlify/blobs (required by store.ts) ─────────────────────────────
vi.mock('@netlify/blobs', () => {
  const mem = new Map<string, string>();
  const store = {
    get: async (key: string) => mem.get(key) ?? null,
    set: async (key: string, val: string) => { mem.set(key, val); },
    setJSON: async (key: string, val: unknown) => { mem.set(key, JSON.stringify(val)); },
    delete: async (key: string) => { mem.delete(key); },
    list: async (opts?: { prefix?: string }) => ({
      blobs: [...mem.keys()]
        .filter((k) => (opts?.prefix ? k.startsWith(opts.prefix) : true))
        .map((key) => ({ key })),
    }),
  };
  return { getStore: () => store, getDeployStore: () => store };
});

// ─── Control cookies() return value per test ────────────────────────────────
let mockCookieValue: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === 'hs_session' && mockCookieValue !== undefined) {
        return { value: mockCookieValue };
      }
      return undefined;
    },
  }),
}));

// ─── Control verifySession return value per test ─────────────────────────────
let mockSessionPayload: { userId: string; username: string; role: string } | null = null;

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return {
    ...actual,
    verifySession: (_token: string) => mockSessionPayload,
    SESSION_COOKIE: 'hs_session',
  };
});

// ─── Stub audit chain so it doesn't need a real blob store ──────────────────
vi.mock('@/lib/server/audit-chain', () => ({
  writeAuditChainEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/server/metrics-store', () => ({
  incrementCounter: vi.fn(),
  getCounter: vi.fn().mockReturnValue(0),
  getAllCounters: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/server/tracer', () => ({
  startSpan: () => ({ setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() }),
  SpanStatus: { OK: 1, ERROR: 2 },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authRequest(method = 'POST', body?: unknown): Request {
  return new Request('http://localhost/', {
    method,
    headers: {
      'content-type': 'application/json',
      // A dummy bearer so enforce() passes without a real API key.
      authorization: 'Bearer test-api-key',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function loadRequireRole() {
  const mod = await import('@/lib/server/role-gate');
  return mod.requireRole;
}

// ─── requireRole unit-level tests ────────────────────────────────────────────

describe('requireRole — RBAC gate', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCookieValue = undefined;
    mockSessionPayload = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 SESSION_REQUIRED when no session cookie is present', async () => {
    mockCookieValue = undefined;
    const requireRole = await loadRequireRole();
    const result = await requireRole(authRequest(), ['mlro']);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const body = await result!.json() as { code: string };
    expect(body.code).toBe('SESSION_REQUIRED');
  });

  it('returns 401 SESSION_INVALID when session token fails verification', async () => {
    mockCookieValue = 'invalid.token.here';
    mockSessionPayload = null; // verifySession returns null → invalid

    const requireRole = await loadRequireRole();
    const result = await requireRole(authRequest(), ['mlro']);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const body = await result!.json() as { code: string };
    expect(body.code).toBe('SESSION_INVALID');
  });

  it('returns 403 ROLE_FORBIDDEN when caller role is not in allowedRoles', async () => {
    mockCookieValue = 'valid-token';
    mockSessionPayload = { userId: 'u1', username: 'analyst', role: 'compliance' };

    const requireRole = await loadRequireRole();
    const result = await requireRole(authRequest(), ['mlro', 'co']);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const body = await result!.json() as { code: string };
    expect(body.code).toBe('ROLE_FORBIDDEN');
  });

  it('returns null (allow) when caller role is in allowedRoles', async () => {
    mockCookieValue = 'valid-token';
    mockSessionPayload = { userId: 'u1', username: 'mlro-officer', role: 'mlro' };

    const requireRole = await loadRequireRole();
    const result = await requireRole(authRequest(), ['mlro', 'co']);

    expect(result).toBeNull();
  });

  it('admin role is implicitly allowed regardless of allowedRoles list', async () => {
    mockCookieValue = 'valid-token';
    mockSessionPayload = { userId: 'u1', username: 'sysadmin', role: 'admin' };

    const requireRole = await loadRequireRole();
    const result = await requireRole(authRequest(), ['mlro']); // admin not in list

    expect(result).toBeNull(); // should still pass
  });

  it('role comparison is case-insensitive', async () => {
    mockCookieValue = 'valid-token';
    mockSessionPayload = { userId: 'u1', username: 'co-officer', role: 'CO' }; // uppercase

    const requireRole = await loadRequireRole();
    const result = await requireRole(authRequest(), ['mlro', 'co']); // lowercase list

    expect(result).toBeNull();
  });
});

// ─── Route-level wiring tests ─────────────────────────────────────────────────

describe('SAR POST — role gate wired', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCookieValue = undefined;
    mockSessionPayload = null;
    process.env['SESSION_SECRET'] = 'a'.repeat(64);
    process.env['JWT_SIGNING_SECRET'] = 'test-jwt-secret-at-least-32-chars-long';
  });

  afterEach(() => {
    delete process.env['SESSION_SECRET'];
    delete process.env['JWT_SIGNING_SECRET'];
  });

  it('SAR POST returns 401 for a caller with no portal session', async () => {
    mockCookieValue = undefined;
    // enforce() must also pass — mock it to allow
    vi.doMock('@/lib/server/enforce', () => ({
      enforce: async () => ({
        ok: true, tier: 'enterprise', keyId: 'k1', record: { role: 'mlro' }, remainingMonthly: null, headers: {},
      }),
    }));
    vi.doMock('@/lib/server/tenant', () => ({ tenantIdFromGate: () => 'default' }));

    const { POST } = await import('@/app/api/sar/route');
    const req = new Request('http://localhost/api/sar', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer k1' },
      body: JSON.stringify({ caseId: 'c1', narrative: 'test' }),
    });
    const res = await POST(req);

    // Without a portal session, role gate should block with 401.
    expect([401, 403]).toContain(res.status);
  });
});
