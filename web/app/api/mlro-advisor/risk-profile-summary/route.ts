import { writeAuditEvent } from "@/lib/audit";
import { parseLlmJson, withMlroLlm } from "@/lib/server/mlro-route-base";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  entityName: string;
  entityType?: string;
  sector?: string;
  jurisdiction?: string;
  riskScore?: number;
  adverseMedia?: boolean;
  context?: string;
}

interface InherentRiskFactor {
  title: string;
  level: "elevated" | "high" | "medium-high" | "medium" | "low";
  bullets: string[];
}

interface MitigatingFactor {
  factor: string;
  impact: string;
}

interface ResidualRiskDimension {
  dimension: string;
  rating: "high" | "medium" | "low" | "not_indicated";
}

interface RiskProfileSummaryResult {
  entityOverview: {
    entityType: string;
    sector: string;
    jurisdiction: string;
    riskScore: number;
    adverseMedia: boolean;
  };
  inherentRiskFactors: InherentRiskFactor[];
  mitigatingFactors: MitigatingFactor[];
  residualRiskAssessment: ResidualRiskDimension[];
  overallResidualRisk: "high" | "medium" | "low";
  dueDiligenceActions: string[];
  redFlagsToWatch: string[];
  conclusion: {
    narrative: string;
    onboardingDecision:
      | "proceed_standard"
      | "proceed_standard_plus"
      | "proceed_edd"
      | "escalate"
      | "decline";
    onboardingRationale: string;
  };
}

const FALLBACK: RiskProfileSummaryResult = {
  entityOverview: {
    entityType: "Unknown",
    sector: "Unknown",
    jurisdiction: "Unknown",
    riskScore: 50,
    adverseMedia: false,
  },
  inherentRiskFactors: [],
  mitigatingFactors: [],
  residualRiskAssessment: [
    { dimension: "Country / Jurisdiction", rating: "not_indicated" },
    { dimension: "Sector / Business Type", rating: "not_indicated" },
    { dimension: "Adverse Media", rating: "not_indicated" },
    { dimension: "Transaction Pattern", rating: "not_indicated" },
    { dimension: "PEP / Sanctions Exposure", rating: "not_indicated" },
  ],
  overallResidualRisk: "medium",
  dueDiligenceActions: [],
  redFlagsToWatch: [],
  conclusion: {
    narrative: "API key not configured — manual risk assessment required.",
    onboardingDecision: "proceed_standard",
    onboardingRationale: "Manual review required.",
  },
};

