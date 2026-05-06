// Hawkeye Sterling — adverse-media source authority + negation (Layers #32-33).
//
// Two pure-function helpers:
//   - sourceAuthorityScore(domain): 0..1 weight reflecting how much an
//     adverse story from this outlet should count.
//   - hasNegation(snippet): true when the snippet contains a denial /
//     refutation / cleared-of phrasing — downgrades severity.

const TIER1 = new Set([
  "reuters.com", "bloomberg.com", "ft.com", "wsj.com", "ap.org", "apnews.com",
  "bbc.com", "bbc.co.uk", "nytimes.com", "washingtonpost.com", "economist.com",
  "lemonde.fr", "spiegel.de", "theguardian.com", "afp.com",
]);
const TIER2 = new Set([
  "cnn.com", "cnbc.com", "forbes.com", "fortune.com", "marketwatch.com",
  "telegraph.co.uk", "thetimes.co.uk", "lefigaro.fr", "handelsblatt.com",
  "japantimes.co.jp", "scmp.com", "thenationalnews.com", "khaleejtimes.com",
  "gulfnews.com", "arabnews.com",
]);
const TIER3 = new Set([
  "yahoo.com", "msn.com", "huffpost.com", "businessinsider.com", "buzzfeed.com",
  "dailymail.co.uk", "thesun.co.uk", "mirror.co.uk", "nypost.com",
]);
const TIER_REGULATORY = new Set([
  "treasury.gov", "ofac.treasury.gov", "fincen.gov", "sec.gov", "doj.gov",
  "fbi.gov", "europa.eu", "europol.europa.eu", "gov.uk", "fatf-gafi.org",
  "interpol.int", "worldbank.org", "un.org",
]);

function rootDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase().replace(/^www\./, "");
  }
}

export function sourceAuthorityScore(urlOrDomain: string): { score: number; tier: string } {
  if (!urlOrDomain) return { score: 0.4, tier: "unknown" };
  const host = rootDomain(urlOrDomain);
  if (TIER_REGULATORY.has(host)) return { score: 1.0, tier: "regulator" };
  if (TIER1.has(host)) return { score: 0.95, tier: "tier1" };
  if (TIER2.has(host)) return { score: 0.7, tier: "tier2" };
  if (TIER3.has(host)) return { score: 0.45, tier: "tier3" };
  // Heuristic: gov / official sources get tier-1.
  if (/\.gov(\.[a-z]{2,4})?$/.test(host)) return { score: 1.0, tier: "regulator" };
  if (/\.edu$/.test(host)) return { score: 0.7, tier: "academic" };
  // Unknown: middle ground; the corroboration layer will require 2+ sources.
  return { score: 0.5, tier: "unknown" };
}

const NEGATION_PATTERNS = [
  /\bdenies?\b/i, /\bdenied\b/i, /\bdenial\b/i,
  /\brefut(?:e|es|ed)\b/i, /\breject(?:s|ed)?\s+(?:the\s+)?allegations?\b/i,
  /\bcleared\s+(?:of|by)\b/i, /\bacquitted\b/i, /\boverturned\b/i,
  /\bdismissed\s+(?:as\s+)?(?:false|unfounded|baseless)\b/i,
  /\bno\s+(?:evidence|wrongdoing|charges)\b/i,
  /\bfound\s+innocent\b/i, /\bexoner(?:ate|ated|ation)\b/i,
];

export function hasNegation(snippet: string): { negated: boolean; phrase?: string } {
  if (!snippet) return { negated: false };
  for (const p of NEGATION_PATTERNS) {
    const m = snippet.match(p);
    if (m) return { negated: true, phrase: m[0] };
  }
  return { negated: false };
}

/**
 * Adjusts an article's contribution to the adverse-media composite by
 * source authority + negation. Returns a multiplier 0..1.
 */
export function articleWeight(snippet: string, urlOrDomain: string): {
  multiplier: number;
  authorityTier: string;
  negated: boolean;
  rationale: string;
} {
  const auth = sourceAuthorityScore(urlOrDomain);
  const neg = hasNegation(snippet);
  const negFactor = neg.negated ? 0.3 : 1.0;
  const mult = auth.score * negFactor;
  const reasons: string[] = [`source ${auth.tier} (${(auth.score * 100).toFixed(0)}%)`];
  if (neg.negated) reasons.push(`negation phrase "${neg.phrase}" — weight reduced`);
  return {
    multiplier: mult,
    authorityTier: auth.tier,
    negated: neg.negated,
    rationale: reasons.join("; "),
  };
}
