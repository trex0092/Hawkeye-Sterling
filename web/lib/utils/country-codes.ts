// Country-name → ISO-2 resolution for manual country entry.
//
// Forms accept a typed full country name (or an ISO-2 code) and store the
// ISO-2 internally so screening / geographic-risk layers keep working.
// Backed by the same jurisdiction dataset the country-risk module uses.

import { JURISDICTION_RISK, JURISDICTION_BY_ISO } from "@/lib/data/jurisdictions";

function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_TO_ISO: Map<string, string> = new Map(
  JURISDICTION_RISK.map((j) => [normalise(j.name), j.iso2]),
);

// Common shorthands operators actually type.
const ALIASES: Record<string, string> = {
  "uae": "AE", "united arab emirates": "AE", "emirates": "AE",
  "uk": "GB", "great britain": "GB", "britain": "GB", "england": "GB",
  "usa": "US", "united states": "US", "united states of america": "US", "america": "US",
  "drc": "CD", "democratic republic of the congo": "CD", "congo kinshasa": "CD",
  "congo brazzaville": "CG",
  "south korea": "KR", "korea": "KR", "republic of korea": "KR",
  "north korea": "KP", "dprk": "KP",
  "ivory coast": "CI", "cote divoire": "CI",
  "czechia": "CZ", "czech republic": "CZ",
  "bosnia": "BA", "bosnia and herzegovina": "BA",
  "macedonia": "MK", "north macedonia": "MK",
  "russia": "RU", "russian federation": "RU",
  "ksa": "SA", "saudi": "SA", "saudi arabia": "SA",
  "holland": "NL", "the netherlands": "NL",
  "burma": "MM", "myanmar": "MM",
  "swaziland": "SZ",
  "cape verde": "CV",
  "vatican": "VA", "holy see": "VA",
  "palestine": "PS",
  "hong kong": "HK", "hongkong": "HK",
  "bvi": "VG", "british virgin islands": "VG",
  "cayman": "KY", "cayman islands": "KY",
};

/**
 * Resolves user input (full country name, alias, or ISO-2 code) to an ISO-2
 * code. Returns null when nothing matches.
 */
export function resolveCountryToIso2(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (/^[A-Za-z]{2}$/.test(raw)) {
    const iso = raw.toUpperCase();
    if (JURISDICTION_BY_ISO.has(iso)) return iso;
  }

  const norm = normalise(raw);
  if (!norm) return null;

  const aliased = ALIASES[norm];
  if (aliased) return aliased;

  const exact = NAME_TO_ISO.get(norm);
  if (exact) return exact;

  // Unique prefix match ("switz" → CH) so partial typing still resolves.
  const prefixHits = JURISDICTION_RISK.filter((j) => normalise(j.name).startsWith(norm));
  if (prefixHits.length === 1) return prefixHits[0]!.iso2;

  return null;
}

/** Display name for an ISO-2 code; falls back to the code itself. */
export function countryNameFromIso2(iso2: string): string {
  return JURISDICTION_BY_ISO.get(iso2.toUpperCase())?.name ?? iso2.toUpperCase();
}
