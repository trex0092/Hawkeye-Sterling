export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export interface NlSearchFilter {
  /** ISO2 country codes or country name fragments to match against subject.country */
  countries?: string[];
  /** Minimum risk score 0-100 */
  riskScoreMin?: number;
  /** Maximum risk score 0-100 */
  riskScoreMax?: number;
  /** CDD posture values: "CDD" | "EDD" | "SDD" | "RFI" | "PENDING" */
  cddPostures?: string[];
  /** Entity types: "individual" | "organisation" | "vessel" | "aircraft" */
  entityTypes?: string[];
  /** Subject status: "active" | "frozen" | "cleared" */
  statuses?: string[];
  /** True = must have at least one sanctions list hit */
  sanctionsHit?: boolean;
  /** True = must have PEP flag */
  pepFlag?: boolean;
  /** True = must have SLA breach (< 0 hours remaining) */
  slaBreach?: boolean;
  /** Free-text fragments to match against name (case-insensitive) */
  nameContains?: string[];
  /** Free-text fragments to match against meta/notes (case-insensitive) */
  metaContains?: string[];
  /** Minimum number of sanctions lists matched */
  minListCount?: number;
}

export interface NlSearchResult {
  ok: boolean;
  query: string;
  interpreted: string;
  filters: NlSearchFilter;
  confidence: "high" | "medium" | "low";
  clarification?: string;
}

const FALLBACK: NlSearchResult = {
  ok: true,
  query: "high risk",
  interpreted: "Subjects with risk score ≥ 75 (critical threshold)",
  filters: { riskScoreMin: 75 },
  confidence: "high",
};

export async function POST(req: Request) {
  let body: { query: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.query?.trim()) return NextResponse.json({ ok: false, error: "query required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ...FALLBACK, query: body.query });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: `You are an AML screening queue search assistant. Convert a natural language query into structured filter criteria for a screening queue.

Available filter fields:
- countries: ISO2 codes or name fragments (e.g. ["TR", "RU"] for Turkish/Russian subjects)
- riskScoreMin / riskScoreMax: 0-100 (critical ≥ 75, high ≥ 50, medium ≥ 25)
- cddPostures: ["CDD", "EDD", "SDD", "RFI", "PENDING"]
- entityTypes: ["individual", "organisation", "vessel", "aircraft"]
- statuses: ["active", "frozen", "cleared"]
- sanctionsHit: true = must have sanctions list matches
- pepFlag: true = must be politically exposed person
- slaBreach: true = SLA overdue
- nameContains: name text fragments
- metaContains: meta/notes text fragments
- minListCount: minimum number of sanctions lists matched

Examples:
"high risk Turkish companies" → countries:["TR"], riskScoreMin:50, entityTypes:["organisation"]
"frozen PEPs" → statuses:["frozen"], pepFlag:true
"EDD subjects in Russia" → countries:["RU"], cddPostures:["EDD"]
"sanctions hits over 80" → sanctionsHit:true, riskScoreMin:80
"gold refineries" → metaContains:["gold"], entityTypes:["organisation"]
"SLA breach" → slaBreach:true
"critical individuals" → riskScoreMin:75, entityTypes:["individual"]

Respond ONLY with valid JSON — no markdown:
{
  "interpreted": "<one sentence describing what you understood>",
  "filters": { <only include fields that apply> },
  "confidence": "high"|"medium"|"low",
  "clarification": "<only if confidence is low, ask what they meant>"
}`,
        messages: [{ role: "user", content: body.query }],
      }),
    });

    if (!response.ok) return NextResponse.json({ ...FALLBACK, query: body.query });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as Omit<NlSearchResult, "ok" | "query">;
    return NextResponse.json({ ok: true, query: body.query, ...parsed });
  } catch {
    return NextResponse.json({ ...FALLBACK, query: body.query });
  }
}
