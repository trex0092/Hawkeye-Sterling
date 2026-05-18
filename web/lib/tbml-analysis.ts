// TBML (Trade-Based Money Laundering) analysis logic for precious metals trade.
// Implements 4 red-flag checks per FATF Recommendation 14 / CBUAE AML guidance.

import type { ComtradeRecord } from "@/lib/comtrade";

// FATF grey-list countries as of 2025
export const FATF_GREY_LIST_COUNTRIES = [
  "Algeria",
  "Angola",
  "Bulgaria",
  "Burkina Faso",
  "Cameroon",
  "Côte d'Ivoire",
  "Croatia",
  "Cuba",
  "Democratic Republic of the Congo",
  "Ethiopia",
  "Haiti",
  "Kenya",
  "Mali",
  "Monaco",
  "Mozambique",
  "Namibia",
  "Nigeria",
  "Philippines",
  "South Africa",
  "South Sudan",
  "Syria",
  "Tanzania",
  "Venezuela",
  "Vietnam",
  "Yemen",
] as const;

// ISO numeric country codes for FATF grey-list countries
const FATF_GREY_LIST_CODES = new Set<number>([
  12,   // Algeria
  24,   // Angola
  100,  // Bulgaria
  854,  // Burkina Faso
  120,  // Cameroon
  384,  // Côte d'Ivoire
  191,  // Croatia
  192,  // Cuba
  180,  // DRC
  231,  // Ethiopia
  332,  // Haiti
  404,  // Kenya
  466,  // Mali
  492,  // Monaco
  508,  // Mozambique
  516,  // Namibia
  566,  // Nigeria
  608,  // Philippines
  710,  // South Africa
  728,  // South Sudan
  760,  // Syria
  834,  // Tanzania
  862,  // Venezuela
  704,  // Vietnam
  887,  // Yemen
]);

// Gold reference price per kg in USD (2024 market range)
const GOLD_REF_PRICE_LOW_USD_KG = 58_000;
const GOLD_REF_PRICE_HIGH_USD_KG = 65_000;
const GOLD_REF_MID_USD_KG = (GOLD_REF_PRICE_LOW_USD_KG + GOLD_REF_PRICE_HIGH_USD_KG) / 2;
const PRICE_ANOMALY_LOW = 0.70;
const PRICE_ANOMALY_HIGH = 1.30;

const MIRROR_DISCREPANCY_THRESHOLD_PCT = 20;
const VOLUME_SPIKE_MULTIPLIER = 2.0;

export type TBMLRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface TBMLFlag {
  type: "mirror_discrepancy" | "price_anomaly" | "high_risk_partner" | "volume_spike";
  label: string;
  severity: "warning" | "critical";
  detail: string;
}

export interface TBMLRowResult {
  record: ComtradeRecord;
  flags: TBMLFlag[];
  unitPriceUsdKg: number | null;
  riskLevel: TBMLRiskLevel;
}

export interface TBMLAnalysisResult {
  rows: TBMLRowResult[];
  overallRisk: TBMLRiskLevel;
  flagCount: number;
  criticalCount: number;
  checkedAt: string;
}

/**
 * Mirror trade discrepancy formula per FATF TBML typology guidance.
 * discrepancyPct = |uaeImportValue - partnerExportValue| / max(uaeImportValue, partnerExportValue) * 100
 */
export function computeMirrorDiscrepancy(
  uaeImportValue: number,
  partnerExportValue: number,
): number {
  const maxVal = Math.max(uaeImportValue, partnerExportValue);
  if (maxVal === 0) return 0;
  return (Math.abs(uaeImportValue - partnerExportValue) / maxVal) * 100;
}

function computeUnitPrice(record: ComtradeRecord): number | null {
  if (!record.netWgt || record.netWgt <= 0) return null;
  return record.primaryValue / record.netWgt;
}

function classifyRowRisk(flags: TBMLFlag[]): TBMLRiskLevel {
  if (flags.some((f) => f.severity === "critical")) return "HIGH";
  if (flags.length > 0) return "MEDIUM";
  return "LOW";
}

