// Hawkeye Sterling — pipeline telemetry.
// Structured per-run metrics emitted alongside the pipeline result. The
// emitter is pluggable: callers inject a sink (console, Blob, HTTP POST
// to a metrics pipeline). Metrics are deliberately small + numeric so
// dashboards aggregate cheaply.

export interface TelemetryEvent {
  at: string;          // ISO 8601
  caseId: string;
  runId: string;
  modes: string[];
  elapsedMs: number;
  budgetMs: number;
  budgetUtilisation: number; // elapsed / budget, clamped to [0,1+]
  partial: boolean;
  stepsTotal: number;
  stepsOk: number;
  stepsPartial: number;
  stepsFailed: number;
  charterAllowed: boolean;
  charterFailedProhibitions: string[];
  tippingOffMatches: number;
  structuralIssues: number;
  divergenceScore?: number | undefined;
  verdict?: string | undefined;
  charterHash: string;
}

export type TelemetrySink = (event: TelemetryEvent) => void | Promise<void>;

/** No-op sink. */
export const NULL_SINK: TelemetrySink = () => {};

/** Console sink — useful in dev. */
export const CONSOLE_SINK: TelemetrySink = (e) => {
  // Keep it JSON-lineable so it pipes into log ingestion cleanly.
  console.info('[hawkeye.telemetry]', JSON.stringify(e));
};

/** In-memory sink with a ring buffer — test + dev utility. */
export class InMemorySink {
  private readonly buf: TelemetryEvent[] = [];
  private readonly cap: number;
  constructor(capacity = 1000) { this.cap = Math.max(1, capacity); }
  push: TelemetrySink = (e) => {
    this.buf.push(e);
    while (this.buf.length > this.cap) this.buf.shift();
  };
  list(): readonly TelemetryEvent[] { return this.buf; }
  size(): number { return this.buf.length; }
  clear(): void { this.buf.length = 0; }
}

/** HTTP POST sink with fire-and-forget + optional bearer token. */
export function httpSink(endpoint: string, bearerToken?: string, fetchImpl: typeof fetch = fetch): TelemetrySink {
  return async (event) => {
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
      await fetchImpl(endpoint, { method: 'POST', headers, body: JSON.stringify(event) });
    } catch (err) {
      // Telemetry must never throw; a dropped event is preferable to a
      // broken MLRO workflow. Log so ops can detect sink failures.
      console.warn('[mlro-telemetry] httpSink dropped event', {
        endpoint,
        caseId: event.caseId,
        runId: event.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

export interface BuildTelemetryInput {
  caseId: string;
  runId: string;
  modes: readonly string[];
  elapsedMs: number;
  budgetMs: number;
  partial: boolean;
  stepResults: ReadonlyArray<{ ok: boolean; partial: boolean }>;
  charterAllowed: boolean;
  charterFailedProhibitions: readonly string[];
  tippingOffMatches: number;
  structuralIssues: number;
  divergenceScore?: number | undefined;
  verdict?: string | undefined;
  charterHash: string;
  at?: string;
}

export function buildTelemetryEvent(input: BuildTelemetryInput): TelemetryEvent {
  const ok = input.stepResults.filter((s) => s.ok && !s.partial).length;
  const partial = input.stepResults.filter((s) => s.partial).length;
  const failed = input.stepResults.filter((s) => !s.ok && !s.partial).length;
  return {
    at: input.at ?? new Date().toISOString(),
    caseId: input.caseId,
    runId: input.runId,
    modes: [...input.modes],
    elapsedMs: input.elapsedMs,
    budgetMs: input.budgetMs,
    budgetUtilisation: input.budgetMs <= 0 ? 0 : Math.max(0, input.elapsedMs / input.budgetMs),
    partial: input.partial,
    stepsTotal: input.stepResults.length,
    stepsOk: ok,
    stepsPartial: partial,
    stepsFailed: failed,
    charterAllowed: input.charterAllowed,
    charterFailedProhibitions: [...input.charterFailedProhibitions],
    tippingOffMatches: input.tippingOffMatches,
    structuralIssues: input.structuralIssues,
    divergenceScore: input.divergenceScore,
    verdict: input.verdict,
    charterHash: input.charterHash,
  };
}

export async function emitTelemetry(sink: TelemetrySink, event: TelemetryEvent): Promise<void> {
  try {
    await sink(event);
  } catch (err) {
    console.warn('[mlro-telemetry] emitTelemetry swallowed error', {
      caseId: event.caseId,
      runId: event.runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
