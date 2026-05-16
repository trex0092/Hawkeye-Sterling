// Deep coverage tests for mlro-telemetry.ts
// Covers: buildTelemetryEvent math, InMemorySink ring buffer semantics,
// NULL_SINK + CONSOLE_SINK smoke, httpSink fire-and-forget + error swallowing,
// emitTelemetry error swallowing.

import { describe, it, expect, vi } from 'vitest';
import {
  buildTelemetryEvent,
  emitTelemetry,
  httpSink,
  InMemorySink,
  NULL_SINK,
  CONSOLE_SINK,
  type BuildTelemetryInput,
  type TelemetryEvent,
} from '../mlro-telemetry.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<BuildTelemetryInput> = {}): BuildTelemetryInput {
  return {
    caseId: 'CASE-001',
    runId: 'RUN-001',
    modes: ['sanctions', 'pep'],
    elapsedMs: 1200,
    budgetMs: 5000,
    partial: false,
    stepResults: [
      { ok: true, partial: false },
      { ok: true, partial: false },
      { ok: false, partial: false },
    ],
    charterAllowed: true,
    charterFailedProhibitions: [],
    tippingOffMatches: 0,
    structuralIssues: 0,
    charterHash: 'abc123',
    ...overrides,
  };
}

// ── buildTelemetryEvent — step counting ─────────────────────────────────────

describe('buildTelemetryEvent — step counting', () => {
  it('stepsTotal equals stepResults.length', () => {
    const e = buildTelemetryEvent(makeInput());
    expect(e.stepsTotal).toBe(3);
  });

  it('stepsOk counts ok=true and partial=false', () => {
    const e = buildTelemetryEvent(makeInput());
    expect(e.stepsOk).toBe(2);
  });

  it('stepsFailed counts ok=false and partial=false', () => {
    const e = buildTelemetryEvent(makeInput());
    expect(e.stepsFailed).toBe(1);
  });

  it('stepsPartial counts partial=true', () => {
    const input = makeInput({
      stepResults: [
        { ok: true, partial: true },
        { ok: true, partial: false },
        { ok: false, partial: true },
      ],
    });
    const e = buildTelemetryEvent(input);
    expect(e.stepsPartial).toBe(2);
    expect(e.stepsOk).toBe(1); // only ok=true, partial=false
    expect(e.stepsFailed).toBe(0); // ok=false but partial=true → not failed
  });

  it('handles empty stepResults', () => {
    const e = buildTelemetryEvent(makeInput({ stepResults: [] }));
    expect(e.stepsTotal).toBe(0);
    expect(e.stepsOk).toBe(0);
    expect(e.stepsPartial).toBe(0);
    expect(e.stepsFailed).toBe(0);
  });
});

// ── buildTelemetryEvent — budgetUtilisation ──────────────────────────────────

describe('buildTelemetryEvent — budgetUtilisation', () => {
  it('is elapsed/budget when budget > 0', () => {
    const e = buildTelemetryEvent(makeInput({ elapsedMs: 1000, budgetMs: 4000 }));
    expect(e.budgetUtilisation).toBeCloseTo(0.25);
  });

  it('is 0 when budgetMs is 0', () => {
    const e = buildTelemetryEvent(makeInput({ elapsedMs: 500, budgetMs: 0 }));
    expect(e.budgetUtilisation).toBe(0);
  });

  it('can exceed 1.0 when elapsed > budget', () => {
    const e = buildTelemetryEvent(makeInput({ elapsedMs: 6000, budgetMs: 5000 }));
    expect(e.budgetUtilisation).toBeCloseTo(1.2);
  });

  it('is never negative (clamped to 0)', () => {
    const e = buildTelemetryEvent(makeInput({ elapsedMs: -100, budgetMs: 5000 }));
    expect(e.budgetUtilisation).toBeGreaterThanOrEqual(0);
  });
});

// ── buildTelemetryEvent — field propagation ──────────────────────────────────

