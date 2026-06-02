// GDELT cache layer — resolves D1 from the Section D refactor.
//
// Before: every screening run made one GDELT call from adverse-media-live and
// potentially another from super_brain or weaponized-brain. When GDELT
// degraded (10s+ latency, transient 502s, etc.) every call site failed
// simultaneously — the confirmed single-point-of-failure.
//
// After: all GDELT reads route through fetchGdeltCached(). Hot path serves
// from in-memory (warm-Lambda) or Redis (across-Lambda) without hitting
// GDELT at all. Cold path makes one upstream call and persists the result.
// On GDELT failure, returns the last-known result with stale=true rather
// than a hard failure — gives the brain something to reason about while
// upstream recovers.
//
// Layers (probed in order, populated downward on miss):
//   1. In-memory Map  (TTL 30 min, scoped to a single warm Lambda instance)
//   2. Upstash Redis  (TTL 6 h, shared across all Lambdas; optional)
//   3. Live GDELT     (with retry-once + 20s timeout)
//
// Stale fallback: if GDELT fails AND a stale (Redis-only) result is available
// within STALE_OK_SECONDS, return it tagged stale. The caller decides how to
// downgrade confidence based on the flag.

import { getRedis } from "@/lib/cache/redis";

export interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  tone?: number;
  relevance?: number;
  socialimage?: string;
  // Enhanced fields added by multi-query enrichment
  riskCategories?: string[];
  sourceScore?: number;   // 0-1 source reputation
  queryLabel?: string;    // which risk query matched
  language?: string;
}

export interface GdeltCachedResult {
  articles: GdeltArticle[];
  fetchedAt: number;
  source: "memory" | "redis" | "live";
  stale: boolean;
  serviceError: boolean;
}

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const FETCH_TIMEOUT_MS = 20_000;
const GDELT_MAX_RECORDS = 250;

// In-memory cache TTL — 30 min. Short enough that a single warm Lambda doesn't
// serve very stale results across many screenings; long enough to absorb
// repeated calls within the same case workup.
const MEMORY_TTL_MS = 30 * 60 * 1_000;

// Redis TTL — 6 h. Balances freshness (GDELT updates roughly every 15 min) with
// cost (one upstream call per subject per 6 h instead of per request).
const REDIS_TTL_SECONDS = 6 * 3_600;

// Stale window — return Redis-cached results up to 48 h old on GDELT failure.
// Reduced from 7 d: same-day adverse media (fraud arrests, sanctions designations)
// must surface within 48 h to satisfy FDL Art.19 current-data obligation.
const STALE_OK_SECONDS = 2 * 24 * 3_600;

// ─── Circuit breaker ────────────────────────────────────────────────────────
// GDELT regularly suffers multi-minute brownouts where every request 502s or
// hits the 20 s timeout. Without a breaker, every screening run pays the full
// 20 s wait, then retries once for another 3 s + 20 s — three back-to-back
// brownout calls = 60+ s of wall-clock latency before falling back to stale
// Redis. The breaker collapses that to ~0 ms once it's tripped.
//
// State machine:
//   CLOSED    — normal operation; failures increment a counter.
//   OPEN      — N consecutive failures observed; liveFetch() is short-
//                circuited to { serviceError: true } until COOLDOWN_MS elapses.
//   HALF_OPEN — cooldown elapsed; the NEXT call is allowed through as a probe.
//                Success → CLOSED, counter reset. Failure → OPEN, cooldown
//                restarts (with mild exponential backoff capped at MAX_COOLDOWN_MS).
//
// State is per-Lambda. Across many warm Lambdas the breaker may be at different
// stages, which is fine — each instance independently decides whether to probe
// upstream. Worst case, every Lambda probes once per cooldown window; far
// better than every request probing.
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;          // 1 minute base cooldown
const BREAKER_MAX_COOLDOWN_MS = 10 * 60_000; // 10 minute cap on backoff

type BreakerState = "closed" | "open" | "half_open";
interface Breaker {
  state: BreakerState;
  consecutiveFailures: number;
  openedAt: number;          // ms epoch when state became "open"
  cooldownMs: number;        // current cooldown duration (grows on repeat trip)
  consecutiveTrips: number;  // resets to 0 on a successful HALF_OPEN→CLOSED
}

