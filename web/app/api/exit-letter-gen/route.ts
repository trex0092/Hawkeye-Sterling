// POST /api/exit-letter-gen
//
// Client Exit / De-Risking Letter Generator (Tier C).
// Generates a compliant, legally defensible exit letter for terminating a
// customer relationship on AML/CFT grounds.
//
// The letter must:
//   - Notify the customer without "tipping off" (no explicit AML/STR mention if STR filed)
//   - Comply with UAE tipping-off prohibition (FDL 10/2025 Art.17)
//   - Give appropriate notice period (default 30 days)
//   - State the relationship end date
//   - Provide instructions for account closure / fund withdrawal
//   - Avoid creating legal liability through improper disclosure
//
// Exit reason categories (internal only — not disclosed to customer):
//   "aml_risk"         — elevated AML risk, no STR filed
//   "sanctions_risk"   — potential sanctions exposure
//   "edd_failure"      — customer failed to provide EDD documentation
//   "unacceptable_risk" — overall risk outside appetite
//   "pep_not_accepted"  — PEP not accepted per policy
//   "business_exit"    — geographic / product exit (non-AML)
//
// Regulatory basis: FDL 10/2025 Art.17 (tipping-off); Art.8 (CDD);
//                   UAE Commercial Transactions Law

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ExitReason =
  | "aml_risk"
  | "sanctions_risk"
  | "edd_failure"
  | "unacceptable_risk"
  | "pep_not_accepted"
  | "business_exit"
  | "other";

interface ExitLetterRequest {
  // Customer details
  customerName: string;
  customerType?: "individual" | "corporate";
  customerAddress?: string;
  accountOrCaseRef?: string;

  // Exit parameters
  exitReason: ExitReason;
  strFiled?: boolean;             // CRITICAL — affects tipping-off obligation
  noticePeriodDays?: number;      // default 30
  exitDate?: string;              // ISO date — overrides notice period if provided
  effectiveDate?: string;         // date letter is sent

  // Entity details
  entityName?: string;
  mlroName?: string;
  entityAddress?: string;
  entityPhone?: string;
  entityEmail?: string;

  // Optional context (used for AI letter drafting, not disclosed to customer)
  internalNotes?: string;
  language?: "en" | "ar";        // default "en"
}

interface ExitLetterResult {
  customerName: string;
  exitDate: string;
  noticePeriodDays: number;
  tippingOffRisk: boolean;
  letterText: string;
  internalCoverNote: string;
  complianceChecklist: Array<{ item: string; status: "required" | "recommended"; done: boolean }>;
  generatedAt: string;
}

// Customer-facing reasons — carefully worded to avoid tipping off
const CUSTOMER_FACING_REASONS: Record<ExitReason, string> = {
  aml_risk: "a periodic review of our customer portfolio and risk appetite",
  sanctions_risk: "a review of our compliance obligations and business relationships",
  edd_failure: "an inability to complete our required due diligence procedures",
  unacceptable_risk: "a reassessment of our risk appetite and business strategy",
  pep_not_accepted: "our current policy not to maintain business relationships with certain customer categories",
  business_exit: "a strategic review of our business operations and customer segments",
  other: "a review of our business relationships and compliance requirements",
};

