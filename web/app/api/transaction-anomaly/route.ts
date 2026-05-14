// POST /api/transaction-anomaly
// Real-time streaming transaction anomaly scoring.
// Implements a TypeScript port of PySAD's HalfSpaceTrees + z-score ensemble.
// Scores transactions one at a time; model updates itself with each observation.
// Routes output to three tiers: pass / flag (same-day review) / hold (immediate).
//
// Body: { transaction: TransactionPayload, sessionId?: string }
// The sessionId groups transactions from the same customer session so the
// streaming model accumulates state across calls.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { setJson } from "@/lib/server/store";
import {
  StreamingAnomalyGate,
  extractFeatures,
} from "../../../../dist/src/brain/streaming-anomaly.js";
import type { AnomalyFeatureVector, AnomalyTier } from "../../../../dist/src/brain/streaming-anomaly.js";

export interface TxnFlagRecord {
  flagId: string;
  tenantId: string;
  sessionId: string;
  tier: "flag" | "hold";
  score: number;
  amountUsd: number;
  timestampUtc: string;
  drivers: string[];
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

// In-memory gate store keyed by sessionId.
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
}

interface AnomalyRequestBody {
  transaction: TransactionPayload;
  sessionId?: string;
}

// AED/USD exchange rate for threshold conversion.
// AED 55,000 mandatory CDD threshold (MoE Circular 2/2024) ≈ USD 14,985.
const AED_55K_IN_USD = 14_985;

// Precious metals and stones asset classes that trigger DPMS rules.
const PRECIOUS_ASSET_CLASSES = new Set(["gold", "silver", "platinum", "diamonds", "precious_stones", "jewellery", "watches"]);

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

export async function POST(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: AnomalyRequestBody;
  try {
    body = (await req.json()) as AnomalyRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  const tx = body.transaction;
  if (!tx || typeof tx.amountUsd !== "number" || tx.amountUsd < 0) {
    return NextResponse.json(
      { ok: false, error: "transaction.amountUsd must be a non-negative number" },
      { status: 400, headers: CORS },
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
  const result = applyDpmsRules(mlResult, tx);

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
