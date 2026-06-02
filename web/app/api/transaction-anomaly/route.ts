// POST /api/transaction-anomaly
// Real-time streaming transaction anomaly scoring.
// Implements a TypeScript port of PySAD's HalfSpaceTrees + z-score ensemble.
// Scores transactions one at a time; model updates itself with each observation.
// Routes output to three tiers: pass / flag (same-day review) / hold (immediate).
//
// Body: { transaction: TransactionPayload, sessionId?: string }
// The sessionId groups transactions from the same customer session so the
// streaming model accumulates state across calls.
//
// Enhanced detection patterns (FATF typology-aligned):
//   · structuring             — sub-threshold amounts in 5-day window (FATF R.20)
//   · round_number_pattern    — >70% round-number transactions (FATF Guidance 2023)
//   · velocity_spike          — 24h count/volume > 3× 30-day daily average (FATF R.20)
//   · geographic_dispersion   — >5 countries in 7-day window (FATF R.1/R.10)
//   · dormant_reactivation    — >90-day gap then sudden high-volume (FATF Guidance 2023)
//   · correspondent_layering  — >3 correspondent bank hops (FATF R.13)

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { setJson } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  StreamingAnomalyGate,
  extractFeatures,
  type AnomalyFeatureVector,
  type AnomalyTier,
} from "../../../../src/brain/streaming-anomaly.js";

export interface TxnFlagRecord {
  flagId: string;
  tenantId: string;
  sessionId: string;
  tier: "flag" | "hold";
  score: number;
  amountUsd: number;
  timestampUtc: string;
  drivers: string[];
  anomalyFlags: AnomalyFlag[];
  processed: boolean;
  createdAt: string;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Audit M-05: bare 405 on GET left operators guessing. Return a friendly
// 405 that names the right method + body shape and points at /api/routes.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: "Method Not Allowed",
      message: "POST /api/transaction-anomaly with body { transaction: { amountUsd, ... }, sessionId? }. See /api/routes?mcpTool=transaction_anomaly.",
    },
    { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } },
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// AnomalyFlag — structured output for each rule-based detection pattern.
// ──────────────────────────────────────────────────────────────────────────────

/** A single rule-based anomaly flag with FATF typology attribution. */
export interface AnomalyFlag {
  /** Machine-readable flag identifier. */
  flagName: string;
  /** Additive contribution to the overall score (0–1 scale). */
  scoreContribution: number;
  /** Human-readable explanation for compliance operators. */
  description: string;
  /** FATF Recommendation or Guidance reference, if applicable. */
  fatfReference?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// In-memory gate store keyed by sessionId.
// ──────────────────────────────────────────────────────────────────────────────
const gateStore = new Map<string, StreamingAnomalyGate>();

function getOrCreateGate(sessionId: string): StreamingAnomalyGate {
  if (!gateStore.has(sessionId)) {
    gateStore.set(sessionId, new StreamingAnomalyGate({
      nFeatures: 9,
      nEstimators: 25,
      depth: 15,
      windowSize: 500,
      holdThreshold: 0.90,
      flagThreshold: 0.75,
    }));
  }
  return gateStore.get(sessionId)!;
}

// ──────────────────────────────────────────────────────────────────────────────
// TransactionPayload — extended with context fields for advanced pattern detection.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Historical sub-threshold transaction for structuring / velocity analysis.
 * amountUsd and timestampUtc are both required for window-based checks.
 */
interface HistoricalTransaction {
  amountUsd: number;
  timestampUtc: string;
  /** ISO 3166-1 alpha-2 country code of the transaction origin/destination. */
  countryCode?: string;
  /** Entity identifier for wash-trading detection (buyer or seller). */
  entityId?: string;
  /** Asset identifier for wash-trading / pump-dump detection. */
  assetId?: string;
  /** Role of the entity in the transaction: "buyer" or "seller". */
  role?: "buyer" | "seller";
  /** Transaction volume for the asset on this date (used for pump-dump). */
  assetVolumeUsd?: number;
}

interface TransactionPayload {
  amountUsd: number;
  timestampUtc?: string;
  counterpartyFirstSeen?: boolean;
  countryRiskScore?: number;
  customerBaseline?: {
    meanAmount?: number;
    stdAmount?: number;
    txnPer7d?: number;
  };
  features?: AnomalyFeatureVector;
  // DPMS compliance fields — used for rule-based override layer
  paymentMethod?: "cash" | "wire" | "card" | "crypto" | "cheque" | "other";
  assetClass?: "gold" | "silver" | "platinum" | "diamonds" | "precious_stones" | "jewellery" | "watches" | "other";