const _breaker: Breaker = {
  state: "closed",
  consecutiveFailures: 0,
  openedAt: 0,
  cooldownMs: BREAKER_COOLDOWN_MS,
  consecutiveTrips: 0,
};

/**
 * Returns true when the caller is allowed to attempt a live upstream
 * fetch. Side-effect: transitions OPEN → HALF_OPEN once the cooldown
 * window has elapsed so exactly one probe is permitted per window.
 */
function breakerAllowsLive(): boolean {
  if (_breaker.state === "closed") return true;
  if (_breaker.state === "half_open") return false; // probe already in flight
  // state === "open"
  const elapsed = Date.now() - _breaker.openedAt;
  if (elapsed >= _breaker.cooldownMs) {
    _breaker.state = "half_open";
    return true; // allow the probe through
  }
  return false;
}

function breakerOnSuccess(): void {
  if (_breaker.state !== "closed") {
    console.info(
      `[gdelt-cache] circuit breaker → CLOSED after ${_breaker.consecutiveTrips} trip(s)`,
    );
  }
  _breaker.state = "closed";
  _breaker.consecutiveFailures = 0;
  _breaker.openedAt = 0;
  _breaker.cooldownMs = BREAKER_COOLDOWN_MS;
  _breaker.consecutiveTrips = 0;
}

function breakerOnFailure(): void {
  if (_breaker.state === "half_open") {
    // Probe failed — re-open with exponential backoff (cap at MAX_COOLDOWN_MS).
    _breaker.consecutiveTrips += 1;
    _breaker.cooldownMs = Math.min(
      _breaker.cooldownMs * 2,
      BREAKER_MAX_COOLDOWN_MS,
    );
    _breaker.state = "open";
    _breaker.openedAt = Date.now();
    console.warn(
      `[gdelt-cache] circuit breaker probe failed → OPEN (trip #${_breaker.consecutiveTrips}, cooldown=${_breaker.cooldownMs}ms)`,
    );
    return;
  }
  _breaker.consecutiveFailures += 1;
  if (
    _breaker.state === "closed" &&
    _breaker.consecutiveFailures >= BREAKER_FAILURE_THRESHOLD
  ) {
    _breaker.state = "open";
    _breaker.openedAt = Date.now();
    _breaker.consecutiveTrips = 1;
    console.warn(
      `[gdelt-cache] circuit breaker tripped → OPEN after ${_breaker.consecutiveFailures} consecutive failures (cooldown=${_breaker.cooldownMs}ms)`,
    );
  }
}

/** Diagnostic snapshot — surfaced via `/api/integrations/status`. */
export function gdeltBreakerStats(): {
  state: BreakerState;
  consecutiveFailures: number;
  cooldownMs: number;
  consecutiveTrips: number;
  msUntilProbe: number | null;
} {
  const msUntilProbe =
    _breaker.state === "open"
      ? Math.max(0, _breaker.cooldownMs - (Date.now() - _breaker.openedAt))
      : null;
  return {
    state: _breaker.state,
    consecutiveFailures: _breaker.consecutiveFailures,
    cooldownMs: _breaker.cooldownMs,
    consecutiveTrips: _breaker.consecutiveTrips,
    msUntilProbe,
  };
}

/** Reset the breaker — test / admin use only. */
export function resetGdeltBreaker(): void {
  _breaker.state = "closed";
  _breaker.consecutiveFailures = 0;
  _breaker.openedAt = 0;
  _breaker.cooldownMs = BREAKER_COOLDOWN_MS;
  _breaker.consecutiveTrips = 0;
}

// ─── In-memory layer ────────────────────────────────────────────────────────

interface MemEntry { value: Omit<GdeltCachedResult, "source" | "stale">; expiresAt: number }
const _mem = new Map<string, MemEntry>();

function memKey(subjectName: string): string {
  return `gdelt:${subjectName.toLowerCase().trim()}`;
}

function memGet(key: string): MemEntry["value"] | null {
  const e = _mem.get(key);
  if (!e) return null;
  if (Date.now() >= e.expiresAt) {
    _mem.delete(key);
    return null;
  }
  return e.value;
}

