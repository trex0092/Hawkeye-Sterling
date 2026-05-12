export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";
import { enforce } from "@/lib/server/enforce";

// PEP matching against the local OpenSanctions bulk snapshot.
// POST /api/pep-match  { name, birthYear?, aliases? }
// → { ok: true, hits: PepMatchHit[], source: "blobs" | "cdn" | "none" }
//
// No API key required — queries the PEP corpus that pep-refresh.mts
// downloads daily from the OpenSanctions bulk CDN into Netlify Blobs.
// If the Blobs store is empty (first deploy, before the scheduler ran)
// the route fetches the bulk file directly from the CDN and caches it
// in module memory for the remainder of the warm instance lifetime.
// This gives unlimited queries at zero cost.

export interface PepMatchHit {
  id: string;
  name: string;
  score: number; // 0..1 — local similarity score
  positions: string[];
  countries: string[];
  topics: string[];
  birthDate?: string;
  datasets: string[];
  caption: string;
}

export interface PepMatchResponse {
  ok: boolean;
  hits: PepMatchHit[];
  source: "blobs" | "cdn" | "none";
  queriedName: string;
  totalCorpus?: number;
  error?: string;
}

interface PepRecord {
  id: string;
  name: string;
  aliases?: string[];
  countries?: string[];
  topics?: string[];
  positions?: string[];
  birthDate?: string;
  datasets?: string[];
}

// Module-level cache so we don't re-read the blob on every warm request.
let cachedRecords: PepRecord[] | null = null;
let cacheLoadedAt = 0;
let cacheSource: "blobs" | "cdn" | "none" = "none";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const BLOBS_STORE = "hawkeye-pep";
const CDN_BULK_URL = "https://data.opensanctions.org/datasets/latest/peps/entities.ftm.json";
const CDN_TIMEOUT_MS = 30_000;
const MIN_SCORE = 0.45;

// ── Corpus loading ────────────────────────────────────────────────────────────

