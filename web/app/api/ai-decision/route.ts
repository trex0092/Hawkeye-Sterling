export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { getJson } from "@/lib/server/store";
import { randomBytes } from "node:crypto";
import { asanaGids } from "@/lib/server/asanaConfig";

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

// ── Sanctions list integrity check ───────────────────────────────────────────
// Before any decision is generated, verify that the three critical sanctions
// lists (OFAC SDN, UN Consolidated, EU FSF) are actually present in blob
// storage. If any are missing the tool must return BLOCKED_DATA_INTEGRITY so
// that no AI-generated compliance approval is backed by phantom data.

const CRITICAL_LISTS = ["ofac_sdn", "un_consolidated", "eu_fsf"] as const;
type CriticalList = typeof CRITICAL_LISTS[number];

interface ListInfo {
  listId: CriticalList;
  entityCount: number | null;
  lastRefreshed: string | null;
}

interface ListsIntegrityResult {
  listsVerified: boolean;
  missingLists: string[];
  listsQueried: ListInfo[];
}

// Module-level cache so repeated requests within a Lambda warm window skip
// the Netlify Blobs round-trips (saves 1-2 s per call after the first).
let _integrityCache: { result: ListsIntegrityResult; checkedAt: number } | null = null;
const INTEGRITY_TTL_MS = 60 * 60 * 1_000; // 1 hour