function computeExitDate(noticeDays: number, effectiveDate?: string): string {
  const base = effectiveDate ? new Date(effectiveDate) : new Date();
  base.setDate(base.getDate() + noticeDays);
  return base.toISOString().split("T")[0] ?? base.toISOString().substring(0, 10);
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: ExitLetterRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const {
    customerName,
    customerType = "individual",
    customerAddress,
    accountOrCaseRef,
    exitReason,
    strFiled = false,
    noticePeriodDays = 30,
    exitDate: providedExitDate,
    effectiveDate,
    entityName = "Hawkeye Sterling DMCC",
    mlroName,
    entityAddress,
    entityPhone,
    entityEmail,
    internalNotes,
    language = "en",
  } = body;

  if (!customerName || !exitReason) {
    return NextResponse.json({ error: "customerName and exitReason are required" }, { status: 400 , headers: gate.headers });
  }

  const tippingOffRisk = strFiled;
  const exitDate = providedExitDate ?? computeExitDate(noticePeriodDays, effectiveDate);
  const effectiveDateStr = effectiveDate ?? new Date().toISOString().split("T")[0];
  const customerReason = CUSTOMER_FACING_REASONS[exitReason] ?? CUSTOMER_FACING_REASONS.other;

  const checklist = [
    { item: "Obtain MLRO sign-off before sending letter", status: "required" as const, done: false },
    { item: "Verify no regulatory hold preventing exit (e.g., active investigation)", status: "required" as const, done: false },
    { item: "Confirm STR tipping-off review completed", status: "required" as const, done: strFiled },
    { item: "Record exit in customer file with exit reason (internal use only)", status: "required" as const, done: false },
    { item: "Ensure customer funds can be returned without sanctions/AML concern", status: "required" as const, done: false },
    { item: "Send via tracked / confirmed delivery method", status: "recommended" as const, done: false },
    { item: "Retain copy of sent letter for 10 years (FDL Art.19)", status: "required" as const, done: false },
    { item: "Update CRM / case management system with exit status", status: "recommended" as const, done: false },
  ];

  const internalCoverNote = `INTERNAL — CONFIDENTIAL — NOT FOR CUSTOMER DISCLOSURE

Exit Letter Cover Note

Customer: ${customerName}
Reference: ${accountOrCaseRef ?? "N/A"}
Internal exit reason: ${exitReason}
STR filed: ${strFiled ? "YES — tipping-off prohibition applies" : "No"}
MLRO: ${mlroName ?? "N/A"}
Effective exit date: ${exitDate}

${internalNotes ? `Notes: ${internalNotes}` : ""}

TIPPING-OFF WARNING: ${tippingOffRisk ? "AN STR HAS BEEN FILED. Do not disclose AML concerns, STR filing, or any investigation to the customer. The reason given in the letter must remain generic. Legal review recommended before sending." : "No STR filed. Standard exit communication protocol applies."}

This exit is being conducted under FDL 10/2025 and the entity's risk appetite policy. The customer-facing letter uses a non-AML rationale as required. All documentation must be retained for the 10-year record retention period (FDL Art.19).`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    const anthropic = getAnthropicClient(apiKey, 40_000, "exit-letter-gen");

    const tippingOffInstruction = strFiled
      ? "CRITICAL: A Suspicious Transaction Report (STR) has been filed in relation to this customer. You MUST NOT mention AML, money laundering, suspicious activity, investigations, or regulatory filings in the letter. Use only neutral business language."
      : "No STR has been filed. You may reference compliance review or due diligence requirements in neutral terms, but do not mention specific AML concerns.";

    const prompt = `You are a UAE DPMS AML compliance officer drafting a customer relationship exit letter. Generate a professional, legally defensible exit letter.

${tippingOffInstruction}

LETTER DETAILS:
- Entity sending the letter: ${sanitizeField(entityName)}
- Customer name: ${sanitizeField(customerName)} (${sanitizeField(customerType)})
- Customer address: ${sanitizeField(customerAddress) || "To be inserted"}
- Account/case reference: ${sanitizeField(accountOrCaseRef) || "N/A"}
- Date of letter: ${effectiveDateStr}
- Exit effective date: ${exitDate} (${noticePeriodDays} days notice)
- Reason to state to customer: "${customerReason}"
- Entity address: ${sanitizeField(entityAddress) || "Dubai, UAE"}
- Entity contact: ${sanitizeField(entityPhone) || ""} / ${sanitizeField(entityEmail) || ""}

REQUIREMENTS:
1. Professional, formal tone appropriate for a regulated entity
2. State clearly that the business relationship will end on the exit date
3. Provide instructions for the customer to withdraw funds / collect property
4. State that all outstanding obligations must be settled before exit date
5. Do not apologise excessively or invite the customer to challenge the decision
6. Include a reference number
7. Close with a proper sign-off block
${language === "ar" ? "8. Write in Arabic" : "8. Write in English"}

Generate the complete letter text only — no commentary, no additional explanation.`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const letterText = (msg.content[0] as { type: string; text: string }).text?.trim() ?? "";

    const result: ExitLetterResult = {
      customerName,
      exitDate,
      noticePeriodDays,
      tippingOffRisk,
      letterText,
      internalCoverNote,
      complianceChecklist: checklist,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    return NextResponse.json(
      { error: "Letter generation failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: gate.headers }
    );
  }
}
