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
import {
  StreamingAnomalyGate,
  extractFeatures,
} from "../../../../dist/src/brain/streaming-anomaly.js";
import type { AnomalyFeatureVector } from "../../../../dist/src/brain/streaming-anomaly.js";

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
}

interface AnomalyRequestBody {
  transaction: TransactionPayload;
  sessionId?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
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

  const result = streamingGate.scoreAndUpdate(features);

  return NextResponse.json(
    {
      ok: true,
      sessionId,
      observations: streamingGate.observations,
      score: result.score,
      tier: result.tier,
      drivers: result.drivers,
      detail: {
        hstScore: result.hstScore,
        zScore: result.zScore,
        features,
      },
    },
    { status: 200, headers: { ...CORS, ...gateHeaders } },
  );
}
