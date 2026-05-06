export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface MlroDecision {
  caseId: string;
  subject: string;
  matchScore: number;
  listName: string;
  mlroDecision: "true_positive" | "false_positive";
  decisionReason: string;
  clientType: string;
  jurisdiction: string;
  riskScore: number;
}

export interface FpPattern {
  pattern: string;
  fpPct: number;
  recommendation: string;
}

export interface ThresholdSuggestion {
  list: string;
  clientType: string;
  currentThreshold: number;
  suggestedThreshold: number;
  expectedFpReduction: number;
}

export interface FpAnalysisResult {
  ok: true;
  fpRate: number;
  tpRate: number;
  patterns: FpPattern[];
  thresholdSuggestions: ThresholdSuggestion[];
  systemicIssues: string[];
  estimatedTimeSaving: string;
  summary: string;
}

const FALLBACK: FpAnalysisResult = {
  ok: true,
  fpRate: 73.4,
  tpRate: 26.6,
  patterns: [
    {
      pattern: "Arabic names with 'Al-' prefix on PEP lists",
      fpPct: 87,
      recommendation:
        "Implement phonetic normalisation and require at least 2 additional identifiers (DOB, nationality) before flagging 'Al-' prefix names as potential matches.",
    },
    {
      pattern: "Low-risk retail clients matched on OFAC SDN (score 65-75)",
      fpPct: 91,
      recommendation:
        "Raise OFAC SDN threshold to 78 for retail client type. These matches are overwhelmingly common-name false positives.",
    },
    {
      pattern: "UAE national clients on UN Consolidated List",
      fpPct: 82,
      recommendation:
        "Add UAE national ID cross-check before triggering alert. UN list entries are predominantly non-UAE nationals.",
    },
    {
      pattern: "Indian/Pakistani names on HM Treasury list (score <72)",
      fpPct: 79,
      recommendation:
        "Cross-reference date of birth and address fields. Raise threshold for South Asian names on HMT list to 75.",
    },
    {
      pattern: "Corporate entities with 'International' in name on EU list",
      fpPct: 68,
      recommendation:
        "Require legal entity identifier (LEI) or registration number match before alerting on generic corporate name matches.",
    },
  ],
  thresholdSuggestions: [
    {
      list: "OFAC SDN",
      clientType: "Retail Individual",
      currentThreshold: 65,
      suggestedThreshold: 78,
      expectedFpReduction: 41,
    },
    {
      list: "UN Consolidated",
      clientType: "UAE National",
      currentThreshold: 70,
      suggestedThreshold: 82,
      expectedFpReduction: 38,
    },
    {
      list: "HM Treasury",
      clientType: "South Asian Individual",
      currentThreshold: 70,
      suggestedThreshold: 75,
      expectedFpReduction: 29,
    },
    {
      list: "EU Consolidated",
      clientType: "Corporate",
      currentThreshold: 60,
      suggestedThreshold: 72,
      expectedFpReduction: 34,
    },
    {
      list: "OFAC SDN",
      clientType: "GCC National",
      currentThreshold: 65,
      suggestedThreshold: 80,
      expectedFpReduction: 45,
    },
  ],
  systemicIssues: [
    "87% of 'Ahmed Al-[surname]' pattern matches are false positives — this name pattern is extremely common in the UAE and GCC. Consider implementing a dedicated common-names whitelist supplemented by DOB/ID verification.",
    "Fuzzy matching algorithm does not normalise Arabic transliteration variants (Mohammed/Muhammad/Mohamed). This single issue accounts for an estimated 22% of all false positives.",
    "Corporate name matching is case-insensitive but does not strip legal suffixes (LLC, FZC, Ltd, Inc) before comparison. Strip suffixes prior to scoring.",
    "PEP list matches for low-risk jurisdictions (e.g. Iceland, Liechtenstein) are generating disproportionate FP volume relative to their risk contribution.",
  ],
  estimatedTimeSaving: "14.2 hours/month (estimated 284 fewer manual reviews at 3 min avg)",
  summary:
    "Analysis of 847 historical decisions reveals a 73.4% false positive rate, significantly above the industry benchmark of 50-60%. The primary drivers are: (1) common Arabic name patterns without secondary identifier validation, (2) inconsistent Arabic-Latin transliteration handling, and (3) overly low match thresholds for retail client types. Implementing the 5 suggested threshold adjustments is estimated to reduce FP volume by 38% while maintaining TP detection rates. The 'Ahmed Al-' systematic issue should be addressed as a priority — it alone accounts for 31% of all false positives.",
};

export async function POST(req: Request) {
  let body: { decisions?: MlroDecision[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const decisions = body.decisions ?? [];
  if (!decisions.length) {
    return NextResponse.json({ ok: false, error: "fp-optimizer/analyze temporarily unavailable - please retry." }, { status: 503 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "fp-optimizer/analyze temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 22_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are a machine learning expert specialising in AML sanctions screening optimisation for UAE financial institutions. Analyse historical MLRO (Money Laundering Reporting Officer) decisions to identify false positive patterns and suggest threshold optimisations.

Your task:
1. Calculate FP rate and TP rate from the decision history
2. Identify patterns in false positives (name patterns, client types, jurisdictions, list types)
3. Suggest threshold adjustments per list/client type combination
4. Flag systemic issues (e.g. common name patterns causing bulk FPs)
5. Estimate time savings from suggested optimisations

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "ok": true,
  "fpRate": number (percentage 0-100),
  "tpRate": number (percentage 0-100),
  "patterns": [
    {
      "pattern": "string (describe the FP pattern clearly)",
      "fpPct": number (percentage of this pattern that are FPs),
      "recommendation": "string (specific actionable recommendation)"
    }
  ],
  "thresholdSuggestions": [
    {
      "list": "string (sanctions list name)",
      "clientType": "string",
      "currentThreshold": number (0-100),
      "suggestedThreshold": number (0-100),
      "expectedFpReduction": number (percentage reduction)
    }
  ],
  "systemicIssues": ["string"],
  "estimatedTimeSaving": "string (e.g. '12.4 hours/month')",
  "summary": "string (executive summary, 3-4 sentences)"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Historical MLRO Decisions (${decisions.length} records):
${JSON.stringify(decisions, null, 2)}

Analyse these decisions to identify false positive patterns, suggest threshold optimisations, and flag systemic issues. Calculate the overall FP/TP rates and estimate time savings from improvements.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as FpAnalysisResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "fp-optimizer/analyze temporarily unavailable - please retry." }, { status: 503 });
  }
}
