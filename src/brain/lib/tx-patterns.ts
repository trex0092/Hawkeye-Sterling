// Hawkeye Sterling — transaction-pattern library.
// Structuring, smurfing, round-trip, peel-chain, round-amount, time-clustering.

export interface TxRecord {
  amount?: number | string;
  currency?: string;
  timestamp?: number | string;
  counterparty?: string;
  direction?: 'in' | 'out' | 'debit' | 'credit';
  reference?: string;
  country?: string;
}

export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string' && /^[\d.,]+$/.test(v.trim())) {
    const n = Number(v.replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function parseTs(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const d = Date.parse(v); return Number.isNaN(d) ? null : d; }
  return null;
}

export function extractAmounts(txs: unknown): number[] {
  if (!Array.isArray(txs)) return [];
  const out: number[] = [];
  for (const t of txs) {
    if (typeof t === 'number') { const n = parseAmount(t); if (n !== null) out.push(n); }
    else if (t && typeof t === 'object' && 'amount' in t) {
      const n = parseAmount((t as { amount: unknown }).amount);
      if (n !== null) out.push(n);
    }
  }
  return out;
}

export function extractTimestamps(txs: unknown): number[] {
  if (!Array.isArray(txs)) return [];
  const out: number[] = [];
  for (const t of txs) {
    if (t && typeof t === 'object' && 'timestamp' in t) {
      const ts = parseTs((t as { timestamp: unknown }).timestamp);
      if (ts !== null) out.push(ts);
    }
  }
  return out;
}

// ── Structuring: amounts deliberately kept just below a reporting threshold.
// Default USD 10k per BSA / many regimes. The band [90%..99.9%] of threshold
// is the classic "near-miss" band.
export interface StructuringReport {
  total: number;
  nearThreshold: number;
  rate: number;
  threshold: number;
  examples: number[];
}
export function structuringScan(amounts: number[], threshold = 10_000): StructuringReport {
  const lo = threshold * 0.9, hi = threshold * 0.999;
  const near = amounts.filter((a) => a >= lo && a < hi);
  return {
    total: amounts.length,
    nearThreshold: near.length,
    rate: amounts.length === 0 ? 0 : near.length / amounts.length,
    threshold,
    examples: near.slice(0, 5),
  };
}

// ── Smurfing: many small, near-identical, short-interval deposits.
export interface SmurfingReport {
  windows: number;           // number of burst-windows detected
  burstSize: number;         // max transactions in one burst
  avgAmount: number;
  rate: number;              // burst share of total
}
export function smurfingScan(txs: unknown, threshold = 10_000, windowMs = 24 * 3600_000): SmurfingReport {
  const arr = Array.isArray(txs) ? txs : [];
  const events: { a: number; t: number }[] = [];
  for (const t of arr) {
    if (!t || typeof t !== 'object') continue;
    const a = parseAmount((t as { amount: unknown }).amount);
    const ts = parseTs((t as { timestamp: unknown }).timestamp);
    if (a !== null && ts !== null && a < threshold) events.push({ a, t: ts });
  }
  events.sort((x, y) => x.t - y.t);
  let windows = 0, burstSize = 0;
  let i = 0;
  while (i < events.length) {
    let j = i;
    while (j < events.length && (events[j]?.t ?? 0) - (events[i]?.t ?? 0) <= windowMs) j++;
    const size = j - i;
    if (size >= 3) { windows++; if (size > burstSize) burstSize = size; }
    i = j;
  }
  const total = events.reduce((s, e) => s + e.a, 0);
  const rate = arr.length === 0 ? 0 : events.length / arr.length;
  return { windows, burstSize, avgAmount: events.length === 0 ? 0 : total / events.length, rate };
}

// ── Round-amount flagging (ends in 000 / 500) — low information content,
// correlates with fabricated invoices.
export function roundAmountRate(amounts: number[]): { rate: number; count: number } {
  const round = amounts.filter((a) => a % 1000 === 0 || a % 500 === 0).length;
  return { rate: amounts.length === 0 ? 0 : round / amounts.length, count: round };
}

// ── Round-trip: in-out cycles between subject and the same counterparty.
export interface RoundTripReport {
  cycles: number;
  topPairs: Array<{ counterparty: string; inflow: number; outflow: number; delta: number }>;
}
export function roundTripScan(txs: unknown): RoundTripReport {
  const arr = Array.isArray(txs) ? txs : [];
  const totals = new Map<string, { inflow: number; outflow: number }>();
  for (const t of arr) {
    if (!t || typeof t !== 'object') continue;
    const cp = (t as { counterparty?: unknown }).counterparty;
    const a = parseAmount((t as { amount: unknown }).amount);
    const dir = (t as { direction?: unknown }).direction;
    if (typeof cp !== 'string' || a === null) continue;
    const rec = totals.get(cp) ?? { inflow: 0, outflow: 0 };
    if (dir === 'in' || dir === 'credit') rec.inflow += a;
    else if (dir === 'out' || dir === 'debit') rec.outflow += a;
    totals.set(cp, rec);
  }
  const pairs = [...totals.entries()].map(([cp, v]) => {
    const smaller = Math.min(v.inflow, v.outflow);
    const larger = Math.max(v.inflow, v.outflow);
    const delta = larger === 0 ? 0 : 1 - Math.abs(v.inflow - v.outflow) / larger;
    return { counterparty: cp, inflow: v.inflow, outflow: v.outflow, delta, smaller };
  });
  // A "cycle" exists when inflow and outflow to a counterparty are both > 0
  // and within 10% of each other.
  const cycles = pairs.filter((p) => p.inflow > 0 && p.outflow > 0 && p.delta > 0.9).length;
  pairs.sort((a, b) => b.smaller - a.smaller);
  return {
    cycles,
    topPairs: pairs.slice(0, 5).map(({ counterparty, inflow, outflow, delta }) => ({
      counterparty, inflow, outflow, delta,
    })),
  };
}

