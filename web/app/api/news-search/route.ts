import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  classifyAdverseKeywords,
  adverseKeywordGroupCounts,
  type AdverseKeywordGroup,
} from "@/lib/data/adverse-keywords";
import { classifyEsg } from "@/lib/data/esg";
import { searchAllNewsWithStatus, type NewsArticle } from "@/lib/intelligence/newsAdapters";
import { incrementCounter, setGauge } from "@/lib/server/metrics-store";
import { getJson, setJson } from "@/lib/server/store";
import { newsFetch, newsProxyInfo, newsRelayInfo, newsOperatorRelayEnabled, FEED_HEADERS } from "@/lib/server/http-dispatcher";
import { getStore } from "@netlify/blobs";
import { type GdeltArticle } from "@/lib/intelligence/gdelt-cache";
// Dynamic imports from dist/ to prevent hard module-load failures when the
// brain compilation hasn't run yet (cold Lambda, partial build). Falls back
// to no-op implementations that return minimal scores so the route degrades
// gracefully instead of returning 500.
// EnsembleMatch mirrors src/brain/matching.ts EnsembleMatch interface so the
// stub and the real function share the same shape. The call site accesses
// `m.best.score` — the old stub returned `{score, method}` which meant
// `m.best` was always undefined when dist/ was not loaded, silently zeroing
// all fuzzy scores and falling through to the token-presence fallback only.
type MatchScore = { method: string; score: number; threshold: number; pass: boolean };
type EnsembleMatch = { subject: string; candidate: string; scores: MatchScore[]; best: MatchScore; phoneticAgreement: boolean };
type MatchEnsembleFn = (_a: string, _b: string) => EnsembleMatch;
type VariantsOfFn = (_name: string) => string[];
let matchEnsemble: MatchEnsembleFn = (a, b) => {
  const exact = a.toLowerCase() === b.toLowerCase();
  const score: MatchScore = { method: "exact_fallback", score: exact ? 1 : 0, threshold: 1, pass: exact };
  return { subject: a, candidate: b, scores: [score], best: score, phoneticAgreement: false };
};
let variantsOf: VariantsOfFn = (name) => [name];
// Best-effort async load — if dist is present these replace the stubs.
(async () => {
  try {
    const [m, t] = await Promise.all([
      import("../../../../src/brain/matching.js"),
      import("../../../../src/brain/translit.js"),
    ]);
    if (typeof (m as { matchEnsemble?: unknown }).matchEnsemble === "function")
      matchEnsemble = (m as { matchEnsemble: MatchEnsembleFn }).matchEnsemble;
    if (typeof (t as { variantsOf?: unknown }).variantsOf === "function")
      variantsOf = (t as { variantsOf: VariantsOfFn }).variantsOf;
  } catch {
    // dist not built yet — stubs remain active
  }
})();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Module-level safety net — see /api/compliance-qa for rationale.
const REJECTION_GUARD_KEY = "__hsNewsSearchRejectionGuard";
const guardHost = globalThis as unknown as Record<string, boolean | undefined>;
if (typeof process !== "undefined" && !guardHost[REJECTION_GUARD_KEY]) {
  guardHost[REJECTION_GUARD_KEY] = true;
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("AbortError") || msg.includes("aborted")) return;
    console.error("[news-search] unhandled rejection", msg);
  });
}

// Free, no-key news crawl via Google News RSS.
// Optional upgrade path: set NEWSAPI_KEY for higher-quality coverage.

function detectScript(text: string): "latin" | "arabic" | "cyrillic" | "cjk" | "devanagari" | "thai" | "hebrew" | "georgian" | "armenian" | "other" {
  const arabicCount = (text.match(/[؀-ۿ]/g) ?? []).length;
  const cyrillicCount = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const cjkCount = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  const devanagariCount = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const thaiCount = (text.match(/[฀-๿]/g) ?? []).length;
  const hebrewCount = (text.match(/[֐-׿]/g) ?? []).length;
  const georgianCount = (text.match(/[Ⴀ-ჿ]/g) ?? []).length;
  const armenianCount = (text.match(/[԰-֏]/g) ?? []).length;

  const counts = [
    { script: "arabic" as const, count: arabicCount },
    { script: "cyrillic" as const, count: cyrillicCount },
    { script: "cjk" as const, count: cjkCount },
    { script: "devanagari" as const, count: devanagariCount },
    { script: "thai" as const, count: thaiCount },
    { script: "hebrew" as const, count: hebrewCount },
    { script: "georgian" as const, count: georgianCount },
    { script: "armenian" as const, count: armenianCount },
  ];

  const max = counts.reduce((a, b) => a.count > b.count ? a : b);
  return max.count > 3 ? max.script : "latin";
}

interface Article {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
  keywordGroups: string[];
  esgCategories: string[];
  severity: "clear" | "low" | "medium" | "high" | "critical";
  fuzzyScore: number;        // 0..100 — brain matchEnsemble against subject
  fuzzyMethod: string;       // levenshtein | jaro_winkler | soundex | token_set | ...
  matchedVariant?: string;   // variant that produced the top score
  lang: string;              // locale the article was fetched from (en, es, fr, ru, zh, ar, pt)
  relevanceScore?: number;   // fuzzyScore + adverse-term boost, 0..100
  sourceTier: "tier1" | "tier2" | "tier3" | "unknown";  // credibility classification
  sourceCategory?: "wire" | "investigative" | "regulatory" | "regional" | "social" | "state_media";  // editorial category
  script?: "latin" | "arabic" | "cyrillic" | "cjk" | "devanagari" | "thai" | "hebrew" | "georgian" | "armenian" | "other";
  requiresTranslation?: boolean;
  sourceAuthority?: "established" | "new" | "unknown";  // authority proxy based on tier lists
  paywallLimited?: boolean;  // true when article description indicates a paywall
  recencyWeight?: number;    // multiplier applied to this article's severity weight
  // Distinct-source coverage of the SAME underlying story, preserved when
  // clusterArticles() collapses cross-outlet restatements into one rep. Lets
  // the UI disclose up to N independent sources for elevated-risk subjects
  // (positive in sanctions AND adverse media) — corroboration evidence.
  corroboratingSources?: Array<{
    title: string;
    link: string;
    source: string;
    pubDate: string;
    sourceTier: Article["sourceTier"];
    severity: Article["severity"];
  }>;
}

// ── Source credibility tiers ────────────────────────────────────────────────
// Tier 1: major international wire services, authoritative MENA outlets,
// investigative journalism organisations, and financial regulatory bodies.
const TIER1_DOMAINS = new Set([
  // Major international wire services
  "reuters.com", "apnews.com", "bloomberg.com", "ft.com", "wsj.com",
  "bbc.com", "bbc.co.uk", "theguardian.com", "nytimes.com",
  "lemonde.fr", "spiegel.de", "elpais.com", "lavanguardia.com",
  "afp.com", "dpa-international.com", "kyodonews.net",
  // UAE/MENA authoritative sources
  "gulfnews.com", "thenationalnews.com", "khaleejtimes.com",
  "arabnews.com", "alarabiya.net", "albawaba.com",
  // Investigative / regulatory
  "occrp.org", "icij.org", "transparency.org",
  "globalwitness.org", "balkaninsight.com", "hrw.org",
  // Financial regulators' own publications
  "fatf-gafi.org", "bis.org", "imf.org", "worldbank.org", "qatarfoundation.org",
  "unodc.org", "ec.europa.eu", "sec.gov", "justice.gov",
  "ofac.treas.gov", "fca.org.uk", "eba.europa.eu",
]);

// Tier 2: well-known international broadcasters and business press with
// editorial standards but lower primary-source status than tier 1.
const TIER2_DOMAINS = new Set([
  "cnbc.com", "cnn.com", "nbcnews.com", "abcnews.go.com",
  "economist.com", "forbes.com", "businessinsider.com",
  "aljazeera.com", "middleeasteye.net", "haaretz.com",
  "scmp.com", "straitstimes.com", "channelnewsasia.com",
  // Africa
  "allafrica.com", "dailynation.co.ke", "theeastafrican.co.ke",
  "punchng.com", "premiumtimesng.com", "businessdayonline.com",
  "groundup.org.za", "mg.co.za", "dailymaverick.co.za",
  // Latin America
  "infobae.com", "lanacion.com.ar", "folha.uol.com.br",
  "elespectador.com", "eluniversal.com.mx", "elcomercio.pe",
  "elnacional.com", "larepublica.co",
  // Oceania / Pacific
  "rnz.co.nz", "abc.net.au", "radionz.co.nz", "rnpacific.co.nz",
  "pina.com.fj", "pireport.org",
  // Europe investigative
  "balkaninsight.com", "euobserver.com", "globalwitness.org",
  "reportingproject.net", "correctiv.org",
  // Additional MENA
  "al-monitor.com", "iranintl.com", "kurdistan24.net",
  // Gulf / Levant English press
  "alaraby.co.uk", "asharq.com", "thepeninsulaqatar.com", "timesofoman.com",
  "gulf-times.com", "jordantimes.com", "dailystar.com.lb", "dailynewsegypt.com",
]);

// ── State-controlled / propaganda media domains ─────────────────────────────
// Articles from these outlets are tagged `sourceCategory: "state_media"` and
// their severity contribution is capped at "medium" regardless of content.
// Sources: Russia (RT, TASS, RIA, Sputnik), China (Xinhua, CGTN, China Daily,
// Global Times), Iran (PressTV, Mehr), North Korea (KCNA, Rodong), others.
const STATE_MEDIA_DOMAINS = new Set([
  // Russia
  "rt.com", "sputniknews.com", "tass.ru", "ria.ru",
  // China
  "xinhuanet.com", "cgtn.com", "chinadaily.com.cn", "globaltimes.cn",
  // Iran
  "presstv.ir", "mehrnews.com",
  // North Korea
  "kcna.kp", "rodong.rep.kp",
  // Others
  "venezuelanalysis.com", "cubanews.org",
]);

function classifySource(url: string): "tier1" | "tier2" | "tier3" | "unknown" {
  if (!url) return "unknown";
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    if (TIER1_DOMAINS.has(domain)) return "tier1";
    if (TIER2_DOMAINS.has(domain)) return "tier2";
    return "tier3";
  } catch { return "unknown"; }
}