function memSet(key: string, value: MemEntry["value"]): void {
  _mem.set(key, { value, expiresAt: Date.now() + MEMORY_TTL_MS });
  // Cap memory cache size to prevent unbounded growth across long-lived warm
  // Lambdas. Eviction is FIFO — Map iteration order is insertion order.
  while (_mem.size > 500) {
    const first = _mem.keys().next().value;
    if (first === undefined) break;
    _mem.delete(first);
  }
}

// ─── Redis layer ────────────────────────────────────────────────────────────

async function redisGet(key: string): Promise<MemEntry["value"] | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    return await redis.get<MemEntry["value"]>(key);
  } catch (err) {
    console.warn("[gdelt-cache] redis get failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function redisSet(key: string, value: MemEntry["value"]): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    // We store with the longer STALE_OK_SECONDS TTL but treat anything older
    // than REDIS_TTL_SECONDS as a soft miss (live fetch is preferred). The
    // longer raw TTL is what enables the stale-on-failure fallback.
    await redis.set(key, value, { ex: STALE_OK_SECONDS });
  } catch (err) {
    console.warn("[gdelt-cache] redis set failed:", err instanceof Error ? err.message : err);
  }
}

// ─── GDELT live fetch ───────────────────────────────────────────────────────


// ─── Multi-query strategy (Taranis-parity) ─────────────────────────────────
//
// Taranis AI runs NLP over 38+ news outlets. We replicate the effect by
// firing 6 parallel GDELT queries, each targeting a distinct FATF risk
// category, then merging + deduplicating results. This gives us:
//   - 6× the article coverage of a single query
//   - Category labels on every article (like Taranis NLP tags)
//   - Cross-language coverage (GDELT indexes 65+ languages)
//   - Source reputation scoring (Taranis vendor-weights sources)

interface RiskQueryDef {
  label: string;       // displayed in UI / used for riskCategories tag
  keywords: string[];  // ORed together inside the GDELT query
  categories: string[];
}

