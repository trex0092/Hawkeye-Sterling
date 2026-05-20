/**
 * Integration test for the /api/whitelist POST handler (G-04).
 *
 * Covers the contract the HitTriagePanel's "Whitelist subject" button relies
 * on:
 *   · happy path: required fields → 200, returns the persisted entry
 *   · missing subjectName → 400
 *   · missing reason → 400 (audit-trail justification is mandatory)
 *   · invalid approverRole → 400
 *   · custom id with disallowed chars → 400
 *
 * The withGuard helper is mocked to allow with a fixed tenantId. The
 * Blobs store is replaced by an in-memory map so assertions can read
 * back whatever the handler persisted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@netlify/blobs', () => {
  const mem = new Map<string, string>();
  const store = {
    get: async (key: string) => mem.get(key) ?? null,
    set: async (key: string, value: string) => { mem.set(key, value); },
    setJSON: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
    delete: async (key: string) => { mem.delete(key); },
    list: async () => ({ blobs: [...mem.keys()].map((key) => ({ key })) }),
  };
  return { getStore: () => store, getDeployStore: () => store };
});

vi.mock('@/lib/server/guard', () => ({
  withGuard: (handler: (_req: Request, _ctx: { tenantId: string }) => Promise<Response>) =>
    async (req: Request) => handler(req, { tenantId: 'test-tenant' }),
}));

beforeEach(() => {
  process.env['SESSION_SECRET'] = 'a'.repeat(64);
});

async function loadRoute() {
  vi.resetModules();
  const mod = await import('@/app/api/whitelist/route');
  return mod;
}

function makePost(body: unknown): Request {
  return new Request('http://localhost/api/whitelist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/whitelist', () => {
  it('happy path: persists with subjectName + reason, returns the entry', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makePost({
      subjectName: 'Acme Trading LLC',
      reason: 'Different jurisdiction confirmed (UAE vs IR sanctioned entry).',
      approverRole: 'mlro',
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; entry?: { id: string; subjectName: string; reason: string; approverRole: string; normalisedName: string; tenantId: string } };
    expect(body.ok).toBe(true);
    expect(body.entry?.subjectName).toBe('Acme Trading LLC');
    expect(body.entry?.normalisedName).toBe('acme trading llc');
    expect(body.entry?.approverRole).toBe('mlro');
    expect(body.entry?.tenantId).toBe('test-tenant');
    expect(body.entry?.id).toMatch(/^wl-/);
  });

  it('missing subjectName → 400', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makePost({ reason: 'whatever' }));
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.error).toMatch(/subjectName required/i);
  });

  it('missing reason → 400 (audit-trail requirement)', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makePost({ subjectName: 'X' }));
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.error).toMatch(/reason required/i);
  });

  it('invalid approverRole → 400', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makePost({
      subjectName: 'Acme',
      reason: 'because',
      approverRole: 'janitor',
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.error).toMatch(/approverRole must be one of/i);
  });

  it('non-JSON body → 400', async () => {
    const { POST } = await loadRoute();
    const req = new Request('http://localhost/api/whitelist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('caller-provided id with forbidden chars → 400', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makePost({
      subjectName: 'Acme',
      reason: 'because',
      id: 'has space',
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.error).toMatch(/id must match/i);
  });

  it('lowercases uppercase jurisdiction', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makePost({
      subjectName: 'Acme',
      reason: 'because',
      jurisdiction: 'ae',
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { entry: { jurisdiction: string } };
    expect(body.entry.jurisdiction).toBe('AE');
  });

  it('defaults approverRole to "co" when omitted', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makePost({ subjectName: 'X', reason: 'y' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { entry: { approverRole: string } };
    expect(body.entry.approverRole).toBe('co');
  });
});
