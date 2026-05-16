export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";

import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface InterAgencyReferralResult {
  referralAgency: string;
  referralBasis: string;
  urgencyLevel: "immediate" | "priority" | "standard";
  referralPackage: {
    coverLetter: string;
    factsSummary: string;
    evidenceList: string[];
    legalBasis: string;
    requestedActions: string[];
  };
  parallelNotifications: Array<{
    agency: string;
    reason: string;
    timeline: string;
  }>;
  domesticLegalBasis: string;
  internationalCooperationBasis?: string;
  mulatRequired: boolean;
  evidencePreservationSteps: string[];
  tippingOffWarning: string;
  regulatoryBasis: string;
}

const FALLBACK: InterAgencyReferralResult = {
  referralAgency: "UAE Public Prosecution (PPO) — Economic Crimes Department, in coordination with General Directorate of Criminal Investigation (CID)",
  referralBasis: "Credible evidence of large-scale money laundering through structured cash deposits, offshore layering, and real estate integration totalling AED 12,400,000 over 18 months. Evidence indicates organised ML activity with multiple participants and jurisdictions. The matter exceeds the threshold for MLRO-level management and requires criminal investigation authority.",
  urgencyLevel: "priority",
  referralPackage: {
    coverLetter: "RESTRICTED — FINANCIAL INTELLIGENCE REFERRAL\n\nTo: Director, Economic Crimes Department, Public Prosecution\nFrom: Money Laundering Reporting Officer, [Institution Name]\nDate: [Date]\nReference: AML-REF-2026-[Number]\nConfidentiality: RESTRICTED — Not for disclosure to subject(s)\n\nDear Director,\n\nPursuant to UAE FDL 10/2025 Art.17(3) and CR No.134/2025, we formally refer the attached financial intelligence package concerning suspected large-scale money laundering activity to your office for criminal investigation. Simultaneous notification has been filed with the UAE Financial Intelligence Unit (FIU) via goAML portal (STR Reference: [goAML Ref]).\n\nWe respectfully request the issuance of: (1) account restraint orders under UAE Federal Law 4/2002 Art.8; (2) production orders for bank records; and (3) travel restriction measures where appropriate. We are available to provide witness statements and additional intelligence support to the investigation.\n\nThe MLRO and legal counsel are available to brief your office at your convenience.\n\nYours faithfully,\n[MLRO Name and Designation]",
    factsSummary: "Subject: [Name], [Nationality], DOB [Date]\n\nBetween January 2024 and June 2025, the subject made 87 structured cash deposits across three linked UAE bank accounts in amounts of AED 42,000–54,900, aggregating AED 3,600,000 — a clear pattern of structuring to avoid the AED 55,000 CTR threshold. Funds were subsequently wire transferred to a BVI-registered entity (Al-Baraka International Ltd) as purported 'consulting fees' with no supporting contracts. Funds were returned to a UAE LLC (Gulf Star Trading LLC — sole director: subject's spouse) as 'loan repayments' before being used to purchase three residential properties in Dubai for AED 8,800,000. Total suspected ML proceeds: AED 12,400,000. No legitimate income source has been identified that could explain this wealth accumulation.",
    evidenceList: [
      "goAML STR filing confirmation (STR Ref: [Number])",
      "Bank transaction records — all three accounts — January 2024 to June 2025",
      "SWIFT MT103 transfer records — UAE to BVI",
      "Dubai Land Department property ownership records — 3 properties",
      "Company registry extract — Gulf Star Trading LLC",
      "Corporate structure diagram — identified entities and connections",
      "Passport and Emirates ID copies (certified)",
      "Internal AML alert and investigation case file",
      "EOCN and OFAC sanctions screening certificates",
      "Adverse media research report",
      "Timeline and transaction flow chart",
    ],
    legalBasis: "UAE FDL 10/2025 Art.2 (ML offence), Art.17(3) (mandatory referral where criminal investigation warranted); UAE Federal Law 4/2002 Art.2 (ML offence), Art.8 (restraint orders), Art.9 (confiscation); CR No.134/2025; UAE Penal Code",
    requestedActions: [
      "Issuance of account restraint orders for all identified accounts — to prevent dissipation of assets",
      "Travel ban on subject and spouse pending investigation",
      "Production order for all bank records across identified accounts",
      "DLD restriction on disposal of three identified properties",
      "Investigation into source of predicate offence funds",
      "MLAT request to BVI for Al-Baraka International Ltd records",
    ],
  },
  parallelNotifications: [
    {
      agency: "UAE Financial Intelligence Unit (CBUAE-FIU) via goAML",
      reason: "Mandatory STR filing requirement — UAE FDL 10/2025 Art.17; goAML STR submitted simultaneously with PPO referral",
      timeline: "Same day as PPO referral — already filed",
    },
    {
      agency: "UAE Central Bank (CBUAE) — Compliance Division",
      reason: "Systemic ML activity within licensed institution — CBUAE notification appropriate for large-scale matters per CBUAE Guidelines §9.3",
      timeline: "Within 2 business days of PPO referral",
    },
    {
      agency: "BVI Financial Investigation Agency (FIA) — via Egmont Group secure channel",
      reason: "Suspected ML funds passed through BVI-registered entity; BVI assistance required for corporate records and account information",
      timeline: "Within 5 business days — formal MLA request to follow",
    },
    {
      agency: "UAE EOCN / National Anti-Money Laundering and Combating Financing of Terrorism Committee (NAMLCFTC)",
      reason: "Large-scale ML case of potential typological significance — voluntary notification to enhance national AML intelligence picture",
      timeline: "Within 5 business days",
    },
  ],
  domesticLegalBasis: "UAE FDL 10/2025 Art.17(3) (mandatory PPO referral where grounds for criminal investigation exist); UAE Federal Law 4/2002 Art.2 (ML offence elements), Art.8 (restraint), Art.9 (confiscation); UAE Federal Law 35/1992 (Penal Procedures — production orders, witness obligations)",
  internationalCooperationBasis: "UAE bilateral MLAT with [requesting jurisdiction] — Ministry of Justice coordination required; Egmont Group (UAE is member — secure FIU-to-FIU channel); UNCAC Art.43-50 (international cooperation); FATF R.36-40 (mutual legal assistance and extradition)",
  mulatRequired: true,
  evidencePreservationSteps: [
    "Place litigation hold on all bank records, emails, and documents relating to identified accounts and entities — immediate",
    "Preserve CCTV footage from branch deposit locations — contact branch operations within 24 hours (footage typically retained for 30-90 days only)",
    "Preserve all TM system alert records, case notes, and MLRO decision documentation",
    "Preserve digital records in forensically sound manner — do not delete, overwrite, or alter any records",
    "Document chain of custody for all evidence compiled in referral package",
    "Instruct IT to preserve system access logs for all accounts accessed in relation to this matter",
    "Create and retain copies of goAML STR filing confirmation and all attachments",
  ],
  tippingOffWarning: "CRITICAL — TIPPING OFF PROHIBITION: Under UAE FDL 10/2025 Art.20, it is a criminal offence to disclose to the subject, their associates, or any other person that an STR has been filed, that a PPO referral has been made, or that the subject is under investigation. This prohibition applies to all staff — including relationship managers, operations, and management. Any staff member with knowledge of this referral must be explicitly briefed on the tipping off prohibition and must not contact the customer or take any action that might alert them. Account exits, if required, must be handled by compliance with specific MLRO instructions to avoid arousing suspicion.",
  regulatoryBasis: "UAE FDL 10/2025 Art.17 (STR and referral obligations), Art.20 (tipping off prohibition); UAE Federal Law 4/2002 (AML, restraint, confiscation); UAE Federal Law 35/1992 (Penal Procedures); FATF R.29 (FIU), R.40 (international cooperation); Egmont Group Principles for Information Exchange",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    caseDescription: string;
    suspectedOffence?: string;
    subjectName?: string;
    subjectId?: string;
    evidenceSummary?: string;
    urgency?: "immediate" | "standard";
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.caseDescription?.trim()) return NextResponse.json({ ok: false, error: "caseDescription required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "inter-agency-referral temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `You are a UAE law enforcement referral specialist with expertise in UAE Public Prosecution (PPO) and CID liaison procedures, FIU reporting via goAML, inter-agency notification requirements, MLAT procedures, and Egmont Group information sharing. Draft comprehensive inter-agency referral packages including cover letters, facts summaries, evidence lists, legal basis statements, and parallel notification requirements. Always include tipping off warnings (FDL 10/2025 Art.20) and evidence preservation steps. Respond ONLY with valid JSON matching the InterAgencyReferralResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Case Description: ${sanitizeText(body.caseDescription, 2000)}
Suspected Offence: ${sanitizeField(body.suspectedOffence, 100) ?? "money laundering"}
Subject Name: ${sanitizeField(body.subjectName, 500) ?? "not identified"}
Subject ID/Reference: ${sanitizeField(body.subjectId, 100) ?? "not provided"}
Evidence Summary: ${sanitizeText(body.evidenceSummary, 2000) ?? "not provided"}
Urgency Level: ${sanitizeField(body.urgency, 50) ?? "standard"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Prepare a comprehensive inter-agency referral package. Return complete InterAgencyReferralResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as InterAgencyReferralResult;
    if (!result.referralPackage || typeof result.referralPackage !== "object") result.referralPackage = { coverLetter: "", factsSummary: "", evidenceList: [], legalBasis: "", requestedActions: [] };
    if (!Array.isArray(result.referralPackage.evidenceList)) result.referralPackage.evidenceList = [];
    if (!Array.isArray(result.referralPackage.requestedActions)) result.referralPackage.requestedActions = [];
    if (!Array.isArray(result.parallelNotifications)) result.parallelNotifications = [];
    if (!Array.isArray(result.evidencePreservationSteps)) result.evidencePreservationSteps = [];
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "inter-agency-referral temporarily unavailable - please retry." }, { status: 503 });
  }
}