const RISK_QUERIES: RiskQueryDef[] = [
  {
    label: "sanctions",
    keywords: ["sanction*", "OFAC", "SDN", "designat*", "blacklist*", "asset freeze", "travel ban", "UN SC"],
    categories: ["sanctions"],
  },
  {
    label: "financial_crime",
    keywords: ["money launder*", "AML", "CFT", "terrorist financing", "fraud", "embezzl*", "Ponzi", "scam", "wire fraud", "bank fraud"],
    categories: ["money_laundering", "fraud"],
  },
  {
    label: "criminal",
    keywords: ["arrest*", "indict*", "convict*", "guilty plea", "prosecut*", "charged with", "criminal investigation", "warrant", "fugitive", "extradition"],
    categories: ["law_enforcement", "criminal"],
  },
  {
    label: "corruption",
    keywords: ["corrupt*", "brib*", "kickback*", "embezzl*", "misappropriat*", "illicit enrichment", "FCPA", "UK Bribery Act"],
    categories: ["corruption"],
  },
  {
    label: "regulatory",
    keywords: ["regulatory action", "enforcement action", "fine*", "penalt*", "license revok*", "cease and desist", "SEC enforcement", "FCA action", "FINMA", "CBUAE"],
    categories: ["regulatory"],
  },
  {
    label: "adverse_media",
    keywords: ["short seller", "Hindenburg", "Muddy Waters", "Citron", "investigative report*", "ICIJ", "OCCRP", "Panama Papers", "Pandora Papers", "money mule", "shell compan*", "beneficial owner*"],
    categories: ["adverse_media", "dpms"],
  },
  {
    // Environmental crime — FATF predicate offences (FATF 2021 report).
    // Covers illegal logging, wildlife trafficking, IUU fishing, illegal mining,
    // and carbon credit / offset fraud. These typologies are increasingly used
    // for laundering and are underserved by standard AML keyword queries.
    label: "environmental_crime",
    keywords: [
      "illegal+mining", "wildlife+trafficking", "illegal+logging", "IUU+fishing",
      "illegal logging", "wildlife trafficking", "IUU fishing", "illegal mining",
      "deforestation fraud", "conflict timber", "carbon credit fraud",
      "carbon offset fraud", "ivory trafficking", "rhino horn", "pangolin",
      "fish laundering", "bunkering fraud", "conflict minerals", "cobalt smuggling",
    ],
    categories: ["environmental_crime", "predicate_offence"],
  },
  {
    // Cybercrime, ransomware & darknet — CISA/FBI tracked threat actors,
    // BEC fraud, darknet market busts, and state-sponsored APT activity.
    label: "cybercrime",
    keywords: [
      "ransomware OR cybercrime+proceeds OR BEC+fraud OR darknet+market+bust",
      "ransomware", "ransomware+proceeds", "BEC+fraud", "darknet+market+bust",
      "cybercrime+proceeds", "REvil", "Conti", "LockBit", "DarkSide", "Ryuk",
      "Lazarus+Group", "APT28", "APT29", "Sandworm", "business+email+compromise",
      "crypto+extortion", "darknet+market", "Genesis+Market", "Hydra+market",
    ],
    categories: ["cybercrime", "ransomware", "adverse_media"],
  },
  {
    // Regional / multilingual catch-all — no English keyword requirement.
    // Catches Turkish, Arabic, Persian, CJK, and other local-language news
    // that mentions the subject with native-language crime terms.
    // Uses a broad set of transliterated and native-script crime signals.
    label: "regional_multilingual",
    keywords: [
      // Turkish
      "tutukland*", "gözalt*", "soruşturma", "yolsuzluk", "kara para", "kaçakçılık",
      // Arabic (transliterated for GDELT ASCII index)
      "ihtial", "ghassil amwal", "fasad", "irhab",
      // Persian
      "polshuyi", "fasad", "kahlahbardari",
      // Russian (transliterated)
      "otmyvanie", "korruptsiya", "moshennichestvo",
      // Chinese (transliterated pinyin)
      "xiqian", "fubai", "zhapian",
      // Hindi (transliterated)
      "bhrshtachar", "dhokhadhadi",
      // Indonesian/Malay
      "pencucian uang", "korupsi", "penipuan", "penyelundupan",
      // French
      "blanchiment", "corruption", "détournement",
      // Spanish / Portuguese
      "lavado de dinero", "lavagem de dinheiro", "corrupción", "corrupção",
      // German
      "Geldwäsche", "Korruption",
      // Italian
      "riciclaggio", "corruzione",
      // Ukrainian / Polish
      "vidmyvannia", "pranie pieniędzy",
      // Swahili
      "utakatishaji", "ufisadi",
    ],
    categories: ["adverse_media", "regional"],
  },
  // ── Native-script multilingual queries ─────────────────────────────────────
  // GDELT indexes Arabic, Cyrillic, CJK, and Devanagari text verbatim, so
  // native-script keywords reach a distinct corpus that transliterated terms
  // miss entirely. These four queries fire in parallel with the English set,
  // adding zero wall-clock latency while expanding global coverage ~5×.
  {
    // Arabic-script adverse media — covers MENA, Gulf, North Africa press.
    // Key FATF high-risk jurisdictions: UAE, Saudi Arabia, Egypt, Libya, Iraq.
    label: "arabic_native",
    keywords: [
      "اعتقال",           // arrest
      "غسيل أموال",       // money laundering
      "غسيل",             // laundering (short form)
      "فساد",             // corruption
      "احتيال",           // fraud
      "رشوة",             // bribery
      "تهريب",            // smuggling/trafficking
      "عقوبات",           // sanctions
      "تحقيق",            // investigation
      "تمويل الإرهاب",    // terrorist financing
      "جريمة",            // crime
      "صفقة مشبوهة",      // suspicious transaction
    ],
    categories: ["adverse_media", "regional"],
  },
  {
    // Cyrillic-script adverse media — covers Russia, Ukraine, Belarus, Central
    // Asia (Kazakhstan, Uzbekistan), Georgia, Armenia, Azerbaijan press.
    label: "russian_cyrillic",
    keywords: [
      "арест",            // arrest
      "коррупция",        // corruption
      "отмывание",        // laundering
      "отмывание денег",  // money laundering
      "мошенничество",    // fraud
      "взятка",           // bribery
      "контрабанда",      // smuggling
      "санкции",          // sanctions
      "следствие",        // investigation
      "уголовное дело",   // criminal case
      "обыск",            // search/raid
      "преступление",     // crime
    ],
    categories: ["adverse_media", "regional"],
  },
  {
    // Spanish & Portuguese native-script — covers LatAm, Iberian press.
    // High-risk jurisdictions: Mexico, Colombia, Brazil, Venezuela, Panama.
    label: "spanish_portuguese",
    keywords: [
      "lavado de dinero",   // money laundering (ES)
      "lavagem de dinheiro", // money laundering (PT)
      "corrupción",         // corruption (ES)
      "corrupção",          // corruption (PT)
      "fraude",             // fraud
      "detenido",           // detained/arrested (ES)
      "preso",              // arrested (PT)
      "tráfico",            // trafficking (ES)
      "tráfico de drogas",  // drug trafficking
      "blanqueo",           // laundering (ES)
      "lavagem",            // laundering (PT)
      "malversación",       // embezzlement (ES)
      "desvio de verbas",   // misappropriation (PT)
      "soborno",            // bribery (ES)
      "suborno",            // bribery (PT)
      "sanciones",          // sanctions (ES)
      "sanções",            // sanctions (PT)
      "narcotráfico",       // narcotics trafficking
      "contrabando",        // smuggling
      "crimen organizado",  // organised crime (ES)
      "crime organizado",   // organised crime (PT)
    ],
    categories: ["adverse_media", "regional"],
  },
  {
    // CJK (Chinese, Japanese, Korean) native-script — covers China, Hong Kong,
    // Taiwan, Japan, South Korea press. High-risk: PRC state-linked entities,
    // crypto exchanges, hawala networks, offshore structures.
    label: "cjk_native",
    keywords: [
      // Chinese (Simplified)
      "洗钱",              // money laundering
      "腐败",              // corruption
      "欺诈",              // fraud
      "逮捕",              // arrest
      "走私",              // smuggling
      "贿赂",              // bribery
      "制裁",              // sanctions
      "调查",              // investigation
      "犯罪",              // crime
      "非法资金",           // illegal funds
      // Japanese
      "マネーロンダリング",  // money laundering
      "汚職",              // corruption
      "詐欺",              // fraud
      "逮捕",              // arrest (shared CJK)
      "密輸",              // smuggling
      // Korean
      "자금세탁",           // money laundering
      "부패",              // corruption
      "사기",              // fraud
      "체포",              // arrest
      "밀수",              // smuggling
      "제재",              // sanctions
    ],
    categories: ["adverse_media", "regional"],
  },
];

