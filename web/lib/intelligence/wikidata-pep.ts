// Wikidata SPARQL PEP enrichment.
//
// Queries the Wikidata SPARQL endpoint for political figures matching a name
// and returns structured WikidataPepProfile objects. Results are cached for
// 60 minutes per name to avoid hammering the public endpoint.
//
// All network calls use a 5-second AbortController timeout.
// Returns an empty array on any error (fail-safe for enrichment workflows).

export interface WikidataPepProfile {
  wikidataId: string;
  name: string;
  positions: string[];          // political offices held
  countries: string[];
  partyAffiliations: string[];
  imageUrl?: string;
  description?: string;
  isCurrentlyActive: boolean;
}

// ── In-process 60-minute cache ───────────────────────────────────────────────

interface CacheEntry {
  data: WikidataPepProfile[];
  cachedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1_000; // 60 minutes
const _cache = new Map<string, CacheEntry>();

function cacheKey(name: string): string {
  return name.toLowerCase().trim();
}

function cacheGet(name: string): WikidataPepProfile[] | null {
  const entry = _cache.get(cacheKey(name));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    _cache.delete(cacheKey(name));
    return null;
  }
  return entry.data;
}

function cacheSet(name: string, data: WikidataPepProfile[]): void {
  _cache.set(cacheKey(name), { data, cachedAt: Date.now() });
}

// ── SPARQL query builder ──────────────────────────────────────────────────────

function buildSparqlQuery(name: string): string {
  // Escape double quotes in the name to prevent SPARQL injection
  const safeName = name.replace(/"/g, '\\"');
  return `
SELECT DISTINCT ?person ?personLabel ?positionLabel ?countryLabel ?partyLabel ?image ?description WHERE {
  ?person wdt:P31 wd:Q5 .
  ?person wdt:P39 ?position .
  ?person rdfs:label "${safeName}"@en .
  OPTIONAL { ?position wdt:P17 ?country }
  OPTIONAL { ?person wdt:P102 ?party }
  OPTIONAL { ?person wdt:P18 ?image }
  OPTIONAL { ?person schema:description ?description . FILTER(LANG(?description) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 5
`.trim();
}

// ── SPARQL response types ─────────────────────────────────────────────────────

interface SparqlBinding {
  value: string;
  type?: string;
  "xml:lang"?: string;
}

interface SparqlResult {
  person?: SparqlBinding;
  personLabel?: SparqlBinding;
  positionLabel?: SparqlBinding;
  countryLabel?: SparqlBinding;
  partyLabel?: SparqlBinding;
  image?: SparqlBinding;
  description?: SparqlBinding;
}

interface SparqlResponse {
  results?: {
    bindings?: SparqlResult[];
  };
}

// ── Parser — aggregate rows by personId ──────────────────────────────────────

function parseResults(bindings: SparqlResult[]): WikidataPepProfile[] {
  const profileMap = new Map<string, WikidataPepProfile>();

  for (const row of bindings) {
    const personUri = row.person?.value ?? "";
    if (!personUri) continue;

    // Extract Wikidata QID from URI e.g. http://www.wikidata.org/entity/Q1234
    const match = /\/entity\/(Q\d+)$/.exec(personUri);
    const wikidataId = match ? match[1]! : personUri;

    let profile = profileMap.get(wikidataId);
    if (!profile) {
      profile = {
        wikidataId,
        name: row.personLabel?.value ?? "",
        positions: [],
        countries: [],
        partyAffiliations: [],
        imageUrl: row.image?.value,
        description: row.description?.value,
        isCurrentlyActive: false, // enriched below
      };
      profileMap.set(wikidataId, profile);
    }

    // Accumulate multi-valued fields
    const position = row.positionLabel?.value;
    if (position && !profile.positions.includes(position)) {
      profile.positions.push(position);
    }
    const country = row.countryLabel?.value;
    if (country && !profile.countries.includes(country)) {
      profile.countries.push(country);
    }
    const party = row.partyLabel?.value;
    if (party && !profile.partyAffiliations.includes(party)) {
      profile.partyAffiliations.push(party);
    }
    // Prefer first image found
    if (!profile.imageUrl && row.image?.value) {
      profile.imageUrl = row.image.value;
    }
    // Prefer first description found
    if (!profile.description && row.description?.value) {
      profile.description = row.description.value;
    }
  }

  // Heuristic: mark as currently active if description doesn't contain past-tense markers
  for (const profile of profileMap.values()) {
    const desc = (profile.description ?? "").toLowerCase();
    const positions = profile.positions.join(" ").toLowerCase();
    const pastMarkers = ["former", "ex-", "was ", "retired", "deceased", "died"];
    const isPast = pastMarkers.some((m) => desc.includes(m) || positions.includes(m));
    profile.isCurrentlyActive = !isPast && profile.positions.length > 0;
  }

  return Array.from(profileMap.values());
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Query Wikidata SPARQL for political figures matching `name`.
 * Returns an empty array on error or if no results found.
 * Cached for 60 minutes per name.
 */
export async function enrichPepFromWikidata(name: string): Promise<WikidataPepProfile[]> {
  const trimmedName = name.trim();
  if (!trimmedName) return [];

  const cached = cacheGet(trimmedName);
  if (cached !== null) return cached;

  const sparqlEndpoint = "https://query.wikidata.org/sparql";
  const query = buildSparqlQuery(trimmedName);

  const params = new URLSearchParams({ query, format: "json" });

  let response: Response;
  try {
    response = await fetch(`${sparqlEndpoint}?${params.toString()}`, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "HawkeyeSterling-AML/1.0 (https://hawkeye-sterling.netlify.app; contact@example.com)",
      },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.warn("[wikidata-pep] network error:", err instanceof Error ? err.message : String(err));
    cacheSet(trimmedName, []);
    return [];
  }

  if (!response.ok) {
    console.warn("[wikidata-pep] non-OK response:", response.status, response.statusText);
    cacheSet(trimmedName, []);
    return [];
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    console.warn("[wikidata-pep] JSON parse error:", err instanceof Error ? err.message : String(err));
    cacheSet(trimmedName, []);
    return [];
  }

  const data = json as SparqlResponse;
  const bindings = data?.results?.bindings;
  if (!Array.isArray(bindings)) {
    cacheSet(trimmedName, []);
    return [];
  }

  const profiles = parseResults(bindings);
  cacheSet(trimmedName, profiles);
  return profiles;
}
