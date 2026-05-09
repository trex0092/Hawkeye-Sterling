import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

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

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "mlro-advisor/subject-brief temporarily unavailable - please retry." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  if (!body?.subjectName?.trim()) {
    return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400 });
  }

  const lines: string[] = [`Subject name: ${body.subjectName.trim()}`];
  if (body.jurisdiction) lines.push(`Jurisdiction: ${body.jurisdiction}`);
  if (body.entityType) lines.push(`Entity type: ${body.entityType}`);
  if (body.context) lines.push(`Context: ${body.context.slice(0, 500)}`);

  const userContent = `${lines.join("\n")}\n\nGenerate a pre-screening intelligence brief for this subject and output the structured JSON.`;

  const systemPrompt = [
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

  let result: SubjectBriefResult;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      result = { ...FALLBACK, riskProfile: { ...FALLBACK.riskProfile, rationale: `AI analysis unavailable (API ${res.status}) — manual review required.` } };
    } else {
      const data = (await res.json()) as {
        content?: { type: string; text: string }[];
      };
      const raw = data?.content?.[0]?.text ?? "";
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
      try {
        result = JSON.parse(cleaned) as SubjectBriefResult;
      } catch {
        result = { ...FALLBACK, riskProfile: { ...FALLBACK.riskProfile, rationale: "AI response could not be parsed — manual review required." } };
      }
    }
  } catch {
    result = { ...FALLBACK, riskProfile: { ...FALLBACK.riskProfile, rationale: "AI analysis temporarily unavailable — manual review required." } };
  }

  try {
    writeAuditEvent(
      "mlro",
      "advisor.subject-brief",
      `${body.subjectName.trim()} → compositeRisk: ${result.riskProfile.compositeRisk}, sanctionsExposure: ${result.sanctionsExposure.slice(0, 80)}`,
    );
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, ...result });
}
