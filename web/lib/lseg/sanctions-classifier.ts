// Hawkeye Sterling — LSEG CFS → sanctions-list classifier.
//
// LSEG (Refinitiv) World-Check CFS bulk files cover the same sanctions
// regimes that Hawkeye ingests from primary sources (OFAC/UN/EU/UK/CA OSFI/
// CH SECO/AU DFAT/JP MOF/UAE EOCN/UAE LTL). Primary cron sources are
// preferred when they're healthy, but when a primary list is missing,
// stale, or returns zero entities (audit H-01/H-02/H-03/C-01), the LSEG
// supplement can backfill so the screening engine still has data.
//
// This module maps the free-form category strings that LSEG attaches to
// each entity onto our internal listIds. One entity can map to multiple
// listIds (e.g. a UN-1267 designee that the EU also lists).
//
// Entries that map to no sanctions list are returned as null and stay in
// the PEP index path that import-cfs already handles.

export type SanctionsListId =
  | "lseg_ofac_sdn"
  | "lseg_ofac_cons"
  | "lseg_un_consolidated"
  | "lseg_eu_fsf"
  | "lseg_uk_ofsi"
  | "lseg_ca_osfi"
  | "lseg_au_dfat"
  | "lseg_ch_seco"
  | "lseg_jp_mof"
  | "lseg_uae_eocn"
  | "lseg_uae_ltl";

export const LSEG_SUPPLEMENT_LIST_IDS: readonly SanctionsListId[] = [
  "lseg_ofac_sdn",
  "lseg_ofac_cons",
  "lseg_un_consolidated",
  "lseg_eu_fsf",
  "lseg_uk_ofsi",
  "lseg_ca_osfi",
  "lseg_au_dfat",
  "lseg_ch_seco",
  "lseg_jp_mof",
  "lseg_uae_eocn",
  "lseg_uae_ltl",
];

interface CategoryRule {
  listId: SanctionsListId;
  // Pattern is matched (case-insensitive) against each LSEG category string.
  // Patterns are deliberately narrow — they target the regime/programme
  // names LSEG actually uses in World-Check / Sanctions DataFile feeds.
  patterns: RegExp[];
}