const SYSTEM_PROMPT = `You are a Senior MLRO and Compliance Specialist at a UAE-regulated financial institution. Generate a structured Risk Profile Summary for the provided entity. Apply UAE FDL 10/2025, FATF Recommendations, CBUAE AML Standards, and FATF sector-specific guidance.

Evaluate:
1. INHERENT RISK FACTORS — assess Jurisdictional, Sector, and Product/Transaction risk independently
2. MITIGATING FACTORS — identify what genuinely reduces the risk score (clean adverse media, score below EDD trigger, etc.)
3. RESIDUAL RISK — rate 5 standard dimensions after controls: Country/Jurisdiction, Sector/Business Type, Adverse Media, Transaction Pattern, PEP/Sanctions Exposure
4. DUE DILIGENCE ACTIONS — tailored steps (SOW, SOF, licensing, sanctions screening, PEP check, counterparty review, TBML)
5. RED FLAGS — specific, sector-relevant indicators to monitor
6. CONCLUSION — clear onboarding recommendation

Output ONLY valid JSON in this exact shape:
{
  "entityOverview": {
    "entityType": "string",
    "sector": "string",
    "jurisdiction": "string — full country name + ISO-2 in brackets, e.g. Turkey (TR)",
    "riskScore": number,
    "adverseMedia": boolean
  },
  "inherentRiskFactors": [
    {
      "title": "string — e.g. Jurisdictional Risk — Elevated",
      "level": "elevated" | "high" | "medium-high" | "medium" | "low",
      "bullets": ["string — specific risk point with regulatory context, 3-5 bullets"]
    }
  ],
  "mitigatingFactors": [
    {
      "factor": "string — mitigating factor name",
      "impact": "string — how this factor reduces risk"
    }
  ],
  "residualRiskAssessment": [
    { "dimension": "Country / Jurisdiction", "rating": "high" | "medium" | "low" | "not_indicated" },
    { "dimension": "Sector / Business Type", "rating": "high" | "medium" | "low" | "not_indicated" },
    { "dimension": "Adverse Media", "rating": "high" | "medium" | "low" | "not_indicated" },
    { "dimension": "Transaction Pattern", "rating": "high" | "medium" | "low" | "not_indicated" },
    { "dimension": "PEP / Sanctions Exposure", "rating": "high" | "medium" | "low" | "not_indicated" }
  ],
  "overallResidualRisk": "high" | "medium" | "low",
  "dueDiligenceActions": [
    "string — specific actionable step with regulatory basis, e.g. Verify Source of Wealth (SOW) — Document how the entity acquired its business capital per FDL 10/2025 Art.12(3)"
  ],
  "redFlagsToWatch": [
    "string — specific, observable red flag relevant to this entity type and sector"
  ],
  "conclusion": {
    "narrative": "string — 2-3 sentences summarising the composite risk and key drivers",
    "onboardingDecision": "proceed_standard" | "proceed_standard_plus" | "proceed_edd" | "escalate" | "decline",
    "onboardingRationale": "string — recommended path with specific next steps"
  }
}

Rules:
- Include exactly 3 inherentRiskFactors: Jurisdictional, Sector, and Product/Transaction
- Include 2-4 mitigatingFactors proportional to what is actually mitigating
- dueDiligenceActions: 6-8 specific steps
- redFlagsToWatch: 5-8 specific flags
- Do NOT fabricate adverse media or sanctions hits
- Base all assessments on the actual inputs provided`;

export const POST = (req: Request) =>
  withMlroLlm<Body, RiskProfileSummaryResult>(req, {
    route: "mlro-advisor/risk-profile-summary",
    model: "claude-haiku-4-5-20251001",
    maxTokens: 4096,
    parseBody: (raw): Body | null => {
      if (!raw || typeof raw !== "object") return null;
      const b = raw as Partial<Body>;
      if (!b.entityName?.trim()) return null;
      return {
        entityName: b.entityName,
        entityType: b.entityType,
        sector: b.sector,
        jurisdiction: b.jurisdiction,
        riskScore: typeof b.riskScore === "number" ? b.riskScore : 50,
        adverseMedia: b.adverseMedia ?? false,
        context: b.context,
      };
    },
    buildRequest: (body) => {
      const lines: string[] = [
        `Entity name: ${sanitizeField(body.entityName, 300)}`,
      ];
      if (body.entityType) lines.push(`Entity type: ${sanitizeField(body.entityType, 100)}`);
      if (body.sector) lines.push(`Sector: ${sanitizeField(body.sector, 150)}`);
      if (body.jurisdiction) lines.push(`Jurisdiction: ${sanitizeField(body.jurisdiction, 100)}`);
      lines.push(`Risk score: ${body.riskScore ?? 50}/100`);
      lines.push(`Adverse media: ${body.adverseMedia ? "Yes — adverse media detected" : "None detected"}`);
      if (body.context) lines.push(`Additional context: ${sanitizeText(body.context, 800)}`);
      return {
        system: SYSTEM_PROMPT,
        userContent: `${lines.join("\n")}\n\nGenerate a comprehensive Risk Profile Summary and output the structured JSON.`,
      };
    },
    parseResult: (text): RiskProfileSummaryResult => {
      const parsed = parseLlmJson<RiskProfileSummaryResult>(text);
      if (parsed) return parsed;
      return {
        ...FALLBACK,
        conclusion: {
          ...FALLBACK.conclusion,
          narrative: "AI response could not be parsed — manual risk assessment required.",
        },
      };
    },
    onSuccess: (result, body) => {
      writeAuditEvent(
        "mlro",
        "advisor.risk-profile-summary",
        `${body.entityName.trim()} → overallResidualRisk: ${result.overallResidualRisk}, decision: ${result.conclusion.onboardingDecision}`,
      );
    },
    offlineFallback: FALLBACK,
  });