  // ── Extended context for advanced pattern detection ────────────────────────

  /**
   * Recent transactions from the same customer/session used for window-based
   * pattern detection (structuring, velocity, geographic, dormancy checks).
   * The current transaction itself should NOT be included in this list.
   */
  recentTransactions?: HistoricalTransaction[];

  /**
   * Timestamp of the customer's last known transaction before the current one.
   * Used for dormant account reactivation detection.
   */
  lastTransactionTimestampUtc?: string;

  /**
   * ISO 3166-1 alpha-2 country code for the current transaction.
   */
  countryCode?: string;

  /**
   * Number of correspondent bank hops in the wire chain for this transaction.
   * A multi-hop wire through multiple intermediary banks indicates layering risk.
   */
  correspondentBankHops?: number;

  /**
   * 30-day daily average transaction count for the customer (for velocity spike).
   */
  dailyAvgCount30d?: number;

  /**
   * 30-day daily average transaction volume (USD) for the customer (for velocity spike).
   */
  dailyAvgVolumeUsd30d?: number;

  /**
   * Transaction count in the last 24 hours (for velocity spike detection).
   */
  txnCount24h?: number;

  /**
   * Total transaction volume (USD) in the last 24 hours (for velocity spike detection).
   */
  txnVolumeUsd24h?: number;

  // ── Securities fraud detection fields ─────────────────────────────────────

  /**
   * Entity identifier for the current transaction's initiating party (buyer or seller).
   * Used for wash-trading detection when cross-referenced with recentTransactions.
   */
  entityId?: string;

  /**
   * Role of the current entity in this transaction: "buyer" or "seller".
   * Used for wash-trading detection.
   */
  role?: "buyer" | "seller";

  /**
   * Asset identifier (ticker, ISIN, contract address, commodity code, etc.)
   * for the asset being traded. Used for wash-trading and pump-dump detection.
   */
  assetId?: string;

  /**
   * Daily asset volume (USD) time series for the past N days.
   * Element [0] is the most recent completed day; element [N-1] is the oldest.
   * Used for pump-and-dump pattern detection (10× spike over 3 days then drop).
   */
  assetVolumeSeries?: number[];

  // ── Human trafficking pattern fields ──────────────────────────────────────

  /**
   * Number of distinct sender counterparties funding this recipient in the
   * current session / window. Used for possible_trafficking_proceeds detection.
   */
  distinctSenderCount?: number;

  /**
   * True when the payment recurs on a weekly (or near-weekly) cadence.
   * Used together with distinctSenderCount for trafficking-proceeds pattern.
   */
  isWeeklyRecurring?: boolean;

  /**
   * Merchant Category Code (MCC) or business-type string for the counterparty.
   * Adult-entertainment and similar high-cash-risk codes trigger
   * high_risk_cash_intensive flagging.
   */
  merchantCategoryCode?: string;

  /**
   * Business category label for the receiving merchant / customer business.
   * Used by cash_intensive_front_business_risk detection to identify
   * drug-trafficking front businesses (nail salons, car washes, convenience
   * stores, parking lots, restaurants with anomalously high cash receipts).
   */
  merchantBusinessCategory?: string;

  /**
   * Percentage of total receipts paid in cash (0–100).
   * Used with merchantBusinessCategory to detect drug-front business patterns —
   * legitimate nail salons / car washes rarely exceed ~40% cash.
   */
  cashReceiptPct?: number;
}

interface AnomalyRequestBody {
  transaction: TransactionPayload;
  sessionId?: string;
}

// AED/USD exchange rate for threshold conversion.
// AED 55,000 mandatory CDD threshold (MoE Circular 2/2024) ≈ USD 14,985.
const AED_55K_IN_USD = 14_985;

// FATF structuring thresholds:
// AED 40,000 ≈ USD 10,900 (using ~0.272 exchange rate). USD threshold is USD 10,000.
// We check both: below AED 40,000 (≈ USD 10,900) or below USD 10,000.
const AED_40K_IN_USD = 10_900;
const USD_CTR_THRESHOLD = 10_000;

// Precious metals and stones asset classes that trigger DPMS rules.
const PRECIOUS_ASSET_CLASSES = new Set(["gold", "silver", "platinum", "diamonds", "precious_stones", "jewellery", "watches"]);

// ──────────────────────────────────────────────────────────────────────────────
// Detection helpers
// ──────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function daysDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / MS_PER_DAY;
}

