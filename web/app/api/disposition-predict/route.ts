// POST /api/disposition-predict
//
// ML Disposition Predictor — rule-based heuristic that predicts the likely
// disposition outcome for a subject based on their risk profile. Returns
// probability scores for each possible outcome with key drivers.
//
// Body: { score, jurisdiction, entityType, industry, amHits, pepTier }
// Response: { predictions: Array<{ disposition, probability, drivers }> }

import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DispositionPredictBody {
  score: number;
  jurisdiction?: string;
  entityType?: string;
  industry?: string;
  amHits?: number;
  pepTier?: string | null;
}

interface Prediction {
  disposition: string;
  probability: number;
  confidence: "high" | "medium" | "low";
  drivers: string[];
}

interface PredictionResponse {
  ok: boolean;
  predictions: Prediction[];
  primaryRecommendation: string;
  regulatoryBasis: string;
  modelVersion: string;
}

// High-risk jurisdictions per FATF grey/black list
const HIGH_RISK_JURISDICTIONS = new Set([
  "AF", "MM", "KP", "IR", "YE", "LY", "SO", "SS", "SD",
  "Afghanistan", "Myanmar", "North Korea", "Iran", "Yemen", "Libya",
  "Somalia", "South Sudan", "Sudan",
]);

const CAHRA_JURISDICTIONS = new Set([
  "AF", "IQ", "LY", "ML", "SD", "SO", "SS", "SY", "YE",
  "Afghanistan", "Iraq", "Libya", "Mali", "Sudan", "Somalia",
  "South Sudan", "Syria", "Yemen",
]);

