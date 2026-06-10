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
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { searchAdverseMedia, type TaranisItem } from "../../../../src/integrations/taranisAi.js";
import { analyseAdverseMediaResult, analyseAdverseMediaItems } from "../../../../src/brain/adverse-media-analyser.js";
import { type GdeltArticle } from "@/lib/intelligence/gdelt-cache";
import { searchAllNews, type NewsArticle } from "@/lib/intelligence/newsAdapters";
import { getStore } from "@netlify/blobs";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { extractIOCs, mergeIOCs } from "../../../../src/brain/IOCExtractor.js";
import { classifyCybercrime } from "../../../../src/brain/CybercrimeClassifier.js";
import { groupArticles } from "../../../../src/brain/ArticleGroupingEngine.js";
import { buildStories } from "../../../../src/brain/StoryEngine.js";
import type { OsintItem } from "../../../../src/integrations/osint-pipeline.js";
import type { NLPExtractionResult } from "../../../../src/brain/AdverseMediaNLP.js";
import { SCREENING_BUDGETS } from "@/lib/server/screening-budgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// In-band budget (SCREENING_BUDGETS.ADVERSE_MEDIA_ROUTE_BUDGET_MS) keeps the
// response ≤5s; 10 gives 2x headroom for serialization.
export const maxDuration = 10;

