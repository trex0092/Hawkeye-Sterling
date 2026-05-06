// POST /api/adverse-media
// Weaponized adverse-media pipeline:
//   1. Fetch from Taranis AI (live OSINT news feed)
//   2. Classify each item against the 737-keyword taxonomy (12 categories)
//   3. Map to FATF predicate offenses + reasoning modes
//   4. Score severity (critical/high/medium/low/clear)
//   5. Evaluate SAR trigger (FATF R.20)
//   6. Generate MLRO investigation narrative
//
// Returns a full AdverseMediaSubjectVerdict — MLRO-grade intelligence report.
//
// Body: { subject: string, dateFrom?: string, dateTo?: string, limit?: number, minRelevance?: number }

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { searchAdverseMedia } from "../../../../dist/src/integrations/taranisAi.js";
import { analyseAdverseMediaResult } from "../../../../dist/src/brain/adverse-media-analyser.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface AdverseMediaBody {
  subject: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  minRelevance?: number;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: AdverseMediaBody;
  try {
    body = (await req.json()) as AdverseMediaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!body.subject?.trim()) {
    return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400, headers: CORS });
  }

  const subject = body.subject.trim();

  // Bound the upstream call so a hung Taranis can't burn the whole 30s
  // function budget. Any timeout or thrown error short-circuits to the
  // GDELT live-feed fallback below — never a silent CLEAR verdict.
  const TARANIS_TIMEOUT_MS = 18_000;
  const taranisResult = await Promise.race([
    searchAdverseMedia(subject, {
      ...(body.dateFrom !== undefined ? { dateFrom: body.dateFrom } : {}),
      ...(body.dateTo !== undefined ? { dateTo: body.dateTo } : {}),
      limit: body.limit ?? 50,
      minRelevance: body.minRelevance ?? 0,
    }),
    new Promise<{ ok: false; error: string }>((resolve) =>
      setTimeout(
        () => resolve({ ok: false, error: `Taranis request exceeded ${TARANIS_TIMEOUT_MS}ms` }),
        TARANIS_TIMEOUT_MS,
      ),
    ),
  ]).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));

  if (!taranisResult.ok) {
    const taranisErr = taranisResult.error ?? "unknown";
    const isConfigError = taranisErr.includes("not configured");
    if (!isConfigError) console.error("[adverse-media] Taranis error:", taranisErr);
    // Taranis unavailable (or not configured) — fall back to live GDELT fetch.
    // liveAdverseMedia throws when ANTHROPIC_API_KEY is also missing; catch that
    // and return a properly-typed degraded verdict so the caller never sees a
    // silent CLEAR or an unhandled 500.
    try {
      const verdict = await liveAdverseMedia(subject);
      return NextResponse.json(
        {
          ok: true,
          totalCount: verdict.totalItems,
          adverseCount: verdict.adverseItems,
          highRelevanceCount: verdict.criticalCount + verdict.highCount,
          verdict,
          ...(isConfigError ? {} : { note: "Taranis unavailable — GDELT live feed used" }),
        },
        { status: 200, headers: { ...CORS, ...gateHeaders } },
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[adverse-media] both Taranis and GDELT/Claude unavailable:", detail);
      const now = new Date().toISOString();
      const degraded = {
        subject,
        riskTier: "unknown" as const,
        riskDetail: `Adverse media unavailable — neither Taranis nor live GDELT/Claude path is reachable (${detail}). Manual MLRO review required.`,
        totalItems: 0,
        adverseItems: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        sarRecommended: false,
        sarBasis: "Cannot determine — adverse-media pipeline unavailable",
        confidenceTier: "low" as const,
        confidenceBasis: detail,
        counterfactual: "Restore Taranis or set ANTHROPIC_API_KEY and re-run",
        investigationLines: ["Perform manual adverse-media search via Google, Reuters, Bloomberg"],
        findings: [],
        fatfRecommendations: ["R.10", "R.20"],
        categoryBreakdown: [],
        analysedAt: now,
        modesCited: [],
      };
      return NextResponse.json(
        {
          ok: true,
          totalCount: 0,
          adverseCount: 0,
          highRelevanceCount: 0,
          verdict: degraded,
          degraded: true,
          degradedReason: detail,
        },
        { status: 200, headers: { ...CORS, ...gateHeaders } },
      );
    }
  }

  // Run the weaponized analyser — full MLRO-grade intelligence pipeline
  const verdict = analyseAdverseMediaResult(subject, taranisResult);

  return NextResponse.json(
    {
      ok: true,
      // Raw Taranis counts for backward compat
      totalCount: taranisResult.totalCount,
      adverseCount: taranisResult.adverseCount,
      highRelevanceCount: taranisResult.highRelevanceCount,
      // Weaponized analysis
      verdict,
    },
    { status: 200, headers: { ...CORS, ...gateHeaders } },
  );
}