// Locales we poll Google News from. 100+ language and regional locales covering
// all 7 continents — FATF high-risk, MENA, South & Southeast Asia, Caucasus,
// Western Balkans, Nordics, East Africa, Latin America regional editions,
// Pacific, Central Asia. All feeds run in parallel under a 4s overall timebox
// so latency does not grow with locale count — slow/missing feeds drop out.
const LOCALES: Array<{ code: string; hl: string; gl: string; ceid: string }> = [
  // ── NORTH AMERICA ────────────────────────────────────────────────────────
  { code: "en",    hl: "en",      gl: "US", ceid: "US:en"       },  // English - USA
  { code: "en-CA", hl: "en-CA",   gl: "CA", ceid: "CA:en"       },  // English - Canada
  { code: "fr-CA", hl: "fr-CA",   gl: "CA", ceid: "CA:fr"       },  // French - Canada
  { code: "es-MX", hl: "es-419",  gl: "MX", ceid: "MX:es-419"  },  // Spanish - Mexico
  // ── EUROPE ───────────────────────────────────────────────────────────────
  { code: "en-GB", hl: "en-GB",   gl: "GB", ceid: "GB:en"       },  // English - UK
  { code: "de",    hl: "de",      gl: "DE", ceid: "DE:de"       },  // German
  { code: "fr",    hl: "fr",      gl: "FR", ceid: "FR:fr"       },  // French
  { code: "es",    hl: "es",      gl: "ES", ceid: "ES:es"       },  // Spanish - Spain
  { code: "it",    hl: "it",      gl: "IT", ceid: "IT:it"       },  // Italian
  { code: "nl",    hl: "nl",      gl: "NL", ceid: "NL:nl"       },  // Dutch
  { code: "pt-PT", hl: "pt",      gl: "PT", ceid: "PT:pt-150"  },  // Portuguese - Portugal
  // CEE / Balkans
  { code: "pl",    hl: "pl",      gl: "PL", ceid: "PL:pl"       },  // Polish
  { code: "ro",    hl: "ro",      gl: "RO", ceid: "RO:ro"       },  // Romanian
  { code: "hu",    hl: "hu",      gl: "HU", ceid: "HU:hu"       },  // Hungarian
  { code: "cs",    hl: "cs",      gl: "CZ", ceid: "CZ:cs"       },  // Czech
  { code: "sk",    hl: "sk",      gl: "SK", ceid: "SK:sk"       },  // Slovak
  { code: "hr",    hl: "hr",      gl: "HR", ceid: "HR:hr"       },  // Croatian
  { code: "sr",    hl: "sr",      gl: "RS", ceid: "RS:sr"       },  // Serbian
  { code: "bg",    hl: "bg",      gl: "BG", ceid: "BG:bg"       },  // Bulgarian
  { code: "mk",    hl: "mk",      gl: "MK", ceid: "MK:mk"       },  // Macedonian
  { code: "sq",    hl: "sq",      gl: "AL", ceid: "AL:sq"       },  // Albanian
  { code: "sl",    hl: "sl",      gl: "SI", ceid: "SI:sl"       },  // Slovenian
  { code: "el",    hl: "el",      gl: "GR", ceid: "GR:el"       },  // Greek
  // Nordics / Baltics
  { code: "sv",    hl: "sv",      gl: "SE", ceid: "SE:sv"       },  // Swedish
  { code: "no",    hl: "no",      gl: "NO", ceid: "NO:no"       },  // Norwegian
  { code: "da",    hl: "da",      gl: "DK", ceid: "DK:da"       },  // Danish
  { code: "fi",    hl: "fi",      gl: "FI", ceid: "FI:fi"       },  // Finnish
  { code: "et",    hl: "et",      gl: "EE", ceid: "EE:et"       },  // Estonian
  { code: "lv",    hl: "lv",      gl: "LV", ceid: "LV:lv"       },  // Latvian
  { code: "lt",    hl: "lt",      gl: "LT", ceid: "LT:lt"       },  // Lithuanian
  // CIS / Eastern Europe
  { code: "ru",    hl: "ru",      gl: "RU", ceid: "RU:ru"       },  // Russian
  { code: "uk",    hl: "uk",      gl: "UA", ceid: "UA:uk"       },  // Ukrainian
  // ── MENA ─────────────────────────────────────────────────────────────────
  { code: "ar",    hl: "ar",      gl: "AE", ceid: "AE:ar"       },  // Arabic - UAE
  { code: "ar-EG", hl: "ar",      gl: "EG", ceid: "EG:ar"       },  // Arabic - Egypt
  { code: "ar-SA", hl: "ar",      gl: "SA", ceid: "SA:ar"       },  // Arabic - Saudi Arabia
  { code: "ar-MA", hl: "ar",      gl: "MA", ceid: "MA:ar"       },  // Arabic - Morocco
  { code: "ar-IQ", hl: "ar",      gl: "IQ", ceid: "IQ:ar"       },  // Arabic - Iraq
  { code: "ar-LY", hl: "ar",      gl: "LY", ceid: "LY:ar"       },  // Arabic - Libya
  { code: "ar-KW", hl: "ar",      gl: "KW", ceid: "KW:ar"       },  // Arabic - Kuwait
  { code: "ar-QA", hl: "ar",      gl: "QA", ceid: "QA:ar"       },  // Arabic - Qatar
  { code: "ar-BH", hl: "ar",      gl: "BH", ceid: "BH:ar"       },  // Arabic - Bahrain
  { code: "ar-OM", hl: "ar",      gl: "OM", ceid: "OM:ar"       },  // Arabic - Oman
  { code: "ar-YE", hl: "ar",      gl: "YE", ceid: "YE:ar"       },  // Arabic - Yemen
  { code: "ar-JO", hl: "ar",      gl: "JO", ceid: "JO:ar"       },  // Arabic - Jordan
  { code: "ar-LB", hl: "ar",      gl: "LB", ceid: "LB:ar"       },  // Arabic - Lebanon
  { code: "ar-SY", hl: "ar",      gl: "SY", ceid: "SY:ar"       },  // Arabic - Syria
  { code: "ar-TN", hl: "ar",      gl: "TN", ceid: "TN:ar"       },  // Arabic - Tunisia
  { code: "tr",    hl: "tr",      gl: "TR", ceid: "TR:tr"       },  // Turkish
  { code: "he",    hl: "iw",      gl: "IL", ceid: "IL:iw"       },  // Hebrew
  { code: "fa",    hl: "fa",      gl: "IR", ceid: "IR:fa"       },  // Farsi - Iran
  { code: "en-AE", hl: "en",      gl: "AE", ceid: "AE:en"       },  // English - UAE
  { code: "en-QA", hl: "en",      gl: "QA", ceid: "QA:en"       },  // English - Qatar
  { code: "en-SA", hl: "en",      gl: "SA", ceid: "SA:en"       },  // English - Saudi Arabia
  { code: "en-EG", hl: "en",      gl: "EG", ceid: "EG:en"       },  // English - Egypt
  { code: "en-JO", hl: "en",      gl: "JO", ceid: "JO:en"       },  // English - Jordan
  { code: "en-LB", hl: "en",      gl: "LB", ceid: "LB:en"       },  // English - Lebanon
  // ── SOUTH ASIA ───────────────────────────────────────────────────────────
  { code: "en-IN", hl: "en-IN",   gl: "IN", ceid: "IN:en"       },  // English - India
  { code: "hi",    hl: "hi",      gl: "IN", ceid: "IN:hi"       },  // Hindi
  { code: "bn",    hl: "bn",      gl: "BD", ceid: "BD:bn"       },  // Bengali - Bangladesh
  { code: "ur",    hl: "ur",      gl: "PK", ceid: "PK:ur"       },  // Urdu - Pakistan
  { code: "en-PK", hl: "en",      gl: "PK", ceid: "PK:en"       },  // English - Pakistan
  { code: "ta",    hl: "ta",      gl: "IN", ceid: "IN:ta"       },  // Tamil
  { code: "ne",    hl: "ne",      gl: "NP", ceid: "NP:ne"       },  // Nepali - Nepal
  { code: "si",    hl: "si",      gl: "LK", ceid: "LK:si"       },  // Sinhala - Sri Lanka
  // ── SOUTHEAST ASIA ───────────────────────────────────────────────────────
  { code: "en-SG", hl: "en-SG",   gl: "SG", ceid: "SG:en"       },  // English - Singapore
  { code: "id",    hl: "id",      gl: "ID", ceid: "ID:id"       },  // Indonesian
  { code: "ms",    hl: "ms",      gl: "MY", ceid: "MY:ms"       },  // Malay
  { code: "vi",    hl: "vi",      gl: "VN", ceid: "VN:vi"       },  // Vietnamese
  { code: "th",    hl: "th",      gl: "TH", ceid: "TH:th"       },  // Thai
  { code: "tl",    hl: "tl",      gl: "PH", ceid: "PH:tl"       },  // Filipino/Tagalog
  { code: "my",    hl: "my",      gl: "MM", ceid: "MM:my"       },  // Burmese - Myanmar
  { code: "km",    hl: "km",      gl: "KH", ceid: "KH:km"       },  // Khmer - Cambodia
  { code: "lo",    hl: "lo",      gl: "LA", ceid: "LA:lo"       },  // Lao - Laos
  // ── EAST ASIA ────────────────────────────────────────────────────────────
  { code: "zh",    hl: "zh-Hans", gl: "CN", ceid: "CN:zh-Hans"  },  // Chinese Simplified
  { code: "zh-TW", hl: "zh-Hant", gl: "TW", ceid: "TW:zh-Hant" },  // Chinese Traditional - Taiwan
  { code: "ja",    hl: "ja",      gl: "JP", ceid: "JP:ja"       },  // Japanese
  { code: "ko",    hl: "ko",      gl: "KR", ceid: "KR:ko"       },  // Korean
  { code: "mn",    hl: "mn",      gl: "MN", ceid: "MN:mn"       },  // Mongolian
  // ── CAUCASUS / CENTRAL ASIA ──────────────────────────────────────────────
  { code: "az",    hl: "az",      gl: "AZ", ceid: "AZ:az"       },  // Azerbaijani
  { code: "ka",    hl: "ka",      gl: "GE", ceid: "GE:ka"       },  // Georgian
  { code: "hy",    hl: "hy",      gl: "AM", ceid: "AM:hy"       },  // Armenian
  { code: "kk",    hl: "kk",      gl: "KZ", ceid: "KZ:kk"       },  // Kazakh
  { code: "uz",    hl: "uz",      gl: "UZ", ceid: "UZ:uz"       },  // Uzbek - Uzbekistan
  // ── AFRICA ───────────────────────────────────────────────────────────────
  { code: "am",    hl: "am",      gl: "ET", ceid: "ET:am"       },  // Amharic - Ethiopia
  { code: "af",    hl: "af",      gl: "ZA", ceid: "ZA:af"       },  // Afrikaans - South Africa
  { code: "sw-KE", hl: "sw",      gl: "KE", ceid: "KE:sw"       },  // Swahili - Kenya
  { code: "sw-TZ", hl: "sw",      gl: "TZ", ceid: "TZ:sw"       },  // Swahili - Tanzania
  { code: "ar-DZ", hl: "ar",      gl: "DZ", ceid: "DZ:ar"       },  // Arabic - Algeria
  { code: "ar-SD", hl: "ar",      gl: "SD", ceid: "SD:ar"       },  // Arabic - Sudan
  { code: "fr-SN", hl: "fr",      gl: "SN", ceid: "SN:fr"       },  // French - Senegal
  { code: "fr-CI", hl: "fr",      gl: "CI", ceid: "CI:fr"       },  // French - Ivory Coast
  { code: "fr-CM", hl: "fr",      gl: "CM", ceid: "CM:fr"       },  // French - Cameroon
  { code: "fr-CD", hl: "fr",      gl: "CD", ceid: "CD:fr"       },  // French - DR Congo
  { code: "fr-MA", hl: "fr",      gl: "MA", ceid: "MA:fr"       },  // French - Morocco
  { code: "pt-AO", hl: "pt",      gl: "AO", ceid: "AO:pt-150"  },  // Portuguese - Angola
  { code: "pt-MZ", hl: "pt",      gl: "MZ", ceid: "MZ:pt-150"  },  // Portuguese - Mozambique
  { code: "en-NG", hl: "en-NG",   gl: "NG", ceid: "NG:en"       },  // English - Nigeria
  { code: "en-ZA", hl: "en-ZA",   gl: "ZA", ceid: "ZA:en"       },  // English - South Africa
  { code: "en-KE", hl: "en",      gl: "KE", ceid: "KE:en"       },  // English - Kenya
  { code: "en-TZ", hl: "en",      gl: "TZ", ceid: "TZ:en"       },  // English - Tanzania
  { code: "en-GH", hl: "en",      gl: "GH", ceid: "GH:en"       },  // English - Ghana
  { code: "en-ZW", hl: "en",      gl: "ZW", ceid: "ZW:en"       },  // English - Zimbabwe
  { code: "en-UG", hl: "en",      gl: "UG", ceid: "UG:en"       },  // English - Uganda
  // ── LATIN AMERICA ────────────────────────────────────────────────────────
  { code: "pt",    hl: "pt-BR",   gl: "BR", ceid: "BR:pt-419"  },  // Portuguese - Brazil
  { code: "es-AR", hl: "es-419",  gl: "AR", ceid: "AR:es-419"  },  // Spanish - Argentina
  { code: "es-CO", hl: "es-419",  gl: "CO", ceid: "CO:es-419"  },  // Spanish - Colombia
  { code: "es-CL", hl: "es-419",  gl: "CL", ceid: "CL:es-419"  },  // Spanish - Chile
  { code: "es-PE", hl: "es-419",  gl: "PE", ceid: "PE:es-419"  },  // Spanish - Peru
  { code: "es-VE", hl: "es-419",  gl: "VE", ceid: "VE:es-419"  },  // Spanish - Venezuela
  { code: "es-BO", hl: "es-419",  gl: "BO", ceid: "BO:es-419"  },  // Spanish - Bolivia
  { code: "es-EC", hl: "es-419",  gl: "EC", ceid: "EC:es-419"  },  // Spanish - Ecuador
  { code: "es-PY", hl: "es-419",  gl: "PY", ceid: "PY:es-419"  },  // Spanish - Paraguay
  { code: "es-UY", hl: "es-419",  gl: "UY", ceid: "UY:es-419"  },  // Spanish - Uruguay
  { code: "es-CR", hl: "es-419",  gl: "CR", ceid: "CR:es-419"  },  // Spanish - Costa Rica
  { code: "es-GT", hl: "es-419",  gl: "GT", ceid: "GT:es-419"  },  // Spanish - Guatemala
  { code: "es-DO", hl: "es-419",  gl: "DO", ceid: "DO:es-419"  },  // Spanish - Dominican Republic
  { code: "es-CU", hl: "es-419",  gl: "CU", ceid: "CU:es-419"  },  // Spanish - Cuba
  // ── OCEANIA ──────────────────────────────────────────────────────────────
  { code: "en-AU", hl: "en-AU",   gl: "AU", ceid: "AU:en"       },  // English - Australia
  { code: "en-NZ", hl: "en",      gl: "NZ", ceid: "NZ:en"       },  // English - New Zealand
  { code: "en-PG", hl: "en",      gl: "PG", ceid: "PG:en"       },  // English - Papua New Guinea
  { code: "en-FJ", hl: "en",      gl: "FJ", ceid: "FJ:en"       },  // English - Fiji
];