/**
 * PATTERN A — Structuring Detection (FATF R.20 / FATF Guidance on Indicators 2023)
 *
 * If multiple transactions are slightly below a reporting threshold
 * (AED 40,000 / USD 10,000) within a 5-day window, flag as "structuring".
 * Score contribution: +0.30
 */
function detectStructuring(tx: TransactionPayload, now: Date): AnomalyFlag | null {
  const recent = tx.recentTransactions;
  if (!recent || recent.length === 0) return null;

  // Current transaction must itself be sub-threshold
  const aedSubThreshold = tx.amountUsd < AED_40K_IN_USD && tx.amountUsd > AED_40K_IN_USD * 0.7;
  const usdSubThreshold = tx.amountUsd < USD_CTR_THRESHOLD && tx.amountUsd > USD_CTR_THRESHOLD * 0.7;
  if (!aedSubThreshold && !usdSubThreshold) return null;

  // Count recent transactions in the 5-day window that are also sub-threshold
  const windowDays = 5;
  const subThresholdPrior = recent.filter((t) => {
    const tDate = new Date(t.timestampUtc);
    if (daysDiff(now, tDate) > windowDays) return false;
    const aed = t.amountUsd < AED_40K_IN_USD && t.amountUsd > AED_40K_IN_USD * 0.7;
    const usd = t.amountUsd < USD_CTR_THRESHOLD && t.amountUsd > USD_CTR_THRESHOLD * 0.7;
    return aed || usd;
  });

  // Trigger if >= 2 prior sub-threshold transactions in the window (plus current = 3+)
  if (subThresholdPrior.length < 2) return null;

  const threshold = aedSubThreshold
    ? `AED 40,000 (≈ USD ${AED_40K_IN_USD.toLocaleString()})`
    : `USD ${USD_CTR_THRESHOLD.toLocaleString()}`;

  return {
    flagName: "structuring",
    scoreContribution: 0.30,
    description:
      `${subThresholdPrior.length + 1} transactions slightly below the ${threshold} reporting ` +
      `threshold detected within a ${windowDays}-day window. This pattern is consistent with ` +
      `deliberate threshold avoidance (structuring / smurfing).`,
    fatfReference: "FATF Recommendation 20; FATF Guidance on Indicators of Money Laundering (2023), typology T-3",
  };
}

/**
 * PATTERN B — Round-Number Analysis (FATF Guidance 2023)
 *
 * If >70% of transactions in the window are round numbers (multiples of 1000,
 * 5000, or 10000), flag as "round_number_pattern".
 * Score contribution: +0.15
 */
function detectRoundNumberPattern(tx: TransactionPayload): AnomalyFlag | null {
  const recent = tx.recentTransactions;
  if (!recent || recent.length < 4) return null; // need enough data for a meaningful ratio

  const isRound = (amount: number): boolean =>
    amount > 0 && (amount % 1_000 === 0 || amount % 5_000 === 0 || amount % 10_000 === 0);

  const allTx = [...recent.map((t) => t.amountUsd), tx.amountUsd];
  const roundCount = allTx.filter(isRound).length;
  const ratio = roundCount / allTx.length;

  if (ratio <= 0.70) return null;

  return {
    flagName: "round_number_pattern",
    scoreContribution: 0.15,
    description:
      `${Math.round(ratio * 100)}% of transactions in the current window are round numbers ` +
      `(multiples of 1,000 / 5,000 / 10,000 USD). Round-number dominance suggests manual cash ` +
      `entry rather than organic commercial activity.`,
    fatfReference: "FATF Guidance on Money Laundering and Terrorist Financing Indicators (2023), indicator I-2.6",
  };
}

/**
 * PATTERN C — Velocity Spike Detection (FATF R.20)
 *
 * If transaction count or volume in the last 24h exceeds 3× the 30-day daily
 * average, flag as "velocity_spike".
 * Score contribution: +0.25
 */
