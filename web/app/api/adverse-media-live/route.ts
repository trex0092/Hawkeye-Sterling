// POST /api/adverse-media-live
// Real-time adverse media lookup via GDELT Project API (free, no key required).
// Searches for a named subject combined with AML/financial-crime keywords,
// returns scored results with risk rating.
//
// If ANTHROPIC_API_KEY is set, Claude generates a structured summary and
// per-article category tags.
//
// Body: { subjectName: string; entityType?: string; jurisdiction?: string }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { searchAllNews } from "@/lib/intelligence/newsAdapters";
import { fetchGdeltCached, queryGdeltGkg } from "@/lib/intelligence/gdelt-cache";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AdverseMediaLiveResult {
  ok: true;
  subject: string;
  totalHits: number;
  riskScore: number; // 0-100
  riskRating: "critical" | "high" | "medium" | "low" | "clear" | "unknown";
  articles: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string;
    tone: number;
    relevanceScore: number;
    categories: string[]; // e.g. ["sanctions", "fraud", "corruption"]
    snippet: string;
  }>;
  summary: string;
  regulatoryBasis: string;
}

interface AdverseMediaLiveBody {
  subjectName: string;
  entityType?: string;
  jurisdiction?: string;
  aliases?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Name-variant generator — fan-out so transliterations + suffix-stripped
// variants don't get missed (Istanbul Gold Refinery / İstanbul Altın
// Rafinerisi / Istanbul Refinery, etc).
// ─────────────────────────────────────────────────────────────────────────────

const CORP_SUFFIX_RE = /\b(LIMITED|LTD\.?|INCORPORATED|INC\.?|CORPORATION|CORP\.?|COMPANY|CO\.?|HOLDINGS?|GROUP|S\.?A\.?S?|SAS|GMBH|MBH|AG|PJSC|OJSC|JSC|LLP|PLC|N\.?V\.?|B\.?V\.?|PTE\.?|PTY\.?|S\.?R\.?L\.?|SRL|SP\.?\s?Z\.?O\.?O\.?|SDN\.?\s?BHD\.?|FZ-?LLC|FZE|FZ-?CO|TRADING|REFINERY|REFINING|HOLDING|TECHNOLOGIES|INDUSTRIES|ENTERPRISES?|MINING|RESOURCES|EXPORT|IMPORT)\b/gi;

function generateNameVariants(name: string, aliases?: string[]): string[] {
  const variants = new Set<string>();
  const base = name.trim();
  if (!base) return [];
  variants.add(base);
  // Title-cased version (helps if the analyst typed ALL CAPS)
  const titled = base
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ""))
    .join(" ");
  if (titled !== base) variants.add(titled);
  // Strip corporate suffixes — keeps the meaningful brand stem
  const stripped = base.replace(CORP_SUFFIX_RE, "").replace(/\s+/g, " ").trim();
  if (stripped && stripped !== base && stripped.split(/\s+/).length >= 2) {
    variants.add(stripped);
  }
  // Strip non-ASCII diacritics (İ → I, ç → c, ş → s, ğ → g, ö → o, ü → u, etc)
  const ascii = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ü/g, "U").replace(/ü/g, "u");
  if (ascii !== base) variants.add(ascii);
  // Add caller-provided aliases verbatim
  for (const a of aliases ?? []) {
    const t = a.trim();
    if (t) variants.add(t);
  }
  // Cap fan-out so we don't hammer GDELT (max 6 variants total)
  return Array.from(variants).slice(0, 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// GDELT helpers
// ─────────────────────────────────────────────────────────────────────────────

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string; // "20250501T120000Z"
  domain?: string;
  tone?: number;
  relevance?: number;
  socialimage?: string;
}

