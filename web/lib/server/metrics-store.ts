// Hawkeye Sterling — in-process compliance metrics store.
//
// Lightweight counter and gauge store for Prometheus exposition via
// /api/metrics. In-process only — resets on Lambda cold start. This is
// intentional: the metrics endpoint is for real-time rate monitoring, not
// historical accumulation (use the audit chain for the historical record).
//
// Usage:
//   import { incrementCounter, setGauge } from '@/lib/server/metrics-store';
//   incrementCounter('hawkeye_screening_decisions_total', 1, { verdict: 'approve' });
//   setGauge('hawkeye_circuit_breaker_open', 1, { service: 'anthropic' });
//
// Consumers:
//   /api/metrics route reads getCounters() and getGauges() to build the
//   Prometheus text body. Labels are encoded as {k="v",...} per spec.

// Anchor to globalThis so HMR in Next.js dev server doesn't reset on each
// module reload.
interface MetricsStore {
  counters: Map<string, number>;
  gauges: Map<string, number>;
}

// eslint-disable-next-line no-var
declare global { var __hs_metrics_store: MetricsStore | undefined; }

function getStore(): MetricsStore {
  if (!globalThis.__hs_metrics_store) {
    globalThis.__hs_metrics_store = {
      counters: new Map<string, number>(),
      gauges: new Map<string, number>(),
    };
  }
  return globalThis.__hs_metrics_store;
}

function labelKey(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const encoded = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')}"`)
    .join(',');
  return `${name}{${encoded}}`;
}

// Guard against unbounded label cardinality from high-cardinality values
// (e.g. user IDs, UUIDs) being passed as labels by mistake.
const MAX_SERIES = 10_000;

function guardCardinality(store: MetricsStore): boolean {
  const total = store.counters.size + store.gauges.size;
  if (total >= MAX_SERIES) {
    // Use console.error (not warn) so ops alerts fire on cardinality exhaustion.
    // Also attempt to write a dedicated overflow counter — if it already exists
    // in the store it will increment without triggering the cardinality guard.
    console.error(`[metrics-store] cardinality limit reached (${total} series) — dropping new metric write`);
    const overflowKey = 'hawkeye_metrics_cardinality_overflow_total{}';
    const existing = store.counters.get(overflowKey);
    if (existing !== undefined) {
      store.counters.set(overflowKey, existing + 1);
    }
    return false;
  }
  return true;
}

/** Increment a counter metric (monotonically increasing). */
export function incrementCounter(
  name: string,
  by = 1,
  labels?: Record<string, string>,
): void {
  const store = getStore();
  const key = labelKey(name, labels);
  if (!store.counters.has(key) && !guardCardinality(store)) return;
  store.counters.set(key, (store.counters.get(key) ?? 0) + by);
}

/** Set a gauge metric (can go up or down). */
export function setGauge(
  name: string,
  value: number,
  labels?: Record<string, string>,
): void {
  const store = getStore();
  const key = labelKey(name, labels);
  if (!store.gauges.has(key) && !guardCardinality(store)) return;
  store.gauges.set(key, value);
}

export interface MetricEntry {
  key: string;
  value: number;
}

export function getCounters(): MetricEntry[] {
  return [...getStore().counters.entries()].map(([key, value]) => ({ key, value }));
}

export function getGauges(): MetricEntry[] {
  return [...getStore().gauges.entries()].map(([key, value]) => ({ key, value }));
}

/** Reset all metrics (used in tests). */
export function resetMetrics(): void {
  const store = getStore();
  store.counters.clear();
  store.gauges.clear();
}