interface NewsResponse {
  ok: true;
  subject: string;
  articleCount: number;
  topSeverity: Article["severity"];
  keywordGroupCounts: Array<{ group: string; label: string; count: number }>;
  esgDomains: string[];
  articles: Article[];
  source: "google-news-rss" | "newsapi";
  languages: string[];
  fetchMode: "live" | "cached" | "static_fallback";
  fetchedAt: string;
  latencyMs: number;
  // NewsDossier enrichment fields
  sourceDiversityScore: number;       // 0–100: unique root domains / total articles × 100
  crossCorroboratedCount: number;     // number of findings reported by ≥2 independent domains
  propagandaSourceCount: number;      // number of articles from known state-media/propaganda outlets
  // Live-retrieval health. Distinguishes "searched the world, found nothing"
  // (retrieval:"live" → a genuine, documentable negative finding) from "could
  // not reach any news source" (retrieval:"unavailable" → an outage that must
  // NOT be presented as a clean result). FATF R.10 / FDL 10/2025: a wholesale
  // feed outage is not evidence of absence.
  retrieval: "live" | "degraded" | "unavailable";
  feedsAttempted: number;             // feeds we tried to fetch this request
  feedsReachable: number;             // feeds that returned HTTP 2xx
  degraded?: boolean;                 // convenience flag: retrieval !== "live"
  googleNewsRssEnabled?: boolean;     // false when GOOGLE_NEWS_RSS_ENABLED=false (datacenter-IP 403 workaround)
  // Set when live retrieval reached nothing but a cached dossier (stale L2 or
  // the background GDELT prefetch) was served instead. The UI shows these as
  // "cached, not live" — never as a fresh confirmed-clean result (FATF R.10).
  retrievalNote?: string;
  cachedAt?: string;                  // ISO timestamp of the cached payload served on the fallback path
  proxyConfigured?: boolean;          // true when news egress routes through NEWS_HTTP_PROXY / HTTPS_PROXY
  relayEnabled?: boolean;             // true when the free public-relay fallback (NEWS_RELAY_ENABLED) is active
}

function severityOrder(s: Article["severity"]): number {
  return { clear: 0, low: 1, medium: 2, high: 3, critical: 4 }[s];
}

function classifyArticleSeverity(
  hits: ReturnType<typeof classifyAdverseKeywords>,
): Article["severity"] {
  if (hits.length === 0) return "clear";
  // Critical groups → critical severity
  // Severity tiers mirror KEYWORD_GROUP_WEIGHT in super-brain/route.ts so
  // news-severity and composite score stay aligned. Weight ≥14 (and its
  // critical-regime neighbours) → critical/high; weight ≥10 → medium;
  // lower-weight informational groups (law-enforcement, political-exposure)
  // fall through to "low".
  const critical = new Set([
    "terrorism-financing",
    "proliferation-wmd",
    "regulatory-action",
  ]);
  const high = new Set([
    "money-laundering",
    "bribery-corruption",
    "organised-crime",
    "human-trafficking",
    "fraud-forgery",
    "environmental-crime",
  ]);
  const medium = new Set([
    "market-abuse",
    "tax-crime",
    "cybercrime",
    "insider-threat",
    "ai-misuse",
  ]);
  if (hits.some((h) => critical.has(h.group))) return "critical";
  if (hits.some((h) => high.has(h.group))) return "high";
  if (hits.some((h) => medium.has(h.group))) return "medium";
  return "low";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

// Sanitize RSS link fields: only allow https/http URLs — block javascript:,
// data: and other dangerous schemes that could execute as href values.
function sanitizeLink(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
}

// Strip combining diacritics (NFD decomposition) + Turkish dotless-ı so that
// a query token like "basak" matches article text containing "başak".
function normalizeDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i"); // Turkish dotless ı is not a combining mark
}

function parseRss(xml: string, subject: string, variants: string[], lang: string): Article[] {
  const items = xml.split(/<item>/i).slice(1);
  const out: Article[] = [];
  for (const raw of items) {
    const body = raw.split(/<\/item>/i)[0] ?? "";
    const pick = (tag: string): string => {
      const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")); // nosemgrep: detect-non-literal-regexp -- safe: controlled internal value, not user-HTTP-input; no ReDoS risk
      if (!m || !m[1]) return "";
      let v = m[1].trim();
      v = v.replace(/^<!\[CDATA\[|\]\]>$/g, "");
      return stripHtml(v);
    };
    const title = pick("title");
    const link = sanitizeLink(pick("link"));
    const pubDate = pick("pubDate");
    const source = pick("source") || pick("dc:creator") || "";
    const description = pick("description");
    if (!title && !description) continue;
    const snippet = description.slice(0, 300);
    const fullText = `${title} ${snippet}`;
    const kwHits = classifyAdverseKeywords(fullText);
    const esgHits = classifyEsg(fullText);

    // Fuzzy-match the article title against the subject + all name variants
    // using the brain's matchEnsemble (exact / levenshtein / jaro-winkler /
    // soundex / double-metaphone / token-set / trigram / partial-token-set).
    // Keep the best score so we can filter out false-positive hits.
    let fuzzyScore = 0;
    let fuzzyMethod = "—";
    let matchedVariant: string | undefined;
    const fullTextLower = fullText.toLowerCase();
    for (const v of variants) {
      try {
        const m = matchEnsemble(v, title);
        if (m?.best && m.best.score > fuzzyScore) {
          fuzzyScore = m.best.score;
          fuzzyMethod = m.best.method;
          matchedVariant = v === subject ? undefined : v;
        }
      } catch (err) {
        console.warn("[news-search] name-variant match failed:", err instanceof Error ? err.message : err);
      }
    }
    // Supplement: token presence in full text (title + snippet) catches
    // articles where the person's name appears in the body but not the
    // headline. Cap at 0.72 so a genuine title match always outranks it.
    // Diacritics are stripped so "halac" matches "Halaç", "ozcan" → "Özcan".
    if (fuzzyScore < 0.72) {
      const fullTextNorm = normalizeDiacritics(fullTextLower);
      for (const v of variants) {
        const vTokens = normalizeDiacritics(v.toLowerCase()).split(/\s+/).filter((t) => t.length >= 3);
        if (vTokens.length === 0) continue;
        const hits = vTokens.filter((t) => fullTextNorm.includes(t)).length;
        const tokenScore = (hits / vTokens.length) * 0.72;
        if (tokenScore > fuzzyScore) {
          fuzzyScore = tokenScore;
          fuzzyMethod = "token_presence";
          matchedVariant = v === subject ? undefined : v;
        }
      }
    }

    // Boost score for high-signal adverse media terms in title
    const adverseTermBoosts: Record<string, number> = {
      // Highest signal (criminal verdicts)
      "convicted": 20, "sentenced": 20, "imprisoned": 18, "jailed": 18,
      "extradited": 18, "guilty verdict": 18,
      // Criminal process
      "arrested": 15, "charged": 15, "indicted": 15, "sanctioned": 15,
      "designated": 12, "warrant": 12, "fugitive": 12,
      // Financial crime specific
      "laundering": 18, "money laundering": 20, "bribery": 15, "embezzlement": 15,
      "fraud": 12, "corruption": 12, "ponzi": 18, "pyramid scheme": 18,
      "insider trading": 15, "market manipulation": 15,
      // Terrorism / proliferation
      "terrorist": 18, "terror financing": 20, "proliferation": 15,
      // Enforcement
      "debarred": 12, "blacklisted": 15, "banned": 10,
      "regulatory fine": 12, "enforcement action": 12,
      "cease and desist": 10, "asset freeze": 15,
      // Sanctions
      "ofac": 18, "sdn list": 18, "un sanctions": 15,
      // Investigative
      "leaked documents": 12, "pandora papers": 18, "panama papers": 18,
      "fincen files": 18, "occrp": 12, "icij": 12,
    };
    const titleLower = title.toLowerCase();
    let boost = 0;
    for (const [term, pts] of Object.entries(adverseTermBoosts)) {
      if (titleLower.includes(term)) boost += pts;
    }
    const baseScore = Math.round(fuzzyScore * 100);
    const adjustedScore = Math.min(100, baseScore + boost);

    const tier = classifySource(link);
    const sourceCat = classifySourceCategory(link);
    // Established sources (tier1/tier2) get 2× weight via a larger tier boost.
    const tierBoost = tier === "tier1" ? 20 : tier === "tier2" ? 10 : 0;
    // For established sources, double the tier boost to reflect 2× authority weighting.
    const authorityMult = sourceCat === "state_media" ? 0.5
      : (tier === "tier1" || tier === "tier2") ? 2.0 : 1.0;
    const tieredScore = Math.min(100, Math.round((adjustedScore + tierBoost) * authorityMult));

    // Paywall detection — reduce weight to 50% if article appears to be behind paywall
    const paywalled = detectPaywall(description);

    // Recency weight — applied as multiplier on relevance score
    const recencyW = computeRecencyWeight(pubDate, sourceCat);

    // Combined weight factor: recency × paywall penalty (0.5 if paywalled)
    const weightFactor = recencyW * (paywalled ? 0.5 : 1.0);
    const finalScore = Math.round(tieredScore * weightFactor);

    const rawSeverity = classifyArticleSeverity(kwHits);
    const severity = applyStateMediCap(rawSeverity, sourceCat);

    const script = detectScript(title);
    const article: Article = {
      title,
      link,
      pubDate,
      source,
      snippet,
      keywordGroups: Array.from(new Set(kwHits.map((h) => h.group))),
      esgCategories: Array.from(new Set(esgHits.map((e) => e.categoryId))),
      severity,
      fuzzyScore: baseScore,
      fuzzyMethod,
      lang,
      relevanceScore: finalScore,
      sourceTier: tier,
      sourceCategory: sourceCat,
      script,
      requiresTranslation: script !== "latin",
      sourceAuthority: classifySourceAuthority(link),
      paywallLimited: paywalled || undefined,
      recencyWeight: recencyW !== 1.0 ? recencyW : undefined,
    };
    if (matchedVariant) article.matchedVariant = matchedVariant;
    out.push(article);
  }
  return out;
}

// ── Source category classification ──────────────────────────────────────────
// Maps domain patterns to editorial category so the UI can group/filter by
// category (e.g. "Show only investigative sources").
const WIRE_DOMAINS = new Set([
  "reuters.com", "apnews.com", "bloomberg.com", "ft.com", "wsj.com",
  "bbc.com", "bbc.co.uk", "theguardian.com", "nytimes.com",
  "lemonde.fr", "spiegel.de", "elpais.com", "afp.com",
  "dpa-international.com", "kyodonews.net",
  // Note: xinhuanet.com removed from WIRE_DOMAINS — classified as state_media above
]);
const INVESTIGATIVE_DOMAINS = new Set([
  "occrp.org", "icij.org", "transparency.org", "acfe.com",
  "balkaninsight.com", "globalwitness.org", "hrw.org",
  "correctiv.org", "thewire.in", "rappler.com", "irrawaddy.com",
  "dailymaverick.co.za", "groundup.org.za",
]);
const REGULATORY_DOMAINS = new Set([
  "fatf-gafi.org", "unodc.org", "bis.org", "imf.org",
  "ec.europa.eu", "sec.gov", "justice.gov", "worldbank.org",
  "ofac.treas.gov", "fca.org.uk", "eba.europa.eu",
  "euobserver.com",
]);
const REGIONAL_DOMAINS = new Set([
  // MENA
  "middleeasteye.net", "gulfnews.com", "thenationalnews.com",
  "khaleejtimes.com", "arabnews.com", "alarabiya.net", "albawaba.com",
  "aljazeera.com", "haaretz.com", "al-monitor.com", "iranintl.com",
  // Asia
  "scmp.com", "straitstimes.com", "channelnewsasia.com",
  "bangkokpost.com", "koreaherald.com", "asia.nikkei.com",
  "thejakartapost.com", "malaymail.com",
  // Africa
  "allafrica.com", "theeastafrican.co.ke", "nation.africa",
  "punchng.com", "premiumtimesng.com", "mg.co.za", "moneyweb.co.za",
  // LatAm
  "infobae.com", "lanacion.com.ar", "folha.uol.com.br",
  "elespectador.com", "eluniversal.com.mx", "elcomercio.pe",
  // Oceania
  "rnz.co.nz", "abc.net.au",
]);

function classifySourceCategory(url: string): Article["sourceCategory"] {
  if (!url) return undefined;
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    if (STATE_MEDIA_DOMAINS.has(domain)) return "state_media";
    if (INVESTIGATIVE_DOMAINS.has(domain)) return "investigative";
    if (REGULATORY_DOMAINS.has(domain)) return "regulatory";
    if (WIRE_DOMAINS.has(domain)) return "wire";
    if (REGIONAL_DOMAINS.has(domain)) return "regional";
    return undefined;
  } catch { return undefined; }
}