// ── Peel chain: a concentrating account that emits many small debits in
// a short window — classic crypto tumbling / cash layering pattern.
export function peelChainScore(txs: unknown): { score: number; outs: number; span: number } {
  const arr = Array.isArray(txs) ? txs : [];
  const outs: { a: number; t: number }[] = [];
  for (const t of arr) {
    if (!t || typeof t !== 'object') continue;
    const dir = (t as { direction?: unknown }).direction;
    if (dir !== 'out' && dir !== 'debit') continue;
    const a = parseAmount((t as { amount: unknown }).amount);
    const ts = parseTs((t as { timestamp: unknown }).timestamp);
    if (a !== null && ts !== null) outs.push({ a, t: ts });
  }
  if (outs.length < 5) return { score: 0, outs: outs.length, span: 0 };
  outs.sort((x, y) => x.t - y.t);
  const span = ((outs[outs.length - 1]?.t ?? 0) - (outs[0]?.t ?? 0)) / 3600_000;
  // Score: many small outs, decreasing amounts, tight time window.
  const amounts = outs.map((o) => o.a);
  const mean = amounts.reduce((s, x) => s + x, 0) / amounts.length;
  const below = amounts.filter((a) => a < mean * 0.5).length / amounts.length;
  const tight = span < 48 ? 1 : 48 / span;
  const raw = 0.5 * below + 0.3 * Math.min(1, outs.length / 20) + 0.2 * tight;
  return { score: Math.max(0, Math.min(1, raw)), outs: outs.length, span };
}

// ── Time clustering: coefficient-of-variation on inter-arrival times.
// Very low CoV → suspiciously regular automation; very high CoV → bursty.
export function timeClusteringScore(timestamps: number[]): {
  cov: number; verdict: 'regular' | 'bursty' | 'normal';
} {
  if (timestamps.length < 5) return { cov: 0, verdict: 'normal' };
  const sorted = [...timestamps].sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) intervals.push((sorted[i] ?? 0) - (sorted[i - 1] ?? 0));
  const mean = intervals.reduce((s, x) => s + x, 0) / intervals.length;
  if (mean === 0) return { cov: 0, verdict: 'normal' };
  const variance = intervals.reduce((s, x) => s + (x - mean) ** 2, 0) / intervals.length;
  const cov = Math.sqrt(variance) / mean;
  const verdict = cov < 0.1 ? 'regular' : cov > 2 ? 'bursty' : 'normal';
  return { cov, verdict };
}

// ── Wash-trade detection: matched self-trades (same counterparty, near-zero
// net, tight time window).
export function washTradeScore(txs: unknown): { pairs: number; volume: number } {
  const arr = Array.isArray(txs) ? txs : [];
  const byCp = new Map<string, { in: number; out: number }>();
  for (const t of arr) {
    if (!t || typeof t !== 'object') continue;
    const cp = (t as { counterparty?: unknown }).counterparty;
    const a = parseAmount((t as { amount: unknown }).amount);
    const d = (t as { direction?: unknown }).direction;
    if (typeof cp !== 'string' || a === null) continue;
    const rec = byCp.get(cp) ?? { in: 0, out: 0 };
    if (d === 'in' || d === 'credit') rec.in += a;
    else if (d === 'out' || d === 'debit') rec.out += a;
    byCp.set(cp, rec);
  }
  let pairs = 0, volume = 0;
  for (const v of byCp.values()) {
    const smaller = Math.min(v.in, v.out);
    if (smaller > 0 && Math.abs(v.in - v.out) / Math.max(v.in, v.out) < 0.05) {
      pairs++;
      volume += smaller * 2;
    }
  }
  return { pairs, volume };
}

// ── Journal-entry anomaly: weekend / holiday / period-close posting density.
export function journalAnomalyScore(timestamps: number[]): {
  weekendRate: number; monthEndRate: number; count: number;
} {
  if (timestamps.length === 0) return { weekendRate: 0, monthEndRate: 0, count: 0 };
  let weekend = 0, monthEnd = 0;
  for (const ts of timestamps) {
    const d = new Date(ts);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) weekend++;
    const nxt = new Date(ts + 5 * 86400_000);
    if (d.getUTCMonth() !== nxt.getUTCMonth()) monthEnd++;
  }
  return {
    weekendRate: weekend / timestamps.length,
    monthEndRate: monthEnd / timestamps.length,
    count: timestamps.length,
  };
}