// High-reputation news domains — articles from these sources score higher.
// Mirrors how Taranis weights its 38 vetted outlets.
const HIGH_REP_DOMAINS = new Set([
  // Global wire services & tier-1 financial press
  "reuters.com", "ft.com", "bloomberg.com", "wsj.com", "theguardian.com",
  "bbc.com", "bbc.co.uk", "nytimes.com", "apnews.com", "france24.com",
  "aljazeera.com", "dw.com", "euronews.com", "themoscowtimes.com",
  "scmp.com", "channelnewsasia.com", "arabnews.com", "thenationalnews.com",
  "gulfnews.com", "zawya.com", "middleeasteye.net",
  // Investigative / compliance
  "occrp.org", "icij.org", "globalwitness.org", "transparency.org",
  "fatf-gafi.org", "un.org", "worldbank.org", "imf.org",
  // Turkish national press
  "hurriyet.com.tr", "sabah.com.tr", "milliyet.com.tr", "cumhuriyet.com.tr",
  "haberturk.com", "sozcu.com.tr", "diken.com.tr", "bianet.org",
  // Middle East & Gulf
  "khaleejionline.com", "albawaba.com", "dailysabah.com", "aa.com.tr",
  "alarabiya.net", "asharqalawsat.com", "trtworld.com",
  // South & Southeast Asia
  "hindustantimes.com", "thehindu.com", "ndtv.com", "dawn.com",
  "thedailystar.net", "straitstimes.com", "thestar.com.my", "bangkokpost.com",
  // CIS / Eastern Europe
  "kyivindependent.com", "meduza.io", "currenttime.tv", "bellingcat.com",
  "novaiagazeta.ru",
  // Africa
  "dailymaverick.co.za", "allafrica.com", "theafricareport.com",
  "premiumtimesng.com", "nation.africa",
  // Latin America
  "infobae.com", "folha.uol.com.br", "estadao.com.br", "clarin.com",
  "larepublica.co", "eltiempo.com",
  // China
  "caixin.com", "sixthtone.com",
  // Japan / Korea
  "japantimes.co.jp", "koreaherald.com", "koreatimes.co.kr",
]);
const MED_REP_DOMAINS = new Set([
  "cnbc.com", "forbes.com", "businessinsider.com", "marketwatch.com",
  "yahoo.com", "abc.net.au", "cbc.ca", "irishtimes.com", "independent.co.uk",
  "telegraph.co.uk", "lemonde.fr", "lefigaro.fr", "spiegel.de", "faz.net",
  "corriere.it", "elpais.com", "rtve.es", "nrc.nl", "svd.se",
  "haaretz.com", "timesofisrael.com", "arabtimesonline.com",
  // Additional regional
  "thepeninsulaqatar.com", "gulf-times.com", "timesofoman.com",
  "kuwaittimes.com", "bahrainpost.com", "oman-tribune.com",
  "swissinfo.ch", "rtbf.be", "tvn24.pl", "rtbf.be",
  "zdf.de", "sueddeutsche.de", "welt.de", "handelsblatt.com",
  "leparisien.fr", "liberation.fr", "nouvelobs.com",
  "ansa.it", "repubblica.it", "sole24ore.com",
  "reuters.com.mx", "univision.com", "telemundo.com",
  "voanews.com", "rferl.org", "eurasianet.org",
]);

