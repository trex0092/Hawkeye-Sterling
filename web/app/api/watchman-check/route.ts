// GET/POST /api/watchman-check
// Free sanctions screening via Moov Watchman public API (https://watchman.moov.io).
// Covers: OFAC SDN, BIS Entity List, Military End-User, UK Consolidated,
// EU Consolidated, Canadian OSFI, Interpol Notices and more — all free, no API key.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const WATCHMAN_BASE = "https://watchman.moov.io";
const WATCHMAN_TIMEOUT_MS = 8_000;
const DEFAULT_LIMIT = 20;
const MATCH_THRESHOLD = 0.82;

interface WatchmanHit {
  listId: string;
  listRef: string;
  listLabel: string;
  candidateName: string;
  matchedAlias?: string;
  score: number;      // 0-100 (normalised from Watchman's 0-1)
  method: string;
  programs?: string[];
  reason?: string;
  sdnType?: string;
}

interface WatchmanResponse {
  ok: true;
  subject: string;
  hits: WatchmanHit[];
  totalHits: number;
  listsChecked: string[];
  aboveThreshold: number;
  source: "watchman-moov";
  latencyMs: number;
  fetchedAt: string;
}

// Normalise a raw Watchman SDN entity into our standard hit shape.
function normaliseSdn(entity: Record<string, unknown>): WatchmanHit {
  const score = typeof entity["match"] === "number" ? Math.round(entity["match"] as number * 100) : 0;
  const programs = Array.isArray(entity["programs"]) ? (entity["programs"] as string[]) : [];
  const remarks = typeof entity["remarks"] === "string" ? (entity["remarks"] as string).slice(0, 200) : undefined;
  return {
    listId: "ofac_sdn",
    listRef: String(entity["entityID"] ?? ""),
    listLabel: "OFAC SDN",
    candidateName: String(entity["SDNName"] ?? entity["matchedName"] ?? ""),
    matchedAlias: typeof entity["matchedName"] === "string" && entity["matchedName"] !== entity["SDNName"]
      ? String(entity["matchedName"])
      : undefined,
    score,
    method: "watchman",
    programs: programs.length > 0 ? programs : undefined,
    reason: remarks,
    sdnType: typeof entity["sdnType"] === "string" ? String(entity["sdnType"]) : undefined,
  };
}

function normaliseGeneric(
  entity: Record<string, unknown>,
  listId: string,
  listLabel: string,
  nameField: string,
): WatchmanHit {
  const score = typeof entity["match"] === "number" ? Math.round(entity["match"] as number * 100) : 0;
  return {
    listId,
    listRef: String(entity["id"] ?? entity["entityID"] ?? ""),
    listLabel,
    candidateName: String(entity[nameField] ?? entity["matchedName"] ?? ""),
    matchedAlias: typeof entity["matchedName"] === "string" && entity["matchedName"] !== entity[nameField]
      ? String(entity["matchedName"])
      : undefined,
    score,
    method: "watchman",
    reason: typeof entity["remarks"] === "string" ? (entity["remarks"] as string).slice(0, 200) : undefined,
  };
}

