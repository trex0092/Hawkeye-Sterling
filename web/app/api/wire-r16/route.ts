export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

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

const FALLBACK: WireR16Result = {
  r16Compliant: false,
  complianceLevel: "partially_compliant",
  verdict: "hold_and_request",
  verdictRationale: "Originator address / national ID number missing. Wire cannot be processed until FATF R.16 originator information is complete.",
  originatorCheck: { namePresent: true, accountPresent: true, addressOrIdPresent: false, missing: ["Originator address or national identification number"] },
  beneficiaryCheck: { namePresent: true, accountPresent: true, missing: [] },
  thresholdApplicable: true,
  thresholdAnalysis: "Transaction value exceeds USD 1,000 (AED 3,673) — full originator and beneficiary information mandatory under FATF R.16 §7.",
  requiredActions: [
    "Place wire transfer on hold",
    "Contact ordering institution within 3 business days to obtain missing originator information",
    "If information not received within 5 business days, return funds to sender",
    "File STR if refusal to provide information raises suspicion",
  ],
  timeLimit: "3 business days to request; 5 business days before mandatory return",
  regulatoryBasis: "FATF R.16 §7–§10; UAE FDL 10/2025 Art.19; Cabinet Resolution 134/2025 §4.3",
};

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
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE AML compliance specialist checking wire transfer compliance with FATF Recommendation 16 (Wire Transfers) and UAE FDL 10/2025 Art.19.

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
Originator Name: ${body.originatorName ?? "not provided"}
Originator Account: ${body.originatorAccount ?? "not provided"}
Originator Address: ${body.originatorAddress ?? "not provided"}
Originator ID/Passport: ${body.originatorId ?? "not provided"}
Originator Country: ${body.originatorCountry ?? "not provided"}
Beneficiary Name: ${body.beneficiaryName ?? "not provided"}
Beneficiary Account: ${body.beneficiaryAccount ?? "not provided"}
Beneficiary Country: ${body.beneficiaryCountry ?? "not provided"}
Amount: ${body.amount ?? "not provided"} ${body.currency ?? ""}
Purpose: ${body.purpose ?? "not provided"}
SWIFT Reference: ${body.swiftRef ?? "not provided"}

Assess FATF R.16 compliance.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as WireR16Result;
    if (!Array.isArray(result.requiredActions)) result.requiredActions = [];
    if (result.originatorCheck && !Array.isArray(result.originatorCheck.missing)) result.originatorCheck.missing = [];
    if (result.beneficiaryCheck && !Array.isArray(result.beneficiaryCheck.missing)) result.beneficiaryCheck.missing = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "wire-r16 temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
