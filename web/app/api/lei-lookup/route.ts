// POST /api/lei-lookup  (also GET for convenience)
// GLEIF LEI lookup — single record by LEI code or name/country search.
// Body: { lei?: string; companyName?: string; countryCode?: string }
// GET:  ?lei=<LEI>  or  ?legalName=<name>&countryCode=<ISO2>  or  ?name=<name>
//
// Enhanced features (v2):
//   - Direct parent resolution (1 hop, with country)
//   - Ultimate parent resolution (top of chain, with country)
//   - Registration status risk: LAPSED (+20), PENDING_ARCHIVAL (+10)
//   - Jurisdiction mismatch: LEI registration country ≠ legal address country (+15)
//   - High-risk parent: direct/ultimate parent in FATF grey/blacklist (+25)
//   - Netlify Blobs cache with 24h TTL
//   - AbortController timeout on all GLEIF fetches

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { getCountryRisk } from "@/lib/server/high-risk-countries";

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ── Public response types ──────────────────────────────────────────────────

export interface LeiParent {
  lei: string;
  name: string;
  country: string;
}

export interface LeiLookupResult {
  ok: true;
  lei: string;
  /** Entity legal name as registered with GLEIF. */
  entityName: string;
  /** LEI registration status (entity lifecycle). */
  status:
    | "ISSUED"
    | "LAPSED"
    | "RETIRED"
    | "PENDING_TRANSFER"
    | "PENDING_ARCHIVAL"
    | "DUPLICATE"
    | "ANNULLED"
    | "CANCELLED"
    | "MERGED";
  /** Formatted legal address string. */
  legalAddress: string;
  /** ISO-2 country code of the entity's legal address. */
  legalAddressCountry: string;
  /** ISO-2 country where the LEI was registered (from the managing LOU). */
  registrationCountry: string;
  /** Direct parent entity (one hop up the ownership chain). */
  directParent?: LeiParent;
  /** Ultimate parent entity (top of the ownership chain). */
  ultimateParent?: LeiParent;
  /** AML risk flags identified during enrichment. */
  riskFlags: string[];
  /** Composite risk score 0–100 (sum of weighted flag scores, capped at 100). */
  riskScore: number;
  /** ISO-8601 timestamp of the GLEIF record's last update. */
  lastUpdated: string;
  // Legacy fields (backward-compat for callers using the v1 shape)
  legalName?: string;
  jurisdiction?: string;
  legalForm?: string;
  registrationStatus?: string;
  headquartersAddress?: string;
  registeredAddress?: string;
  ultimateParent_legacy?: { lei: string; legalName: string; relationship: string };
  directParent_legacy?: { lei: string; legalName: string; relationship: string };
}

// ── GLEIF API types ────────────────────────────────────────────────────────

interface GleifAddress {
  addressLines?: string[];
  city?: string;
  country?: string;
  postalCode?: string;
}

interface GleifLeiRecord {
  data?: {
    attributes?: {
      lei?: string;
      entity?: {
        legalName?: { name?: string };
        jurisdiction?: string;
        legalForm?: { id?: string };
        legalAddress?: GleifAddress;
        headquartersAddress?: GleifAddress;
        status?: string;
      };
      registration?: {
        status?: string;
        lastUpdateDate?: string;
        managingLou?: string;
        corroborationLevel?: string;
      };
    };
    relationships?: {
      "ultimate-parent"?: { data?: { id?: string } };
      "direct-parent"?: { data?: { id?: string } };
      "managing-lou"?: { data?: { id?: string } };
    };
  };
}

interface GleifFuzzyResponse {
  data?: Array<{
    lei?: string;
    name?: string;
    jurisdiction?: string;
    status?: string;
  }>;
}

// ── Address formatting ─────────────────────────────────────────────────────

function formatGleifAddress(addr?: GleifAddress): string {
  if (!addr) return "Not available";
  const parts = [
    ...(addr.addressLines ?? []),
    addr.city,
    addr.postalCode,
    addr.country,
  ].filter(Boolean);
  return parts.join(", ") || "Not available";
}

