export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
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

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
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
      { status: 400, headers: gate.headers }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "audit-response temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
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
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "audit-response temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as AuditResponseResult;
    if (!Array.isArray(parsed.responses)) parsed.responses = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "audit-response temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
