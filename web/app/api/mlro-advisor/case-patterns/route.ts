import { writeAuditEvent } from "@/lib/audit";
import { stripJsonFences, withMlroLlm } from "@/lib/server/mlro-route-base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CaseInput {
  id: string;
  subject: string;
  meta: string;
  status: string;
  openedAt: string;
  reportKind?: string;
}

interface Body {
  cases: CaseInput[];
}

interface Pattern {
  type:
    | "coordinated_structuring"
    | "shared_counterparty"
    | "typology_cluster"
    | "jurisdiction_concentration"
    | "escalating_trend"
    | "consolidation_candidate"
    | "other";
  severity: "critical" | "high" | "medium";
  caseIds: string[];
  description: string;
  regulatoryImplication: string;
  recommendedAction: string;
}

interface CasePatternsResult {
  patterns: Pattern[];
  portfolioRisk: "critical" | "high" | "medium" | "low";
  consolidationRequired: boolean;
  immediateEscalations: string[];
  summary: string;
}

const FALLBACK: CasePatternsResult = {
  patterns: [],
  portfolioRisk: "low",
  consolidationRequired: false,
  immediateEscalations: [],
  summary: "Insufficient cases for pattern analysis",
};

const SYSTEM_PROMPT = [
  "You are a UAE MLRO analyzing a portfolio of compliance cases for cross-case patterns. Look for: coordinated structuring (multiple cases with similar amounts/timing), shared counterparties or beneficial owners, typology clusters (same ML method across cases), jurisdictional concentration, escalating risk trends, cases that should be consolidated into a single SAR.",
  "",
  "Output ONLY valid JSON in this exact shape:",
  `{
  "patterns": [
    {
      "type": "coordinated_structuring" | "shared_counterparty" | "typology_cluster" | "jurisdiction_concentration" | "escalating_trend" | "consolidation_candidate" | "other",
      "severity": "critical" | "high" | "medium",
      "caseIds": ["string array of case IDs involved"],
      "description": "string — specific pattern description",
      "regulatoryImplication": "string — what this pattern means under UAE/FATF rules",
      "recommendedAction": "string"
    }
  ],
  "portfolioRisk": "critical" | "high" | "medium" | "low",
  "consolidationRequired": boolean,
  "immediateEscalations": ["string array of case IDs needing immediate escalation"],
  "summary": "string — 2-sentence portfolio risk summary for the MLRO"
}`,
].join("\n");

// Audit M7: thin shell over withMlroLlm — see web/lib/server/mlro-route-base.ts.
// Note: pre-consolidation route returned 503 for cases.length < 2; the
// corrected status is 400 (client error — not enough cases supplied).
export const POST = (req: Request) => withMlroLlm<Body, CasePatternsResult>(req, {
  route: "mlro-advisor/case-patterns",
  model: "claude-haiku-4-5-20251001",
  maxTokens: 2048,
  parseBody: (raw): Body | null => {
    if (!raw || typeof raw !== "object") return null;
    const b = raw as Partial<Body>;
    if (!Array.isArray(b.cases) || b.cases.length < 2) return null;
    return b as Body;
  },
  buildRequest: (body) => {
    const casesSummary = body.cases
      .map((c) =>
        [
          `Case ID: ${c.id}`,
          `Subject: ${c.subject}`,
          `Meta: ${c.meta}`,
          `Status: ${c.status}`,
          `Opened: ${c.openedAt}`,
          ...(c.reportKind ? [`Report Kind: ${c.reportKind}`] : []),
        ].join(" | "),
      )
      .join("\n");
    return {
      system: SYSTEM_PROMPT,
      userContent: `Analyze the following ${body.cases.length} compliance cases for cross-case patterns and output the structured JSON:\n\n${casesSummary}`,
    };
  },
  parseResult: (text): CasePatternsResult => {
    try {
      return JSON.parse(stripJsonFences(text)) as CasePatternsResult;
    } catch {
      return { ...FALLBACK, summary: "AI response could not be parsed — manual review required." };
    }
  },
  onSuccess: (result, body) => {
    writeAuditEvent(
      "mlro",
      "advisor.case-patterns",
      `${body.cases.length} case(s) analyzed → ${result.patterns.length} pattern(s), portfolioRisk: ${result.portfolioRisk}, consolidation: ${result.consolidationRequired}`,
    );
  },
  offlineFallback: FALLBACK,
});
