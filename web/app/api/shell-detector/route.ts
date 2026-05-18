export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface ShellRedFlag {
  flag: string;
  severity: "critical" | "high" | "medium" | "low";
  category: "structure" | "director" | "activity" | "geography" | "financial" | "documentation";
  fatfRef: string;
  detail: string;
}

export interface ShellDetectorResult {
  shellRisk: "critical" | "high" | "medium" | "low" | "clear";
  shellProbability: number;
  redFlags: ShellRedFlag[];
  structureIndicators: string[];
  jurisdictionRisk: "high" | "medium" | "low" | "none";
  layeringRisk: "high" | "medium" | "low" | "none";
  recommendedAction: "reject" | "escalate_mlro" | "enhanced_dd" | "verify_and_monitor" | "clear";
  actionRationale: string;
  requiredDocumentation: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    entityName: string;
    jurisdictionOfIncorporation?: string;
    directorNames?: string;
    shareholderStructure?: string;
    businessActivity?: string;
    yearsActive?: string;
    bankingArrangements?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.entityName?.trim()) return NextResponse.json({ ok: false, error: "entityName required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "shell-detector temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE AML specialist assessing corporate structures for shell company indicators under FATF Recommendation 24 and UAE FDL 10/2025. Red flags include: nominee directors/shareholders, bearer shares, complex multi-layer ownership without clear rationale, registered agent addresses, mismatch between declared activity and financial flows, companies in secrecy jurisdictions, BVI/Cayman/Marshall Islands intermediaries, no employees, no physical presence.

Respond ONLY with valid JSON — no markdown fences:
{
  "shellRisk": "critical"|"high"|"medium"|"low"|"clear",
  "shellProbability": <0-100>,
  "redFlags": [{"flag": "<flag>", "severity": "critical"|"high"|"medium"|"low", "category": "structure"|"director"|"activity"|"geography"|"financial"|"documentation", "fatfRef": "<citation>", "detail": "<explanation>"}],
  "structureIndicators": ["<indicator>"],
  "jurisdictionRisk": "high"|"medium"|"low"|"none",
  "layeringRisk": "high"|"medium"|"low"|"none",
  "recommendedAction": "reject"|"escalate_mlro"|"enhanced_dd"|"verify_and_monitor"|"clear",
  "actionRationale": "<paragraph>",
  "requiredDocumentation": ["<document>"],
  "regulatoryBasis": "<full citation>"
}`,
        messages: [
          {
            role: "user",
            content: `Entity Name: ${sanitizeField(body.entityName, 500)}
Jurisdiction of Incorporation: ${sanitizeField(body.jurisdictionOfIncorporation, 100) ?? "not specified"}
Director Names: ${sanitizeText(body.directorNames, 2000) ?? "not specified"}
Shareholder Structure: ${sanitizeText(body.shareholderStructure, 2000) ?? "not specified"}
Business Activity: ${sanitizeText(body.businessActivity, 2000) ?? "not specified"}
Years Active: ${sanitizeField(body.yearsActive, 50) ?? "not specified"}
Banking Arrangements: ${sanitizeText(body.bankingArrangements, 2000) ?? "not specified"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Assess this corporate structure for shell company red flags.`,
          },
        ],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as ShellDetectorResult;
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    if (!Array.isArray(result.structureIndicators)) result.structureIndicators = [];
    if (!Array.isArray(result.requiredDocumentation)) result.requiredDocumentation = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "shell-detector temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
