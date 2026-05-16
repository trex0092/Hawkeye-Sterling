export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface PolicyReviewResult {
  overallCompliance: "compliant" | "partially_compliant" | "non_compliant";
  complianceScore: number;
  missingProvisions: Array<{
    provision: string;
    legalBasis: string;
    severity: "critical" | "high" | "medium" | "low";
    suggestedText: string;
  }>;
  outdatedReferences: Array<{
    reference: string;
    currentLaw: string;
    detail: string;
  }>;
  strengths: string[];
  recommendations: string[];
  nextReviewDate: string;
  regulatoryBasis: string;
}

const FALLBACK: PolicyReviewResult = {
  overallCompliance: "partially_compliant",
  complianceScore: 62,
  missingProvisions: [
    {
      provision: "Proliferation Financing (PF) — no reference to PF risk or PF-specific obligations",
      legalBasis: "UAE FDL 10/2025 Art.3 (PF offence); Cabinet Decision 74/2020 (targeted financial sanctions for PF); FATF R.7 (targeted financial sanctions for proliferation)",
      severity: "critical",
      suggestedText: "The institution shall identify, assess, and manage the risk of proliferation financing (PF) in accordance with UAE FDL 10/2025 Art.3 and Cabinet Decision 74/2020. All customers and transactions shall be screened against PF-related sanctions designations (UNSCR 1718, 1737 — DPRK and Iran). The institution maintains zero tolerance for any activity that facilitates the financing of proliferation of weapons of mass destruction. PF risk shall be assessed as a distinct dimension in the annual Enterprise-Wide Risk Assessment.",
    },
    {
      provision: "Beneficial Ownership (UBO) verification — no specific UBO verification procedure or threshold",
      legalBasis: "UAE FDL 10/2025 Art.11(c); Cabinet Decision 58/2020 (UBO Register); FATF R.24/25",
      severity: "critical",
      suggestedText: "The institution shall identify and verify the ultimate beneficial owner (UBO) of all corporate and legal entity customers. UBO is defined as any natural person who ultimately owns or controls, directly or indirectly, 25% or more of the shares, voting rights, or ownership interest of a legal entity, or who otherwise exercises control. Where no natural person can be identified at the 25% threshold, the institution shall identify the senior managing official. UBO verification shall be conducted at onboarding and refreshed upon any change in ownership or control structure.",
    },
    {
      provision: "Enterprise-Wide Risk Assessment (EWRA) — policy references 'risk assessment' without specifying EWRA methodology, Board approval requirement, or annual review cycle",
      legalBasis: "UAE FDL 10/2025 Art.5; FATF R.1; CBUAE AML/CFT Guidelines §3",
      severity: "high",
      suggestedText: "The institution shall conduct an Enterprise-Wide Risk Assessment (EWRA) at minimum annually, and upon any material change to the business model, product suite, or regulatory environment. The EWRA shall assess ML/TF/PF risks across four dimensions: customer risk, product/service risk, geographic risk, and delivery channel risk. The EWRA shall assess both inherent risk and residual risk following application of controls. The EWRA shall be reviewed and formally approved by the Board of Directors. The MLRO is responsible for preparing the EWRA with input from all relevant business lines.",
    },
    {
      provision: "Tipping off prohibition — no employee guidance on prohibition against disclosure of STR/goAML filings",
      legalBasis: "UAE FDL 10/2025 Art.20 (tipping off criminal offence)",
      severity: "high",
      suggestedText: "It is a criminal offence under UAE FDL 10/2025 Art.20 to disclose to any person that an STR or goAML report has been filed, or that a customer or transaction is under AML investigation. This prohibition applies to all employees regardless of seniority. Any disclosure that could alert a subject that they are under suspicion is prohibited. Employees who become aware of STR filings or AML investigations must not discuss the matter with the subject, their associates, or any third party. Breach of the tipping off prohibition may result in personal criminal prosecution.",
    },
  ],
  outdatedReferences: [
    {
      reference: "Federal Decree-Law No. 10 of 2025 (AML/CFT/CPF Law — supersedes FDL 20/2018)",
      currentLaw: "Federal Decree-Law No. 10 of 2025 (FDL 10/2025)",
      detail: "FDL 20/2018 was repealed and replaced by FDL 10/2025. All references to FDL 20/2018, 'the 2018 AML Law', or 'Federal Decree-Law 20/2018' must be updated to reference FDL 10/2025 with the applicable article numbers. FDL 10/2025 introduced significant changes including enhanced PF provisions, updated PEP definitions, and revised penalty framework.",
    },
    {
      reference: "Cabinet Resolution No. 134 of 2025 (Executive Regulations — supersedes CD 10/2019)",
      currentLaw: "Cabinet Decision implementing FDL 10/2025 (to be confirmed upon publication)",
      detail: "The implementing regulation to FDL 20/2018 should be referenced as potentially superseded pending issuance of implementing regulation to FDL 10/2025. Policy should be updated to note pending implementing regulation and commit to updating upon publication.",
    },
    {
      reference: "FATF Recommendations (2012) without reference to subsequent amendments",
      currentLaw: "FATF Recommendations as amended through 2023 (including R.15 on virtual assets)",
      detail: "Policy references FATF 2012 Recommendations without acknowledging subsequent amendments. R.15 (virtual assets) was significantly amended in 2019 and 2021. If the institution has any virtual asset exposure, updated R.15 reference is required.",
    },
  ],
  strengths: [
    "Clear MLRO appointment and authority provisions — includes MLRO independence and direct Board access",
    "Customer Due Diligence procedures are well-documented with clear tiered approach (standard/enhanced/simplified)",
    "Sanctions screening procedures reference correct UAE EOCN, OFAC, UN, EU, and UK lists",
    "STR and CTR filing procedures reference goAML and correct 2-business-day STR deadline",
    "Record retention provisions correctly specify 5-year minimum retention period",
    "PEP identification and enhanced due diligence provisions are present and correctly reference senior management approval requirement",
  ],
  recommendations: [
    "Immediately add PF (proliferation financing) provisions — this is a critical compliance gap under FDL 10/2025",
    "Add dedicated UBO verification section with 25% threshold and verification procedure",
    "Update all FDL 20/2018 references to FDL 10/2025 throughout the document",
    "Add tipping off prohibition section with specific employee guidance",
    "Strengthen EWRA provisions to specify Board approval requirement and four risk dimensions",
    "Add section on virtual asset risks (even if institution has no current VA exposure) per FATF R.15",
    "Include specific goAML filing procedures with step-by-step narrative guidance",
    "Add employee whistleblowing protection provisions per FDL 10/2025 Art.22",
    "Schedule next comprehensive review for January 2027 with semi-annual monitoring of regulatory changes",
  ],
  nextReviewDate: "2027-01-01",
  regulatoryBasis: "UAE FDL 10/2025 (all applicable articles); UAE CR 134/2025 (Executive Regulations); FATF Recommendations (2012, as amended 2023); CBUAE AML/CFT Guidelines 2021; Cabinet Decision 58/2020 (UBO); Cabinet Decision 74/2020 (TFS)",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    policyText: string;
    policyType?: string;
    institutionType?: string;
    lastReviewDate?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  if (!body.policyText?.trim()) return NextResponse.json({ ok: false, error: "policyText required" }, { status: 400 , headers: gate.headers});

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "policy-reviewer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `You are a UAE AML policy specialist with expertise in UAE FDL 10/2025 requirements, CBUAE AML/CFT Guidelines, and FATF Recommendations. Review AML/CFT policy documents for compliance with current UAE law, identify missing mandatory provisions (especially PF, UBO, EWRA, tipping off), flag outdated regulatory references (FDL 20/2018 → FDL 10/2025), and provide specific suggested text for gaps. Score overall compliance on a 0-100 scale. Identify both strengths and weaknesses. Respond ONLY with valid JSON matching the PolicyReviewResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Policy Text: ${sanitizeText(body.policyText, 2000)}
Policy Type: ${sanitizeField(body.policyType ?? "AML/CFT Policy", 100)}
Institution Type: ${sanitizeField(body.institutionType ?? "UAE licensed financial institution", 100)}
Last Review Date: ${sanitizeField(body.lastReviewDate ?? "not specified", 50)}
Additional Context: ${sanitizeText(body.context ?? "none", 2000)}

Review this AML policy for compliance with UAE FDL 10/2025. Return complete PolicyReviewResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PolicyReviewResult;
    if (!Array.isArray(result.missingProvisions)) result.missingProvisions = [];
    if (!Array.isArray(result.outdatedReferences)) result.outdatedReferences = [];
    if (!Array.isArray(result.strengths)) result.strengths = [];
    if (!Array.isArray(result.recommendations)) result.recommendations = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "policy-reviewer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
