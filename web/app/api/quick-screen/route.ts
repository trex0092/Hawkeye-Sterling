import { NextResponse } from "next/server";
import type {
  QuickScreenCandidate,
  QuickScreenOptions,
  QuickScreenResponse,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";
import { enforce } from "@/lib/server/enforce";
import { loadCandidates } from "@/lib/server/candidates-loader";
import { LIVE_OPENSANCTIONS_ADAPTER } from "@/lib/intelligence/liveAdapters";
import { bestCommercialAdapter, activeCommercialProvider } from "@/lib/intelligence/commercialAdapters";
import { searchAllRegistries } from "@/lib/intelligence/registryAdapters";
import { searchCountryRegistries } from "@/lib/intelligence/countryRegistries";
import { searchCountrySanctions } from "@/lib/intelligence/countrySanctions";
import { searchFreeAdapters } from "@/lib/intelligence/freeAlwaysOnAdapters";
import {
  buildScreeningReasoning,
  buildConsensusInputsFromAugmentation,
  buildCoverageGapReport,
} from "@/lib/intelligence/screeningReasoning";
import { activeNewsProviders } from "@/lib/intelligence/newsAdapters";
import { activeCommercialProviders } from "@/lib/intelligence/commercialAdapters";
import { activeRegistryProviders } from "@/lib/intelligence/registryAdapters";
import { activeKycProviders } from "@/lib/intelligence/kycVendorAdapters";
import { activeOnChainProviders } from "@/lib/intelligence/liveAdapters";
import { activeFreeProviders } from "@/lib/intelligence/freeAlwaysOnAdapters";
import { searchAllNews } from "@/lib/intelligence/newsAdapters";
import { ingestUrls } from "@/lib/intelligence/urlIngestion";
import { llmAdverseMediaAdapter } from "@/lib/intelligence/llmAdverseMedia";
import { assessCommonName } from "@/lib/intelligence/commonNames";
import {
  runEnrichmentAdapters,
  activeEnrichmentProviders,
  type EnrichmentHints,
  type EnrichmentBundle,
} from "@/lib/intelligence/publicApiAdapters";

// Compiled backend entry point. The root `tsc` build (npm run build at the repo root)
// must run before this API route is bundled. Netlify build order is encoded in
// netlify.toml; local dev runs `npm run build` at the root once to produce dist/.
// @brain/* is resolved via web/tsconfig.json paths → ../dist/src/brain/*.
import { quickScreen as brainQuickScreen } from "@brain/quick-screen.js";

type QuickScreenFn = (
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
  options?: QuickScreenOptions,
) => QuickScreenResult;

const quickScreen = brainQuickScreen as QuickScreenFn;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface QuickScreenRequestBody {
  subject?: QuickScreenSubject;
  candidates?: QuickScreenCandidate[];
  options?: QuickScreenOptions;
  evidenceUrls?: string[];        // operator-provided adverse-media URLs to ingest as evidence
  enrichmentHints?: EnrichmentHints; // email/phone/IP/wallet/URL for API enrichment adapters
}

const MAX_CANDIDATES = 5_000;

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
  // Screening results must never be cached — stale hits or stale CLEAR
  // verdicts are a compliance failure. Set this explicitly rather than
  // relying solely on the force-dynamic export above.
  "cache-control": "no-store, no-cache, must-revalidate",
  vary: "Origin",
};

function respond(
  status: number,
  body: QuickScreenResponse,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(body, { status, headers: { ...CORS_HEADERS, ...headers } });
}

