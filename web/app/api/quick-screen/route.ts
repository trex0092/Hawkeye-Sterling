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
import { lookupWhitelist } from "@/lib/server/whitelist";
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
import { groqAdverseMediaAdapter, geminiAdverseMediaAdapter } from "@/lib/intelligence/llmAdverseMediaAlt";
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

// ── Sanctions list health snapshot ─────────────────────────────────────────
// Attached to every screening response so audit records capture which lists
// had data (and how fresh) at the moment of screening. A "clear" verdict
// against empty UAE lists is a compliance failure — not a real clear.

const LIST_IDS = [
  "un_consolidated", "ofac_sdn", "ofac_cons", "eu_fsf", "uk_ofsi",
  "ca_osfi", "ch_seco", "au_dfat", "fatf", "uae_eocn", "uae_ltl",
] as const;

type ListHealthStatus = "healthy" | "stale" | "missing";

interface ListHealthEntry {
  entityCount: number | null;
  ageHours: number | null;
  status: ListHealthStatus;
}

type ListHealthSnapshot = Record<string, ListHealthEntry>;

async function fetchListHealth(): Promise<ListHealthSnapshot> {
  const STALE_HOURS = 36;
  const HOUR_MS = 3_600_000;
  const snapshot: ListHealthSnapshot = {};

  let store: { get: (key: string, opts?: { type?: string }) => Promise<unknown> } | null = null;
  try {
    const { getStore } = await import("@netlify/blobs");
    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token =
      process.env["NETLIFY_BLOBS_TOKEN"] ??
      process.env["NETLIFY_API_TOKEN"] ??
      process.env["NETLIFY_AUTH_TOKEN"];
    store = siteID && token
      ? getStore({ name: "hawkeye-lists", siteID, token, consistency: "strong" })
      : getStore({ name: "hawkeye-lists" });
  } catch {
    for (const id of LIST_IDS) {
      snapshot[id] = { entityCount: null, ageHours: null, status: "missing" };
    }
    return snapshot;
  }

  await Promise.all(LIST_IDS.map(async (listId) => {
    try {
      const raw = await store!.get(`${listId}/latest.json`, { type: "json" }) as {
        entities?: unknown[]; report?: { fetchedAt?: number }; fetchedAt?: number;
      } | null;
      if (!raw || !Array.isArray(raw.entities)) {
        snapshot[listId] = { entityCount: null, ageHours: null, status: "missing" };
        return;
      }
      const entityCount = raw.entities.length;
      const fetchedAtMs = raw.report?.fetchedAt ?? raw.fetchedAt ?? null;
      const ageHours = typeof fetchedAtMs === "number"
        ? Math.round((Date.now() - fetchedAtMs) / HOUR_MS * 10) / 10
        : null;
      const status: ListHealthStatus =
        ageHours !== null && ageHours > STALE_HOURS ? "stale" : "healthy";
      snapshot[listId] = { entityCount, ageHours, status };
    } catch {
      snapshot[listId] = { entityCount: null, ageHours: null, status: "missing" };
    }
  }));

  return snapshot;
}

