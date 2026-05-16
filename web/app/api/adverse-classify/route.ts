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

const FALLBACK: AdverseClassifyResult = {
  adverseRisk: "high",
  sarThresholdMet: true,
  sarBasis: "The adverse media describes conduct that, if substantiated, would constitute predicate offences under UAE law. The information provides reasonable grounds to suspect that funds may represent proceeds of crime, meeting the suspicion threshold under UAE FDL 10/2025 Art.21.",
  predicateOffences: [
    {
      offence: "Corruption / Bribery of public officials",
      fatfPredicate: "Corruption and bribery",
      severity: "high",
      uaeLegalBasis: "UAE Federal Anti-Corruption Law No. 6/2023; UAE Penal Code Art.234-239; UAE FDL 10/2025 Art.3",
      detail: "Reported conduct involves payments to public officials in exchange for regulatory approvals, meeting the elements of active bribery under UAE Federal Anti-Corruption Law No. 6/2023 and constituting a designated FATF R.3 predicate offence.",
    },
    {
      offence: "Fraud / Misappropriation",
      fatfPredicate: "Fraud",
      severity: "high",
      uaeLegalBasis: "UAE Penal Code Art.399-402; UAE Federal Decree-Law No. 38/2016 (Commercial Fraud); UAE FDL 10/2025 Art.3",
      detail: "The media report describes misrepresentation of financial information to obtain funds from investors, constituting fraud under UAE Penal Code Art.399 and a FATF R.3 predicate offence.",
    },
  ],
  keyEntities: [
    {
      name: "Subject (name from article)",
      role: "Primary subject — alleged perpetrator of reported conduct",
      relevance: "primary",
    },
  ],
  mediaCredibility: "medium",
  temporalRelevance: "current",
  corroborationRequired: [
    "Cross-reference subject name against UAE EOCN / OFAC / UN consolidated sanctions lists",
    "Obtain court records or official regulatory filings referencing the reported conduct",
    "Review subject's transaction history for patterns consistent with proceeds of reported offences",
  ],
  recommendedAction: "escalate_mlro",
  actionRationale: "The adverse media describes conduct meeting multiple FATF R.3 predicate offence categories with current temporal relevance. The SAR suspicion threshold under UAE FDL 10/2025 Art.21 is met. MLRO must assess whether to file an STR within 2 business days of determination under Art.26. Tipping-off prohibition applies.",
  regulatoryBasis: "UAE FDL 10/2025 Art.21; FATF R.3; FATF R.20",
  fatfR3Predicates: ["Corruption", "Fraud"],
};

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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  if (!body.articleText?.trim()) return NextResponse.json({ ok: false, error: "articleText required" }, { status: 400 , headers: gate.headers});

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "adverse-classify temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1400,
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
    return NextResponse.json({ ok: false, error: "adverse-classify temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