// ── Risk scoring ───────────────────────────────────────────────────────────

type RiskFlag = string;

function computeRisk(flags: RiskFlag[]): number {
  let score = 0;
  for (const flag of flags) {
    if (flag.startsWith("lapsed_registration")) score += 20;
    else if (flag.startsWith("pending_archival")) score += 10;
    else if (flag.startsWith("jurisdiction_mismatch")) score += 15;
    else if (flag.startsWith("parent_in_high_risk_jurisdiction")) score += 25;
  }
  return Math.min(score, 100);
}

// ── Netlify Blobs cache — 24h TTL ─────────────────────────────────────────

const LEI_CACHE_STORE_NAME = "hawkeye-lei-cache";
const LEI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface LeiCacheBlobMod {
  getStore: (_opts: { name: string; siteID?: string; token?: string }) => {
    get: (_key: string, _opts?: { type?: string }) => Promise<unknown>;
    setJSON: (_key: string, _value: unknown) => Promise<void>;
  };
}

async function loadLeiCacheStore(): Promise<ReturnType<LeiCacheBlobMod["getStore"]> | null> {
  try {
    const mod = (await import("@netlify/blobs")) as unknown as LeiCacheBlobMod;
    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token =
      process.env["NETLIFY_BLOBS_TOKEN"] ??
      process.env["NETLIFY_API_TOKEN"] ??
      process.env["NETLIFY_AUTH_TOKEN"];
    return mod.getStore(
      siteID && token
        ? { name: LEI_CACHE_STORE_NAME, siteID, token }
        : { name: LEI_CACHE_STORE_NAME },
    );
  } catch {
    return null;
  }
}

interface LeiCacheEntry {
  result: LeiLookupResult;
  cachedAt: string;
}

async function readLeiCache(lei: string): Promise<LeiLookupResult | null> {
  const store = await loadLeiCacheStore();
  if (!store) return null;
  try {
    const raw = (await store.get(`${lei}.json`, { type: "json" })) as LeiCacheEntry | null;
    if (!raw?.result || !raw.cachedAt) return null;
    const ageMs = Date.now() - Date.parse(raw.cachedAt);
    if (!Number.isFinite(ageMs) || ageMs > LEI_CACHE_TTL_MS) return null;
    return raw.result;
  } catch {
    return null;
  }
}

async function writeLeiCache(lei: string, result: LeiLookupResult): Promise<void> {
  const store = await loadLeiCacheStore();
  if (!store) return;
  try {
    await store.setJSON(`${lei}.json`, { result, cachedAt: new Date().toISOString() });
  } catch {
    // never block on cache write failures
  }
}

// ── GLEIF fetch helpers ────────────────────────────────────────────────────

const GLEIF_RETRY_BACKOFF_MS = [250, 750] as const;

function isTransientGleifError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("enotfound") ||
    m.includes("network")
  );
}

/** Fetch a single raw GLEIF entity record (no caching). */
async function fetchGleifRaw(lei: string): Promise<GleifLeiRecord | null> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(
        `https://api.gleif.org/api/v1/lei-records/${encodeURIComponent(lei)}`,
        {
          headers: { accept: "application/vnd.api+json" },
          signal: controller.signal,
        },
      );
      if (res.status >= 500) throw new Error(`gleif 5xx: ${res.status}`);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return (await res.json().catch(() => ({}))) as GleifLeiRecord;
    } catch (err) {
      lastErr = err;
      if (!isTransientGleifError(err)) break;
      const backoff = GLEIF_RETRY_BACKOFF_MS[attempt] ?? 750;
      await new Promise((r) => setTimeout(r, backoff));
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr)
    console.warn(
      `[lei-lookup] all GLEIF attempts failed for ${lei}:`,
      lastErr instanceof Error ? lastErr.message : lastErr,
    );
  return null;
}

/** Minimal parent entity info — just lei, name, country. */
interface ParentEntityInfo {
  lei: string;
  name: string;
  country: string;
}

