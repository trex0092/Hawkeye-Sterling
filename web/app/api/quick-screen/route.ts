import { NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { ScreeningAuditWriter } from "@/lib/server/screening-audit";
import type {
  QuickScreenCandidate,
  QuickScreenOptions,
  QuickScreenResponse,
  QuickScreenResult,
  QuickScreenSubject,
  ScreeningDataSourceHealth,
} from "@/lib/api/quickScreen.types";
import { enforce } from "@/lib/server/enforce";
import { incrementCounter, setGauge } from "@/lib/server/metrics-store";
import { loadCandidatesWithHealth, type CandidateLoadHealth } from "@/lib/server/candidates-loader";
import { lookupWhitelist } from "@/lib/server/whitelist";
import { LIVE_OPENSANCTIONS_ADAPTER, activeOnChainProviders } from "@/lib/intelligence/liveAdapters";
import { bestCommercialAdapter, activeCommercialProvider, activeCommercialProviders } from "@/lib/intelligence/commercialAdapters";
import { searchAllRegistries, activeRegistryProviders } from "@/lib/intelligence/registryAdapters";
import { searchCountryRegistries } from "@/lib/intelligence/countryRegistries";
import { searchCountrySanctions } from "@/lib/intelligence/countrySanctions";
import { searchFreeAdapters, activeFreeProviders } from "@/lib/intelligence/freeAlwaysOnAdapters";
import {
  buildScreeningReasoning,
  buildConsensusInputsFromAugmentation,
  buildCoverageGapReport,
} from "@/lib/intelligence/screeningReasoning";
import { activeNewsProviders, searchAllNews } from "@/lib/intelligence/newsAdapters";
import { activeKycProviders } from "@/lib/intelligence/kycVendorAdapters";
import { ingestUrls } from "@/lib/intelligence/urlIngestion";
import { llmAdverseMediaAdapter } from "@/lib/intelligence/llmAdverseMedia";
import { groqAdverseMediaAdapter, geminiAdverseMediaAdapter } from "@/lib/intelligence/llmAdverseMediaAlt";
import { googleAiModeAdapter } from "@/lib/intelligence/googleAiModeAdapter";
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
// @brain/* is resolved via web/tsconfig.json paths → ../src/brain/*.
import { quickScreen as brainQuickScreen } from "@brain/quick-screen.js";
import { getCountryRisk } from "@/lib/server/high-risk-countries";
import { insertCaseRecord } from "@/lib/server/case-vault";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { saveSubject, getSubject } from "../pkyc/_store";
import type { CaseRecord } from "@/lib/types";
import { saveEnrichmentJob, completeEnrichmentJob } from "@/lib/server/enrichment-jobs";
import { UN_1267_DESIGNATED_ENTITIES } from "@/lib/intelligence/amlKeywords";
import { bloomPreScreen, isFilterStale, isFilterPreExpiry, rebuildGlobalFilter, schedulePreExpiryRebuild } from "@/lib/server/bloom-filter";
import { LatencyBudget } from "@/lib/server/latency-budget";
// ── In-memory result cache ─────────────────────────────────────────────────
// Survives Next.js HMR by anchoring to globalThis (same pattern as store.ts).
// TTL: 60 seconds — reduced from 3 min to limit stale CLEAR results for recently
// designated entities. Netlify Lambda is single-threaded per invocation so the
// Map iteration in the cleanup sweep is not truly concurrent with request reads;
// TTL is a soft bound and occasional stale reads within the 60s window are
// acceptable given low designation frequency.
const SCREEN_CACHE_TTL_MS = 60_000;
// eslint-disable-next-line no-var
declare global { var __hs_screen_cache: Map<string, { result: unknown; cachedAt: number }> | undefined; }
const _screenCache: Map<string, { result: unknown; cachedAt: number }> =
  globalThis.__hs_screen_cache ?? (globalThis.__hs_screen_cache = new Map());

// ── UN Security Council 1267 designated entity name matching ───────────────
// Token-set similarity check: if the subject name shares >80% of word tokens
// with any UN 1267 designated group, immediately flag with critical severity.
// This is a lightweight pre-screen before the full watchlist engine runs.

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s؀-ۿݐ-ݿ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

function tokenSetSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  return intersection / Math.max(ta.size, tb.size);
}

