export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export interface WireR16Result {
  r16Compliant: boolean;
  complianceLevel: "fully_compliant" | "partially_compliant" | "non_compliant";
  verdict: "stp" | "hold_and_request" | "return_to_sender" | "freeze_and_report";
  verdictRationale: string;
  originatorCheck: {
    namePresent: boolean;
    accountPresent: boolean;
    addressOrIdPresent: boolean;
    missing: string[];
  };
  beneficiaryCheck: {
    namePresent: boolean;
    accountPresent: boolean;
    missing: string[];
  };
  thresholdApplicable: boolean;
  thresholdAnalysis: string;
  requiredActions: string[];
  timeLimit: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    originatorName?: string;
    originatorAccount?: string;
    originatorAddress?: string;
    originatorId?: string;
    originatorCountry?: string;
    beneficiaryName?: string;
    beneficiaryAccount?: string;
    beneficiaryCountry?: string;
    amount?: string;
    currency?: string;
    purpose?: string;
    swiftRef?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "wire-r16 temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE AML compliance specialist checking wire transfer compliance with FATF Recommendation 16 (Wire Transfers) and UAE Federal Decree-Law No. 10 of 2025 Art.19.

Evaluate whether the wire transfer details provided meet FATF R.16 mandatory originator and beneficiary information requirements. For transfers ≥ USD 1,000 (AED ~3,673): full name, account number, and address/national ID required for originator; full name and account number for beneficiary. For transfers < USD 1,000: name and account number sufficient.

Respond ONLY with valid JSON — no markdown fences:
{
  "r16Compliant": <true|false>,
  "complianceLevel": "fully_compliant"|"partially_compliant"|"non_compliant",
  "verdict": "stp"|"hold_and_request"|"return_to_sender"|"freeze_and_report",
  "verdictRationale": "<one paragraph>",
  "originatorCheck": { "namePresent": <bool>, "accountPresent": <bool>, "addressOrIdPresent": <bool>, "missing": ["<field>"] },
  "beneficiaryCheck": { "namePresent": <bool>, "accountPresent": <bool>, "missing": ["<field>"] },
  "thresholdApplicable": <bool>,
  "thresholdAnalysis": "<analysis of threshold applicability>",
  "requiredActions": ["<action>"],
  "timeLimit": "<applicable time limit>",
  "regulatoryBasis": "<citation>"
}`,
        messages: [{
          role: "user",
          content: `Wire Transfer Details:
Originator Name: ${sanitizeField(body.originatorName, 200) || "not provided"}
Originator Account: ${sanitizeField(body.originatorAccount, 100) || "not provided"}
Originator Address: ${sanitizeField(body.originatorAddress, 300) || "not provided"}
Originator ID/Passport: ${sanitizeField(body.originatorId, 100) || "not provided"}
Originator Country: ${sanitizeField(body.originatorCountry, 100) || "not provided"}
Beneficiary Name: ${sanitizeField(body.beneficiaryName, 200) || "not provided"}
Beneficiary Account: ${sanitizeField(body.beneficiaryAccount, 100) || "not provided"}
Beneficiary Country: ${sanitizeField(body.beneficiaryCountry, 100) || "not provided"}
Amount: ${sanitizeField(body.amount, 50) || "not provided"} ${sanitizeField(body.currency, 10) || ""}
Purpose: ${sanitizeField(body.purpose, 500) || "not provided"}
SWIFT Reference: ${sanitizeField(body.swiftRef, 50) || "not provided"}

Assess FATF R.16 compliance.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as WireR16Result;
    if (!Array.isArray(result.requiredActions)) result.requiredActions = [];
    if (result.originatorCheck && !Array.isArray(result.originatorCheck.missing)) result.originatorCheck.missing = [];
    if (result.beneficiaryCheck && !Array.isArray(result.beneficiaryCheck.missing)) result.beneficiaryCheck.missing = [];
    void writeAuditChainEntry(
      {
        event: "wire_r16_compliance_checked",
        actor: gate.keyId,
        r16Compliant: result.r16Compliant,
        complianceLevel: result.complianceLevel,
        verdict: result.verdict,
      },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "wire-r16 temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