const CORS: Record<string, string> = {
  // Prefer explicit NEXT_PUBLIC_APP_URL, then Netlify's runtime DEPLOY_URL (preview builds),
  // then the site canonical URL, then the hardcoded production fallback.
  "access-control-allow-origin":
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["DEPLOY_URL"] ??
    process.env["URL"] ??
    "https://hawkeye-sterling.netlify.app",
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
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: AdverseMediaBody;
  try {
    body = (await req.json()) as AdverseMediaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }

  if (!body.subject?.trim()) {
    return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }

  const subject = sanitizeField(body.subject.trim(), 300);
  const routeStartMs = Date.now();

  // Bound the upstream call so a hung Taranis can't burn the GDELT fallback
  // budget. Any timeout or thrown error short-circuits to the GDELT live-feed
  // fallback below — never a silent CLEAR verdict.
  const TARANIS_TIMEOUT_MS = SCREENING_BUDGETS.ADVERSE_MEDIA_TARANIS_OUTER_MS;
  const taranisResult = await Promise.race([
    searchAdverseMedia(subject, {
      ...(body.dateFrom !== undefined ? { dateFrom: body.dateFrom } : {}),
      ...(body.dateTo !== undefined ? { dateTo: body.dateTo } : {}),
      limit: typeof body.limit === "number" ? Math.max(1, Math.min(body.limit, 500)) : 50,
      minRelevance: typeof body.minRelevance === "number" ? Math.max(0, Math.min(body.minRelevance, 1)) : 0,
      // Inner per-attempt cap (client retries once) — the outer race below is
      // the true ceiling either way.
      timeoutMs: SCREENING_BUDGETS.ADVERSE_MEDIA_TARANIS_INNER_MS,
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
      const elapsedMs = Date.now() - routeStartMs;
      // Remaining slice of the route's 5s SLA budget — liveAdverseMedia
      // derives its vendor + Claude deadlines from this.
      const remainingBudgetMs = Math.max(1_500, SCREENING_BUDGETS.ADVERSE_MEDIA_ROUTE_BUDGET_MS - elapsedMs);
      const verdict = await liveAdverseMedia(subject, remainingBudgetMs);
      // Audit chain — required for EVERY adverse-media verdict, including the
      // fallback path (Federal Decree-Law No. 10 of 2025 Art.20). Fire-and-forget.
      void writeAuditChainEntry({
        event: "adverse_media.completed",
        actor: gate.keyId,
        subject,
        riskTier: (verdict as unknown as Record<string, unknown>)["riskTier"] ?? "unknown",
        sarRecommended: (verdict as unknown as Record<string, unknown>)["sarRecommended"] ?? false,
        totalCount: verdict.totalItems,
        adverseCount: verdict.adverseItems,
        aiGenerated: true,
        degraded: true,
        degradedReason: isConfigError ? "taranis_not_configured" : "taranis_unavailable",
        fallback: "gdelt_live",
      }, tenantIdFromGate(gate)).catch((err: unknown) => {
        console.error("[adverse-media] audit chain write failed:", err instanceof Error ? err.message : String(err));
      });
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
        riskDetail: "Adverse media unavailable — both primary and fallback data sources are unreachable. Manual MLRO review required.",
        totalItems: 0,
        adverseItems: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        sarRecommended: false,
        sarBasis: "Cannot determine — adverse-media pipeline unavailable",
        confidenceTier: "low" as const,
        confidenceBasis: "Data sources unavailable — manual review required",
        counterfactual: "Restore Taranis or set ANTHROPIC_API_KEY and re-run",
        investigationLines: ["Perform manual adverse-media search via Google, Reuters, Bloomberg"],
        findings: [],
        fatfRecommendations: ["R.10", "R.20"],
        categoryBreakdown: [],
        analysedAt: now,
        modesCited: [],
      };
      // Audit chain — the doubly-degraded path is still a compliance action
      // the regulator must be able to trace (FDL No. 10 of 2025 Art.20).
      void writeAuditChainEntry({
        event: "adverse_media.completed",
        actor: gate.keyId,
        subject,
        riskTier: "unknown",
        sarRecommended: false,
        totalCount: 0,
        adverseCount: 0,
        aiGenerated: false,
        degraded: true,
        degradedReason: "all_sources_unavailable",
      }, tenantIdFromGate(gate)).catch((auditErr: unknown) => {
        console.error("[adverse-media] audit chain write failed:", auditErr instanceof Error ? auditErr.message : String(auditErr));
      });
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

  // Enrich: IOC extraction, cybercrime classification, article grouping, story clustering.
  // Bounded by the remaining route budget (≤1s); never blocks the verdict or
  // the audit chain write.
  const enrichBudgetMs = Math.max(
    0,
    Math.min(
      SCREENING_BUDGETS.ADVERSE_MEDIA_ENRICHMENT_MS,
      SCREENING_BUDGETS.ADVERSE_MEDIA_ROUTE_BUDGET_MS - (Date.now() - routeStartMs),
    ),
  );
  const enrichment = await Promise.race([
    buildEnrichment(taranisResult.items),
    new Promise<null>(r => setTimeout(() => r(null), enrichBudgetMs)),
  ]).catch(() => null);

  // Write audit chain entry — every adverse-media query is a compliance action.
  // Federal Decree-Law No. 10 of 2025 Art.20 requires traceable records for SAR-triggering intelligence.
  void writeAuditChainEntry({
    event: "adverse_media.completed",
    actor: gate.keyId,
    subject,
    riskTier: (verdict as unknown as Record<string, unknown>).riskTier ?? "unknown",
    sarRecommended: (verdict as unknown as Record<string, unknown>).sarRecommended ?? false,
    totalCount: taranisResult.totalCount,
    adverseCount: taranisResult.adverseCount,
    aiGenerated: true,
  }, tenantIdFromGate(gate)).catch((err: unknown) => {
    console.error("[adverse-media] audit chain write failed:", err instanceof Error ? err.message : String(err));
  });

  const llmDisabled = process.env["LLM_ADVERSE_MEDIA_DISABLED"];
  const llmScreeningDisabled = llmDisabled === "1" || llmDisabled?.toLowerCase() === "true";

  return NextResponse.json(
    {
      ok: true,
      // Raw Taranis counts for backward compat
      totalCount: taranisResult.totalCount,
      adverseCount: taranisResult.adverseCount,
      highRelevanceCount: taranisResult.highRelevanceCount,
      // Weaponized analysis
      verdict,
      // Taranis AI → Hawkeye enrichment layer (story clustering, IOC extraction, cybercrime labels)
      ...(enrichment ? { enrichment } : {}),
      // Compliance disclosure: AI-generated content (Federal Decree-Law No. 10 of 2025 Art.22)
      aiGenerated: true,
      aiModel: "keyword-classifier+mlro-analyser",
      // Degraded flag when LLM screening is intentionally disabled — callers
      // must distinguish this from a genuine clean-screen result.
      ...(llmScreeningDisabled ? {
        degraded: true,
        degradedReason: "adverse_media_llm_disabled",
        degradedNote: "LLM_ADVERSE_MEDIA_DISABLED=true — adverse media LLM enrichment is not running. Results may be incomplete.",
      } : {}),
    },
    { status: 200, headers: { ...CORS, ...gateHeaders } },
  );
}

// ─── Enrichment: IOC extraction + cybercrime classification + story clustering ─
// Converts TaranisItem[] into OsintItem[] and runs the Taranis-ported pipeline.
// Called with a 3-second timeout ceiling; any failure returns null silently.

function taranisToOsint(item: TaranisItem): OsintItem {
  return {
    id: item.id,
    url: item.url ?? `https://taranis/${item.id}`,
    title: item.title,
    content: item.content,
    ...(item.published ? { publishedAt: item.published } : {}),
    language: item.language ?? "en",
    source: item.source,
  };
}

function taranisToMinimalNLP(item: TaranisItem): NLPExtractionResult {
  return {
    sourceText: item.content,
    wordCount: item.content.split(/\s+/).length,
    persons:  (item.entities ?? []).filter(e => e.type === "PERSON").map(e => ({ name: e.name, roles: [], mentions: 1 })),
    entities: (item.entities ?? []).filter(e => e.type !== "PERSON").map(e => ({ name: e.name, types: [e.type.toLowerCase()], mentions: 1 })),
    crimes: [],
    penalties: [],
    dates: [],
    jurisdictions: [],
    sanctionsMentioned: item.tags?.includes("sanction") ?? false,
    convictionMentioned: false,
    arrestMentioned: false,
    sarRelevant: false,
    confidenceScore: item.relevanceScore ?? 0.5,
    extractedAt: new Date().toISOString(),
  };
}

async function buildEnrichment(items: TaranisItem[]) {
  if (!items.length) return null;

  const osintItems = items.map(taranisToOsint);
  const nlpMap = new Map<string, NLPExtractionResult>(
    items.map(item => [item.id, taranisToMinimalNLP(item)]),
  );

  // IOC extraction: merge across all items
  const iocs = mergeIOCs(items.map(item => extractIOCs(`${item.title} ${item.content}`, item.id)));

  // Cybercrime classification per item
  const cyberLabels = items.map(item => ({
    itemId: item.id,
    ...classifyCybercrime(`${item.title} ${item.content}`),
  })).filter(c => c.hasAnyLabel);

  // Article grouping + story clustering
  const groups = groupArticles(osintItems, nlpMap);
  const stories = buildStories(groups, osintItems, nlpMap);

  return {
    stories: stories.slice(0, 10),        // cap to keep response size manageable
    articleGroups: groups.slice(0, 20),
    iocs: iocs.slice(0, 50),
    cyberLabels,
    fatfR15Flag: cyberLabels.some(c => c.fatfR15Flag),
  };
}

// ─── GDELT — served from Netlify Blobs cache only ────────────────────────────
// Live GDELT calls removed from the request path. Articles are now pre-warmed
// by netlify/functions/gdelt-prefetch.mts (every 6 h) and read from Blobs.
// If no cached result exists for a subject, GDELT is skipped entirely so the
// route never pays the 8 000+ ms live-fetch penalty.

function _parseSeen(s: string | undefined): string {
  if (!s) return new Date().toISOString().slice(0, 10);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s.slice(0, 10);
}

// Lightweight severity-category heuristic for vendor articles merged into the
// GDELT corpus. The downstream Claude prompt + 737-keyword classifier still
// do the authoritative severity rating; this is just a hint so the
// articleBlock "[cats]" tag is non-empty for vendor articles.
const ADVERSE_HIGH_RE = /\b(arrest|fraud|sanction|launder|indict|charged|raid|probe|investigat|seize|freeze|convict|jailed|ponzi|terror|bribery|corrupt|extradit)/i;
function deriveSeverityCategories(title: string): string[] {
  return ADVERSE_HIGH_RE.test(title) ? ["adverse_media", "high"] : ["adverse_media"];
}

// Convert a GDELT article to the TaranisItem shape so the deterministic
// 737-keyword classifier can process it without requiring an LLM.
function gdeltToTaranisItem(a: GdeltArticle, index: number): TaranisItem {
  const published = (() => {
    if (!a.seendate) return new Date().toISOString();
    const m = a.seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : a.seendate;
  })();
  return {
    id: a.url ?? String(index),
    title: a.title ?? "",
    content: a.title ?? "",   // GDELT artlist mode has no body text; title is the best signal
    source: a.domain ?? "gdelt",
    published,
    ...(a.url ? { url: a.url } : {}),
    ...(a.language ? { language: a.language } : {}),
    tags: a.riskCategories ?? [],
    entities: [],
    ...(a.relevance !== undefined ? { relevanceScore: a.relevance } : {}),
    ...(a.tone !== undefined ? { tone: a.tone } : {}),
  } as TaranisItem;
}

// Serve GDELT articles from Netlify Blobs cache (pre-warmed by gdelt-prefetch.mts).
// Primary analysis path: Claude provides narrative + structured findings.
// Fallback path: when ANTHROPIC_API_KEY is absent, the deterministic
// 737-keyword classifier runs directly on whatever articles are cached.
async function liveAdverseMedia(subject: string, budgetMs: number = SCREENING_BUDGETS.ADVERSE_MEDIA_ROUTE_BUDGET_MS) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const fnStart = Date.now();
  const remaining = () => budgetMs - (Date.now() - fnStart);

  // Multi-source vendor news fan-out — fires IMMEDIATELY in parallel with the
  // Blobs cache check. Budget-aware cap on cold-cache paths (≤1.5s, always
  // leaving ~2s for Claude); 500 ms grace on warm paths (Blobs has articles —
  // vendor is bonus, not gating).
  const VENDOR_DEADLINE_MS = Math.min(SCREENING_BUDGETS.ADVERSE_MEDIA_VENDOR_MS, Math.max(300, remaining() - 2_000));
  const vendorPromise = searchAllNews(subject, { limit: 25 })
    .catch(() => ({ articles: [] as NewsArticle[], providersUsed: [] as string[] }));

  // 1. Read GDELT articles from Netlify Blobs cache.
  //    The gdelt-prefetch.mts scheduled function (every 6 h) pre-warms this cache.
  //    If no cached result exists for this subject, GDELT is skipped entirely —
  //    no live network call, zero latency impact.
  let items: GdeltArticle[] = [];
  let gdeltCachedAt: string | null = null;
  try {
    const blobStore = getStore({ name: "gdelt-cache" });
    const cached = await blobStore.get(`gdelt:${subject}`, { type: "json" }) as {
      articles: GdeltArticle[];
      cachedAt: string;
    } | null;
    if (cached?.articles && Array.isArray(cached.articles)) {
      items = cached.articles;
      gdeltCachedAt = typeof cached.cachedAt === "string" ? cached.cachedAt : null;
    }
  } catch {
    // Blobs unavailable — proceed with vendor-only path (no live GDELT in request path).
  }

  // Cache-staleness disclosure — the prefetch cadence is 6h, so anything
  // older than 12h means the background warmer has missed ≥1 cycle and the
  // MLRO must know the corpus is not current (FDL No. 10 of 2025 Art.19).
  const gdeltCacheAgeHours = gdeltCachedAt !== null && Number.isFinite(Date.parse(gdeltCachedAt))
    ? Math.round(((Date.now() - Date.parse(gdeltCachedAt)) / 3_600_000) * 10) / 10
    : null;
  const stalenessFields = gdeltCachedAt !== null
    ? { gdeltCachedAt, gdeltCacheAgeHours, gdeltStale: (gdeltCacheAgeHours ?? 0) > 12 }
    : {};

  // No live GDELT call from the request path — gdelt-prefetch.mts (every 6 h)
  // pre-warms the Blobs cache in the background. This keeps the hot path at:
  //   warm (Blobs hit):  Blobs ~50 ms + vendor grace 500 ms + Claude 2.5 s ≈ 3 s
  //   cold (Blobs miss): vendor 2 s + Claude 2.5 s ≈ 4.5 s
  // Both paths guaranteed ≤ 5 s.

  // Await vendor: if Blobs already has articles take only a short 500 ms grace
  // window (vendor is bonus enrichment). If Blobs missed, wait the full 2 s
  // deadline — vendor may be the only source.
  const vendorWithDeadline = items.length > 0
    ? Promise.race([
        vendorPromise,
        new Promise<{ articles: NewsArticle[]; providersUsed: string[] }>(
          resolve => setTimeout(() => resolve({ articles: [], providersUsed: [] }), 500),
        ),
      ])
    : Promise.race([
        vendorPromise,
        new Promise<{ articles: NewsArticle[]; providersUsed: string[] }>(
          resolve => setTimeout(() => resolve({ articles: [], providersUsed: [] }), VENDOR_DEADLINE_MS),
        ),
      ]);
  const { articles: vendorArticles } = await vendorWithDeadline;
  {
    const seenUrls = new Set(items.map((a) => (a.url ?? "").toLowerCase()).filter(Boolean));
    for (const va of vendorArticles) {
      const key = va.url.toLowerCase();
      if (!key || seenUrls.has(key)) continue;
      seenUrls.add(key);
      // Map vendor NewsArticle → GdeltArticle so the downstream
      // articleBlock builder + keyword classifier can consume it uniformly.
      let domain = va.outlet || va.source;
      try { domain = new URL(va.url).hostname.replace(/^www\./, ""); } catch { /* keep outlet fallback */ }
      const seendateFromIso = (() => {
        const d = new Date(va.publishedAt);
        if (Number.isNaN(d.getTime())) return undefined;
        const z = d.toISOString();
        const y = z.slice(0, 4); const mo = z.slice(5, 7); const da = z.slice(8, 10);
        const h = z.slice(11, 13); const mi = z.slice(14, 16); const s = z.slice(17, 19);
        return `${y}${mo}${da}T${h}${mi}${s}Z`;
      })();
      items.push({
        url: va.url,
        title: va.title,
        domain,
        ...(seendateFromIso ? { seendate: seendateFromIso } : {}),
        ...(typeof va.sentiment === "number" ? { tone: va.sentiment * 10 } : { tone: 0 }),
        ...(va.language ? { language: va.language } : {}),
        riskCategories: deriveSeverityCategories(va.title),
      });
    }
  }

  // Sort the merged corpus by published date descending so the most recent
  // (and most actionable) headlines appear first in the article block and
  // dominate Claude's narrative window.
  items.sort((a, b) => {
    const ax = a.seendate ?? "";
    const bx = b.seendate ?? "";
    return bx.localeCompare(ax);
  });

  // When no Anthropic key is configured, run the deterministic 737-keyword
  // classifier directly on the (possibly empty) cached articles.
  // No Anthropic key — run the deterministic 737-keyword classifier on ALL
  // collected articles and include the full raw evidence in the response.
  if (!apiKey) {
    const taranisItems = items.map(gdeltToTaranisItem);
    const verdict = analyseAdverseMediaItems(subject, taranisItems);
    return { ...verdict, gdeltSource: true, gdeltArticleCount: items.length, keywordClassifierOnly: true, articles: items, ...stalenessFields };
  }

  // Deterministic fallback used whenever the Claude analysis can't run or
  // can't be trusted (budget exhausted, LLM error, truncated/unparseable
  // output). Only valid when articles exist — the classifier on an empty
  // corpus would claim CLEAR for a check that retrieved no data.
  const classifierFallback = (reason: string) => {
    const verdict = analyseAdverseMediaItems(subject, items.map(gdeltToTaranisItem));
    return {
      ...verdict,
      gdeltSource: true,
      gdeltArticleCount: items.length,
      keywordClassifierOnly: true,
      claudeFallbackReason: reason,
      articles: items,
      ...stalenessFields,
    };
  };

  // Budget-aware Claude call: cap at CLAUDE_MAX, and when the remaining
  // budget can't fit a minimally-useful call, skip Claude entirely — a real
  // deterministic verdict beats a timeout-induced "unknown".
  const claudeBudgetMs = Math.min(SCREENING_BUDGETS.ADVERSE_MEDIA_CLAUDE_MAX_MS, remaining() - 150);
  if (claudeBudgetMs < SCREENING_BUDGETS.ADVERSE_MEDIA_CLAUDE_MIN_MS) {
    if (items.length > 0) return classifierFallback("insufficient_budget");
    // No articles AND no budget — surface the degraded "unknown" verdict via
    // the caller's catch path rather than a silent CLEAR.
    throw new Error("adverse-media budget exhausted before Claude analysis and no cached/vendor articles available");
  }

  const now = new Date().toISOString();

  // Claude analyses the top 10 articles for the structured verdict; ALL collected
  // articles are returned in the response payload for full MLRO evidence disclosure.
  // 10 findings ≈ 450-600 output tokens — fits the ≤3.2s budget on Haiku.
  const CLAUDE_ARTICLE_WINDOW = 10;
  const articleBlock =
    items.length > 0
      ? items
          .slice(0, CLAUDE_ARTICLE_WINDOW)
          .map((a, i) => {
            const date = _parseSeen(a.seendate);
            const tone = (a.tone ?? 0).toFixed(1);
            const srcScore = a.sourceScore != null ? ` | rep:${a.sourceScore.toFixed(2)}` : "";
            const cats = a.riskCategories?.length ? ` | [${a.riskCategories.join(",")}]` : "";
            return `[${i + 1}] ${date} | ${a.domain ?? "unknown"}${srcScore}${cats} | tone:${tone} | "${a.title}"`;
          })
          .join("\n")
      : "No articles found across multi-source adverse-media corpus (lifetime — GDELT + NewsAPI, GNews, NewsData, MediaStack, Currents, NYT, MarketAux, NewsCatcher, Tiingo, AlphaVantage, WorldNews, MediaCloud — whichever keys are configured) for this subject.";

  const client = getAnthropicClient(apiKey, claudeBudgetMs);
  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700, // 10 articles × ~50 tok/finding + narrative ≈ 600 tok
    system: [
      {
        type: "text",
        text: `You are an MLRO adverse-media intelligence system operating for a UAE-regulated financial institution. You have been given REAL live news articles fetched from a multi-source adverse-media corpus (GDELT + 12 vendor feeds) covering the subject's entire lifetime (Art.19 Federal Decree-Law No. 10 of 2025).

CRITICAL INSTRUCTION: Base your assessment SOLELY on the articles provided by the user. Do NOT use your training knowledge to add, invent, or assume facts not present in the article list. If no articles were found, return riskTier "unknown" (not "clear") with zero counts — "clear" means data was found and was clean; "unknown" means data was unavailable.

Return ONLY valid JSON matching this exact shape (no markdown, no explanation):
{
  "subject": "string",
  "riskTier": "clear|low|medium|high|critical|unknown",
  "riskDetail": "one sentence summary citing specific article dates/sources found above",
  "totalItems": number,
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
  "analysedAt": "ISO timestamp",
  "modesCited": ["mode"],
  "gdeltSource": true,
  "gdeltArticleCount": number
}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Analyse adverse media for subject: "${subject}"
Reference date: ${now.slice(0, 10)}
Articles from multi-source corpus (showing top ${Math.min(items.length, CLAUDE_ARTICLE_WINDOW)} of ${items.length} total collected):
${articleBlock}`,
      },
    ],
    });
  } catch (err) {
    // Claude timed out or errored inside the budget. With articles in hand,
    // degrade to the deterministic classifier — never a timeout-induced
    // "unknown" when real evidence exists.
    console.warn("[adverse-media] Claude call failed — keyword classifier fallback:", err instanceof Error ? err.message : String(err));
    if (items.length > 0) return classifierFallback("llm_error");
    throw err; // no articles either — caller's catch surfaces the degraded "unknown" verdict
  }

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  // Claude can occasionally return prose that doesn't parse — pull the
  // outermost {…} block as a recovery. A truncated response (stop_reason
  // max_tokens) is never trusted even if a {...} block parses.
  const tryParse = (raw: string): ReturnType<typeof analyseAdverseMediaResult> | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ReturnType<typeof analyseAdverseMediaResult>;
    } catch {
      return null;
    }
  };
  const truncated = response.stop_reason === "max_tokens";
  const parsed = truncated ? null : (tryParse(clean) ?? (() => {
    const m = clean.match(/\{[\s\S]*\}/);
    return m ? tryParse(m[0]) : null;
  })());
  if (parsed) return { ...parsed, articles: items, ...stalenessFields };

  // Unparseable/truncated Claude output: with articles in hand, the
  // deterministic classifier produces a real tier; "unknown" is reserved
  // for the genuinely-no-data case below.
  if (items.length > 0) return classifierFallback(truncated ? "truncated" : "parse_failed");

  console.warn(`[adverse-media] Claude returned non-JSON (subject redacted) — surfacing degraded verdict`);
  const degraded: ReturnType<typeof analyseAdverseMediaResult> & {
    gdeltSource: boolean;
    gdeltArticleCount: number;
    claudeParseFailed: boolean;
    articles: GdeltArticle[];
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
    articles: items,
    ...stalenessFields,
  };
  return degraded;
}
