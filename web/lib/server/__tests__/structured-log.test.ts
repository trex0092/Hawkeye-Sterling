import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  logError,
  logWarn,
  logInfo,
  logErrorFromException,
} from '../structured-log';

describe('structured-log', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('emits a single JSON line per call (error)', () => {
    logError({ module: 'test', operation: 'op', outcome: 'fail', requestId: 'rid-1' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      level: 'error',
      module: 'test',
      operation: 'op',
      outcome: 'fail',
      requestId: 'rid-1',
    });
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('warn level routes to console.warn', () => {
    logWarn({ module: 'm', operation: 'o', outcome: 'degraded' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('info level routes to console.info', () => {
    logInfo({ module: 'm', operation: 'o', outcome: 'ok' });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('passes through additional structured fields via extras', () => {
    logInfo({
      module: 'm',
      operation: 'o',
      outcome: 'ok',
      extras: { latencyMs: 42, adapterId: 'ofac_sdn' },
    });
    const line = infoSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.latencyMs).toBe(42);
    expect(parsed.adapterId).toBe('ofac_sdn');
  });

  it('omits requestId when not provided', () => {
    logInfo({ module: 'm', operation: 'o', outcome: 'ok' });
    const line = infoSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.requestId).toBeUndefined();
  });

  it('logErrorFromException captures message + stack from an Error', () => {
    const err = new Error('boom');
    logErrorFromException({ module: 'm', operation: 'o' }, err);
    const line = errorSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('error');
    expect(parsed.outcome).toBe('fail');
    expect(parsed.errorMessage).toBe('boom');
    expect(parsed.stack).toContain('Error: boom');
  });

  it('logErrorFromException handles non-Error rejections', () => {
    logErrorFromException({ module: 'm', operation: 'o' }, 'just a string');
    const line = errorSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.errorMessage).toBe('just a string');
    expect(parsed.stack).toBeUndefined();
  });

  it('logErrorFromException merges caller-provided extras with error fields', () => {
    const err = new Error('boom');
    logErrorFromException(
      { module: 'm', operation: 'o', requestId: 'rid-x', extras: { adapterId: 'ofac_sdn' } },
      err,
    );
    const line = errorSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.adapterId).toBe('ofac_sdn');
    expect(parsed.errorMessage).toBe('boom');
    expect(parsed.requestId).toBe('rid-x');
  });
});
