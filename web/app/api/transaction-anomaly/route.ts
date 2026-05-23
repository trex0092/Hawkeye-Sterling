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
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { setJson } from "@/lib/server/store";
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
      nFeatures: 8,
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

// ──────────────────────────────────────────────────────────────────────────────
// Advanced pattern detection — runs all 6 new rules and applies score additions.
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

  const features = tx.features ?? extractFeatures({
    amountUsd: tx.amountUsd,
    customerBaseline: tx.customerBaseline,
    counterpartyFirstSeen: tx.counterpartyFirstSeen,
    countryRiskScore: tx.countryRiskScore,
    timestampUtc: tx.timestampUtc,
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
    const flagId = `txf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