describe('buildTelemetryEvent — field propagation', () => {
  it('propagates caseId, runId, modes', () => {
    const e = buildTelemetryEvent(makeInput({ modes: ['pep', 'sanctions'], caseId: 'C2', runId: 'R2' }));
    expect(e.caseId).toBe('C2');
    expect(e.runId).toBe('R2');
    expect(e.modes).toEqual(['pep', 'sanctions']);
  });

  it('modes is a copy (mutating original does not affect event)', () => {
    const modes = ['pep'];
    const e = buildTelemetryEvent(makeInput({ modes }));
    modes.push('sanctions');
    expect(e.modes).toEqual(['pep']);
  });

  it('charterFailedProhibitions is a copy', () => {
    const prohibitions = ['P1'];
    const e = buildTelemetryEvent(makeInput({ charterFailedProhibitions: prohibitions }));
    prohibitions.push('P2');
    expect(e.charterFailedProhibitions).toEqual(['P1']);
  });

  it('uses supplied at string when provided', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const e = buildTelemetryEvent(makeInput({ at }));
    expect(e.at).toBe(at);
  });

  it('generates ISO timestamp when at is not supplied', () => {
    const e = buildTelemetryEvent(makeInput());
    expect(e.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('propagates divergenceScore and verdict when set', () => {
    const e = buildTelemetryEvent(makeInput({ divergenceScore: 0.42, verdict: 'escalate' }));
    expect(e.divergenceScore).toBe(0.42);
    expect(e.verdict).toBe('escalate');
  });

  it('divergenceScore is undefined when not supplied', () => {
    const e = buildTelemetryEvent(makeInput());
    expect(e.divergenceScore).toBeUndefined();
  });
});

// ── InMemorySink ─────────────────────────────────────────────────────────────

function makeEvent(n: number): TelemetryEvent {
  return buildTelemetryEvent(makeInput({ caseId: `CASE-${n}`, runId: `RUN-${n}` }));
}

describe('InMemorySink — ring buffer', () => {
  it('stores events up to capacity', () => {
    const sink = new InMemorySink(5);
    for (let i = 0; i < 5; i++) sink.push(makeEvent(i));
    expect(sink.size()).toBe(5);
  });

  it('evicts oldest when capacity is exceeded', () => {
    const sink = new InMemorySink(3);
    for (let i = 0; i < 5; i++) sink.push(makeEvent(i));
    expect(sink.size()).toBe(3);
    // The oldest (CASE-0, CASE-1) should be gone; latest three remain.
    const caseIds = sink.list().map((e) => e.caseId);
    expect(caseIds).toEqual(['CASE-2', 'CASE-3', 'CASE-4']);
  });

  it('capacity=1 keeps only the last event', () => {
    const sink = new InMemorySink(1);
    sink.push(makeEvent(10));
    sink.push(makeEvent(20));
    expect(sink.size()).toBe(1);
    expect(sink.list()[0]!.caseId).toBe('CASE-20');
  });

  it('capacity of 0 is normalised to 1', () => {
    const sink = new InMemorySink(0);
    sink.push(makeEvent(1));
    sink.push(makeEvent(2));
    expect(sink.size()).toBe(1);
  });

  it('clear() empties the buffer', () => {
    const sink = new InMemorySink(10);
    for (let i = 0; i < 5; i++) sink.push(makeEvent(i));
    sink.clear();
    expect(sink.size()).toBe(0);
    expect(sink.list()).toHaveLength(0);
  });

  it('list() returns a readonly view (no throw on read)', () => {
    const sink = new InMemorySink(10);
    sink.push(makeEvent(1));
    const list = sink.list();
    expect(list[0]!.caseId).toBe('CASE-1');
  });
});

// ── NULL_SINK ────────────────────────────────────────────────────────────────

describe('NULL_SINK', () => {
  it('does not throw and returns nothing', () => {
    expect(() => NULL_SINK(makeEvent(99))).not.toThrow();
  });
});

// ── CONSOLE_SINK ─────────────────────────────────────────────────────────────

describe('CONSOLE_SINK', () => {
  it('calls console.info with a JSON string', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    CONSOLE_SINK(makeEvent(1));
    expect(spy).toHaveBeenCalledOnce();
    const arg = spy.mock.calls[0]![1] as string;
    expect(() => JSON.parse(arg)).not.toThrow();
    spy.mockRestore();
  });
});

// ── httpSink ─────────────────────────────────────────────────────────────────

describe('httpSink', () => {
  it('calls fetchImpl with correct method + content-type', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const sink = httpSink('https://metrics.example.com/events', undefined, mockFetch);
    await sink(makeEvent(1));
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://metrics.example.com/events');
    expect(opts.method).toBe('POST');
    const headers = opts.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
  });

  it('adds Authorization header when bearerToken is supplied', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const sink = httpSink('https://example.com', 'my-secret', mockFetch);
    await sink(makeEvent(1));
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-secret');
  });

  it('does NOT add Authorization header when bearerToken is absent', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const sink = httpSink('https://example.com', undefined, mockFetch);
    await sink(makeEvent(1));
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('swallows network errors (fire-and-forget)', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network failure'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sink = httpSink('https://example.com', undefined, mockFetch);
    await expect(sink(makeEvent(1))).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('body is valid JSON containing caseId', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const sink = httpSink('https://example.com', undefined, mockFetch);
    const event = makeEvent(42);
    await sink(event);
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { caseId: string };
    expect(body.caseId).toBe('CASE-42');
  });
});

// ── emitTelemetry ────────────────────────────────────────────────────────────

describe('emitTelemetry', () => {
  it('calls the sink with the event', async () => {
    const received: TelemetryEvent[] = [];
    const sink = (e: TelemetryEvent) => { received.push(e); };
    const event = makeEvent(7);
    await emitTelemetry(sink, event);
    expect(received).toHaveLength(1);
    expect(received[0]!.caseId).toBe('CASE-7');
  });

  it('swallows errors thrown by a buggy sink', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badSink = () => { throw new Error('boom'); };
    await expect(emitTelemetry(badSink, makeEvent(1))).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('works with InMemorySink as the target', async () => {
    const sink = new InMemorySink(10);
    await emitTelemetry(sink.push, makeEvent(99));
    expect(sink.size()).toBe(1);
  });
});
