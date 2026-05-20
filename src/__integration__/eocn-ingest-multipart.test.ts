/**
 * Regression test for the EOCN manual-upload 415 bug.
 *
 * Before this fix, /api/admin/eocn-ingest called `enforce(req)` with default
 * options, which forces `Content-Type: application/json` for any POST that
 * carries a body. Manual XLSX/PDF uploads use multipart/form-data, so the
 * auth gate rejected every legitimate upload with 415 BEFORE the route could
 * read the file. The /eocn UI page surfaced this as "✗ Import failed —
 * Content-Type: application/json required for POST/PUT/PATCH requests with a body".
 *
 * The fix is one option: `enforce(req, { requireJsonBody: false })`.
 *
 * This test exercises the REAL enforce() (no vi.mock — distinct from the
 * shared mock in api-routes.test.ts) and confirms that an anonymous
 * multipart upload now falls through the content-type guard and reaches the
 * auth check. The expected response is 401 ("API key required") — NOT 415.
 *
 * If anyone regresses the fix by dropping `requireJsonBody: false`, this
 * test flips back to 415 and fails loudly.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// store.ts touches @netlify/blobs at import time; provide a no-op in-memory
// shim so the route module loads in a plain Node environment.
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

beforeAll(() => {
  // The real enforce() needs SESSION_SECRET to construct the cron-token
  // bypass branch. Anything sufficiently long satisfies it.
  process.env['SESSION_SECRET'] = 'a'.repeat(64);
  // Make sure ADMIN_TOKEN is unset so portal_admin bypass doesn't fire
  // (we want to exercise the anonymous-rejection path).
  delete process.env['ADMIN_TOKEN'];
  // Make sure SANCTIONS_CRON_TOKEN is unset so cron bypass doesn't fire.
  delete process.env['SANCTIONS_CRON_TOKEN'];
});

describe('POST /api/admin/eocn-ingest content-type guard', () => {
  it('anonymous multipart upload is rejected with 401, not 415', async () => {
    // Dynamic import so the vi.mock above is applied before the module loads.
    const mod = await import('@/app/api/admin/eocn-ingest/route');
    const POST = mod.POST;

    // Build a real multipart Request — file content is intentionally empty
    // because we only care about the content-type guard, not the parser.
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array([0])], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'eocn.xlsx');
    fd.append('listId', 'uae_eocn');

    const req = new Request('http://localhost/api/admin/eocn-ingest', {
      method: 'POST',
      body: fd,
    });

    const res = await POST(req);

    // Critical assertion: the auth gate (401) must fire, NOT the content-type
    // gate (415). 415 means the regression is back.
    expect(res.status).not.toBe(415);
    expect(res.status).toBe(401);

    const body = await res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/API key required/i);
  });
});