// ─── GDELT live-news helpers (no API key required) ───────────────────────────
// Queries the GDELT Project DOC 2.0 API with a 10-year Art.19 lookback window.
// This replaces the old "Claude from memory" fallback which silently missed
// post-training-cutoff articles (e.g. Oct 2025 Istanbul Gold Refinery arrests).

const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_FETCH_TIMEOUT = 14_000;
const GDELT_MAX_RECORDS = 50;

interface GdeltRawItem {
  url?: string;
  title?: string;
  seendate?: string; // "20251006T120000Z"
  domain?: string;
  tone?: number;
}

// Distinguishes "no articles found" (genuine CLEAR) from "fetch failed" (unknown).
interface GdeltQueryResult {
  items: GdeltRawItem[];
  ok: boolean;        // false = network/timeout/HTTP error
  error?: string;
}

function _gdeltFmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function _parseSeen(s: string | undefined): string {
  if (!s) return new Date().toISOString().slice(0, 10);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s.slice(0, 10);
}

async function _queryGdelt(subject: string): Promise<GdeltQueryResult> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - 10); // FDL Art.19 10-year lookback
  const query = `"${subject}" AND (sanctions OR fraud OR "money laundering" OR corruption OR crime OR arrest OR investigation OR indicted OR convicted)`;
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    maxrecords: String(GDELT_MAX_RECORDS),
    format: "json",
    sort: "DateDesc",
    startdatetime: _gdeltFmt(start),
    enddatetime: _gdeltFmt(now),
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GDELT_FETCH_TIMEOUT);
  try {
    const res = await fetch(`${GDELT_ENDPOINT}?${params.toString()}`, {
      signal: ctrl.signal,
      headers: { "user-agent": "HawkeyeSterling/2.0 adverse-media-live" },
    });
    if (!res.ok) return { items: [], ok: false, error: `GDELT HTTP ${res.status}` };
    const data = (await res.json()) as { articles?: GdeltRawItem[] };
    const items = Array.isArray(data.articles) ? data.articles.filter((a) => a.url && a.title) : [];
    return { items, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = ctrl.signal.aborted || msg.includes("abort");
    return { items: [], ok: false, error: isTimeout ? "GDELT request timed out" : `GDELT fetch failed: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

// Replaces the old claudeAdverseMedia() that asked Claude from training memory.
// Now: fetch REAL live articles from GDELT, then have Claude analyse those
// specific articles — completely eliminating the knowledge-cutoff blind spot.
async function liveAdverseMedia(subject: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  // 1. Pull live articles (GDELT, 10-year Art.19 window, no API key)
  const gdeltResult = await _queryGdelt(subject);
  const items = gdeltResult.items;

  // If GDELT itself failed (timeout / HTTP error), we must NOT return CLEAR.
  // Return an explicit degraded verdict so the operator knows the lookup was
  // incomplete — the MLRO must perform a manual adverse-media check.
  if (!gdeltResult.ok) {
    console.warn(`[adverse-media] GDELT unavailable for "${subject}": ${gdeltResult.error}`);
    const now = new Date().toISOString();
    const degraded: ReturnType<typeof analyseAdverseMediaResult> & {
      gdeltSource: boolean;
      gdeltArticleCount: number;
      gdeltFailed: boolean;
      gdeltError?: string;
    } = {
      subject,
      riskTier: "unknown",
      riskDetail: `Adverse media search incomplete — GDELT live feed unavailable (${gdeltResult.error}). Manual MLRO review required.`,
      totalItems: 0,
      adverseItems: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      sarRecommended: false,
      sarBasis: "Cannot determine — live news feed unavailable",
      confidenceTier: "low",
      confidenceBasis: "GDELT query failed; no articles analysed",
      counterfactual: "Restore GDELT connectivity and re-run to get a reliable assessment",
      investigationLines: ["Perform manual adverse-media search via Google, Reuters, Bloomberg"],
      findings: [],
      fatfRecommendations: ["R.10", "R.20"],
      categoryBreakdown: [],
      analysedAt: now,
      modesCited: [],
      gdeltSource: true,
      gdeltArticleCount: 0,
      gdeltFailed: true,
      ...(gdeltResult.error ? { gdeltError: gdeltResult.error } : {}),
    };
    return degraded;
  }

  const now = new Date().toISOString();

  // 2. Build article block — Claude analyses REAL headlines, not training memory
  const articleBlock =
    items.length > 0
      ? items
          .slice(0, 30)
          .map((a, i) => {
            const date = _parseSeen(a.seendate);
            const tone = (a.tone ?? 0).toFixed(1);
            return `[${i + 1}] ${date} | ${a.domain ?? "unknown"} | tone:${tone} | "${a.title}"`;
          })
          .join("\n")
      : "No articles found in GDELT 10-year corpus for this subject.";

  const client = getAnthropicClient(apiKey, 55_000);
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `You are an MLRO adverse-media intelligence system operating for a UAE-regulated financial institution. You have been given REAL live news articles fetched from the GDELT global news corpus (Art.19 FDL 10/2025 — 10-year lookback, anchored to today ${now.slice(0, 10)}).

Subject: "${subject}"
Live articles retrieved from GDELT (${items.length} total):
${articleBlock}

CRITICAL INSTRUCTION: Base your assessment SOLELY on the articles listed above. Do NOT use your training knowledge to add, invent, or assume facts not present in the article list. If no articles were found, return riskTier "clear" with zero counts.

Return ONLY valid JSON matching this exact shape (no markdown, no explanation):
{
  "subject": "${subject}",
  "riskTier": "clear|low|medium|high|critical",
  "riskDetail": "one sentence summary citing specific article dates/sources found above",
  "totalItems": ${items.length},
  "adverseItems": number,
  "criticalCount": number,
  "highCount": number,
  "mediumCount": number,
  "lowCount": number,
  "sarRecommended": boolean,
  "sarBasis": "reason or N/A",
  "confidenceTier": "high|medium|low",
  "confidenceBasis": "basis for confidence — note GDELT coverage and article count",
  "counterfactual": "what additional information would change this assessment",
  "investigationLines": ["line1", "line2"],
  "findings": [
    {
      "itemId": "1",
      "title": "exact headline from article list",
      "source": "domain from article list",
      "published": "YYYY-MM-DD from article list",
      "severity": "critical|high|medium|low|clear",
      "categories": ["sanctions|fraud|money_laundering|corruption|law_enforcement|investigation|terrorism|crypto|dpms|adverse_media"],
      "keywords": ["keyword"],
      "fatfRecommendations": ["R.20"],
      "fatfPredicates": ["predicate offense"],
      "reasoningModes": ["mode"],
      "narrative": "brief MLRO narrative for this specific article",
      "relevanceScore": 0.8,
      "isSarCandidate": false
    }
  ],
  "fatfRecommendations": ["R.20"],
  "categoryBreakdown": [{"categoryId":"sanctions","displayName":"Sanctions","count":0,"severity":"clear"}],
  "analysedAt": "${now}",
  "modesCited": ["mode"],
  "gdeltSource": true,
  "gdeltArticleCount": ${items.length}
}`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  // Claude can occasionally return prose that doesn't parse — pull the
  // outermost {…} block as a recovery, then surface a degraded verdict
  // (NOT a silent CLEAR) if that still fails.
  const tryParse = (raw: string): ReturnType<typeof analyseAdverseMediaResult> | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ReturnType<typeof analyseAdverseMediaResult>;
    } catch {
      return null;
    }
  };
  const parsed = tryParse(clean) ?? (() => {
    const m = clean.match(/\{[\s\S]*\}/);
    return m ? tryParse(m[0]) : null;
  })();
  if (parsed) return parsed;

  console.warn(`[adverse-media] Claude returned non-JSON for "${subject}" — surfacing degraded verdict`);
  const degraded: ReturnType<typeof analyseAdverseMediaResult> & {
    gdeltSource: boolean;
    gdeltArticleCount: number;
    claudeParseFailed: boolean;
  } = {
    subject,
    riskTier: "unknown",
    riskDetail: `Adverse media analysis incomplete — Claude returned a non-JSON response (${items.length} GDELT articles fetched). Manual MLRO review required.`,
    totalItems: items.length,
    adverseItems: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    sarRecommended: false,
    sarBasis: "Cannot determine — Claude response could not be parsed",
    confidenceTier: "low",
    confidenceBasis: `Parser fallback; Claude raw length ${text.length} chars`,
    counterfactual: "Re-run the request — Claude responses are stochastic; the next call usually parses cleanly",
    investigationLines: ["Perform manual adverse-media review of the GDELT articles fetched for this subject"],
    findings: [],
    fatfRecommendations: ["R.10", "R.20"],
    categoryBreakdown: [],
    analysedAt: now,
    modesCited: [],
    gdeltSource: true,
    gdeltArticleCount: items.length,
    claudeParseFailed: true,
  };
  return degraded;
}
