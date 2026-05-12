// POST /api/sar-probability
//
// Predicts the probability that a case will result in an STR filing
// BEFORE the MLRO manually reviews it. Uses risk signals + historical
// feedback loop data to score cases and prioritise the MLRO queue.
//
// Output: 0-100 probability score, key driving factors, recommended
// queue position (urgent / standard / low), and confidence level.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { stats as feedbackStats } from "@/lib/server/feedback";
import { getCurrentWeights } from "@/lib/server/risk-weight-calibrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface CaseSignals {
  riskScore: number;              // 0-100 composite risk score
  sanctionsHits: number;          // number of sanctions list hits
  pepStatus: boolean;             // is subject a PEP?
  adverseMediaCount: number;      // number of adverse media articles
  jurisdictionRisk: "low" | "medium" | "high" | "critical";
  cashIntensity: "low" | "medium" | "high";
  uboVerified: boolean;           // is beneficial ownership verified?
  tmAlerts: number;               // active TM alerts
  cddLevel: "basic" | "standard" | "enhanced";
  strHistory?: boolean;           // prior STR on this subject?
  behavioralDrift?: boolean;      // behavioral baseline drift detected?
  typologyMatch?: boolean;        // matched a known FATF typology?
  evidenceSufficiency?: "insufficient" | "partial" | "sufficient";
  notes?: string;
}

const JURISDICTION_SCORE: Record<string, number> = { low: 10, medium: 30, high: 60, critical: 90 };
const CASH_SCORE: Record<string, number> = { low: 10, medium: 30, high: 60 };
const CDD_SCORE: Record<string, number> = { basic: 0, standard: 15, enhanced: 35 };

function deterministicProbability(signals: CaseSignals, weights: Record<string, number>): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  const sanctionsW = weights["sanctionsHit"] ?? 0.25;
  const pepW = weights["pepStatus"] ?? 0.15;
  const adverseW = weights["adverseMedia"] ?? 0.08;
  const jurisdW = weights["jurisdictionTier"] ?? 0.12;

  if (signals.sanctionsHits > 0) {
    const contribution = Math.min(30, signals.sanctionsHits * 10) * (sanctionsW / 0.25);
    score += contribution;
    factors.push(`${signals.sanctionsHits} sanctions hit(s) — +${contribution.toFixed(0)} points`);
  }
  if (signals.pepStatus) {
    const contribution = 15 * (pepW / 0.15);
    score += contribution;
    factors.push(`PEP status — +${contribution.toFixed(0)} points`);
  }
  if (signals.adverseMediaCount > 0) {
    const contribution = Math.min(15, signals.adverseMediaCount * 3) * (adverseW / 0.08);
    score += contribution;
    factors.push(`${signals.adverseMediaCount} adverse media article(s) — +${contribution.toFixed(0)} points`);
  }
  const jurisdScore = JURISDICTION_SCORE[signals.jurisdictionRisk] ?? 30;
  const jurisdContrib = jurisdScore * (jurisdW / 0.12) * 0.15;
  score += jurisdContrib;
  if (signals.jurisdictionRisk !== "low") factors.push(`${signals.jurisdictionRisk} jurisdiction risk — +${jurisdContrib.toFixed(0)} points`);

  if (signals.tmAlerts > 0) {
    const contrib = Math.min(20, signals.tmAlerts * 5);
    score += contrib;
    factors.push(`${signals.tmAlerts} TM alert(s) — +${contrib.toFixed(0)} points`);
  }
  const cashContrib = CASH_SCORE[signals.cashIntensity] ?? 0;
  if (cashContrib > 10) { score += cashContrib * 0.2; factors.push(`${signals.cashIntensity} cash intensity — +${(cashContrib * 0.2).toFixed(0)} points`); }
  if (!signals.uboVerified) { score += 10; factors.push("UBO unverified — +10 points"); }
  if (signals.strHistory) { score += 20; factors.push("Prior STR on subject — +20 points"); }
  if (signals.behavioralDrift) { score += 12; factors.push("Behavioral drift detected — +12 points"); }
  if (signals.typologyMatch) { score += 15; factors.push("FATF typology match — +15 points"); }
  if (signals.evidenceSufficiency === "sufficient") { score += 10; factors.push("Sufficient evidence assembled — +10 points"); }
  if (signals.cddLevel === "enhanced") { score += CDD_SCORE["enhanced"]!; factors.push("EDD ongoing — +35 points"); }
  score += signals.riskScore * 0.3;

  return { score: Math.max(0, Math.min(100, Math.round(score))), factors };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let signals: CaseSignals;
  try { signals = await req.json() as CaseSignals; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (signals.riskScore === undefined) {
    return NextResponse.json({ ok: false, error: "riskScore required" }, { status: 400, headers: gate.headers });
  }

  const [weights, fbStats] = await Promise.all([
    getCurrentWeights().catch((err) => { console.warn("[sar-probability] weights load failed:", err instanceof Error ? err.message : err); return {} as Record<string, number>; }),
    feedbackStats().catch((err) => { console.warn("[sar-probability] feedbackStats failed:", err instanceof Error ? err.message : err); return null; }),
  ]);

  // Feedback-calibrated base probability
  const { score: deterministicScore, factors } = deterministicProbability(signals, weights as Record<string, number>);

  // Adjust for historical FP rate — if our model has been over-firing, discount
  let calibratedScore = deterministicScore;
  if (fbStats && fbStats.totalVerdicts >= 5) {
    const fpRate = fbStats.totalVerdicts > 0
      ? Object.values(fbStats.falsePositiveByPair).reduce((s, v) => s + v, 0) / fbStats.totalVerdicts
      : 0;
    // If FP rate > 40%, apply a downward calibration of up to 10 points
    if (fpRate > 0.4) {
      const discount = Math.round((fpRate - 0.4) * 25);
      calibratedScore = Math.max(0, calibratedScore - discount);
      factors.push(`Feedback calibration (FP rate ${(fpRate * 100).toFixed(0)}%) — -${discount} points`);
    }
  }

  const queuePriority = calibratedScore >= 70 ? "urgent" : calibratedScore >= 45 ? "standard" : "low";
  const recommendation = calibratedScore >= 75 ? "file_str" : calibratedScore >= 55 ? "edd_then_review" : calibratedScore >= 35 ? "monitor" : "close";

  // Optional LLM enrichment for narrative
  let narrative = "";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && calibratedScore >= 50) {
    try {
      const client = getAnthropicClient(apiKey, 18_000, "sar-probability");
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: "You are an AML analyst. Given a SAR probability score and key factors, write a 2-sentence rationale explaining the assessment. Be specific. Return plain text only.",
        messages: [{
          role: "user",
          content: `SAR probability: ${calibratedScore}%. Key factors: ${factors.join("; ")}. Jurisdiction risk: ${signals.jurisdictionRisk}. Write the rationale.`,
        }],
      });
      narrative = res.content[0]?.type === "text" ? (res.content[0] as { type: "text"; text: string }).text : "";
    } catch { /* narrative is non-blocking */ }
  }

  return NextResponse.json({
    ok: true,
    sarProbability: calibratedScore,
    deterministicScore,
    queuePriority,
    recommendation,
    keyFactors: factors,
    narrative,
    confidence: fbStats && fbStats.totalVerdicts >= 20 ? "high" : fbStats && fbStats.totalVerdicts >= 5 ? "medium" : "low",
    feedbackSignals: fbStats?.totalVerdicts ?? 0,
  }, { headers: gate.headers });
}
