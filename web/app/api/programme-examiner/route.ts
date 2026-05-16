// POST /api/programme-examiner
//
// Programme-level AI FATF Mutual Evaluation Simulator.
//
// Unlike /api/examiner-sim (which reviews a single case), this route
// evaluates the ENTIRE AML/CFT programme against FATF's 11 Immediate
// Outcomes and 40 Recommendations — scoring each IO and returning:
//   - IO-level maturity score (0-100)
//   - Specific gaps per IO with article cross-references
//   - Examiner questions the MLRO must be prepared to answer
//   - Priority remediation roadmap
//
// Input: programme facts (policies in place, staff count, case volume,
//         technology stack, governance structure, recent findings)

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ProgrammeFacts {
  // Governance
  mlroAppointed?: boolean;
  boardOversight?: boolean;
  independentAudit?: boolean;
  // Policies
  amlPolicyUpdated?: string; // ISO date
  riskAppetiteStatement?: boolean;
  eddProcedures?: boolean;
  // Operations
  staffCount?: number;
  annualCaseVolume?: number;
  strFiledLast12m?: number;
  falsePositiveRate?: number;
  // Technology
  tmSystemVendor?: string;
  screeningVendor?: string;
  goamlConnected?: boolean;
  // Training
  lastTrainingDate?: string;
  trainingCoverage?: number; // % staff trained
  // Findings
  lastExamDate?: string;
  openFindings?: number;
  criticalFindings?: number;
  // Additional context
  additionalContext?: string;
}

const IO_DESCRIPTIONS: Record<string, string> = {
  "IO.1": "ML/TF risks understood and AML/CFT policies coordinated",
  "IO.2": "International cooperation effective",
  "IO.3": "Supervisors appropriately monitor reporting entities",
  "IO.4": "FIU produces actionable financial intelligence",
  "IO.5": "ML is investigated and criminals prosecuted",
  "IO.6": "TF is investigated and prosecuted",
  "IO.7": "Proliferation financing risks mitigated",
  "IO.8": "Proceeds of crime confiscated",
  "IO.9": "TF and PF financial flows prevented",
  "IO.10": "Non-profit organisations not misused for TF",
  "IO.11": "Beneficial ownership information available",
};

function heuristicAssessment(facts: ProgrammeFacts) {
  const ioScores: Record<string, number> = {};
  let base = 50;
  if (facts.mlroAppointed) base += 5;
  if (facts.boardOversight) base += 5;
  if (facts.independentAudit) base += 5;
  if (facts.eddProcedures) base += 5;
  if (facts.goamlConnected) base += 5;
  if ((facts.trainingCoverage ?? 0) > 80) base += 5;
  if ((facts.openFindings ?? 0) === 0) base += 5;
  if ((facts.criticalFindings ?? 0) > 0) base -= 15;
  for (const io of Object.keys(IO_DESCRIPTIONS)) {
    ioScores[io] = Math.max(20, Math.min(95, base + Math.floor(Math.random() * 20) - 10));
  }
  return ioScores;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: ProgrammeFacts;
  try { body = await req.json() as ProgrammeFacts; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const scores = heuristicAssessment(body);
    const overall = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / Object.keys(scores).length);
    return NextResponse.json({
      ok: true, overallScore: overall, ioScores: scores,
      gaps: ["Set ANTHROPIC_API_KEY for full AI examiner analysis"],
      examinerQuestions: [], remediationRoadmap: [], rating: overall >= 70 ? "Largely Compliant" : overall >= 50 ? "Partially Compliant" : "Non-Compliant",
    }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 55_000, "programme-examiner");

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 3000,
    system: `You are a FATF Mutual Evaluation Team Leader with 20 years of experience conducting mutual evaluations under the 2013 FATF Methodology. You are conducting a virtual assessment of a UAE DPMS (gold and precious metals dealer) AML/CFT programme under FDL 10/2025 and CBUAE AML Standards.

Score each of FATF's 11 Immediate Outcomes (IO.1–IO.11) from 0–100 based on the programme facts provided. For DPMS-specific obligations, focus on: IO.1 (risk understanding), IO.3 (supervision), IO.4 (STR quality), IO.11 (beneficial ownership).

Return ONLY valid JSON:
{
  "overallScore": <0-100>,
  "rating": "Non-Compliant|Partially Compliant|Largely Compliant|Compliant",
  "ioScores": {
    "IO.1": <0-100>, "IO.2": <0-100>, "IO.3": <0-100>, "IO.4": <0-100>,
    "IO.5": <0-100>, "IO.6": <0-100>, "IO.7": <0-100>, "IO.8": <0-100>,
    "IO.9": <0-100>, "IO.10": <0-100>, "IO.11": <0-100>
  },
  "gaps": [
    { "io": "IO.X", "gap": "<specific gap>", "severity": "critical|high|medium", "articleRef": "<FDL/CBUAE article>" }
  ],
  "examinerQuestions": [
    { "io": "IO.X", "question": "<exact examiner question>", "preparationNote": "<what evidence to prepare>" }
  ],
  "remediationRoadmap": [
    { "priority": 1, "action": "<action>", "deadline": "<suggested timeframe>", "io": "IO.X", "effort": "low|medium|high" }
  ],
  "strengthAreas": ["<area where programme performs well>"],
  "executiveSummary": "<3-4 sentence assessment>"
}`,
    messages: [{
      role: "user",
      content: `Programme Facts:\n${JSON.stringify(body, null, 2)}\n\nIO Descriptions for reference:\n${JSON.stringify(IO_DESCRIPTIONS, null, 2)}\n\nConduct the virtual assessment.`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";
  try {
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    if (!Array.isArray(result.gaps)) result.gaps = [];
    if (!Array.isArray(result.examinerQuestions)) result.examinerQuestions = [];
    if (!Array.isArray(result.remediationRoadmap)) result.remediationRoadmap = [];
    if (!Array.isArray(result.strengthAreas)) result.strengthAreas = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "examiner analysis failed — retry" }, { status: 500, headers: gate.headers });
  }
}