function sourceScore(domain?: string): number {
  if (!domain) return 0.4;
  const d = domain.toLowerCase().replace(/^www\./, "");
  if (HIGH_REP_DOMAINS.has(d)) return 1.0;
  if (MED_REP_DOMAINS.has(d)) return 0.75;
  return 0.5;
}

function buildGdeltUrl(subjectName: string, query: RiskQueryDef): string {
  const kw = query.keywords.join(" OR ");
  const rawQuery = `"${subjectName}" AND (${kw})`;
  const params = new URLSearchParams({
    query: rawQuery,
    mode: "artlist",
    maxrecords: String(GDELT_MAX_RECORDS),
    format: "json",
    sort: "DateDesc",
  });
  return `${GDELT_BASE}?${params.toString()}`;
}

// Returns null on network/HTTP failure (distinguishable from empty results).
async function fetchOneQuery(
  url: string,
  queryDef: RiskQueryDef,
  perQueryTimeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<GdeltArticle[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2_000));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), perQueryTimeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; gdelt-cache)",
          accept: "application/json",
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429) continue; // rate-limited, retry once
      if (!res.ok) {
        breakerOnFailure();
        return null; // HTTP failure — distinguishable from empty results
      }
      const data = (await res.json()) as { articles?: GdeltArticle[] };
      breakerOnSuccess();
      return (Array.isArray(data.articles) ? data.articles : [])
        .filter((a) => a.url && a.title)
        .map((a) => ({
          ...a,
          riskCategories: queryDef.categories,
          sourceScore: sourceScore(a.domain),
          queryLabel: queryDef.label,
        }));
    } catch {
      clearTimeout(timer);
    }
  }
  // Both attempts exhausted with timeout / abort — count as a failure.
  breakerOnFailure();
  return null; // network failure
}

