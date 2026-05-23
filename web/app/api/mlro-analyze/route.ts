// POST /api/mlro-analyze
//
// C3: Multi-perspective MLRO deep analysis engine.
// Runs three analytical lenses on a screening subject:
//   1. executor   — primary MLRO risk analysis with UAE FDL No.10/2025 anchoring
//   2. advisor    — senior compliance review and recommendation
//   3. challenger — adversarial probe for false positives and alternative interpretations
//
// Wraps the existing mlro-advisor infrastructure with a combined
// single-call interface and structured JSON output.
//
// Body shape:
//   {
//     subjectName: string;
//     entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
//     jurisdiction?: string;
//     screeningHits?: Array<{ listId: string; candidateName: string; score: number; method: string }>;
//     adverseMedia?: string[];
//     pepStatus?: boolean;
//     uboDepth?: number;
//     transactionContext?: string;
//     question?: string;          // optional override — otherwise derived from context
//     mode?: "speed" | "balanced" | "multi_perspective";
//   }
//
// Response:
//   {
//     ok, subjectName, riskScore, severity, recommendation,
//     executor: { analysis, riskFactors, regulatoryAnchors },
//     advisor: { review, recommendation, redLines },
//     challenger: { alternativeTheory, falsePositiveProbability, weakPoints },
//     composite: { finalVerdict, confidence, dispositionSuggestion }
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ScreeningHit {
  listId: string;
  candidateName: string;
  score: number;
  method: string;
  programs?: string[];
}

