// Hawkeye Sterling — smurfing / structuring ring detector.
// Consumes a list of cash-or-near-equivalent transactions and finds
// clusters that look like co-ordinated sub-threshold deposits (smurfing)
// or one-party structured deposits over a short window.
//
// Pure function: no LLM, no I/O. Returns structured findings the
// pipeline + narrative composer can cite verbatim.

export interface SmurfingTransaction {
  id: string;
  /** Customer / account the transaction is booked against. */
  customerId: string;
  /** Amount in AED (caller must pre-convert). */
  amountAed: number;
  /** Channel — only 'cash' / 'courier' contribute to structuring score. */
  channel: 'cash' | 'courier' | 'wire' | 'card' | 'crypto' | 'cheque' | 'other';
  /** ISO 8601 timestamp. */
  at: string;
  branchId?: string;
  counterpartyId?: string;
  /** Shared attributes (phone, address, device id) — for the smurfing
   *  co-ordination detector. When multiple deposits share a linkKey,
   *  the depositors are treated as a possible ring. */
  linkKey?: string;
}

export interface StructuringCluster {
  kind: 'structuring';
  customerId: string;
  transactionIds: string[];
  count: number;
  totalAed: number;
  windowDays: number;
  belowThresholdCount: number;
  thresholdAed: number;
  severity: 'low' | 'medium' | 'high';
  evidence: string[];
}

export interface SmurfingCluster {
  kind: 'smurfing';
  linkKey: string;
  customerIds: string[];
  transactionIds: string[];
  count: number;
  totalAed: number;
  windowDays: number;
  severity: 'low' | 'medium' | 'high';
  evidence: string[];
}

export type Cluster = StructuringCluster | SmurfingCluster;

export interface DetectOptions {
  /** Reporting threshold (AED). Default 55 000 (UAE DPMS). */
  thresholdAed?: number;
  /** Lower bound of the near-threshold band as fraction of threshold. Default 0.9. */
  bandLow?: number;
  /** Upper bound of the near-threshold band as fraction of threshold. Default 1.0. */
  bandHigh?: number;
  /** Window for clustering a single customer. Default 14 days. */
  windowDays?: number;
  /** Minimum near-threshold transactions to flag a customer. Default 3. */
  minCount?: number;
  /** Minimum co-ordinated deposit count to flag a ring. Default 3 with ≥2 distinct customers. */
  minRingCount?: number;
}

const DEFAULTS: Required<DetectOptions> = {
  thresholdAed: 55_000,
  bandLow: 0.9,
  bandHigh: 1.0,
  windowDays: 14,
  minCount: 3,
  minRingCount: 3,
};

function parseMs(at: string): number {
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t;
}

function withinWindow(ms: number[], windowMs: number): boolean {
  if (ms.length <= 1) return true;
  const sorted = [...ms].sort((a, b) => a - b);
  return sorted[sorted.length - 1]! - sorted[0]! <= windowMs;
}

export function detectSmurfing(
  txs: readonly SmurfingTransaction[],
  opts: DetectOptions = {},
): Cluster[] {
  const cfg = { ...DEFAULTS, ...opts };
  const windowMs = cfg.windowDays * 86_400_000;
  const bandLow = cfg.thresholdAed * cfg.bandLow;
  const bandHigh = cfg.thresholdAed * cfg.bandHigh;

  const cashy = txs.filter((t) => t.channel === 'cash' || t.channel === 'courier');

  const clusters: Cluster[] = [];

  // --- STRUCTURING: per-customer sliding window.
  const byCustomer = new Map<string, SmurfingTransaction[]>();
  for (const t of cashy) {
    const arr = byCustomer.get(t.customerId) ?? [];
    arr.push(t);
    byCustomer.set(t.customerId, arr);
  }
  for (const [customerId, list] of byCustomer) {
    const nearBand = list.filter((t) => t.amountAed >= bandLow && t.amountAed < bandHigh);
    if (nearBand.length < cfg.minCount) continue;
    const sorted = [...nearBand].sort((a, b) => parseMs(a.at) - parseMs(b.at));
    for (let i = 0; i + cfg.minCount <= sorted.length; i++) {
      const windowTxs: SmurfingTransaction[] = [sorted[i]!];
      for (let j = i + 1; j < sorted.length; j++) {
        if (parseMs(sorted[j]!.at) - parseMs(sorted[i]!.at) <= windowMs) {
          windowTxs.push(sorted[j]!);
        } else break;
      }
      if (windowTxs.length >= cfg.minCount) {
        const totalAed = windowTxs.reduce((s, t) => s + t.amountAed, 0);
        const spanDays = (parseMs(windowTxs[windowTxs.length - 1]!.at) - parseMs(windowTxs[0]!.at)) / 86_400_000;
        const severity: StructuringCluster['severity'] =
          windowTxs.length >= 6 || totalAed >= cfg.thresholdAed * 5 ? 'high' :
          windowTxs.length >= 4 ? 'medium' : 'low';
        clusters.push({
          kind: 'structuring',
          customerId,
          transactionIds: windowTxs.map((t) => t.id),
          count: windowTxs.length,
          totalAed,
          windowDays: Math.ceil(spanDays),
          belowThresholdCount: windowTxs.length,
          thresholdAed: cfg.thresholdAed,
          severity,
          evidence: [
            `${windowTxs.length} cash deposits between ${(bandLow / 1000).toFixed(0)}k–${(bandHigh / 1000).toFixed(0)}k AED across ${Math.ceil(spanDays)} days.`,
            `Cumulative total: ${totalAed.toLocaleString()} AED (${(totalAed / cfg.thresholdAed).toFixed(1)}× DPMS threshold).`,
          ],
        });
        break; // one cluster per customer is enough to fire; suppress overlapping windows.
      }
    }
  }

  // --- SMURFING: multi-customer co-ordinated deposits sharing a linkKey.
  const byLink = new Map<string, SmurfingTransaction[]>();
  for (const t of cashy) {
    if (!t.linkKey) continue;
    const arr = byLink.get(t.linkKey) ?? [];
    arr.push(t);
    byLink.set(t.linkKey, arr);
  }
  for (const [linkKey, list] of byLink) {
    const customers = new Set(list.map((t) => t.customerId));
    if (customers.size < 2 || list.length < cfg.minRingCount) continue;
    const ms = list.map((t) => parseMs(t.at));
    if (!withinWindow(ms, windowMs)) continue;
    const totalAed = list.reduce((s, t) => s + t.amountAed, 0);
    const spanDays = Math.ceil((Math.max(...ms) - Math.min(...ms)) / 86_400_000);
    const severity: SmurfingCluster['severity'] =
      customers.size >= 5 || totalAed >= cfg.thresholdAed * 10 ? 'high' :
      customers.size >= 3 ? 'medium' : 'low';
    clusters.push({
      kind: 'smurfing',
      linkKey,
      customerIds: [...customers],
      transactionIds: list.map((t) => t.id),
      count: list.length,
      totalAed,
      windowDays: Math.max(1, spanDays),
      severity,
      evidence: [
        `${list.length} cash deposits across ${customers.size} distinct customers sharing link-key ${linkKey}.`,
        `Cumulative total: ${totalAed.toLocaleString()} AED across ${Math.max(1, spanDays)} days.`,
      ],
    });
  }

  return clusters;
}
