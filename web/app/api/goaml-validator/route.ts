export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

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


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.narrative?.trim()) return NextResponse.json({ ok: false, error: "narrative required" }, { status: 400 , headers: gate.headers });
  if (body.narrative.length > 10_000) return NextResponse.json({ ok: false, error: "narrative exceeds 10,000-character limit" }, { status: 400, headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "goaml-validator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
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
          content: `STR Narrative Draft: ${sanitizeText(body.narrative)}
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
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as GoAmlValidatorResult;
    if (!Array.isArray(result.fieldChecks)) result.fieldChecks = [];
    if (!Array.isArray(result.criticalIssues)) result.criticalIssues = [];
    if (!Array.isArray(result.warnings)) result.warnings = [];
    if (!Array.isArray(result.narrativeStrengths)) result.narrativeStrengths = [];
    if (!Array.isArray(result.narrativeWeaknesses)) result.narrativeWeaknesses = [];
    if (!Array.isArray(result.goAmlSpecificRequirements)) result.goAmlSpecificRequirements = [];
    void writeAuditChainEntry(
      { event: "goaml_str_validated", actor: gate.keyId, overallStatus: result.overallStatus, completenessScore: result.completenessScore, narrativeQuality: result.narrativeQuality },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "goaml-validator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