async function loadCorpus(): Promise<PepRecord[]> {
  // Return in-memory cache if fresh.
  if (cachedRecords && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedRecords;
  }

  // Try Netlify Blobs (populated by daily pep-refresh scheduler).
  try {
    const store = getStore(BLOBS_STORE);
    const raw = await store.get("pep/current.json", { type: "text" });
    if (raw && raw.length > 100) {
      const records = JSON.parse(raw) as PepRecord[];
      if (records.length > 0) {
        cachedRecords = records;
        cacheLoadedAt = Date.now();
        cacheSource = "blobs";
        return records;
      }
    }
  } catch {
    // Blobs unavailable (local dev, first deploy) — fall through to CDN.
  }

  // Direct CDN fetch as fallback (line-delimited JSON, no auth needed).
  try {
    const res = await fetch(CDN_BULK_URL, {
      signal: AbortSignal.timeout(CDN_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const text = await res.text();
    const records: PepRecord[] = [];
    for (const line of text.split(/\n+/)) {
      const rec = parseLine(line);
      if (rec) records.push(rec);
    }
    if (records.length > 0) {
      cachedRecords = records;
      cacheLoadedAt = Date.now();
      cacheSource = "cdn";
    }
    return records;
  } catch {
    return [];
  }
}

function parseLine(line: string): PepRecord | null {
  try {
    const obj = JSON.parse(line.trim()) as Record<string, unknown>;
    const props = (obj["properties"] as Record<string, unknown> | undefined) ?? {};
    const name = arrStr(props["name"])[0] ?? strVal(obj["caption"]);
    if (!name) return null;
    return {
      id: String(obj["id"] ?? `pep_${Math.random().toString(36).slice(2, 9)}`),
      name,
      aliases: arrStr(props["alias"]),
      countries: arrStr(props["country"]),
      topics: arrStr(props["topics"]),
      positions: arrStr(props["position"]).concat(arrStr(props["title"])),
      birthDate: arrStr(props["birthDate"])[0],
      datasets: arrStr(obj["datasets"] as unknown),
    };
  } catch {
    return null;
  }
}

function strVal(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function arrStr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return [v];
  return [];
}

// ── Name normalisation ────────────────────────────────────────────────────────

const ARABIC: Record<string, string> = {
  "ا":"a","أ":"a","إ":"i","آ":"a","ب":"b","ت":"t","ث":"th","ج":"j","ح":"h",
  "خ":"kh","د":"d","ذ":"dh","ر":"r","ز":"z","س":"s","ش":"sh","ص":"s","ض":"d",
  "ط":"t","ظ":"z","ع":"a","غ":"gh","ف":"f","ق":"q","ك":"k","ل":"l","م":"m",
  "ن":"n","ه":"h","و":"w","ي":"y","ى":"a","ة":"h","ء":"","ؤ":"w","ئ":"y",
};
const CYRILLIC: Record<string, string> = {
  "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z",
  "и":"i","й":"j","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r",
  "с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts","ч":"ch","ш":"sh",
  "щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya",
};

function normName(s: string): string {
  if (!s) return "";
  // Transliterate Arabic + Cyrillic.
  let out = "";
  for (const ch of s.toLowerCase()) {
    out += ARABIC[ch] ?? CYRILLIC[ch] ?? ch;
  }
  return out
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function tokenSet(s: string): Set<string> {
  return new Set(normName(s).split(" ").filter((t) => t.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function scoreRecord(qNorm: string, qTokens: Set<string>, rec: PepRecord): number {
  const candidates = [rec.name, ...(rec.aliases ?? [])];
  let best = 0;
  for (const c of candidates) {
    const cNorm = normName(c);
    // Exact match wins.
    if (cNorm === qNorm) return 1.0;
    // Jaccard token overlap.
    const cTokens = tokenSet(c);
    const j = jaccard(qTokens, cTokens);
    // Prefix bonus: query is a prefix of candidate or vice-versa.
    const prefixBonus = cNorm.startsWith(qNorm) || qNorm.startsWith(cNorm) ? 0.15 : 0;
    const score = Math.min(1, j + prefixBonus);
    if (score > best) best = score;
  }
  return best;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { name?: string; birthYear?: string | number; aliases?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, hits: [], source: "none", queriedName: "", error: "Invalid JSON" } satisfies PepMatchResponse,
      { status: 400, headers: gate.headers },
    );
  }

  const name = (body.name ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json({ ok: true, hits: [], source: "none", queriedName: name } satisfies PepMatchResponse, { headers: gate.headers });
  }

  const corpus = await loadCorpus();
  if (corpus.length === 0) {
    return NextResponse.json({ ok: true, hits: [], source: "none", queriedName: name } satisfies PepMatchResponse, { headers: gate.headers });
  }

  const source: PepMatchResponse["source"] = cacheLoadedAt > 0 ? cacheSource : "none";

  const qNorm = normName(name);
  const qTokens = tokenSet(name);

  // Also search across provided aliases.
  const aliasNorms = (body.aliases ?? []).map(normName);
  const aliasTokenSets = (body.aliases ?? []).map(tokenSet);

  const scored: Array<{ rec: PepRecord; score: number }> = [];
  for (const rec of corpus) {
    let s = scoreRecord(qNorm, qTokens, rec);
    // Check aliases of the query against the record too.
    for (let i = 0; i < aliasNorms.length; i++) {
      const as = scoreRecord(aliasNorms[i]!, aliasTokenSets[i]!, rec);
      if (as > s) s = as;
    }
    if (s >= MIN_SCORE) scored.push({ rec, score: s });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);

  const hits: PepMatchHit[] = top.map(({ rec, score }) => ({
    id: rec.id,
    caption: rec.name,
    name: rec.name,
    score,
    positions: rec.positions ?? [],
    countries: rec.countries ?? [],
    topics: rec.topics ?? [],
    birthDate: rec.birthDate,
    datasets: rec.datasets ?? [],
  }));

  return NextResponse.json({
    ok: true,
    hits,
    source,
    queriedName: name,
    totalCorpus: corpus.length,
  } satisfies PepMatchResponse, { headers: gate.headers });
}
