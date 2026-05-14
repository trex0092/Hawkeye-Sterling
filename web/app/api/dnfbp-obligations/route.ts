export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export interface DnfbpObligationsResult {
  dnfbpCategory: string;
  dnfbpSubType: string;
  regulatoryAuthority: string;
  isRegulated: boolean;
  obligationTriggered: boolean;
  triggerThreshold?: string;
  triggerActivity?: string;
  cddRequired: boolean;
  cddLevel: "standard" | "simplified" | "enhanced" | "n/a";
  strRequired: boolean;
  strBasis?: string;
  ctrRequired: boolean;
  ctrThreshold?: string;
  registrationRequired: boolean;
  registrationBody?: string;
  keyObligations: Array<{
    obligation: string;
    legalBasis: string;
    deadline?: string;
    notes?: string;
  }>;
  prohibitedActivities: string[];
  recordKeepingYears: number;
  supervisoryBody: string;
  sanctionsForNonCompliance: string;
  regulatoryBasis: string;
  practicalGuidance: string;
}

const FALLBACK: DnfbpObligationsResult = {
  dnfbpCategory: "Dealers in Precious Metals and Stones (DPMS)",
  dnfbpSubType: "Licensed gold refiner / bullion dealer",
  regulatoryAuthority: "CBUAE / MoEI",
  isRegulated: true,
  obligationTriggered: true,
  triggerThreshold: "Cash transactions ≥ AED 55,000 OR any suspicious transaction regardless of amount",
  triggerActivity: "Purchase or sale of gold, silver, diamonds, or precious stones",
  cddRequired: true,
  cddLevel: "enhanced",
  strRequired: true,
  strBasis: "UAE FDL 10/2025 Art.26 — suspicion of ML/TF, no threshold. DPMS sector historically high-risk for TBML and value-based ML.",
  ctrRequired: true,
  ctrThreshold: "AED 55,000 per transaction — UAE FDL 10/2025 Art.17",
  registrationRequired: true,
  registrationBody: "MoEI Precious Metals and Stones Office + CBUAE goAML registration",
  keyObligations: [
    { obligation: "Customer identification and verification (CDD) before or during transaction", legalBasis: "UAE FDL 10/2025 Art.14", deadline: "Before transaction execution", notes: "UAE national: Emirates ID; Foreign national: passport + visa; Corporate: trade licence + UBO" },
    { obligation: "CTR filing for cash transactions ≥ AED 55,000", legalBasis: "UAE FDL 10/2025 Art.17", deadline: "Same/next business day" },
    { obligation: "STR filing within 2 business days of suspicion crystallisation", legalBasis: "UAE FDL 10/2025 Art.26" },
    { obligation: "Maintain transaction records and CDD documentation", legalBasis: "UAE FDL 10/2025 Art.16", notes: "Minimum 8 years" },
    { obligation: "Annual AML/CFT risk assessment update", legalBasis: "UAE FDL 10/2025 Art.20; CBUAE DPMS Guidelines 2022" },
    { obligation: "Appoint a Compliance Officer / MLRO", legalBasis: "UAE FDL 10/2025 Art.19" },
    { obligation: "Staff AML training — minimum annual", legalBasis: "UAE FDL 10/2025 Art.19(3)" },
    { obligation: "Screen customers against UAE EOCN sanctions list before any transaction", legalBasis: "UAE Cabinet Decision 74/2020" },
  ],
  prohibitedActivities: [
    "Cash transactions above AED 55,000 without CDD and CTR",
    "Purchasing gold without verifying seller identity",
    "Transactions with FATF grey/black list jurisdictions without enhanced CDD",
    "Tipping off a customer that an STR has been filed — FDL 10/2025 Art.25",
    "Purchasing gold from persons who cannot demonstrate legitimate source of the goods",
  ],
  recordKeepingYears: 8,
  supervisoryBody: "CBUAE (primary AML/CFT supervisor for DPMS); MoEI (DPMS trade licensing and sector supervision)",
  sanctionsForNonCompliance: "Administrative fines AED 50,000–AED 5,000,000; licence revocation; criminal prosecution of Compliance Officer/MLRO for non-filing",
  regulatoryBasis: "UAE FDL 10/2025 Art.14, 16, 17, 19, 20, 26; UAE Cabinet Decision 74/2020; CBUAE DPMS AML/CFT Guidelines 2022; FATF R.22 (DNFBP CDD); FATF R.23 (DNFBP reporting); UAE Cabinet Resolution 109/2023",
  practicalGuidance: "DPMS are among the highest-risk DNFBP sectors in UAE due to cash intensity, high value-to-weight ratio of gold, and use in TBML. Sector is a priority inspection target for CBUAE. Implement transaction monitoring, set cash acceptance policies, and ensure all staff complete annual FATF typology training specific to gold sector ML.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    dnfbpType: string;
    transactionType?: string;
    transactionAmount?: string;
    currency?: string;
    customerType?: string;
    jurisdiction?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  if (!body.dnfbpType?.trim()) return NextResponse.json({ ok: false, error: "dnfbpType required" }, { status: 400 , headers: gate.headers});

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "dnfbp-obligations temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1400,
        system: `You are a UAE AML/CFT specialist mapping Designated Non-Financial Business and Profession (DNFBP) obligations under UAE FDL 10/2025 and FATF Recommendations 22-23.\n\nUAE DNFBP categories and their specific obligations:\n\n1. DEALERS IN PRECIOUS METALS AND STONES (DPMS) — gold, silver, diamonds\n   - Supervisor: CBUAE + MoEI; CTR: AED 55,000; CDD at all transactions\n   - High-risk sector: TBML, value-based ML, gold sector typologies\n\n2. REAL ESTATE AGENTS AND BROKERS\n   - Supervisor: DLD (Dubai), ADREB (Abu Dhabi), or emirate equivalent\n   - CDD when facilitating purchase/sale transactions (not rental)\n   - CTR: AED 55,000 cash; RERA/DLD transaction reporting\n\n3. LAWYERS, NOTARIES, LEGAL PROFESSIONALS\n   - Obligation triggered only when acting as financial intermediary (property, corporate formation, managing client funds)\n   - Not triggered for litigation/legal advice\n   - Supervisor: relevant emirate legal department\n\n4. ACCOUNTANTS AND AUDITORS\n   - Triggered when preparing/executing financial transactions for clients, managing assets\n   - Supervisor: UAE Accountants and Auditors Association (AAA); MoE\n\n5. TRUST AND COMPANY SERVICE PROVIDERS (TCSPs)\n   - Forming, operating, or managing legal persons/arrangements\n   - Supervisor: MoEI; high UBO transparency obligations\n\n6. MONEY SERVICE BUSINESSES (MSBs / Hawalas)\n   - Licensed under CBUAE; FATF R.14; registration with MoE hawala registry\n   - All customer transactions require CDD; AML programme required\n\n7. VIRTUAL ASSET SERVICE PROVIDERS (VASPs)\n   - Supervised by VARA (Dubai) or ADGM FSRA; FATF R.15\n\nKey obligations for all DNFBPs (FDL 10/2025):\n- CDD (Art.14), Record keeping 8 years (Art.16), CTR ≥ AED 55,000 (Art.17), STR within 2 business days (Art.26), MLRO appointment (Art.19), Training (Art.19(3)), EOCN screening (Cabinet Decision 74/2020)\n\nRespond ONLY with valid JSON — no markdown fences:\n{\n  "dnfbpCategory": "<category>",\n  "dnfbpSubType": "<specific type>",\n  "regulatoryAuthority": "<authority>",\n  "isRegulated": <bool>,\n  "obligationTriggered": <bool>,\n  "triggerThreshold": "<if applicable>",\n  "triggerActivity": "<what triggers the obligation>",\n  "cddRequired": <bool>,\n  "cddLevel": "standard"|"simplified"|"enhanced"|"n/a",\n  "strRequired": <bool>,\n  "strBasis": "<if applicable>",\n  "ctrRequired": <bool>,\n  "ctrThreshold": "<if applicable>",\n  "registrationRequired": <bool>,\n  "registrationBody": "<if applicable>",\n  "keyObligations": [{"obligation":"<text>","legalBasis":"<citation>","deadline":"<if any>","notes":"<if any>"}],\n  "prohibitedActivities": ["<prohibition>"],\n  "recordKeepingYears": <number>,\n  "supervisoryBody": "<body>",\n  "sanctionsForNonCompliance": "<penalty summary>",\n  "regulatoryBasis": "<full citation>",\n  "practicalGuidance": "<paragraph>"\n}`,
        messages: [{
          role: "user",
          content: `DNFBP Type: ${body.dnfbpType}\nTransaction Type: ${body.transactionType ?? "not specified"}\nTransaction Amount: ${body.transactionAmount ?? "not specified"} ${body.currency ?? ""}\nCustomer Type: ${body.customerType ?? "not specified"}\nJurisdiction: ${body.jurisdiction ?? "UAE"}\nAdditional Context: ${body.context ?? "none"}\n\nMap the AML/CFT obligations for this DNFBP.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as DnfbpObligationsResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "dnfbp-obligations temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