function gdeltDate(seendate: string | undefined): string {
  if (!seendate) return new Date().toISOString();
  const m = seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return seendate;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

// Infer broad categories from title/domain text
function inferCategories(title: string, domain: string): string[] {
  const text = (title + " " + domain).toLowerCase();
  const cats: string[] = [];
  if (/sanction|ofac|sdn|designation/.test(text)) cats.push("sanctions");
  if (/fraud|scam|ponzi|embezzl/.test(text)) cats.push("fraud");
  if (/money.launder|aml|ml\b/.test(text)) cats.push("money_laundering");
  if (/corrupt|brib/.test(text)) cats.push("corruption");
  if (/arrest|indict|convict|guilty|prosecut/.test(text)) cats.push("law_enforcement");
  if (/investigat/.test(text)) cats.push("investigation");
  if (/terror|militant/.test(text)) cats.push("terrorism");
  if (/crypto|bitcoin|virtual.asset/.test(text)) cats.push("crypto");
  if (/gold|silver|precious|dpms/.test(text)) cats.push("dpms");
  if (cats.length === 0) cats.push("adverse_media");
  return cats;
}

// Delegates to the shared GDELT cache layer (web/lib/intelligence/gdelt-cache).
// All retry/timeout/Redis logic lives there now — keeping a second copy in this
// route was the SPOF: a GDELT outage knocked out both adverse-media-live and
// any other call site simultaneously. The cache also serves stale results on
// upstream failure (tagged stale=true), which previously surfaced as a hard
// "service unavailable" response here.
//
// We no longer pass a customQuery override. Without it, fetchGdeltCached() runs
// the full parallel multi-query strategy from gdelt-cache.ts: 11 simultaneous
// GDELT queries covering English risk categories PLUS native-script multilingual
// queries (Arabic, Russian/Cyrillic, Spanish/Portuguese, CJK). This gives ~5×
// the article coverage of the old single-English-query approach at zero added
// latency — all queries fire in parallel via Promise.allSettled.
async function queryGdelt(subjectName: string): Promise<{ articles: GdeltArticle[]; serviceError: boolean; stale?: boolean }> {
  const cached = await fetchGdeltCached(subjectName);
  return {
    articles: cached.articles,
    serviceError: cached.serviceError,
    stale: cached.stale,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk scoring
// ─────────────────────────────────────────────────────────────────────────────

function computeRiskScore(
  articles: GdeltArticle[],
  totalHits: number,
): number {
  if (totalHits === 0) return 0;

  // Hit volume weight (0-40 pts)
  const hitScore = Math.min(40, totalHits * 4);

  // Average negative tone (0-40 pts) — GDELT tone ranges roughly -10 to +10
  const tones = articles.map((a) => a.tone ?? 0).filter((t) => t < 0);
  const avgNegTone = tones.length > 0 ? tones.reduce((s, t) => s + t, 0) / tones.length : 0;
  const toneScore = Math.min(40, Math.abs(avgNegTone) * 4);

  // Recency (0-20 pts) — count articles in last 24h
  const oneDayAgo = Date.now() - 86_400_000;
  const recentCount = articles.filter((a) => {
    if (!a.seendate) return false;
    return new Date(gdeltDate(a.seendate)).getTime() > oneDayAgo;
  }).length;
  const recencyScore = Math.min(20, recentCount * 5);

  return Math.min(100, Math.round(hitScore + toneScore + recencyScore));
}

function scoreToRating(score: number): AdverseMediaLiveResult["riskRating"] {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 10) return "low";
  return "clear";
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude enrichment (optional)
// ─────────────────────────────────────────────────────────────────────────────

async function enrichWithClaude(
  subjectName: string,
  entityType: string | undefined,
  articles: AdverseMediaLiveResult["articles"],
  riskScore: number,
  riskRating: string,
): Promise<{ summary: string; articlesWithCategories: AdverseMediaLiveResult["articles"]; enriched: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || articles.length === 0) {
    return { summary: buildFallbackSummary(subjectName, articles, riskScore, riskRating), articlesWithCategories: articles, enriched: false };
  }

  const client = getAnthropicClient(apiKey, 4_500);

  const articleSummaries = articles
    .slice(0, 8)
    .map((a, i) => {
      // Defensive: GDELT can return articles without a tone, even though our
      // mapper defaults to 0. Don't assume a number.
      const tone = typeof a.tone === "number" && Number.isFinite(a.tone) ? a.tone : 0;
      return `[${i + 1}] "${a.title}" (${a.source}, tone: ${tone.toFixed(1)})`;
    })
    .join("\n");

  const systemPrompt = `You are an AML compliance analyst at a UAE-regulated financial institution.
Your task is to analyse adverse media results from GDELT for a named subject.
Respond ONLY with valid JSON matching this exact schema, no commentary:
{
  "summary": "string (2-4 sentences, professional AML tone, cite FATF R.10 and FDL 10/2025 Art.10)",
  "articleCategories": [
    {"index": 1, "categories": ["sanctions","fraud",...]}
  ]
}
Categories must be from: sanctions, fraud, money_laundering, corruption, law_enforcement, investigation, terrorism, crypto, dpms, adverse_media, regulatory_action, asset_seizure, political_risk`;

  const userPrompt = `Subject: "${subjectName}"${entityType ? ` (${entityType})` : ""}
Risk Score: ${riskScore}/100 (${riskRating})
Articles found:\n${articleSummaries}

Generate the JSON response.`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = (msg.content.find(b => b.type === "text") as { text: string } | undefined)?.text ?? "";
    // Extract JSON from response — null match goes through the catch
    // below as "no JSON in response", never as a TypeError.
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch?.[0]) throw new Error("Claude returned no JSON object");

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      articleCategories?: Array<{ index: number; categories: string[] }>;
    };

    // Validate articleCategories shape before consuming — Claude can
    // occasionally drop the categories field or return malformed entries.
    const catMap = new Map<number, string[]>();
    if (Array.isArray(parsed.articleCategories)) {
      for (const ac of parsed.articleCategories) {
        if (!ac || typeof ac.index !== "number") continue;
        const cats = Array.isArray(ac.categories)
          ? ac.categories.filter((c): c is string => typeof c === "string")
          : [];
        catMap.set(ac.index, cats);
      }
    }

    const enrichedArticles = articles.map((a, i) => ({
      ...a,
      categories: catMap.get(i + 1) ?? a.categories,
    }));

    return {
      summary: parsed.summary ?? buildFallbackSummary(subjectName, articles, riskScore, riskRating),
      articlesWithCategories: enrichedArticles,
      enriched: true,
    };
  } catch (err) {
    // Claude enrichment failed — return regex-inferred categories only.
    // Mark enriched:false so callers can surface a degradation note to operators:
    // regex categories are shallow (keyword presence) and may misclassify articles
    // where adverse keywords appear in a denying/counter context.
    console.warn("[adverse-media-live] Claude enrichment failed, using regex categories:", err instanceof Error ? err.message : String(err));
    return {
      summary: buildFallbackSummary(subjectName, articles, riskScore, riskRating),
      articlesWithCategories: articles,
      enriched: false,
    };
  }
}