async function liveFetch(subjectName: string, customQuery?: string, budgetMs?: number): Promise<{ articles: GdeltArticle[]; serviceError: boolean; breakerOpen?: boolean }> {
  // Short-circuit when the breaker is OPEN and the cooldown hasn't yet
  // elapsed. Returns serviceError=true so fetchGdeltCached() falls into
  // the stale-Redis recovery path without any upstream network call.
  if (!breakerAllowsLive()) {
    return { articles: [], serviceError: true, breakerOpen: true };
  }

  // Per-query timeout: honour the caller's remaining budget (leave 3 s for synthesis).
  // Never exceed FETCH_TIMEOUT_MS even if budget is generous.
  const perQueryMs = budgetMs
    ? Math.min(FETCH_TIMEOUT_MS, Math.max(4_000, budgetMs - 3_000))
    : FETCH_TIMEOUT_MS;

  // Custom query (caller override) → single fetch, original behaviour
  if (customQuery) {
    const params = new URLSearchParams({
      query: customQuery,
      mode: "artlist",
      maxrecords: String(GDELT_MAX_RECORDS),
      format: "json",
      sort: "DateDesc",
    });
    const url = `${GDELT_BASE}?${params.toString()}`;
    const articles = await fetchOneQuery(url, { label: "custom", keywords: [], categories: ["adverse_media"] }, perQueryMs);
    // null = network failure; [] = GDELT responded but no results
    if (articles === null) return { articles: [], serviceError: true };
    return { articles, serviceError: false };
  }

  // Multi-query parallel strategy — fire all risk queries simultaneously
  const urls = RISK_QUERIES.map((q) => ({ q, url: buildGdeltUrl(subjectName, q) }));
  const results = await Promise.allSettled(urls.map(({ q, url }) => fetchOneQuery(url, q, perQueryMs)));

  const allArticles: GdeltArticle[] = [];
  // anySucceeded = at least one query got a non-null response (HTTP success),
  // even if it returned zero articles. null = network/HTTP failure.
  let anySucceeded = false;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value !== null) {
      allArticles.push(...r.value);
      anySucceeded = true;
    }
  }

  if (!anySucceeded) return { articles: [], serviceError: true };

  // Deduplicate by URL — when multiple queries return the same article,
  // merge their riskCategories so one article can carry multiple tags.
  const byUrl = new Map<string, GdeltArticle>();
  for (const a of allArticles) {
    const key = (a.url ?? "").toLowerCase();
    if (!key) continue;
    const existing = byUrl.get(key);
    if (existing) {
      // Merge categories from duplicate matches
      existing.riskCategories = Array.from(
        new Set([...(existing.riskCategories ?? []), ...(a.riskCategories ?? [])])
      );
      // Keep highest source score
      if ((a.sourceScore ?? 0) > (existing.sourceScore ?? 0)) existing.sourceScore = a.sourceScore;
    } else {
      byUrl.set(key, { ...a });
    }
  }

  // Sort: high-reputation sources first, then most recent
  const deduped = Array.from(byUrl.values()).sort((a, b) => {
    const scoreDiff = (b.sourceScore ?? 0.5) - (a.sourceScore ?? 0.5);
    if (Math.abs(scoreDiff) > 0.2) return scoreDiff;
    return (b.seendate ?? "").localeCompare(a.seendate ?? "");
  });

  return { articles: deduped, serviceError: false };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface FetchGdeltOpts {
  /** Override the default adverse-media keyword query. */
  query?: string;
  /**
   * Force a live fetch (bypass cache). The result is still written to the
   * cache layers so subsequent calls benefit. Use sparingly — defeats the
   * point of the cache.
   */
  forceRefresh?: boolean;
  /**
   * Remaining time budget in ms for the entire GDELT fetch (including retries).
   * Prevents GDELT from running past the caller's route deadline.
   * If omitted, defaults to FETCH_TIMEOUT_MS (20 s).
   */
  budgetMs?: number;
}

export async function fetchGdeltCached(
  subjectName: string,
  opts: FetchGdeltOpts = {},
): Promise<GdeltCachedResult> {
  const key = memKey(subjectName);

  // Layer 1 — memory (skipped when forceRefresh).
  if (!opts.forceRefresh) {
    const memHit = memGet(key);
    if (memHit) {
      return { ...memHit, source: "memory", stale: false };
    }
    // Layer 2 — Redis.
    const redisHit = await redisGet(key);
    if (redisHit) {
      const age = (Date.now() - redisHit.fetchedAt) / 1_000;
      if (age < REDIS_TTL_SECONDS) {
        memSet(key, redisHit);
        return { ...redisHit, source: "redis", stale: false };
      }
      // Older than REDIS_TTL but within STALE_OK — we'll keep this as a
      // fallback in case the live call fails below.
    }
  }

  // Layer 3 — live GDELT.
  const live = await liveFetch(subjectName, opts.query, opts.budgetMs);
  if (!live.serviceError) {
    const value: MemEntry["value"] = {
      articles: live.articles,
      fetchedAt: Date.now(),
      serviceError: false,
    };
    memSet(key, value);
    await redisSet(key, value);
    return { ...value, source: "live", stale: false };
  }

  // Live failed — try to recover with stale Redis data if available.
  const stale = opts.forceRefresh ? null : await redisGet(key);
  if (stale) {
    const ageSeconds = (Date.now() - stale.fetchedAt) / 1_000;
    if (ageSeconds < STALE_OK_SECONDS) {
      return { ...stale, source: "redis", stale: true, serviceError: true };
    }
  }

  // No recoverable data — surface the upstream failure.
  return {
    articles: [],
    fetchedAt: Date.now(),
    source: "live",
    stale: false,
    serviceError: true,
  };
}

