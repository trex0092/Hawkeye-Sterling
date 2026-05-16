// POST /api/edd-completeness
//
// EDD File Completeness Checker.
// Evaluates whether an Enhanced Due Diligence (EDD) file meets the minimum
// documentation requirements under UAE FDL 10/2025.
//
// Checks:
//   - Identity document (passport/Emirates ID/trade licence) — mandatory
//   - Source of wealth (SoW) — mandatory for high-risk / PEP
//   - Source of funds (SoF) — mandatory
//   - Business purpose / transaction rationale — mandatory
//   - Beneficial ownership chain (for corporate) — mandatory if corporate
//   - PEP declaration — mandatory if PEP flagged
//   - Adverse media search — mandatory for EDD
//   - Sanctions confirmation — mandatory
//   - Risk acceptance rationale (senior management sign-off) — mandatory for critical-risk
//   - Geographic risk justification — mandatory for high-risk jurisdictions
//   - Ongoing monitoring plan — mandatory
//   - Last review date — mandatory
//
// Returns: completeness score, missing items, gap narrative, recommendations.
//
// Regulatory basis: FDL 10/2025 Art.8; FATF R.10, R.12

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface EddFile {
  subjectType?: "individual" | "corporate" | "trust" | "foundation";
  riskClassification?: "medium" | "high" | "critical";
  isPep?: boolean;
  hasHighRiskJurisdiction?: boolean;

  // Document flags — caller sets true if document is present and satisfactory
  hasIdentityDocument?: boolean;
  hasSourceOfWealth?: boolean;
  hasSourceOfFunds?: boolean;
  hasBusinessPurpose?: boolean;
  hasBeneficialOwnership?: boolean;
  hasPepDeclaration?: boolean;
  hasAdverseMediaSearch?: boolean;
  hasSanctionsConfirmation?: boolean;
  hasSeniorManagementApproval?: boolean;
  hasGeoRiskJustification?: boolean;
  hasOngoingMonitoringPlan?: boolean;
  hasLastReviewDate?: boolean;
  hasFinancialStatements?: boolean;
  hasNetworkDiagram?: boolean;

  // Optional: free-text description of what's in the file
  fileNotes?: string;
  subjectName?: string;
  caseId?: string;
}

interface EddRequirement {
  id: string;
  label: string;
  mandatory: boolean;
  present: boolean;
  regulatoryBasis: string;
  guidance: string;
}

interface EddCompletenessResult {
  caseId: string;
  subjectName: string;
  completenessScore: number;          // 0-100
  mandatoryScore: number;             // 0-100 (mandatory items only)
  status: "complete" | "minor_gaps" | "material_gaps" | "incomplete";
  requirements: EddRequirement[];
  missing: string[];
  gapNarrative: string;
  recommendations: string[];
  aiGapAnalysis?: string;
  assessedAt: string;
}

