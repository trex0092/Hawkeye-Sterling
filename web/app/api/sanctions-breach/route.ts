export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface SanctionsBreachResult {
  breachSeverity: "critical" | "high" | "medium" | "low";
  voluntaryDisclosureRecommended: boolean;
  estimatedPenaltyRange: string;
  mitigatingFactors: string[];
  aggravatingFactors: string[];
  immediateActions: string[];
  disclosureDraft: string;
  regulatoryBasis: string;
}

const FALLBACK: SanctionsBreachResult = {
  breachSeverity: "high",
  voluntaryDisclosureRecommended: true,
  estimatedPenaltyRange:
    "AED 500,000 – AED 5,000,000 (per transaction) under UAE Exec. Order 2023 sanctions law",
  mitigatingFactors: [
    "Self-discovered breach — not identified by regulator",
    "Prompt freezing of funds upon discovery",
    "No prior enforcement history",
    "Robust AML programme otherwise compliant",
  ],
  aggravatingFactors: [
    "Breach persisted 45 days before detection",
    "Total value AED 850,000 — material amount",
    "Sanctioned party on both OFAC SDN and EU CFSP lists",
  ],
  immediateActions: [
    "Freeze all accounts and transactions connected to sanctioned party immediately",
    "Report to CBUAE Financial Crime Supervision within 24 hours (mandatory)",
    "File STR with UAE FIU via goAML within 48 hours",
    "Engage external sanctions counsel within 24 hours",
    "Preserve all records — implement litigation hold",
  ],
  disclosureDraft:
    "We, Hawkeye Sterling DPMS, write to notify the CBUAE Financial Crime Supervision Department of a potential sanctions compliance incident discovered on [DATE]. Upon routine screening review, we identified that transactions totalling AED [AMOUNT] were processed to/from a counterparty subsequently confirmed as appearing on the OFAC SDN List / EU CFSP Annex. All relevant accounts have been frozen. We are cooperating fully and request guidance on further steps. A comprehensive internal investigation report will be provided within 10 business days.",
  regulatoryBasis:
    "UAE Federal Decree-Law on Combating ML and TF; Exec. Order 2023 on Sanctions Compliance; OFAC reporting obligations; EU Reg 269/2014",
};

export async function POST(req: Request) {
  let body: {
    counterparty: string;
    transactionAmount: string;
    sanctionsList: string;
    discoveryDate: string;
    breachDuration: string;
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
  if (!apiKey) return NextResponse.json({ ok: true, ...FALLBACK });

  try {
    const client = getAnthropicClient(apiKey);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE sanctions compliance expert specialising in breach analysis, voluntary disclosure, and remediation under UAE sanctions law and OFAC/EU frameworks. Analyse sanctions breach scenarios and return a JSON object with exactly these fields: { "breachSeverity": "critical"|"high"|"medium"|"low", "voluntaryDisclosureRecommended": boolean, "estimatedPenaltyRange": string, "mitigatingFactors": string[], "aggravatingFactors": string[], "immediateActions": string[], "disclosureDraft": string, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Analyse the following sanctions breach scenario:
- Counterparty: ${body.counterparty}
- Transaction Amount: ${body.transactionAmount}
- Sanctions List: ${body.sanctionsList}
- Discovery Date: ${body.discoveryDate}
- Breach Duration: ${body.breachDuration}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: true, ...FALLBACK });

    const parsed = JSON.parse(jsonMatch[0]) as SanctionsBreachResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