async function fetchParentInfo(lei: string): Promise<ParentEntityInfo | null> {
  const raw = await fetchGleifRaw(lei).catch(() => null);
  if (!raw?.data?.attributes) return null;
  const attr = raw.data.attributes;
  const country =
    attr.entity?.legalAddress?.country ??
    attr.entity?.jurisdiction?.substring(0, 2) ??
    "";
  return {
    lei,
    name: attr.entity?.legalName?.name ?? "Unknown",
    country: country.toUpperCase(),
  };
}

// ── Determine registration country from managing LOU ─────────────────────
// GLEIF LEI records carry the managing LOU's LEI in relationships.
// The managing LOU's LEI prefix (first 4 chars after the 4-char alpha prefix)
// does NOT directly encode a country — the LOU entity itself has a legal address.
// As a practical approximation we use:
//   1. The entity's jurisdiction field (often "XX-" prefix = ISO-2)
//   2. The entity's own legal address country
// The jurisdiction_mismatch flag fires when the LEI issuing jurisdiction country
// (derived from entity.jurisdiction prefix) differs from legalAddress.country.
function extractRegistrationCountry(attr: GleifLeiRecord["data"] extends undefined ? never : NonNullable<GleifLeiRecord["data"]>["attributes"]): string {
  if (!attr) return "";
  // GLEIF entity.jurisdiction is typically "XX" or "XX-YY" where XX is ISO-2
  const jurisdiction = attr.entity?.jurisdiction ?? "";
  const jurisdictionCountry = jurisdiction.length >= 2 ? jurisdiction.substring(0, 2).toUpperCase() : "";
  return jurisdictionCountry;
}

// ── Core enriched fetch ────────────────────────────────────────────────────

