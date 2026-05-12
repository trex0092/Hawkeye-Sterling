export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { getJson } from "@/lib/server/store";
import { randomBytes } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────────

export type AIDecision = "approve" | "edd" | "escalate" | "str";

export interface DecisionRequest {
  subjectId: string;
  name: string;
  country: string;
  entityType: string;
  riskScore: number;
  listCoverage: string[];
  sanctionsHits: Array<{ list: string; score: number; details?: string }>;
  adverseMedia?: string;
  pepTier?: string;
  exposureAED?: string;
  cddPosture?: string;
  screeningTopScore?: number;
  screeningSeverity?: string;
  notes?: string;
  test?: boolean;
}

export interface DecisionResponse {
  ok: true;
  decisionId: string;
  decision: AIDecision;
  confidence: number;
  urgency: "low" | "medium" | "high" | "critical";
  rationale: string;
  keyFactors: string[];
  nextSteps: string[];
  regulatoryBasis: string;
  asanaTaskUrl?: string;
  asanaTaskGid?: string;
  asanaSkipped?: true;
}

// ── Feedback store key ────────────────────────────────────────────────────────

const FEEDBACK_STORE_KEY = "ai-decision:feedback:v1";

interface FeedbackRecord {
  id: string;
  timestamp: string;
  subjectProfile: {
    entityType: string;
    country: string;
    riskScore: number;
    sanctionsHits: number;
    hasPEP: boolean;
    exposure: string;
    severity: string;
  };
  aiDecision: AIDecision;
  confidence: number;
  outcome: "accepted" | "overridden";
  override?: AIDecision;
  notes?: string;
}

