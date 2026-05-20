// POST /api/ewra
// GET  /api/ewra?sector=<s>&jurisdiction=<j>
//
// Enterprise-Wide Risk Assessment (EWRA) / Business-Wide Risk Assessment (BWRA)
// root endpoint. Runs a full EWRA scoring pass using Claude and returns the
// risk matrix with dimension scores, typology heatmap, and regulatory obligations.
//
// Sub-routes:
//   POST /api/ewra/threat-intel  — real-time threat intelligence feed
//
// Regulatory basis: FATF Recommendation 1 (risk-based approach);
// UAE FDL 10/2025 Art.5 — obliged entity risk assessment requirement.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export interface EwraDimension {
  name: string;
  score: number;
  rating: "low" | "medium" | "high" | "critical";
  keyFactors: string[];
  mitigationControls: string[];
}

export interface EwraResult {
  ok: true;
  sector: string;
  jurisdiction: string;
  overallScore: number;
  overallRating: "low" | "medium" | "high" | "critical";
  dimensions: EwraDimension[];
  topRisks: string[];
  mitigationPriorities: string[];
  boardSummary: string;
  nextReviewDate: string;
  generatedAt: string;
}

function ratingFromScore(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const url = new URL(req.url);
  const sector = (url.searchParams.get("sector") ?? "financial_services").trim();
  const jurisdiction = (url.searchParams.get("jurisdiction") ?? "UAE").trim();
  // Delegate to POST with these params
  const body = { sector, jurisdiction, analysisDepth: "quick" as const };
  const synthetic = new Request(req.url, {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", ...Object.fromEntries(req.headers) }),
    body: JSON.stringify(body),
  });
  return POST(synthetic);
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { sector?: string; jurisdiction?: string; reportingPeriod?: string; analysisDepth?: "quick" | "full" };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const sector = sanitizeField((body.sector ?? "financial_services").trim(), 100);
  const jurisdiction = sanitizeField((body.jurisdiction ?? "UAE").trim(), 100);
  const reportingPeriod = sanitizeField(body.reportingPeriod ?? new Date().getFullYear().toString(), 50);
  const depth = body.analysisDepth ?? "full";

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "AI service unavailable — ANTHROPIC_API_KEY not configured" },
      { status: 503, headers: gate.headers },
    );
  }
  const anthropic = getAnthropicClient(apiKey, 55_000);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: depth === "quick" ? 1500 : 3000,
      messages: [
        {
          role: "user",
          content: `You are an AML/CFT risk expert. Generate a comprehensive Enterprise-Wide Risk Assessment (EWRA) for:
Sector: ${sector}
Jurisdiction: ${jurisdiction}
Reporting period: ${reportingPeriod}

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "overallScore": <0-100>,
  "dimensions": [
    {
      "name": "<dimension name>",
      "score": <0-100>,
      "keyFactors": ["<factor>"],
      "mitigationControls": ["<control>"]
    }
  ],
  "topRisks": ["<risk>"],
  "mitigationPriorities": ["<priority>"],
  "boardSummary": "<2-3 sentence executive summary>"
}

Dimensions must include: Customer Risk, Product/Service Risk, Channel Risk, Geographic Risk, Sanctions Risk, PEP Exposure.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as {
      overallScore?: number;
      dimensions?: Array<{ name: string; score: number; keyFactors?: string[]; mitigationControls?: string[] }>;
      topRisks?: string[];
      mitigationPriorities?: string[];
      boardSummary?: string;
    };

    const overallScore = Math.max(0, Math.min(100, parsed.overallScore ?? 50));
    const dimensions: EwraDimension[] = (parsed.dimensions ?? []).map((d) => ({
      name: d.name,
      score: Math.max(0, Math.min(100, d.score ?? 50)),
      rating: ratingFromScore(d.score ?? 50),
      keyFactors: d.keyFactors ?? [],
      mitigationControls: d.mitigationControls ?? [],
    }));

    const nextReview = new Date();
    nextReview.setFullYear(nextReview.getFullYear() + 1);

    const result: EwraResult = {
      ok: true,
      sector,
      jurisdiction,
      overallScore,
      overallRating: ratingFromScore(overallScore),
      dimensions,
      topRisks: parsed.topRisks ?? [],
      mitigationPriorities: parsed.mitigationPriorities ?? [],
      boardSummary: parsed.boardSummary ?? "",
      nextReviewDate: nextReview.toISOString().split("T")[0]!,
      generatedAt: new Date().toISOString(),
    };

    // FATF R.1 / FDL 10/2025 Art.5 — EWRA generation is a board-level
    // compliance event; must be on the tamper-evident chain.
    void writeAuditChainEntry(
      {
        event: "ewra.generated",
        actor: gate.keyId,
        sector,
        jurisdiction,
        overallScore: result.overallScore,
        overallRating: result.overallRating,
      },
      tenantIdFromGate(gate),
    ).catch((err) =>
      console.warn("[ewra] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[ewra] LLM call failed:", detail);
    return NextResponse.json(
      { ok: false, error: "EWRA generation temporarily unavailable. Please retry." },
      { status: 503, headers: gate.headers },
    );
  }
}