async function fetchEnrichedRecord(lei: string): Promise<LeiLookupResult | null> {
  const raw = await fetchGleifRaw(lei);
  if (!raw?.data?.attributes) return null;

  const attr = raw.data.attributes;
  const entity = attr.entity;
  const reg = attr.registration;
  const relships = raw.data.relationships;

  // Status
  const statusRaw = (reg?.status ?? entity?.status ?? "ISSUED").toUpperCase();
  const validStatuses = new Set([
    "ISSUED", "LAPSED", "RETIRED", "PENDING_TRANSFER", "PENDING_ARCHIVAL",
    "DUPLICATE", "ANNULLED", "CANCELLED", "MERGED",
  ]);
  const status = (validStatuses.has(statusRaw) ? statusRaw : "ISSUED") as LeiLookupResult["status"];

  // Addresses
  const legalAddress = formatGleifAddress(entity?.legalAddress);
  const legalAddressCountry = (entity?.legalAddress?.country ?? "").toUpperCase();
  const registrationCountry = extractRegistrationCountry(attr);

  // Parent resolution — run concurrently
  const directParentLei = relships?.["direct-parent"]?.data?.id;
  const ultimateParentLei = relships?.["ultimate-parent"]?.data?.id;

  const [directParentInfo, ultimateParentInfo] = await Promise.all([
    directParentLei ? fetchParentInfo(directParentLei).catch(() => null) : Promise.resolve(null),
    ultimateParentLei && ultimateParentLei !== directParentLei
      ? fetchParentInfo(ultimateParentLei).catch(() => null)
      : Promise.resolve(null),
  ]);

  // If ultimate === direct, reuse the direct info
  const resolvedUltimate: LeiParent | undefined =
    ultimateParentInfo
      ? { lei: ultimateParentLei!, name: ultimateParentInfo.name, country: ultimateParentInfo.country }
      : ultimateParentLei && ultimateParentLei === directParentLei && directParentInfo
        ? { lei: directParentLei, name: directParentInfo.name, country: directParentInfo.country }
        : undefined;

  // ── Risk flags ──────────────────────────────────────────────────────────

  const riskFlags: string[] = [];

  // (c) Registration status check
  if (status === "LAPSED") {
    riskFlags.push(
      "lapsed_registration — LEI registration has lapsed; entity may be inactive or a shell company that stopped maintaining its LEI (+20)",
    );
  } else if (status === "PENDING_ARCHIVAL") {
    riskFlags.push(
      "pending_archival — LEI is pending archival; registration maintenance discontinued (+10)",
    );
  }

  // (d) Jurisdiction mismatch
  if (
    registrationCountry &&
    legalAddressCountry &&
    registrationCountry !== legalAddressCountry
  ) {
    riskFlags.push(
      `jurisdiction_mismatch — LEI registration country (${registrationCountry}) differs from entity legal address country (${legalAddressCountry}) (+15)`,
    );
  }

  // (e) High-risk jurisdiction parent
  const directCountry = directParentInfo?.country ?? "";
  const ultimateCountry = resolvedUltimate?.country ?? "";

  const directParentRisk = getCountryRisk(directCountry);
  const ultimateParentRisk = getCountryRisk(ultimateCountry);

  if (directParentRisk) {
    riskFlags.push(
      `parent_in_high_risk_jurisdiction — direct parent (${directParentInfo?.name ?? directParentLei}) is registered in ${directParentRisk.name} (${directCountry}), a FATF ${directParentRisk.tier} jurisdiction; basis: ${directParentRisk.basis.join(", ")} (+25)`,
    );
  } else if (ultimateParentRisk && ultimateParentLei !== directParentLei) {
    riskFlags.push(
      `parent_in_high_risk_jurisdiction — ultimate parent (${resolvedUltimate?.name ?? ultimateParentLei}) is registered in ${ultimateParentRisk.name} (${ultimateCountry}), a FATF ${ultimateParentRisk.tier} jurisdiction; basis: ${ultimateParentRisk.basis.join(", ")} (+25)`,
    );
  }

  const riskScore = computeRisk(riskFlags);

  const result: LeiLookupResult = {
    ok: true,
    lei: attr.lei ?? lei,
    entityName: entity?.legalName?.name ?? "Unknown",
    status,
    legalAddress,
    legalAddressCountry,
    registrationCountry,
    ...(directParentInfo
      ? { directParent: { lei: directParentLei!, name: directParentInfo.name, country: directParentInfo.country } }
      : {}),
    ...(resolvedUltimate ? { ultimateParent: resolvedUltimate } : {}),
    riskFlags,
    riskScore,
    lastUpdated: reg?.lastUpdateDate ?? new Date().toISOString(),
    // Legacy compat
    legalName: entity?.legalName?.name ?? "Unknown",
    jurisdiction: entity?.jurisdiction ?? "",
    legalForm: entity?.legalForm?.id ?? "Unknown",
    registrationStatus: reg?.status ?? status,
    headquartersAddress: formatGleifAddress(entity?.headquartersAddress),
    registeredAddress: legalAddress,
    ...(directParentInfo
      ? { directParent_legacy: { lei: directParentLei!, legalName: directParentInfo.name, relationship: "IS_DIRECTLY_CONSOLIDATED_BY" } }
      : {}),
    ...(resolvedUltimate
      ? { ultimateParent_legacy: { lei: resolvedUltimate.lei, legalName: resolvedUltimate.name, relationship: "IS_ULTIMATELY_CONSOLIDATED_BY" } }
      : {}),
  };

  return result;
}

// ── Cache-through wrapper ──────────────────────────────────────────────────

async function fetchLeiRecord(lei: string): Promise<LeiLookupResult | null> {
  const live = await fetchEnrichedRecord(lei);
  if (live) {
    void writeLeiCache(lei, live).catch((err: unknown) =>
      console.warn(
        "[lei-lookup] cache write failed:",
        err instanceof Error ? err.message : String(err),
      ),
    );
    return live;
  }
  // Serve cached record if live is unavailable
  const cached = await readLeiCache(lei);
  if (cached) {
    return {
      ...cached,
      _degraded: true,
      _cacheNote:
        "GLEIF unreachable — record served from 24h cache. Re-verify before any compliance decision.",
    } as LeiLookupResult & { _degraded: boolean; _cacheNote: string };
  }
  return null;
}

// ── Name search ────────────────────────────────────────────────────────────

