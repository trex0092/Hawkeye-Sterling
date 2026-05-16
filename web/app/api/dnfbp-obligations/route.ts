export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.dnfbpType?.trim()) return NextResponse.json({ ok: false, error: "dnfbpType required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "dnfbp-obligations temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE AML/CFT specialist mapping Designated Non-Financial Business and Profession (DNFBP) obligations under UAE FDL 10/2025 and FATF Recommendations 22-23.

UAE DNFBP categories and their specific obligations:

1. DEALERS IN PRECIOUS METALS AND STONES (DPMS) — gold, silver, diamonds
   - Supervisor: CBUAE + MoEI; CTR: AED 55,000; CDD at all transactions
   - High-risk sector: TBML, value-based ML, gold sector typologies

2. REAL ESTATE AGENTS AND BROKERS
   - Supervisor: DLD (Dubai), ADREB (Abu Dhabi), or emirate equivalent
   - CDD when facilitating purchase/sale transactions (not rental)
   - CTR: AED 55,000 cash; RERA/DLD transaction reporting

3. LAWYERS, NOTARIES, LEGAL PROFESSIONALS
   - Obligation triggered only when acting as financial intermediary (property, corporate formation, managing client funds)
   - Not triggered for litigation/legal advice
   - Supervisor: relevant emirate legal department

4. ACCOUNTANTS AND AUDITORS
   - Triggered when preparing/executing financial transactions for clients, managing assets
   - Supervisor: UAE Accountants and Auditors Association (AAA); MoE

5. TRUST AND COMPANY SERVICE PROVIDERS (TCSPs)
   - Forming, operating, or managing legal persons/arrangements
   - Supervisor: MoEI; high UBO transparency obligations

6. MONEY SERVICE BUSINESSES (MSBs / Hawalas)
   - Licensed under CBUAE; FATF R.14; registration with MoE hawala registry
   - All customer transactions require CDD; AML programme required

7. VIRTUAL ASSET SERVICE PROVIDERS (VASPs)
   - Supervised by VARA (Dubai) or ADGM FSRA; FATF R.15

Key obligations for all DNFBPs (FDL 10/2025):
- CDD (Art.14), Record keeping 8 years (Art.16), CTR ≥ AED 55,000 (Art.17), STR within 2 business days (Art.26), MLRO appointment (Art.19), Training (Art.19(3)), EOCN screening (Cabinet Decision 74/2020)

Respond ONLY with valid JSON — no markdown fences:
{
  "dnfbpCategory": "<category>",
  "dnfbpSubType": "<specific type>",
  "regulatoryAuthority": "<authority>",
  "isRegulated": <bool>,
  "obligationTriggered": <bool>,
  "triggerThreshold": "<if applicable>",
  "triggerActivity": "<what triggers the obligation>",
  "cddRequired": <bool>,
  "cddLevel": "standard"|"simplified"|"enhanced"|"n/a",
  "strRequired": <bool>,
  "strBasis": "<if applicable>",
  "ctrRequired": <bool>,
  "ctrThreshold": "<if applicable>",
  "registrationRequired": <bool>,
  "registrationBody": "<if applicable>",
  "keyObligations": [{"obligation":"<text>","legalBasis":"<citation>","deadline":"<if any>","notes":"<if any>"}],
  "prohibitedActivities": ["<prohibition>"],
  "recordKeepingYears": <number>,
  "supervisoryBody": "<body>",
  "sanctionsForNonCompliance": "<penalty summary>",
  "regulatoryBasis": "<full citation>",
  "practicalGuidance": "<paragraph>"
}`,
        messages: [{
          role: "user",
          content: `DNFBP Type: ${sanitizeField(body.dnfbpType, 100)}
Transaction Type: ${sanitizeField(body.transactionType, 100) || "not specified"}
Transaction Amount: ${sanitizeField(body.transactionAmount, 50) || "not specified"} ${sanitizeField(body.currency, 10)}
Customer Type: ${sanitizeField(body.customerType, 100) || "not specified"}
Jurisdiction: ${sanitizeField(body.jurisdiction, 100) || "UAE"}
Additional Context: ${sanitizeText(body.context, 2000) || "none"}

Map the AML/CFT obligations for this DNFBP.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as DnfbpObligationsResult;
    if (!Array.isArray(result.keyObligations)) result.keyObligations = [];
    if (!Array.isArray(result.prohibitedActivities)) result.prohibitedActivities = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "dnfbp-obligations temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