function buildRequirements(file: EddFile): EddRequirement[] {
  const isCorporate = file.subjectType === "corporate" || file.subjectType === "trust" || file.subjectType === "foundation";
  const isCritical = file.riskClassification === "critical";
  const isHighOrCritical = file.riskClassification === "high" || isCritical;

  return [
    {
      id: "identity_document",
      label: "Identity document (passport, Emirates ID, trade licence)",
      mandatory: true,
      present: !!file.hasIdentityDocument,
      regulatoryBasis: "FDL 10/2025 Art.8(1)",
      guidance: "Certified copy of valid government-issued ID; for corporates: trade licence + MoA",
    },
    {
      id: "source_of_funds",
      label: "Source of funds (SoF) documentation",
      mandatory: true,
      present: !!file.hasSourceOfFunds,
      regulatoryBasis: "FDL 10/2025 Art.8(3); FATF R.10",
      guidance: "Bank statements, invoices, or other documentary evidence of funds origin",
    },
    {
      id: "source_of_wealth",
      label: "Source of wealth (SoW) documentation",
      mandatory: isHighOrCritical,
      present: !!file.hasSourceOfWealth,
      regulatoryBasis: "FDL 10/2025 Art.8(4); FATF R.12",
      guidance: "Required for high/critical risk. Employment evidence, business income, inheritance docs",
    },
    {
      id: "business_purpose",
      label: "Business purpose / transaction rationale",
      mandatory: true,
      present: !!file.hasBusinessPurpose,
      regulatoryBasis: "FDL 10/2025 Art.8(2)",
      guidance: "Documented explanation of why the customer is engaging in this business relationship",
    },
    {
      id: "beneficial_ownership",
      label: "Beneficial ownership chain documentation",
      mandatory: isCorporate,
      present: !!file.hasBeneficialOwnership,
      regulatoryBasis: "FDL 10/2025 Art.8(5); CR 134/2025 Art.14 (UBO chain)",
      guidance: "UBO register extract or ownership chart showing all >25% beneficial owners",
    },
    {
      id: "pep_declaration",
      label: "PEP status declaration and enhanced checks",
      mandatory: !!file.isPep,
      present: !!file.hasPepDeclaration,
      regulatoryBasis: "FDL 10/2025 Art.10; FATF R.12",
      guidance: "Written PEP determination, role/position details, and senior management approval",
    },
    {
      id: "adverse_media",
      label: "Adverse media / negative news search",
      mandatory: true,
      present: !!file.hasAdverseMediaSearch,
      regulatoryBasis: "FDL 10/2025 Art.8(6); FATF R.10",
      guidance: "Documented search of reputable news sources, with date and results recorded",
    },
    {
      id: "sanctions_confirmation",
      label: "Sanctions screening confirmation",
      mandatory: true,
      present: !!file.hasSanctionsConfirmation,
      regulatoryBasis: "FDL 10/2025 Art.11; UNSCR; OFAC",
      guidance: "Screening certificate or screenshot against OFAC SDN, UN Consolidated, UAE EOCN",
    },
    {
      id: "senior_management_approval",
      label: "Senior management / MLRO approval",
      mandatory: isCritical || !!file.isPep,
      present: !!file.hasSeniorManagementApproval,
      regulatoryBasis: "FDL 10/2025 Art.8(7); FATF R.12",
      guidance: "Signed approval from MLRO or C-suite for high-risk relationship acceptance",
    },
    {
      id: "geo_risk_justification",
      label: "Geographic risk justification",
      mandatory: !!file.hasHighRiskJurisdiction,
      present: !!file.hasGeoRiskJustification,
      regulatoryBasis: "FDL 10/2025 Art.9; FATF R.10",
      guidance: "Written rationale for accepting business from high-risk jurisdiction",
    },
    {
      id: "ongoing_monitoring_plan",
      label: "Ongoing monitoring plan / review schedule",
      mandatory: isHighOrCritical,
      present: !!file.hasOngoingMonitoringPlan,
      regulatoryBasis: "FDL 10/2025 Art.8(8); FATF R.10",
      guidance: "Documented monitoring frequency and triggers for review escalation",
    },
    {
      id: "last_review_date",
      label: "Last EDD review date recorded",
      mandatory: true,
      present: !!file.hasLastReviewDate,
      regulatoryBasis: "FDL 10/2025 Art.8(9)",
      guidance: "Date of last EDD review must be recorded; overdue reviews require immediate refresh",
    },
    {
      id: "financial_statements",
      label: "Financial statements (for corporate / high-value)",
      mandatory: isCorporate && isHighOrCritical,
      present: !!file.hasFinancialStatements,
      regulatoryBasis: "FDL 10/2025 Art.8(10)",
      guidance: "Audited accounts or management accounts for the last 2 years",
    },
    {
      id: "network_diagram",
      label: "Corporate structure / network diagram",
      mandatory: isCorporate && isCritical,
      present: !!file.hasNetworkDiagram,
      regulatoryBasis: "FDL 10/2025 Art.8(5)",
      guidance: "Visual diagram of corporate group structure and ownership layers",
    },
  ];
}

