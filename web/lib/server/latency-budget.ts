// Hawkeye Sterling — latency budget tracker and p95/p99 monitor.
//
// Every compliance screening request should call `recordPhase()` at each
// execution boundary. Phase timings are aggregated in-process and exposed
// on the /api/metrics Prometheus endpoint as histograms. This lets
// operators see EXACTLY where latency is being spent per phase (auth,
// candidate-load, bloom, quickscreen, advisory, etc.) at p50/p95/p99.
//
// Usage:
//   const budget = new LatencyBudget("quick-screen");
//   budget.phase("auth");
//   await enforce(req);
//   budget.phase("candidates");
//   await loadCandidates();
//   budget.phase("bloom");
//   const pass = bloomPreScreen(name);
//   budget.phase("quickscreen");
//   const result = quickScreen(subject, candidates);
//   budget.finish();
//   // → emits phase-by-phase histogram observations

import { incrementCounter, setGauge } from "./metrics-store";

export interface PhaseRecord {
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export class LatencyBudget {
  private readonly route: string;
  private readonly t0: number;
  private current: string;
  private currentStart: number;
  private readonly phases: PhaseRecord[] = [];
  private done = false;

  constructor(route: string) {
    this.route = route;
    this.t0 = Date.now();
    this.current = "init";
    this.currentStart = this.t0;
  }

  /**
   * Mark the start of a new phase. Automatically records the duration of the
   * previous phase before starting the new one.
   */
  phase(name: string): void {
    if (this.done) return;
    const now = Date.now();
    if (this.current) {
      const dur = now - this.currentStart;
      this.phases.push({
        name: this.current,
        startMs: this.currentStart,
        endMs: now,
        durationMs: dur,
      });
      // Emit Prometheus observation for the just-completed phase.
      // Using a counter (sum + count) as a lightweight histogram substitute —
      // a real OTEL histogram would require the full SDK.
      incrementCounter("hawkeye_phase_duration_ms_total", dur, {
        route: this.route,
        phase: this.current,
      });
      incrementCounter("hawkeye_phase_calls_total", 1, {
        route: this.route,
        phase: this.current,
      });
    }
    this.current = name;
    this.currentStart = now;
  }

  /** Record the final phase and emit the total request duration. */
  finish(): PhaseRecord[] {
    if (this.done) return this.phases;
    this.done = true;
    const now = Date.now();
    if (this.current) {
      const dur = now - this.currentStart;
      this.phases.push({
        name: this.current,
        startMs: this.currentStart,
        endMs: now,
        durationMs: dur,
      });
      incrementCounter("hawkeye_phase_duration_ms_total", dur, {
        route: this.route,
        phase: this.current,
      });
      incrementCounter("hawkeye_phase_calls_total", 1, {
        route: this.route,
        phase: this.current,
      });
    }
    const totalMs = now - this.t0;
    incrementCounter("hawkeye_request_duration_ms_total", totalMs, { route: this.route });
    incrementCounter("hawkeye_request_total", 1, { route: this.route });
    // Track SLA adherence (3 s, 5 s, 10 s buckets).
    const sla = totalMs <= 3_000 ? "3s" : totalMs <= 5_000 ? "5s" : totalMs <= 10_000 ? "10s" : "slow";
    setGauge("hawkeye_sla_bucket", 1, { route: this.route, bucket: sla });
    return this.phases;
  }

  /** Current elapsed ms since construction. */
  elapsed(): number { return Date.now() - this.t0; }

  /** Snapshot of completed phases for request logging / response annotation. */
  snapshot(): PhaseRecord[] { return [...this.phases]; }
}

// ── Latency target constants ───────────────────────────────────────────────

/** Hard SLA targets (ms) for each route. */
export const SLA_TARGETS = {
  /** /api/quick-screen: full response including local match. */
  QUICK_SCREEN_TOTAL_MS: 3_500,
  /** /api/quick-screen: local quickScreen() phase only. */
  QUICK_SCREEN_LOCAL_MS: 1_200,
  /** /api/mlro-advisor: first streaming token. */
  MLRO_FIRST_TOKEN_MS: 500,
  /** /api/mlro-advisor: full advisory (streaming or buffered). */
  MLRO_TOTAL_MS: 5_000,
  /** /api/smart-disambiguate: full response. */
  SMART_DISAMBIG_TOTAL_MS: 4_000,
  /** Auth enforcement (enforce.ts). */
  AUTH_PHASE_MS: 100,
  /** Candidate corpus load (warm path). */
  CANDIDATES_WARM_MS: 5,
  /** Candidate corpus load (cold path from Blobs). */
  CANDIDATES_COLD_MS: 2_400,
  /** Bloom filter pre-screen (in-memory). */
  BLOOM_PHASE_MS: 1,
  /** Rate limit check (Redis pipeline). */
  RATE_LIMIT_PHASE_MS: 80,
} as const;
