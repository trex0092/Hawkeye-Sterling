// POST /api/aml-health-score
//
// AML Programme Health Score.
// Computes a composite score (0-100) for the overall effectiveness of a
// DPMS/DNFBP AML/CFT compliance programme based on control effectiveness
// across five pillars. Identifies weakest areas and generates a remediation
// priority list.
//
// Five pillars (equal 20% weight each):
//   1. Governance & Oversight — board engagement, MLRO authority, policies
//   2. Risk Assessment — EWRA completion, risk methodology, coverage
//   3. Customer Due Diligence — CDD/EDD quality, PEP/sanctions screening
//   4. Transaction Monitoring — TM system, alert management, STR rates
//   5. Training & Culture — staff training, reporting culture, testing
//
// Each pillar scored 0-100; composite = average of five.
// Output: composite score, pillar scores, weaknesses, action plan, band.
//
// Regulatory basis: FDL 10/2025; FATF R.1, R.7, R.10, R.18-21; CBUAE AML/CFT Guidelines

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

interface PillarInput {
  // Governance & Oversight
  hasAmlPolicy?: boolean;
  policyLastUpdatedDaysAgo?: number;          // days since last policy update
  hasDedicatedMlro?: boolean;
  mlroHasDirectBoardAccess?: boolean;
  boardAmlReportFrequency?: "annual" | "semi_annual" | "quarterly" | "none";
  hasInternalAuditFunction?: boolean;
  lastInternalAuditDaysAgo?: number;

  // Risk Assessment
  ewraCompletedThisYear?: boolean;
  ewraCoversAllRiskAreas?: boolean;           // geography, product, customer, channel
  riskAppetiteDocumented?: boolean;
  highRiskCustomerPercentage?: number;        // % of customer base flagged high-risk
  riskRatingMethodologyDocumented?: boolean;

  // Customer Due Diligence
  cddCompletionRate?: number;                 // % customers with complete CDD (0-100)
  eddCompletionRateHighRisk?: number;         // % high-risk customers with complete EDD
  sanctionsScreeningCoverage?: number;        // % customers screened (0-100)
  pepScreeningCoverage?: number;
  overdueEddReviewCount?: number;
  averageCddRefreshDaysOverdue?: number;

  // Transaction Monitoring
  hasTmSystem?: boolean;
  alertClosureRateLast90Days?: number;        // % alerts closed (0-100)
  strFilingRateLast12Months?: number;         // STRs filed per 1000 transactions
  falsePositiveRate?: number;                 // % alerts that are false positives (0-100)
  ctrComplianceRate?: number;                 // % CTRs filed on time (0-100)
  averageSarProcessingDays?: number;

  // Training & Culture
  staffTrainingCompletionRate?: number;       // % staff trained (0-100)
  trainingConductedThisYear?: boolean;
  hasWhistleblowerChannel?: boolean;
  internalSarReferralCount?: number;          // staff referrals in last 12 months
  amlTestingPassRate?: number;               // % passing AML test (0-100)
}

interface PillarScore {
  name: string;
  score: number;              // 0-100
  band: "strong" | "adequate" | "weak" | "critical";
  strengths: string[];
  weaknesses: string[];
}

interface HealthScoreResult {
  compositeScore: number;
  band: "strong" | "adequate" | "weak" | "critical";
  pillars: PillarScore[];
  topWeaknesses: string[];
  priorityActions: Array<{ priority: number; action: string; pillar: string; regulatoryBasis: string }>;
  aiRemediationPlan?: string;
  assessedAt: string;
}

function bandFor(score: number): PillarScore["band"] {
  if (score >= 75) return "strong";
  if (score >= 55) return "adequate";
  if (score >= 35) return "weak";
  return "critical";
}

function scoreGovernance(inp: PillarInput): PillarScore {
  let score = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (inp.hasAmlPolicy) { score += 20; strengths.push("AML policy documented"); }
  else weaknesses.push("No documented AML/CFT policy");

  const policyAge = inp.policyLastUpdatedDaysAgo ?? 999;
  if (policyAge <= 365) { score += 15; strengths.push("Policy updated within 12 months"); }
  else if (policyAge <= 730) { score += 8; }
  else weaknesses.push(`AML policy not updated in ${Math.round(policyAge / 365)} years`);

  if (inp.hasDedicatedMlro) { score += 20; strengths.push("Dedicated MLRO appointed"); }
  else weaknesses.push("No dedicated MLRO — FDL 10/2025 Art.23 requires MLRO appointment");

  if (inp.mlroHasDirectBoardAccess) { score += 15; strengths.push("MLRO has direct board access"); }
  else weaknesses.push("MLRO does not have direct board/senior management access");

  const boardFreq = inp.boardAmlReportFrequency;
  if (boardFreq === "quarterly" || boardFreq === "semi_annual") { score += 15; strengths.push("Regular board AML reporting"); }
  else if (boardFreq === "annual") { score += 10; }
  else weaknesses.push("No board AML reporting programme");

  if (inp.hasInternalAuditFunction) { score += 10; }
  const auditAge = inp.lastInternalAuditDaysAgo ?? 999;
  if (auditAge <= 365) { score += 5; strengths.push("Internal audit conducted this year"); }
  else if (auditAge > 730) weaknesses.push("Internal AML audit overdue by more than 1 year");

  return { name: "Governance & Oversight", score: Math.min(100, score), band: bandFor(Math.min(100, score)), strengths, weaknesses };
}

