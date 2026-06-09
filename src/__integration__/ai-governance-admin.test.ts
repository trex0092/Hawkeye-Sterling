/**
 * Integration tests: admin-only guard on AI governance endpoints.
 *
 * These routes return 403 for non-admin API keys even when enforce() passes.
 * Routes tested:
 *   GET /api/ai-governance/attestation-status  (portal_admin or cron_internal)
 *   GET /api/ai-governance/risk-register       (portal_admin or cron_internal)
 *   GET /api/ai-governance/prompts             (portal_admin only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Silence Netlify Blobs in test environment ───────────────────────────────
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
  return { getStore: () => store, getDeployStore: () => store };
});

// ─── Controllable enforce mock ────────────────────────────────────────────────
const mockEnforce = vi.fn();
vi.mock('@/lib/server/enforce', () => ({
  enforce: mockEnforce,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGate(keyId: string) {
  return {
    ok: true,
    keyId,
    tier: { id: 'enterprise', rateLimitPerSecond: 100, rateLimitPerMinute: 6000 },
    record: null,
    remainingMonthly: null,
    headers: {},
    response: null,
  };
}

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: 'GET' });
}

// ─── attestation-status ───────────────────────────────────────────────────────

describe("GET /api/ai-governance/attestation-status", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/app/api/ai-governance/attestation-status/route');
    GET = mod.GET;
  });

  it("returns 403 for a standard enterprise key", async () => {
    mockEnforce.mockResolvedValueOnce(makeGate('enterprise-key-001'));
    const res = await GET(makeRequest('/api/ai-governance/attestation-status'));
    expect(res.status).toBe(403);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/admin/i);
  });

  it("returns 403 for an mlro key", async () => {
    mockEnforce.mockResolvedValueOnce(makeGate('mlro-user'));
    const res = await GET(makeRequest('/api/ai-governance/attestation-status'));
    expect(res.status).toBe(403);
  });

  it("returns 200 or 503 for portal_admin key", async () => {
    mockEnforce.mockResolvedValueOnce(makeGate('portal_admin'));
    const res = await GET(makeRequest('/api/ai-governance/attestation-status'));
    expect([200, 503]).toContain(res.status);
    const body = await res.json() as { generatedAt: string };
    expect(body.generatedAt).toBeTruthy();
  });

  it("returns 200 or 503 for cron_internal key", async () => {
    mockEnforce.mockResolvedValueOnce(makeGate('cron_internal'));
    const res = await GET(makeRequest('/api/ai-governance/attestation-status'));
    expect([200, 503]).toContain(res.status);
  });

  it("propagates 401 when enforce rejects", async () => {
    mockEnforce.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 }),
    });
    const res = await GET(makeRequest('/api/ai-governance/attestation-status'));
    expect(res.status).toBe(401);
  });
});

// ─── risk-register ────────────────────────────────────────────────────────────

describe("GET /api/ai-governance/risk-register", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/app/api/ai-governance/risk-register/route');
    GET = mod.GET;
  });

  it("returns 403 for a non-admin key", async () => {
    mockEnforce.mockResolvedValueOnce(makeGate('analyst-key'));
    const res = await GET(makeRequest('/api/ai-governance/risk-register'));
    expect(res.status).toBe(403);
  });

  it("returns 200 for portal_admin key with entries array", async () => {
    mockEnforce.mockResolvedValueOnce(makeGate('portal_admin'));
    const res = await GET(makeRequest('/api/ai-governance/risk-register'));
    expect([200, 503]).toContain(res.status);
    const body = await res.json() as { entries: unknown[]; totalModels: number };
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.totalModels).toBeGreaterThan(0);
  });

  it("returns 200 for cron_internal key", async () => {
    mockEnforce.mockResolvedValueOnce(makeGate('cron_internal'));
    const res = await GET(makeRequest('/api/ai-governance/risk-register'));
    expect(res.status).toBe(200);
  });
});

// ─── prompts ──────────────────────────────────────────────────────────────────

describe("GET /api/ai-governance/prompts", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/app/api/ai-governance/prompts/route');
    GET = mod.GET;
  });

  it("returns 403 for a standard key", async () => {
    mockEnforce.mockResolvedValueOnce(makeGate('standard-api-key'));
    const res = await GET(makeRequest('/api/ai-governance/prompts'));
    expect(res.status).toBe(403);
  });

  it("returns 403 for cron_internal (prompts are portal_admin only)", async () => {
    mockEnforce.mockResolvedValueOnce(makeGate('cron_internal'));
    const res = await GET(makeRequest('/api/ai-governance/prompts'));
    expect(res.status).toBe(403);
  });

  it("returns 200 for portal_admin key", async () => {
    mockEnforce.mockResolvedValueOnce(makeGate('portal_admin'));
    const res = await GET(makeRequest('/api/ai-governance/prompts'));
    expect(res.status).toBe(200);
    const body = await res.json() as { prompts: unknown };
    expect(body.prompts).toBeDefined();
  });
});
