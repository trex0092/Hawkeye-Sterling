// POST /api/reg-correspondence
//
// Auto-drafts formal regulatory correspondence for UAE financial institutions.
// Supports:
//   - STR/SAR cover letters to UAE FIU
//   - CBUAE audit response letters
//   - Regulatory examination document requests
//   - Voluntary disclosure letters
//   - Freeze/seizure notification responses
//   - Correspondent bank EDD questionnaire responses
//
// Produces formally structured letters with correct regulatory article
// references, filing numbers, and language conventions for UAE DPMS context.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

type CorrespondenceType =
  | "str_cover_letter"
  | "cbuae_audit_response"
  | "examination_document_response"
  | "voluntary_disclosure"
  | "freeze_notification_response"
  | "correspondent_bank_edd_response"
  | "regulator_inquiry_response"
  | "customer_exit_notification"
  | "suspicious_activity_escalation";

type RecipientAuthority =
  | "UAE_FIU"
  | "CBUAE"
  | "MOEC_Dubai"
  | "ADGM_FSRA"
  | "DFSA"
  | "Dubai_Police_FCD"
  | "Correspondent_Bank"
  | "Internal_MLRO";

interface CorrespondenceRequest {
  correspondenceType: CorrespondenceType;
  recipientAuthority: RecipientAuthority;
  subject: string;
  urgency?: "routine" | "urgent" | "immediate";
  // Context
  institutionName?: string;
  mlroName?: string;
  referenceNumber?: string;
  caseId?: string;
  subjectName?: string;
  // Key facts to include
  keyFacts: string[];
  // What is being requested or responded to
  inResponseTo?: string;     // original query/notice reference
  requestedResponse?: string; // what the recipient should do/acknowledge
  // Additional context
  additionalContext?: string;
  regulatoryDeadline?: string; // ISO date
}

const AUTHORITY_DETAILS: Record<RecipientAuthority, { fullName: string; address: string; salutation: string }> = {
  UAE_FIU: {
    fullName: "UAE Financial Intelligence Unit",
    address: "goAML Portal / UAE FIU, Central Bank of the UAE, P.O. Box 854, Abu Dhabi, UAE",
    salutation: "To the Director, UAE Financial Intelligence Unit",
  },
  CBUAE: {
    fullName: "Central Bank of the UAE",
    address: "Central Bank of the UAE, P.O. Box 854, Abu Dhabi, UAE",
    salutation: "To the Director of Banking Supervision, Central Bank of the UAE",
  },
  MOEC_Dubai: {
    fullName: "Ministry of Economy — Dubai AML/CFT Supervisory Unit",
    address: "Ministry of Economy, P.O. Box 901, Dubai, UAE",
    salutation: "To the AML/CFT Supervision Division, Ministry of Economy",
  },
  ADGM_FSRA: {
    fullName: "Abu Dhabi Global Market Financial Services Regulatory Authority",
    address: "ADGM, Al Maryah Island, P.O. Box 111999, Abu Dhabi, UAE",
    salutation: "To the Supervision Division, ADGM Financial Services Regulatory Authority",
  },
  DFSA: {
    fullName: "Dubai Financial Services Authority",
    address: "Dubai International Financial Centre, P.O. Box 75850, Dubai, UAE",
    salutation: "To the Supervision Division, Dubai Financial Services Authority",
  },
  Dubai_Police_FCD: {
    fullName: "Dubai Police Financial Crimes Division",
    address: "Dubai Police General HQ, P.O. Box 1493, Dubai, UAE",
    salutation: "To the Director, Financial Crimes Division, Dubai Police",
  },
  Correspondent_Bank: {
    fullName: "Correspondent Banking Institution",
    address: "[Correspondent Bank Address]",
    salutation: "To the AML/CFT Compliance Officer",
  },
  Internal_MLRO: {
    fullName: "Money Laundering Reporting Officer",
    address: "[Internal]",
    salutation: "To the MLRO",
  },
};

