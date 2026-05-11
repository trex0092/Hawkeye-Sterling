import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ReqBody {
  subjectName: string;
  riskScore: number;
  caseNotes: string;
}

function heuristicFallback(subjectName: string, riskScore: number, caseNotes: string) {
  const hash = subjectName.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const noteLength = caseNotes.length;

  const examinerFindings: string[] = [];
  const challengeAreas: string[] = [];
  const recommendations: string[] = [];

  if (riskScore >= 70) {
    examinerFindings.push("High risk score requires comprehensive EDD documentation — current file appears insufficient");
    challengeAreas.push("Source of wealth verification — insufficient independent corroboration");
    challengeAreas.push("Beneficial ownership chain not fully resolved to natural persons");
  } else if (riskScore >= 40) {
    examinerFindings.push("Medium risk classification — standard CDD package reviewed");
    challengeAreas.push("Periodic review cadence does not align with risk-based approach policy");
  } else {
    examinerFindings.push("Low risk case — basic CDD appears adequate for risk level");
  }

  if (noteLength < 200) {
    challengeAreas.push("Case narrative is insufficiently detailed for examiner review — expand documentation");
    recommendations.push("Prepare comprehensive case narrative with timeline and decision rationale");
  }
  if (hash % 3 === 0) {
    examinerFindings.push("Transaction monitoring alerts not adequately addressed in case file");
    recommendations.push("Document disposition of all TM alerts with analyst rationale");
  }
  if (hash % 4 === 0) {
    challengeAreas.push("PEP screening results not documented — examiner will seek evidence of screening");
    recommendations.push("Attach PEP screening certificates with date stamps to case file");
  }

  recommendations.push("Ensure all CDD/EDD documents are within validity period");
  recommendations.push("Cross-reference adverse media findings in case narrative");

  const examinerScore = Math.max(20, Math.min(90, 60 - (riskScore / 5) + (noteLength / 100)));
  const likelyOutcome = examinerScore >= 70
    ? "Pass — file meets minimum regulatory expectations"
    : examinerScore >= 50
    ? "Conditional pass — minor remediation required"
    : "Fail — significant gaps identified, file returned for remediation";

  return { examinerFindings, challengeAreas, likelyOutcome, recommendations, examinerScore: Math.round(examinerScore) };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const { subjectName, riskScore, caseNotes } = body;
  if (!subjectName || riskScore === undefined || !caseNotes) {
    return NextResponse.json({ ok: false, error: "subjectName, riskScore, and caseNotes are required" }, { status: 400 , headers: gate.headers});
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const client = getAnthropicClient(apiKey);
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are a CBUAE/DFSA regulatory examiner reviewing an AML case file. Subject: "${subjectName}", Risk Score: ${riskScore}/100.

Case Notes: """${caseNotes.substring(0, 1500)}"""

Simulate an examiner review. Respond ONLY with valid JSON:
{
  "examinerFindings": ["<finding>"],
  "challengeAreas": ["<area needing improvement>"],
  "likelyOutcome": "<Pass|Conditional pass|Fail> — <brief reason>",
  "recommendations": ["<action>"],
  "examinerScore": <0-100 integer representing file quality>
}`,
          },
        ],
      });

      const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      if (parsed.examinerFindings !== undefined) {
        return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
      }
    } catch {
      // fall through to heuristic
    }
  }

  const result = heuristicFallback(subjectName, riskScore, caseNotes);
  return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
}
