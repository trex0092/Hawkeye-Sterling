export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";

export interface GoAmlFieldCheck {
  field: string;
  section: "header" | "subject" | "transactions" | "narrative" | "reporting_entity";
  status: "complete" | "incomplete" | "missing" | "invalid";
  currentValue?: string;
  requiredFormat?: string;
  issue?: string;
  recommendation?: string;
}

export interface GoAmlValidatorResult {
  overallStatus: "ready_to_file" | "needs_corrections" | "incomplete" | "rejected";
  completenessScore: number;
  narrativeQuality: "excellent" | "good" | "adequate" | "poor" | "insufficient";
  fieldChecks: GoAmlFieldCheck[];
  criticalIssues: string[];
  warnings: string[];
  narrativeFeedback: string;
  narrativeStrengths: string[];
  narrativeWeaknesses: string[];
  goAmlSpecificRequirements: string[];
  improvedNarrativeSuggestion?: string;
  filingDeadlineAssessment?: string;
  regulatoryBasis: string;
}

const FALLBACK: GoAmlValidatorResult = {
  overallStatus: "needs_corrections",
  completenessScore: 68,
  narrativeQuality: "adequate",
  fieldChecks: [
    { field: "Report Type", section: "header", status: "complete", currentValue: "STR" },
    { field: "Reporting Entity Name", section: "reporting_entity", status: "complete" },
    { field: "Reporting Entity goAML ID", section: "reporting_entity", status: "complete" },
    { field: "MLRO Name", section: "reporting_entity", status: "complete" },
    { field: "MLRO Contact", section: "reporting_entity", status: "complete" },
    { field: "Subject Full Name", section: "subject", status: "complete" },
    { field: "Subject Emirates ID / Passport", section: "subject", status: "complete" },
    { field: "Subject Date of Birth", section: "subject", status: "complete" },
    { field: "Subject Nationality", section: "subject", status: "complete" },
    { field: "Subject Address", section: "subject", status: "incomplete", issue: "Only emirate provided, not full address", recommendation: "Include building, street, area, emirate" },
    { field: "Account Number(s)", section: "transactions", status: "complete" },
    { field: "Transaction Dates", section: "transactions", status: "complete" },
    { field: "Transaction Amounts", section: "transactions", status: "complete" },
    { field: "Transaction Types", section: "transactions", status: "incomplete", issue: "Generic 'cash deposit' — specify channel (branch/ATM/smart deposit)", recommendation: "Use goAML transaction type codes (e.g. CD01 = cash deposit branch)" },
    { field: "Suspicion Narrative", section: "narrative", status: "incomplete", issue: "Narrative does not state the date suspicion crystallised", recommendation: "Add: 'Suspicion crystallised on [DATE] upon MLRO review of [EVENT]'" },
    { field: "Related Accounts", section: "transactions", status: "missing", issue: "Linked accounts not referenced", recommendation: "List all accounts in customer's name or linked entities" },
  ],
  criticalIssues: [
    "Suspicion crystallisation date missing — mandatory for 2-business-day deadline calculation",
    "Related accounts not listed — UAE FIU goAML schema requires all linked accounts",
  ],
  warnings: [
    "Transaction type codes should use goAML standard vocabulary, not free text",
    "Subject address incomplete — may cause goAML validation error on submission",
    "No supporting documents attached — attach transaction records and CDD extracts",
  ],
  narrativeFeedback: "The narrative establishes the pattern adequately but lacks temporal anchoring and does not state the legal basis for suspicion. UAE FIU expects explicit reference to the specific AML law provision that creates the suspicion.",
  narrativeStrengths: [
    "Pattern description is factual and specific (amounts, dates, frequency)",
    "Comparison to stated transaction profile is referenced",
    "No plausible innocent explanation statement included",
  ],
  narrativeWeaknesses: [
    "Does not reference UAE FDL 10/2025 or specific AML law provision",
    "Suspicion crystallisation event not pinpointed",
    "No reference to CDD file review or adverse media check",
    "Predicate offence (structuring) not explicitly named",
  ],
  goAmlSpecificRequirements: [
    "File via UAE FIU goAML portal: https://goaml.uae.gov.ae",
    "Use STR report type (not SAR)",
    "Attach supporting documents as PDF — max 20MB per attachment",
    "All monetary amounts in AED; foreign currency with conversion rate and date",
    "Use DD/MM/YYYY date format throughout",
    "Transaction types must use goAML standard codes",
    "Save draft and validate before final submission",
    "MLRO must digitally sign/authorise before filing",
  ],
  improvedNarrativeSuggestion: "On [DATE], [BANK NAME] identified suspicious cash deposit activity in account [XXXXXXXXX] held by [CUSTOMER NAME] (Emirates ID: [XXXXXXXXXXXXXXX]). Review of account activity from [START DATE] to [END DATE] revealed [X] cash deposits totalling AED [AMOUNT], each in the range of AED [RANGE], consistently below the AED 55,000 CTR threshold prescribed by UAE Federal Decree-Law No. 20/2018 as amended by Federal Decree-Law No. 10/2025 Art.17. This pattern is consistent with structuring to evade the mandatory CTR reporting obligation, which constitutes a predicate money laundering offence under UAE Federal Law No. 4/2002 as amended. No plausible legitimate explanation has been identified. CDD review found [FINDINGS]. Suspicion crystallised on [DATE] upon MLRO review. This STR is filed pursuant to UAE FDL 10/2025 Art.26 within 2 business days of crystallisation.",
  filingDeadlineAssessment: "2 business days from suspicion crystallisation date — UAE FDL 10/2025 Art.26(1). Ensure MLRO sign-off and goAML submission within deadline.",
  regulatoryBasis: "UAE FDL 10/2025 Art.26 (STR filing obligation); UAE FIU goAML Technical Manual v3.2; CBUAE Guidance on STR Filing; FATF R.20",
};