async function searchByName(
  name: string,
  countryCode?: string,
): Promise<Array<{ lei: string; legalName: string; jurisdiction: string; status: string }>> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    try {
      // Try structured name+country search first
      if (countryCode) {
        const structuredUrl = new URL("https://api.gleif.org/api/v1/lei-records");
        structuredUrl.searchParams.set("filter[entity.legalName]", name);
        structuredUrl.searchParams.set("filter[entity.legalAddress.country]", countryCode.toUpperCase());
        structuredUrl.searchParams.set("page[size]", "5");
        const res = await fetch(structuredUrl.toString(), {
          headers: { accept: "application/vnd.api+json" },
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            data?: Array<{
              attributes?: {
                lei?: string;
                entity?: { legalName?: { name?: string }; jurisdiction?: string; status?: string };
                registration?: { status?: string };
              };
            }>;
          };
          const results = (data.data ?? []).map((d) => ({
            lei: d.attributes?.lei ?? "",
            legalName: d.attributes?.entity?.legalName?.name ?? "",
            jurisdiction: d.attributes?.entity?.jurisdiction ?? "",
            status: d.attributes?.registration?.status ?? d.attributes?.entity?.status ?? "",
          })).filter((r) => r.lei);
          if (results.length > 0) return results;
        }
      }
      // Fallback to fuzzy completions
      const url = `https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=${encodeURIComponent(name)}&pageSize=5`;
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const data = (await res.json().catch(() => ({}))) as GleifFuzzyResponse;
      return (data.data ?? []).map((d) => ({
        lei: d.lei ?? "",
        legalName: d.name ?? "",
        jurisdiction: d.jurisdiction ?? "",
        status: d.status ?? "",
      }));
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return [];
  }
}

// ── Route handlers ─────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const lei = searchParams.get("lei")?.trim().toUpperCase();
  const legalName =
    searchParams.get("legalName")?.trim() ??
    searchParams.get("name")?.trim() ??
    searchParams.get("companyName")?.trim();
  const countryCode = searchParams.get("countryCode")?.trim().toUpperCase();

  if (!lei && !legalName) {
    return NextResponse.json(
      { ok: false, error: "Provide ?lei=<20-char LEI> or ?legalName=<name>" },
      { status: 400, headers: { ...gate.headers, ...CORS } },
    );
  }

  if (lei) {
    if (lei.length !== 20) {
      return NextResponse.json(
        { ok: false, error: "LEI must be exactly 20 characters" },
        { status: 400, headers: { ...gate.headers, ...CORS } },
      );
    }
    const record = await fetchLeiRecord(lei);
    if (record)
      return NextResponse.json(record, { status: 200, headers: { ...gate.headers, ...CORS } });
    return NextResponse.json(
      { ok: false, error: "GLEIF API temporarily unreachable — please retry.", degraded: true },
      { status: 503, headers: { ...gate.headers, ...CORS } },
    );
  }

  const matches = await searchByName(legalName!, countryCode);
  if (matches.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No LEI found for that name", degraded: true },
      { status: 404, headers: { ...gate.headers, ...CORS } },
    );
  }

  const topMatch = matches[0]!;
  if (topMatch.lei) {
    const record = await fetchLeiRecord(topMatch.lei);
    if (record)
      return NextResponse.json(record, { status: 200, headers: { ...gate.headers, ...CORS } });
  }

  // Minimal fallback from fuzzy results
  const minimal: LeiLookupResult = {
    ok: true,
    lei: topMatch.lei || "N/A",
    entityName: topMatch.legalName,
    status: (topMatch.status as LeiLookupResult["status"]) || "ISSUED",
    legalAddress: "Not available",
    legalAddressCountry: topMatch.jurisdiction?.substring(0, 2).toUpperCase() ?? "",
    registrationCountry: topMatch.jurisdiction?.substring(0, 2).toUpperCase() ?? "",
    riskFlags: [],
    riskScore: 0,
    lastUpdated: new Date().toISOString(),
    legalName: topMatch.legalName,
    jurisdiction: topMatch.jurisdiction,
    legalForm: "Unknown",
    registrationStatus: topMatch.status || "ISSUED",
    headquartersAddress: "Not available",
    registeredAddress: "Not available",
  };
  return NextResponse.json(minimal, { status: 200, headers: { ...gate.headers, ...CORS } });
}