export interface AnalyseRowOptions {
  /** Reported export value from the partner country to UAE, for mirror-trade comparison. */
  partnerExportValue?: number;
  /** Up to 3 previous periods' primary values for spike detection. */
  historicalVolumes?: number[];
}

/** Runs all 4 TBML checks on a single Comtrade trade record. */
export function analyseRow(
  record: ComtradeRecord,
  opts: AnalyseRowOptions = {},
): TBMLRowResult {
  const flags: TBMLFlag[] = [];

  // (a) Mirror trade discrepancy
  if (opts.partnerExportValue !== undefined && opts.partnerExportValue > 0) {
    const disc = computeMirrorDiscrepancy(record.primaryValue, opts.partnerExportValue);
    if (disc > MIRROR_DISCREPANCY_THRESHOLD_PCT) {
      flags.push({
        type: "mirror_discrepancy",
        label: "Mirror trade discrepancy",
        severity: disc > 50 ? "critical" : "warning",
        detail: `${disc.toFixed(1)}% gap — UAE reported $${record.primaryValue.toLocaleString()} vs partner exported $${opts.partnerExportValue.toLocaleString()}`,
      });
    }
  }

  // (b) Trade value / unit price anomaly (gold only — HS 7108)
  const unitPrice = computeUnitPrice(record);
  if (unitPrice !== null && record.cmdCode === "7108") {
    const lowBound = GOLD_REF_MID_USD_KG * PRICE_ANOMALY_LOW;
    const highBound = GOLD_REF_MID_USD_KG * PRICE_ANOMALY_HIGH;
    if (unitPrice < lowBound || unitPrice > highBound) {
      flags.push({
        type: "price_anomaly",
        label: "Trade value anomaly",
        severity: "critical",
        detail: `Unit price $${unitPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}/kg vs reference $${GOLD_REF_PRICE_LOW_USD_KG.toLocaleString()}–$${GOLD_REF_PRICE_HIGH_USD_KG.toLocaleString()}/kg`,
      });
    }
  }

  // (c) High-risk partner country (FATF grey list)
  if (FATF_GREY_LIST_CODES.has(record.partnerCode)) {
    flags.push({
      type: "high_risk_partner",
      label: "FATF grey-list partner",
      severity: "critical",
      detail: `${record.partnerDesc} is on the FATF grey list (as of 2025)`,
    });
  }

  // (d) Unusual trade volume spike (> 200% of 3-period average)
  if (opts.historicalVolumes && opts.historicalVolumes.length >= 1) {
    const avg =
      opts.historicalVolumes.reduce((s, v) => s + v, 0) / opts.historicalVolumes.length;
    if (avg > 0 && record.primaryValue > avg * VOLUME_SPIKE_MULTIPLIER) {
      const pct = ((record.primaryValue / avg) * 100).toFixed(0);
      flags.push({
        type: "volume_spike",
        label: "Unusual volume spike",
        severity: "warning",
        detail: `Current value ${pct}% of ${opts.historicalVolumes.length}-period average ($${avg.toLocaleString(undefined, { maximumFractionDigits: 0 })})`,
      });
    }
  }

  return { record, flags, unitPriceUsdKg: unitPrice, riskLevel: classifyRowRisk(flags) };
}

/** Runs all TBML checks across a set of records and returns an aggregated result. */
export function runTBMLAnalysis(
  records: ComtradeRecord[],
  opts: { partnerExportValues?: Record<number, number> } = {},
): TBMLAnalysisResult {
  const rows = records.map((r) =>
    analyseRow(r, { partnerExportValue: opts.partnerExportValues?.[r.partnerCode] }),
  );

  const flagCount = rows.reduce((s, r) => s + r.flags.length, 0);
  const criticalCount = rows.reduce(
    (s, r) => s + r.flags.filter((f) => f.severity === "critical").length,
    0,
  );

  let overallRisk: TBMLRiskLevel = "LOW";
  if (criticalCount > 0) overallRisk = "HIGH";
  else if (flagCount > 0) overallRisk = "MEDIUM";

  return { rows, overallRisk, flagCount, criticalCount, checkedAt: new Date().toISOString() };
}
