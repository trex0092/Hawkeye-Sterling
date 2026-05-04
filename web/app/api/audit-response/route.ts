export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface AuditResponseResult {
  overallRating: "satisfactory" | "needs-improvement" | "unsatisfactory";
  responses: Array<{
    finding: string;
    response: string;
    rootCause: string;
    remediation: string;
    owner: string;
    deadline: string;
    evidence: string;
  }>;
  coveringLetter: string;
  regulatoryBasis: string;
}

const FALLBACK: AuditResponseResult = {
  overallRating: "needs-improvement",
  responses: [
    {
      finding: "CDD documentation incomplete for 7 high-risk customers",
      response:
        "We accept this finding. A full CDD refresh programme for all 12 high-risk customers has been initiated. 5 files have been completed; the remaining 7 will be finalised by 30 May 2025.",
      rootCause:
        "CDD refresh scheduling system failed to trigger reminders following the Q3 2024 system migration.",
      remediation:
        "Enhanced monitoring triggers have been implemented. All high-risk customers are now reviewed on a 6-month cycle with 30-day advance notification to the responsible KYC officer.",
      owner: "N. Patel (KYC Officer)",
      deadline: "30/05/2025",
      evidence:
        "Updated CDD files to be submitted to auditor by deadline date. System change log confirming new reminder triggers.",
    },
    {
      finding:
        "Transaction monitoring rule tuning not documented with Board sign-off",
      response:
        "We acknowledge the governance gap. All TM rule changes from Q4 2024 have been retrospectively documented. A formal TM governance policy has been drafted and will be presented to the Board Risk Committee at its next meeting (15 May 2025).",
      rootCause:
        "Prior practice relied on MLRO approval without formal escalation to Board committee.",
      remediation:
        "New TM Rule Change Policy requiring dual sign-off (MLRO + Board Risk Committee) effective immediately.",
      owner: "H. Al-Mansoori (MLRO)",
      deadline: "15/05/2025",
      evidence:
        "Draft TM governance policy v1.0, Board agenda item confirmation, retrospective sign-off minutes.",
    },
  ],
  coveringLetter:
    "Dear [Auditor Name],\n\nThank you for the draft audit report dated [DATE]. We welcome the findings as an opportunity to strengthen our AML/CFT framework.\n\nPlease find enclosed our management responses to each finding, along with root cause analyses, remediation plans, and committed deadlines. We are confident that the actions outlined will fully address all observations.\n\nWe remain committed to full compliance with UAE FDL 10/2025 and FATF Standards. We welcome the opportunity to discuss these responses at your convenience.\n\nYours faithfully,\n[MLRO Name]\nMLRO, Hawkeye Sterling DPMS",
  regulatoryBasis:
    "FATF R.26-28 (AML/CFT supervision), UAE FDL 10/2025 Art.20, CBUAE AML Standards §8 (audit)",
};

export async function POST(req: Request) {
  let body: {
    auditorName: string;
    auditDate: string;
    findings: string;
    institutionType: string;
    context: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "audit-response temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in regulatory audit response preparation under FATF R.26-28 and UAE FDL 10/2025. Prepare management responses to audit findings and return a JSON object with exactly these fields: { "overallRating": "satisfactory"|"needs-improvement"|"unsatisfactory", "responses": [{ "finding": string, "response": string, "rootCause": string, "remediation": string, "owner": string, "deadline": string, "evidence": string }], "coveringLetter": string, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Prepare management responses to the following audit findings:
- Auditor Name: ${body.auditorName}
- Audit Date: ${body.auditDate}
- Findings: ${body.findings}
- Institution Type: ${body.institutionType}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "audit-response temporarily unavailable - please retry." }, { status: 503 });

    const parsed = JSON.parse(jsonMatch[0]) as AuditResponseResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: false, error: "audit-response temporarily unavailable - please retry." }, { status: 503 });
  }
}