async function checkListsIntegrity(): Promise<ListsIntegrityResult> {
  // Return cached result when it's still fresh (1-hour TTL).
  if (_integrityCache && Date.now() - _integrityCache.checkedAt < INTEGRITY_TTL_MS) {
    return _integrityCache.result;
  }

  const result: ListsIntegrityResult = {
    listsVerified: false,
    missingLists: [],
    listsQueried: [],
  };

  let blobsMod: typeof import("@netlify/blobs") | null = null;
  try {
    blobsMod = await import("@netlify/blobs");
  } catch {
    // Not in a Netlify context — treat all lists as missing to be safe
    result.missingLists = [...CRITICAL_LISTS];
    result.listsQueried = CRITICAL_LISTS.map((id) => ({ listId: id, entityCount: null, lastRefreshed: null }));
    return result;
  }

  const { getStore } = blobsMod;
  const onNetlify = Boolean(process.env["NETLIFY"]) || Boolean(process.env["NETLIFY_LOCAL"]);
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"] ??
    process.env["NETLIFY_BLOBS_TOKEN"];

  let store: ReturnType<typeof getStore>;
  try {
    const opts = !onNetlify && siteID && token
      ? { name: "hawkeye-lists", siteID, token, consistency: "strong" as const }
      : { name: "hawkeye-lists" };
    store = getStore(opts);
  } catch {
    result.missingLists = [...CRITICAL_LISTS];
    result.listsQueried = CRITICAL_LISTS.map((id) => ({ listId: id, entityCount: null, lastRefreshed: null }));
    return result;
  }

  const missing: string[] = [];
  const queried: ListInfo[] = [];

  for (const listId of CRITICAL_LISTS) {
    try {
      const raw = await store.get(`${listId}/latest.json`, { type: "json" }) as {
        entities?: unknown[];
        report?: { fetchedAt?: number; recordCount?: number };
        fetchedAt?: number;
      } | null;

      if (!raw || !Array.isArray(raw.entities) || raw.entities.length === 0) {
        missing.push(listId);
        queried.push({ listId, entityCount: null, lastRefreshed: null });
      } else {
        const fetchedAt = raw.report?.fetchedAt ?? (raw as { fetchedAt?: number }).fetchedAt ?? null;
        queried.push({
          listId,
          entityCount: raw.entities.length,
          lastRefreshed: fetchedAt ? new Date(fetchedAt).toISOString() : null,
        });
      }
    } catch {
      missing.push(listId);
      queried.push({ listId, entityCount: null, lastRefreshed: null });
    }
  }

  result.missingLists = missing;
  result.listsQueried = queried;
  result.listsVerified = missing.length === 0;
  // Populate the module-level cache so the next request within 1 hour skips
  // the Blobs round-trips entirely.
  _integrityCache = { result, checkedAt: Date.now() };
  return result;
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

function decisionProjectGid(decision: AIDecision): string {
  switch (decision) {
    case "str":      return asanaGids.sar();
    case "escalate": return asanaGids.mlro();
    case "edd":      return asanaGids.kyc();
    case "approve":  return asanaGids.screening();
  }
}

async function createAsanaTask(
  req: DecisionRequest,
  decision: AIDecision,
  rationale: string,
  nextSteps: string[],
  decisionId: string,
  integrity?: ListsIntegrityResult,
): Promise<{ taskGid?: string; taskUrl?: string }> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) return {};

  const decisionLabel: Record<AIDecision, string> = {
    approve: "CLEARED",
    edd: "EDD REQUIRED",
    escalate: "ESCALATED TO MLRO",
    str: "STR — FILE IMMEDIATELY",
  };

  const projectGid = decisionProjectGid(decision);
  const listsVerified = integrity?.listsVerified ?? true;
  const missingLists = integrity?.missingLists ?? [];
  const taskName = `[AI DECISION — ${decisionLabel[decision]}] ${req.name} · ${new Date().toISOString().slice(0, 10)}`;
  const integrityWarning = !listsVerified
    ? [
        `⚠️  WARNING: One or more sanctions lists were unavailable when this decision was generated.`,
        `    Missing: ${missingLists.join(", ")}`,
        `    This decision must not be acted upon until data integrity is restored.`,
        ``,
      ]
    : [];
  const listsQueriedLines = (integrity?.listsQueried ?? []).map(
    (l) => `    ${l.listId}: entityCount=${l.entityCount ?? "null"} lastRefreshed=${l.lastRefreshed ?? "null"}`,
  );
  const notes = [
    ...(integrityWarning.length ? integrityWarning : []),
    `HAWKEYE STERLING · AI DECISION ENGINE`,
    `Decision ID    : ${decisionId}`,
    `Generated      : ${new Date().toUTCString().replace(" GMT", " UTC")}`,
    `listsVerified  : ${listsVerified}`,
    ...(missingLists.length ? [`missingLists   : ${missingLists.join(", ")}`] : []),
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
    `Confidence  : ${typeof (arguments[5] as unknown) === "undefined" ? "n/a" : "see response"}`,
    ``,
    `SANCTIONS LISTS QUERIED`,
    ...(listsQueriedLines.length ? listsQueriedLines : ["    (none)"]),
    ``,
    `RATIONALE`,
    rationale,
    ``,
    `NEXT STEPS`,
    ...nextSteps.map((s) => `• ${s}`),
    ``,
    `Legal basis : FDL 10/2025 Art.18, Art.20, Art.26-27 · CBUAE AML Standards`,
    `Auto-created by Hawkeye Sterling AI Decision Engine — MLRO four-eyes review required per FDL No.10/2025 Art.18`,
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
            workspace: asanaGids.workspace(),
            assignee: asanaGids.assignee(),
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

// ADD-03: Immediately after creating the parent decision task, create a
// blocking subtask enforcing four-eyes MLRO review per FDL No. 10/2025 Art. 18.
async function createMlroReviewSubtask(
  parentTaskGid: string,
  decisionId: string,
  subjectName: string,
  listsVerified: boolean,
): Promise<void> {
  const token = process.env["ASANA_TOKEN"];
  if (!token || !parentTaskGid) return;
  const subtaskNotes = [
    `MLRO FOUR-EYES REVIEW — MANDATORY`,
    ``,
    `This subtask is a blocking gate under FDL No. 10/2025 Art. 18.`,
    `NO compliance action (CDD completion, onboarding, offboarding, STR filing,`,
    `transaction blocking) may be taken until this subtask is marked complete`,
    `by the designated MLRO or authorised deputy.`,
    ``,
    `Decision ID : ${decisionId}`,
    `Subject     : ${subjectName}`,
    `Lists OK    : ${listsVerified}`,
    `Created at  : ${new Date().toUTCString().replace(" GMT", " UTC")}`,
    ``,
    `REVIEW CHECKLIST`,
    `[ ] AI decision reviewed against raw screening data`,
    `[ ] Sanctions hits (if any) independently verified`,
    `[ ] Adverse media review completed`,
    `[ ] Risk rating concurred with or overridden with documented rationale`,
    `[ ] FDL No. 10/2025 Art. 18 sign-off recorded in goAML audit trail`,
    ``,
    `Legal basis: FDL No. 10/2025 Art. 18 — AI-generated compliance decisions`,
    `require human review before any action is taken.`,
  ].join("\n");
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8_000);
    try {
      const res = await fetch(`https://app.asana.com/api/1.0/tasks/${parentTaskGid}/subtasks`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          data: {
            name: "MLRO REVIEW REQUIRED — Four-eyes sign-off before any compliance action",
            notes: subtaskNotes,
            assignee: asanaGids.assignee(),
          },
        }),
        signal: ctl.signal,
      });
      if (!res.ok) {
        console.warn("[hawkeye] ai-decision MLRO subtask creation returned HTTP", res.status);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn("[hawkeye] ai-decision MLRO subtask creation failed (non-fatal):", err);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const t0 = Date.now();
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

  // ── Data integrity gate (FDL 10/2025 Art.18) ─────────────────────────────
  // Verify critical sanctions lists are loaded before generating any decision.
  const integrity = await checkListsIntegrity();
  if (!integrity.listsVerified) {
    console.error(
      `[ai-decision] DATA INTEGRITY GATE TRIGGERED decisionId=pending missingLists=${JSON.stringify(integrity.missingLists)}`,
    );
    return NextResponse.json(
      {
        ok: false,
        decision: "BLOCKED_DATA_INTEGRITY",
        confidence: 0,
        dataIntegrityWarning: true,
        missingDataSources: integrity.missingLists,
        _provenance: {
          listsVerified: false,
          listsQueried: integrity.listsQueried,
          missingLists: integrity.missingLists,
          generatedAt: new Date().toISOString(),
        },
        _governance: {
          humanReviewRequired: true,
          reviewNote:
            "WARNING: One or more declared data sources were unavailable at time of screening. " +
            "This decision must not be acted upon. Resolve data integrity issues and re-run.",
        },
        message:
          "Decision blocked: one or more required sanctions lists are not loaded. " +
          `Missing: ${integrity.missingLists.join(", ")}. Run sanctions refresh and retry.`,
      },
      { status: 503, headers: gate.headers },
    );
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
  let fourEyesWarning = false;
  if (body.test !== true) {
    asana = await createAsanaTask(body, decision, rationale, nextSteps, decisionId, integrity);
    // ADD-03: Await the blocking MLRO review subtask (four-eyes enforcement per FDL 10/2025 Art.18).
    if (asana.taskGid) {
      const subtaskResult = await createMlroReviewSubtask(asana.taskGid, decisionId, body.name, integrity.listsVerified).catch((err: unknown) => {
        console.error("[ai-decision] MLRO four-eyes subtask failed — compliance gate may be missing:", err);
        return null;
      });
      if (subtaskResult === null) {
        fourEyesWarning = true;
      }
    }
  }

  const responseBody: DecisionResponse & {
    _provenance: {
      listsVerified: boolean;
      listsQueried: ListInfo[];
      missingLists?: string[];
      generatedAt: string;
    };
    _governance: { humanReviewRequired: boolean; reviewNote: string };
    fourEyesWarning?: boolean;
  } = {
    ok: true,
    decisionId,
    decision,
    confidence,
    urgency,
    rationale,
    keyFactors,
    nextSteps,
    regulatoryBasis,
    _provenance: {
      listsVerified: integrity.listsVerified,
      listsQueried: integrity.listsQueried,
      ...(integrity.missingLists.length > 0 ? { missingLists: integrity.missingLists } : {}),
      generatedAt: new Date().toISOString(),
    },
    _governance: {
      humanReviewRequired: true,
      reviewNote:
        "AI-generated output — MLRO review required before any compliance action per FDL No.10/2025 Art.18.",
    },
    ...(body.test === true
      ? { asanaSkipped: true as const }
      : {
          ...(asana.taskUrl ? { asanaTaskUrl: asana.taskUrl } : {}),
          ...(asana.taskGid ? { asanaTaskGid: asana.taskGid } : {}),
        }),
    ...(fourEyesWarning ? { fourEyesWarning: true } : {}),
  };

  const latencyMs = Date.now() - t0;
  if (latencyMs > 5000) console.warn(`[ai-decision] slow response latencyMs=${latencyMs}`);
  return NextResponse.json({ ...responseBody, latencyMs }, { status: 200 , headers: gate.headers});
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
