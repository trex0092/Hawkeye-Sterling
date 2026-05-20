export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { enforce } from "@/lib/server/enforce";
export interface AssetTracerResult {
  tracingRisk: "critical" | "high" | "medium" | "low";
  tracingStages: Array<{
    stage: number;
    description: string;
    accountsInvolved: string[];
    jurisdictions: string[];
    amountAed: number;
    evidenceType: string;
    legalBasis: string;
  }>;
  assetRecoveryBasis: string;
  confiscationPotential: boolean;
  confiscationBasis?: string;
  internationalCooperationRequired: boolean;
  mutualLegalAssistanceRequired: boolean;
  evidenceGaps: string[];
  investigativeSteps: string[];
  regulatoryBasis: string;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    initialFunds: string;
    suspectedSource?: string;
    tracingPeriod?: string;
    subjectName?: string;
    jurisdictions?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.initialFunds?.trim()) return NextResponse.json({ ok: false, error: "initialFunds required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "asset-tracer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE asset tracing and recovery specialist with expertise in UAE Federal Law 4/2002 (Anti-Money Laundering), Federal Law 35/1992 (Penal Procedures), mutual legal assistance treaties (MLATs), confiscation law, and international asset recovery. Trace fund flows through ML stages (placement, layering, integration), identify traceable assets, assess confiscation potential, and outline investigative and MLAT requirements. Reference UAE domestic law, UNCAC asset recovery provisions, and Egmont Group cooperation. Respond ONLY with valid JSON matching the AssetTracerResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Initial Funds Description: ${sanitizeText(body.initialFunds, 2000)}
Suspected Criminal Source: ${sanitizeText(body.suspectedSource ?? "not specified", 2000)}
Tracing Period: ${sanitizeField(body.tracingPeriod ?? "not specified", 100)}
Subject Name: ${sanitizeField(body.subjectName ?? "not identified", 500)}
Jurisdictions Involved: ${sanitizeField(body.jurisdictions ?? "not specified", 500)}
Additional Context: ${sanitizeText(body.context ?? "none", 2000)}

Trace these funds through money laundering stages and assess asset recovery potential. Return complete AssetTracerResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as AssetTracerResult;
    if (!Array.isArray(result.tracingStages)) result.tracingStages = [];
    else for (const s of result.tracingStages) { if (!Array.isArray(s.accountsInvolved)) s.accountsInvolved = []; if (!Array.isArray(s.jurisdictions)) s.jurisdictions = []; }
    if (!Array.isArray(result.evidenceGaps)) result.evidenceGaps = [];
    if (!Array.isArray(result.investigativeSteps)) result.investigativeSteps = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "asset-tracer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
