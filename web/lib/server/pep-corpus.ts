// Shared PEP corpus loader and scorer.
// Extracted so both /api/pep-match and /api/screening/run can access the
// corpus in-process without an HTTP round-trip.
//
// The corpus is cached at module level (30-minute TTL) and falls back to
// the OpenSanctions CDN bulk download when the Netlify Blobs store is empty
// (first deploy, before the daily pep-refresh scheduler has run).

import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

export interface PepRecord {
  id:        string;
  name:      string;
  aliases?:  string[];
  countries?: string[];
  topics?:   string[];
  positions?: string[];
  birthDate?: string;
  datasets?:  string[];
}

const BLOBS_STORE    = "hawkeye-pep";
const CDN_BULK_URL   = "https://data.opensanctions.org/datasets/latest/peps/entities.ftm.json";
const CDN_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS   = 30 * 60 * 1_000; // 30 minutes

let _cachedRecords: PepRecord[] | null = null;
let _cacheLoadedAt = 0;
let _cacheSource: "blobs" | "cdn" | "none" = "none";

export async function loadCorpus(): Promise<PepRecord[]> {
  if (_cachedRecords && Date.now() - _cacheLoadedAt < CACHE_TTL_MS) {
    return _cachedRecords;
  }

  // Try Netlify Blobs (populated by daily pep-refresh scheduler).
  // Also loads pep/archive.json — 12-month historical retention.
  try {
    const store = getStore(BLOBS_STORE);
    const [raw, archRaw] = await Promise.all([
      store.get("pep/current.json", { type: "text" }).catch(() => null),
      store.get("pep/archive.json", { type: "text" }).catch(() => null),
    ]);
    const records: PepRecord[] = [];
    if (raw && raw.length > 100) {
      const current = JSON.parse(raw) as PepRecord[];
      records.push(...current);
    }
    if (archRaw && archRaw.length > 2) {
      const archived = (JSON.parse(archRaw) as Array<PepRecord & { removedAt?: string }>)
        .map((a) => ({ ...a, topics: [...(a.topics ?? []), "former_pep"] }));
      records.push(...archived);
    }
    if (records.length > 0) {
      _cachedRecords = records;
      _cacheLoadedAt = Date.now();
      _cacheSource = "blobs";
      return records;
    }
  } catch (err) {
    console.warn("[pep-corpus] blob store unavailable:", err instanceof Error ? err.message : String(err));
  }

  // CDN fallback.
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
      _cachedRecords = records;
      _cacheLoadedAt = Date.now();
      _cacheSource = "cdn";
    }
    return records;
  } catch {
    return [];
  }
}

export function getCorpusSource(): "blobs" | "cdn" | "none" {
  return _cacheSource;
}

function parseLine(line: string): PepRecord | null {
  try {
    const obj = JSON.parse(line.trim()) as Record<string, unknown>;
    const props = (obj["properties"] as Record<string, unknown> | undefined) ?? {};
    const name = arrStr(props["name"])[0] ?? strVal(obj["caption"]);
    if (!name) return null;
    return {
      id: String(obj["id"] ?? `pep_${createHash("sha256").update([
        String(obj["caption"] ?? ""),
        arrStr(props["name"])[0] ?? "",
        arrStr(props["position"])[0] ?? "",
      ].join("|")).digest("hex").slice(0, 16)}`),
      name,
      aliases:   arrStr(props["alias"]),
      countries: arrStr(props["country"]),
      topics:    arrStr(props["topics"]),
      positions: arrStr(props["position"]).concat(arrStr(props["title"])),
      birthDate: arrStr(props["birthDate"])[0],
      datasets:  arrStr(obj["datasets"]),
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

export function normName(s: string): string {
  if (!s) return "";
  let out = "";
  for (const ch of s.toLowerCase()) {
    out += ARABIC[ch] ?? CYRILLIC[ch] ?? ch;
  }
  return out
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normName(s).split(" ").filter((t) => t.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Score a normalised query name against a PepRecord.
 * @param qNorm  Already-normalised query name (run through normName first).
 * @param rec    PEP record from the corpus.
 * @returns 0..1 similarity score.
 */
export function scoreRecord(qNorm: string, rec: PepRecord): number {
  const qTokens  = new Set(qNorm.split(" ").filter((t) => t.length > 1));
  const candidates = [rec.name, ...(rec.aliases ?? [])];
  let best = 0;
  for (const c of candidates) {
    const cNorm = normName(c);
    if (cNorm === qNorm) return 1.0;
    const cTokens    = tokenSet(c);
    const j          = jaccard(qTokens, cTokens);
    const prefixBonus = cNorm.startsWith(qNorm) || qNorm.startsWith(cNorm) ? 0.15 : 0;
    const score = Math.min(1, j + prefixBonus);
    if (score > best) best = score;
  }
  return best;
}
