export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface PatternCase {
  id: string;
  subject: string;
  amount: string;
  jurisdiction: string;
  typology: string;
  status: string;
  date: string;
}

export interface DetectedPattern {
  type:
    | "shared_beneficial_owner"
    | "repeated_jurisdiction"
    | "structuring_cluster"
    | "linked_subjects"
    | "typology_cluster"
    | "temporal_cluster";
  severity: "critical" | "high" | "medium" | "low";
  caseIds: string[];
  description: string;
  regulatoryRef: string;
}

export interface PatternDetectResult {
  patterns: DetectedPattern[];
  summary: string;
}

const FALLBACK: PatternDetectResult = {
  patterns: [
    {
      type: "structuring_cluster",
      severity: "high",
      caseIds: [],
      description:
        "Insufficient cases to run a statistical clustering analysis. File additional STR/SAR cases to enable pattern detection across the register.",
      regulatoryRef: "UAE FDL 10/2025 Art.16 · FATF R.20 (structuring indicators)",
    },
  ],
  summary:
    "Pattern detection requires at least two cases with overlapping attributes. Add more cases and re-run the analysis.",
};

export async function POST(req: Request) {
  let body: { cases?: PatternCase[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const cases = body.cases ?? [];

  if (cases.length < 2) {
    return NextResponse.json(FALLBACK);
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(FALLBACK);

  try {
    const client = getAnthropicClient(apiKey);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: [
        {
          type: "text",
          text: `You are an expert UAE AML analyst specialising in cross-case pattern detection for STR/SAR registers. Your role is to identify patterns that may indicate coordinated money laundering, structuring, or network-level suspicious activity that would not be apparent from individual case review.

Detect the following pattern types:
- shared_beneficial_owner: Multiple cases sharing the same or similar subject names, entities, or UBOs — may indicate a network using one controller.
- repeated_jurisdiction: Unusual concentration of cases from the same jurisdiction — may indicate a known high-risk geography being exploited.
- structuring_cluster: Transaction amounts clustered just below reporting thresholds (e.g., AED 40,000–54,999 repeatedly) — classic structuring indicator.
- linked_subjects: Subject names, entities or partial names that recur across cases — potential alias or related-party network.
- typology_cluster: Multiple cases sharing the same typology — may indicate a coordinated scheme or an industry-level threat pattern.
- temporal_cluster: Multiple cases opened within a very short window — may indicate a coordinated event or trigger.

Severity guide:
- critical: Direct FATF R.20 reporting obligation implications; evidence of coordinated network
- high: Strong structural pattern; requires MLRO immediate attention
- medium: Statistical anomaly worth investigating
- low: Weak signal; note for monitoring

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "patterns": [
    {
      "type": "shared_beneficial_owner"|"repeated_jurisdiction"|"structuring_cluster"|"linked_subjects"|"typology_cluster"|"temporal_cluster",
      "severity": "critical"|"high"|"medium"|"low",
      "caseIds": ["array of case IDs involved"],
      "description": "Specific, factual description citing the case data",
      "regulatoryRef": "Applicable regulatory reference"
    }
  ],
  "summary": "One paragraph executive summary for the MLRO"
}

If no meaningful patterns are found, return an empty patterns array with a summary explaining why.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse the following STR/SAR case register for cross-case patterns. There are ${cases.length} cases in the register.

Cases:
${JSON.stringify(cases, null, 2)}

Identify all statistically significant or operationally relevant patterns across these cases. Be specific — cite case IDs, amounts, subjects and jurisdictions in your descriptions.`,
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim(),
    ) as PatternDetectResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