async function fetchWatchman(name: string, limit: number): Promise<WatchmanResponse> {
  const t0 = Date.now();
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WATCHMAN_TIMEOUT_MS);

  try {
    const url = `${WATCHMAN_BASE}/search?q=${encodeURIComponent(name)}&limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/0.2; +https://hawkeye-sterling.netlify.app)",
        accept: "application/json",
      },
      signal: controller.signal,
    } as RequestInit);

    if (!res.ok) {
      console.warn(`[watchman-check] Watchman API HTTP ${res.status}`);
      return { ok: true, subject: name, hits: [], totalHits: 0, listsChecked: [], aboveThreshold: 0, source: "watchman-moov", latencyMs: Date.now() - t0, fetchedAt };
    }

    const data = await res.json() as Record<string, unknown>;
    const allHits: WatchmanHit[] = [];
    const listsChecked: string[] = [];

    // OFAC SDN
    const sdnWrapper = data["SDNs"] as Record<string, unknown> | undefined;
    if (sdnWrapper) {
      listsChecked.push("OFAC SDN");
      const sdns = Array.isArray(sdnWrapper["SDNs"]) ? sdnWrapper["SDNs"] as Record<string, unknown>[] : [];
      allHits.push(...sdns.map(normaliseSdn));
    }

    // BIS Entity List
    const bisWrapper = data["BISEntities"] as Record<string, unknown> | undefined;
    if (bisWrapper) {
      listsChecked.push("BIS Entity List");
      const entities = Array.isArray(bisWrapper["entities"]) ? bisWrapper["entities"] as Record<string, unknown>[] : [];
      allHits.push(...entities.map(e => normaliseGeneric(e, "bis_entity_list", "BIS Entity List", "name")));
    }

    // Military End-User
    const meuWrapper = data["MilitaryEndUser"] as Record<string, unknown> | undefined;
    if (meuWrapper) {
      listsChecked.push("Military End-User");
      const entities = Array.isArray(meuWrapper["entities"]) ? meuWrapper["entities"] as Record<string, unknown>[] : [];
      allHits.push(...entities.map(e => normaliseGeneric(e, "mil_end_user", "Military End-User", "name")));
    }

    // UK Consolidated Sanctions
    const ukWrapper = data["UKCSanctions"] as Record<string, unknown> | undefined;
    if (ukWrapper) {
      listsChecked.push("UK Consolidated Sanctions");
      const entities = Array.isArray(ukWrapper["entities"]) ? ukWrapper["entities"] as Record<string, unknown>[] : [];
      allHits.push(...entities.map(e => normaliseGeneric(e, "uk_consolidated", "UK Consolidated Sanctions", "name")));
    }

    // EU Consolidated Sanctions
    const euWrapper = data["EUCSLSanctions"] as Record<string, unknown> | undefined;
    if (euWrapper) {
      listsChecked.push("EU Consolidated Sanctions");
      const entities = Array.isArray(euWrapper["entities"]) ? euWrapper["entities"] as Record<string, unknown>[] : [];
      allHits.push(...entities.map(e => normaliseGeneric(e, "eu_consolidated", "EU Consolidated Sanctions", "name")));
    }

    // SSI (Sectoral Sanctions Identifications)
    const ssiWrapper = data["SSI"] as Record<string, unknown> | undefined;
    if (ssiWrapper) {
      listsChecked.push("OFAC SSI");
      const ssis = Array.isArray(ssiWrapper["SSIs"]) ? ssiWrapper["SSIs"] as Record<string, unknown>[] : [];
      allHits.push(...ssis.map(e => normaliseGeneric(e, "ofac_ssi", "OFAC SSI", "entityAlias")));
    }

    const aboveThreshold = allHits.filter(h => h.score >= MATCH_THRESHOLD * 100).length;

    return {
      ok: true,
      subject: name,
      hits: allHits.sort((a, b) => b.score - a.score),
      totalHits: allHits.length,
      listsChecked,
      aboveThreshold,
      source: "watchman-moov",
      latencyMs: Date.now() - t0,
      fetchedAt,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (!isAbort) console.warn("[watchman-check] fetch failed:", err instanceof Error ? err.message : err);
    return { ok: true, subject: name, hits: [], totalHits: 0, listsChecked: [], aboveThreshold: 0, source: "watchman-moov", latencyMs: Date.now() - t0, fetchedAt };
  } finally {
    clearTimeout(timer);
  }
}

async function handle(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  let name: string;
  let limit = DEFAULT_LIMIT;

  if (req.method === "GET") {
    const url = new URL(req.url);
    name = url.searchParams.get("name")?.trim() ?? "";
    const lp = url.searchParams.get("limit");
    if (lp) limit = Math.max(1, Math.min(100, parseInt(lp, 10) || DEFAULT_LIMIT));
  } else {
    let raw: unknown;
    try { raw = await req.json(); } catch {
      return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gateHeaders });
    }
    const body = (raw ?? {}) as Record<string, unknown>;
    name = typeof body["name"] === "string" ? body["name"].trim() : "";
    if (typeof body["limit"] === "number") limit = Math.max(1, Math.min(100, body["limit"] as number));
  }

  if (!name) {
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400, headers: gateHeaders });
  }
  if (name.length > 200) {
    return NextResponse.json({ ok: false, error: "name too long (max 200 chars)" }, { status: 400, headers: gateHeaders });
  }

  const result = await fetchWatchman(name, limit);
  return NextResponse.json(result, { headers: gateHeaders });
}

export const GET = handle;
export const POST = handle;