function detectVelocitySpike(tx: TransactionPayload): AnomalyFlag | null {
  const { txnCount24h, txnVolumeUsd24h, dailyAvgCount30d, dailyAvgVolumeUsd30d } = tx;

  const countSpiked =
    typeof txnCount24h === "number" &&
    typeof dailyAvgCount30d === "number" &&
    dailyAvgCount30d > 0 &&
    txnCount24h > 3 * dailyAvgCount30d;

  const volumeSpiked =
    typeof txnVolumeUsd24h === "number" &&
    typeof dailyAvgVolumeUsd30d === "number" &&
    dailyAvgVolumeUsd30d > 0 &&
    txnVolumeUsd24h > 3 * dailyAvgVolumeUsd30d;

  if (!countSpiked && !volumeSpiked) return null;

  const parts: string[] = [];
  if (countSpiked) {
    parts.push(
      `transaction count (${txnCount24h!} in 24h vs daily avg ${dailyAvgCount30d!.toFixed(1)})`,
    );
  }
  if (volumeSpiked) {
    parts.push(
      `volume (USD ${txnVolumeUsd24h!.toLocaleString()} in 24h vs daily avg USD ${dailyAvgVolumeUsd30d!.toLocaleString()})`,
    );
  }

  return {
    flagName: "velocity_spike",
    scoreContribution: 0.25,
    description:
      `Unusual activity surge: ${parts.join(" and ")} exceeds 3× the 30-day daily average. ` +
      `Rapid escalation in transaction frequency or value is a documented layering indicator.`,
    fatfReference: "FATF Recommendation 20; FATF Guidance on Indicators (2023), indicator I-2.3",
  };
}

/**
 * PATTERN D — Geographic Dispersion (FATF R.1 / R.10)
 *
 * If transactions span >5 different countries in a 7-day window with no clear
 * business rationale, flag as "geographic_dispersion".
 * Score contribution: +0.20
 */
function detectGeographicDispersion(tx: TransactionPayload, now: Date): AnomalyFlag | null {
  const recent = tx.recentTransactions;
  if (!recent || recent.length === 0) return null;

  const windowDays = 7;
  const countrySet = new Set<string>();

  if (tx.countryCode) countrySet.add(tx.countryCode.toUpperCase());

  for (const t of recent) {
    if (!t.countryCode) continue;
    const tDate = new Date(t.timestampUtc);
    if (daysDiff(now, tDate) <= windowDays) {
      countrySet.add(t.countryCode.toUpperCase());
    }
  }

  if (countrySet.size <= 5) return null;

  return {
    flagName: "geographic_dispersion",
    scoreContribution: 0.20,
    description:
      `Transactions span ${countrySet.size} distinct countries (${Array.from(countrySet).join(", ")}) ` +
      `within a ${windowDays}-day window. High geographic dispersion without documented business ` +
      `rationale is a red flag for layering through multiple jurisdictions.`,
    fatfReference: "FATF Recommendation 1 (risk-based approach); FATF Recommendation 10 (CDD); " +
      "FATF Guidance on Trade-Based Money Laundering (2020), typology T-8",
  };
}

/**
 * PATTERN E — Dormant Account Reactivation (FATF Guidance 2023)
 *
 * If no activity for >90 days followed by sudden high-volume transactions,
 * flag as "dormant_reactivation".
 * Score contribution: +0.20
 */
function detectDormantReactivation(tx: TransactionPayload, now: Date): AnomalyFlag | null {
  const { lastTransactionTimestampUtc, amountUsd } = tx;
  if (!lastTransactionTimestampUtc) return null;

  const lastTxDate = new Date(lastTransactionTimestampUtc);
  const gapDays = daysDiff(now, lastTxDate);

  if (gapDays <= 90) return null;

  // "High-volume" heuristic: current transaction is above AED 55k threshold OR
  // significantly above the customer baseline (if provided).
  const aboveAed55k = amountUsd >= AED_55K_IN_USD;
  const baseline = tx.customerBaseline?.meanAmount ?? 0;
  const significantlyAboveBaseline = baseline > 0 && amountUsd >= baseline * 3;

  if (!aboveAed55k && !significantlyAboveBaseline) return null;

  return {
    flagName: "dormant_reactivation",
    scoreContribution: 0.20,
    description:
      `Account was inactive for ${Math.floor(gapDays)} days before this high-value transaction ` +
      `(USD ${amountUsd.toLocaleString()}). Sudden reactivation of dormant accounts with ` +
      `large transactions is a documented placement and layering indicator.`,
    fatfReference: "FATF Guidance on Money Laundering and Terrorist Financing Indicators (2023), indicator I-1.4; " +
      "FATF Recommendation 10 (ongoing due diligence)",
  };
}

/**
 * PATTERN F — Correspondent Banking Layering (FATF R.13)
 *
 * If the transaction chain involves >3 correspondent bank hops, flag as
 * "correspondent_layering".
 * Score contribution: +0.20
 */
function detectCorrespondentLayering(tx: TransactionPayload): AnomalyFlag | null {
  const { correspondentBankHops } = tx;
  if (typeof correspondentBankHops !== "number" || correspondentBankHops <= 3) return null;

  return {
    flagName: "correspondent_layering",
    scoreContribution: 0.20,
    description:
      `Wire transfer routed through ${correspondentBankHops} correspondent bank hops. ` +
      `Multi-hop correspondent chains (>3 intermediaries) obscure the transaction trail ` +
      `and are a key indicator of layering in cross-border wire transfer schemes.`,
    fatfReference: "FATF Recommendation 13 (correspondent banking); " +
      "FATF Guidance on Correspondent Banking Services (2016); " +
      "FATF Typology Report on De-Risking (2021)",
  };
}

