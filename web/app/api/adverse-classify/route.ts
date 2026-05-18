export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export interface PredicateOffence {
  offence: string;
  fatfPredicate: string;
  severity: "critical" | "high" | "medium" | "low";
  uaeLegalBasis: string;
  detail: string;
}

export interface KeyEntity {
  name: string;
  role: string;
  relevance: "primary" | "secondary" | "peripheral";
}

export interface AdverseClassifyResult {
  adverseRisk: "critical" | "high" | "medium" | "low" | "none";
  sarThresholdMet: boolean;
  sarBasis: string;
  predicateOffences: PredicateOffence[];
  keyEntities: KeyEntity[];
  mediaCredibility: "high" | "medium" | "low";
  temporalRelevance: "current" | "historical" | "unclear";
  corroborationRequired: string[];
  recommendedAction: "file_str_immediately" | "escalate_mlro" | "enhanced_monitoring" | "note_and_monitor" | "disregard";
  actionRationale: string;
  regulatoryBasis: string;
  fatfR3Predicates: string[];
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    articleText: string;
    subjectName?: string;
    jurisdiction?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.articleText?.trim()) return NextResponse.json({ ok: false, error: "articleText required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "adverse-classify temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE MLRO specialist classifying adverse media against FATF Recommendation 3 predicate offences and UAE FDL 10/2025 AML/CFT thresholds. Apply the 23 FATF predicate offence categories. Assess whether the information meets reasonable grounds for suspicion under UAE FDL 10/2025 Art.21.

Respond ONLY with valid JSON — no markdown fences:
{
  "adverseRisk": "critical"|"high"|"medium"|"low"|"none",
  "sarThresholdMet": <true|false>,
  "sarBasis": "<explanation>",
  "predicateOffences": [{"offence": "<offence>", "fatfPredicate": "<FATF R.3 category>", "severity": "critical"|"high"|"medium"|"low", "uaeLegalBasis": "<UAE law citation>", "detail": "<explanation>"}],
  "keyEntities": [{"name": "<name>", "role": "<role>", "relevance": "primary"|"secondary"|"peripheral"}],
  "mediaCredibility": "high"|"medium"|"low",
  "temporalRelevance": "current"|"historical"|"unclear",
  "corroborationRequired": ["<action>"],
  "recommendedAction": "file_str_immediately"|"escalate_mlro"|"enhanced_monitoring"|"note_and_monitor"|"disregard",
  "actionRationale": "<paragraph>",
  "regulatoryBasis": "<full citation>",
  "fatfR3Predicates": ["<category>"]
}`,
        messages: [
          {
            role: "user",
            content: `Article / Report Text:
${body.articleText}

Subject Name: ${body.subjectName ?? "not specified"}
Jurisdiction: ${body.jurisdiction ?? "not specified"}
Additional Context: ${body.context ?? "none"}

Classify this adverse media against FATF predicate offences and assess SAR threshold.`,
          },
        ],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as AdverseClassifyResult;
    if (!Array.isArray(result.predicateOffences)) result.predicateOffences = [];
    if (!Array.isArray(result.keyEntities)) result.keyEntities = [];
    if (!Array.isArray(result.corroborationRequired)) result.corroborationRequired = [];
    if (!Array.isArray(result.fatfR3Predicates)) result.fatfR3Predicates = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "adverse-classify temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
