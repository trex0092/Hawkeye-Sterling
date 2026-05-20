import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  validateBody,
  validatePositiveInt,
  QuickScreenRequestSchema,
  FourEyesEnqueueSchema,
  FourEyesDecisionSchema,
} from '../validate';

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://test.local/api/probe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const TestSchema = z.object({ name: z.string().min(1).max(10) }).strict();

describe('validateBody', () => {
  it('returns ok=true and parsed value on a valid body', async () => {
    const r = await validateBody(makeReq({ name: 'ok' }), TestSchema, 'rid-1');
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.name).toBe('ok');
  });

  it('rejects malformed JSON with a 400 + uniform error envelope', async () => {
    const req = new Request('https://t.local/api/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not valid json',
    });
    const r = await validateBody(req, TestSchema, 'rid-2');
    if (r.ok) throw new Error('expected fail');
    expect(r.response.status).toBe(400);
    const body = await r.response.json();
    expect(body).toMatchObject({
      ok: false,
      status: 400,
      error: 'invalid_json',
      requestId: 'rid-2',
    });
  });

  it('rejects schema violations with faults[] populated', async () => {
    const r = await validateBody(makeReq({ name: 'this name is way too long' }), TestSchema, 'rid-3');
    if (r.ok) throw new Error('expected fail');
    expect(r.response.status).toBe(400);
    const body = await r.response.json();
    expect(body.error).toBe('invalid_request_body');
    expect(body.faults).toBeInstanceOf(Array);
    expect(body.faults.length).toBeGreaterThan(0);
    expect(body.faults[0]).toHaveProperty('path');
    expect(body.faults[0]).toHaveProperty('message');
  });

  it('rejects strict-mode unknown keys', async () => {
    const r = await validateBody(
      makeReq({ name: 'ok', extra: 'forbidden' }),
      TestSchema,
      'rid-4',
    );
    expect(r.ok).toBe(false);
  });

  it('rejects oversize bodies based on content-length', async () => {
    const r = await validateBody(
      makeReq({ name: 'ok' }, { 'content-length': '999999999' }),
      TestSchema,
      'rid-5',
    );
    if (r.ok) throw new Error('expected fail');
    expect(r.response.status).toBe(413);
    const body = await r.response.json();
    expect(body.error).toBe('payload_too_large');
  });

  it('every error response carries x-request-id header', async () => {
    const r = await validateBody(makeReq({ name: '' }), TestSchema, 'rid-6');
    if (r.ok) throw new Error('expected fail');
    expect(r.response.headers.get('x-request-id')).toBe('rid-6');
  });
});

describe('QuickScreenRequestSchema', () => {
  it('accepts a minimal valid body', () => {
    const r = QuickScreenRequestSchema.safeParse({
      subject: { name: 'John Smith' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects subject with no name', () => {
    const r = QuickScreenRequestSchema.safeParse({
      subject: { name: '' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects extra unknown subject keys (strict mode)', () => {
    const r = QuickScreenRequestSchema.safeParse({
      subject: { name: 'X', maliciousField: 'attack' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects > 5000 candidates', () => {
    const candidates = Array.from({ length: 5_001 }, (_, i) => ({
      listId: 'OFAC-SDN',
      listRef: `OFAC-${i}`,
      name: 'X',
    }));
    const r = QuickScreenRequestSchema.safeParse({
      subject: { name: 'Y' },
      candidates,
    });
    expect(r.success).toBe(false);
  });

  it('accepts enrichment hints', () => {
    const r = QuickScreenRequestSchema.safeParse({
      subject: { name: 'X' },
      enrichmentHints: { email: 'a@example.com', phone: '+97150000000' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects malformed email in enrichment hints', () => {
    const r = QuickScreenRequestSchema.safeParse({
      subject: { name: 'X' },
      enrichmentHints: { email: 'not-an-email' },
    });
    expect(r.success).toBe(false);
  });
});

describe('FourEyesEnqueueSchema', () => {
  it('accepts a minimal valid item', () => {
    const r = FourEyesEnqueueSchema.safeParse({
      subjectId: 'subject-123',
      subjectName: 'Test Subject',
      action: 'str',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid action', () => {
    const r = FourEyesEnqueueSchema.safeParse({
      subjectId: 's',
      subjectName: 'n',
      action: 'arbitrary',
    });
    expect(r.success).toBe(false);
  });

  it('rejects subjectId with invalid chars', () => {
    const r = FourEyesEnqueueSchema.safeParse({
      subjectId: 'has spaces',
      subjectName: 'n',
      action: 'str',
    });
    expect(r.success).toBe(false);
  });
});

describe('FourEyesDecisionSchema', () => {
  it('accepts approve', () => {
    const r = FourEyesDecisionSchema.safeParse({
      decision: 'approve',
      operator: 'operator-x',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown decision', () => {
    const r = FourEyesDecisionSchema.safeParse({
      decision: 'maybe',
      operator: 'operator-x',
    });
    expect(r.success).toBe(false);
  });

  it('requires operator to be present', () => {
    const r = FourEyesDecisionSchema.safeParse({
      decision: 'approve',
    });
    expect(r.success).toBe(false);
  });
});

describe('validatePositiveInt', () => {
  it('returns null for non-number non-string types (covers the else branch)', () => {
    expect(validatePositiveInt(null)).toBeNull();
    expect(validatePositiveInt(true)).toBeNull();
    expect(validatePositiveInt({})).toBeNull();
    expect(validatePositiveInt([])).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(validatePositiveInt('')).toBeNull();
    expect(validatePositiveInt('   ')).toBeNull();
  });

  it('parses a valid positive integer string', () => {
    expect(validatePositiveInt('5')).toBe(5);
  });

  it('returns null for a non-integer number string', () => {
    expect(validatePositiveInt('1.5')).toBeNull();
  });

  it('returns null when exceeding max', () => {
    expect(validatePositiveInt(10, { max: 5 })).toBeNull();
  });

  it('accepts a numeric value directly', () => {
    expect(validatePositiveInt(3)).toBe(3);
  });

  it('returns null for zero or negative numbers', () => {
    expect(validatePositiveInt(0)).toBeNull();
    expect(validatePositiveInt(-1)).toBeNull();
  });
});