function buildScreeningWarnings(health: ListHealthSnapshot): string[] {
  const warnings: string[] = [];
  for (const [listId, entry] of Object.entries(health)) {
    if (entry.status === "missing") {
      warnings.push(`${listId} list is missing from blob store at time of screening — no match possible against this list`);
    } else if (entry.entityCount === 0) {
      warnings.push(`${listId} had 0 entities at time of screening — no match possible against this list`);
    } else if (entry.status === "stale") {
      warnings.push(`${listId} data is stale (${entry.ageHours}h old) at time of screening — may not reflect recent designations`);
    }
  }
  return warnings;
}

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
  // Start list health check immediately — runs in parallel with auth + corpus
  // loading so it doesn't add latency to the critical path.
  const listHealthPromise = fetchListHealth().catch(() => null);

  // Require authentication — UAE FDL Art. 20 requires every screening
  // action to be traceable to a natural person. Anonymous screening (free
  // tier without an API key) leaves audit chain entries with no operator
  // identity. For a public demo, use the separate /api/demo/quick-screen
  // path (if added) which logs actor: "public-demo" explicitly.
  const gate = await enforce(req, { requireAuth: true });
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
  if (Array.isArray(subject.aliases) && subject.aliases.length > 50) {
    return respond(400, { ok: false, error: "aliases exceeds 50-entry limit" }, gateHeaders);
  }
  if (Array.isArray(body.evidenceUrls) && body.evidenceUrls.length > 20) {
    return respond(400, { ok: false, error: "evidenceUrls exceeds 20-entry limit" }, gateHeaders);
  }

  // Whitelist short-circuit — if the operator's tenant has previously
  // cleared this subject (false-positive disposition recorded via
  // /api/whitelist), skip the expensive list match and surface a clean
  // result with the original approver metadata attached. Anonymous /
  // portal-admin callers (record === null) skip this check.
  const tenantId = gate.record?.email;
  if (tenantId) {
    try {
      const match = await lookupWhitelist(tenantId, {
        name: subject.name,
        ...(subject.jurisdiction ? { jurisdiction: subject.jurisdiction } : {}),
      });
      if (match) {
        const whitelistedResult: QuickScreenResult = {
          subject,
          hits: [],
          topScore: 0,
          severity: "clear",
          listsChecked: 0,
          candidatesChecked: 0,
          durationMs: Date.now() - t0,
          generatedAt: new Date().toISOString(),
          whitelisted: {
            entryId: match.id,
            approvedBy: match.approvedBy,
            approverRole: match.approverRole,
            approvedAt: match.approvedAt,
            reason: match.reason,
          },
        };
        return respond(200, { ok: true, ...whitelistedResult }, gateHeaders);
      }
    } catch (err) {
      // Whitelist lookup failure must never block screening — degrade to
      // full list match. The MLRO sees the false-positive again, which is
      // the safe default if the whitelist store is unavailable.
      console.warn(
        "[quick-screen] whitelist lookup failed — falling through to full screen:",
        err instanceof Error ? err.message : err,
      );
    }
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
      console.error("[quick-screen] loadCandidates failed:", err instanceof Error ? err.message : String(err));
      return respond(503, {
        ok: false,
        errorCode: "LISTS_MISSING",
        errorType: "data_integrity",
        tool: "screen_subject",
        missingLists: ["ofac_sdn", "un_consolidated"],
        degraded: true,
        message: "Screening cannot proceed: watchlist corpus unavailable. Run sanctions refresh and retry.",
        requestId: Math.random().toString(36).slice(2, 10),
      } as QuickScreenResponse & { errorCode: string; errorType: string; tool: string; missingLists: string[]; degraded: boolean; message: string; requestId: string }, gateHeaders);
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

    // Hard 3-second SLA: if the enrichment adapters haven't resolved with
    // enough budget remaining, return the deterministic list-match result
    // immediately. Sanctions hits are always present (local match is O(1));
    // only the enrichment layer (news, registries, LLM) is deferred.
    // The client can re-poll for an enriched result if needed.
    const HARD_DEADLINE_MS = 2_800;
    const elapsedMs = Date.now() - t0;
    if (elapsedMs >= HARD_DEADLINE_MS - 100) {
      return respond(200, {
        ok: true, ...result,
        enrichmentPending: true,
        latencyMs: Date.now() - t0,
      } as QuickScreenResponse, gateHeaders);
    }
    // Budget remaining for the entire augmentation + response section.
    const augBudgetMs = Math.max(200, HARD_DEADLINE_MS - (Date.now() - t0) - 150);
    let _deadlineTimer: NodeJS.Timeout | null = null;
    const deadlineP = new Promise<"timeout">((resolve) => {
      _deadlineTimer = setTimeout(() => resolve("timeout"), augBudgetMs);
    });

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
    const groqAdapter = groqAdverseMediaAdapter();
    const geminiAdapter = geminiAdverseMediaAdapter();
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
    const ADAPTER_TIMEOUT_MS = 2_500;
    const adapterTimeout = <T>(p: Promise<T>, fallback: T): Promise<T> => {
      let to: NodeJS.Timeout | null = null;
      const timeoutP = new Promise<T>((resolve) => {
        to = setTimeout(() => { warn("adapter timeout >2.5s"); resolve(fallback); }, ADAPTER_TIMEOUT_MS);
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

    const augRace = await Promise.race([
      Promise.all([
      // Group A — hit-gated (only when local hits sparse or common name)
      hitGated ? adapterTimeout(LIVE_OPENSANCTIONS_ADAPTER.lookup(subject.name, subject.jurisdiction ?? undefined).catch((e): OSResult => { warn(e); return []; }), [] as OSResult) : Promise.resolve<OSResult>([]),
      hitGated && commAdapter.isAvailable() ? adapterTimeout(commAdapter.lookup(subject.name, subject.jurisdiction ?? undefined).catch((e): CommResult => { warn(e); return []; }), [] as CommResult) : Promise.resolve<CommResult>([]),
      hitGated ? adapterTimeout(searchAllRegistries(subject.name, subject.jurisdiction ? { jurisdiction: subject.jurisdiction, limit: ADAPTER_QUERY_LIMIT } : { limit: ADAPTER_QUERY_LIMIT }).catch((e): RegResult => { warn(e); return { records: [], providersUsed: [] }; }), { records: [], providersUsed: [] } as RegResult) : Promise.resolve<RegResult>({ records: [], providersUsed: [] }),
      // Group B — authoritative country sources, always run
      canAug ? adapterTimeout(searchCountryRegistries(subject.name, subject.jurisdiction ?? undefined, ADAPTER_QUERY_LIMIT).catch((e): CRegResult => { warn(e); return { records: [], jurisdictions: [] }; }), { records: [], jurisdictions: [] } as CRegResult) : Promise.resolve<CRegResult>({ records: [], jurisdictions: [] }),
      canAug ? adapterTimeout(searchCountrySanctions(subject.name, subject.jurisdiction ?? undefined, ADAPTER_QUERY_LIMIT).catch((e): CSanResult => { warn(e); return { records: [], lists: [] }; }), { records: [], lists: [] } as CSanResult) : Promise.resolve<CSanResult>({ records: [], lists: [] }),
      canAug ? adapterTimeout(searchFreeAdapters(subject.name, subject.jurisdiction ?? undefined, ADAPTER_QUERY_LIMIT).catch((e): FreeResult => { warn(e); return { records: [], providersUsed: [] }; }), { records: [], providersUsed: [] } as FreeResult) : Promise.resolve<FreeResult>({ records: [], providersUsed: [] }),
      // Group C — news velocity + LLM adverse-media recall (Claude + Groq + Gemini in parallel)
      canAug ? adapterTimeout(searchAllNews(subject.name, { limit: 50 }).catch((e): NewsResult => { warn(e); return { articles: [], providersUsed: [] }; }), { articles: [], providersUsed: [] } as NewsResult) : Promise.resolve<NewsResult>({ articles: [], providersUsed: [] }),
      canAug && llmAdapter.isAvailable() ? adapterTimeout(llmAdapter.search(subject.name, { limit: 15 }).catch((e): LlmResult => { warn(e); return []; }), [] as LlmResult) : Promise.resolve<LlmResult>([]),
      canAug && groqAdapter.isAvailable() ? adapterTimeout(groqAdapter.search(subject.name, { limit: 15 }).catch((e): LlmResult => { warn(e); return []; }), [] as LlmResult) : Promise.resolve<LlmResult>([]),
      canAug && geminiAdapter.isAvailable() ? adapterTimeout(geminiAdapter.search(subject.name, { limit: 15 }).catch((e): LlmResult => { warn(e); return []; }), [] as LlmResult) : Promise.resolve<LlmResult>([]),
      // Group D — public-API enrichment (IP / blockchain / breach / domain / phone / fraud)
      adapterTimeout(runEnrichmentAdapters(hints).catch((e): EnrichmentBundle => { warn(e); return NULL_ENRICHMENT; }), NULL_ENRICHMENT),
      ]).then((r) => r as [OSResult, CommResult, RegResult, CRegResult, CSanResult, FreeResult, NewsResult, LlmResult, LlmResult, LlmResult, EnrichmentBundle]),
      deadlineP,
    ]);
    if (_deadlineTimer) clearTimeout(_deadlineTimer);

    // If the deadline fired before adapters resolved, return fast-path result.
    if (augRace === "timeout") {
      return respond(200, {
        ok: true, ...result,
        enrichmentPending: true,
        latencyMs: Date.now() - t0,
      } as QuickScreenResponse, gateHeaders);
    }

    const [
      openSanctionsResults, commercialResults, registryResults,
      countryRegistryResults, countrySanctionsResults, freeAdapterResults,
      rawNews, llmArts, groqArts, geminiArts, enrichmentBundle,
    ] = augRace;

    // Merge LLM adverse-media articles from all three AI providers
    const aiArts = [...llmArts, ...groqArts, ...geminiArts];
    const aiProviders = [
      ...(llmArts.length > 0 ? ["claude-adverse-media"] : []),
      ...(groqArts.length > 0 ? ["groq-adverse-media"] : []),
      ...(geminiArts.length > 0 ? ["gemini-adverse-media"] : []),
    ];
    let newsArticles: NewsResult = aiArts.length > 0
      ? { articles: [...aiArts, ...rawNews.articles], providersUsed: [...rawNews.providersUsed, ...aiProviders] }
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

    // Collect list health — cap wait at 800ms so a slow blob read can't
    // push past the function deadline. If not resolved, skip the snapshot.
    const listHealth = await Promise.race([
      listHealthPromise,
      new Promise<null>((r) => setTimeout(() => r(null), 800)),
    ]);
    const screeningWarnings = listHealth ? buildScreeningWarnings(listHealth) : [];

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
        // Sanctions list health at the moment of screening — required for
        // auditable compliance records. A "clear" against empty UAE lists
        // is a false clear, not a real one.
        ...(listHealth ? { listHealthAtScreeningTime: listHealth } : {}),
        ...(screeningWarnings.length > 0 ? { screeningWarnings } : {}),
      } as QuickScreenResponse,
      gateHeaders,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (Date.now() - t0 > 3000) console.warn(`[quick-screen] slow response latencyMs=${Date.now() - t0}`);
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
