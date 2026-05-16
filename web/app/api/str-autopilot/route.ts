// POST /api/str-autopilot
//
// STR/SAR Submission Autopilot for UAE DPMS institutions.
// Full pipeline in a single call:
//   Stage 1 — Draft / enhance SAR narrative (FDL 10/2025 Art.15 standard)
//   Stage 2 — Generate goAML-compatible XML payload
//   Stage 3 — Validate completeness against CBUAE submission requirements
//   Stage 4 — Return submission checklist with missing items flagged
//
// goAML is the UAE FIU's statutory filing platform.
// Output is ready for MLRO sign-off and direct paste into goAML.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface StrAutopilotRequest {
  // Subject
  subjectName: string;
  subjectType?: "individual" | "corporate";
  nationality?: string;
  identityNumber?: string;   // passport / EID
  address?: string;
  // Transaction details
  suspiciousAmount?: number;
  currency?: string;
  transactionDate?: string;  // ISO date
  transactionType?: string;
  // Risk context
  riskScore?: number;
  sanctionsHits?: number;
  jurisdiction?: string;
  // Existing narrative (optional — autopilot will enhance or generate)
  existingNarrative?: string;
  // Case data
  caseId?: string;
  reportingOfficerName?: string;
  institutionName?: string;
  reportingThreshold?: number; // default 55000 AED
  // Typology
  suspectedTypology?: string;
  predicate?: string;
  // Additional indicators
  additionalIndicators?: string[];
}

