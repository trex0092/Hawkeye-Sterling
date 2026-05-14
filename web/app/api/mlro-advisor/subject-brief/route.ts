import { writeAuditEvent } from "@/lib/audit";
import { stripJsonFences, withMlroLlm } from "@/lib/server/mlro-route-base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  subjectName: string;
  jurisdiction?: string;
  entityType?: string;
  context?: string;
}

interface RiskProfile {
  nameRisk: "high" | "medium" | "low";
  jurisdictionRisk: "high" | "medium" | "low";
  entityTypeRisk: "high" | "medium" | "low";
  compositeRisk: "high" | "medium" | "low";
  rationale: string;
}

interface SubjectBriefResult {
  riskProfile: RiskProfile;
  likelyTypologies: string[];
  sanctionsExposure: string;
  keyQuestions: string[];
  dueDiligenceChecklist: string[];
  regulatoryContext: string;
}

const FALLBACK: SubjectBriefResult = {
  riskProfile: {
    nameRisk: "low",
    jurisdictionRisk: "low",
    entityTypeRisk: "low",
    compositeRisk: "low",
    rationale: "API key not configured — manual pre-screening required",
  },
  likelyTypologies: [],
  sanctionsExposure: "",
  keyQuestions: [],
  dueDiligenceChecklist: [],
  regulatoryContext: "",
};

const SYSTEM_PROMPT = [
  "You are a UAE MLRO conducting a pre-screening intelligence brief on a subject. Before any compliance interaction, generate a concise intelligence assessment. Consider: name etymology (common name in sanctioned jurisdictions?), entity type risk, jurisdiction exposure, likely typologies to probe for, and the 5 highest-value questions a compliance officer should ask.",
  "",
  "Output ONLY valid JSON in this exact shape:",
  `{
  "riskProfile": {
    "nameRisk": "high" | "medium" | "low",
    "jurisdictionRisk": "high" | "medium" | "low",
    "entityTypeRisk": "high" | "medium" | "low",
    "compositeRisk": "high" | "medium" | "low",
    "rationale": "string — 1-2 sentences"
  },
  "likelyTypologies": ["string array — e.g. 'trade-based ML', 'PEP wealth concealment'"],
  "sanctionsExposure": "string — which lists are most likely to have hits",
  "keyQuestions": ["string array of exactly 5 — specific questions to ask the subject"],
  "dueDiligenceChecklist": ["string array — specific documents to request"],
  "regulatoryContext": "string — relevant UAE/FATF framework for this subject type"
}`,
].join("\n");

// Audit M7: post-consolidation, this route is a thin shell over the
// shared withMlroLlm() base — the entire boilerplate (enforce → parse →
// no-key fallback → client → response) lives in mlro-route-base.ts.
export const POST = (req: Request) => withMlroLlm<Body, SubjectBriefResult>(req, {
  route: "mlro-advisor/subject-brief",
  model: "claude-haiku-4-5-20251001",
  maxTokens: 2048,
  parseBody: (raw): Body | null => {
    if (!raw || typeof raw !== "object") return null;
    const b = raw as Partial<Body>;
    if (!b.subjectName?.trim()) return null;
    return b as Body;
  },
  buildRequest: (body) => {
    const lines: string[] = [`Subject name: ${body.subjectName.trim()}`];
    if (body.jurisdiction) lines.push(`Jurisdiction: ${body.jurisdiction}`);
    if (body.entityType) lines.push(`Entity type: ${body.entityType}`);
    if (body.context) lines.push(`Context: ${body.context.slice(0, 500)}`);
    return {
      system: SYSTEM_PROMPT,
      userContent: `${lines.join("\n")}\n\nGenerate a pre-screening intelligence brief for this subject and output the structured JSON.`,
    };
  },
  parseResult: (text): SubjectBriefResult => {
    try {
      return JSON.parse(stripJsonFences(text)) as SubjectBriefResult;
    } catch {
      // Parse failures gracefully degrade to FALLBACK (preserves prior
      // behaviour — the route always returned ok:true even when the
      // model output was malformed).
      return { ...FALLBACK, riskProfile: { ...FALLBACK.riskProfile, rationale: "AI response could not be parsed — manual review required." } };
    }
  },
  onSuccess: (result, body) => {
    writeAuditEvent(
      "mlro",
      "advisor.subject-brief",
      `${body.subjectName.trim()} → compositeRisk: ${result.riskProfile.compositeRisk}, sanctionsExposure: ${result.sanctionsExposure.slice(0, 80)}`,
    );
  },
  offlineFallback: FALLBACK,
});
