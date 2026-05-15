export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface GhostCompanyResult {
  ghostRisk: "critical" | "high" | "medium" | "low";
  ghostScore: number;
  indicators: string[];
  economicSubstanceGaps: string[];
  verificationSteps: string[];
  recommendedAction: string;
  regulatoryBasis: string;
}

const FALLBACK: GhostCompanyResult = {
  ghostRisk: "critical",
  ghostScore: 87,
  indicators: [
    "Company incorporated 18 months ago — zero filings since incorporation",
    "Registered address is a PO box shared with 340 other entities",
    "No employees — payroll records show nil returns for all 6 quarters",
    "No phone number, website, or verifiable physical presence",
    "Single bank account with only 2 transaction types: large inflows immediately withdrawn",
    "Trade licence shows 'General Trading' — maximum opacity, minimum specificity",
    "Director and shareholder are same individual, no independent governance",
  ],
  economicSubstanceGaps: [
    "No physical office — economic substance test failed (UAEDT Cabinet Decision 57/2020)",
    "No employees or operational expenditure consistent with stated revenue",
    "No IT infrastructure or operational assets",
    "Revenue pattern (AED 4.2M inflows) inconsistent with zero overhead",
  ],
  verificationSteps: [
    "Physical site visit by compliance officer — photograph premises",
    "Request audited financial statements signed by UAE-licensed auditor",
    "Obtain bank statements from all accounts — identify counterparty pattern",
    "Cross-check trade licence activity against transaction types",
    "Demand explanation for economic substance test compliance",
  ],
  recommendedAction:
    "Do not onboard without satisfactory resolution of all economic substance gaps. If existing customer: initiate enhanced CDD review and consider exit if substance cannot be demonstrated within 30 days.",
  regulatoryBasis:
    "UAE Economic Substance Regulations (Cabinet Decision 57/2020), FATF R.24 (legal persons), UAE FDL 10/2025 Art.7, CBUAE AML Standards §3.3",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    companyName: string;
    incorporationDate: string;
    tradeActivity: string;
    employeeCount: string;
    physicalAddress: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ghost-company temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in shell and ghost company detection. Assess economic substance and ghost company indicators under UAE regulations and FATF standards. Return valid JSON only matching the GhostCompanyResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess ghost/shell company risk for this entity.\n\nCompany: ${sanitizeField(body.companyName)}\nIncorporation Date: ${sanitizeField(body.incorporationDate)}\nTrade Activity: ${sanitizeField(body.tradeActivity)}\nEmployee Count: ${sanitizeField(body.employeeCount)}\nPhysical Address: ${sanitizeField(body.physicalAddress)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: ghostRisk, ghostScore (0-100), indicators[], economicSubstanceGaps[], verificationSteps[], recommendedAction, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as GhostCompanyResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "ghost-company temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
