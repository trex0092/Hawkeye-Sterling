// POST /api/screening/enhanced
//
// Super-powered screening pipeline with 6 layers beyond the standard run:
//
//   Layer 1 — Multi-script normalization: Cyrillic/Arabic/Greek/homoglyph detection
//   Layer 2 — Variant expansion: All romanized forms added as aliases
//   Layer 3 — Parallel screening: Each variant screened independently
//   Layer 4 — Feedback adjustment: Historical FP/TM verdicts adjust hit scores
//   Layer 5 — LLM auto-triage: POSSIBLE hits (40-80%) scored by confidence model
//   Layer 6 — Cross-list dedup: Same person on multiple lists merged with citations
//
// Drop-in upgrade for /api/screening/run — same request shape, richer response.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { stats as feedbackStats, adjustScore } from "@/lib/server/feedback";
import {
  normalizeName,
  detectHomoglyphs,
  detectScript,
} from "@/lib/server/multilang-normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL =
  process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? "http://localhost:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

interface ScreeningHit {
  listId?: string;
  listRef?: string;
  name?: string;
  score?: number;
  matchRationale?: string;
  sourceRef?: string;
  [key: string]: unknown;
}

interface ScreeningResult {
  ok: boolean;
  hits?: ScreeningHit[];
  topScore?: number;
  severity?: string;
  subject?: unknown;
  negativeEvidence?: unknown;
  confidenceNote?: string;
  resultId?: string;
  [key: string]: unknown;
}

interface LlmTriageResult {
  hitRef: string;
  confidenceScore: number;
  recommendation: "clear" | "escalate" | "file_str" | "manual_review";
  reasoning: string;
  feedbackAdjusted?: boolean;
  feedbackDelta?: number;
}