/**
 * PATTERN G — Wash Trading Detection (FATF market-abuse / securities fraud predicate)
 *
 * If the same entity appears as both buyer and seller for the same asset
 * within a 24-hour window, flag as "wash_trading".
 * Score contribution: +0.35
 */
function detectWashTrading(tx: TransactionPayload, now: Date): AnomalyFlag | null {
  const { entityId, assetId, role, recentTransactions } = tx;
  if (!entityId || !assetId || !role) return null;
  const recent = recentTransactions;
  if (!recent || recent.length === 0) return null;

  const windowMs = MS_PER_DAY; // 24 hours
  const oppositeRole: "buyer" | "seller" = role === "buyer" ? "seller" : "buyer";

  const matchingCounterTrade = recent.find((t) => {
    const tDate = new Date(t.timestampUtc);
    if (Math.abs(now.getTime() - tDate.getTime()) > windowMs) return false;
    return (
      t.entityId === entityId &&
      t.assetId === assetId &&
      t.role === oppositeRole
    );
  });

  if (!matchingCounterTrade) return null;

  return {
    flagName: "wash_trading",
    scoreContribution: 0.35,
    description:
      `Entity "${entityId}" appears as both buyer and seller for asset "${assetId}" ` +
      `within a 24-hour window. Circular self-dealing in the same asset is a primary ` +
      `indicator of wash trading — a securities fraud and market-manipulation predicate ` +
      `offence under FATF Recommendation 3.`,
    fatfReference:
      "FATF Recommendation 3 (money laundering offence — predicate offences); " +
      "IOSCO Report on Market Manipulation (2018); " +
      "SEC Rule 10b-5 / MAR Article 12 analogues",
  };
}

/**
 * PATTERN H — Pump-and-Dump Pattern (FATF market-abuse / securities fraud predicate)
 *
 * If daily asset volume spikes >=10x the 3-day baseline average then drops back,
 * flag as "pump_dump_pattern".
 * Score contribution: +0.30
 *
 * Requires tx.assetVolumeSeries with at least 4 elements:
 *   [0] current day's volume, [1..3] spike window, [4..] older baseline.
 * The spike must be >=10x the baseline average, confirmed by a drop back below
 * 50% of peak in the current observation.
 */
