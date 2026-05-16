// Hawkeye Sterling — feature-flag registry.
//
// AWS Lambda has a 4 KB hard limit on the combined size of environment
// variables. With 24 individual `*_ENABLED=1` toggles each adding ~25
// bytes, the deploy was breaching the limit and Netlify functions
// failed to upload. The cleanest fix is to default-enable every free
// toggle in code and let operators opt out via a single comma-
// separated `HS_DISABLED` env var.
//
// Behavior:
//   - Each flag defaults to ON.
//   - Set `HS_DISABLED=hmt-ofsi,ofac-sdn` to turn specific ones off.
//   - Legacy individual `*_ENABLED=0` env vars are still honored for
//     backwards compatibility — if anyone explicitly sets
//     `HMT_OFSI_ENABLED=0` it overrides the default-on behaviour.

export type FreeFlag =
  | "hmt-ofsi" | "ofac-sdn" | "eu-eba" | "un-sc"
  | "au-dfat" | "ch-seco" | "ca-sema" | "nz-dpmc"
  | "ae-eocn" | "jp-meti"
  | "wikidata" | "worldbank-debar" | "fatf"
  | "gleif" | "opensanctions-free" | "opencorporates-free"
  | "sec-edgar" | "icij-offshore-leaks"
  | "br-receita" | "co-rues" | "ua-yedr"
  | "zefix" | "bronnoysund" | "ytj"
  | "google-news-rss" | "hacker-news"
  | "free-rss"
  | "interpol-red-notices" | "fbi-most-wanted" | "occrp-aleph"
  | "eu-fsf" | "un-sc-sanctions" | "bis-entity-list"
  | "samgov-exclusions" | "open-ownership" | "eu-transparency-register";

// Maps each flag to its legacy env var name for backwards compatibility.
const LEGACY_ENV_VAR: Record<FreeFlag, string> = {
  "hmt-ofsi": "HMT_OFSI_ENABLED",
  "ofac-sdn": "OFAC_SDN_ENABLED",
  "eu-eba": "EU_EBA_ENABLED",
  "un-sc": "UN_SC_ENABLED",
  "au-dfat": "AU_DFAT_ENABLED",
  "ch-seco": "CH_SECO_ENABLED",
  "ca-sema": "CA_SEMA_ENABLED",
  "nz-dpmc": "NZ_DPMC_ENABLED",
  "ae-eocn": "AE_EOCN_ENABLED",
  "jp-meti": "JP_METI_ENABLED",
  "wikidata": "WIKIDATA_ENABLED",
  "worldbank-debar": "WORLDBANK_DEBAR_ENABLED",
  "fatf": "FATF_ENABLED",
  "gleif": "GLEIF_ENABLED",
  "opensanctions-free": "OPENSANCTIONS_FREE_ENABLED",
  "opencorporates-free": "OPENCORPORATES_FREE_ENABLED",
  "sec-edgar": "SEC_EDGAR_ENABLED",
  "icij-offshore-leaks": "ICIJ_OFFSHORE_LEAKS_ENABLED",
  "br-receita": "BR_RECEITA_ENABLED",
  "co-rues": "CO_RUES_ENABLED",
  "ua-yedr": "UA_YEDR_ENABLED",
  "zefix": "ZEFIX_ENABLED",
  "bronnoysund": "BRONNOYSUND_ENABLED",
  "ytj": "YTJ_ENABLED",
  "google-news-rss": "GOOGLE_NEWS_RSS_ENABLED",
  "hacker-news": "HACKER_NEWS_ENABLED",
  "free-rss": "FREE_RSS_DISABLED",
  "interpol-red-notices": "INTERPOL_RED_NOTICES_ENABLED",
  "fbi-most-wanted": "FBI_MOST_WANTED_ENABLED",
  "occrp-aleph": "OCCRP_ALEPH_ENABLED",
  "eu-fsf": "EU_FSF_ENABLED",
  "un-sc-sanctions": "UN_SC_SANCTIONS_ENABLED",
  "bis-entity-list": "BIS_ENTITY_LIST_ENABLED",
  "samgov-exclusions": "SAMGOV_EXCLUSIONS_ENABLED",
  "open-ownership": "OPEN_OWNERSHIP_ENABLED",
  "eu-transparency-register": "EU_TRANSPARENCY_REGISTER_ENABLED",
};

function parseDisabledList(): Set<string> {
  const raw = process.env["HS_DISABLED"];
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Returns true when a free flag is active. Flags default to ON; turn
 * off with HS_DISABLED=foo,bar OR by setting the legacy env var to 0.
 *
 * Special case: 'free-rss' uses a "disabled" env var, not "enabled" —
 * we keep that polarity because the existing code reads
 * FREE_RSS_DISABLED.
 */
export function flagOn(flag: FreeFlag): boolean {
  // Master opt-out list
  const disabled = parseDisabledList();
  if (disabled.has(flag)) return false;

  // Legacy env var override
  const legacyEnv = LEGACY_ENV_VAR[flag];
  const legacyVal = process.env[legacyEnv];
  if (flag === "free-rss") {
    // FREE_RSS_DISABLED=1 → off. Default on.
    if (legacyVal === "1" || legacyVal?.toLowerCase() === "true") return false;
    return true;
  }
  // For *_ENABLED legacy vars: explicit "0" / "false" disables; anything
  // else (set or unset) keeps the default-on behaviour.
  if (legacyVal === "0" || legacyVal?.toLowerCase() === "false") return false;
  return true;
}

/** All flags that are currently active. */
export function activeFlags(): FreeFlag[] {
  return (Object.keys(LEGACY_ENV_VAR) as FreeFlag[]).filter(flagOn);
}

/** All flags an operator has explicitly disabled. */
export function disabledFlags(): FreeFlag[] {
  return (Object.keys(LEGACY_ENV_VAR) as FreeFlag[]).filter((f) => !flagOn(f));
}