async function getRecentFeedback(): Promise<FeedbackRecord[]> {
  try {
    return (await getJson<FeedbackRecord[]>(FEEDBACK_STORE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function buildLearningContext(feedback: FeedbackRecord[]): string {
  if (feedback.length === 0) return "";
  const recent = feedback.slice(-10);
  const lines = recent.map((f) => {
    const profile = `${f.subjectProfile.entityType} · ${f.subjectProfile.country} · risk ${f.subjectProfile.riskScore} · ${f.subjectProfile.sanctionsHits} sanctions hits · severity ${f.subjectProfile.severity}`;
    const outcome =
      f.outcome === "accepted"
        ? `✓ ACCEPTED (user agreed)`
        : `✗ OVERRIDDEN → user changed to "${f.override}"${f.notes ? ` · note: "${f.notes}"` : ""}`;
    return `- Profile: [${profile}] → AI: "${f.aiDecision}" (conf ${f.confidence}%) → ${outcome}`;
  });
  return `\n\nLEARNING CONTEXT — recent decisions and user feedback:\n${lines.join("\n")}\nUse this to calibrate your judgment. If similar profiles were overridden, adjust accordingly.`;
}

// ── Decision prompt ───────────────────────────────────────────────────────────

const STATIC_SYSTEM_PROMPT = `You are the Hawkeye Sterling AI Decision Engine — an AML compliance automation agent for a UAE-regulated gold trading firm operating under Federal Decree-Law No. 10 of 2025 on AML/CFT/CPF (FDL No.10/2025, in force 14 Oct 2025), Cabinet Resolution No. 134 of 2025 (CR No.134/2025), and CBUAE AML Standards. FDL No. 20/2018 and Cabinet Decision No. 10/2019 have been superseded and must NOT be cited.

Your role is to AUTOMATICALLY decide the disposition for each screened subject. You must output a single JSON object with no markdown fences.

DECISION OPTIONS:
- "approve": Low risk, no material hits. Clear the subject. CDD is sufficient.
- "edd": Medium-high risk or soft flags. Escalate to Enhanced Due Diligence. Keep monitoring.
- "escalate": High risk, multiple red flags, PEP exposure, or complex ownership. Refer to MLRO for review.
- "str": Critical risk, confirmed sanctions hit, credible money-laundering indicators. File Suspicious Transaction Report via goAML.

DECISION RULES (mandatory):
1. Any confirmed OFAC/UNSC/EU sanctions hit → "str" regardless of score
2. PEP Tier 1 or 2 + exposure > AED 100,000 → "escalate" minimum
3. Risk score ≥ 80 + adverse media → "escalate" or "str"
4. Risk score ≥ 65 or soft flags → "edd"
5. No hits + risk score < 50 + no PEP + no adverse media → "approve"
6. When uncertain, escalate — never approve a borderline case

Return ONLY valid JSON (no markdown, no prose):
{
  "decision": "approve|edd|escalate|str",
  "confidence": 0-100,
  "urgency": "low|medium|high|critical",
  "rationale": "2-3 sentence explanation of why this decision was made",
  "keyFactors": ["factor 1", "factor 2", "factor 3"],
  "nextSteps": ["action 1", "action 2"],
  "regulatoryBasis": "cite relevant FDL articles"
}`;

function buildSystemBlocks(learningCtx: string): Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> {
  const blocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    { type: "text", text: STATIC_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ];
  if (learningCtx) {
    blocks.push({ type: "text", text: learningCtx });
  }
  return blocks;
}

function buildUserMessage(req: DecisionRequest): string {
  const hits = req.sanctionsHits.length > 0
    ? req.sanctionsHits.map((h) => `${h.list} (score: ${h.score}${h.details ? `, ${h.details}` : ""})`).join("; ")
    : "None";
  return `SUBJECT FOR DECISION:
Name: ${req.name}
Entity type: ${req.entityType}
Country: ${req.country}
Risk score: ${req.riskScore}/100
Sanctions hits: ${hits}
Lists checked: ${req.listCoverage.join(", ") || "N/A"}
Adverse media: ${req.adverseMedia || "None identified"}
PEP status: ${req.pepTier || "Not a PEP"}
Exposure (AED): ${req.exposureAED || "Unknown"}
CDD posture: ${req.cddPosture || "CDD"}
Screening top score: ${req.screeningTopScore ?? req.riskScore}/100
Screening severity: ${req.screeningSeverity || "unknown"}
Notes: ${req.notes || "None"}

Make your decision now.`;
}

// ── Auto-Asana task creation ──────────────────────────────────────────────────

const DECISION_PROJECT_MAP: Record<AIDecision, string> = {
  str: "ASANA_SAR_PROJECT_GID",
  escalate: "ASANA_MLRO_PROJECT_GID",
  edd: "ASANA_KYC_PROJECT_GID",
  approve: "ASANA_SCREENING_PROJECT_GID",
};

const MASTER_INBOX = "1214148630166524";
const DEFAULT_WORKSPACE = "1213645083721316";
const DEFAULT_ASSIGNEE = "1213645083721304";

async function createAsanaTask(
  req: DecisionRequest,
  decision: AIDecision,
  rationale: string,
  nextSteps: string[],
  decisionId: string,
): Promise<{ taskGid?: string; taskUrl?: string }> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) return {};

  const decisionLabel: Record<AIDecision, string> = {
    approve: "CLEARED",
    edd: "EDD REQUIRED",
    escalate: "ESCALATED TO MLRO",
    str: "STR — FILE IMMEDIATELY",
  };

  const projectGidEnv = DECISION_PROJECT_MAP[decision];
  const projectGid = process.env[projectGidEnv] ?? MASTER_INBOX;
  const taskName = `[AI DECISION — ${decisionLabel[decision]}] ${req.name} · ${new Date().toISOString().slice(0, 10)}`;
  const notes = [
    `HAWKEYE STERLING · AI DECISION ENGINE`,
    `Decision ID : ${decisionId}`,
    `Generated   : ${new Date().toUTCString().replace(" GMT", " UTC")}`,
    ``,
    `SUBJECT`,
    `Name        : ${req.name}`,
    `Country     : ${req.country}`,
    `Entity type : ${req.entityType}`,
    `Risk score  : ${req.riskScore}/100`,
    `Sanctions   : ${req.sanctionsHits.length} hits`,
    `Exposure    : AED ${req.exposureAED ?? "unknown"}`,
    ``,
    `AI DECISION : ${decisionLabel[decision]}`,
    ``,
    `RATIONALE`,
    rationale,
    ``,
    `NEXT STEPS`,
    ...nextSteps.map((s) => `• ${s}`),
    ``,
    `Legal basis : FDL 10/2025 Art.20, Art.26-27 · CBUAE AML Standards`,
    `Auto-created by Hawkeye Sterling AI Decision Engine — human review required`,
  ].join("\n");

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    let res: Response;
    try {
      res = await fetch("https://app.asana.com/api/1.0/tasks", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          data: {
            name: taskName,
            notes,
            projects: [projectGid],
            workspace: process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE,
            assignee: process.env["ASANA_ASSIGNEE_GID"] ?? DEFAULT_ASSIGNEE,
          },
        }),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const payload = (await res.json().catch((err: unknown) => {
      console.warn("[hawkeye] ai-decision Asana response parse failed:", err);
      return null;
    })) as
      | { data?: { gid?: string; permalink_url?: string } }
      | null;
    return {
      taskGid: payload?.data?.gid,
      taskUrl: payload?.data?.permalink_url,
    };
  } catch (err) {
    console.warn("[hawkeye] ai-decision Asana task creation failed (non-fatal — decision still recorded):", err);
    return {};
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: DecisionRequest;
  try {
    body = (await req.json()) as DecisionRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  if (!body.name || !body.subjectId) {
    return NextResponse.json({ ok: false, error: "name and subjectId are required" }, { status: 400 , headers: gate.headers});
  }

  // Fetch learning context from Netlify Blobs
  const feedback = await getRecentFeedback();
  const learningCtx = buildLearningContext(feedback);

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  const decisionId = `dec-${randomBytes(6).toString("hex")}`;

  let decision: AIDecision;
  let confidence: number;
  let urgency: "low" | "medium" | "high" | "critical";
  let rationale: string;
  let keyFactors: string[];
  let nextSteps: string[];
  let regulatoryBasis: string;

  if (apiKey) {
    try {
      const client = getAnthropicClient(apiKey);
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: buildSystemBlocks(learningCtx),
        messages: [{ role: "user", content: buildUserMessage(body) }],
      });
      const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "{}";
      const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as Partial<{
        decision: AIDecision;
        confidence: number;
        urgency: string;
        rationale: string;
        keyFactors: string[];
        nextSteps: string[];
        regulatoryBasis: string;
      }>;
      decision = parsed.decision ?? deriveRuleBasedDecision(body);
      confidence = parsed.confidence ?? 70;
      urgency = (parsed.urgency as "low" | "medium" | "high" | "critical") ?? "medium";
      rationale = parsed.rationale ?? "Decision based on risk profile analysis.";
      keyFactors = parsed.keyFactors ?? [];
      nextSteps = parsed.nextSteps ?? [];
      regulatoryBasis = parsed.regulatoryBasis ?? "FDL 10/2025";
    } catch {
      // Fallback to rule-based
      decision = deriveRuleBasedDecision(body);
      confidence = 65;
      urgency = decision === "str" ? "critical" : decision === "escalate" ? "high" : decision === "edd" ? "medium" : "low";
      rationale = `Rule-based decision: risk score ${body.riskScore}, ${body.sanctionsHits.length} sanctions hits.`;
      keyFactors = [`Risk score: ${body.riskScore}/100`, `Sanctions hits: ${body.sanctionsHits.length}`];
      nextSteps = defaultNextSteps(decision);
      regulatoryBasis = "FDL 10/2025 Art.20";
    }
  } else {
    decision = deriveRuleBasedDecision(body);
    confidence = 65;
    urgency = decision === "str" ? "critical" : decision === "escalate" ? "high" : decision === "edd" ? "medium" : "low";
    rationale = `Rule-based decision: risk score ${body.riskScore}, ${body.sanctionsHits.length} sanctions hits. No AI API configured.`;
    keyFactors = [`Risk score: ${body.riskScore}/100`, `Sanctions hits: ${body.sanctionsHits.length}`];
    nextSteps = defaultNextSteps(decision);
    regulatoryBasis = "FDL 10/2025 Art.20";
  }

  // Auto-create Asana task (fire in parallel with response)
  // Skip task creation in test/sandbox mode
  let asana: { taskUrl?: string; taskGid?: string } = {};
  if (body.test !== true) {
    asana = await createAsanaTask(body, decision, rationale, nextSteps, decisionId);
  }

  const responseBody: DecisionResponse = {
    ok: true,
    decisionId,
    decision,
    confidence,
    urgency,
    rationale,
    keyFactors,
    nextSteps,
    regulatoryBasis,
    ...(body.test === true
      ? { asanaSkipped: true as const }
      : {
          ...(asana.taskUrl ? { asanaTaskUrl: asana.taskUrl } : {}),
          ...(asana.taskGid ? { asanaTaskGid: asana.taskGid } : {}),
        }),
  };

  return NextResponse.json(responseBody, { status: 200 , headers: gate.headers});
}

// ── Rule-based fallback ───────────────────────────────────────────────────────

function deriveRuleBasedDecision(req: DecisionRequest): AIDecision {
  const hasConfirmedHit = req.sanctionsHits.some((h) => h.score >= 0.85);
  if (hasConfirmedHit) return "str";
  const isPEP12 = req.pepTier === "1" || req.pepTier === "2" || req.pepTier === "Tier 1" || req.pepTier === "Tier 2";
  const highExposure = parseInt(req.exposureAED?.replace(/[^\d]/g, "") || "0") > 100000;
  if (isPEP12 && highExposure) return "escalate";
  if (req.riskScore >= 80 && req.adverseMedia) return "escalate";
  if (req.riskScore >= 65 || req.sanctionsHits.length > 0) return "edd";
  return "approve";
}

function defaultNextSteps(decision: AIDecision): string[] {
  switch (decision) {
    case "str": return ["File STR via goAML within 2 business days", "Freeze transactions pending CBUAE review", "Notify MLRO immediately"];
    case "escalate": return ["Refer to MLRO for manual review", "Obtain enhanced due diligence documentation", "Document escalation rationale in audit trail"];
    case "edd": return ["Request enhanced KYC documentation", "Conduct source-of-wealth verification", "Increase monitoring frequency"];
    case "approve": return ["Complete standard CDD file", "Schedule next periodic review", "Monitor for changes in risk profile"];
  }
}
