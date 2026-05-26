import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, logRequest, logError, logAudit } from '../logger';

describe('logger — JSON output schema', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('emits a single valid JSON line per call', () => {
    log({ level: 'info', route: '/api/test', event: 'test_event', detail: 'ok' });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const line = infoSpy.mock.calls[0]?.[0] as string;
    expect(() => JSON.parse(line)).not.toThrow();
  });

  it('output shape matches log aggregator schema: level, route, event, detail, _msg', () => {
    log({
      level: 'info',
      route: '/api/screening/run',
      event: 'screening_complete',
      detail: 'hit_found',
      status: 200,
      requestId: 'req-123',
    });
    const parsed = JSON.parse(infoSpy.mock.calls[0]?.[0] as string);
    expect(parsed).toMatchObject({
      level: 'info',
      route: '/api/screening/run',
      event: 'screening_complete',
      detail: 'hit_found',
      status: 200,
      requestId: 'req-123',
    });
    expect(typeof parsed._msg).toBe('string');
    expect(parsed._msg).toContain('[hawkeye]');
    expect(parsed._msg).toContain('/api/screening/run');
  });

  it('_msg includes latencyMs and status when provided', () => {
    log({ level: 'info', route: '/api/test', event: 'req', latencyMs: 42, status: 200 });
    const parsed = JSON.parse(infoSpy.mock.calls[0]?.[0] as string);
    expect(parsed._msg).toContain('latencyMs=42');
    expect(parsed._msg).toContain('status=200');
  });

  it('redacts keys matching secret|token|key|password|auth pattern', () => {
    log({
      level: 'info',
      route: '/api/test',
      apiKey: 'sk-real-secret-value',
      authToken: 'bearer-abc123',
      password: 'hunter2',
    });
    const parsed = JSON.parse(infoSpy.mock.calls[0]?.[0] as string);
    expect(parsed.apiKey).toBe('[REDACTED]');
    expect(parsed.authToken).toBe('[REDACTED]');
    expect(parsed.password).toBe('[REDACTED]');
  });

  it('routes warn level to console.warn', () => {
    log({ level: 'warn', route: '/api/test', event: 'degraded' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('routes error level to console.error', () => {
    log({ level: 'error', route: '/api/test', event: 'crash' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('logRequest emits info for 2xx, warn for 4xx, error for 5xx', () => {
    logRequest('/api/test', 'rid-200', 200, 10);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    infoSpy.mockClear();

    logRequest('/api/test', 'rid-404', 404, 5);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockClear();

    logRequest('/api/test', 'rid-500', 500, 3);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('logError emits JSON with event=unhandled_error and detail from Error', () => {
    logError('/api/test', new Error('boom'));
    const parsed = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
    expect(parsed.event).toBe('unhandled_error');
    expect(parsed.detail).toBe('boom');
    expect(parsed.level).toBe('error');
  });

  it('logAudit emits info with actor and event fields', () => {
    logAudit('/api/screening/run', 'screening_hit', 'api-key-001', { hitCount: 3 });
    const parsed = JSON.parse(infoSpy.mock.calls[0]?.[0] as string);
    expect(parsed.actor).toBe('api-key-001');
    expect(parsed.event).toBe('screening_hit');
    expect(parsed.hitCount).toBe(3);
  });
});
