export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface RiskAppetiteResult {
  riskAppetiteStatement: string;
  riskTolerances: Array<{
    category: string;
    tolerance: "zero" | "low" | "medium" | "high";
    statement: string;
    kri: string;
    threshold: string;
  }>;
  prohibitedActivities: string[];
  escalationTriggers: string[];
  reviewFrequency: string;
  boardApprovalNote: string;
  regulatoryBasis: string;
}

const FALLBACK: RiskAppetiteResult = {
  riskAppetiteStatement: "The Board of [Institution Name] has zero tolerance for facilitating money laundering, terrorist financing, or proliferation financing. The institution accepts a low residual ML/TF risk arising from its regulated business activities, provided that all applicable UAE AML/CFT obligations under FDL 10/2025 are met, an effective risk-based compliance programme is maintained, and all required regulatory reporting is completed accurately and timely. The institution will not onboard or maintain relationships where the risk cannot be effectively managed within this risk appetite, even where such relationships may be commercially attractive.",
  riskTolerances: [
    {
      category: "Terrorist Financing (TF) and Proliferation Financing (PF)",
      tolerance: "zero",
      statement: "The institution has absolute zero tolerance for any transaction, customer relationship, or activity that directly or indirectly facilitates terrorist financing or proliferation financing. Any credible TF/PF indicator requires immediate escalation to the MLRO and potential referral to UAE authorities without exception.",
      kri: "Number of confirmed TF/PF alerts not escalated to MLRO within SLA",
      threshold: "Zero — single breach triggers Board-level review",
    },
    {
      category: "Sanctions Violations",
      tolerance: "zero",
      statement: "The institution has zero tolerance for processing any transaction or maintaining any relationship with a person or entity that is subject to UAE EOCN, UN, OFAC, EU, or UK financial sanctions. All sanctions hits must be frozen and reported to the UAE Central Bank within the legally required timeframe.",
      kri: "Number of undetected sanctions matches processed",
      threshold: "Zero — any confirmed sanctions breach is a regulatory incident requiring mandatory notification",
    },
    {
      category: "Money Laundering Risk",
      tolerance: "low",
      statement: "The institution accepts a low residual ML risk from its customer portfolio and product suite, with the understanding that the risk-based AML programme effectively mitigates inherent risks. Residual risk must remain within 'low' or 'medium' per the annual EWRA assessment. High residual risk findings in the EWRA require Board-approved remediation plans within 30 days.",
      kri: "EWRA residual risk rating; number of overdue CDD refresh files; TM alert closure SLA compliance rate",
      threshold: "EWRA residual risk ≤ medium; CDD overdue files < 2%; TM SLA compliance ≥ 95%",
    },
    {
      category: "Regulatory Reporting (STR/CTR)",
      tolerance: "zero",
      statement: "The institution has zero tolerance for failure to file required Suspicious Transaction Reports (STRs) or Cash Transaction Reports (CTRs) within legally mandated timeframes. The MLRO is empowered to file STRs without prior approval from business lines or senior management.",
      kri: "STR filing timeliness (% filed within 2 business days of MLRO determination); CTR filing rate",
      threshold: "100% timely STR filing; 100% timely CTR filing — any late filing is a reportable incident",
    },
    {
      category: "PEP and High-Risk Customer Relationships",
      tolerance: "low",
      statement: "The institution accepts a low appetite for PEP and high-risk country customer relationships, limited to cases where full EDD has been completed, senior management has approved the relationship, and enhanced ongoing monitoring is applied. No relationship where EDD cannot be satisfactorily completed will be onboarded regardless of commercial value.",
      kri: "Number of PEP relationships without current senior management approval; EDD completion rate for high-risk customers",
      threshold: "100% PEP relationships with current approval; EDD completion ≥ 98% — breach triggers MLRO review",
    },
    {
      category: "Anonymous or Unidentified Transactions",
      tolerance: "zero",
      statement: "The institution will not process any transaction where the identity of the customer or beneficial owner cannot be verified. Unverified beneficial ownership is a basis for transaction refusal or account exit regardless of transaction value.",
      kri: "Number of transactions processed without completed CDD",
      threshold: "Zero — any identified case is an immediate escalation trigger",
    },
  ],
  prohibitedActivities: [
    "Onboarding or maintaining relationships with persons or entities on UAE EOCN, UN, OFAC, EU, or UK financial sanctions lists",
    "Processing transactions that the institution knows or suspects are related to terrorist financing or proliferation financing",
    "Maintaining numbered or anonymous accounts with no associated beneficial owner identification",
    "Onboarding shell companies where the ultimate beneficial owner cannot be identified and verified",
    "Accepting cash deposits from customers in amounts or patterns consistent with structuring",
    "Establishing correspondent banking relationships with shell banks (banks with no physical presence in any jurisdiction)",
    "Processing transactions linked to jurisdictions subject to UNSCR-mandated financial sanctions (DPRK, Iran, Myanmar)",
    "Providing services to unlicensed money service businesses or hawala operators",
    "Facilitating transactions where the stated purpose is inconsistent with the customer's known business or profile",
  ],
  escalationTriggers: [
    "Any credible TF or PF indicator — immediate escalation to MLRO, same day",
    "Any confirmed or probable sanctions match — immediate MLRO escalation and transaction freeze",
    "STR filing deadline approaching within 4 business hours — immediate MLRO prioritisation",
    "CBUAE inspection notice received — immediate CEO and Board notification",
    "Any regulatory penalty, warning, or notice received from CBUAE or other regulator",
    "Material AML programme failure identified (e.g. TM system offline, screening system failure exceeding 2 hours)",
    "Media report linking the institution to ML/TF concerns",
    "Employee suspected of AML-related misconduct or tipping off",
    "EWRA residual risk assessed as 'high' or 'critical' — Board notification within 5 working days",
  ],
  reviewFrequency: "Annual minimum — the Board will review and re-approve the Risk Appetite Statement as part of the annual EWRA review. Ad hoc review required upon: material changes to business model or product suite, CBUAE regulatory change, significant change in ML/TF risk environment, or material risk appetite breach.",
  boardApprovalNote: "This Risk Appetite Statement must be approved by the full Board of Directors (not delegated to a sub-committee) and signed by the Board Chairman and MLRO. Board approval is required for any material amendment. The approved statement must be communicated to all relevant staff and embedded in the AML Policy, EWRA, and annual training programme. Regulatory basis: UAE FDL 10/2025 Art.5(2) — Board accountability for AML/CFT framework.",
  regulatoryBasis: "UAE FDL 10/2025 Art.5 (governance and EWRA), Art.17 (STR obligations), Art.23 (sanctions); FATF R.1 (risk-based approach); CBUAE AML/CFT Guidelines §3 (risk appetite); CBUAE Board and Senior Management Guidance; Basel Committee on Banking Supervision — Sound Management of Risks Related to ML/TF (2016)",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    institutionType: string;
    riskProfile?: string;
    boardPosition?: string;
    keyProducts?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  if (!body.institutionType?.trim()) return NextResponse.json({ ok: false, error: "institutionType required" }, { status: 400 , headers: gate.headers});

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "risk-appetite-builder temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1450,
        system: `You are a UAE AML governance specialist with expertise in Board-level risk appetite frameworks, UAE FDL 10/2025 governance requirements, and CBUAE AML programme expectations. Draft comprehensive AML/CFT Risk Appetite Statements including risk tolerances (zero/low/medium/high) with specific KRIs and thresholds, prohibited activities, escalation triggers, and board approval requirements. Ensure statements are legally grounded, operationally actionable, and reflect UAE regulatory expectations. Respond ONLY with valid JSON matching the RiskAppetiteResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Institution Type: ${sanitizeField(body.institutionType, 100)}
Current Risk Profile: ${sanitizeText(body.riskProfile, 2000) ?? "not specified"}
Board's Stated Position on Risk: ${sanitizeText(body.boardPosition, 2000) ?? "not specified"}
Key Products/Services: ${sanitizeText(body.keyProducts, 2000) ?? "not specified"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Draft a comprehensive AML/CFT Risk Appetite Statement for this institution. Return complete RiskAppetiteResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as RiskAppetiteResult;
    if (!Array.isArray(result.riskTolerances)) result.riskTolerances = [];
    if (!Array.isArray(result.prohibitedActivities)) result.prohibitedActivities = [];
    if (!Array.isArray(result.escalationTriggers)) result.escalationTriggers = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "risk-appetite-builder temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