// Extract root domain (hostname without www.) for diversity scoring
function _rootDomain(url: string): string {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// Detect paywall / unavailable article based on short description containing
// access-restriction keywords.
function detectPaywall(description: string): boolean {
  if (description.length >= 100) return false;
  const lower = description.toLowerCase();
  return (
    lower.includes("subscribe") ||
    lower.includes("login required") ||
    lower.includes("premium") ||
    lower.includes("access denied")
  );
}

// Compute per-article recency weight multiplier based on publication date.
// Regulatory / official sources never decay (multiplier always 1).
function computeRecencyWeight(pubDate: string, sourceCategory: Article["sourceCategory"]): number {
  if (sourceCategory === "regulatory") return 1.0;
  const pubMs = pubDate ? Date.parse(pubDate) : 0;
  if (!Number.isFinite(pubMs) || pubMs === 0) return 1.0;
  const ageMs = Date.now() - pubMs;
  const ageDays = ageMs / (24 * 3600 * 1000);
  if (ageDays <= 30) return 1.2;           // last 30 days: +20%
  const ageYears = ageMs / (365.25 * 24 * 3600 * 1000);
  if (ageYears <= 3) return 0.7;           // 1–3 years: -30%
  return 0.4;                              // >3 years: -60%
}

// Classify source authority based on tier lists.
function classifySourceAuthority(url: string): Article["sourceAuthority"] {
  if (!url) return "unknown";
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    if (TIER1_DOMAINS.has(domain) || TIER2_DOMAINS.has(domain)) return "established";
    if (STATE_MEDIA_DOMAINS.has(domain)) return "new"; // treat as lower authority proxy
    return "unknown";
  } catch { return "unknown"; }
}

// Cap severity at "medium" for state-media sources, regardless of content.
function applyStateMediCap(severity: Article["severity"], sourceCategory: Article["sourceCategory"]): Article["severity"] {
  if (sourceCategory !== "state_media") return severity;
  const capped: Article["severity"][] = ["clear", "low", "medium"];
  return capped.includes(severity) ? severity : "medium";
}

// Per-locale feed timeout. 1.2s per feed keeps slow locales from dragging the timebox.
const FEED_TIMEOUT_MS = 1_200;

// Resolved once at module load (env is immutable after process start). True only
// when NEWS_FETCH_RELAY is set — i.e. the operator's own trusted Cloudflare Worker
// relay. The built-in public chain (NEWS_RELAY_ENABLED) is intentionally excluded
// here — it's too flaky for bulk parallel locale/investigative/regional fan-out.
const relayKeyless = newsOperatorRelayEnabled();

// Overall timebox — HARD SLA CEILING. Screening results must render within 5s,
// so retrieval is capped at 4s, leaving ~1s for merge/scoring/serialization. The
// fast primary sources easily fit (Google News RSS ~0.7s, regional banks ≤2s);
// the slow secondary source (GDELT, whose round-trip can exceed 4s) is best-effort
// within this window and otherwise covered by its background prefetch cache. This
// supersedes the earlier "give GDELT more time" tuning — the 5s SLA takes priority.
const OVERALL_TIMEBOX_MS = 4_000;

// Belt-and-suspenders global branch deadline. Every parallel retrieval branch
// (GDELT, the regional/investigative feed banks, and the keyed news-API
// adapters) is internally bounded by its own per-feed AbortSignal — but a
// single hung upstream (slow TLS, a commercial adapter that never resolves)
// would otherwise drag the awaited Promise.all toward the 30s maxDuration and
// surface as a 504 with zero articles. Wrapping each branch in withDeadline
// guarantees no branch can exceed the overall timebox regardless of how its
// internal timeouts behave. The fallback value is returned if the deadline
// fires first, so the dossier still assembles from whatever did resolve.
function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Early-exit threshold for the Google News locale fan-out. Once this many
// articles have accumulated across settled locales we resolve the fan-out
// immediately instead of waiting out the full OVERALL_TIMEBOX_MS — most
// adverse-media subjects with real press surface well before every one of the
// 100+ locales responds, so this cuts p50 latency without losing coverage.
const FANOUT_EARLY_EXIT_COUNT = 40;

// Live-retrieval health accounting. Each feed fetch records whether it actually
// reached its upstream (HTTP 2xx). The handler uses the aggregate to tell a
// genuine "found nothing" negative finding apart from a wholesale outage where
// every news source was unreachable (e.g. blocked egress / upstream 403).
type RetrievalStats = { attempted: number; reachable: number };
function noteFeedOutcome(stats: RetrievalStats | undefined, reachable: boolean): void {
  if (!stats) return;
  stats.attempted += 1;
  if (reachable) stats.reachable += 1;
}

// BROWSER_UA / FEED_HEADERS and the news egress path now live in
// @/lib/server/http-dispatcher so every feed fetch (and the /health probe) share
// one User-Agent and one optional outbound proxy. Google News RSS and several
// mainstream outlets 403 obvious bot User-Agents AND datacenter IPs; the browser
// UA defeats the former, the optional NEWS_HTTP_PROXY defeats the latter. Use
// newsFetch(...) instead of fetch(...) for any external feed below.

