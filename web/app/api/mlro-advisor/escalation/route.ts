import { writeAuditEvent } from "@/lib/audit";
import { parseLlmJson, withMlroLlm } from "@/lib/server/mlro-route-base";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  subjectName: string;
  riskScore?: number;
  sanctionsHits?: string[];
  pepTier?: string;
  adverseMediaCount?: number;
  typologies?: string[];
  jurisdictions?: string[];
  amountAed?: number;
  cddPosture?: string;
  notes?: string;
}

interface EscalationDecision {
  decision: "FILE_STR" | "ESCALATE_INTERNAL" | "ENHANCE_CDD" | "MONITOR" | "CLEAR";
  confidence: number;
  urgency: "immediate" | "24h" | "72h" | "routine";
  primaryTrigger: string;
  regulatoryBasis: string;
  rationale: string;
  requiredActions: string[];
  deadlines: string[];
}

const FALLBACK: EscalationDecision = {
  decision: "MONITOR",
  confidence: 0,
  urgency: "routine",
  primaryTrigger: "API key not configured",
  regulatoryBasis: "",
  rationale: "Manual review required",
  requiredActions: [],
  deadlines: [],
};

const SYSTEM_PROMPT = [
  "You are a UAE MLRO making a binary compliance escalation decision under FDL 10/2025, Cabinet Resolution 134/2025, and FATF Recommendations. Analyze the risk signals and output a decision. Be decisive — this decision drives regulatory action.",
  "",
  "Heuristics:",
  "- OFAC/UN sanctions hit → always FILE_STR, urgency: immediate",
  "- PEP tier national/state_leader → ESCALATE_INTERNAL or FILE_STR if other signals present",
  "- riskScore ≥ 85 + typologies → FILE_STR or ESCALATE_INTERNAL",
  "- CAHRA jurisdictions (IR, RU, KP, SY, SD, AF, BY, CU, MM, VE) → ESCALATE_INTERNAL minimum",
  "- AED ≥ 55,000 cash DPMS → ENHANCE_CDD minimum",
  "- No hits, low score → MONITOR or CLEAR",
  "",
  "Output ONLY valid JSON in this exact shape:",
  `{
  "decision": "FILE_STR" | "ESCALATE_INTERNAL" | "ENHANCE_CDD" | "MONITOR" | "CLEAR",
  "confidence": 0.0-1.0,
  "urgency": "immediate" | "24h" | "72h" | "routine",
  "primaryTrigger": "string — the single most important regulatory trigger e.g. 'OFAC SDN hit → FDL Art.26 mandatory filing'",
  "regulatoryBasis": "string — specific articles/recommendations e.g. 'FDL Art.26, FATF R.20, Cabinet Decision 134/2025 Art.8'",
  "rationale": "string — 2-3 sentence MLRO-grade justification",
  "requiredActions": ["string array — specific next steps e.g. 'Freeze account within 24h per EOCN guidance'"],
  "deadlines": ["string array — e.g. '30-day STR filing deadline: 2026-05-30'"]
}`,
].join("\n");

// Audit M7: thin shell over withMlroLlm — see web/lib/server/mlro-route-base.ts.
export const POST = (req: Request) => withMlroLlm<Body, EscalationDecision>(req, {
  route: "mlro-advisor/escalation",
  model: "claude-haiku-4-5-20251001",
  maxTokens: 2048,
  parseBody: (raw): Body | null => {
    if (!raw || typeof raw !== "object") return null;
    const b = raw as Partial<Body>;
    if (!b.subjectName?.trim()) return null;
    return b as Body;
  },
  buildRequest: (body) => {
    const signals: string[] = [];
    if (body.riskScore !== null) signals.push(`Risk score: ${body.riskScore}/100`);
    if (body.sanctionsHits?.length) signals.push(`Sanctions hits: ${body.sanctionsHits.slice(0, 20).map((h) => sanitizeField(h, 100)).join(", ")}`);
    if (body.pepTier) signals.push(`PEP tier: ${sanitizeField(body.pepTier, 50)}`);
    if (body.adverseMediaCount !== null) signals.push(`Adverse media hits: ${body.adverseMediaCount}`);
    if (body.typologies?.length) signals.push(`Typologies: ${body.typologies.slice(0, 20).map((t) => sanitizeField(t, 100)).join(", ")}`);
    if (body.jurisdictions?.length) signals.push(`Jurisdictions: ${body.jurisdictions.slice(0, 20).map((j) => sanitizeField(j, 100)).join(", ")}`);
    if (body.amountAed != null) signals.push(`Amount (AED): ${body.amountAed.toLocaleString()}`);
    if (body.cddPosture) signals.push(`CDD posture: ${sanitizeField(body.cddPosture, 50)}`);
    if (body.notes) signals.push(`Analyst notes: ${sanitizeText(body.notes, 1000)}`);

    const userContent = [
      `Subject: ${sanitizeField(body.subjectName, 300)}`,
      "",
      "RISK SIGNALS:",
      signals.length > 0 ? signals.join("\n") : "No signals provided.",
      "",
      "Analyze the risk signals above and output a JSON escalation decision object.",
    ].join("\n");

    return { system: SYSTEM_PROMPT, userContent };
  },
  parseResult: (text): EscalationDecision => {
    const parsed = parseLlmJson<EscalationDecision>(text);
    if (parsed) return parsed;
    return { ...FALLBACK, primaryTrigger: "Parse error", rationale: "AI response could not be parsed — manual review required." };
  },
  onSuccess: (decision, body) => {
    writeAuditEvent(
      "mlro",
      "advisor.escalation-decision",
      `${sanitizeField(body.subjectName, 300)} → ${decision.decision} (confidence ${decision.confidence}, urgency ${decision.urgency})`,
    );
  },
  offlineFallback: FALLBACK,
});