function buildFallbackSummary(
  subjectName: string,
  articles: AdverseMediaLiveResult["articles"],
  riskScore: number,
  riskRating: string,
): string {
  if (articles.length === 0) {
    return `No adverse media identified for "${subjectName}" across the multi-source adverse-media corpus (lifetime — GDELT + 12 vendor feeds, FDL 10/2025 Art.19). Ongoing monitoring per FATF R.10 and FDL 10/2025 Art.10 continues; document this negative finding to the Art.19 audit log.`;
  }
  const sourceList = [...new Set(articles.slice(0, 3).map((a) => a.source))].join(", ");
  return `Adverse media search for "${subjectName}" returned ${articles.length} article(s) (risk score: ${riskScore}/100 — ${riskRating}). ` +
    `Sources include: ${sourceList}. ` +
    `Per FATF R.10 and FDL 10/2025 Art.10, these findings require review as part of ongoing CDD monitoring. ` +
    `Escalate to MLRO if any sanctioned-entity or predicate-offence nexus is confirmed.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback result
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK: Omit<AdverseMediaLiveResult, "subject"> = {
  ok: true,
  totalHits: 0,
  riskScore: 0,
  riskRating: "clear",
  articles: [],
  summary: "No adverse media found in GDELT index for this subject.",
  regulatoryBasis: "FATF R.10 (CDD), FDL 10/2025 Art.10 (ongoing monitoring)",
};

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-api-key",
    },
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: AdverseMediaLiveBody;
  try {
    body = (await req.json()) as AdverseMediaLiveBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400, headers: gate.headers }
    );
  }

  const subjectName = sanitizeField(body.subjectName?.trim() ?? "", 300) || undefined;
  if (!subjectName) {
    return NextResponse.json(
      { ok: false, error: "subjectName is required" },
      { status: 400, headers: gate.headers }
    );
  }

  const variants = generateNameVariants(subjectName, body.aliases);

  const sourcesFailed: Array<{ name: string; error: string }> = [];
  const sourcesSucceeded: string[] = [];

  // Fan-out GDELT queries — each name variant wrapped independently so a
  // timeout on one variant cannot abort the others. Each variant routes
  // through the GDELT cache layer (memory → Redis → live).
  // GKG query runs in parallel with the DOC fan-out — independent timeout (5s),
  // failure is non-blocking.
  const rawArticles: GdeltArticle[] = [];
  const [gdeltSettled, gkgResult] = await Promise.all([
    Promise.allSettled(variants.map((v) => queryGdelt(v))),
    queryGdeltGkg(subjectName).catch(() => null),
  ]);

  const seenGdeltUrls = new Set<string>();
  let anyGdeltSucceeded = false;
  let anyStale = false;
  for (const result of gdeltSettled) {
    if (result.status === "fulfilled" && !result.value.serviceError) {
      anyGdeltSucceeded = true;
      if (result.value.stale) anyStale = true;
      for (const a of result.value.articles) {
        const key = (a.url ?? "").toLowerCase();
        if (!key || seenGdeltUrls.has(key)) continue;
        seenGdeltUrls.add(key);
        rawArticles.push(a);
      }
    } else if (result.status === "fulfilled" && result.value.stale && result.value.articles.length > 0) {
      // Live failed, cache layer returned stale data — count this as a
      // partial success (we have *something* to reason about) but flag it.
      anyStale = true;
      for (const a of result.value.articles) {
        const key = (a.url ?? "").toLowerCase();
        if (!key || seenGdeltUrls.has(key)) continue;
        seenGdeltUrls.add(key);
        rawArticles.push(a);
      }
    }
  }
  let gdeltStatus: "ok" | "stale" | "timeout" | "unavailable";
  if (anyGdeltSucceeded && !anyStale) {
    gdeltStatus = "ok";
    sourcesSucceeded.push("gdelt");
  } else if (anyGdeltSucceeded && anyStale) {
    gdeltStatus = "stale";
    sourcesSucceeded.push("gdelt (stale cache)");
  } else if (anyStale && rawArticles.length > 0) {
    gdeltStatus = "stale";
    sourcesSucceeded.push("gdelt (stale cache only)");
    sourcesFailed.push({ name: "gdelt-live", error: "GDELT live API unavailable — serving last-known cached results" });
  } else {
    gdeltStatus = "timeout";
    sourcesFailed.push({ name: "gdelt", error: "GDELT API timed out or unavailable — results may be incomplete" });
  }

  // Map GDELT articles to our schema
  const articles: AdverseMediaLiveResult["articles"] = rawArticles.map((a) => ({
    title: a.title ?? "",
    source: a.domain ?? "GDELT",
    url: a.url ?? "",
    publishedAt: gdeltDate(a.seendate),
    tone: a.tone ?? 0,
    relevanceScore: a.relevance != null ? Math.round(a.relevance * 100) : 50,
    categories: inferCategories(a.title ?? "", a.domain ?? ""),
    snippet: "", // GDELT artlist mode doesn't return snippets
  }));

  // Vendor adapters (NewsAPI, MarketAux, GNews, Mediastack, etc.) wrapped
  // independently from GDELT — a GDELT failure cannot cascade here.
  // Each adapter is env-key gated; absent keys degrade to no-op.
  let vendorProviders: string[] = [];
  const vendorSettled = await Promise.allSettled([searchAllNews(subjectName, { limit: 25 })]);
  if (vendorSettled[0]!.status === "fulfilled") {
    const { articles: vendorArticles, providersUsed } = vendorSettled[0].value;
    vendorProviders = providersUsed;
    const seen = new Set(articles.map((a) => a.url.toLowerCase()));
    for (const va of vendorArticles) {
      const key = va.url.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      articles.push({
        title: va.title,
        source: va.outlet || va.source,
        url: va.url,
        publishedAt: va.publishedAt,
        tone: typeof va.sentiment === "number" ? va.sentiment : 0,
        relevanceScore: 60,
        categories: inferCategories(va.title, va.outlet || va.source),
        snippet: va.snippet ?? "",
      });
    }
    if (providersUsed.length > 0) {
      sourcesSucceeded.push(...providersUsed);
    }
  } else {
    const errMsg = vendorSettled[0].reason instanceof Error
      ? vendorSettled[0].reason.message
      : String(vendorSettled[0].reason);
    console.warn("[adverse-media-live] vendor news augmentation failed:", errMsg);
    sourcesFailed.push({ name: "vendor-news", error: errMsg });
  }

  const partialResults = sourcesFailed.length > 0 && sourcesSucceeded.length > 0;

  // Return 503 only when ALL sources failed — a partial result is still actionable.
  if (sourcesSucceeded.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        degraded: true,
        subject: subjectName,
        gdeltStatus,
        adverseMedia: {
          gdelt: {
            results: [],
            status: gdeltStatus,
            message: "GDELT unavailable at screening time — results may be incomplete. Manual MLRO review required.",
          },
        },
        sourcesFailed,
        sourcesSucceeded,
        error: "Adverse media services temporarily unavailable — GDELT rate-limited and no vendor API keys configured. Cannot confirm clear status. Manual MLRO review required before any compliance decision.",
      },
      { status: 503, headers: gate.headers },
    );
  }

  if (articles.length === 0) {
    // When GDELT could not complete (timeout/unavailable), returning "clear" is
    // a false-clear: the search did not succeed so we cannot assert no findings.
    // Use "unknown" to force MLRO review. Only return "clear" when all sources
    // succeeded and genuinely found nothing (FATF R.10 / FDL 10/2025 Art.19).
    const emptyRiskRating: AdverseMediaLiveResult["riskRating"] =
      gdeltStatus === "ok" ? "clear" : "unknown";
    const emptySummary =
      gdeltStatus === "ok"
        ? FALLBACK.summary
        : `Adverse media search for "${subjectName}" could not be completed — GDELT was ${gdeltStatus === "timeout" ? "unavailable" : "returning stale data"} at screening time. Cannot confirm clear status. Manual MLRO review required per FDL 10/2025 Art.19.`;
    return NextResponse.json({
      ...FALLBACK,
      riskRating: emptyRiskRating,
      summary: emptySummary,
      subject: subjectName,
      gdeltStatus,
      ...(gdeltStatus !== "ok" ? {
        adverseMedia: {
          gdelt: {
            results: [],
            status: gdeltStatus,
            message: gdeltStatus === "timeout"
              ? "GDELT unavailable at screening time — results may be incomplete. Risk rating set to UNKNOWN — manual review required."
              : `GDELT cache stale at screening time — results may not reflect recent news. Risk rating set to UNKNOWN.`,
          },
        },
      } : {}),
      sourcesSucceeded,
      sourcesFailed,
      ...(partialResults ? { partialResults: true } : {}),
    }, { headers: gate.headers });
  }

  // Sort by tone ascending (most negative first)
  articles.sort((a, b) => a.tone - b.tone);

  const aggregatedTotal = articles.length;
  const riskScore = computeRiskScore(rawArticles, aggregatedTotal);
  const riskRating = scoreToRating(riskScore);

  // Optionally enrich with Claude
  const safeEntityType = body.entityType != null ? sanitizeField(body.entityType, 100) : undefined;
  const { summary, articlesWithCategories, enriched } = await enrichWithClaude(
    subjectName,
    safeEntityType,
    articles,
    riskScore,
    riskRating,
  );

  // GKG metadata — attach crime themes and tone flag if present
  const metadata: Record<string, unknown> = {};
  if (gkgResult?.crimeThemes.length) {
    metadata.gdeltGkgThemes = gkgResult.crimeThemes;
    // If tone is very negative (< -5) and crime themes present, escalate to high risk
    if (gkgResult.averageTone < -5) {
      metadata.gdeltGkgToneFlag = "negative";
    }
  }

  const latencyMs = Date.now() - t0;
  if (latencyMs > 5000) console.warn(`[adverse-media-live] slow response latencyMs=${latencyMs}`);
  const result = {
    ok: true as const,
    subject: subjectName,
    totalHits: aggregatedTotal,
    riskScore,
    riskRating,
    articles: articlesWithCategories,
    summary,
    regulatoryBasis: "FATF R.10 (CDD), FDL 10/2025 Art.10 (ongoing monitoring)",
    enriched,
    gdeltStatus,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(gdeltStatus !== "ok" ? {
      adverseMedia: {
        gdelt: {
          results: articlesWithCategories.filter((a) => a.source?.includes("GDELT") || a.source?.toLowerCase().includes("gdelt")),
          status: gdeltStatus,
          message: gdeltStatus === "stale"
            ? "GDELT results served from stale cache — may not reflect news from the last 6+ hours"
            : "GDELT live feed unavailable — results from cached or vendor sources only",
        },
      },
    } : {}),
    sourcesSucceeded,
    sourcesFailed,
    latencyMs,
    ...(partialResults ? { partialResults: true } : {}),
    ...(vendorProviders.length > 0 ? { vendorProviders } : {}),
    ...(enriched === false
      ? { enrichmentNote: "Claude enrichment unavailable — article categories are regex-inferred only. Review findings manually for nuance." }
      : {}),
  };

  void writeAuditChainEntry({ event: "adverse_media_live.completed", actor: gate.keyId, subjectName, riskRating, riskScore, totalHits: aggregatedTotal }, tenant).catch(() => {});
  return NextResponse.json(result, { headers: gate.headers });
}