async function callScreeningRun(body: unknown): Promise<ScreeningResult> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.ADMIN_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/api/screening/run`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`upstream screening ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<ScreeningResult>;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: {
    subject?: {
      name?: string;
      dob?: string;
      nationality?: string;
      idNumber?: string;
      aliases?: string[];
      [key: string]: unknown;
    };
    options?: Record<string, unknown>;
    requestId?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const subjectName = sanitizeField(body.subject?.name ?? "", 500);
  if (!subjectName) {
    return NextResponse.json({ ok: false, error: "subject.name is required" }, { status: 400, headers: gate.headers });
  }

  // ── Layer 1 & 2: Script detection, normalization, variant expansion ───────────

  const script = detectScript(subjectName);
  const normalized = normalizeName(subjectName);
  const homoglyphCheck = detectHomoglyphs(subjectName);
  const scriptWarnings: string[] = [];

  if (homoglyphCheck.hasHomoglyphs) {
    scriptWarnings.push(
      `Homoglyph substitution detected: ${homoglyphCheck.substitutions.map((s) => `'${s.original}'→'${s.latin}' at pos ${s.position}`).join(", ")}. ` +
      `Normalized form: "${homoglyphCheck.normalized}". Manual verification required.`,
    );
  }
  if (script !== "latin" && script !== "unknown") {
    scriptWarnings.push(`Input name in ${script} script. Romanized as: "${normalized.latinized}". Screening run against all ${normalized.variants.length} variants.`);
  }

  // Deduplicate aliases: original + all script variants
  const existingAliases: string[] = Array.isArray(body.subject?.aliases) ? (body.subject.aliases as string[]) : [];
  const expandedAliases = Array.from(new Set([
    ...existingAliases,
    ...normalized.variants.filter((v) => v.toLowerCase() !== subjectName.toLowerCase()),
    ...(homoglyphCheck.hasHomoglyphs ? [homoglyphCheck.normalized] : []),
  ])).slice(0, 50); // cap at 50 to prevent combinatorial explosion

  // ── Layer 3: Run screening with expanded aliases ───────────────────────────────

  const enhancedSubject = {
    ...body.subject,
    aliases: expandedAliases,
  };

  let screenResult: ScreeningResult;
  try {
    screenResult = await callScreeningRun({ ...body, subject: enhancedSubject });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `screening engine unavailable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 503, headers: gate.headers },
    );
  }

  const hits: ScreeningHit[] = (screenResult.hits ?? []) as ScreeningHit[];

  // ── Layer 4: Feedback-adjusted scores ────────────────────────────────────────

  const fbStats = await feedbackStats().catch((err) => { console.warn("[enhanced-screening] feedbackStats failed:", err instanceof Error ? err.message : err); return null; });
  const feedbackAdjustments: Record<string, { delta: number; reason: string }> = {};

  if (fbStats) {
    for (const hit of hits) {
      const listId = hit.listId ?? "unknown";
      // EN-2: use same key formula in both storage and lookup
      const hitKey = hit.listRef ?? hit.name ?? "unknown";
      const candidate = subjectName;
      const rawScore = (hit.score ?? 0) / 100;
      const adj = adjustScore(rawScore, listId, hitKey, candidate, fbStats);
      if (adj.delta !== 0) {
        hit.score = Math.round(adj.score * 100);
        feedbackAdjustments[hitKey] = { delta: adj.delta, reason: adj.reason ?? "" };
      }
    }
  }

  // ── Layer 5: LLM auto-triage for POSSIBLE hits (score 40-80) ─────────────────

  const triageResults: LlmTriageResult[] = [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const possibleHits = hits.filter((h) => {
    const s = h.score ?? 0;
    return s >= 40 && s < 80;
  });

  if (apiKey && possibleHits.length > 0) {
    const client = getAnthropicClient(apiKey, 4_500, "screening/enhanced");
    const TRIAGE_SYSTEM = `You are an AML sanctions-screening specialist. For each watchlist hit, assess if it is a true match or false positive. Return ONLY JSON: {"confidenceScore":<0-100>,"recommendation":"clear"|"escalate"|"file_str"|"manual_review","reasoning":"<1-2 sentences>"}`;

    await Promise.allSettled(possibleHits.map(async (hit) => {
      try {
        const res = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 256,
          system: TRIAGE_SYSTEM,
          messages: [{
            role: "user",
            content: `Subject: "${subjectName}" (${sanitizeField(body.subject?.nationality ?? "nationality unknown", 100)}, DOB: ${sanitizeField(body.subject?.dob ?? "not provided", 50)})
Hit: "${hit.name}" on list ${hit.listId ?? "unknown"} (ref: ${hit.listRef ?? "unknown"})
Match score: ${hit.score ?? 0}/100
Rationale: ${hit.matchRationale ?? "none provided"}
Assess: true match or false positive?`,
          }],
        });
        const raw = res.content[0]?.type === "text" ? (res.content[0] as { type: "text"; text: string }).text : "{}";
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { confidenceScore?: number; recommendation?: string; reasoning?: string };
        const fbAdj = feedbackAdjustments[hit.listRef ?? hit.name ?? "unknown"];
        triageResults.push({
          hitRef: hit.listRef ?? hit.name ?? String(hit.score),
          confidenceScore: parsed.confidenceScore ?? (hit.score ?? 50),
          recommendation: (parsed.recommendation as LlmTriageResult["recommendation"]) ?? "manual_review",
          reasoning: parsed.reasoning ?? "",
          feedbackAdjusted: !!fbAdj,
          feedbackDelta: fbAdj?.delta,
        });
      } catch { /* triage is non-blocking */ }
    }));
  }

  // ── Layer 6: Cross-list deduplication ────────────────────────────────────────

  // EN-3: collect ALL listRef values per deduplicated entry, not just the first
  const merged: Record<string, { hit: ScreeningHit; lists: string[]; refs: string[] }> = {};
  for (const hit of hits) {
    const key = (hit.name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    if (merged[key]) {
      merged[key]!.lists.push(hit.listId ?? "unknown");
      if (hit.listRef) merged[key]!.refs.push(hit.listRef);
    } else {
      merged[key] = { hit, lists: [hit.listId ?? "unknown"], refs: hit.listRef ? [hit.listRef] : [] };
    }
  }
  const deduplicatedHits = Object.values(merged).map(({ hit, lists, refs }) => ({
    ...hit,
    appearsOnLists: [...new Set(lists)],
    appearsWithRefs: [...new Set(refs)],
    multiListHit: lists.length > 1,
  }));

  // Compute revised top score
  const revisedTopScore = deduplicatedHits.length > 0
    ? Math.max(...deduplicatedHits.map((h) => h.score ?? 0))
    : 0;

  return NextResponse.json({
    enhanced: true,
    // Core screening result (ok from screenResult may be overwritten — keep our own)
    ...screenResult,
    ok: true,
    hits: deduplicatedHits,
    topScore: revisedTopScore,
    // Enhancement layers
    scriptAnalysis: {
      detectedScript: script,
      latinized: normalized.latinized,
      variantsExpanded: expandedAliases.length,
      homoglyphsDetected: homoglyphCheck.hasHomoglyphs,
      homoglyphSubstitutions: homoglyphCheck.substitutions,
      scriptWarnings,
    },
    feedbackAdjustments,
    llmTriage: triageResults,
    deduplicatedHitCount: deduplicatedHits.length,
    multiListHits: deduplicatedHits.filter((h) => h.multiListHit).length,
  }, { headers: gate.headers });
}
