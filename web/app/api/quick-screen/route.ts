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

// Compiled backend entry point. The root `tsc` build (npm run build at the repo root)
// must run before this API route is bundled. Netlify build order is encoded in
// netlify.toml; local dev runs `npm run build` at the root once to produce dist/.
import { quickScreen as brainQuickScreen } from "../../../../dist/src/brain/quick-screen.js";

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
}

const MAX_CANDIDATES = 5_000;

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

function respond(
  status: number,
  body: QuickScreenResponse,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(body, { status, headers: { ...CORS_HEADERS, ...headers } });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
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
        // Empty corpus is a real concern — sanctions screening with zero
        // candidates ALWAYS returns CLEAR. Fail loud rather than degrade.
        return respond(503, { ok: false, error: "watchlist corpus unavailable", detail: "no valid candidates loaded" }, gateHeaders);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[quick-screen] loadCandidates failed", detail);
      return respond(503, { ok: false, error: "watchlist corpus unavailable", detail }, gateHeaders);
    }
  }

  try {
    const result = quickScreen(subject, candidates, body.options ?? {});
    // Augment with OpenSanctions live results when local matcher returns
    // few/no hits — adds a free additional signal layer beyond the bundled
    // watchlists. Best-effort: failure here doesn't 5xx the screening.
    let openSanctionsResults: Awaited<ReturnType<typeof LIVE_OPENSANCTIONS_ADAPTER.lookup>> = [];
    let commercialResults: Awaited<ReturnType<ReturnType<typeof bestCommercialAdapter>["lookup"]>> = [];
    let registryResults: Awaited<ReturnType<typeof searchAllRegistries>> = { records: [], providersUsed: [] };
    if (result.hits.length < 3 && subject.name.length >= 3) {
      try {
        openSanctionsResults = await LIVE_OPENSANCTIONS_ADAPTER.lookup(
          subject.name,
          subject.jurisdiction ?? undefined,
        );
      } catch { /* best-effort */ }
      // Commercial adapters (LSEG World-Check / Dow Jones R&C / Sayari)
      // — only fires when the operator has dropped a key into Netlify env.
      const commAdapter = bestCommercialAdapter();
      if (commAdapter.isAvailable()) {
        try {
          commercialResults = await commAdapter.lookup(
            subject.name,
            subject.jurisdiction ?? undefined,
          );
        } catch { /* best-effort */ }
      }
      // Corporate-registry adapters (OpenCorporates, UK Companies House,
      // SEC EDGAR, ICIJ Offshore Leaks, Crunchbase, PitchBook) — env-gated.
      try {
        registryResults = await searchAllRegistries(
          subject.name,
          subject.jurisdiction ? { jurisdiction: subject.jurisdiction, limit: 10 } : { limit: 10 },
        );
      } catch { /* best-effort */ }
    }

    // Country-specific public registries (Companies House, FCA, INSEE,
    // ZEFIX, KVK, Brønnøysund, CVR, YTJ, ABR, ACRA, NZBN, etc.) and
    // country-issued sanctions lists (OFAC, HMT-OFSI, EU EBA, UN-SC,
    // DFAT, SECO, SEMA, MAS, EOCN, METI). Always run when configured —
    // these are the authoritative sources operators are auditioned on.
    let countryRegistryResults: Awaited<ReturnType<typeof searchCountryRegistries>> = { records: [], jurisdictions: [] };
    let countrySanctionsResults: Awaited<ReturnType<typeof searchCountrySanctions>> = { records: [], lists: [] };
    let freeAdapterResults: Awaited<ReturnType<typeof searchFreeAdapters>> = { records: [], providersUsed: [] };
    if (subject.name.length >= 3) {
      try {
        countryRegistryResults = await searchCountryRegistries(subject.name, subject.jurisdiction ?? undefined, 10);
      } catch { /* best-effort */ }
      try {
        countrySanctionsResults = await searchCountrySanctions(subject.name, subject.jurisdiction ?? undefined, 10);
      } catch { /* best-effort */ }
      // Free always-on layer (Wikidata + World Bank Debarred Firms + FATF)
      try {
        freeAdapterResults = await searchFreeAdapters(subject.name, subject.jurisdiction ?? undefined, 10);
      } catch { /* best-effort */ }
    }
    return respond(
      200,
      {
        ok: true,
        ...result,
        ...(openSanctionsResults.length > 0
          ? { openSanctionsAugmentation: openSanctionsResults.slice(0, 10) }
          : {}),
        ...(commercialResults.length > 0
          ? {
              commercialAugmentation: commercialResults.slice(0, 10),
              commercialProvider: activeCommercialProvider(),
            }
          : {}),
        ...(registryResults.records.length > 0
          ? {
              registryAugmentation: registryResults.records.slice(0, 15),
              registryProviders: registryResults.providersUsed,
            }
          : {}),
        ...(countryRegistryResults.records.length > 0
          ? {
              countryRegistryAugmentation: countryRegistryResults.records.slice(0, 15),
              countryRegistryJurisdictions: countryRegistryResults.jurisdictions,
            }
          : {}),
        ...(countrySanctionsResults.records.length > 0
          ? {
              countrySanctionsAugmentation: countrySanctionsResults.records.slice(0, 15),
              countrySanctionsLists: countrySanctionsResults.lists,
            }
          : {}),
        ...(freeAdapterResults.records.length > 0
          ? {
              freeAdapterAugmentation: freeAdapterResults.records.slice(0, 15),
              freeAdapterProviders: freeAdapterResults.providersUsed,
            }
          : {}),
      } as QuickScreenResponse,
      gateHeaders,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return respond(
      500,
      { ok: false, error: "quick-screen failed", detail },
      gateHeaders,
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
