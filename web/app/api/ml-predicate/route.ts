export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface PrimaryPredicate {
  offence: string;
  uaeLegalRef: string;
  fatfCategory: string;
  maxPenalty: string;
  imprisonmentYears?: string;
  fineAed?: string;
}

export interface SecondaryPredicate {
  offence: string;
  uaeLegalRef: string;
  fatfCategory: string;
  maxPenalty: string;
  overlap: string;
}

export interface MlPredicateResult {
  primaryPredicate: PrimaryPredicate;
  secondaryPredicates: SecondaryPredicate[];
  mlOffenceApplicable: boolean;
  mlLegalBasis: string;
  proceedsEstimate: string;
  selfLaunderingApplicable: boolean;
  strRequired: boolean;
  strBasis: string;
  investigativeActions: string[];
  jurisdictionalIssues: string[];
  regulatoryBasis: string;
  fatfR3Categories: string[];
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    facts: string;
    suspectedActivity?: string;
    jurisdiction?: string;
    subjectType?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.facts?.trim()) return NextResponse.json({ ok: false, error: "facts required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ml-predicate temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE AML legal specialist mapping case facts to applicable predicate offences under UAE Federal Law No. 10/2025 (FDL), UAE Penal Code (Federal Law No. 3/1987 as amended), and FATF Recommendation 3's 23 designated predicate offences. Identify the primary predicate offence, secondary predicates, maximum penalties, and whether self-laundering applies. The ML offence in the UAE is codified in FDL 10/2025 Art.3 (previously UAE ML Law 20/2014).

Respond ONLY with valid JSON — no markdown fences:
{
  "primaryPredicate": {"offence": "<offence name>", "uaeLegalRef": "<UAE statute and article>", "fatfCategory": "<FATF R.3 category>", "maxPenalty": "<penalty description>", "imprisonmentYears": "<years or Life>", "fineAed": "<amount as string>"},
  "secondaryPredicates": [{"offence": "<offence>", "uaeLegalRef": "<citation>", "fatfCategory": "<FATF R.3 category>", "maxPenalty": "<penalty>", "overlap": "<explanation of overlap with primary>"}],
  "mlOffenceApplicable": <true|false>,
  "mlLegalBasis": "<e.g. UAE FDL 10/2025 Art.3>",
  "proceedsEstimate": "<estimate or cannot be determined>",
  "selfLaunderingApplicable": <true|false>,
  "strRequired": <true|false>,
  "strBasis": "<basis for STR obligation>",
  "investigativeActions": ["<action>"],
  "jurisdictionalIssues": ["<issue>"],
  "regulatoryBasis": "<full citation string>",
  "fatfR3Categories": ["<category>"]
}`,
        messages: [
          {
            role: "user",
            content: `Case Facts:
${sanitizeText(body.facts, 5000)}

Suspected Activity: ${sanitizeField(body.suspectedActivity, 500) || "not specified"}
Jurisdiction: ${sanitizeField(body.jurisdiction, 100) || "UAE"}
Subject Type: ${sanitizeField(body.subjectType, 100) || "not specified"}
Additional Context: ${sanitizeText(body.context, 2000) || "none"}

Map these facts to applicable UAE ML predicate offences with penalties.`,
          },
        ],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as MlPredicateResult;
    if (!Array.isArray(result.secondaryPredicates)) result.secondaryPredicates = [];
    if (!Array.isArray(result.investigativeActions)) result.investigativeActions = [];
    if (!Array.isArray(result.jurisdictionalIssues)) result.jurisdictionalIssues = [];
    if (!Array.isArray(result.fatfR3Categories)) result.fatfR3Categories = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "ml-predicate temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