interface LeiLookupBody {
  lei?: string;
  companyName?: string;
  legalName?: string;
  countryCode?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const _handlerStart = Date.now();
  try {
    const gate = await enforce(req);
    if (!gate.ok) return gate.response;

    let body: LeiLookupBody;
    try {
      body = (await req.json()) as LeiLookupBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400, headers: { ...gate.headers, ...CORS } },
      );
    }

    const lei = body.lei?.trim().toUpperCase();
    const legalName = (body.companyName ?? body.legalName)?.trim();
    const countryCode = body.countryCode?.trim().toUpperCase();

    if (!lei && !legalName) {
      return NextResponse.json(
        { ok: false, error: "Provide lei, companyName, or legalName" },
        { status: 400, headers: { ...gate.headers, ...CORS } },
      );
    }

    // Direct LEI lookup
    if (lei) {
      if (lei.length !== 20) {
        return NextResponse.json(
          { ok: false, error: "LEI must be exactly 20 characters" },
          { status: 400, headers: { ...gate.headers, ...CORS } },
        );
      }
      const record = await fetchLeiRecord(lei);
      if (record) {
        const latencyMs = Date.now() - _handlerStart;
        return NextResponse.json(
          { ...record, latencyMs },
          { status: 200, headers: { ...gate.headers, ...CORS } },
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error: "GLEIF API temporarily unreachable — please retry in a few seconds.",
          degraded: true,
        },
        { status: 503, headers: { ...gate.headers, ...CORS } },
      );
    }

    // Name search — return first match as full enriched record
    const matches = await searchByName(legalName!, countryCode);
    if (matches.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No LEI found for that name. Please retry or provide a LEI directly." },
        { status: 404, headers: { ...gate.headers, ...CORS } },
      );
    }

    const topMatch = matches[0]!;
    if (topMatch.lei) {
      const record = await fetchLeiRecord(topMatch.lei);
      if (record) {
        const latencyMs = Date.now() - _handlerStart;
        return NextResponse.json(
          { ...record, latencyMs },
          { status: 200, headers: { ...gate.headers, ...CORS } },
        );
      }
    }

    // Minimal fallback from fuzzy completion data
    const minimal: LeiLookupResult = {
      ok: true,
      lei: topMatch.lei || "N/A",
      entityName: topMatch.legalName,
      status: (topMatch.status as LeiLookupResult["status"]) || "ISSUED",
      legalAddress: "Not available",
      legalAddressCountry: topMatch.jurisdiction?.substring(0, 2).toUpperCase() ?? "",
      registrationCountry: topMatch.jurisdiction?.substring(0, 2).toUpperCase() ?? "",
      riskFlags: [],
      riskScore: 0,
      lastUpdated: new Date().toISOString(),
      legalName: topMatch.legalName,
      jurisdiction: topMatch.jurisdiction,
      legalForm: "Unknown",
      registrationStatus: topMatch.status || "ISSUED",
      headquartersAddress: "Not available",
      registeredAddress: "Not available",
    };

    const latencyMs = Date.now() - _handlerStart;
    if (latencyMs > 5000) console.warn(`[lei_lookup] latencyMs=${latencyMs} exceeds 5000ms`);
    return NextResponse.json(
      { ...minimal, latencyMs },
      { status: 200, headers: { ...gate.headers, ...CORS } },
    );
  } catch (err) {
    console.error(
      "[lei-lookup] unhandled exception:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      {
        ok: false,
        errorCode: "HANDLER_EXCEPTION",
        errorType: "internal",
        tool: "lei_lookup",
        message: "LEI lookup failed",
        retryAfterSeconds: null,
        requestId: randomBytes(4).toString("hex"),
        latencyMs: Date.now() - _handlerStart,
      },
      { status: 500, headers: { ...CORS } },
    );
  }
}