function checkUn1267Match(
  name: string,
  aliases: string[] = [],
): { matched: true; entity: string; similarity: number } | { matched: false } {
  const THRESHOLD = 0.80;
  const namesToCheck = [name, ...aliases];
  for (const n of namesToCheck) {
    for (const entity of UN_1267_DESIGNATED_ENTITIES) {
      const sim = tokenSetSimilarity(n, entity);
      if (sim >= THRESHOLD) {
        return { matched: true, entity, similarity: sim };
      }
    }
  }
  return { matched: false };
}

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stores: { get: (_key: string, _opts?: any) => Promise<unknown> }[] = [];
  try {
    const { getStore } = await import("@netlify/blobs");
    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    // Dual-store: try hawkeye-list-reports (entities written there post-deploy)
    // then hawkeye-lists (entities present now from existing ingestion runs).
    const token =
      process.env["NETLIFY_BLOBS_TOKEN"] ??
      process.env["NETLIFY_API_TOKEN"] ??
      process.env["NETLIFY_AUTH_TOKEN"];
    const mkStore = (name: string) => siteID && token
      ? getStore({ name, siteID, token, consistency: "strong" })
      : getStore({ name });
    stores = [mkStore("hawkeye-list-reports"), mkStore("hawkeye-lists")];
  } catch {
    for (const id of LIST_IDS) {
      snapshot[id] = { entityCount: null, ageHours: null, status: "missing" };
    }
    return snapshot;
  }

  const LIST_HEALTH_BLOB_TIMEOUT_MS = 1_200;
  await Promise.all(LIST_IDS.map(async (listId) => {
    const key = `${listId}/latest.json`;
    for (const store of stores) {
      try {
        const raw = await Promise.race([
          store.get(key, { type: "json" }) as Promise<{ entities?: unknown[]; report?: { fetchedAt?: number }; fetchedAt?: number } | null>,
          new Promise<null>((r) => setTimeout(() => r(null), LIST_HEALTH_BLOB_TIMEOUT_MS)),
        ]);
        if (!raw || !Array.isArray(raw.entities)) continue;
        const entityCount = raw.entities.length;
        const fetchedAtMs = raw.report?.fetchedAt ?? raw.fetchedAt ?? null;
        const ageHours = typeof fetchedAtMs === "number"
          ? Math.round((Date.now() - fetchedAtMs) / HOUR_MS * 10) / 10
          : null;
        // A blob that loads but has zero entities is "degraded" — a clear verdict
        // against an empty list is a false clear, not a real one.
        const status: ListHealthStatus =
          entityCount === 0 ? "missing" :
          ageHours !== null && ageHours > STALE_HOURS ? "stale" : "healthy";
        snapshot[listId] = { entityCount, ageHours, status };
        return; // found data — skip fallback store
      } catch { /* try next store */ }
    }
    snapshot[listId] = { entityCount: null, ageHours: null, status: "missing" };
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

// Verdict reliability guard (CG / FATF R.10 / FDL 10/2025 Art.18).
// A clean ("clear") verdict is only a documentable negative finding when it was
// produced against a fresh, fully-loaded corpus. Returns an explicit
// machine-readable reliability flag + human qualifier so a stale/static-seed
// "clear" can never be silently trusted. Applied on EVERY verdict-producing
// return path — including the bloom and deadline fast-paths — not just the
// fully-enriched response.
interface VerdictReliability {
  clearVerdictReliable: boolean;
  verdictQualifier?: string;
  maxListAgeHours: number | null;
  corpusDegraded: boolean;
}
function computeVerdictReliability(
  severity: string,
  hitCount: number,
  listHealth: ListHealthSnapshot | null,
  corpusHealth: CandidateLoadHealth | null,
): VerdictReliability {
  const entries = listHealth ? Object.entries(listHealth) : [];
  const missing = entries.filter(([, e]) => e.status === "missing").length;
  const stale = entries.filter(([, e]) => e.status === "stale").length;
  const empty = entries.filter(([, e]) => e.entityCount === 0 && e.status !== "missing").length;
  const maxListAgeHours = listHealth
    ? Object.values(listHealth).reduce((mx, e) => (e.ageHours !== null && e.ageHours > mx ? e.ageHours : mx), 0)
    : null;
  const corpusDegraded = !!(corpusHealth && !corpusHealth.healthy);
  const verdictIsClear = severity === "clear" && hitCount === 0;
  const clearVerdictReliable = !verdictIsClear
    ? true
    : missing === 0 && stale === 0 && empty === 0 && !corpusDegraded;
  const verdictQualifier = clearVerdictReliable
    ? undefined
    : [
        stale > 0 ? `${stale} list(s) stale` : null,
        missing > 0 ? `${missing} list(s) missing` : null,
        empty > 0 ? `${empty} list(s) empty` : null,
        corpusDegraded ? "corpus served from static seed" : null,
      ].filter(Boolean).join("; ") || "verdict could not be fully corroborated";
  return { clearVerdictReliable, verdictQualifier, maxListAgeHours, corpusDegraded };
}

type QuickScreenFn = (
  _subject: QuickScreenSubject,
  _candidates: QuickScreenCandidate[],
  _options?: QuickScreenOptions,
) => QuickScreenResult;

const quickScreen = brainQuickScreen as QuickScreenFn;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface QuickScreenRequestBody {
  subject?: QuickScreenSubject;
  /** Backward-compat: first element used when subject is absent. */
  subjects?: QuickScreenSubject[];
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
  const phaseBudget = new LatencyBudget("quick-screen");
  phaseBudget.phase("parallel-kickoff");
  // Start list health check immediately — runs in parallel with auth + corpus
  // loading so it doesn't add latency to the critical path.
  const listHealthPromise = fetchListHealth().catch(() => null);

  // Start corpus loading at t0 in parallel with auth + body parse + whitelist.
  // On a warm Lambda the in-memory cache returns in <1ms; on a cold start
  // Blobs reads take up to 2.4s — overlapping that with the serial auth/parse
  // steps saves ~500ms and keeps total response under the 2.8s hard deadline.
  const candidatesPromise = loadCandidatesWithHealth().catch(() => null);

  // Require authentication — UAE FDL Art. 20 requires every screening
  // action to be traceable to a natural person. Anonymous screening (free
  // tier without an API key) leaves audit chain entries with no operator
  // identity. For a public demo, use the separate /api/demo/quick-screen
  // path (if added) which logs actor: "public-demo" explicitly.
  phaseBudget.phase("auth");
  const gate = await enforce(req, { requireAuth: true, cost: 2 });
  if (!gate.ok) { phaseBudget.finish(); return gate.response; }
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  // When the poll endpoint re-calls quick-screen for full enrichment it sets
  // this header. With it present, the hard-deadline early-return is skipped
  // so the adapters run to completion and the result is written to the job blob.
  const rawEnrichJobId = req.headers.get("x-enrich-job-id") ?? null;
  // Validate format to prevent blob-key injection: only allow alphanumeric, hyphens, underscores (max 80 chars).
  const enrichJobId = rawEnrichJobId && /^[A-Za-z0-9_-]{1,80}$/.test(rawEnrichJobId) ? rawEnrichJobId : null;

  let body: QuickScreenRequestBody;
  try {
    body = (await req.json()) as QuickScreenRequestBody;
  } catch {
    return respond(400, { ok: false, error: "invalid JSON body" }, gateHeaders);
  }

  // Accept {subject:{}} (primary) or {subjects:[]} (backward-compat array form).
  const rawSubject = body.subject ?? (Array.isArray(body.subjects) ? body.subjects[0] : undefined);
  // If the caller supplies candidates use them; otherwise screen against the
  // live ingested watchlists (OFAC, UN, EU, UK, UAE-EOCN/LTL + seed corpus).
  const callerCandidates = body.candidates;

  if (!rawSubject || typeof rawSubject.name !== "string" || !rawSubject.name.trim()) {
    return respond(400, { ok: false, error: "subject.name required" }, gateHeaders);
  }
  if (rawSubject.name.length > 512) {
    return respond(400, { ok: false, error: "subject.name exceeds 512-character limit" }, gateHeaders);
  }
  if (Array.isArray(rawSubject.aliases) && rawSubject.aliases.length > 50) {
    return respond(400, { ok: false, error: "aliases exceeds 50-entry limit" }, gateHeaders);
  }
  if (Array.isArray(body.evidenceUrls) && body.evidenceUrls.length > 20) {
    return respond(400, { ok: false, error: "evidenceUrls exceeds 20-entry limit" }, gateHeaders);
  }

  // J-04 + J-05 audit enrichment: every screening audit-chain entry written
  // from this route includes the active list versions and the match-threshold
  // value used. One writer per request; list-version capture is memoised
  // inside so multiple audit writes within a request only read Blobs once.
  const auditWriter = new ScreeningAuditWriter({
    matchThreshold: body.options?.scoreThreshold,
  });

  // Sanitize optional discriminator fields — coerce to string/undefined so
  // the brain engine never receives unexpected types from the MCP tool.
  const subject: QuickScreenSubject = {
    ...rawSubject,
    name: rawSubject.name.trim(),
    dateOfBirth: typeof rawSubject.dateOfBirth === "string" ? rawSubject.dateOfBirth.trim() || undefined
      : typeof (rawSubject as unknown as Record<string, unknown>)["dob"] === "string"
        ? String((rawSubject as unknown as Record<string, unknown>)["dob"]).trim() || undefined
        : undefined,
    nationality: typeof rawSubject.nationality === "string"
      ? rawSubject.nationality.trim().slice(0, 3) || undefined
      : undefined,
    aliases: Array.isArray(rawSubject.aliases)
      ? rawSubject.aliases.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
      : undefined,
  };

  // UN Security Council 1267 designated entity pre-screen ───────────────────
  // If the subject name (or any alias) has token-set similarity > 0.80 to a
  // known UN 1267 designated group, immediately return critical severity with
  // flag "un_1267_designated_entity_match". This fires BEFORE the whitelist
  // check so designated terrorist groups cannot be whitelisted past this gate.
  const un1267Check = checkUn1267Match(subject.name, subject.aliases ?? []);
  if (un1267Check.matched) {
    const un1267Hit: import("@/lib/api/quickScreen.types").QuickScreenHit = {
      listId: "un_1267",
      listRef: `UNSCR-1267:${un1267Check.entity}`,
      candidateName: un1267Check.entity,
      score: un1267Check.similarity,
      baseScore: un1267Check.similarity,
      method: "token_set",
      phoneticAgreement: false,
      programs: ["UNSCR 1267 — Terrorism Financing"],
      reason: `UN 1267 designated entity match: token-set similarity ${(un1267Check.similarity * 100).toFixed(1)}% to "${un1267Check.entity}"`,
      autoResolution: "flagged",
    };
    const un1267Result: QuickScreenResult = {
      subject,
      hits: [un1267Hit],
      topScore: un1267Check.similarity,
      severity: "critical",
      listsChecked: 1,
      candidatesChecked: UN_1267_DESIGNATED_ENTITIES.length,
      durationMs: Date.now() - t0,
      generatedAt: new Date().toISOString(),
    };
    void auditWriter.write({
      event: "screening.completed",
      actor: gate.record?.email ?? gate.keyId ?? "unknown",
      subject: subject.name,
      severity: "critical",
      hitsCount: 1,
      listsChecked: 1,
      listsDegraded: 0,
      note: `UN 1267 pre-screen match: ${un1267Check.entity} (similarity=${un1267Check.similarity.toFixed(3)})`,
    }).catch((err: unknown) => console.warn("[quick-screen] UN 1267 audit write failed:", err instanceof Error ? err.message : String(err)));
    // Attach the UN 1267 flag as a top-level field on the response payload
    return respond(200, {
      ok: true,
      ...un1267Result,
      un1267DesignatedEntityMatch: true,
      matchedDesignatedEntity: un1267Check.entity,
      matchSimilarity: un1267Check.similarity,
    } as QuickScreenResponse, gateHeaders);
  }

  // Whitelist short-circuit — if the operator's tenant has previously
  // cleared this subject (false-positive disposition recorded via
  // /api/whitelist), skip the expensive list match and surface a clean
  // result with the original approver metadata attached. Anonymous /
  // portal-admin callers (record === null) skip this check.
  const tenantId = gate.record?.email;
  if (tenantId) {
    try {
      // Cap whitelist lookup at 200ms — a Blobs read should never exceed this
      // on a healthy deployment. If it hangs we fall through to full screening
      // (the safe default: the MLRO sees the hit again rather than missing it).
      const match = await Promise.race([
        lookupWhitelist(tenantId, {
          name: subject.name,
          ...(subject.jurisdiction ? { jurisdiction: subject.jurisdiction } : {}),
        }),
        new Promise<null>((r) => setTimeout(() => r(null), 200)),
      ]);
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
        // Compliance: whitelist matches MUST still produce an audit-chain entry so
        // regulators can verify every screening event, including those that were
        // cleared via the tenant whitelist (UAE FDL Art. 20 traceability requirement).
        void auditWriter.write({
          event: "screening.whitelisted",
          actor: gate.record?.email ?? gate.keyId ?? "unknown",
          subject: subject.name,
          severity: "clear",
          hitsCount: 0,
          whitelistEntryId: match.id,
          approvedBy: match.approvedBy,
          approverRole: match.approverRole,
        }).catch((err: unknown) => console.warn("[quick-screen] whitelist audit write failed:", err instanceof Error ? err.message : String(err)));
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
      // Record metric so operators can see when the whitelist gate is bypassed.
      try {
        const { incrementCounter } = await import("@/lib/server/metrics-store");
        incrementCounter("hs_whitelist_unavailable_total", 1, { tenant: tenantId ?? "unknown" });
      } catch { /* non-critical */ }
    }
  }

  // ── Cache check ───────────────────────────────────────────────────────────
  // Skip cache when forceRefresh or enhanced screening is requested — deep
  // enhanced runs must always be fresh (live adapter results change frequently).
  const cacheBypass = body.options?.forceRefresh === true || body.options?.enhanced === true;
  const normalizedName = subject.name.toLowerCase().trim().replace(/\s+/g, " ");
  // Use gate.keyId (always set) rather than tenantId (null for non-API-key callers)
  // so every authenticated identity gets an isolated cache namespace.
  const cacheKey = `${gate.keyId}|${normalizedName}`;

  if (!cacheBypass) {
    const cached = _screenCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < SCREEN_CACHE_TTL_MS) {
      return NextResponse.json(cached.result, {
        status: 200,
        headers: { ...CORS_HEADERS, ...gateHeaders, "x-cache": "HIT" },
      });
    }
  }

  let candidates: QuickScreenCandidate[];
  // Data source health — attached to every response so audit records and
  // compliance analysts can see whether a screen ran against live or static data.
  // When source === "static" or healthy === false, a "clear" verdict MUST be
  // treated as INCONCLUSIVE by downstream compliance processes.
  let corpusHealth: CandidateLoadHealth | null = null;

  function toDataSourceHealth(h: CandidateLoadHealth): ScreeningDataSourceHealth {
    return {
      source: h.source,
      loadedAt: h.loadedAt,
      candidateCount: h.candidateCount,
      healthy: h.healthy,
      failedAdapters: h.failedAdapters,
      ...(h.degradationNote ? { degradationNote: h.degradationNote } : {}),
    };
  }

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
    // Re-use the promise started at t0; loadCandidatesWithHealth's in-flight
    // deduplication means only one Blobs read occurred regardless.
    try {
      const loaded = await candidatesPromise;
      if (!loaded) {
        return respond(503, { ok: false, error: "watchlist corpus unavailable", detail: "loadCandidatesWithHealth failed" }, gateHeaders);
      }
      corpusHealth = loaded.health;
      const rawCandidates = loaded.candidates;

      // Validate shape at runtime — a corrupt blob/static fixture must NOT
      // silently propagate into the matcher and produce nonsense hits.
      if (!Array.isArray(rawCandidates)) {
        return respond(503, { ok: false, error: "watchlist corpus unavailable", detail: "loadCandidatesWithHealth returned non-array" }, gateHeaders);
      }
      candidates = rawCandidates.filter(
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
          requestId: randomUUID(),
          dataSourceHealth: corpusHealth ? toDataSourceHealth(corpusHealth) : undefined,
        } as QuickScreenResponse & { errorCode: string; errorType: string; tool: string; missingLists: string[]; degraded: boolean; message: string; requestId: string; dataSourceHealth?: ScreeningDataSourceHealth }, gateHeaders);
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
          requestId: randomUUID(),
          dataSourceHealth: corpusHealth ? toDataSourceHealth(corpusHealth) : undefined,
        } as QuickScreenResponse & { errorCode: string; errorType: string; tool: string; missingLists: string[]; degraded: boolean; message: string; requestId: string; dataSourceHealth?: ScreeningDataSourceHealth }, gateHeaders);
      }
    } catch (err) {
      console.error("[quick-screen] loadCandidatesWithHealth failed:", err instanceof Error ? err.message : String(err));
      return respond(503, {
        ok: false,
        errorCode: "LISTS_MISSING",
        errorType: "data_integrity",
        tool: "screen_subject",
        missingLists: ["ofac_sdn", "un_consolidated"],
        degraded: true,
        message: "Screening cannot proceed: watchlist corpus unavailable. Run sanctions refresh and retry.",
        requestId: randomUUID(),
      } as QuickScreenResponse & { errorCode: string; errorType: string; tool: string; missingLists: string[]; degraded: boolean; message: string; requestId: string }, gateHeaders);
    }
  }

  // Deterministic result ID — same SHA-256 approach as screening/run so
  // quick-screen results can be correlated in audit logs and case management.
  const qsTs = new Date().toISOString();
  const qsResultId = (() => {
    const normName = subject.name.trim().normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
    const seed = [randomUUID(), normName, subject.entityType ?? "", qsTs].join("|");
    return createHash("sha256").update(seed).digest("hex").slice(0, 32);
  })();

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

    phaseBudget.phase("bloom");
    // ── Bloom filter pre-screen ────────────────────────────────────────────
    // If the Bloom filter is stale (or caller supplies their own candidates),
    // rebuild it asynchronously in the background — it will be ready for the
    // NEXT request. For this request we fall through to quickScreen().
    //
    // When the filter returns false (definitely absent) skip quickScreen()
    // entirely and return a no_match result. Saves 800–1 200 ms on most
    // requests where the subject is not near any sanctioned entity name.
    //
    // Never skip when:
    //   - Bloom filter was not built yet (cold start)
    //   - Caller supplied explicit candidates (they bypass the corpus)
    //   - The subject is a common name (filter FPR still small but we must
    //     not suppress screening of a populous name class)
    if (isFilterStale() && !Array.isArray(callerCandidates)) {
      // Filter fully expired — rebuild asynchronously for the next request.
      void loadCandidatesWithHealth()
        .then((r) => rebuildGlobalFilter(r.candidates))
        .catch(() => undefined);
    } else if (isFilterPreExpiry() && !Array.isArray(callerCandidates)) {
      // Filter approaching expiry (>80% of TTL consumed) — schedule a proactive
      // background rebuild so the first post-expiry request hits a warm filter,
      // not a synchronous cold-build latency spike.
      schedulePreExpiryRebuild(() =>
        loadCandidatesWithHealth().then((r) => r.candidates),
      );
    }
    const bloomPass =
      Array.isArray(callerCandidates) ||
      bloomPreScreen(subject.name, subject.aliases ?? []);

    // Start news aggregation early — in parallel with the synchronous quickScreen()
    // CPU-bound matcher — so news results are fetched while matching runs.
    // quickScreen() is O(n·m) CPU-bound and non-async; the news promise begins
    // here and is awaited later inside the augmentation Promise.all block.
    type NewsResult = Awaited<ReturnType<typeof searchAllNews>>;
    const earlyNewsPromise: Promise<NewsResult> =
      bloomPass && subject.name.length >= 3
        ? searchAllNews(subject.name, { limit: 8 }).catch((): NewsResult => ({ articles: [], providersUsed: [] }))
        : Promise.resolve<NewsResult>({ articles: [], providersUsed: [] });

    // Bloom filter says "definitely not present" → return no-match immediately.
    // We still write the audit chain entry so the regulator can see the screen
    // occurred and was skipped by the fast-path gate.
    if (!bloomPass) {
      const bloomResult: QuickScreenResult = {
        subject,
        hits: [],
        topScore: 0,
        severity: "clear",
        listsChecked: candidates.length > 0 ? 1 : 0,
        candidatesChecked: candidates.length,
        durationMs: Date.now() - t0,
        generatedAt: new Date().toISOString(),
      };
      void auditWriter.write({
        event: "screening.completed",
        actor: gate.record?.email ?? gate.keyId ?? "unknown",
        subject: subject.name,
        severity: "clear",
        hitsCount: 0,
        listsChecked: bloomResult.listsChecked,
        listsDegraded: 0,
        note: "bloom_filter_fast_path: no token overlap with any sanctioned entity",
      }).catch((err: unknown) =>
        console.warn("[quick-screen] bloom fast-path audit write failed:", err instanceof Error ? err.message : String(err)),
      );
      // Reliability guard: a bloom "no token overlap" clear is still a "clear"
      // verdict — if the corpus is the static seed (or lists are stale/empty)
      // this clear is NOT a documentable negative finding. Peek listHealth
      // without adding latency.
      const bloomHealth = await Promise.race([listHealthPromise, Promise.resolve(null)]);
      const bloomReliability = computeVerdictReliability("clear", 0, bloomHealth, corpusHealth);
      setGauge("hawkeye_screening_corpus_degraded", bloomReliability.corpusDegraded ? 1 : 0);
      incrementCounter("hawkeye_screening_requests_total", 1, {
        verdict: "clear",
        reliable: String(bloomReliability.clearVerdictReliable),
      });
      return respond(200, {
        ok: true,
        ...bloomResult,
        _bloomFastPath: true,
        clearVerdictReliable: bloomReliability.clearVerdictReliable,
        ...(bloomReliability.verdictQualifier ? { verdictQualifier: bloomReliability.verdictQualifier } : {}),
        ...(bloomReliability.maxListAgeHours !== null ? { maxListAgeHours: bloomReliability.maxListAgeHours } : {}),
        dataSourceHealth: corpusHealth ? toDataSourceHealth(corpusHealth) : undefined,
      } as QuickScreenResponse & { _bloomFastPath: boolean }, gateHeaders);
    }

    phaseBudget.phase("quickscreen");
    const result = quickScreen(subject, candidates, screenOptions);
    phaseBudget.phase("augmentation");

    // Source attribution: enrich each hit with a human-readable list label,
    // risk category, and structured match reason. Additive — never overwrites
    // existing fields, compatible with all existing callers.
    const LIST_ID_TO_LABEL: Record<string, string> = {
      ofac_sdn:       "OFAC Specially Designated Nationals",
      ofac_cons:      "OFAC Consolidated Sanctions",
      un_consolidated:"UN Consolidated Sanctions",
      un_1267:        "UN ISIL/Al-Qaeda Sanctions (1267)",
      eu_fsf:         "EU Frozen Funds & Financial Sanctions",
      uk_ofsi:        "UK OFSI Consolidated Sanctions",
      uae_eocn:       "UAE Executive Office for Control & Non-Proliferation",
      uae_ltl:        "UAE Local Terrorist List",
      ca_osfi:        "Canada OSFI Consolidated Sanctions",
      ch_seco:        "Switzerland SECO Sanctions",
      au_dfat:        "Australia DFAT Consolidated Sanctions",
      jp_mof:         "Japan MoF Sanctions",
      interpol:       "Interpol Red Notices",
      fatf:           "FATF High-Risk Jurisdictions",
      lseg_ofac_sdn:  "OFAC SDN (LSEG)",
      lseg_eu_fsf:    "EU Frozen Funds (LSEG)",
      lseg_uk_ofsi:   "UK OFSI (LSEG)",
    };
    for (const hit of result.hits) {
      if (!hit.sourceList) hit.sourceList = hit.listId;
      if (!hit.sourceLabel) {
        hit.sourceLabel = LIST_ID_TO_LABEL[hit.listId] ?? hit.listId.toUpperCase().replace(/_/g, " ");
      }
      if (!hit.riskCategory) {
        const lid = hit.listId.toLowerCase();
        hit.riskCategory =
          lid.includes("pep") ? "pep"
          : lid.includes("media") || lid.includes("news") ? "adverse_media"
          : "sanctions";
      }
      if (!hit.matchReason) {
        hit.matchReason = hit.reason;
      }
      if (!hit.confidenceTier) {
        const rawScore = hit.score ?? hit.baseScore;
        // Guard against NaN/null/undefined scores — coerce to 0 and mark as
        // "unscored" so corrupted scores don't silently produce under-flagged hits.
        const s = typeof rawScore === 'number' && isFinite(rawScore) ? rawScore : 0;
        if (rawScore === undefined || rawScore === null || !isFinite(rawScore as number)) {
          hit.confidenceTier = "unscored";
        } else {
          hit.confidenceTier =
            s >= 0.95 ? "confirmed"
            : s >= 0.80 ? "probable"
            : s >= 0.60 ? "possible"
            : "unlikely";
        }
      }
    }

    // Auto-create PNMR + SLA records for LTL and UN Consolidated hits
    const PNMR_TRIGGER_LISTS = new Set(["uae_ltl", "uae_eocn", "un_consolidated", "un_1267"]);
    const pnmrHits = result.hits.filter(
      (h) => PNMR_TRIGGER_LISTS.has(h.listId) && (h.score ?? 0) >= 0.60
    );
    if (pnmrHits.length > 0) {
      const { createPnmrRecord } = await import("@/lib/server/pnmr");
      const { createEocnSlaRecord } = await import("@/lib/server/eocn-sla");
      const pnmrTenant = tenantIdFromGate(gate);
      for (const hit of pnmrHits) {
        void createPnmrRecord(pnmrTenant, {
          subjectName: subject.name,
          listId: hit.listId,
          listLabel: hit.sourceLabel ?? hit.listId,
          screeningHitId: hit.listRef,
          initiatedBy: "system/quick-screen",
        }).then((pnmrRecord) => {
          // Auto-create the three EOCN SLA obligation timers for each hit.
          const slaTypes = ["EOCN_FREEZE_24H", "EOCN_PNMR_5BD", "EOCN_CUSTOMER_VERIFY_10BD"] as const;
          for (const type of slaTypes) {
            createEocnSlaRecord(pnmrTenant, {
              type,
              pnmrId: pnmrRecord.id,
              subjectName: subject.name,
              listId: hit.listId,
            }).catch((err: unknown) =>
              console.warn("[quick-screen] EOCN SLA auto-create failed:", err instanceof Error ? err.message : String(err))
            );
          }
        }).catch((err: unknown) =>
          console.warn("[quick-screen] PNMR auto-create failed:", err instanceof Error ? err.message : String(err))
        );
      }
    }

    // Hard deadline SLA: if the enrichment adapters haven't resolved with
    // enough budget remaining, return the deterministic list-match result
    // immediately. Sanctions hits are always present (local match is O(1));
    // only the enrichment layer (news, registries, LLM) is deferred.
    // The client can re-poll for an enriched result if needed.
    const HARD_DEADLINE_MS = 3_000; // 3s hard cap — keeps end-to-end response in 3-5s target window
    const elapsedMs = Date.now() - t0;
    if (!enrichJobId && elapsedMs >= HARD_DEADLINE_MS - 100) {
      // Audit chain must fire even when the enrichment deadline is exceeded.
      // Peek at listHealthPromise without adding latency — it may already be resolved.
      const peekHealth1 = await Promise.race([listHealthPromise, Promise.resolve(null)]);
      const earlyDegraded1 = peekHealth1
        ? Object.values(peekHealth1).filter((e) => e.entityCount === 0 && e.status !== "missing").length
        : 0;
      void auditWriter.write({
        event: "screening.completed",
        actor: gate.record?.email ?? gate.keyId ?? "unknown",
        subject: subject.name,
        severity: result.severity,
        hitsCount: result.hits.length,
        listsChecked: result.listsChecked,
        listsDegraded: earlyDegraded1,
        enrichmentPending: true,
      }).catch((err: unknown) => console.warn("[quick-screen] audit write failed:", err instanceof Error ? err.message : String(err)));
      const newJobId1 = `hwk-e-${randomUUID()}`;
      void saveEnrichmentJob(newJobId1, subject, { ok: true, ...result } as Record<string, unknown>).catch((err: unknown) => console.warn("[quick-screen] saveEnrichmentJob failed:", err instanceof Error ? err.message : String(err)));
      const reliability1 = computeVerdictReliability(result.severity, result.hits.length, peekHealth1, corpusHealth);
      incrementCounter("hawkeye_screening_requests_total", 1, {
        verdict: result.severity === "clear" && result.hits.length === 0 ? "clear" : result.severity,
        reliable: String(reliability1.clearVerdictReliable),
      });
      return respond(200, {
        ok: true, ...result,
        enrichmentPending: true,
        enrichJobId: newJobId1,
        latencyMs: Date.now() - t0,
        clearVerdictReliable: reliability1.clearVerdictReliable,
        ...(reliability1.verdictQualifier ? { verdictQualifier: reliability1.verdictQualifier } : {}),
        ...(reliability1.maxListAgeHours !== null ? { maxListAgeHours: reliability1.maxListAgeHours } : {}),
        dataSourceHealth: corpusHealth ? toDataSourceHealth(corpusHealth) : undefined,
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
    const googleAdapter = googleAiModeAdapter();
    const warn = (err: unknown) => console.warn("[hawkeye] quick-screen: best-effort adapter failed:", err);
    const canAug = subject.name.length >= 3;
    const hitGated = (result.hits.length < 3 || isCommonName) && canAug;

    type OSResult        = Awaited<ReturnType<typeof LIVE_OPENSANCTIONS_ADAPTER.lookup>>;
    type CommResult      = Awaited<ReturnType<ReturnType<typeof bestCommercialAdapter>["lookup"]>>;
    type RegResult       = Awaited<ReturnType<typeof searchAllRegistries>>;
    type CRegResult      = Awaited<ReturnType<typeof searchCountryRegistries>>;
    type CSanResult      = Awaited<ReturnType<typeof searchCountrySanctions>>;
    type FreeResult      = Awaited<ReturnType<typeof searchFreeAdapters>>;
    // NewsResult already declared above (earlyNewsPromise) — reuse the type alias.
    type LlmResult       = Awaited<ReturnType<typeof llmAdapter.search>>;
    type UrlIngestResult = Awaited<ReturnType<typeof ingestUrls>>;

    // Per-adapter timeout: wrap each external lookup so any single slow
    // provider can't drag the whole screen past Netlify's 26s sync ceiling.
    // 4s was chosen because the 95th percentile for a healthy adapter is
    // ~2.5s; anything beyond that is almost certainly a transient hang
    // from a third-party that we'd rather degrade than block on. Returning
    // the empty type matches the existing .catch fallback contract.
    const ADAPTER_TIMEOUT_MS = 1_500; // 1.5s cap keeps full pipeline within 3-5s target
    const adapterTimeout = <T>(p: Promise<T>, fallback: T): Promise<T> => {
      let to: NodeJS.Timeout | null = null;
      const timeoutP = new Promise<T>((resolve) => {
        to = setTimeout(() => { warn("adapter timeout >1.5s"); resolve(fallback); }, ADAPTER_TIMEOUT_MS);
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
      // Group C — news velocity + LLM adverse-media recall (Claude + Groq + Gemini + Google AI in parallel)
      // earlyNewsPromise was started before quickScreen() ran; here we wrap it
      // in adapterTimeout so the whole augmentation race is still bounded.
      adapterTimeout(earlyNewsPromise, { articles: [], providersUsed: [] } as NewsResult),
      canAug && llmAdapter.isAvailable() ? adapterTimeout(llmAdapter.search(subject.name, { limit: 15 }).catch((e): LlmResult => { warn(e); return []; }), [] as LlmResult) : Promise.resolve<LlmResult>([]),
      canAug && groqAdapter.isAvailable() ? adapterTimeout(groqAdapter.search(subject.name, { limit: 15 }).catch((e): LlmResult => { warn(e); return []; }), [] as LlmResult) : Promise.resolve<LlmResult>([]),
      canAug && geminiAdapter.isAvailable() ? adapterTimeout(geminiAdapter.search(subject.name, { limit: 15 }).catch((e): LlmResult => { warn(e); return []; }), [] as LlmResult) : Promise.resolve<LlmResult>([]),
      // Group C+ — Google AI Mode search (synthesised OSINT)
      canAug && googleAdapter.isAvailable() ? adapterTimeout(googleAdapter.search(subject.name, { limit: 10 }).catch((e): LlmResult => { warn(e); return []; }), [] as LlmResult) : Promise.resolve<LlmResult>([]),
      // Group D — public-API enrichment (IP / blockchain / breach / domain / phone / fraud)
      adapterTimeout(runEnrichmentAdapters(hints).catch((e): EnrichmentBundle => { warn(e); return NULL_ENRICHMENT; }), NULL_ENRICHMENT),
      // Group E — operator-supplied evidence URLs. Moved into the parallel race so
      // ingestUrls never blocks the response after the augmentation deadline fires.
      // Each URL fetch is already abortable at 12 s; adapterTimeout caps the whole
      // batch at 2.5 s so one slow site cannot drag the response to 5+ seconds.
      Array.isArray(body.evidenceUrls) && body.evidenceUrls.length > 0
        ? adapterTimeout(ingestUrls(body.evidenceUrls).catch((): UrlIngestResult => []), [] as UrlIngestResult)
        : Promise.resolve<UrlIngestResult>([]),
      ]).then((r) => r as [OSResult, CommResult, RegResult, CRegResult, CSanResult, FreeResult, NewsResult, LlmResult, LlmResult, LlmResult, LlmResult, EnrichmentBundle, UrlIngestResult]),
      deadlineP,
    ]);
    if (_deadlineTimer) clearTimeout(_deadlineTimer);

    // If the deadline fired before adapters resolved, return fast-path result.
    if (augRace === "timeout") {
      const peekHealth2 = await Promise.race([listHealthPromise, Promise.resolve(null)]);
      const earlyDegraded2 = peekHealth2
        ? Object.values(peekHealth2).filter((e) => e.entityCount === 0 && e.status !== "missing").length
        : 0;
      void auditWriter.write({
        event: "screening.completed",
        actor: gate.record?.email ?? gate.keyId ?? "unknown",
        subject: subject.name,
        severity: result.severity,
        hitsCount: result.hits.length,
        listsChecked: result.listsChecked,
        listsDegraded: earlyDegraded2,
        enrichmentPending: true,
      }).catch((err: unknown) => console.warn("[quick-screen] audit write failed:", err instanceof Error ? err.message : String(err)));
      const newJobId2 = enrichJobId ?? `hwk-e-${randomUUID()}`;
      if (!enrichJobId) {
        void saveEnrichmentJob(newJobId2, subject, { ok: true, ...result } as Record<string, unknown>).catch((err: unknown) => console.warn("[quick-screen] saveEnrichmentJob failed:", err instanceof Error ? err.message : String(err)));
      }
      const reliability2 = computeVerdictReliability(result.severity, result.hits.length, peekHealth2, corpusHealth);
      incrementCounter("hawkeye_screening_requests_total", 1, {
        verdict: result.severity === "clear" && result.hits.length === 0 ? "clear" : result.severity,
        reliable: String(reliability2.clearVerdictReliable),
      });
      return respond(200, {
        ok: true, ...result,
        enrichmentPending: true,
        enrichJobId: newJobId2,
        latencyMs: Date.now() - t0,
        clearVerdictReliable: reliability2.clearVerdictReliable,
        ...(reliability2.verdictQualifier ? { verdictQualifier: reliability2.verdictQualifier } : {}),
        ...(reliability2.maxListAgeHours !== null ? { maxListAgeHours: reliability2.maxListAgeHours } : {}),
        dataSourceHealth: corpusHealth ? toDataSourceHealth(corpusHealth) : undefined,
      } as QuickScreenResponse, gateHeaders);
    }

    const [
      openSanctionsResults, commercialResults, registryResults,
      countryRegistryResults, countrySanctionsResults, freeAdapterResults,
      rawNews, llmArts, groqArts, geminiArts, googleArts, enrichmentBundle, ingestedUrls,
    ] = augRace;

    // Merge LLM adverse-media articles from all AI providers + Google AI Mode
    const aiArts = [...llmArts, ...groqArts, ...geminiArts, ...googleArts];
    const aiProviders = [
      ...(llmArts.length > 0 ? ["claude-adverse-media"] : []),
      ...(groqArts.length > 0 ? ["groq-adverse-media"] : []),
      ...(geminiArts.length > 0 ? ["gemini-adverse-media"] : []),
      ...(googleArts.length > 0 ? ["google-ai-mode"] : []),
    ];
    let newsArticles: NewsResult = aiArts.length > 0
      ? { articles: [...aiArts, ...rawNews.articles], providersUsed: [...rawNews.providersUsed, ...aiProviders] }
      : rawNews;

    // URL-direct ingestion result — already resolved in parallel with the adapter
    // augRace above (Group E). No extra await needed; zero added latency.
    if (ingestedUrls.length > 0) {
      newsArticles = {
        articles: [...ingestedUrls, ...newsArticles.articles],
        providersUsed: [...newsArticles.providersUsed, "url-ingest"],
      };
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

    // Collect list health — cap wait to whatever budget remains under the
    // hard 2.8 s deadline. A fixed 800 ms cap would add to the augmentation
    // time and push total response beyond 3 s when adapters resolve late.
    // listHealthPromise started in parallel at t0, so it has already been
    // running for the full augmentation window and is usually resolved.
    const listHealthBudgetMs = Math.max(50, HARD_DEADLINE_MS - (Date.now() - t0) - 50);
    const listHealth = await Promise.race([
      listHealthPromise,
      new Promise<null>((r) => setTimeout(() => r(null), listHealthBudgetMs)),
    ]);
    const screeningWarnings = listHealth ? buildScreeningWarnings(listHealth) : [];

    // Corpus health warning — when screening used the static seed corpus
    // (live Blobs unavailable), add a prominent warning so the MLRO knows
    // the result may not reflect entities designated since last build.
    if (corpusHealth && !corpusHealth.healthy) {
      const corpusNote = corpusHealth.degradationNote
        ?? `Data source degraded (source=${corpusHealth.source}). Results may be incomplete.`;
      screeningWarnings.unshift(`DATA SOURCE DEGRADED: ${corpusNote}`);
    }

    // _provenance — compact machine-readable summary of list health at
    // screening time. Used by MCP call_api and diagnostic tools.
    const missingLists = listHealth
      ? Object.entries(listHealth).filter(([, e]) => e.status === "missing").map(([id]) => id)
      : [];
    const staleListIds = listHealth
      ? Object.entries(listHealth).filter(([, e]) => e.status === "stale").map(([id]) => id)
      : [];
    const degradedListIds = listHealth
      ? Object.entries(listHealth).filter(([, e]) => e.entityCount === 0 && e.status !== "missing").map(([id]) => id)
      : [];
    // Lists that actually had data at screening time (entityCount > 0, not missing/stale)
    const listsCheckedWithData = listHealth
      ? Object.values(listHealth).filter((e) => e.entityCount !== null && (e.entityCount ?? 0) > 0).length
      : result.listsChecked;

    // Hard staleness guard. The empty/missing-critical-list paths above already
    // fail-loud, but a *partially* stale corpus still yields a confident "clear".
    // A clean verdict is only reliable when every list had fresh data and the
    // corpus loaded from the live source. When it isn't, surface an explicit
    // machine-readable reliability flag + qualifier so a downstream UI / MLRO
    // cannot mistake "we didn't see anything (against stale lists)" for a
    // documentable negative finding (FATF R.10 / FDL 10/2025 Art.18).
    const { clearVerdictReliable, verdictQualifier, maxListAgeHours, corpusDegraded } =
      computeVerdictReliability(result.severity, result.hits.length, listHealth, corpusHealth);
    const verdictIsClear = result.severity === "clear" && result.hits.length === 0;
    // Observability: oldest sanctions-list age at screening time. Lets an
    // operator alert when the refresh cron has lagged before it degrades verdicts.
    if (maxListAgeHours !== null) {
      setGauge("hawkeye_sanctions_list_max_age_hours", maxListAgeHours);
    }
    setGauge("hawkeye_screening_corpus_degraded", corpusDegraded ? 1 : 0);
    incrementCounter("hawkeye_screening_requests_total", 1, {
      verdict: verdictIsClear ? "clear" : result.severity,
      reliable: String(clearVerdictReliable),
    });

    // riskLevel — AML risk tier based on FATF/UAE country classification
    // for the subject's nationality and/or jurisdiction. Distinct from
    // `severity` which reflects the match quality against sanctions lists.
    const subjectCountry = subject.nationality ?? subject.jurisdiction;
    const countryRisk = getCountryRisk(subjectCountry);
    const riskLevel: string = countryRisk
      ? countryRisk.tier === "blacklist" ? "very_high"
        : countryRisk.tier === "greylist" ? "high"
        : "medium"
      : "standard";

    // Deduplicate hits — the same sanctioned entity may appear in multiple
    // regimes (UN + OFAC + UK OFSI). Group by normalised candidateName, keep
    // the highest-scoring occurrence as primary, and add matchedLists[] so
    // downstream consumers see all regimes that designated the entity.
    type HitWithLists = typeof result.hits[0] & { matchedLists?: string[] };
    const deduped: HitWithLists[] = [];
    const hitsByName = new Map<string, HitWithLists>();
    for (const hit of result.hits) {
      const key = hit.candidateName.toLowerCase().trim();
      const existing = hitsByName.get(key);
      if (!existing) {
        const enriched: HitWithLists = { ...hit, matchedLists: [hit.listId] };
        hitsByName.set(key, enriched);
        deduped.push(enriched);
      } else {
        (existing.matchedLists ??= []).push(hit.listId);
        if (hit.score > existing.score) {
          Object.assign(existing, { ...hit, matchedLists: existing.matchedLists });
        }
      }
    }
    const finalResult = { ...result, hits: deduped };

    // Write tamper-evident audit chain entry. Fire-and-forget: must never
    // block the screening response. Failure logged inside writeAuditChainEntry.
    // listsDegraded uses degradedListIds.length (consistent with early-return paths
    // which also count empty-entity non-missing lists, not screeningWarnings.length).
    void auditWriter.write({
      event: "screening.completed",
      actor: gate.record?.email ?? gate.keyId ?? "unknown",
      subject: subject.name,
      severity: finalResult.severity,
      hitsCount: finalResult.hits.length,
      listsChecked: finalResult.listsChecked,
      listsDegraded: degradedListIds.length,
    }).catch((err: unknown) => console.warn("[quick-screen] audit write failed:", err instanceof Error ? err.message : String(err)));

    // Auto-open a server-side case record when the screening yields hits.
    // Fire-and-forget — never blocks the response.
    if (finalResult.hits.length > 0 && finalResult.severity !== "clear") {
      const autoTenant = tenantIdFromGate(gate);
      const caseNow = new Date().toISOString();
      const autoCaseId = `case-auto-${randomUUID()}`;
      const badgeTone: CaseRecord["badgeTone"] =
        finalResult.severity === "critical" ? "violet" : "orange";
      const autoCase: CaseRecord = {
        id: autoCaseId,
        badge: "sanctions_hit",
        badgeTone,
        subject: subject.name,
        meta: `${finalResult.severity} · ${finalResult.hits.length} hit(s) · ${subject.entityType ?? "unknown"}`,
        status: "active",
        evidenceCount: String(finalResult.hits.length),
        lastActivity: caseNow,
        opened: caseNow,
        statusLabel: "Open",
        statusDetail: "Pending MLRO triage",
        evidence: finalResult.hits.slice(0, 10).map((h) => ({
          category: "screening-report" as const,
          title: `${h.listId}: ${h.candidateName}`,
          meta: `Score ${Math.round(h.score * 100)}% via ${h.method}`,
          detail: h.listRef ?? "",
        })),
        timeline: [
          { timestamp: caseNow, event: `Auto-opened: ${finalResult.severity} severity, ${finalResult.hits.length} hit(s) across ${finalResult.listsChecked} lists` },
        ],
        screeningSnapshot: {
          subject: {
            id: autoCaseId,
            name: subject.name,
            entityType: (subject.entityType ?? "other") as "individual" | "organisation" | "vessel" | "aircraft" | "other",
            jurisdiction: subject.jurisdiction,
            aliases: subject.aliases,
          },
          result: {
            topScore: finalResult.topScore,
            severity: finalResult.severity,
            hits: finalResult.hits.slice(0, 20).map((h) => ({
              listId: h.listId,
              listRef: h.listRef,
              candidateName: h.candidateName,
              score: h.score,
              method: h.method,
              programs: h.programs,
            })),
          },
          capturedAt: caseNow,
        },
      };
      void insertCaseRecord(autoTenant, autoCase).catch((err: unknown) => {
        console.warn("[quick-screen] auto-case insert failed:", err instanceof Error ? err.message : String(err));
      });
    }

    // Auto-enroll in pKYC ongoing monitoring for medium+ severity subjects.
    // Uses a deterministic ID keyed on name so re-screening the same subject
    // does not create duplicate monitoring subjects.
    if (["medium", "high", "critical"].includes(finalResult.severity)) {
      const pkycId = `pkyc-auto-${subject.name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 40)}`;
      const pkycTenant = tenantIdFromGate(gate);
      void (async () => {
        try {
          const existing = await getSubject(pkycId, pkycTenant);
          if (!existing) {
            const cadence = finalResult.severity === "critical" ? "weekly" : finalResult.severity === "high" ? "monthly" : "quarterly";
            const pkycNow = new Date().toISOString();
            const nextRun = new Date(pkycNow);
            if (cadence === "weekly") nextRun.setUTCDate(nextRun.getUTCDate() + 7);
            else if (cadence === "monthly") nextRun.setUTCMonth(nextRun.getUTCMonth() + 1);
            else nextRun.setUTCMonth(nextRun.getUTCMonth() + 3);
            await saveSubject({
              id: pkycId,
              name: subject.name,
              entityType: subject.entityType,
              jurisdiction: subject.jurisdiction,
              nationality: subject.nationality,
              dob: subject.dateOfBirth,
              aliases: subject.aliases,
              cadence,
              status: "active",
              enrolledAt: pkycNow,
              lastRunAt: null,
              nextRunAt: nextRun.toISOString(),
              lastBand: null,
              lastComposite: null,
              lastHits: finalResult.hits.length,
              runCount: 0,
              alertCount: 0,
              notes: `Auto-enrolled from screening: ${finalResult.severity} severity`,
            }, pkycTenant);
          }
        } catch (err) {
          console.warn("[quick-screen] pkyc auto-enroll failed:", err instanceof Error ? err.message : String(err));
        }
      })();
    }

    const fullPayload = {
      ok: true,
      resultId: qsResultId,
      ...finalResult,
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
        // Reliability of a clean verdict. `false` means the "clear" was produced
        // against stale/missing/empty lists or a static-seed corpus and must NOT
        // be treated as a documentable negative finding without remediation.
        clearVerdictReliable,
        ...(verdictQualifier ? { verdictQualifier } : {}),
        ...(maxListAgeHours !== null ? { maxListAgeHours } : {}),
        // Data source health provenance — always present so clients and audit
        // tools can verify whether a screen ran against live or static data.
        dataSourceHealth: corpusHealth ? toDataSourceHealth(corpusHealth) : undefined,
        // Machine-readable provenance — list health at screening time.
        _provenance: {
          listsChecked: result.listsChecked,
          listsCheckedWithData,
          listsNotLoaded: missingLists.length,
          missingLists,
          staleListIds,
          degradedListIds,
          listHealthAvailable: listHealth !== null,
          newsAdaptersUsed: newsArticles.providersUsed,
          newsArticleCount: newsArticles.articles.length,
        },
        // Country-risk tier from FATF/UAE classification (separate from match severity).
        riskLevel,
        ...(countryRisk ? { riskBasis: countryRisk.basis } : {}),
        // Structured breakdown of list coverage at screening time.
        // listsChecked (scalar) is preserved for backward compatibility;
        // listsCheckedDetails adds per-category detail for compliance UIs.
        ...(listHealth ? {
          listsCheckedDetails: {
            total: Object.keys(listHealth).length,
            checked: listsCheckedWithData,
            skipped: [
              ...degradedListIds.map((id) => ({ listId: id, reason: "empty — zero entities" })),
              ...missingLists.map((id) => ({ listId: id, reason: "missing — no blob" })),
            ],
            degraded: staleListIds.map((id) => ({ listId: id, note: "stale — exceeds 36h threshold" })),
            listIds: finalResult.listIds ?? [],
          },
        } : {}),
    } as QuickScreenResponse;
    // If this was a re-enrichment poll call, persist the full result so
    // subsequent polls return the cached enriched data without re-running adapters.
    if (enrichJobId) {
      void completeEnrichmentJob(enrichJobId, fullPayload as Record<string, unknown>).catch((err: unknown) => console.warn("[quick-screen] completeEnrichmentJob failed:", err instanceof Error ? err.message : String(err)));
    }

    // ── Cache SET ──────────────────────────────────────────────────────────
    // Store the full payload for repeat callers. Sweep stale entries on every
    // write so the Map doesn't grow unbounded during a long-running Lambda.
    if (!cacheBypass) {
      const now = Date.now();
      for (const [k, v] of _screenCache) {
        if (now - v.cachedAt >= SCREEN_CACHE_TTL_MS) _screenCache.delete(k);
      }
      _screenCache.set(cacheKey, { result: fullPayload, cachedAt: now });
    }

    return respond(200, fullPayload, { ...gateHeaders, "x-cache": "MISS" });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (Date.now() - t0 > 3000) console.warn(`[quick-screen] slow response latencyMs=${Date.now() - t0}`);
    return respond(
      500,
      { ok: false, errorCode: "HANDLER_EXCEPTION", errorType: "internal", tool: "screen_subject", error: "quick-screen failed", detail, requestId: randomUUID(), latencyMs: Date.now() - t0 } as QuickScreenResponse & { errorCode: string; errorType: string; tool: string; requestId: string; latencyMs: number },
      gateHeaders,
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