async function fetchLocaleFeed(
  q: string,
  locale: (typeof LOCALES)[number],
  variants: string[],
  stats?: RetrievalStats,
): Promise<Article[]> {
  // Post-fetch fuzzy scoring (fuzzyScore ≥ 75, or ≥ 55 + adverse keywords)
  // is the relevance gate. Do not quote the query — exact-phrase quoting
  // causes zero results when a subject’s name has common spelling variants
  // (e.g. GIANUZZI vs GIANNUZZI). Google’s token matching handles near-miss
  // spellings; the post-fetch filter handles precision.
  const queryParam = q;
  const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(queryParam)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await newsFetch(
      feed,
      { headers: FEED_HEADERS, signal: controller.signal } as RequestInit,
      { allowRelay: relayKeyless },
    );
    noteFeedOutcome(stats, res.ok);
    if (!res.ok) {
      console.warn(`[hawkeye] news-search/fetchLocaleFeed ${locale.code} HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    return parseRss(xml, q, variants, locale.code);
  } catch (err) {
    noteFeedOutcome(stats, false);
    console.warn(`[hawkeye] news-search/fetchLocaleFeed ${locale.code} threw:`, err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Investigative / regulatory RSS feeds ────────────────────────────────────
// Tier-1 investigative journalism and regulatory body feeds.  These are
// fetched in parallel with the Google News locale fan-out and merged into the
// main article list.  Subject-name filtering is done post-fetch (same fuzzy
// scoring as the locale feeds) so we don't query Google at all for these
// feeds.
const INVESTIGATIVE_FEEDS: Array<{
  url: string;
  lang: string;
  sourceTier: "tier1" | "tier2";
  sourceCategory: NonNullable<Article["sourceCategory"]>;
  name: string;
}> = [
  // Tier-1 investigative journalism
  { url: "https://www.occrp.org/feed/",                                    lang: "en", sourceTier: "tier1", sourceCategory: "investigative", name: "OCCRP" },
  { url: "https://www.icij.org/feed/",                                     lang: "en", sourceTier: "tier1", sourceCategory: "investigative", name: "ICIJ" },
  // Financial crime / regulatory bodies
  { url: "https://www.fatf-gafi.org/media/fatf/rss/fatf-en.rss",          lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "FATF" },
  { url: "https://www.unodc.org/unodc/en/rss/news.xml",                   lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "UNODC" },
  { url: "https://www.transparency.org/en/feed",                           lang: "en", sourceTier: "tier1", sourceCategory: "investigative", name: "TI" },
  // Balkan Investigative Reporting Network
  { url: "https://balkaninsight.com/feed/",                                lang: "en", sourceTier: "tier2", sourceCategory: "investigative", name: "BIRN" },
  // Global Witness — natural resources / corruption
  { url: "https://www.globalwitness.org/en/campaigns/feed/",               lang: "en", sourceTier: "tier2", sourceCategory: "investigative", name: "GlobalWitness" },
  // Human Rights Watch — trafficking / forced labour
  { url: "https://www.hrw.org/rss/news",                                   lang: "en", sourceTier: "tier2", sourceCategory: "investigative", name: "HRW" },
  // Middle East Eye
  { url: "https://www.middleeasteye.net/rss",                              lang: "en", sourceTier: "tier2", sourceCategory: "regional",      name: "MEE" },
  // Al-Monitor — MENA investigative
  { url: "https://www.al-monitor.com/rss.xml",                             lang: "en", sourceTier: "tier2", sourceCategory: "regional",      name: "Al-Monitor" },
  // Iran International — Persian Gulf / Iran
  { url: "https://www.iranintl.com/en/rss",                                lang: "en", sourceTier: "tier2", sourceCategory: "regional",      name: "IranIntl" },
  // EUobserver — EU regulatory / anti-corruption
  { url: "https://euobserver.com/rss",                                     lang: "en", sourceTier: "tier2", sourceCategory: "regulatory",    name: "EUobserver" },
  // ACFE (Association of Certified Fraud Examiners)
  { url: "https://www.acfe.com/rss/fraud-examiner-newsletter.xml",         lang: "en", sourceTier: "tier2", sourceCategory: "investigative", name: "ACFE" },
  // Correctiv — German investigative journalism
  { url: "https://correctiv.org/feed/",                                    lang: "de", sourceTier: "tier2", sourceCategory: "investigative", name: "CORRECTIV" },
  // Le Monde investigative / France
  { url: "https://www.lemonde.fr/rss/une.xml",                             lang: "fr", sourceTier: "tier1", sourceCategory: "wire",          name: "LeMonde" },
  // Der Spiegel — Germany investigative
  { url: "https://www.spiegel.de/schlagzeilen/index.rss",                  lang: "de", sourceTier: "tier1", sourceCategory: "wire",          name: "Spiegel" },
  // RFERL — Radio Free Europe / Radio Liberty
  { url: "https://www.rferl.org/api/zikhiqmr_qp_puz/",                     lang: "en", sourceTier: "tier2", sourceCategory: "investigative", name: "RFERL" },
  // Bellingcat — open-source investigative journalism
  { url: "https://www.bellingcat.com/feed/",                                lang: "en", sourceTier: "tier2", sourceCategory: "investigative", name: "Bellingcat" },
  // The Sentry — African financial crime
  { url: "https://thesentry.org/feed/",                                     lang: "en", sourceTier: "tier2", sourceCategory: "investigative", name: "TheSentry" },
  // Finance Uncovered — tax & financial transparency
  { url: "https://www.financeuncovered.org/feed/",                          lang: "en", sourceTier: "tier2", sourceCategory: "investigative", name: "FinanceUncovered" },
  // CFTC — US Commodity Futures Trading Commission enforcement
  { url: "https://www.cftc.gov/rss/pressreleases.xml",                      lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "CFTC" },
  // FinCEN — US Financial Crimes Enforcement Network
  { url: "https://www.fincen.gov/news/news-releases/feed",                  lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "FinCEN" },
  // INTERPOL — international law enforcement
  { url: "https://www.interpol.int/News-and-Events/News/rss.xml",           lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "INTERPOL" },
  // EBA — European Banking Authority
  { url: "https://www.eba.europa.eu/rss/news.rss",                          lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "EBA" },
  // GRECO — Council of Europe anti-corruption body
  { url: "https://www.coe.int/en/web/greco/evaluations/news",               lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "GRECO" },
  // MENA investigative / regional
  { url: "https://english.alarabiya.net/rss.xml",                            lang: "en", sourceTier: "tier2", sourceCategory: "regional",      name: "AlArabiya-EN" },
  { url: "https://english.alaraby.co.uk/feed",                               lang: "en", sourceTier: "tier2", sourceCategory: "regional",      name: "TheNewArab" },
  { url: "https://www.jpost.com/Rss/RssFeedsHeadlines.aspx",                 lang: "en-IL", sourceTier: "tier2", sourceCategory: "regional",  name: "JPost" },
  // ILO — International Labour Organization (forced labour / modern slavery)
  { url: "https://www.ilo.org/global/topics/forced-labour/news/lang--en/rss.xml", lang: "en", sourceTier: "tier1", sourceCategory: "regulatory", name: "ILO-ForcedLabour" },
  // UNODC — UN Office on Drugs and Crime (human trafficking / TIP)
  { url: "https://www.unodc.org/unodc/en/human-trafficking/news.rss",        lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "UNODC-TIP" },
  // SEC Enforcement — US Securities & Exchange Commission litigation releases
  { url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=litigation&dateb=&owner=include&count=40&search_text=&output=atom", lang: "en", sourceTier: "tier1", sourceCategory: "regulatory", name: "SEC-Enforcement" },
  // ESMA — European Securities and Markets Authority news
  { url: "https://www.esma.europa.eu/press-news/esma-news-feed",              lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "ESMA" },
];

// ── Africa RSS feeds ────────────────────────────────────────────────────────
// Pan-African and major national outlets covering the continent's key
// financial-crime and governance stories.
const AFRICA_FEEDS: Array<{
  url: string;
  lang: string;
  name: string;
  sourceTier: "tier1" | "tier2";
}> = [
  { url: "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf",  lang: "en",    name: "AllAfrica",         sourceTier: "tier2" },
  { url: "https://nation.africa/rss-feeds/?categoryId=1190",                lang: "en-KE", name: "Daily Nation Kenya", sourceTier: "tier2" },
  { url: "https://www.theeastafrican.co.ke/tea/rss",                        lang: "en-KE", name: "East African",      sourceTier: "tier2" },
  { url: "https://punchng.com/feed/",                                        lang: "en-NG", name: "Punch Nigeria",     sourceTier: "tier2" },
  { url: "https://www.premiumtimesng.com/feed/",                            lang: "en-NG", name: "Premium Times NG",  sourceTier: "tier2" },
  { url: "https://www.dailymaverick.co.za/feed/",                            lang: "en-ZA", name: "Daily Maverick ZA", sourceTier: "tier2" },
  { url: "https://mg.co.za/feed/",                                           lang: "en-ZA", name: "Mail & Guardian ZA",sourceTier: "tier2" },
  { url: "https://www.businessdayonline.com/feed/",                          lang: "en-NG", name: "BusinessDay NG",    sourceTier: "tier2" },
  { url: "https://www.moneyweb.co.za/feed/",                                 lang: "en-ZA", name: "Moneyweb ZA",       sourceTier: "tier2" },
  { url: "https://www.africanews.com/feed/rss2/",                            lang: "en",    name: "Africanews",        sourceTier: "tier2" },
  // Pan-African
  { url: "https://thecontinent.org/feed/",                                   lang: "en",    name: "TheContinent",      sourceTier: "tier2" },
  // Sahel Eye — French-language Sahel region coverage
  { url: "https://saheleye.net/feed/",                                        lang: "fr",    name: "SahelEye",          sourceTier: "tier2" },
  // Africa Report — pan-African business and politics
  { url: "https://www.theafricareport.com/feed/",                            lang: "en",    name: "AfricaReport",      sourceTier: "tier2" },
  // Business Live ZA — South African business news
  { url: "https://www.businesslive.co.za/rss/latest.rss",                    lang: "en-ZA", name: "BusinessLiveZA",    sourceTier: "tier2" },
  // Financial Nigeria
  { url: "https://financialnigeria.com/feed/",                               lang: "en-NG", name: "FinancialNigeria",  sourceTier: "tier2" },
];

// ── Latin America RSS feeds ─────────────────────────────────────────────────
// Major LatAm news outlets covering financial crime, corruption, and
// narco-trafficking across the region.
const LATAM_FEEDS: Array<{
  url: string;
  lang: string;
  name: string;
  sourceTier: "tier1" | "tier2";
}> = [
  { url: "https://www.infobae.com/feeds/rss/home.xml",                      lang: "es-AR", name: "Infobae",           sourceTier: "tier2" },
  { url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/",              lang: "es-AR", name: "La Nación AR",      sourceTier: "tier2" },
  { url: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml",          lang: "pt",    name: "Folha SP",          sourceTier: "tier2" },
  { url: "https://www.elespectador.com/rss/",                               lang: "es-CO", name: "El Espectador CO",  sourceTier: "tier2" },
  { url: "https://www.eluniversal.com.mx/rss.xml",                          lang: "es-MX", name: "El Universal MX",   sourceTier: "tier2" },
  { url: "https://elcomercio.pe/rss/",                                       lang: "es-PE", name: "El Comercio PE",    sourceTier: "tier2" },
  { url: "https://www.laprensa.hn/rss/",                                    lang: "es",    name: "La Prensa HN",      sourceTier: "tier2" },
  { url: "https://www.prensa.com/feed/",                                     lang: "es",    name: "La Prensa PA",      sourceTier: "tier2" },
  // El País América — Spain/LatAm edition
  { url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/america/portada", lang: "es", name: "ElPaisAmerica", sourceTier: "tier1" },
  // Agencia EFE — Spanish wire service Americas
  { url: "https://www.efe.com/efe/america/portada/rss.xml",                  lang: "es",    name: "EFE",               sourceTier: "tier1" },
  // O Globo — Brazil
  { url: "https://oglobo.globo.com/rss.xml",                                 lang: "pt",    name: "OGlobo",            sourceTier: "tier2" },
  // Voz de América Español
  { url: "https://www.vozdeamerica.com/rss.xml",                             lang: "es",    name: "VOA-ES",            sourceTier: "tier2" },
];

// ── Oceania / Pacific RSS feeds ─────────────────────────────────────────────
const OCEANIA_FEEDS: Array<{
  url: string;
  lang: string;
  name: string;
  sourceTier: "tier1" | "tier2";
}> = [
  { url: "https://www.rnz.co.nz/rss/national.xml",                          lang: "en-NZ", name: "RNZ New Zealand",   sourceTier: "tier2" },
  { url: "https://www.abc.net.au/news/feed/52278/rss.xml",                  lang: "en-AU", name: "ABC Australia",     sourceTier: "tier2" },
  { url: "https://www.rnz.co.nz/international/pacific-news/rss.xml",        lang: "en",    name: "RNZ Pacific",       sourceTier: "tier2" },
  { url: "https://www.abc.net.au/pacific/rss.xml",                          lang: "en",    name: "ABC Pacific Beat",  sourceTier: "tier2" },
];

// 2-second timeout for each investigative feed — slightly more generous than
// the 1.5s locale timeout since these are non-Google servers.
const INVESTIGATIVE_FEED_TIMEOUT_MS = 2_000;

async function fetchInvestigativeFeeds(subjectName: string, variants: string[], stats?: RetrievalStats): Promise<Article[]> {
  const results = await Promise.allSettled(
    INVESTIGATIVE_FEEDS.map(async (feed) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), INVESTIGATIVE_FEED_TIMEOUT_MS);
      try {
        const res = await newsFetch(
          feed.url,
          { headers: FEED_HEADERS, signal: controller.signal } as RequestInit,
          { allowRelay: relayKeyless },
        );
        noteFeedOutcome(stats, res.ok);
        if (!res.ok) {
          console.warn(`[hawkeye] investigative-feed/${feed.name} HTTP ${res.status}`);
          return [] as Article[];
        }
        const xml = await res.text();
        const articles = parseRss(xml, subjectName, variants, feed.lang);
        // Override tier and category from feed config (parseRss uses classifySource
        // on the article link; we want the feed-level classification to take precedence).
        return articles.map((a) => ({
          ...a,
          sourceTier: feed.sourceTier,
          sourceCategory: feed.sourceCategory,
          // Re-apply tier boost since we're overriding the tier
          relevanceScore: Math.min(100, (a.relevanceScore ?? a.fuzzyScore) + (feed.sourceTier === "tier1" ? 20 : 10)),
          source: a.source || feed.name,
        }));
      } catch (err) {
        noteFeedOutcome(stats, false);
        console.warn(`[hawkeye] investigative-feed/${feed.name} threw:`, err);
        return [] as Article[];
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const allArticles: Article[] = [];
  const seenLinks = new Set<string>();
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const a of r.value) {
        const key = a.link || a.title;
        if (!seenLinks.has(key)) {
          seenLinks.add(key);
          allArticles.push(a);
        }
      }
    }
  }
  return allArticles;
}

// ── East / Southeast Asian RSS feeds ────────────────────────────────────────
// Regional English-language news outlets covering Greater China, Japan, Korea,
// South Asia, and Southeast Asia.  Fetched in parallel with the investigative
// feed fan-out and the Google News locale fan-out.
const ASIAN_FEEDS: Array<{
  url: string;
  lang: string;
  name: string;
  sourceTier: "tier1" | "tier2";
}> = [
  // Greater China
  { url: "https://www.scmp.com/rss/91/feed",                         lang: "en-CN", name: "SCMP",                sourceTier: "tier2" },
  // Japan — Nikkei Asia
  { url: "https://asia.nikkei.com/rss/feed/nar",                     lang: "en-JP", name: "Nikkei Asia",         sourceTier: "tier2" },
  // Korea — Korea Herald
  { url: "https://www.koreaherald.com/common/rss.php",               lang: "en-KR", name: "Korea Herald",        sourceTier: "tier2" },
  // India — investigative
  { url: "https://thewire.in/feed",                                  lang: "en-IN", name: "The Wire India",       sourceTier: "tier2" },
  // Philippines — investigative
  { url: "https://www.rappler.com/feed",                             lang: "en-PH", name: "Rappler Philippines",  sourceTier: "tier2" },
  // Indonesia
  { url: "https://www.thejakartapost.com/feed",                      lang: "en-ID", name: "Jakarta Post",         sourceTier: "tier2" },
  // Vietnam
  { url: "https://e.vnexpress.net/rss/news.rss",                     lang: "en-VN", name: "VnExpress",            sourceTier: "tier2" },
  // Thailand
  { url: "https://www.bangkokpost.com/rss/data/topstories.xml",      lang: "en-TH", name: "Bangkok Post",         sourceTier: "tier2" },
  // Malaysia
  { url: "https://www.malaymail.com/feed",                           lang: "en-MY", name: "Malay Mail",           sourceTier: "tier2" },
  // Myanmar — Irrawaddy (investigative)
  { url: "https://www.irrawaddy.com/feed",                           lang: "en-MM", name: "The Irrawaddy",        sourceTier: "tier2" },
  // Singapore — CNA
  { url: "https://www.channelnewsasia.com/rssfeeds/8395986",         lang: "en-SG", name: "CNA Singapore",        sourceTier: "tier2" },
  // Pakistan — Dawn
  { url: "https://www.dawn.com/feeds/home",                          lang: "en-PK", name: "Dawn Pakistan",        sourceTier: "tier2" },
  // India — The Hindu
  { url: "https://www.thehindu.com/news/feeder/default.rss",         lang: "en-IN", name: "The Hindu",            sourceTier: "tier2" },
  // Singapore — Straits Times Asia
  { url: "https://www.straitstimes.com/news/asia/rss.xml",           lang: "en-SG", name: "Straits Times",        sourceTier: "tier2" },
  // Greater China — SCMP Asia section
  { url: "https://www.scmp.com/rss/5/feed",                          lang: "en-CN", name: "SCMP Asia",            sourceTier: "tier2" },
  // Japan — Nikkei Markets
  { url: "https://asia.nikkei.com/rss/feed/markets",                 lang: "en-JP", name: "Nikkei Markets",       sourceTier: "tier2" },
  // Radio Free Asia
  { url: "https://www.rfa.org/english/news/rss2.xml",                lang: "en",    name: "RadioFreeAsia",        sourceTier: "tier2" },
];

// Generic regional feed fetcher — reused by Asia, Africa, LatAm, Oceania.
async function fetchRegionalFeeds(
  feeds: Array<{ url: string; lang: string; name: string; sourceTier: "tier1" | "tier2" }>,
  subjectName: string,
  variants: string[],
  tag: string,
  stats?: RetrievalStats,
): Promise<Article[]> {
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), INVESTIGATIVE_FEED_TIMEOUT_MS);
      try {
        const res = await newsFetch(
          feed.url,
          { headers: FEED_HEADERS, signal: controller.signal } as RequestInit,
          { allowRelay: relayKeyless },
        );
        noteFeedOutcome(stats, res.ok);
        if (!res.ok) {
          console.warn(`[hawkeye] ${tag}/${feed.name} HTTP ${res.status}`);
          return [] as Article[];
        }
        const xml = await res.text();
        const articles = parseRss(xml, subjectName, variants, feed.lang);
        return articles.map((a) => ({
          ...a,
          sourceTier: feed.sourceTier,
          sourceCategory: "regional" as NonNullable<Article["sourceCategory"]>,
          relevanceScore: Math.min(100, (a.relevanceScore ?? a.fuzzyScore) + (feed.sourceTier === "tier1" ? 20 : 10)),
          source: a.source || feed.name,
        }));
      } catch (err) {
        noteFeedOutcome(stats, false);
        console.warn(`[hawkeye] ${tag}/${feed.name} threw:`, err);
        return [] as Article[];
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const allArticles: Article[] = [];
  const seenLinks = new Set<string>();
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const a of r.value) {
        const key = a.link || a.title;
        if (!seenLinks.has(key)) {
          seenLinks.add(key);
          allArticles.push(a);
        }
      }
    }
  }
  return allArticles;
}

async function fetchAsianFeeds(subjectName: string, variants: string[], stats?: RetrievalStats): Promise<Article[]> {
  return fetchRegionalFeeds(ASIAN_FEEDS, subjectName, variants, "asian-feed", stats);
}

async function fetchAfricaFeeds(subjectName: string, variants: string[], stats?: RetrievalStats): Promise<Article[]> {
  return fetchRegionalFeeds(AFRICA_FEEDS, subjectName, variants, "africa-feed", stats);
}

async function fetchLatamFeeds(subjectName: string, variants: string[], stats?: RetrievalStats): Promise<Article[]> {
  return fetchRegionalFeeds(LATAM_FEEDS, subjectName, variants, "latam-feed", stats);
}

async function fetchOceaniaFeeds(subjectName: string, variants: string[], stats?: RetrievalStats): Promise<Article[]> {
  return fetchRegionalFeeds(OCEANIA_FEEDS, subjectName, variants, "oceania-feed", stats);
}

// ── GDELT Doc 2.0 — keyless global news API ─────────────────────────────────
// A second, fully independent live source so adverse-media retrieval no longer
// depends on Google News alone. GDELT indexes worldwide press in 100+ languages,
// requires no API key, and returns JSON. Results are mapped into the adapter
// NewsArticle shape so they flow through the existing fuzzy-scoring / severity /
// source-tiering pipeline with no duplicated logic.
const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";
// GDELT is a keyless SECONDARY source (Google News RSS is primary). Bounded by
// the 4s screening SLA window — if GDELT can't answer that fast it's dropped from
// the live merge (Google News still carries worldwide coverage) and picked up
// from the background prefetch cache instead. Don't raise this past
// OVERALL_TIMEBOX_MS or it can't help anyway.
const GDELT_TIMEOUT_MS = 4_000;

function parseGdeltDate(seendate: string | undefined): string {
  // GDELT seendate format: "20240115T120000Z" → ISO 8601.
  if (!seendate || !/^\d{8}T\d{6}Z$/.test(seendate)) return new Date().toISOString();
  const y = seendate.slice(0, 4), mo = seendate.slice(4, 6), d = seendate.slice(6, 8);
  const h = seendate.slice(9, 11), mi = seendate.slice(11, 13), s = seendate.slice(13, 15);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

async function fetchGdeltArticles(q: string, stats?: RetrievalStats): Promise<NewsArticle[]> {
  // Phrase-quote the query so a multi-token name is matched as a unit rather
  // than OR'd across tokens (which would flood the result with noise).
  const url =
    `${GDELT_DOC_API}?format=json&mode=ArtList&maxrecords=75&sort=DateDesc` +
    `&query=${encodeURIComponent(`"${q}"`)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GDELT_TIMEOUT_MS);
  try {
    // allowRelay: GDELT is keyless and a single worldwide call, so it is the one
    // high-value source worth retrying through the free public relay when the
    // datacenter IP is 403'd (no API key / paid proxy required).
    const res = await newsFetch(
      url,
      { headers: FEED_HEADERS, signal: controller.signal } as RequestInit,
      { allowRelay: true },
    );
    noteFeedOutcome(stats, res.ok);
    if (!res.ok) {
      console.warn(`[hawkeye] news-search/gdelt HTTP ${res.status}`);
      return [];
    }
    // GDELT returns text/plain on a rejected query and JSON on success.
    const text = await res.text();
    let data: { articles?: Array<Record<string, unknown>> };
    try {
      data = JSON.parse(text);
    } catch {
      console.warn("[hawkeye] news-search/gdelt non-JSON response (query likely rejected)");
      return [];
    }
    if (!Array.isArray(data.articles)) return [];
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    return data.articles
      .map((a): NewsArticle | null => {
        const link = str(a["url"]);
        const title = str(a["title"]);
        if (!link || !title) return null;
        return {
          source: "gdelt",
          outlet: str(a["domain"]),
          title,
          url: link,
          publishedAt: parseGdeltDate(str(a["seendate"]) || undefined),
          snippet: "",
          language: str(a["language"]).slice(0, 2).toLowerCase() || "en",
        };
      })
      .filter((a): a is NewsArticle => a !== null);
  } catch (err) {
    noteFeedOutcome(stats, false);
    console.warn("[hawkeye] news-search/gdelt threw:", err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter || 1);
}

function tierOrder(t: string): number { return t === "tier1" ? 3 : t === "tier2" ? 2 : 1; }

// Max distinct-source restatements retained per cluster for corroboration
// disclosure. 12 leaves headroom above the UI's 10-source elevated cap while
// keeping the payload bounded.
const MAX_CORROBORATING_SOURCES = 12;

function clusterArticles(articles: Article[]): Article[] {
  const clusters: Array<{
    rep: Article;
    tokens: Set<string>;
    sources: Set<string>;
    // Full per-distinct-source records of the absorbed restatements.
    members: Array<NonNullable<Article["corroboratingSources"]>[number]>;
  }> = [];
  const asMember = (a: Article): NonNullable<Article["corroboratingSources"]>[number] => ({
    title: a.title,
    link: a.link,
    source: a.source,
    pubDate: a.pubDate,
    sourceTier: a.sourceTier,
    severity: a.severity,
  });
  for (const a of articles) {
    const toks = tokens(a.title);
    let absorbed = false;
    for (const c of clusters) {
      if (jaccard(toks, c.tokens) >= 0.7) {
        // Same event — keep the rep but record the source + escalate
        // severity if the absorbed article is higher-severity than the
        // representative. This avoids losing a "critical"-severity
        // Reuters wire under a "medium" Le Figaro restatement of the
        // same facts.
        if (severityOrder(a.severity) > severityOrder(c.rep.severity)) {
          c.rep.severity = a.severity;
        }
        // When absorbing: if absorbed article is higher tier than rep, make it the new rep
        if (tierOrder(a.sourceTier) > tierOrder(c.rep.sourceTier)) {
          const oldRep = c.rep;
          c.rep = a;
          if (oldRep.source) c.sources.add(oldRep.source);
          if (oldRep.source && c.members.length < MAX_CORROBORATING_SOURCES) c.members.push(asMember(oldRep));
        } else {
          if (a.source) c.sources.add(a.source);
          if (a.source && c.members.length < MAX_CORROBORATING_SOURCES) c.members.push(asMember(a));
        }
        absorbed = true;
        break;
      }
    }
    if (!absorbed) {
      clusters.push({
        rep: a,
        tokens: toks,
        sources: new Set(a.source ? [a.source] : []),
        members: [],
      });
    }
  }
  return clusters.map((c) => {
    const extras = Array.from(c.sources).filter((s) => s && s !== c.rep.source);
    // Dedupe corroborations by source so each distinct outlet appears once.
    const seenSrc = new Set<string>([c.rep.source]);
    const corroboratingSources = c.members.filter((m) => {
      if (!m.source || seenSrc.has(m.source)) return false;
      seenSrc.add(m.source);
      return true;
    });
    if (extras.length === 0) {
      return corroboratingSources.length > 0 ? { ...c.rep, corroboratingSources } : c.rep;
    }
    return {
      ...c.rep,
      source: c.rep.source
        ? `${c.rep.source} + ${extras.length} more`
        : extras.join(", "),
      ...(corroboratingSources.length > 0 ? { corroboratingSources } : {}),
    };
  });
}

function emptyResponse(
  q: string,
  fetchMode: NewsResponse["fetchMode"] = "live",
  latencyMs = 0,
  retrieval: NewsResponse["retrieval"] = "unavailable",
): NewsResponse {
  return {
    ok: true,
    subject: q,
    articleCount: 0,
    topSeverity: "clear",
    keywordGroupCounts: [],
    esgDomains: [],
    articles: [],
    source: "google-news-rss",
    languages: [],
    fetchMode,
    fetchedAt: new Date().toISOString(),
    latencyMs,
    sourceDiversityScore: 0,
    crossCorroboratedCount: 0,
    propagandaSourceCount: 0,
    // An empty dossier is only ever returned on the disabled-RSS path or the
    // last-resort catch — neither of which performed a successful live crawl,
    // so the honest default is "unavailable", never a clean "live" negative.
    retrieval,
    feedsAttempted: 0,
    feedsReachable: 0,
    degraded: retrieval !== "live",
  };
}

const MAX_Q_LENGTH = 500;

// 2-minute in-memory cache to avoid hammering Google News RSS for repeated queries.
// This is the L1 cache — process-local, so on serverless each warm instance keeps
// its own copy. L2 (NEWS_BLOB_CACHE_*) is a cross-instance Blobs-backed cache so a
// result fetched by one Lambda is reused by sibling instances, lifting the hit rate.
const NEWS_CACHE = new Map<string, { data: NewsResponse; expires: number }>();
const NEWS_CACHE_TTL_MS = 2 * 60 * 1000;
const NEWS_BLOB_CACHE_PREFIX = "news-cache/";

// Cross-instance (L2) cache backed by Netlify Blobs. Fully fail-soft: getJson /
// setJson already swallow and log their own errors, and we additionally guard
// against any throw so a Blobs outage never breaks adverse-media retrieval.
function newsBlobCacheKey(cacheKey: string): string {
  // Hash-free, filesystem-safe key: lowercased query is already normalised; encode
  // to keep the blob path well-formed for arbitrary subject names.
  return `${NEWS_BLOB_CACHE_PREFIX}${encodeURIComponent(cacheKey)}.json`;
}
async function readNewsBlobCache(cacheKey: string): Promise<NewsResponse | null> {
  try {
    const entry = await getJson<{ data: NewsResponse; expires: number }>(newsBlobCacheKey(cacheKey));
    if (entry && entry.expires > Date.now() && entry.data) return entry.data;
  } catch { /* fail-soft — treat as a miss */ }
  return null;
}
async function writeNewsBlobCache(cacheKey: string, data: NewsResponse): Promise<void> {
  try {
    await setJson(newsBlobCacheKey(cacheKey), { data, expires: Date.now() + NEWS_CACHE_TTL_MS });
  } catch { /* fail-soft — L1 still serves */ }
}
// Outage-only stale read: ignores the 2-minute TTL. Used solely on the
// retrieval==="unavailable" fallback path so a transient feed outage degrades to
// the last good dossier instead of a bare "0 feeds reachable". The result is
// re-flagged fetchMode:"cached"/retrieval:"degraded" by the caller so it is never
// presented as a fresh, confirmed-clean negative finding (FATF R.10).
async function readNewsBlobCacheStale(cacheKey: string): Promise<NewsResponse | null> {
  try {
    const entry = await getJson<{ data: NewsResponse; expires: number }>(newsBlobCacheKey(cacheKey));
    if (entry?.data) return entry.data;
  } catch { /* fail-soft — treat as a miss */ }
  return null;
}

// Map one background-prefetched GDELT record to a fully-classified Article using
// the same adverse-keyword / ESG / severity passes the live path uses, so cached
// fallback articles carry identical enrichment.
function gdeltRecordToArticle(rec: GdeltArticle): Article | null {
  const title = rec.title?.trim();
  const link = rec.url?.trim();
  if (!title || !link) return null;
  const kwHits = classifyAdverseKeywords(title);
  const esgHits = classifyEsg(title);
  return {
    title,
    link,
    pubDate: parseGdeltDate(rec.seendate),
    source: rec.domain ?? "gdelt",
    snippet: title, // GDELT artlist mode has no body text; title is the best signal.
    keywordGroups: Array.from(new Set(kwHits.map((h) => h.group))),
    esgCategories: Array.from(new Set(esgHits.map((e) => e.categoryId))),
    severity: classifyArticleSeverity(kwHits),
    fuzzyScore: 100, // already name-matched by the prefetch query that produced the record
    fuzzyMethod: "gdelt_prefetch_cache",
    lang: (rec.language ?? "en").slice(0, 2).toLowerCase() || "en",
    sourceTier: "unknown",
  };
}

// Read the background GDELT prefetch cache (netlify/functions/gdelt-prefetch.mts,
// store "gdelt-cache", key "gdelt:{subject}") — the same store /api/adverse-media
// already reads. Fail-soft: any miss/throw returns null.
async function readGdeltPrefetchArticles(
  subject: string,
): Promise<{ articles: Article[]; cachedAt: string } | null> {
  try {
    const store = getStore({ name: "gdelt-cache" });
    const cached = (await store.get(`gdelt:${subject}`, { type: "json" })) as
      | { articles?: GdeltArticle[]; cachedAt?: string }
      | null;
    if (!cached?.articles || !Array.isArray(cached.articles)) return null;
    const articles = cached.articles
      .map(gdeltRecordToArticle)
      .filter((a): a is Article => a !== null)
      .slice(0, 20);
    if (articles.length === 0) return null;
    return { articles, cachedAt: cached.cachedAt ?? new Date().toISOString() };
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  // Gate the 7-locale RSS fan-out behind the per-key rate limiter.
  // Anonymous callers still get the free-tier burst window; without
  // this, a single user could trivially pin a Netlify Function into a
  // quota-exhaustion loop.
  const gate = await enforce(req, { requireAuth: false, cost: 3 });
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { ok: false, error: "query `q` required" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (q.length > MAX_Q_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "query `q` too long" },
      { status: 400, headers: gateHeaders },
    );
  }
  // F-18: Reject control characters in query to prevent injection into
  // RSS query strings and external news API parameters.
  if (/[\x00-\x1f\x7f]/.test(q)) {
    return NextResponse.json(
      { ok: false, error: "query `q` contains disallowed control characters" },
      { status: 400, headers: gateHeaders },
    );
  }

  const cacheKey = q.toLowerCase().trim();
  const cached = NEWS_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    incrementCounter("hawkeye_news_requests_total", 1, { result: "cache_hit_l1" });
    return NextResponse.json({ ...cached.data, fetchMode: "cached" as const }, { headers: gateHeaders });
  }
  // L2: cross-instance Blobs cache. A sibling Lambda may have already paid the
  // 9s fan-out cost for this subject within the TTL window.
  const l2 = await readNewsBlobCache(cacheKey);
  if (l2) {
    NEWS_CACHE.set(cacheKey, { data: l2, expires: Date.now() + NEWS_CACHE_TTL_MS });
    incrementCounter("hawkeye_news_requests_total", 1, { result: "cache_hit_l2" });
    return NextResponse.json({ ...l2, fetchMode: "cached" as const }, { headers: gateHeaders });
  }

  // From here down, any internal failure returns a well-formed empty
  // dossier with `ok: true` and HTTP 200. Adverse-media is a regulator-
  // facing panel — surfacing "server 502" / "news fetch failed" to an
  // MLRO is worse than surfacing zero articles with the neutral
  // "No articles found" empty state.

  // GOOGLE_NEWS_RSS_ENABLED can be set to "false" to disable the Google News
  // RSS locale fan-out specifically (e.g. when Google rate-limits / 403s this
  // deployment's datacenter IP). It does NOT disable adverse-media retrieval:
  // GDELT (keyless), the keyed news-API adapters, and the investigative /
  // regional feed banks still run so a blocked Google News path never silently
  // collapses the whole dossier to "unavailable". Defaults to enabled.
  const rssEnabled = process.env["GOOGLE_NEWS_RSS_ENABLED"] !== "false";
  const fetchedAt = new Date().toISOString();

  function arabicToLatinVariants(name: string): string[] {
    const variants: string[] = [];
    // Common Arabic → Latin substitutions
    const subst: Array<[RegExp, string]> = [
      [/ال/g, "al-"],
      [/ا|أ|إ|آ/g, "a"],
      [/ب/g, "b"],
      [/ت/g, "t"],
      [/ث/g, "th"],
      [/ج/g, "j"],
      [/ح/g, "h"],
      [/خ/g, "kh"],
      [/د/g, "d"],
      [/ذ/g, "dh"],
      [/ر/g, "r"],
      [/ز/g, "z"],
      [/س/g, "s"],
      [/ش/g, "sh"],
      [/ص/g, "s"],
      [/ض/g, "d"],
      [/ط/g, "t"],
      [/ظ/g, "z"],
      [/ع/g, ""],
      [/غ/g, "gh"],
      [/ف/g, "f"],
      [/ق/g, "q"],
      [/ك/g, "k"],
      [/ل/g, "l"],
      [/م/g, "m"],
      [/ن/g, "n"],
      [/ه/g, "h"],
      [/و/g, "w"],
      [/ي|ى/g, "y"],
      [/ة/g, "a"],
    ];
    let latin = name;
    for (const [pattern, rep] of subst) latin = latin.replace(pattern, rep);
    latin = latin.replace(/\s+/g, " ").trim();
    if (latin && latin !== name) variants.push(latin);
    // Also generate without al- prefix
    if (latin.startsWith("al-")) variants.push(latin.slice(3));
    return variants;
  }

  function cyrillicToLatinVariants(name: string): string[] {
    const map: Record<string, string> = {
      "А":"a","Б":"b","В":"v","Г":"g","Д":"d","Е":"e","Ё":"yo","Ж":"zh","З":"z","И":"i","Й":"y",
      "К":"k","Л":"l","М":"m","Н":"n","О":"o","П":"p","Р":"r","С":"s","Т":"t","У":"u","Ф":"f",
      "Х":"kh","Ц":"ts","Ч":"ch","Ш":"sh","Щ":"sch","Ъ":"","Ы":"y","Ь":"","Э":"e","Ю":"yu","Я":"ya",
      "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","й":"y",
      "к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f",
      "х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya",
    };
    let latin = name.split("").map(c => map[c] ?? c).join("");
    latin = latin.replace(/\s+/g, " ").trim();
    if (latin && latin !== name) return [latin];
    return [];
  }

  try {
    // Build a variant set (transliterated, phonetic, corp-suffix-stripped)
    // so foreign-script and alias mentions still match.
    const rawVariants: string[] = [q];
    try {
      const v = variantsOf(q);
      for (const x of v) if (x && x !== q) rawVariants.push(x);
    } catch (err) {
      console.warn("[hawkeye] news-search/variantsOf failed — using base query only:", err);
    }
    // Turkish diacritic expansion: terminal 'c'→'ç' and 'öz' prefix are the two
    // most reliable heuristics for Turkish Latin names. Google News Turkish locale
    // normalises queries anyway, but explicit variants improve post-fetch fuzzy scoring.
    const turkishVariant = q
      .toLowerCase()
      .replace(/\boz/g, "öz")
      .replace(/c\b/g, "ç")
      .replace(/\bgul/g, "gül")
      .replace(/\bgun/g, "gün");
    if (turkishVariant !== q.toLowerCase()) rawVariants.push(turkishVariant);
    // Arabic script variants
    if (/[\u0600-\u06FF]/.test(q)) {
      for (const v of arabicToLatinVariants(q)) if (v && !rawVariants.includes(v)) rawVariants.push(v);
    }
    // Cyrillic variants
    if (/[\u0400-\u04FF]/.test(q)) {
      for (const v of cyrillicToLatinVariants(q)) if (v && !rawVariants.includes(v)) rawVariants.push(v);
    }
    const variants = Array.from(new Set(rawVariants)).slice(0, 15);

    // For names written in non-Latin scripts (Arabic, CJK, Cyrillic, etc.),
    // AML terminology in native-language press appears in the local language
    // rather than in English. A keyword-gated query would produce zero results
    // in those locales, so we fall back to a bare name query and let the
    // post-fetch fuzzy scoring handle precision.
    // Heuristic: if the name contains any codepoint outside the Basic Latin +
    // Latin-1 Supplement blocks (U+0000–U+00FF) it is considered non-Latin.
    const hasNonLatin = /[^ -ÿ]/.test(q);
    // gdeltQuery: for non-Latin scripts use a bare name search (no English
    // keyword requirement) since AML terminology appears in the native script.
    // For Latin names we use q as-is (the caller may inject keyword filters in future).
    const gdeltQuery = hasNonLatin ? q : q;

    // Fan out to all locales + all configured news API adapters in parallel.
    // allSettled + per-feed AbortSignal + overall timebox ensures the function
    // always returns within ~4s (the 5s screening SLA), far inside maxDuration=30.
    // Shared retrieval-health accumulator — every instrumented feed fetch
    // records whether it reached its upstream so we can tell a genuine
    // negative finding apart from a wholesale outage.
    const feedStats: RetrievalStats = { attempted: 0, reachable: 0 };
    // Google News RSS locale fan-out — skipped when GOOGLE_NEWS_RSS_ENABLED is
    // "false"; the other reachable providers below still run regardless.
    // Google News locale fan-out with early-exit. Each locale settles
    // independently; we resolve as soon as either (a) every locale settles,
    // (b) FANOUT_EARLY_EXIT_COUNT articles have accumulated, or (c) the overall
    // timebox fires — whichever comes first. The early-exit path trims p50
    // latency for well-covered subjects without sacrificing the genuine
    // "searched the world, found nothing" negative finding.
    const fanOut: Promise<PromiseSettledResult<Article[]>[]> = rssEnabled
      ? (() => {
          const results: PromiseSettledResult<Article[]>[] = new Array(LOCALES.length);
          let settledCount = 0;
          let articleTally = 0;
          return new Promise<PromiseSettledResult<Article[]>[]>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              // Fill any not-yet-settled slots with empty results so the shape
              // is always LOCALES.length entries.
              for (let i = 0; i < LOCALES.length; i++) {
                if (!results[i]) results[i] = { status: "fulfilled", value: [] };
              }
              resolve(results);
            };
            setTimeout(finish, OVERALL_TIMEBOX_MS);
            LOCALES.forEach((loc, i) => {
              fetchLocaleFeed(gdeltQuery, loc, variants, feedStats)
                .then((value) => {
                  results[i] = { status: "fulfilled", value };
                  articleTally += value.length;
                })
                .catch((reason) => {
                  results[i] = { status: "rejected", reason };
                })
                .finally(() => {
                  settledCount += 1;
                  if (settledCount === LOCALES.length || articleTally >= FANOUT_EARLY_EXIT_COUNT) {
                    finish();
                  }
                });
            });
          });
        })()
      : Promise.resolve(
          LOCALES.map(() => ({ status: "fulfilled", value: [] as Article[] })) as PromiseSettledResult<Article[]>[],
        );
    // Run news API adapters (NewsAPI, GNews, Mediastack, OCCRP, etc.) in parallel
    // with the Google News RSS fan-out. Falls back to empty if no keys configured.
    const adapterSearch = searchAllNewsWithStatus(q, { limit: 30 }).catch(() => ({
      articles: [],
      sourcesSucceeded: [] as string[],
      sourcesFailed: [] as Array<{ name: string; error: string }>,
    }));
    // All specialised feed banks run in parallel. Each is internally bounded by
    // its own per-feed AbortSignal; withDeadline below adds a hard ceiling so no
    // single hung upstream can push the awaited Promise.all past the timebox.
    const investigativeSearch = fetchInvestigativeFeeds(q, variants, feedStats);
    const asianSearch        = fetchAsianFeeds(q, variants, feedStats);
    const africaSearch       = fetchAfricaFeeds(q, variants, feedStats);
    const latamSearch        = fetchLatamFeeds(q, variants, feedStats);
    const oceaniaSearch      = fetchOceaniaFeeds(q, variants, feedStats);
    // GDELT — keyless global second source. Runs in the same timebox so it adds
    // no latency; provides live coverage even when Google News throttles us.
    const gdeltSearch        = fetchGdeltArticles(q, feedStats);
    const EMPTY_ADAPTER = { articles: [] as NewsArticle[], sourcesSucceeded: [] as string[], sourcesFailed: [] as Array<{ name: string; error: string }> };
    const [settled, adapterResult, investigativeArticles, asianArticles, africaArticles, latamArticles, oceaniaArticles, gdeltArticles] = await Promise.all([
      withDeadline(fanOut, OVERALL_TIMEBOX_MS, LOCALES.map(() => ({ status: "fulfilled", value: [] as Article[] })) as PromiseSettledResult<Article[]>[]),
      withDeadline(adapterSearch, OVERALL_TIMEBOX_MS, EMPTY_ADAPTER),
      withDeadline(investigativeSearch, OVERALL_TIMEBOX_MS, [] as Article[]),
      withDeadline(asianSearch, OVERALL_TIMEBOX_MS, [] as Article[]),
      withDeadline(africaSearch, OVERALL_TIMEBOX_MS, [] as Article[]),
      withDeadline(latamSearch, OVERALL_TIMEBOX_MS, [] as Article[]),
      withDeadline(oceaniaSearch, OVERALL_TIMEBOX_MS, [] as Article[]),
      withDeadline(gdeltSearch, OVERALL_TIMEBOX_MS, [] as NewsArticle[]),
    ]);
    const perLocale: Article[][] = settled.map((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
    const merged = new Map<string, Article>();
    for (const bucket of perLocale) {
      for (const a of bucket) {
        const key = a.link || a.title;
        if (!merged.has(key)) merged.set(key, a);
      }
    }
    // Merge all specialised feed banks — investigative first (highest credibility).
    for (const ia of investigativeArticles) {
      const key = ia.link || ia.title;
      if (!merged.has(key)) merged.set(key, ia);
    }
    for (const aa of asianArticles) {
      const key = aa.link || aa.title;
      if (!merged.has(key)) merged.set(key, aa);
    }
    for (const fa of africaArticles) {
      const key = fa.link || fa.title;
      if (!merged.has(key)) merged.set(key, fa);
    }
    for (const la of latamArticles) {
      const key = la.link || la.title;
      if (!merged.has(key)) merged.set(key, la);
    }
    for (const oa of oceaniaArticles) {
      const key = oa.link || oa.title;
      if (!merged.has(key)) merged.set(key, oa);
    }
    // Convert NewsArticle (adapter + GDELT shape) → Article (internal shape)
    // and merge. GDELT results ride the same enrichment path as the keyed
    // adapters, so they get identical fuzzy scoring, severity and tiering.
    for (const na of [...adapterResult.articles, ...gdeltArticles]) {
      const key = na.url || na.title;
      if (merged.has(key)) continue;
      const fullText = `${na.title} ${na.snippet ?? ""}`;
      const kwHits = classifyAdverseKeywords(fullText);
      const esgHits = classifyEsg(fullText);
      const fullTextLower = fullText.toLowerCase();
      let fuzzyScore = 0;
      let fuzzyMethod = "token_presence";
      for (const v of variants) {
        const m = matchEnsemble(v, na.title);
        if (m?.best && m.best.score > fuzzyScore) {
          fuzzyScore = m.best.score;
          fuzzyMethod = m.best.method;
        }
        if (fuzzyScore < 0.72) {
          const fullTextNorm2 = normalizeDiacritics(fullTextLower);
          const vTokens = normalizeDiacritics(v.toLowerCase()).split(/\s+/).filter((t) => t.length >= 3);
          if (vTokens.length > 0) {
            const hits = vTokens.filter((t) => fullTextNorm2.includes(t)).length;
            const ts = (hits / vTokens.length) * 0.72;
            if (ts > fuzzyScore) { fuzzyScore = ts; fuzzyMethod = "token_presence"; }
          }
        }
      }
      // Boost score for high-signal adverse media terms in title (adapter path)
      const adverseTermBoostsAdapter: Record<string, number> = {
        // Highest signal (criminal verdicts)
        "convicted": 20, "sentenced": 20, "imprisoned": 18, "jailed": 18,
        "extradited": 18, "guilty verdict": 18,
        // Criminal process
        "arrested": 15, "charged": 15, "indicted": 15, "sanctioned": 15,
        "designated": 12, "warrant": 12, "fugitive": 12,
        // Financial crime specific
        "laundering": 18, "money laundering": 20, "bribery": 15, "embezzlement": 15,
        "fraud": 12, "corruption": 12, "ponzi": 18, "pyramid scheme": 18,
        "insider trading": 15, "market manipulation": 15,
        // Terrorism / proliferation
        "terrorist": 18, "terror financing": 20, "proliferation": 15,
        // Enforcement
        "debarred": 12, "blacklisted": 15, "banned": 10,
        "regulatory fine": 12, "enforcement action": 12,
        "cease and desist": 10, "asset freeze": 15,
        // Sanctions
        "ofac": 18, "sdn list": 18, "un sanctions": 15,
        // Investigative
        "leaked documents": 12, "pandora papers": 18, "panama papers": 18,
        "fincen files": 18, "occrp": 12, "icij": 12,
      };
      const adapterTitleLower = na.title.toLowerCase();
      let adapterBoost = 0;
      for (const [term, pts] of Object.entries(adverseTermBoostsAdapter)) {
        if (adapterTitleLower.includes(term)) adapterBoost += pts;
      }
      const adapterBaseScore = Math.round(fuzzyScore * 100);
      const adapterAdjustedScore = Math.min(100, adapterBaseScore + adapterBoost);
      const adapterTier = classifySource(na.url ?? "");
      const adapterSourceCat = classifySourceCategory(na.url ?? "");
      const adapterTierBoost = adapterTier === "tier1" ? 20 : adapterTier === "tier2" ? 10 : 0;
      // Established sources get 2× authority weighting; state-media get 0.5×
      const adapterAuthorityMult = adapterSourceCat === "state_media" ? 0.5
        : (adapterTier === "tier1" || adapterTier === "tier2") ? 2.0 : 1.0;
      const adapterTieredScore = Math.min(100, Math.round((adapterAdjustedScore + adapterTierBoost) * adapterAuthorityMult));

      // Paywall detection (adapter path)
      const adapterSnippet = na.snippet ?? "";
      const adapterPaywalled = detectPaywall(adapterSnippet);

      // Recency weight (adapter path)
      const adapterRecencyW = computeRecencyWeight(na.publishedAt ?? "", adapterSourceCat);
      const adapterWeightFactor = adapterRecencyW * (adapterPaywalled ? 0.5 : 1.0);
      const adapterFinalScore = Math.round(adapterTieredScore * adapterWeightFactor);

      const adapterRawSeverity = classifyArticleSeverity(kwHits);
      const adapterSeverity = applyStateMediCap(adapterRawSeverity, adapterSourceCat);

      merged.set(key, {
        title: na.title,
        link: na.url,
        pubDate: na.publishedAt,
        source: `${na.source}/${na.outlet}`,
        snippet: adapterSnippet,
        keywordGroups: kwHits.map((k) => k.group),
        esgCategories: Array.from(new Set(esgHits.map((e) => e.categoryId))),
        severity: adapterSeverity,
        fuzzyScore: adapterBaseScore,
        fuzzyMethod,
        lang: na.language ?? "en",
        relevanceScore: adapterFinalScore,
        sourceTier: adapterTier,
        sourceCategory: adapterSourceCat,
        sourceAuthority: classifySourceAuthority(na.url ?? ""),
        paywallLimited: adapterPaywalled || undefined,
        recencyWeight: adapterRecencyW !== 1.0 ? adapterRecencyW : undefined,
      });
    }
    const filtered = Array.from(merged.values())
      // Fuzzy gate: require either a strong name match (≥70) OR a weak name
      // match (≥55) combined with at least one adverse keyword group.
      // Threshold lowered to 70: token_presence caps at 0.72 (→ score 72) so
      // a full two-token name match was blocked at the old 75 threshold.
      .filter((a) => a.fuzzyScore >= 70 || (a.fuzzyScore >= 55 && a.keywordGroups.length > 0))
      .sort((a, b) => {
        // Investigative / regulatory sources sort first among equal-relevance articles.
        const aIsHighValue = a.sourceCategory === "investigative" || a.sourceCategory === "regulatory";
        const bIsHighValue = b.sourceCategory === "investigative" || b.sourceCategory === "regulatory";
        if (aIsHighValue !== bIsHighValue) return aIsHighValue ? -1 : 1;
        return (b.relevanceScore ?? b.fuzzyScore) - (a.relevanceScore ?? a.fuzzyScore);
      });
    // Phase 1: URL-based exact dedup — strips protocol and query-string so
    // the same Reuters article appearing at both https://reuters.com/… and
    // http://reuters.com/…?utm_source=… collapses to one entry.
    const seenUrls = new Set<string>();
    const urlDeduped = filtered.filter((a) => {
      if (!a.link) return true;
      const key = a.link.replace(/^https?:\/\//, "").replace(/\?.*$/, "");
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });
    // Phase 2: Jaccard title dedup — collapses translated / rephrased
    // versions of the same story across locales (existing clusterArticles).
    const parsed = clusterArticles(urlDeduped).slice(0, 20);
    const topSeverity: Article["severity"] =
      parsed.reduce(
        (acc, a) => (severityOrder(a.severity) > severityOrder(acc) ? a.severity : acc),
        "clear" as Article["severity"],
      );
    const allKw = parsed.flatMap((a) =>
      a.keywordGroups.map((g) => ({ group: g as AdverseKeywordGroup, groupLabel: g, term: "", offset: 0 })),
    );
    const groupCounts = adverseKeywordGroupCounts(allKw);
    const esgDomains = Array.from(new Set(parsed.flatMap((a) => a.esgCategories)));
    const langCoverage = Array.from(new Set(parsed.map((a) => a.lang))).sort();
    // Retrieval health. Fold the news-API adapter outcomes into the RSS feed
    // tally so a successful adapter still counts as a reachable source even if
    // every RSS feed was blocked. "unavailable" = nothing was reachable at all
    // (e.g. blocked egress / wholesale 403) → the caller must NOT treat zero
    // articles as a confirmed negative finding. "degraded" = a severe partial
    // outage (<20% of attempted feeds reachable).
    const feedsReachable = feedStats.reachable + adapterResult.sourcesSucceeded.length;
    const feedsAttempted =
      feedStats.attempted + adapterResult.sourcesSucceeded.length + adapterResult.sourcesFailed.length;
    const retrieval: NewsResponse["retrieval"] =
      feedsReachable === 0
        ? "unavailable"
        : feedsAttempted > 0 && feedsReachable / feedsAttempted < 0.2
          ? "degraded"
          : "live";
    const payload: NewsResponse = {
      ok: true,
      subject: q,
      articleCount: parsed.length,
      topSeverity,
      keywordGroupCounts: groupCounts.map((g) => ({
        group: g.group,
        label: g.label,
        count: g.count,
      })),
      esgDomains,
      articles: parsed,
      source: adapterResult.sourcesSucceeded.length > 0 ? "newsapi" : "google-news-rss",
      languages: langCoverage,
      fetchMode: "live",
      fetchedAt,
      latencyMs: Date.now() - t0,
      sourceDiversityScore: 0,
      crossCorroboratedCount: 0,
      propagandaSourceCount: 0,
      retrieval,
      feedsAttempted,
      feedsReachable,
      degraded: retrieval !== "live",
      googleNewsRssEnabled: rssEnabled,
      proxyConfigured: newsProxyInfo().configured,
      relayEnabled: newsRelayInfo().enabled,
    };
    // FATF R.10 graceful degradation. When live retrieval reached nothing at all
    // (every feed blocked / 403), fall back to the most recent cached dossier —
    // first the stale L2 Blobs cache, then the background GDELT prefetch store —
    // so the panel degrades to "cached, not live" instead of a bare outage. A
    // genuine outage with NOTHING cached still surfaces as "unavailable": we
    // NEVER present cached articles as a fresh, confirmed-clean result.
    let servedFromOutageCache = false;
    if (retrieval === "unavailable" && payload.articleCount === 0) {
      const stale = await readNewsBlobCacheStale(cacheKey);
      if (stale && stale.articleCount > 0) {
        Object.assign(payload, stale, {
          fetchMode: "cached" as const,
          retrieval: "degraded" as const,
          degraded: true,
          cachedAt: stale.fetchedAt,
          retrievalNote:
            "Live retrieval unavailable — showing the most recent cached dossier. Re-run when feeds are reachable before clearing. (FATF R.10)",
          latencyMs: Date.now() - t0,
          proxyConfigured: newsProxyInfo().configured,
        });
        servedFromOutageCache = true;
      } else {
        const prefetch = await readGdeltPrefetchArticles(q);
        if (prefetch) {
          const top = prefetch.articles.reduce(
            (acc, a) => (severityOrder(a.severity) > severityOrder(acc) ? a.severity : acc),
            "clear" as Article["severity"],
          );
          const kw = prefetch.articles.flatMap((a) =>
            a.keywordGroups.map((g) => ({ group: g as AdverseKeywordGroup, groupLabel: g, term: "", offset: 0 })),
          );
          Object.assign(payload, {
            articles: prefetch.articles,
            articleCount: prefetch.articles.length,
            topSeverity: top,
            keywordGroupCounts: adverseKeywordGroupCounts(kw).map((g) => ({
              group: g.group,
              label: g.label,
              count: g.count,
            })),
            esgDomains: Array.from(new Set(prefetch.articles.flatMap((a) => a.esgCategories))),
            languages: Array.from(new Set(prefetch.articles.map((a) => a.lang))).sort(),
            source: "newsapi" as const,
            fetchMode: "cached" as const,
            retrieval: "degraded" as const,
            degraded: true,
            cachedAt: prefetch.cachedAt,
            retrievalNote:
              "Live retrieval unavailable — showing background-cached GDELT results. Re-run when feeds are reachable before clearing. (FATF R.10)",
          });
          servedFromOutageCache = true;
        }
      }
    }
    // Observability: retrieval health + reachability ratio so a wholesale news
    // outage (retrieval:"unavailable") pages an operator instead of silently
    // surfacing zero articles as a clean negative finding.
    incrementCounter("hawkeye_news_requests_total", 1, { result: retrieval });
    setGauge(
      "hawkeye_news_feeds_reachable_ratio",
      feedsAttempted > 0 ? feedsReachable / feedsAttempted : 0,
    );
    setGauge("hawkeye_news_retrieval_unavailable", retrieval === "unavailable" ? 1 : 0);
    // Cache successful results for 2 minutes (L1 in-memory + L2 cross-instance Blobs).
    // Never re-cache an outage-fallback payload — that would pin a stale/cached
    // dossier into the "fresh" cache and short-circuit a retry that might now reach
    // live feeds.
    if (payload.articleCount > 0 && !servedFromOutageCache) {
      NEWS_CACHE.set(cacheKey, { data: payload, expires: Date.now() + NEWS_CACHE_TTL_MS });
      // Evict oldest entries if cache grows too large
      if (NEWS_CACHE.size > 500) {
        const oldest = Array.from(NEWS_CACHE.entries()).sort((a, b) => a[1].expires - b[1].expires)[0];
        if (oldest) NEWS_CACHE.delete(oldest[0]);
      }
      // Fire-and-forget L2 write — never blocks the response, never throws.
      void writeNewsBlobCache(cacheKey, payload);
    }
    const responseTimeMs = Date.now() - t0;
    return NextResponse.json(payload, {
      headers: {
        ...gateHeaders,
        "X-Response-Time": `${responseTimeMs}ms`,
        "X-Locales-Searched": String(LOCALES.length),
      },
    });
  } catch (err) {
    // Last-resort safety net. The fan-out already uses allSettled +
    // per-feed timeouts so this branch should be unreachable, but if
    // variantsOf() or keyword classification ever throws we still return
    // a clean empty dossier rather than a 5xx that paints the panel red.
    console.error(
      "[hawkeye] news-search: top-level catch fired (was supposed to be unreachable). " +
      "Returning empty dossier; investigate variantsOf / keyword classification.",
      err,
    );
    return NextResponse.json({ ...emptyResponse(q, "static_fallback", Date.now() - t0), fetchedAt, degraded: true }, { headers: gateHeaders });
  }
}

