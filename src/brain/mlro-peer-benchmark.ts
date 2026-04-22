// Hawkeye Sterling — peer-benchmark simulator.
// Given a case's observed metrics and the declared sector, return z-scores
// against a static peer baseline so the MLRO sees when the case is a
// material outlier vs sector norms. Baselines are seed values derived from
// public sector analyses; Phase 5 will refresh them from a real telemetry
// feed.

export type BenchmarkSector = 'dpms_retail' | 'dpms_refinery' | 'bullion_wholesale' | 'vasp' | 'bank_corporate' | 'real_estate' | 'insurance_life' | 'npo';

export interface SectorBaseline {
  sector: BenchmarkSector;
  label: string;
  dimensions: Record<string, { mean: number; std: number; unit: string; note?: string }>;
}

export const PEER_BASELINES: Record<BenchmarkSector, SectorBaseline> = {
  dpms_retail: {
    sector: 'dpms_retail',
    label: 'DPMS retail',
    dimensions: {
      monthly_turnover_aed: { mean: 1_000_000, std: 2_500_000, unit: 'AED' },
      avg_ticket_aed: { mean: 12_000, std: 18_000, unit: 'AED' },
      cash_share_pct: { mean: 55, std: 20, unit: '%' },
      customers_per_month: { mean: 220, std: 380, unit: 'count' },
      str_per_quarter: { mean: 0.3, std: 0.8, unit: 'count' },
    },
  },
  dpms_refinery: {
    sector: 'dpms_refinery',
    label: 'DPMS refinery',
    dimensions: {
      monthly_intake_kg: { mean: 80, std: 140, unit: 'kg' },
      dore_share_pct: { mean: 40, std: 20, unit: '%' },
      cahra_input_share_pct: { mean: 5, std: 8, unit: '%', note: 'LBMA RGG 5-step applies above 0' },
      assay_variance_pct: { mean: 0.2, std: 0.3, unit: '%' },
      suppliers_active: { mean: 25, std: 15, unit: 'count' },
    },
  },
  bullion_wholesale: {
    sector: 'bullion_wholesale',
    label: 'Bullion wholesale',
    dimensions: {
      monthly_turnover_aed: { mean: 50_000_000, std: 80_000_000, unit: 'AED' },
      loco_split_count: { mean: 4, std: 3, unit: 'count' },
      foreign_counterparty_share_pct: { mean: 70, std: 20, unit: '%' },
    },
  },
  vasp: {
    sector: 'vasp',
    label: 'VASP',
    dimensions: {
      monthly_volume_usd: { mean: 20_000_000, std: 45_000_000, unit: 'USD' },
      direct_mixer_hops: { mean: 6, std: 2, unit: 'hops', note: 'lower = higher risk' },
      travel_rule_gap_pct: { mean: 2, std: 3, unit: '%' },
      sanction_cluster_hop_min: { mean: 5, std: 2, unit: 'hops' },
    },
  },
  bank_corporate: {
    sector: 'bank_corporate',
    label: 'Bank — corporate',
    dimensions: {
      active_accounts: { mean: 8_000, std: 12_000, unit: 'count' },
      nested_respondents: { mean: 3, std: 4, unit: 'count' },
      ctr_per_month: { mean: 120, std: 250, unit: 'count' },
      str_per_month: { mean: 4, std: 8, unit: 'count' },
    },
  },
  real_estate: {
    sector: 'real_estate',
    label: 'Real estate',
    dimensions: {
      cash_closure_share_pct: { mean: 8, std: 6, unit: '%' },
      off_plan_share_pct: { mean: 35, std: 20, unit: '%' },
      foreign_buyer_share_pct: { mean: 55, std: 20, unit: '%' },
    },
  },
  insurance_life: {
    sector: 'insurance_life',
    label: 'Insurance — life',
    dimensions: {
      single_premium_share_pct: { mean: 20, std: 12, unit: '%' },
      cooling_off_surrender_pct: { mean: 2, std: 2, unit: '%' },
      beneficiary_change_pct: { mean: 3, std: 3, unit: '%' },
    },
  },
  npo: {
    sector: 'npo',
    label: 'NPO',
    dimensions: {
      programme_cash_ratio: { mean: 0.85, std: 0.1, unit: 'ratio', note: 'cash-in vs programme-spent; < 0.6 is a flag' },
      conflict_zone_share_pct: { mean: 10, std: 15, unit: '%' },
    },
  },
};

export interface ObservedMetric {
  dimension: string;
  observed: number;
}

export interface BenchmarkRow {
  dimension: string;
  observed: number;
  mean: number;
  std: number;
  zScore: number;
  unit: string;
  classification: 'normal' | 'elevated' | 'outlier' | 'extreme' | 'unknown';
  note?: string;
}

export interface BenchmarkReport {
  sector: BenchmarkSector;
  label: string;
  rows: BenchmarkRow[];
  outlierCount: number;
  extremeCount: number;
  maxAbsZ: number;
}

function classify(z: number): BenchmarkRow['classification'] {
  const a = Math.abs(z);
  if (a < 1) return 'normal';
  if (a < 2) return 'elevated';
  if (a < 3) return 'outlier';
  return 'extreme';
}

export function benchmarkCase(
  sector: BenchmarkSector,
  observed: readonly ObservedMetric[],
): BenchmarkReport {
  const base = PEER_BASELINES[sector];
  if (!base) {
    return { sector, label: sector, rows: [], outlierCount: 0, extremeCount: 0, maxAbsZ: 0 };
  }
  const rows: BenchmarkRow[] = [];
  for (const o of observed) {
    const dim = base.dimensions[o.dimension];
    if (!dim) {
      rows.push({ dimension: o.dimension, observed: o.observed, mean: 0, std: 0, zScore: 0, unit: '?', classification: 'unknown' });
      continue;
    }
    const z = dim.std <= 0 ? 0 : (o.observed - dim.mean) / dim.std;
    rows.push({
      dimension: o.dimension,
      observed: o.observed,
      mean: dim.mean,
      std: dim.std,
      zScore: Number(z.toFixed(3)),
      unit: dim.unit,
      classification: classify(z),
      ...(dim.note !== undefined ? { note: dim.note } : {}),
    });
  }
  const maxAbsZ = rows.reduce((m, r) => Math.max(m, Math.abs(r.zScore)), 0);
  return {
    sector,
    label: base.label,
    rows,
    outlierCount: rows.filter((r) => r.classification === 'outlier').length,
    extremeCount: rows.filter((r) => r.classification === 'extreme').length,
    maxAbsZ,
  };
}