function scoreRiskAssessment(inp: PillarInput): PillarScore {
  let score = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (inp.ewraCompletedThisYear) { score += 30; strengths.push("EWRA completed this year (FDL Art.7)"); }
  else weaknesses.push("EWRA not completed this year — annual requirement (FDL 10/2025 Art.7)");

  if (inp.ewraCoversAllRiskAreas) { score += 20; strengths.push("EWRA covers all risk dimensions"); }
  else weaknesses.push("EWRA does not cover all required risk areas (customer, product, geography, channel)");

  if (inp.riskAppetiteDocumented) { score += 20; strengths.push("Risk appetite formally documented"); }
  else weaknesses.push("No documented risk appetite statement");

  if (inp.riskRatingMethodologyDocumented) { score += 20; strengths.push("Risk rating methodology documented"); }
  else weaknesses.push("Customer risk rating methodology not documented");

  const hrPct = inp.highRiskCustomerPercentage ?? -1;
  if (hrPct >= 0 && hrPct <= 30) { score += 10; }
  else if (hrPct > 30) weaknesses.push(`High risk customer rate ${hrPct}% is unusually high — review risk methodology`);

  return { name: "Risk Assessment", score: Math.min(100, score), band: bandFor(Math.min(100, score)), strengths, weaknesses };
}

function scoreCdd(inp: PillarInput): PillarScore {
  let score = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  const cddRate = inp.cddCompletionRate ?? 0;
  if (cddRate >= 95) { score += 25; strengths.push(`CDD completion rate ${cddRate}%`); }
  else if (cddRate >= 80) { score += 15; }
  else weaknesses.push(`CDD completion rate ${cddRate}% — significant gap`);

  const eddRate = inp.eddCompletionRateHighRisk ?? 0;
  if (eddRate >= 95) { score += 25; strengths.push(`EDD completion rate (high-risk) ${eddRate}%`); }
  else if (eddRate >= 80) { score += 15; }
  else weaknesses.push(`EDD completion rate for high-risk customers ${eddRate}% — critical gap`);

  const sanctRate = inp.sanctionsScreeningCoverage ?? 0;
  if (sanctRate >= 99) { score += 20; strengths.push("Near-complete sanctions screening coverage"); }
  else if (sanctRate >= 90) { score += 12; }
  else weaknesses.push(`Sanctions screening coverage ${sanctRate}% — regulatory breach risk`);

  const pepRate = inp.pepScreeningCoverage ?? 0;
  if (pepRate >= 99) { score += 15; }
  else if (pepRate < 90) weaknesses.push(`PEP screening coverage ${pepRate}% — mandatory requirement`);

  const overdue = inp.overdueEddReviewCount ?? 0;
  if (overdue === 0) { score += 10; strengths.push("No overdue EDD reviews"); }
  else if (overdue <= 5) { score += 5; }
  else weaknesses.push(`${overdue} overdue EDD reviews`);

  const avgOverdue = inp.averageCddRefreshDaysOverdue ?? 0;
  if (avgOverdue > 90) weaknesses.push(`Average CDD refresh overdue by ${avgOverdue} days`);
  else if (avgOverdue === 0) score += 5;

  return { name: "Customer Due Diligence", score: Math.min(100, score), band: bandFor(Math.min(100, score)), strengths, weaknesses };
}

function scoreTm(inp: PillarInput): PillarScore {
  let score = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (inp.hasTmSystem) { score += 20; strengths.push("Transaction monitoring system in place"); }
  else weaknesses.push("No automated transaction monitoring system");

  const closureRate = inp.alertClosureRateLast90Days ?? 0;
  if (closureRate >= 90) { score += 20; strengths.push(`Alert closure rate ${closureRate}%`); }
  else if (closureRate >= 70) { score += 12; }
  else weaknesses.push(`Alert closure rate ${closureRate}% — alert backlog risk`);

  const ctrRate = inp.ctrComplianceRate ?? 0;
  if (ctrRate >= 99) { score += 20; strengths.push("Near-perfect CTR filing compliance"); }
  else if (ctrRate >= 90) { score += 12; }
  else weaknesses.push(`CTR on-time filing rate ${ctrRate}% — regulatory breach (FDL Art.16)`);

  const fpRate = inp.falsePositiveRate ?? 100;
  if (fpRate <= 20) { score += 15; strengths.push(`Low false positive rate ${fpRate}%`); }
  else if (fpRate <= 50) { score += 8; }
  else weaknesses.push(`False positive rate ${fpRate}% — TM calibration needed`);

  const sarDays = inp.averageSarProcessingDays ?? 999;
  if (sarDays <= 14) { score += 15; strengths.push(`Average SAR processing ${sarDays} days`); }
  else if (sarDays <= 35) { score += 8; }
  else weaknesses.push(`Average SAR processing ${sarDays} days — exceeds 35-day deadline risk`);

  const strRate = inp.strFilingRateLast12Months ?? 0;
  if (strRate > 0) { score += 10; }
  else weaknesses.push("Zero STRs filed in last 12 months — TM may not be effective");

  return { name: "Transaction Monitoring", score: Math.min(100, score), band: bandFor(Math.min(100, score)), strengths, weaknesses };
}