const CORRESPONDENCE_REGULATORY_BASIS: Record<CorrespondenceType, string> = {
  str_cover_letter: "FDL 10/2025 Art.15 (STR filing obligation); CBUAE AML Standards §9; goAML Filing Procedures",
  cbuae_audit_response: "FDL 10/2025 Art.19 (record keeping); CBUAE AML Standards §12 (supervisory cooperation)",
  examination_document_response: "FDL 10/2025 Art.19; CR No.134/2025 Art.20",
  voluntary_disclosure: "FDL 10/2025 Art.15(5) (voluntary disclosure provisions); FATF R.20",
  freeze_notification_response: "FDL 10/2025 Art.24 (freezing obligations); CR No.134/2025 Art.28",
  correspondent_bank_edd_response: "FATF R.13 (correspondent banking); CBUAE AML Standards §7.4",
  regulator_inquiry_response: "FDL 10/2025 Art.17 (cooperation with competent authorities); FATF R.31",
  customer_exit_notification: "FDL 10/2025 Art.10 (CDD obligations); CBUAE AML Standards §5.3",
  suspicious_activity_escalation: "FDL 10/2025 Art.15; FATF R.20; CBUAE AML Standards §9.2",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: CorrespondenceRequest;
  try { body = await req.json() as CorrespondenceRequest; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!body.correspondenceType || !body.recipientAuthority || !body.subject) {
    return NextResponse.json({ ok: false, error: "correspondenceType, recipientAuthority, and subject required" }, { status: 400, headers: gate.headers });
  }
  if (!body.keyFacts?.length) {
    return NextResponse.json({ ok: false, error: "keyFacts array required (min 1 fact)" }, { status: 400, headers: gate.headers });
  }

  const authority = AUTHORITY_DETAILS[body.recipientAuthority];
  const regulatoryBasis = CORRESPONDENCE_REGULATORY_BASIS[body.correspondenceType];
  const today = new Date().toISOString().split("T")[0];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "ANTHROPIC_API_KEY required for correspondence drafting",
    }, { status: 503, headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 22_000, "reg-correspondence");
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: `You are a UAE AML compliance specialist and legal drafter with expertise in regulatory correspondence for DPMS (gold and precious metals dealers) under FDL 10/2025, CBUAE AML Standards, and CR No.134/2025.

Draft formal regulatory correspondence with:
- Correct formal salutation and closing
- Precise regulatory article references
- Professional, factual, measured tone (no speculation or admissions of liability)
- Clear structure: reference, subject, body, requested action/acknowledgment, sign-off
- UAE-appropriate formality (respectful, concise, document-referenced)

Return ONLY valid JSON:
{
  "letterDate": "${today}",
  "referenceNumber": "<generated or provided>",
  "recipientName": "<from authority details>",
  "recipientAddress": "<from authority details>",
  "subject": "<formal subject line>",
  "salutation": "<formal opening>",
  "bodyParagraphs": ["<paragraph 1>", "<paragraph 2>", "..."],
  "requestedAction": "<what the recipient should do>",
  "attachmentsList": ["<document to attach>"],
  "closingStatement": "<formal close>",
  "signatoryBlock": "<MLRO name, title, institution, date, contact>",
  "urgencyFlag": "routine|urgent|immediate",
  "wordCount": <approximate>,
  "complianceNotes": "<any compliance considerations for this letter>"
}`,
    messages: [{
      role: "user",
      content: `Draft the following regulatory correspondence:

Type: ${body.correspondenceType}
Recipient: ${authority.fullName}
${authority.address}
${authority.salutation}

Subject: ${body.subject}
Urgency: ${body.urgency ?? "routine"}
Institution: ${body.institutionName ?? "[Institution Name]"}
MLRO: ${body.mlroName ?? "[MLRO Name]"}
Reference Number: ${body.referenceNumber ?? "auto-generate"}
${body.caseId ? `Case ID: ${body.caseId}` : ""}
${body.subjectName ? `Subject of Matter: ${body.subjectName}` : ""}
${body.inResponseTo ? `In Response To: ${body.inResponseTo}` : ""}
${body.regulatoryDeadline ? `Regulatory Deadline: ${body.regulatoryDeadline}` : ""}

Key Facts to Include:
${body.keyFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

${body.requestedResponse ? `Requested Response/Action: ${body.requestedResponse}` : ""}
${body.additionalContext ? `Additional Context: ${body.additionalContext}` : ""}

Regulatory Basis: ${regulatoryBasis}

Draft a formal, professional regulatory letter.`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";
  try {
    const letter = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return NextResponse.json({
      ok: true,
      correspondenceType: body.correspondenceType,
      recipientAuthority: body.recipientAuthority,
      regulatoryBasis,
      ...letter,
      generatedAt: new Date().toISOString(),
    }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "correspondence drafting failed — retry" }, { status: 500, headers: gate.headers });
  }
}
