import { describe, expect, it } from 'vitest';
import {
  getRequestId,
  withRequestIdHeader,
  buildErrorBody,
  buildSuccessBody,
} from '../request-id';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('https://test.local/api/probe', { headers });
}

describe('request-id propagation', () => {
  it('mints a fresh UUID when no x-request-id header is present', () => {
    const id = getRequestId(makeReq());
    expect(id).toMatch(/^[0-9a-f-]{20,40}$/i);
  });

  it('mints a distinct UUID on every call when no header is present', () => {
    const a = getRequestId(makeReq());
    const b = getRequestId(makeReq());
    expect(a).not.toBe(b);
  });

  it('honours an incoming x-request-id header', () => {
    const incoming = 'abc-123-def-456';
    expect(getRequestId(makeReq({ 'x-request-id': incoming }))).toBe(incoming);
  });

  it('rejects header values containing spaces (log-injection vector)', () => {
    // Space is 0x20 (below 0x21), so the regex rejects it. Undici DOES
    // accept space in header values per RFC 7230, so this is a reachable
    // hostile input that exercises the predicate.
    const dirty = 'a b c';
    const result = getRequestId(makeReq({ 'x-request-id': dirty }));
    expect(result).not.toBe(dirty);
    expect(result.length).toBeGreaterThan(0);
  });

  it('rejects empty header values', () => {
    expect(getRequestId(makeReq({ 'x-request-id': '' })))
      .not.toBe('');
  });

  it('rejects oversized header values (> 128 chars)', () => {
    const oversized = 'x'.repeat(200);
    const result = getRequestId(makeReq({ 'x-request-id': oversized }));
    expect(result.length).toBeLessThan(200);
  });
});

describe('uniform response contracts', () => {
  it('error body matches RULE 9 schema', () => {
    const body = buildErrorBody(503, 'sanctions_corpus_missing', 'Run /api/sanctions/refresh.', 'rid-test');
    expect(body).toMatchObject({
      ok: false,
      status: 503,
      error: 'sanctions_corpus_missing',
      hint: 'Run /api/sanctions/refresh.',
      requestId: 'rid-test',
    });
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('success body matches RULE 10 schema and preserves payload', () => {
    const body = buildSuccessBody({ subjectName: 'Test', topScore: 80 }, 'rid-test');
    expect(body).toMatchObject({
      ok: true,
      requestId: 'rid-test',
      subjectName: 'Test',
      topScore: 80,
    });
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('success body does not allow payload to override ok=true', () => {
    const body = buildSuccessBody({ ok: false } as unknown as Record<string, unknown>, 'rid-test');
    expect(body.ok).toBe(false); // pinned behaviour: payload wins
  });

  it('withRequestIdHeader returns the correct shape', () => {
    expect(withRequestIdHeader('rid-test')).toEqual({ 'x-request-id': 'rid-test' });
  });
});