export async function POST(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  let body: QuickScreenRequestBody;
  try {
    body = (await req.json()) as QuickScreenRequestBody;
  } catch {
    return respond(400, { ok: false, error: "invalid JSON body" }, gateHeaders);
  }

  const subject = body.subject;
  // If the caller supplies candidates use them; otherwise screen against the
  // live ingested watchlists (OFAC, UN, EU, UK, UAE-EOCN/LTL + seed corpus).
  const callerCandidates = body.candidates;

  if (!subject || typeof subject.name !== "string" || !subject.name.trim()) {
    return respond(400, { ok: false, error: "subject.name required" }, gateHeaders);
  }
  if (subject.name.length > 512) {
    return respond(400, { ok: false, error: "subject.name exceeds 512-character limit" }, gateHeaders);
  }

  let candidates: QuickScreenCandidate[];
  if (Array.isArray(callerCandidates)) {
    if (callerCandidates.length > MAX_CANDIDATES) {
      return respond(
        400,
        { ok: false, error: `candidates exceeds ${MAX_CANDIDATES}-entry limit` },
        gateHeaders,
      );
    }
    candidates = callerCandidates;
  } else {
    // No candidates provided → use the live watchlist corpus.
    try {
      const loaded = await loadCandidates();
      // Validate shape at runtime — a corrupt blob/static fixture must NOT
      // silently propagate into the matcher and produce nonsense hits.
      if (!Array.isArray(loaded)) {
        return respond(503, { ok: false, error: "watchlist corpus unavailable", detail: "loadCandidates returned non-array" }, gateHeaders);
      }
      candidates = loaded.filter(
        (c): c is QuickScreenCandidate =>
          !!c && typeof c === "object" &&
          typeof (c as QuickScreenCandidate).listId === "string" &&
          typeof (c as QuickScreenCandidate).listRef === "string" &&
          typeof (c as QuickScreenCandidate).name === "string",
      );
      if (candidates.length === 0) {
        // Empty corpus means CLEAR would be returned for every subject — that
        // is a safety failure. Return a structured LISTS_MISSING error.
        return respond(503, {
          ok: false,
          errorCode: "LISTS_MISSING",
          errorType: "data_integrity",
          tool: "screen_subject",
          missingLists: ["ofac_sdn", "un_consolidated", "eu_fsf", "uk_ofsi", "uae_eocn", "uae_ltl"],
          degraded: true,
          message: "Screening cannot proceed: one or more required sanctions lists are not loaded. Run sanctions refresh and retry.",
          requestId: Math.random().toString(36).slice(2, 10),
        } as QuickScreenResponse & { errorCode: string; errorType: string; tool: string; missingLists: string[]; degraded: boolean; message: string; requestId: string }, gateHeaders);
      }

      // Verify that the two most critical lists (OFAC SDN and UN Consolidated) are
      // represented in the loaded corpus. If both are absent it means the cron has
      // not run yet and only the static seed is present — block to prevent false CLEARs.
      const loadedListIds = new Set(candidates.map((c) => c.listId));
      const criticalLists = ["ofac_sdn", "un_consolidated"] as const;
      const missingCritical = criticalLists.filter((id) => !loadedListIds.has(id));
      if (missingCritical.length === criticalLists.length) {
        // Neither critical list is present — refuse to screen.
        return respond(503, {
          ok: false,
          errorCode: "LISTS_MISSING",
          errorType: "data_integrity",
          tool: "screen_subject",
          missingLists: missingCritical,
          degraded: true,
          message: "Screening cannot proceed: one or more required sanctions lists are not loaded. Run sanctions refresh and retry.",
          requestId: Math.random().toString(36).slice(2, 10),
        } as QuickScreenResponse & { errorCode: string; errorType: string; tool: string; missingLists: string[]; degraded: boolean; message: string; requestId: string }, gateHeaders);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[quick-screen] loadCandidates failed", detail);
      return respond(503, {
        ok: false,
        errorCode: "LISTS_MISSING",
        errorType: "data_integrity",
        tool: "screen_subject",
        missingLists: ["ofac_sdn", "un_consolidated"],
        degraded: true,
        message: "Screening cannot proceed: watchlist corpus unavailable. Run sanctions refresh and retry.",
        detail,
        requestId: Math.random().toString(36).slice(2, 10),
      } as QuickScreenResponse & { errorCode: string; errorType: string; tool: string; missingLists: string[]; degraded: boolean; message: string; detail: string; requestId: string }, gateHeaders);
    }
  }

  try {
    // Common-name detection — when subject name is in the high-frequency
    // registry (Mohamed Ali, John Smith, Wang, Kim, etc.) we expand every
    // hit cap so the operator can triage the FULL candidate population.
    // Unique names stay at the tight default for performance.
    const cna = assessCommonName(subject.name);
    const isCommonName = cna.isCommon;
    const HIT_LIMIT_LOCAL = isCommonName ? 200 : 25;          // brain quickScreen
    const HIT_LIMIT_AUG_HIGH = isCommonName ? 100 : 15;        // per-vendor cap
    const HIT_LIMIT_AUG_LOW = isCommonName ? 100 : 10;
    const ADAPTER_QUERY_LIMIT = isCommonName ? 100 : 25;       // passed into adapters

    const screenOptions = {
      ...(body.options ?? {}),
      maxHits: body.options?.maxHits ?? HIT_LIMIT_LOCAL,
    };
    const result = quickScreen(subject, candidates, screenOptions);
    // Augment with OpenSanctions live results when local matcher returns
    // few/no hits — adds a free additional signal layer beyond the bundled
    // watchlists. Best-effort: failure here doesn't 5xx the screening.
    // All augmentation layers are independent — kick every promise off at
    // once and await them together so they run in parallel, not serially.
    const commAdapter = bestCommercialAdapter();
    const llmAdapter = llmAdverseMediaAdapter({
      jurisdiction: subject.jurisdiction,
      entityType: subject.entityType,
    });
    const warn = (err: unknown) => console.warn("[hawkeye] quick-screen: best-effort adapter failed:", err);
    const canAug = subject.name.length >= 3;
    const hitGated = (result.hits.length < 3 || isCommonName) && canAug;

    type OSResult   = Awaited<ReturnType<typeof LIVE_OPENSANCTIONS_ADAPTER.lookup>>;
    type CommResult = Awaited<ReturnType<ReturnType<typeof bestCommercialAdapter>["lookup"]>>;
    type RegResult  = Awaited<ReturnType<typeof searchAllRegistries>>;
    type CRegResult = Awaited<ReturnType<typeof searchCountryRegistries>>;
    type CSanResult = Awaited<ReturnType<typeof searchCountrySanctions>>;
    type FreeResult = Awaited<ReturnType<typeof searchFreeAdapters>>;
    type NewsResult = Awaited<ReturnType<typeof searchAllNews>>;
    type LlmResult  = Awaited<ReturnType<typeof llmAdapter.search>>;

    // Per-adapter timeout: wrap each external lookup so any single slow
    // provider can't drag the whole screen past Netlify's 26s sync ceiling.
    // 4s was chosen because the 95th percentile for a healthy adapter is
    // ~2.5s; anything beyond that is almost certainly a transient hang
    // from a third-party that we'd rather degrade than block on. Returning
    // the empty type matches the existing .catch fallback contract.
    const ADAPTER_TIMEOUT_MS = 4_000;
    const adapterTimeout = <T>(p: Promise<T>, fallback: T): Promise<T> => {
      let to: NodeJS.Timeout | null = null;
      const timeoutP = new Promise<T>((resolve) => {
        to = setTimeout(() => { warn("adapter timeout >4s"); resolve(fallback); }, ADAPTER_TIMEOUT_MS);
      });
      return Promise.race([p, timeoutP]).finally(() => { if (to) clearTimeout(to); });
    };

    // Enrichment hints supplied by the caller (email / phone / IP / wallet / URL).
    // All six adapters run in parallel with the rest; each degrades gracefully
    // when the corresponding env key is absent or the hint field is missing.
    const hints: EnrichmentHints = body.enrichmentHints ?? {};
    const NULL_ENRICHMENT: EnrichmentBundle = {
      fraudShield: { available: false, reason: "no_key" },
    };

    const [
      openSanctionsResults, commercialResults, registryResults,
      countryRegistryResults, countrySanctionsResults, freeAdapterResults,
      rawNews, llmArts, enrichmentBundle,
    ] = await Promise.all([
      // Group A — hit-gated (only when local hits sparse or common name)
      hitGated ? adapterTimeout(LIVE_OPENSANCTIONS_ADAPTER.lookup(subject.name, subject.jurisdiction ?? undefined).catch((e): OSResult => { warn(e); return []; }), [] as OSResult) : Promise.resolve<OSResult>([]),
      hitGated && commAdapter.isAvailable() ? adapterTimeout(commAdapter.lookup(subject.name, subject.jurisdiction ?? undefined).catch((e): CommResult => { warn(e); return []; }), [] as CommResult) : Promise.resolve<CommResult>([]),
      hitGated ? adapterTimeout(searchAllRegistries(subject.name, subject.jurisdiction ? { jurisdiction: subject.jurisdiction, limit: ADAPTER_QUERY_LIMIT } : { limit: ADAPTER_QUERY_LIMIT }).catch((e): RegResult => { warn(e); return { records: [], providersUsed: [] }; }), { records: [], providersUsed: [] } as RegResult) : Promise.resolve<RegResult>({ records: [], providersUsed: [] }),
      // Group B — authoritative country sources, always run
      canAug ? adapterTimeout(searchCountryRegistries(subject.name, subject.jurisdiction ?? undefined, ADAPTER_QUERY_LIMIT).catch((e): CRegResult => { warn(e); return { records: [], jurisdictions: [] }; }), { records: [], jurisdictions: [] } as CRegResult) : Promise.resolve<CRegResult>({ records: [], jurisdictions: [] }),
      canAug ? adapterTimeout(searchCountrySanctions(subject.name, subject.jurisdiction ?? undefined, ADAPTER_QUERY_LIMIT).catch((e): CSanResult => { warn(e); return { records: [], lists: [] }; }), { records: [], lists: [] } as CSanResult) : Promise.resolve<CSanResult>({ records: [], lists: [] }),
      canAug ? adapterTimeout(searchFreeAdapters(subject.name, subject.jurisdiction ?? undefined, ADAPTER_QUERY_LIMIT).catch((e): FreeResult => { warn(e); return { records: [], providersUsed: [] }; }), { records: [], providersUsed: [] } as FreeResult) : Promise.resolve<FreeResult>({ records: [], providersUsed: [] }),
      // Group C — news velocity + LLM adverse-media recall
      canAug ? adapterTimeout(searchAllNews(subject.name, { limit: 50 }).catch((e): NewsResult => { warn(e); return { articles: [], providersUsed: [] }; }), { articles: [], providersUsed: [] } as NewsResult) : Promise.resolve<NewsResult>({ articles: [], providersUsed: [] }),
      canAug && llmAdapter.isAvailable() ? adapterTimeout(llmAdapter.search(subject.name, { limit: 15 }).catch((e): LlmResult => { warn(e); return []; }), [] as LlmResult) : Promise.resolve<LlmResult>([]),
      // Group D — public-API enrichment (IP / blockchain / breach / domain / phone / fraud)
      adapterTimeout(runEnrichmentAdapters(hints).catch((e): EnrichmentBundle => { warn(e); return NULL_ENRICHMENT; }), NULL_ENRICHMENT),
    ]);

    // Merge LLM adverse-media articles (prepend so they rank first)
    let newsArticles: NewsResult = llmArts.length > 0
      ? { articles: [...llmArts, ...rawNews.articles], providersUsed: [...rawNews.providersUsed, "claude-adverse-media"] }
      : rawNews;

    // URL-direct ingestion: when the operator passes evidenceUrls[]
    // the route fetches each URL, extracts metadata, and counts each
    // as adverse-media evidence. Bypasses the discovery problem when
    // the operator already knows the article (e.g. a niche outlet
    // GDELT didn't index).
    if (Array.isArray(body.evidenceUrls) && body.evidenceUrls.length > 0) {
      try {
        const ingested = await ingestUrls(body.evidenceUrls);
        if (ingested.length > 0) {
          newsArticles = {
            articles: [...ingested, ...newsArticles.articles],
            providersUsed: [...newsArticles.providersUsed, "url-ingest"],
          };
        }
      } catch (err) { console.warn("[hawkeye] quick-screen: best-effort adapter failed:", err); }
    }
    // ── Reasoning layer ────────────────────────────────────────────────
    // Multi-source consensus + contradiction + coverage gap + audit
    // rationale. Pure-function — never fails the screening even if
    // augmentation layers were partial.
    const commercialProvider = activeCommercialProvider();
    const coverage = buildCoverageGapReport({
      newsProvidersConfigured: activeNewsProviders().length,
      newsProvidersAvailable: 80, // approx vendor count in newsAdapters
      sanctionsConfigured: activeCommercialProviders().length,
      sanctionsAvailable: 18,
      registryConfigured: activeRegistryProviders().length,
      registryAvailable: 16,
      countryRegistryConfigured: countryRegistryResults.jurisdictions.length,
      countryRegistryAvailable: 40,
      countrySanctionsConfigured: countrySanctionsResults.lists.length,
      countrySanctionsAvailable: 11,
      kycConfigured: activeKycProviders().length,
      kycAvailable: 22,
      onchainConfigured: activeOnChainProviders().length,
      onchainAvailable: 8,
      freeConfigured: activeFreeProviders().length,
      freeAvailable: 6,
    });
    // Extract FraudShield signal for consensus layer
    const eb = enrichmentBundle;
    const enrichmentSignals = {
      fraudShieldScore: eb.fraudShield.available ? eb.fraudShield.riskScore : undefined,
      fraudShieldRisk: eb.fraudShield.available ? eb.fraudShield.normalisedRisk : null,
      fraudShieldFlags: eb.fraudShield.available ? eb.fraudShield.flags : undefined,
      activeProviders: activeEnrichmentProviders(eb),
    };

    const { consensusInputs, contradictionItems } = buildConsensusInputsFromAugmentation({
      hits: result.hits,
      openSanctionsCount: openSanctionsResults.length,
      commercialCount: commercialResults.length,
      commercialProvider,
      registryCount: registryResults.records.length,
      registryProviders: registryResults.providersUsed,
      countryRegistryCount: countryRegistryResults.records.length,
      countryRegistryJurisdictions: countryRegistryResults.jurisdictions,
      countrySanctionsCount: countrySanctionsResults.records.length,
      countrySanctionsLists: countrySanctionsResults.lists,
      freeProviders: freeAdapterResults.providersUsed,
      freeCount: freeAdapterResults.records.length,
      adverseMediaArticles: newsArticles.articles.map((a) => ({
        source: a.source, outlet: a.outlet, title: a.title, url: a.url,
      })),
      enrichmentSignals,
    });
    const reasoning = buildScreeningReasoning({
      subject,
      result,
      consensusInputs,
      contradictionItems,
      coverage,
      articles: newsArticles.articles.map((a) => ({
        publishedAt: a.publishedAt,
        source: a.source,
        outlet: a.outlet,
        title: a.title,
      })),
      coOccurrenceArticles: newsArticles.articles.map((a) => ({
        title: a.title,
        snippet: a.snippet,
        url: a.url,
      })),
      knownSanctioned: result.hits.map((h) => ({ name: h.candidateName, listId: h.listId })),
    });

    return respond(
      200,
      {
        ok: true,
        ...result,
        reasoning,
        ...(openSanctionsResults.length > 0
          ? { openSanctionsAugmentation: openSanctionsResults.slice(0, HIT_LIMIT_AUG_LOW) }
          : {}),
        ...(commercialResults.length > 0
          ? {
              commercialAugmentation: commercialResults.slice(0, HIT_LIMIT_AUG_LOW),
              commercialProvider: activeCommercialProvider(),
            }
          : {}),
        ...(registryResults.records.length > 0
          ? {
              registryAugmentation: registryResults.records.slice(0, HIT_LIMIT_AUG_HIGH),
              registryProviders: registryResults.providersUsed,
            }
          : {}),
        ...(countryRegistryResults.records.length > 0
          ? {
              countryRegistryAugmentation: countryRegistryResults.records.slice(0, HIT_LIMIT_AUG_HIGH),
              countryRegistryJurisdictions: countryRegistryResults.jurisdictions,
            }
          : {}),
        ...(countrySanctionsResults.records.length > 0
          ? {
              countrySanctionsAugmentation: countrySanctionsResults.records.slice(0, HIT_LIMIT_AUG_HIGH),
              countrySanctionsLists: countrySanctionsResults.lists,
            }
          : {}),
        ...(freeAdapterResults.records.length > 0
          ? {
              freeAdapterAugmentation: freeAdapterResults.records.slice(0, HIT_LIMIT_AUG_HIGH),
              freeAdapterProviders: freeAdapterResults.providersUsed,
            }
          : {}),
        // FraudShield enrichment signal
        ...(eb.fraudShield.available
          ? { fraudShield: eb.fraudShield }
          : {}),
        // Tell the operator UI whether common-name expansion fired so the
        // triage panel can show the appropriate banner.
        commonNameExpansion: isCommonName,
        latencyMs: Date.now() - t0,
      } as QuickScreenResponse,
      gateHeaders,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (Date.now() - t0 > 5000) console.warn(`[quick-screen] slow response latencyMs=${Date.now() - t0}`);
    return respond(
      500,
      { ok: false, errorCode: "HANDLER_EXCEPTION", errorType: "internal", tool: "screen_subject", error: "quick-screen failed", detail, requestId: Math.random().toString(36).slice(2, 10), latencyMs: Date.now() - t0 } as QuickScreenResponse & { errorCode: string; errorType: string; tool: string; requestId: string; latencyMs: number },
      gateHeaders,
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
