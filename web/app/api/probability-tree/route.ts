import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Scenario {
  conditions: string[];
  probability: number;
  outcome: string;
}

interface ReqBody {
  riskScore: number;
  jurisdiction: string;
  entityType: string;
  pepTier?: string;
  amHits?: number;
}

const JURISDICTIONS_HIGH_RISK = ["Iran", "North Korea", "Syria", "Cuba", "Russia", "Myanmar", "Belarus"];
const JURISDICTIONS_MEDIUM_RISK = ["Pakistan", "UAE", "Turkey", "Nigeria", "Kenya", "Philippines", "Cambodia"];

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { riskScore, jurisdiction, entityType, pepTier, amHits = 0 } = body;
  if (riskScore === undefined || !jurisdiction || !entityType) {
    return NextResponse.json({ ok: false, error: "riskScore, jurisdiction, and entityType are required" }, { status: 400 , headers: gate.headers });
  }

  const jurisHighRisk = JURISDICTIONS_HIGH_RISK.some(j => jurisdiction.toLowerCase().includes(j.toLowerCase()));
  const jurisMedRisk = JURISDICTIONS_MEDIUM_RISK.some(j => jurisdiction.toLowerCase().includes(j.toLowerCase()));
  const isPEP = !!pepTier;
  const hasAMHits = amHits > 0;

  // Build probability tree
  const scenarios: Scenario[] = [];

  // Base clear probability
  let pClear = Math.max(5, 100 - riskScore - (jurisHighRisk ? 30 : jurisMedRisk ? 15 : 0) - (isPEP ? 20 : 0) - (amHits * 10));
  pClear = Math.min(80, Math.max(5, pClear));

  // Monitoring probability
  let pMonitor = riskScore >= 40 ? 30 : 20;
  pMonitor = Math.min(40, pMonitor + (jurisMedRisk ? 10 : 0) + (isPEP ? 5 : 0));

  // EDD probability
  let pEDD = riskScore >= 60 ? 30 : 15;
  pEDD = Math.min(40, pEDD + (isPEP ? 10 : 0) + (amHits * 5));

  // SAR probability
  let pSAR = amHits > 1 ? 20 : amHits === 1 ? 10 : 5;
  pSAR = Math.min(30, pSAR + (jurisHighRisk ? 15 : 0) + (riskScore >= 80 ? 10 : 0));

  // Exit probability
  let pExit = jurisHighRisk ? 20 : 5;
  pExit = Math.min(25, pExit + (riskScore >= 90 ? 10 : 0) + (hasAMHits && jurisHighRisk ? 5 : 0));

  // Normalise to 100%
  const total = pClear + pMonitor + pEDD + pSAR + pExit;
  const normalise = (p: number) => Math.round((p / total) * 100);

  scenarios.push({
    conditions: ["Risk score within acceptable band", "No adverse media", "No PEP/sanctions hits", `${jurisdiction} standard oversight`],
    probability: normalise(pClear),
    outcome: "CLEAR — standard onboarding/continuation",
  });

  scenarios.push({
    conditions: ["Elevated risk score", isPEP ? "PEP status" : "Industry exposure", jurisMedRisk ? "Medium-risk jurisdiction" : "Transaction profile"],
    probability: normalise(pMonitor),
    outcome: "MONITOR — enhanced ongoing monitoring",
  });

  scenarios.push({
    conditions: ["High risk score", isPEP ? `PEP Tier ${pepTier}` : "Complex ownership", "Source of wealth unclear"],
    probability: normalise(pEDD),
    outcome: "EDD — full enhanced due diligence required",
  });

  scenarios.push({
    conditions: [hasAMHits ? `${amHits} adverse media hit(s)` : "Transaction anomalies", jurisHighRisk ? "High-risk jurisdiction" : "Pattern inconsistency", "Suspicious indicators present"],
    probability: normalise(pSAR),
    outcome: "SAR — Suspicious Activity Report",
  });

  scenarios.push({
    conditions: [jurisHighRisk ? "Sanctioned/high-risk jurisdiction" : "Irreconcilable risk", "Cannot satisfy CDD requirements", "Business decision to exit"],
    probability: normalise(pExit),
    outcome: "EXIT — terminate relationship",
  });

  // Sort by probability
  scenarios.sort((a, b) => b.probability - a.probability);

  const primaryPath = scenarios[0]!.outcome;

  const decisionTree: Record<string, unknown> = {
    riskScoreBand: riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW",
    jurisdictionRisk: jurisHighRisk ? "HIGH" : jurisMedRisk ? "MEDIUM" : "LOW",
    pepStatus: isPEP ? `PEP Tier ${pepTier}` : "Non-PEP",
    adverseMediaHits: amHits,
    recommendedPath: primaryPath,
    confidence: `${scenarios[0]!.probability}%`,
  };

  return NextResponse.json({
    ok: true,
    scenarios,
    primaryPath,
    decisionTree,
  }, { headers: gate.headers });
}