function scoreTraining(inp: PillarInput): PillarScore {
  let score = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  const trainingRate = inp.staffTrainingCompletionRate ?? 0;
  if (trainingRate >= 95) { score += 30; strengths.push(`Staff training completion ${trainingRate}%`); }
  else if (trainingRate >= 80) { score += 18; }
  else weaknesses.push(`Staff training completion ${trainingRate}% — FDL Art.22 requires annual training`);

  if (inp.trainingConductedThisYear) { score += 20; }
  else weaknesses.push("AML training not conducted this year");

  if (inp.hasWhistleblowerChannel) { score += 20; strengths.push("Whistleblower / internal reporting channel in place"); }
  else weaknesses.push("No whistleblower channel — limits internal STR referral culture");

  const referrals = inp.internalSarReferralCount ?? 0;
  if (referrals >= 3) { score += 15; strengths.push(`${referrals} internal SAR referrals indicate healthy reporting culture`); }
  else if (referrals === 0) weaknesses.push("No internal SAR referrals — may indicate weak reporting culture");

  const passRate = inp.amlTestingPassRate ?? 0;
  if (passRate >= 90) { score += 15; strengths.push(`AML test pass rate ${passRate}%`); }
  else if (passRate >= 70) { score += 8; }
  else weaknesses.push(`AML test pass rate ${passRate}% — knowledge gaps identified`);

  return { name: "Training & Culture", score: Math.min(100, score), band: bandFor(Math.min(100, score)), strengths, weaknesses };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { programmeData: PillarInput; generateRemediationPlan?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { programmeData, generateRemediationPlan = false } = body;
  if (!programmeData) {
    return NextResponse.json({ error: "programmeData is required" }, { status: 400 });
  }

  const pillars = [
    scoreGovernance(programmeData),
    scoreRiskAssessment(programmeData),
    scoreCdd(programmeData),
    scoreTm(programmeData),
    scoreTraining(programmeData),
  ];

  const compositeScore = Math.round(pillars.reduce((s, p) => s + p.score, 0) / pillars.length);
  const band = bandFor(compositeScore);

  const topWeaknesses = pillars
    .flatMap((p) => p.weaknesses.map((w) => `[${p.name}] ${w}`))
    .slice(0, 10);

  const priorityActions = pillars
    .filter((p) => p.weaknesses.length > 0)
    .sort((a, b) => a.score - b.score)
    .flatMap((p, idx) =>
      p.weaknesses.slice(0, 2).map((w, wi) => ({
        priority: idx * 2 + wi + 1,
        action: w,
        pillar: p.name,
        regulatoryBasis: "FDL 10/2025",
      }))
    )
    .slice(0, 10);

  const result: HealthScoreResult = {
    compositeScore,
    band,
    pillars,
    topWeaknesses,
    priorityActions,
    assessedAt: new Date().toISOString(),
  };

  if (generateRemediationPlan) {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
      const anthropic = getAnthropicClient(apiKey, 20_000, "aml-health-score");
      const weakPillars = pillars.filter((p) => p.score < 60);
      const prompt = `You are a UAE AML compliance consultant. The following AML programme assessment has been completed:

Composite score: ${compositeScore}/100 (${band})
${pillars.map((p) => `${p.name}: ${p.score}/100 (${p.band})`).join("\n")}

Top weaknesses:
${topWeaknesses.slice(0, 6).map((w) => `- ${w}`).join("\n")}

Write a practical 4-6 bullet remediation plan focused on the weakest areas (${weakPillars.map((p) => p.name).join(", ")}). Each bullet should be actionable, time-bound, and cite the relevant UAE FDL 10/2025 article.`;

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      });
      const block = msg.content[0];
      result.aiRemediationPlan = block?.type === "text" ? (block as { type: "text"; text: string }).text.trim() : undefined;
    } catch (err) {
      console.warn("[aml-health-score] AI remediation plan failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json(result);
}
