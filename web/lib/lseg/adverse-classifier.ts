// Hawkeye Sterling — LSEG CFS → adverse-media classifier + index lookup.
//
// LSEG World-Check / Sanctions DataFile rows carry topic / riskFactor /
// category strings that flag adverse-media context (fraud, corruption,
// trafficking, ML, TF, etc.) even when the entity itself isn't a PEP and
// isn't on any sanctions regime list. classifyAdverseCategories() maps
// those strings onto Hawkeye's existing 16-category adverse taxonomy so
// the screening engine can elevate risk on an LSEG-flagged adverse hit
// the same way it does on a GDELT/Google-News hit.
//
// Reads from a Blobs-backed index (hawkeye-lseg-adverse-index) populated
// by /api/admin/import-cfs. Bucketing by first-letter of primaryName,
// same pattern as the PEP index. One blob per bucket, 5-min in-process
// cache.

import type { KnownAdverse } from "@/lib/data/known-entities";

export type AdverseCategoryId =
  | "money_laundering"
  | "terrorism_financing"
  | "fraud"
  | "corruption_bribery"
  | "tax_evasion"
  | "sanctions_evasion"
  | "narcotics"
  | "human_trafficking"
  | "organized_crime"
  | "cybercrime"
  | "environmental_crime"
  | "weapons_proliferation"
  | "modern_slavery"
  | "financial_crime_other"
  | "regulatory_enforcement"
  | "litigation_dispute";

interface AdverseRule {
  category: AdverseCategoryId;
  patterns: RegExp[];
}

// Patterns target LSEG topic codes + World-Check risk-factor strings.
// Order matters only for documentation — every rule is evaluated; an
// entity can carry multiple adverse categories.
const RULES: readonly AdverseRule[] = [
  { category: "money_laundering",      patterns: [/money[\s-]launder/i, /\bml\b/i, /\baml\b/i] },
  { category: "terrorism_financing",   patterns: [/terror(?:ism|ist)/i, /\btf\b/i, /violent\s+extrem/i] },
  { category: "fraud",                 patterns: [/\bfraud/i, /embezzle/i, /misappropriat/i, /ponzi/i, /forger?y/i] },
  { category: "corruption_bribery",    patterns: [/corrupt/i, /briber?y/i, /kickback/i, /\bfcpa\b/i, /\bukba\b/i] },
  { category: "tax_evasion",           patterns: [/tax\s+evasion/i, /tax\s+fraud/i, /undeclared\s+income/i] },
  { category: "sanctions_evasion",     patterns: [/sanctions?\s+evasion/i, /sanctions?\s+circumvention/i, /export\s+control/i] },
  { category: "narcotics",             patterns: [/narcotic/i, /drug\s+traffic/i, /cocaine|heroin|methamphet/i, /\bdtto\b/i] },
  { category: "human_trafficking",     patterns: [/human\s+traffic/i, /sex\s+traffic/i, /labor\s+traffic/i, /smuggl/i] },
  { category: "organized_crime",       patterns: [/organi[sz]ed\s+crime/i, /mafia|cartel|cosa\s+nostra|yakuza|triad/i, /\brico\b/i] },
  { category: "cybercrime",            patterns: [/cyber[\s-]?crim/i, /ransomware/i, /hacking/i, /phishing/i, /data\s+breach/i] },
  { category: "environmental_crime",   patterns: [/environmental\s+crime/i, /illegal\s+(?:logging|mining|fishing|wildlife)/i, /poach/i] },
  { category: "weapons_proliferation", patterns: [/proliferation/i, /weapons?\s+of\s+mass/i, /\bwmd\b/i, /dual[\s-]use/i, /nuclear\s+(?:material|weapon)/i] },
  { category: "modern_slavery",        patterns: [/modern\s+slavery/i, /forced\s+labor/i, /forced\s+labour/i, /child\s+labor/i] },
  { category: "regulatory_enforcement", patterns: [/enforcement\s+action/i, /consent\s+order/i, /administrative\s+penalty/i, /debarred?/i] },
  { category: "litigation_dispute",    patterns: [/indict/i, /convict/i, /sentenc/i, /civil\s+forfeiture/i, /asset\s+freeze/i] },
];