function generateGoAmlXml(data: {
  referenceNumber: string;
  reportDate: string;
  subjectName: string;
  subjectType: string;
  nationality?: string;
  identityNumber?: string;
  amount?: number;
  currency?: string;
  transactionDate?: string;
  transactionType?: string;
  institutionName?: string;
  narrative?: string;
  typology?: string;
}): string {
  const escapeXml = (s: string) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<goAML xmlns="http://www.goAML.int/FIU/AML/v3.0"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <report>
    <rentity_id>${escapeXml(data.institutionName ?? "REPORTING_INSTITUTION")}</rentity_id>
    <report_code>STR</report_code>
    <report_date>${data.reportDate}</report_date>
    <currency_code_local>${escapeXml(data.currency ?? "AED")}</currency_code_local>
    <submission_code>E</submission_code>
    <reason>${escapeXml(data.narrative?.slice(0, 500) ?? "Suspicious transaction reported under FDL 10/2025 Art.15")}</reason>
    <action>R</action>
    <str_reason>
      <str_reason_code>${escapeXml(data.typology ?? "OTHER")}</str_reason_code>
    </str_reason>
    <involved_parties>
      <party seq="1">
        <role>S</role><!-- S = Subject -->
        <party_identification>
          <first_name>${escapeXml(data.subjectName.split(" ")[0] ?? "")}</first_name>
          <last_name>${escapeXml(data.subjectName.split(" ").slice(1).join(" ") || data.subjectName)}</last_name>
          <entity_type>${data.subjectType === "corporate" ? "E" : "P"}</entity_type>
          ${data.nationality ? `<country_of_birth>${escapeXml(data.nationality)}</country_of_birth>` : ""}
          ${data.identityNumber ? `<identification><id_number>${escapeXml(data.identityNumber)}</id_number></identification>` : ""}
        </party_identification>
      </party>
    </involved_parties>
    ${data.amount ? `<transactions>
      <transaction>
        <transactionnumber>${data.referenceNumber}-T1</transactionnumber>
        <transaction_location>UAE</transaction_location>
        <date_transaction>${data.transactionDate ?? data.reportDate}</date_transaction>
        <amount_local>${data.amount.toFixed(2)}</amount_local>
        <teller>SYSTEM</teller>
        <mode_of_payment>
          <mode_of_payment_code>${escapeXml(data.transactionType ?? "OTHER")}</mode_of_payment_code>
        </mode_of_payment>
      </transaction>
    </transactions>` : ""}
    <reference_number>${escapeXml(data.referenceNumber)}</reference_number>
  </report>
</goAML>`;
}

function validateCompletenessChecklist(req: StrAutopilotRequest, narrative: string): Array<{ field: string; status: "complete" | "missing" | "weak"; note: string }> {
  return [
    { field: "subjectName", status: req.subjectName?.trim() ? "complete" : "missing", note: "Full legal name required" },
    { field: "nationality", status: req.nationality?.trim() ? "complete" : "missing", note: "Subject nationality required for goAML" },
    { field: "identityDocument", status: req.identityNumber?.trim() ? "complete" : "missing", note: "Passport or EID number required" },
    { field: "suspiciousAmount", status: req.suspiciousAmount ? "complete" : "missing", note: "Transaction amount required" },
    { field: "transactionDate", status: req.transactionDate?.trim() ? "complete" : "missing", note: "Date of suspicious activity required" },
    { field: "narrative", status: narrative.length >= 200 ? "complete" : narrative.length > 50 ? "weak" : "missing", note: narrative.length < 200 ? `Narrative too short (${narrative.length} chars) — minimum 200 chars for CBUAE acceptance` : "OK" },
    { field: "suspectedTypology", status: req.suspectedTypology?.trim() ? "complete" : "weak", note: "FATF typology classification improves FIU intelligence value" },
    { field: "reportingOfficerName", status: req.reportingOfficerName?.trim() ? "complete" : "missing", note: "MLRO name required on submission" },
    { field: "institutionName", status: req.institutionName?.trim() ? "complete" : "missing", note: "Reporting institution name required" },
    { field: "predicate", status: req.predicate?.trim() ? "complete" : "weak", note: "Predicate offense classification aids FIU analysis" },
  ];
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: StrAutopilotRequest;
  try { body = await req.json() as StrAutopilotRequest; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!body.subjectName?.trim()) {
    return NextResponse.json({ ok: false, error: "subjectName required" }, { status: 400, headers: gate.headers });
  }

  const referenceNumber = `STR-${Date.now().toString(36).toUpperCase()}-${body.caseId ?? "AUTO"}`;
  const reportDate = new Date().toISOString().split("T")[0] ?? new Date().toISOString().slice(0, 10);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const checklist = validateCompletenessChecklist(body, body.existingNarrative ?? "");
    const xml = generateGoAmlXml({
      referenceNumber,
      reportDate,
      subjectName: body.subjectName,
      subjectType: body.subjectType ?? "individual",
      nationality: body.nationality,
      identityNumber: body.identityNumber,
      amount: body.suspiciousAmount,
      currency: body.currency ?? "AED",
      transactionDate: body.transactionDate,
      transactionType: body.transactionType,
      institutionName: body.institutionName,
      narrative: body.existingNarrative,
      typology: body.suspectedTypology,
    });
    return NextResponse.json({
      ok: true,
      referenceNumber,
      narrative: body.existingNarrative ?? "",
      goAmlXml: xml,
      completenessChecklist: checklist,
      missingFields: checklist.filter((c) => c.status === "missing").map((c) => c.field),
      weakFields: checklist.filter((c) => c.status === "weak").map((c) => c.field),
      readyToSubmit: checklist.every((c) => c.status !== "missing"),
      aiEnriched: false,
    }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 55_000, "str-autopilot");

  // Stage 1: Draft/enhance narrative
  const narrativeRes = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: `You are a UAE AML compliance officer writing a Suspicious Transaction Report (STR) narrative for submission to the UAE FIU via goAML.

Write a formal, factual, evidence-based STR narrative that:
1. States WHO is suspected and of WHAT
2. Describes the specific suspicious transaction(s) with dates and amounts
3. Explains WHY the transaction is suspicious (red flags)
4. References regulatory basis (FDL 10/2025 Art.15)
5. Lists predicate offense if identifiable
6. States what the reporting institution knows about the subject (KYC context)

DO NOT speculate or include information not provided. DO NOT include legal conclusions.
Length: 300-500 words. Professional, formal tone.

Return JSON: { "narrative": "<full STR narrative text>", "typologyCode": "<FATF/goAML typology code>", "predicateOffense": "<predicate if identifiable>" }`,
    messages: [{
      role: "user",
      content: `Subject: ${sanitizeField(body.subjectName)}
Subject Type: ${body.subjectType ?? "individual"}
Nationality: ${body.nationality ?? "unknown"}
Risk Score: ${body.riskScore ?? "not scored"}
Sanctions Hits: ${body.sanctionsHits ?? 0}
Jurisdiction: ${body.jurisdiction ?? "UAE"}
Suspicious Amount: ${body.suspiciousAmount ? `${body.suspiciousAmount.toLocaleString()} ${body.currency ?? "AED"}` : "not specified"}
Transaction Date: ${body.transactionDate ?? "not specified"}
Transaction Type: ${body.transactionType ?? "not specified"}
Suspected Typology: ${body.suspectedTypology ?? "unknown"}
Predicate: ${body.predicate ?? "unknown"}
Additional Indicators: ${JSON.stringify(body.additionalIndicators ?? [])}
Case ID: ${body.caseId ?? "not assigned"}

${body.existingNarrative ? `Existing narrative (enhance this):\n${body.existingNarrative}` : "No existing narrative — draft from scratch."}

Draft the STR narrative.`,
    }],
  });

  const narRaw = narrativeRes.content[0]?.type === "text" ? (narrativeRes.content[0] as { type: "text"; text: string }).text : "{}";
  let narrativeResult: { narrative?: string; typologyCode?: string; predicateOffense?: string } = {};
  try { narrativeResult = JSON.parse(narRaw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* best effort */ }

  const finalNarrative = narrativeResult.narrative ?? body.existingNarrative ?? "";
  const typology = narrativeResult.typologyCode ?? body.suspectedTypology ?? "OTHER";

  // Stage 2: Generate goAML XML
  const goAmlXml = generateGoAmlXml({
    referenceNumber,
    reportDate,
    subjectName: body.subjectName,
    subjectType: body.subjectType ?? "individual",
    nationality: body.nationality,
    identityNumber: body.identityNumber,
    amount: body.suspiciousAmount,
    currency: body.currency ?? "AED",
    transactionDate: body.transactionDate,
    transactionType: body.transactionType,
    institutionName: body.institutionName,
    narrative: finalNarrative,
    typology,
  });

  // Stage 3: Validate completeness
  const checklist = validateCompletenessChecklist(body, finalNarrative);
  const missingFields = checklist.filter((c) => c.status === "missing").map((c) => c.field);
  const weakFields = checklist.filter((c) => c.status === "weak").map((c) => c.field);

  return NextResponse.json({
    ok: true,
    referenceNumber,
    narrative: finalNarrative,
    typologyCode: typology,
    predicateOffense: narrativeResult.predicateOffense ?? body.predicate,
    goAmlXml,
    completenessChecklist: checklist,
    missingFields,
    weakFields,
    readyToSubmit: missingFields.length === 0,
    submissionInstructions: [
      "1. MLRO reviews and approves the narrative",
      "2. Verify all missing/weak fields are resolved",
      "3. Log into UAE FIU goAML portal (goaml.uaefiu.gov.ae)",
      "4. Create new STR, paste or upload the goAML XML",
      "5. Retain reference number for 10-year record keeping (FDL 10/2025 Art.19)",
      "6. Acknowledge within 30 days if FIU issues follow-up request",
    ],
    regulatoryBasis: "FDL 10/2025 Art.15 · CBUAE AML Standards §9 · FATF R.20",
    aiEnriched: true,
    generatedAt: new Date().toISOString(),
  }, { headers: gate.headers });
}