// Patterns derived from LSEG World-Check category taxonomy and the
// Sanctions DataFile programme codes published with the bulk packages.
// Keep regexes anchored or use specific terms — a stray "UN" inside a
// longer string like "United Nations Resolution" must not collide with
// the EU/UK lists.
const RULES: readonly CategoryRule[] = [
  {
    listId: "lseg_ofac_sdn",
    patterns: [
      /\bofac\s+sdn\b/i,
      /\bofac\s+specially\s+designated\s+nationals?\b/i,
      /\bsdn\s+list\b/i,
      /\bus\s+treasury\s+sdn\b/i,
    ],
  },
  {
    listId: "lseg_ofac_cons",
    patterns: [
      /\bofac\s+consolidated\b/i,
      /\bofac\s+non-?sdn\b/i,
      /\bofac\s+ssi\b/i,
      /\bsectoral\s+sanctions\s+identifications?\b/i,
    ],
  },
  {
    listId: "lseg_un_consolidated",
    patterns: [
      /\bun\s+(?:security\s+council\s+)?consolidated\b/i,
      /\bun\s+1267\b/i,
      /\bun\s+1718\b/i,
      /\bun\s+1988\b/i,
      /\bun\s+2231\b/i,
      /\bunsc\s+sanctions\b/i,
    ],
  },
  {
    listId: "lseg_eu_fsf",
    patterns: [
      /\beu\s+consolidated\b/i,
      /\beu\s+cfsp\b/i,
      /\beu\s+financial\s+sanctions\b/i,
      /\beu\s+restrictive\s+measures\b/i,
      /\bcouncil\s+(?:regulation|decision)\s+\(eu\)\b/i,
    ],
  },
  {
    listId: "lseg_uk_ofsi",
    patterns: [
      /\buk\s+ofsi\b/i,
      /\buk\s+hm\s+treasury\b/i,
      /\bhm\s+treasury\s+(?:consolidated|sanctions)\b/i,
      /\buk\s+sanctions\s+list\b/i,
    ],
  },
  {
    listId: "lseg_ca_osfi",
    patterns: [
      /\bcanada\s+osfi\b/i,
      /\bosfi\s+(?:consolidated|sanctions)\b/i,
      /\bcanada\s+(?:special\s+economic\s+measures|sema)\b/i,
      /\bcanadian\s+sanctions\b/i,
    ],
  },
  {
    listId: "lseg_au_dfat",
    patterns: [
      /\baustralia\s+dfat\b/i,
      /\bdfat\s+consolidated\b/i,
      /\baustralian\s+(?:sanctions|autonomous)\b/i,
    ],
  },
  {
    listId: "lseg_ch_seco",
    patterns: [
      /\bswitzerland\s+seco\b/i,
      /\bseco\s+sanctions\b/i,
      /\bswiss\s+(?:sanctions|embargo)\b/i,
    ],
  },
  {
    listId: "lseg_jp_mof",
    patterns: [
      /\bjapan\s+(?:mof|meti)\b/i,
      /\bjapanese\s+(?:economic\s+sanctions|foreign\s+exchange)\b/i,
    ],
  },
  {
    listId: "lseg_uae_eocn",
    patterns: [
      /\buae\s+(?:eocn|executive\s+office\s+for\s+control)\b/i,
      /\beocn\s+sanctions\b/i,
      /\buae\s+(?:cabinet|terrorism)\s+sanctions\b/i,
    ],
  },
  {
    listId: "lseg_uae_ltl",
    patterns: [
      /\buae\s+(?:ltl|local\s+terrorist)\b/i,
      /\buae\s+terrorist\s+list\b/i,
    ],
  },
];

/**
 * Returns the set of internal listIds this LSEG entity belongs to based on
 * its category labels. Empty when none of the rules match — caller should
 * route the entity to the PEP index instead (or skip if neither PEP nor
 * sanctions).
 *
 * Multiple matches are common: a UN-1267 designee that the EU also lists
 * will map to both lseg_un_consolidated and lseg_eu_fsf.
 */
export function classifyToSanctionsListIds(categories: readonly string[]): SanctionsListId[] {
  if (categories.length === 0) return [];
  const matched = new Set<SanctionsListId>();
  for (const cat of categories) {
    if (!cat) continue;
    for (const rule of RULES) {
      if (rule.patterns.some((re) => re.test(cat))) {
        matched.add(rule.listId);
      }
    }
  }
  return Array.from(matched);
}

/** Friendly display name for a supplement listId — used by /api/sanctions/status. */
export function lsegListDisplayName(listId: SanctionsListId): string {
  switch (listId) {
    case "lseg_ofac_sdn":        return "OFAC SDN (LSEG supplement)";
    case "lseg_ofac_cons":       return "OFAC Consolidated Non-SDN (LSEG supplement)";
    case "lseg_un_consolidated": return "UN Security Council Consolidated (LSEG supplement)";
    case "lseg_eu_fsf":          return "EU Financial Sanctions (LSEG supplement)";
    case "lseg_uk_ofsi":         return "UK HM Treasury OFSI (LSEG supplement)";
    case "lseg_ca_osfi":         return "Canada OSFI (LSEG supplement)";
    case "lseg_au_dfat":         return "Australia DFAT (LSEG supplement)";
    case "lseg_ch_seco":         return "Switzerland SECO (LSEG supplement)";
    case "lseg_jp_mof":          return "Japan MOF (LSEG supplement)";
    case "lseg_uae_eocn":        return "UAE EOCN (LSEG supplement)";
    case "lseg_uae_ltl":         return "UAE Local Terrorist List (LSEG supplement)";
  }
}