const FALLBACK_CATEGORY: AdverseCategoryId = "financial_crime_other";

/**
 * Classify free-form LSEG category strings into Hawkeye adverse categories.
 * Entries that match no specific rule but carry at least one category
 * string get the "financial_crime_other" fallback so they still surface in
 * adverse-media screens (LSEG only attaches categories when there's
 * adverse context). Pure-PEP-no-adverse entries return [].
 */
export function classifyAdverseCategories(categories: readonly string[]): AdverseCategoryId[] {
  if (categories.length === 0) return [];
  const matched = new Set<AdverseCategoryId>();
  let anyNonEmpty = false;
  for (const cat of categories) {
    if (!cat) continue;
    anyNonEmpty = true;
    for (const rule of RULES) {
      if (rule.patterns.some((re) => re.test(cat))) {
        matched.add(rule.category);
      }
    }
  }
  // Categories present but none matched a specific rule → broad fallback.
  if (matched.size === 0 && anyNonEmpty) matched.add(FALLBACK_CATEGORY);
  return Array.from(matched);
}

// ── Blob-backed lookup index ──────────────────────────────────────────────

import { getNamedStore } from "@/lib/server/blob-getter";

interface AdverseIndexEntry {
  id: string;
  primaryName: string;
  aliases: string[];
  categories: AdverseCategoryId[];
  rawCategories: string[];
  sourceFile: string;
}

const _bucketCache = new Map<string, { entries: AdverseIndexEntry[]; expiresAt: number }>();
const BUCKET_CACHE_TTL_MS = 5 * 60 * 1_000;

function normName(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function bucketKey(name: string): string {
  const first = normName(name)[0];
  return first && /[a-z]/.test(first) ? first : "_";
}

async function loadBucket(bucket: string): Promise<AdverseIndexEntry[]> {
  const cached = _bucketCache.get(bucket);
  if (cached && Date.now() < cached.expiresAt) return cached.entries;
  // Audit DR-14: dropped duplicated loadBlobs() + credentials() helpers in
  // favour of the shared web/lib/server/blob-getter so all per-store
  // accessors share one source of truth for the @netlify/blobs dynamic
  // import + env-var resolution.
  const store = await getNamedStore("hawkeye-lseg-adverse-index");
  if (!store) return [];
  try {
    const raw = await store.get(`bucket/${bucket}.json`, { type: "json" });
    const entries = Array.isArray(raw) ? (raw as AdverseIndexEntry[]) : [];
    _bucketCache.set(bucket, { entries, expiresAt: Date.now() + BUCKET_CACHE_TTL_MS });
    return entries;
  } catch {
    return [];
  }
}

/**
 * Look up a screened name in the LSEG CFS adverse-media index. Returns a
 * KnownAdverse-shaped hit if matched. Caller is the existing adverse-media
 * surface (super-brain + classifyAdverseMedia consumers); same shape as
 * KNOWN_ADVERSE so callers don't branch on source.
 */
export async function lookupLsegAdverseIndex(name: string): Promise<KnownAdverse | null> {
  const q = normName(name);
  if (!q) return null;
  const entries = await loadBucket(bucketKey(name));
  if (entries.length === 0) return null;

  for (const e of entries) {
    const match =
      normName(e.primaryName) === q ||
      e.aliases.some((a) => normName(a) === q);
    if (!match) continue;
    return {
      names: [e.primaryName, ...e.aliases].slice(0, 6),
      categories: e.categories.map((c) => ({ categoryId: c, keyword: c.replace(/_/g, " ") })),
      keywords: e.rawCategories.slice(0, 8),
      rationale:
        `LSEG CFS adverse-media index — categories: ${e.categories.join(", ") || "financial_crime_other"}; ` +
        `raw labels: ${e.rawCategories.slice(0, 4).join(", ") || "n/a"}; source file: ${e.sourceFile}.`,
    };
  }
  return null;
}