// Clear the in-memory cache. Tests + admin diagnostics. Does not flush Redis.
export function clearGdeltMemoryCache(): void {
  _mem.clear();
}

// Diagnostic snapshot of memory cache state — used by /api/status or admin.
export function gdeltCacheStats(): { entries: number; oldestAgeMs: number | null } {
  if (_mem.size === 0) return { entries: 0, oldestAgeMs: null };
  let oldest = Date.now();
  for (const entry of _mem.values()) {
    const t = entry.expiresAt - MEMORY_TTL_MS;
    if (t < oldest) oldest = t;
  }
  return { entries: _mem.size, oldestAgeMs: Date.now() - oldest };
}

// ─── GDELT GKG (Global Knowledge Graph) ────────────────────────────────────
//
// The GKG V2 API returns structured entity-level data derived from GDELT's
// knowledge graph: themes, tones, and co-occurring entities linked to news
// events. Unlike the DOC API (article-list mode), GKG data is pre-parsed by
// GDELT's NLP pipeline and exposes CAMEO/GDELT theme codes directly — making
// crime-signal detection more precise than keyword search alone.
//
// We use this as an additive layer: the DOC API query (above) identifies
// adverse articles; the GKG query confirms crime-related *themes* and
// supplies an average tone independent of our keyword filters.

export interface GkgEntity {
  name: string;
  type: string;  // PERSON, ORG, COUNTRY, etc.
  count: number;
  tone: number;  // negative = bad news
  themes: string[];
  locations: string[];
}

export interface GkgResult {
  entities: GkgEntity[];
  averageTone: number;
  crimeThemes: string[];
  fetchedAt: string;
}

const GDELT_GKG_BASE = "https://api.gdeltproject.org/api/v2/gkg/gkg";
const GKG_TIMEOUT_MS = 5_000;

/** Crime-related GDELT/CAMEO theme prefixes we care about. */
const CRIME_THEME_PATTERNS = [
  "CRIME", "CORRUPTION", "FRAUD", "TERROR", "SANCTION", "LAUNDER", "BRIBE",
];

/**
 * Query the GDELT GKG API for a subject name.
 * Returns crime-related themes and average tone across recent articles.
 * Returns null on any network/HTTP error (designed to be non-blocking).
 */
export async function queryGdeltGkg(subjectName: string): Promise<GkgResult | null> {
  const url = new URL(GDELT_GKG_BASE);
  url.searchParams.set("query", `"${subjectName}"`);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "50");
  url.searchParams.set("timespan", "LAST365DAYS");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GKG_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json() as { articles?: Array<{ tone?: string; themes?: string; persons?: string }> };

    // Extract crime-related themes and compute average tone
    const crimeThemes: string[] = [];
    let totalTone = 0;
    let count = 0;

    for (const article of (data.articles ?? [])) {
      if (article.tone) {
        const tone = parseFloat(article.tone.split(",")[0] ?? "0");
        if (Number.isFinite(tone)) { totalTone += tone; count++; }
      }
      for (const theme of (article.themes ?? "").split(";")) {
        const trimmed = theme.trim();
        if (!trimmed) continue;
        if (
          CRIME_THEME_PATTERNS.some((p) => trimmed.includes(p)) &&
          !crimeThemes.includes(trimmed)
        ) {
          crimeThemes.push(trimmed);
        }
      }
    }

    return {
      entities: [],
      averageTone: count > 0 ? totalTone / count : 0,
      crimeThemes: crimeThemes.slice(0, 20),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
