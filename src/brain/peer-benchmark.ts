// Hawkeye Sterling — peer-benchmark module.
// Compares a firm's self-reported metric values against an anonymised peer
// distribution (p25 / median / p75). Each metric carries direction
// ('lower_better' / 'higher_better') so "healthy" bands differ.
// Pure function, no I/O — callers feed both the self payload and the peer
// distribution (typically derived from a trusted peer-benchmark consortium
// feed).

export type BenchmarkDirection = 'lower_better' | 'higher_better';

export interface PeerMetric {
  id: string;
  label: string;
  unit: string;
  direction: BenchmarkDirection;
  peerGroupSize: number;
  selfValue: number;
  p25: number;
  median: number;
  p75: number;
}

export interface PeerRowReport {
  metric: PeerMetric;
  quartile: 'top' | 'upper_mid' | 'lower_mid' | 'bottom';
  status: 'leading' | 'on_track' | 'lagging' | 'tail';
  deltaVsMedian: number;
  narrative: string;
}

export interface PeerBenchmarkReport {
  windowSize: number;
  rows: PeerRowReport[];
  leadingCount: number;
  laggingCount: number;
  tailCount: number;
}

function percentOrDelta(unit: string, v: number): string {
  if (unit === '%' || unit === 'pct') return `${v.toFixed(1)}%`;
  if (unit === 'score') return v.toFixed(2);
  return `${v.toFixed(1)} ${unit}`;
}

function quartile(m: PeerMetric): PeerRowReport['quartile'] {
  const { selfValue, p25, median, p75, direction } = m;
  if (direction === 'lower_better') {
    if (selfValue <= p25) return 'top';
    if (selfValue <= median) return 'upper_mid';
    if (selfValue <= p75) return 'lower_mid';
    return 'bottom';
  }
  if (selfValue >= p75) return 'top';
  if (selfValue >= median) return 'upper_mid';
  if (selfValue >= p25) return 'lower_mid';
  return 'bottom';
}

function statusFromQuartile(q: PeerRowReport['quartile']): PeerRowReport['status'] {
  switch (q) {
    case 'top': return 'leading';
    case 'upper_mid': return 'on_track';
    case 'lower_mid': return 'lagging';
    case 'bottom': return 'tail';
  }
}

export function buildPeerBenchmark(metrics: readonly PeerMetric[]): PeerBenchmarkReport {
  const rows: PeerRowReport[] = metrics.map((m) => {
    const q = quartile(m);
    const status = statusFromQuartile(q);
    const delta = m.selfValue - m.median;
    const betterOrWorse =
      (m.direction === 'lower_better' && delta < 0) ||
      (m.direction === 'higher_better' && delta > 0)
        ? 'better'
        : delta === 0
          ? 'at'
          : 'worse';
    const narrative =
      `${m.label}: self ${percentOrDelta(m.unit, m.selfValue)} vs peer median ` +
      `${percentOrDelta(m.unit, m.median)} (n=${m.peerGroupSize}); ${betterOrWorse} than the median.`;
    return { metric: m, quartile: q, status, deltaVsMedian: delta, narrative };
  });
  return {
    windowSize: metrics.length,
    rows,
    leadingCount: rows.filter((r) => r.status === 'leading').length,
    laggingCount: rows.filter((r) => r.status === 'lagging').length,
    tailCount: rows.filter((r) => r.status === 'tail').length,
  };
}
