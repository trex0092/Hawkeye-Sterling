// Hawkeye Sterling — co-occurrence detection.
//
// Scans adverse-media articles for capitalized name fragments that
// co-occur with the subject. Surfaces:
//   - Likely associates (other capitalized names mentioned alongside subject)
//   - Sanctioned entities (when a co-mentioned name matches a watchlist hit)
//   - Geographic risk hotspots (high-risk country mentions)
//
// World Check tells you who's listed; we ALSO tell you who they're
// publicly hanging out with in the news — the standard sanctions-evasion
// vector that escapes binary list-screening.

const STOP_WORDS = new Set([
  "The", "And", "But", "For", "With", "From", "This", "That", "These", "Those",
  "Mr", "Mrs", "Ms", "Dr", "Sir", "Lord", "Lady",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Reuters", "Bloomberg", "AP", "AFP", "BBC", "CNN", "Forbes", "Guardian",
]);

const HIGH_RISK_COUNTRIES = new Set([
  "Iran", "North Korea", "Syria", "Russia", "Belarus", "Cuba", "Venezuela",
  "Myanmar", "Sudan", "Yemen", "Afghanistan", "Libya", "Somalia", "Zimbabwe",
  "Crimea", "Donetsk", "Luhansk",
]);

export interface CoOccurrenceArticle {
  title?: string;
  snippet?: string;
  url?: string;
}

export interface CoOccurrenceResult {
  associates: Array<{ name: string; mentions: number; sample: string[] }>;
  sanctionedAssociates: Array<{ name: string; mentions: number; matchedListId?: string }>;
  geographicRisk: Array<{ country: string; mentions: number }>;
  totalArticles: number;
  signal: string;
}

/**
 * Cheap NER: extract sequences of 2-4 capitalized words that aren't
 * stop-words. We don't need a full NER model — for screening, this
 * catches "Vladimir Putin", "Marwan Salame", "Kremlin Holdings" etc.
 */
function extractCapitalizedNames(text: string): string[] {
  const names: string[] = [];
  // Match runs of 2-4 Capitalized Words (allowing apostrophes, hyphens)
  const re = /\b([A-Z][a-zA-Z'-]{1,}(?:\s+[A-Z][a-zA-Z'-]{1,}){1,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const candidate = m[1]!.trim();
    const parts = candidate.split(/\s+/);
    // Strip leading stop-word prefixes
    while (parts.length > 0 && STOP_WORDS.has(parts[0]!)) parts.shift();
    if (parts.length < 2) continue;
    if (parts.every((p) => STOP_WORDS.has(p))) continue;
    names.push(parts.join(" "));
  }
  return names;
}

/**
 * Substring containment for (name, subject) — case-insensitive, with
 * tokenized boundary check so "Putin" doesn't match "Putinian".
 */
function containsName(haystack: string, needle: string): boolean {
  const tokens = needle.toLowerCase().split(/\s+/);
  const hay = haystack.toLowerCase();
  return tokens.every((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`).test(hay));
}

export function detectCoOccurrence(
  subjectName: string,
  articles: CoOccurrenceArticle[],
  knownSanctioned: Array<{ name: string; listId: string }> = [],
): CoOccurrenceResult {
  if (articles.length === 0) {
    return {
      associates: [], sanctionedAssociates: [], geographicRisk: [],
      totalArticles: 0,
      signal: "No articles to analyse for co-occurrence.",
    };
  }

  const nameCounts = new Map<string, { count: number; samples: string[] }>();
  const countryCounts = new Map<string, number>();

  for (const a of articles) {
    const text = `${a.title ?? ""} ${a.snippet ?? ""}`.trim();
    if (!text || !containsName(text, subjectName)) continue;
    // Found subject mentioned in this article — extract co-occurrences
    const names = extractCapitalizedNames(text);
    for (const n of names) {
      // Skip the subject themselves
      if (containsName(n, subjectName) || containsName(subjectName, n)) continue;
      const k = n.toLowerCase();
      const existing = nameCounts.get(k) ?? { count: 0, samples: [] };
      existing.count += 1;
      if (existing.samples.length < 3 && a.url) existing.samples.push(a.url);
      nameCounts.set(k, existing);
    }
    // Geographic mentions
    for (const country of HIGH_RISK_COUNTRIES) {
      if (new RegExp(`\\b${country}\\b`, "i").test(text)) {
        countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
      }
    }
  }

  // Restore original casing for display by finding any one exemplar
  const associatesArr: CoOccurrenceResult["associates"] = [];
  const sanctionedArr: CoOccurrenceResult["sanctionedAssociates"] = [];
  for (const [lower, info] of nameCounts.entries()) {
    if (info.count < 2) continue;       // require at least 2 co-mentions to dedupe noise
    // Find original-cased version
    const display = (() => {
      for (const a of articles) {
        const t = `${a.title ?? ""} ${a.snippet ?? ""}`;
        const re = new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i");
        const m = re.exec(t);
        if (m) return m[0];
      }
      return lower;
    })();
    const sanctionedMatch = knownSanctioned.find((s) => s.name.toLowerCase() === lower);
    if (sanctionedMatch) {
      sanctionedArr.push({ name: display, mentions: info.count, matchedListId: sanctionedMatch.listId });
    } else {
      associatesArr.push({ name: display, mentions: info.count, sample: info.samples });
    }
  }

  associatesArr.sort((a, b) => b.mentions - a.mentions);
  sanctionedArr.sort((a, b) => b.mentions - a.mentions);

  const geographicRisk = Array.from(countryCounts.entries())
    .map(([country, mentions]) => ({ country, mentions }))
    .sort((a, b) => b.mentions - a.mentions);

  let signal: string;
  if (sanctionedArr.length > 0) {
    signal = `Sanctioned-entity association detected: subject co-mentioned with ${sanctionedArr.map((s) => s.name).slice(0, 3).join(", ")}. ESCALATE — guilt-by-association requires manual review.`;
  } else if (geographicRisk.length > 0) {
    signal = `Geographic risk: subject mentioned alongside high-risk jurisdiction(s): ${geographicRisk.slice(0, 3).map((g) => g.country).join(", ")}.`;
  } else if (associatesArr.length > 0) {
    signal = `${associatesArr.length} likely associate(s) co-mentioned with subject; review for PEP/UBO inheritance.`;
  } else {
    signal = "No notable co-occurrences detected in available articles.";
  }

  return {
    associates: associatesArr.slice(0, 10),
    sanctionedAssociates: sanctionedArr.slice(0, 10),
    geographicRisk,
    totalArticles: articles.length,
    signal,
  };
}
