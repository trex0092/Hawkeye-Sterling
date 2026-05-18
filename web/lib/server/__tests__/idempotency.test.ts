import { describe, expect, it, beforeEach } from 'vitest';
import {
  getIdempotencyKey,
  getIdempotent,
  storeIdempotent,
  IDEMPOTENCY_HEADER,
} from '../idempotency';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('https://test.local/api/batch-screen', { headers });
}

describe('idempotency-key extraction', () => {
  it('returns null when no header is present', () => {
    expect(getIdempotencyKey(makeReq())).toBeNull();
  });

  it('returns the key when a valid header is present', () => {
    const r = makeReq({ [IDEMPOTENCY_HEADER]: 'client-abc-123' });
    expect(getIdempotencyKey(r)).toBe('client-abc-123');
  });

  it('rejects empty values', () => {
    const r = makeReq({ [IDEMPOTENCY_HEADER]: '' });
    expect(getIdempotencyKey(r)).toBeNull();
  });

  it('rejects oversized values (> 128 chars)', () => {
    const r = makeReq({ [IDEMPOTENCY_HEADER]: 'x'.repeat(200) });
    expect(getIdempotencyKey(r)).toBeNull();
  });

  it('rejects header values containing spaces', () => {
    const r = makeReq({ [IDEMPOTENCY_HEADER]: 'a b c' });
    expect(getIdempotencyKey(r)).toBeNull();
  });
});

describe('idempotency cache (in-memory fallback path)', () => {
  beforeEach(async () => {
    // No way to flush blobs from a test; use unique keys per case to
    // avoid cross-pollination.
  });

  it('returns null on cache miss', async () => {
    const v = await getIdempotent('miss-' + Math.random());
    expect(v).toBeNull();
  });

  it('returns the stored response on cache hit', async () => {
    const key = 'hit-' + Math.random();
    await storeIdempotent(key, {
      at: '2026-05-18T00:00:00.000Z',
      status: 200,
      body: '{"ok":true,"summary":{}}',
      originalRequestId: 'rid-orig',
    });
    const v = await getIdempotent(key);
    expect(v).not.toBeNull();
    expect(v?.body).toBe('{"ok":true,"summary":{}}');
    expect(v?.originalRequestId).toBe('rid-orig');
    expect(v?.status).toBe(200);
  });

  it('stored responses persist within the cache window', async () => {
    const key = 'persist-' + Math.random();
    await storeIdempotent(key, {
      at: '2026-05-18T00:00:00.000Z',
      status: 200,
      body: 'cached',
      originalRequestId: 'rid-a',
    });
    const a = await getIdempotent(key);
    const b = await getIdempotent(key);
    expect(a?.body).toBe('cached');
    expect(b?.body).toBe('cached');
  });

  it('distinct keys cache independently', async () => {
    const k1 = 'k1-' + Math.random();
    const k2 = 'k2-' + Math.random();
    await storeIdempotent(k1, {
      at: '2026-05-18T00:00:00.000Z',
      status: 200,
      body: 'A',
      originalRequestId: 'rid-1',
    });
    await storeIdempotent(k2, {
      at: '2026-05-18T00:00:00.000Z',
      status: 200,
      body: 'B',
      originalRequestId: 'rid-2',
    });
    const a = await getIdempotent(k1);
    const b = await getIdempotent(k2);
    expect(a?.body).toBe('A');
    expect(b?.body).toBe('B');
  });
});