function detectPumpDumpPattern(tx: TransactionPayload): AnomalyFlag | null {
  const series = tx.assetVolumeSeries;
  if (!series || series.length < 4) return null;

  // series[0] = most recent (current), series[1..3] = spike window, series[4+] = baseline
  const currentVol = series[0]!;
  const spikeWindow = series.slice(1, 4);
  const baselineWindow = series.length > 4 ? series.slice(4) : series.slice(3);

  if (baselineWindow.length === 0) return null;

  const baselineAvg = baselineWindow.reduce((s, v) => s + v, 0) / baselineWindow.length;
  if (baselineAvg <= 0) return null;

  const spikeMax = Math.max(...spikeWindow);
  const spikeRatio = spikeMax / baselineAvg;

  // Must have spiked >=10x above baseline during spike window
  if (spikeRatio < 10) return null;

  // Confirm the dump: current volume must be less than 50% of peak spike
  if (currentVol >= spikeMax * 0.5) return null;

  return {
    flagName: "pump_dump_pattern",
    scoreContribution: 0.30,
    description:
      `Asset volume spiked ${spikeRatio.toFixed(1)}x above the ${baselineWindow.length}-day ` +
      `baseline average (peak: USD ${spikeMax.toLocaleString()}, baseline avg: ` +
      `USD ${Math.round(baselineAvg).toLocaleString()}), then dropped to ` +
      `USD ${currentVol.toLocaleString()} — a classic pump-and-dump profile. ` +
      `Coordinated volume inflation followed by rapid deflation is a market-manipulation ` +
      `and securities fraud indicator; proceeds are a FATF predicate-offence ML risk.`,
    fatfReference:
      "FATF Recommendation 3 (predicate offences — securities fraud); " +
      "IOSCO Objectives and Principles of Securities Regulation; " +
      "SEC Release 34-44103 (pump-and-dump schemes); " +
      "ESMA Guidelines on Market Manipulation (MAR Article 12)",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// DPMS compliance override layer (existing, unchanged logic).
// ──────────────────────────────────────────────────────────────────────────────

/** Rule-based compliance override layer applied AFTER the ML score.
 *  Implements hard floors mandated by UAE DPMS regulations:
 *  - MoE Circular 2/2024: cash transactions ≥ AED 55,000 require CDD → flag minimum
 *  - Cash payment for precious metals: documented ML red flag → add driver
 *  - Round-number amounts: structuring signal → add driver
 *  Returns updated { score, tier, drivers } — never downgrades an ML verdict. */
function applyDpmsRules(
  result: { score: number; tier: AnomalyTier; drivers: string[] },
  tx: TransactionPayload,
): { score: number; tier: AnomalyTier; drivers: string[] } {
  const drivers = [...result.drivers];
  let { score, tier } = result;

  const isCash = tx.paymentMethod === "cash";
  const isPrecious = tx.assetClass !== undefined && PRECIOUS_ASSET_CLASSES.has(tx.assetClass);
  const aboveThreshold = tx.amountUsd >= AED_55K_IN_USD;
  const isRound = tx.amountUsd > 3_000 && tx.amountUsd % 1_000 === 0;

  if (isCash && isPrecious) {
    if (!drivers.includes("cashPreciousMetals")) {
      drivers.push("cashPreciousMetals");
    }
    // Cash gold/silver/precious stones is a documented ML red flag under UAE DPMS.
    // Minimum tier is "flag"; never "pass" for this combination.
    if (tier === "pass") { tier = "flag"; score = Math.max(score, 0.76); }
  }

  if (isCash && aboveThreshold) {
    if (!drivers.includes("cashAboveAed55kThreshold")) {
      drivers.push("cashAboveAed55kThreshold"); // MoE Circular 2/2024 mandatory CDD trigger
    }
    if (tier === "pass") { tier = "flag"; score = Math.max(score, 0.76); }
  }

  if (isRound && !drivers.includes("isRoundAmount")) {
    drivers.push("isRoundAmount"); // Structuring signal — threshold avoidance indicator
  }

  // If score > 0.5 but drivers is still empty, add a generic high-score driver
  // so operators can see why the transaction was elevated.
  if (score > 0.5 && drivers.length === 0) {
    drivers.push("mlAnomalyScore");
  }

  return { score, tier, drivers };
}

/**
 * PATTERN G — Possible Trafficking Proceeds (FATF Report 2018 typology)
 *
 * Multiple small recurring payments from many different senders to one
 * recipient (>20 distinct senders, recurring weekly) → flag as
 * "possible_trafficking_proceeds".
 * Score contribution: +0.30
 */
function detectTraffickingProceeds(tx: TransactionPayload): AnomalyFlag | null {
  const { distinctSenderCount, isWeeklyRecurring } = tx;
  if (
    typeof distinctSenderCount !== "number" ||
    distinctSenderCount <= 20 ||
    !isWeeklyRecurring
  ) return null;

  return {
    flagName: "possible_trafficking_proceeds",
    scoreContribution: 0.30,
    description:
      `${distinctSenderCount} distinct senders making weekly recurring payments to a single ` +
      `recipient. This aggregation pattern — many payers, one payee, regular cadence — ` +
      `is a documented indicator of trafficker control over victim earnings.`,
    fatfReference:
      "FATF Report: Financial Flows from Human Trafficking (2018), typology TIP-3: " +
      "aggregation of victim proceeds through controller accounts",
  };
}

/**
 * PATTERN H — High-Risk Cash-Intensive Business (FATF Report 2018 / FinCEN FIN-2014-A008)
 *
 * Cash receipts from adult-entertainment business codes (MCCs 7273, 7297, 5994,
 * and equivalent strings) → flag as "high_risk_cash_intensive".
 * Score contribution: +0.20
 */
const ADULT_ENTERTAINMENT_MCCS = new Set([
  "7273", // dating/escort services
  "7297", // massage parlors
  "5994", // news/tobacco stands (proxy for adult-entertainment venues)
  "7993", // gambling establishments (overlap with sex-tourism venues)
  "5813", // drinking places (overlap with trafficking front businesses)
]);

const ADULT_ENTERTAINMENT_STRINGS = [
  "escort", "adult entertainment", "massage parlor", "massage parlour",
  "strip club", "gentlemen club", "adult club",
];

function detectHighRiskCashIntensive(tx: TransactionPayload): AnomalyFlag | null {
  const mcc = tx.merchantCategoryCode ?? "";
  const isCash = tx.paymentMethod === "cash";
  if (!isCash) return null;

  const mccHit = ADULT_ENTERTAINMENT_MCCS.has(mcc.trim());
  const stringHit = ADULT_ENTERTAINMENT_STRINGS.some((s) =>
    mcc.toLowerCase().includes(s),
  );
  if (!mccHit && !stringHit) return null;

  return {
    flagName: "high_risk_cash_intensive",
    scoreContribution: 0.20,
    description:
      `Cash receipt from a merchant categorised as adult entertainment / massage / escort ` +
      `(category: "${mcc}"). Cash-intensive adult-entertainment businesses are a ` +
      `primary placement vehicle for human-trafficking proceeds.`,
    fatfReference:
      "FATF Report: Financial Flows from Human Trafficking (2018), typology TIP-1; " +
      "FinCEN Advisory FIN-2014-A008 (human trafficking red flags)",
  };
}

/**
 * PATTERN I — Cash-Intensive Drug Front Business Risk
 *             (FATF Report on Drug Trafficking Proceeds 2014; FinCEN FIN-2014-A008)
 *
 * Very high cash receipt volumes from business types commonly used as drug
 * trafficking fronts (nail salons, car washes, convenience stores, parking lots,
 * restaurants). When cashReceiptPct > 70% for these business categories, flag
 * as "cash_intensive_front_business_risk".
 * Score contribution: +0.20
 */
const DRUG_FRONT_BUSINESS_CATEGORIES: string[] = [
  "nail salon", "nail salons",
  "car wash", "carwash",
  "convenience store", "convenience stores",
  "parking lot", "parking garage",
  "restaurant", "restaurants",
  "fast food", "takeaway",
];

function detectCashIntensiveFrontBusiness(tx: TransactionPayload): AnomalyFlag | null {
  const { merchantBusinessCategory, cashReceiptPct, paymentMethod } = tx;
  if (!merchantBusinessCategory || typeof cashReceiptPct !== "number") return null;
  // Only triggers on cash transactions where cash receipt % is very high (>70%)
  if (paymentMethod !== "cash" || cashReceiptPct <= 70) return null;

  const categoryLower = merchantBusinessCategory.toLowerCase();
  const isFrontBusinessType = DRUG_FRONT_BUSINESS_CATEGORIES.some((cat) =>
    categoryLower.includes(cat),
  );
  if (!isFrontBusinessType) return null;

  return {
    flagName: "cash_intensive_front_business_risk",
    scoreContribution: 0.20,
    description:
      `Business category "${merchantBusinessCategory}" has ${cashReceiptPct.toFixed(0)}% ` +
      `cash receipts — well above the typical threshold for this sector. ` +
      `Nail salons, car washes, convenience stores, parking lots, and restaurants ` +
      `are documented fronts for drug trafficking proceeds placement. ` +
      `Cash commingling with legitimate revenue is a primary laundering method ` +
      `for retail narcotics networks.`,
    fatfReference:
      "FATF Report on Money Laundering from Drug Trafficking (2014), typology DT-5 " +
      "(cash-intensive business fronts); FinCEN Advisory FIN-2014-A008; " +
      "FATF NPML Guidance (2023) — cash placement through retail businesses",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Advanced pattern detection — runs all detection rules and applies score additions.
// ──────────────────────────────────────────────────────────────────────────────

function applyAdvancedPatterns(
  result: { score: number; tier: AnomalyTier; drivers: string[] },
  tx: TransactionPayload,
  now: Date,
): { score: number; tier: AnomalyTier; drivers: string[]; anomalyFlags: AnomalyFlag[] } {
  const anomalyFlags: AnomalyFlag[] = [];
  const drivers = [...result.drivers];
  let { score, tier } = result;

  const detectors = [
    detectStructuring(tx, now),
    detectRoundNumberPattern(tx),
    detectVelocitySpike(tx),
    detectGeographicDispersion(tx, now),
    detectDormantReactivation(tx, now),
    detectCorrespondentLayering(tx),
    detectTraffickingProceeds(tx),
    detectHighRiskCashIntensive(tx),
    detectCashIntensiveFrontBusiness(tx),
    detectWashTrading(tx, now),
    detectPumpDumpPattern(tx),
  ];

  for (const flag of detectors) {
    if (!flag) continue;
    anomalyFlags.push(flag);
    score = Math.min(1.0, score + flag.scoreContribution);
    if (!drivers.includes(flag.flagName)) {
      drivers.push(flag.flagName);
    }
  }

  // Re-evaluate tier based on updated score
  if (score >= 0.90) tier = "hold";
  else if (score >= 0.75) tier = "flag";

  return { score, tier, drivers, anomalyFlags };
}

// ──────────────────────────────────────────────────────────────────────────────
// POST handler
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: AnomalyRequestBody;
  try {
    body = (await req.json()) as AnomalyRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }

  const tx = body.transaction;
  if (!tx || typeof tx.amountUsd !== "number" || tx.amountUsd < 0) {
    return NextResponse.json(
      { ok: false, error: "transaction.amountUsd must be a non-negative number" },
      { status: 400, headers: { ...gate.headers, ...CORS } }
    );
  }

  const sessionId = body.sessionId?.trim() ?? "global";
  const streamingGate = getOrCreateGate(sessionId);

  // Compute geographic dispersion: distinct ISO-2 country codes in last 7 days
  // (FATF R.1/R.10). Include the current transaction's country if provided.
  const nowMs = tx.timestampUtc ? new Date(tx.timestampUtc).getTime() : Date.now();
  const sevenDaysMs = 7 * 24 * 3_600_000;
  const recentCountries = new Set<string>();
  if (tx.countryCode) recentCountries.add(tx.countryCode.toUpperCase());
  for (const t of tx.recentTransactions ?? []) {
    if (t.countryCode && nowMs - new Date(t.timestampUtc).getTime() <= sevenDaysMs) {
      recentCountries.add(t.countryCode.toUpperCase());
    }
  }
  const distinctCountries7d = recentCountries.size;

  const features = tx.features ?? extractFeatures({
    amountUsd: tx.amountUsd,
    customerBaseline: tx.customerBaseline,
    counterpartyFirstSeen: tx.counterpartyFirstSeen,
    countryRiskScore: tx.countryRiskScore,
    timestampUtc: tx.timestampUtc,
    distinctCountries7d,
  });

  const mlResult = streamingGate.scoreAndUpdate(features);

  // Apply rule-based DPMS compliance override (cash threshold, precious metals,
  // round-amount structuring signals) on top of the ML score.
  const dpmsResult = applyDpmsRules(mlResult, tx);

  // Apply advanced FATF-aligned detection patterns on top of DPMS result.
  const now = tx.timestampUtc ? new Date(tx.timestampUtc) : new Date();
  const result = applyAdvancedPatterns(dpmsResult, tx, now);

  // Persist flag/hold results to Blob storage so the transaction-monitor
  // cron can pick them up, run typology matching, and open cases.
  if (result.tier === "flag" || result.tier === "hold") {
    const tenant = tenantIdFromGate(gate);
    const flagId = `txf-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const record: TxnFlagRecord = {
      flagId,
      tenantId: tenant,
      sessionId,
      tier: result.tier,
      score: result.score,
      amountUsd: tx.amountUsd,
      timestampUtc: tx.timestampUtc ?? new Date().toISOString(),
      drivers: result.drivers,
      anomalyFlags: result.anomalyFlags,
      processed: false,
      createdAt: new Date().toISOString(),
    };
    void setJson(`hawkeye-txn-flags/${tenant}/${flagId}.json`, record)
      .catch((err) => console.error("[transaction-anomaly] flag persist failed:", err));
  }

  const MINIMUM_OBSERVATIONS = 30;
  const obs = streamingGate.observations;
  const dataQuality = {
    sufficient: obs >= MINIMUM_OBSERVATIONS,
    currentObservations: obs,
    minimumRequired: MINIMUM_OBSERVATIONS,
    ...(obs < MINIMUM_OBSERVATIONS
      ? {
          warningMessage:
            `Only ${obs} transaction(s) observed in this session. ` +
            `The model requires at least ${MINIMUM_OBSERVATIONS} observations to produce reliable anomaly scores. ` +
            `Scores below this threshold are indicative only — do not use as the sole basis for compliance action.`,
        }
      : {}),
  };
  const effectiveTier = obs < MINIMUM_OBSERVATIONS ? "insufficient_data" : result.tier;

  const latencyMs = Date.now() - t0;
  if (latencyMs > 5000) console.warn(`[transaction-anomaly] slow response latencyMs=${latencyMs}`);

  void writeAuditChainEntry(
    { event: "transaction_anomaly.updated", actor: gate.keyId, meta: { sessionId } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json(
    {
      ok: true,
      sessionId,
      observations: obs,
      score: result.score,
      tier: effectiveTier,
      drivers: result.drivers,
      anomalyFlags: result.anomalyFlags,
      dataQuality,
      latencyMs,
      detail: {
        hstScore: mlResult.hstScore,
        zScore: mlResult.zScore,
        features,
      },
    },
    { status: 200, headers: { ...CORS, ...gateHeaders } },
  );
}