function scoreRequirements(reqs: EddRequirement[]): { overall: number; mandatory: number } {
  const mandatory = reqs.filter((r) => r.mandatory);
  const all = reqs;

  const mandatoryPresent = mandatory.filter((r) => r.present).length;
  const allPresent = all.filter((r) => r.present).length;

  return {
    mandatory: mandatory.length > 0 ? Math.round((mandatoryPresent / mandatory.length) * 100) : 100,
    overall: all.length > 0 ? Math.round((allPresent / all.length) * 100) : 100,
  };
}

function statusFor(mandatoryScore: number, overallScore: number): EddCompletenessResult["status"] {
  if (mandatoryScore === 100 && overallScore >= 85) return "complete";
  if (mandatoryScore >= 90 && overallScore >= 70) return "minor_gaps";
  if (mandatoryScore >= 70) return "material_gaps";
  return "incomplete";
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { eddFile: EddFile; generateNarrative?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { eddFile, generateNarrative = false } = body;
  if (!eddFile) {
    return NextResponse.json({ error: "eddFile is required" }, { status: 400 , headers: gate.headers });
  }

  const reqs = buildRequirements(eddFile);
  const { overall, mandatory } = scoreRequirements(reqs);
  const status = statusFor(mandatory, overall);

  const missing = reqs
    .filter((r) => r.mandatory && !r.present)
    .map((r) => `[${r.regulatoryBasis}] ${r.label}: ${r.guidance}`);

  const recommendations: string[] = [];
  if (missing.length > 0) {
    recommendations.push(`Obtain ${missing.length} missing mandatory document(s) before relationship approval`);
  }
  if (status === "incomplete") {
    recommendations.push("Do not proceed with business relationship until EDD file is complete");
    recommendations.push("Escalate to MLRO — relationship acceptance blocked pending documentation");
  } else if (status === "material_gaps") {
    recommendations.push("MLRO to review gaps and determine if relationship can proceed with conditions");
  }
  if (!eddFile.hasOngoingMonitoringPlan && (eddFile.riskClassification === "high" || eddFile.riskClassification === "critical")) {
    recommendations.push("Document an ongoing monitoring plan with review frequency before next transaction");
  }

  const presentCount = reqs.filter((r) => r.present).length;
  const gapNarrative = missing.length === 0
    ? `EDD file is complete with all ${presentCount} applicable requirements satisfied.`
    : `EDD file has ${missing.length} mandatory gap(s). Overall completeness: ${overall}% (mandatory: ${mandatory}%). ` +
      `Missing: ${reqs.filter((r) => r.mandatory && !r.present).map((r) => r.label).join(", ")}.`;

  const result: EddCompletenessResult = {
    caseId: eddFile.caseId ?? `edd-${Date.now()}`,
    subjectName: eddFile.subjectName ?? "Unknown Subject",
    completenessScore: overall,
    mandatoryScore: mandatory,
    status,
    requirements: reqs,
    missing,
    gapNarrative,
    recommendations,
    assessedAt: new Date().toISOString(),
  };

  if (generateNarrative && missing.length > 0) {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
      const anthropic = getAnthropicClient(apiKey, 4_500, "edd-completeness");
      const prompt = `You are a UAE AML compliance officer reviewing an EDD file. The file has the following gaps:

Subject: ${eddFile.subjectName ?? "Unknown"}
Risk classification: ${eddFile.riskClassification ?? "unknown"}
Type: ${eddFile.subjectType ?? "unknown"}
Mandatory completeness: ${mandatory}%

Missing mandatory items:
${reqs.filter((r) => r.mandatory && !r.present).map((r) => `- ${r.label} (${r.regulatoryBasis})`).join("\n")}

Write a 3-4 sentence gap analysis memo suitable for MLRO review. Be specific about regulatory risk and recommended remediation steps.`;

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 250,
        messages: [{ role: "user", content: prompt }],
      });
      result.aiGapAnalysis = (msg.content[0] as { type: string; text: string }).text?.trim();
    } catch {
      // best-effort
    }
  }

  return NextResponse.json(result, { headers: gate.headers });
}