interface Body {
  subjectName?: string;
  entityType?: string;
  jurisdiction?: string;
  screeningHits?: ScreeningHit[];
  adverseMedia?: string[];
  pepStatus?: boolean;
  uboDepth?: number;
  transactionContext?: string;
  question?: string;
  mode?: "speed" | "balanced" | "multi_perspective";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function buildExecutorPrompt(body: Body): string {
  const hits = body.screeningHits ?? [];
  const hitsText = hits.length
    ? hits.map((h) => `  - ${h.listId}: ${h.candidateName} (score ${Math.round(h.score * 100)}%, method: ${h.method})`).join("\n")
    : "  None";
  const mediaText = (body.adverseMedia ?? []).length
    ? (body.adverseMedia ?? []).map((m) => `  - ${m}`).join("\n")
    : "  None reported";

  return `You are the MLRO Executor for Hawkeye Sterling, a UAE-licensed DPMS.
Analyse the following subject for money laundering, terrorist financing, and sanctions risk
under UAE FDL No.10/2025, Cabinet Resolution 134/2025, Cabinet Resolution 74/2020,
MoE Circular 08/AML/2021, LBMA RGG v9, and FATF Recommendations.

SUBJECT: ${sanitizeField(body.subjectName ?? "")}
ENTITY TYPE: ${body.entityType ?? "unknown"}
JURISDICTION: ${body.jurisdiction ?? "unknown"}
PEP STATUS: ${body.pepStatus ? "YES — enhanced due diligence mandatory" : "Not confirmed"}
SANCTIONS HITS:
${hitsText}
ADVERSE MEDIA:
${mediaText}
UBO DEPTH ASSESSED: ${body.uboDepth ?? "not assessed"}
TRANSACTION CONTEXT: ${sanitizeField(body.transactionContext ?? "None provided")}

${body.question ? `SPECIFIC QUESTION: ${sanitizeField(body.question)}` : ""}

Provide:
1. Composite risk score (0-100) with severity (low/medium/high/critical)
2. Risk factors identified (bulleted, each citing the specific UAE regulatory provision)
3. Red lines — any absolute disqualifiers under UAE law
4. Recommended disposition: clear / EDD / escalate / STR / FFR
5. Rationale anchored to specific regulatory articles

Respond in JSON:
{
  "riskScore": <number 0-100>,
  "severity": "low|medium|high|critical",
  "riskFactors": [{"factor": "...", "regulatoryAnchor": "..."}],
  "redLines": ["..."],
  "disposition": "clear|edd|escalate|str|ffr",
  "rationale": "..."
}`;
}

function buildAdvisorPrompt(subject: string, executorOutput: string): string {
  return `You are the Senior MLRO Advisor reviewing an executor analysis for: ${sanitizeField(subject)}

EXECUTOR ANALYSIS:
${executorOutput}

Your role is to:
1. Validate the risk score and disposition recommendation
2. Identify any gaps in the analysis
3. Provide a final recommendation with confidence level
4. Flag any regulatory obligations triggered

Respond in JSON:
{
  "review": "...",
  "recommendation": "clear|edd|escalate|str|ffr",
  "confidence": <number 0-100>,
  "gaps": ["..."],
  "regulatoryObligations": ["..."]
}`;
}

function buildChallengerPrompt(subject: string, executorOutput: string): string {
  return `You are the Compliance Challenger for Hawkeye Sterling. Your job is to challenge
the following analysis of: ${sanitizeField(subject)}

ANALYSIS TO CHALLENGE:
${executorOutput}

Find the weakest points. Consider:
1. Is this a probable false positive? Why?
2. What alternative benign explanations exist?
3. What secondary evidence would change the conclusion?
4. Are the regulatory anchors correctly applied?

Respond in JSON:
{
  "alternativeTheory": "...",
  "falsePositiveProbability": <number 0-100>,
  "weakPoints": ["..."],
  "requiredEvidence": ["..."],
  "challengerVerdict": "confirm|downgrade|dismiss"
}`;
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as Record<string, unknown>;
  } catch { /* fall through */ }
  return { raw };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  if (!body?.subjectName?.trim()) {
    return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400, headers: gate.headers });
  }

  const mode = body.mode ?? "balanced";
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 503, headers: gate.headers });
  }
  const client = getAnthropicClient(apiKey, 90_000, "mlro-analyze");

  // Step 1: Executor analysis
  const executorPrompt = buildExecutorPrompt(body);
  let executorRaw = "";
  try {
    const executorMsg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: executorPrompt }],
    });
    executorRaw = executorMsg.content.map((b: { type: string; text?: string }) => (b.type === "text" ? (b.text ?? "") : "")).join("");
  } catch (err) {
    console.error("[mlro-analyze] executor failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "executor analysis failed" }, { status: 502, headers: gate.headers });
  }
  const executorResult = safeParse(executorRaw);

  // Step 2: Advisor review (skip in speed mode)
  let advisorResult: Record<string, unknown> = {};
  if (mode !== "speed") {
    try {
      const advisorMsg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [{ role: "user", content: buildAdvisorPrompt(body.subjectName, executorRaw) }],
      });
      advisorResult = safeParse(advisorMsg.content.map((b: { type: string; text?: string }) => (b.type === "text" ? (b.text ?? "") : "")).join(""));
    } catch (err) {
      console.warn("[mlro-analyze] advisor failed (non-fatal):", err instanceof Error ? err.message : String(err));
      advisorResult = { review: "advisor unavailable", recommendation: executorResult["disposition"] };
    }
  }

  // Step 3: Challenger (multi_perspective mode only)
  let challengerResult: Record<string, unknown> = {};
  if (mode === "multi_perspective") {
    try {
      const challengerMsg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [{ role: "user", content: buildChallengerPrompt(body.subjectName, executorRaw) }],
      });
      challengerResult = safeParse(challengerMsg.content.map((b: { type: string; text?: string }) => (b.type === "text" ? (b.text ?? "") : "")).join(""));
    } catch (err) {
      console.warn("[mlro-analyze] challenger failed (non-fatal):", err instanceof Error ? err.message : String(err));
      challengerResult = { alternativeTheory: "challenger unavailable", falsePositiveProbability: 50 };
    }
  }

  // Composite verdict
  const riskScore = typeof executorResult["riskScore"] === "number" ? executorResult["riskScore"] : 50;
  const severity = typeof executorResult["severity"] === "string" ? executorResult["severity"] : "medium";
  const finalDisposition = (isRecord(advisorResult) && typeof advisorResult["recommendation"] === "string")
    ? advisorResult["recommendation"]
    : typeof executorResult["disposition"] === "string" ? executorResult["disposition"] : "escalate";
  const advisorConfidence = typeof advisorResult["confidence"] === "number" ? advisorResult["confidence"] : null;
  const challengerFpp = typeof challengerResult["falsePositiveProbability"] === "number" ? challengerResult["falsePositiveProbability"] : null;

  // Audit chain entry
  void writeAuditChainEntry({
    event: "mlro_analyze.completed",
    actor: gate.keyId,
    subjectName: body.subjectName,
    disposition: finalDisposition,
    riskScore,
    severity,
    mode,
  }, tenant).catch(() => undefined);

  return NextResponse.json(
    {
      ok: true,
      subjectName: body.subjectName,
      riskScore,
      severity,
      recommendation: finalDisposition,
      mode,
      executor: {
        analysis: typeof executorResult["rationale"] === "string" ? executorResult["rationale"] : executorRaw,
        riskFactors: Array.isArray(executorResult["riskFactors"]) ? executorResult["riskFactors"] : [],
        redLines: Array.isArray(executorResult["redLines"]) ? executorResult["redLines"] : [],
        disposition: executorResult["disposition"] ?? "escalate",
        regulatoryAnchors: ["UAE FDL No.10/2025", "Cabinet Resolution 134/2025", "Cabinet Resolution 74/2020", "FATF Recommendations"],
      },
      advisor: mode !== "speed" ? {
        review: advisorResult["review"] ?? "",
        recommendation: advisorResult["recommendation"] ?? finalDisposition,
        confidence: advisorConfidence,
        gaps: Array.isArray(advisorResult["gaps"]) ? advisorResult["gaps"] : [],
        regulatoryObligations: Array.isArray(advisorResult["regulatoryObligations"]) ? advisorResult["regulatoryObligations"] : [],
      } : null,
      challenger: mode === "multi_perspective" ? {
        alternativeTheory: challengerResult["alternativeTheory"] ?? "",
        falsePositiveProbability: challengerFpp,
        weakPoints: Array.isArray(challengerResult["weakPoints"]) ? challengerResult["weakPoints"] : [],
        requiredEvidence: Array.isArray(challengerResult["requiredEvidence"]) ? challengerResult["requiredEvidence"] : [],
        challengerVerdict: challengerResult["challengerVerdict"] ?? "confirm",
      } : null,
      composite: {
        finalVerdict: finalDisposition,
        riskScore,
        severity,
        confidence: advisorConfidence,
        falsePositiveProbability: challengerFpp,
        dispositionSuggestion: finalDisposition,
        fourEyesRequired: riskScore >= 70 || severity === "high" || severity === "critical",
        strThreshold: riskScore >= 80,
        generatedAt: new Date().toISOString(),
      },
    },
    { headers: gate.headers },
  );
}