function computePredictions(body: DispositionPredictBody): Prediction[] {
  const {
    score = 0,
    jurisdiction = "",
    entityType = "individual",
    industry = "",
    amHits = 0,
    pepTier = null,
  } = body;

  const isHighRiskJurisdiction = HIGH_RISK_JURISDICTIONS.has(jurisdiction);
  const isCahra = CAHRA_JURISDICTIONS.has(jurisdiction);
  const isPep = Boolean(pepTier) && pepTier !== "none";
  const isTier1Pep = pepTier === "1" || pepTier === "tier-1" || pepTier === "PEP-1";
  const hasAdverseMedia = amHits > 0;
  const isHighRiskIndustry = /gold|crypto|cash|money|exchang|real.?estate|gaming|casino/i.test(industry);
  const isCorporate = /corporate|organisation|company/i.test(entityType);

  // Base probabilities shifted by risk factors
  let clearProb = 50;
  let monitorProb = 20;
  let eddProb = 15;
  let strProb = 10;
  let rejectProb = 5;

  const drivers: { clear: string[]; monitor: string[]; edd: string[]; str: string[]; reject: string[] } = {
    clear: [],
    monitor: [],
    edd: [],
    str: [],
    reject: [],
  };

  // Score-based adjustments
  if (score >= 80) {
    clearProb -= 40;
    strProb += 20;
    eddProb += 10;
    rejectProb += 10;
    drivers.str.push(`High composite risk score (${score})`);
  } else if (score >= 60) {
    clearProb -= 20;
    eddProb += 15;
    monitorProb += 5;
    drivers.edd.push(`Elevated risk score (${score})`);
  } else if (score >= 40) {
    monitorProb += 10;
    clearProb -= 5;
    drivers.monitor.push(`Moderate risk score (${score})`);
  } else {
    clearProb += 15;
    monitorProb -= 5;
    drivers.clear.push(`Low risk score (${score})`);
  }

  // PEP adjustments
  if (isTier1Pep) {
    clearProb -= 25;
    eddProb += 20;
    strProb += 5;
    drivers.edd.push("Tier-1 PEP — senior management approval mandatory");
  } else if (isPep) {
    clearProb -= 10;
    eddProb += 10;
    drivers.edd.push("PEP designation — enhanced due diligence required");
  }

  // Adverse media adjustments
  if (amHits >= 3) {
    clearProb -= 20;
    strProb += 15;
    eddProb += 5;
    drivers.str.push(`${amHits} adverse media hits — significant negative coverage`);
  } else if (amHits === 1 || amHits === 2) {
    clearProb -= 10;
    eddProb += 10;
    drivers.edd.push(`${amHits} adverse media hit(s) require investigation`);
  }

  // Jurisdiction adjustments
  if (isCahra) {
    clearProb -= 20;
    strProb += 15;
    rejectProb += 5;
    drivers.str.push("CAHRA jurisdiction — conflict-affected high-risk area");
  } else if (isHighRiskJurisdiction) {
    clearProb -= 15;
    eddProb += 10;
    strProb += 5;
    drivers.edd.push("FATF high-risk or monitored jurisdiction");
  }

  // Industry adjustments
  if (isHighRiskIndustry) {
    clearProb -= 10;
    monitorProb += 5;
    eddProb += 5;
    drivers.edd.push(`High-risk industry: ${industry}`);
  }

  // Corporate entity adjustments
  if (isCorporate) {
    eddProb += 5;
    monitorProb += 5;
    clearProb -= 10;
    drivers.edd.push("Corporate entity — UBO verification required");
  }

  // Low-risk signals
  if (score < 20 && !isPep && !hasAdverseMedia && !isHighRiskJurisdiction) {
    clearProb += 20;
    monitorProb -= 10;
    drivers.clear.push("No adverse factors detected");
  }

  // Normalize to ensure sum = 100
  const rawTotal = clearProb + monitorProb + eddProb + strProb + rejectProb;
  const factor = rawTotal > 0 ? 100 / rawTotal : 1;

  const predictions: Prediction[] = ([
    {
      disposition: "Clear",
      probability: Math.max(0, Math.round(clearProb * factor)),
      confidence: (score < 20 ? "high" : "medium") as Prediction["confidence"],
      drivers: drivers.clear.length > 0 ? drivers.clear : ["No major risk factors"],
    },
    {
      disposition: "Monitor",
      probability: Math.max(0, Math.round(monitorProb * factor)),
      confidence: "medium" as Prediction["confidence"],
      drivers: drivers.monitor.length > 0 ? drivers.monitor : ["Routine monitoring threshold"],
    },
    {
      disposition: "Enhanced Due Diligence",
      probability: Math.max(0, Math.round(eddProb * factor)),
      confidence: (isPep || isHighRiskJurisdiction ? "high" : "medium") as Prediction["confidence"],
      drivers: drivers.edd.length > 0 ? drivers.edd : ["Standard EDD triggers"],
    },
    {
      disposition: "Suspicious Transaction Report",
      probability: Math.max(0, Math.round(strProb * factor)),
      confidence: (score >= 80 ? "high" : "low") as Prediction["confidence"],
      drivers: drivers.str.length > 0 ? drivers.str : ["STR threshold analysis"],
    },
    {
      disposition: "Reject / Exit",
      probability: Math.max(0, Math.round(rejectProb * factor)),
      confidence: "low" as Prediction["confidence"],
      drivers: drivers.reject.length > 0 ? drivers.reject : ["Extreme risk scenario only"],
    },
  ] as Prediction[]).sort((a, b) => b.probability - a.probability);

  return predictions;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: DispositionPredictBody;
  try {
    body = (await req.json()) as DispositionPredictBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const predictions = computePredictions(body);
  const primary = predictions[0]!;

  const regulatoryBasis =
    "UAE FDL 10/2025 Art.11–14; FATF R.1 (RBA); FATF R.20 (STR); CBUAE AML Standards §2 (Risk Classification)";

  const response: PredictionResponse = {
    ok: true,
    predictions,
    primaryRecommendation: `Based on heuristic analysis, ${primary.disposition} is the most likely outcome (${primary.probability}% probability). ${primary.drivers[0] ?? ""}`,
    regulatoryBasis,
    modelVersion: "heuristic-rba-v1.0",
  };

  return NextResponse.json(response);
}