export async function POST(req: Request) {
  let body: {
    narrative: string;
    subjectName?: string;
    subjectIdNumber?: string;
    subjectDob?: string;
    subjectNationality?: string;
    subjectAddress?: string;
    accountNumbers?: string;
    transactionSummary?: string;
    reportingEntityName?: string;
    mlroName?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.narrative?.trim()) return NextResponse.json({ ok: false, error: "narrative required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "goaml-validator temporarily unavailable - please retry." }, { status: 503 });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `You are a UAE FIU goAML STR filing specialist. Validate an STR (Suspicious Transaction Report) draft against UAE FIU goAML requirements and UAE FDL 10/2025.

goAML required fields for UAE STR:
HEADER: Report type, reference, date
REPORTING ENTITY: goAML ID, name, MLRO name, contact details
SUBJECT: Full name, ID (Emirates ID/passport), DOB, nationality, address, occupation, employer
ACCOUNTS: Account numbers, IBAN, account type, opening date
TRANSACTIONS: Date, amount (AED), type (using goAML codes), counterparty, channel
NARRATIVE: Clear description of suspicion, pattern, crystallisation date, legal basis

Narrative quality standards (UAE FIU guidance):
- State the specific suspicious activity factually
- Reference comparison to customer's stated profile
- Include suspicion crystallisation date and triggering event
- Reference the specific AML law provision (FDL 10/2025 Art.26)
- Name the predicate offence if identifiable
- State no plausible innocent explanation found
- Use professional, objective language — no speculation

Respond ONLY with valid JSON — no markdown fences:
{
  "overallStatus": "ready_to_file"|"needs_corrections"|"incomplete"|"rejected",
  "completenessScore": <0-100>,
  "narrativeQuality": "excellent"|"good"|"adequate"|"poor"|"insufficient",
  "fieldChecks": [{"field":"<name>","section":"header"|"subject"|"transactions"|"narrative"|"reporting_entity","status":"complete"|"incomplete"|"missing"|"invalid","currentValue":"<if known>","requiredFormat":"<if applicable>","issue":"<if not complete>","recommendation":"<fix>"}],
  "criticalIssues": ["<issue>"],
  "warnings": ["<warning>"],
  "narrativeFeedback": "<paragraph>",
  "narrativeStrengths": ["<strength>"],
  "narrativeWeaknesses": ["<weakness>"],
  "goAmlSpecificRequirements": ["<requirement>"],
  "improvedNarrativeSuggestion": "<improved paragraph>",
  "filingDeadlineAssessment": "<deadline analysis>",
  "regulatoryBasis": "<citation>"
}`,
        messages: [{
          role: "user",
          content: `STR Narrative Draft: ${body.narrative}
Subject Name: ${body.subjectName ?? "not provided"}
Subject ID Number: ${body.subjectIdNumber ?? "not provided"}
Subject DOB: ${body.subjectDob ?? "not provided"}
Subject Nationality: ${body.subjectNationality ?? "not provided"}
Subject Address: ${body.subjectAddress ?? "not provided"}
Account Numbers: ${body.accountNumbers ?? "not provided"}
Transaction Summary: ${body.transactionSummary ?? "not provided"}
Reporting Entity: ${body.reportingEntityName ?? "not provided"}
MLRO Name: ${body.mlroName ?? "not provided"}
Additional Context: ${body.context ?? "none"}

Validate this STR draft against UAE FIU goAML requirements.`,
        }],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "goaml-validator temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as GoAmlValidatorResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "goaml-validator temporarily unavailable - please retry." }, { status: 503 });
  }
}
