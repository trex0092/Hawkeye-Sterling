// Hawkeye Sterling — sub-national region sanctions (Layer #28).
//
// Some sanctions regimes target specific REGIONS within a country rather
// than the whole country (Crimea, DPR, LPR, Zaporizhzhia, Kherson under
// the Russia regime; certain provinces in Myanmar etc.). Country-level
// screening alone misses these — this module detects the region from
// declared address / city / postcode and flags it.

export interface RegionEntry {
  iso2: string;            // parent country
  region: string;          // canonical region name
  patterns: RegExp[];      // address-detection patterns
  regimes: string[];       // sanction regimes targeting this region
  designation: string;     // FR / EO / SI / UN reference
  effectiveSince: string;
  note: string;
}

const REGIONS: RegionEntry[] = [
  {
    iso2: "UA",
    region: "Crimea",
    patterns: [/\bcrimea\b/i, /\bsevastopol\b/i, /\bsimferopol\b/i, /\byalta\b/i, /\bkerch\b/i],
    regimes: ["OFAC EO 13685", "EU Council Decision 2014/386", "UK Russia Regulations"],
    designation: "OFAC EO 13685",
    effectiveSince: "2014-12-19",
    note: "Comprehensive prohibition on dealings with Crimea region.",
  },
  {
    iso2: "UA",
    region: "Donetsk People's Republic (DPR)",
    patterns: [/\bdonetsk\s+(?:people'?s\s+)?republic\b/i, /\bDPR\b/, /\bdonetsk\b/i],
    regimes: ["OFAC EO 14065", "EU Council Decision 2022/266"],
    designation: "OFAC EO 14065",
    effectiveSince: "2022-02-21",
    note: "Comprehensive prohibition on dealings with the so-called DPR.",
  },
  {
    iso2: "UA",
    region: "Luhansk People's Republic (LPR)",
    patterns: [/\bluhansk\s+(?:people'?s\s+)?republic\b/i, /\bLPR\b/, /\bluhansk\b/i, /\blugansk\b/i],
    regimes: ["OFAC EO 14065", "EU Council Decision 2022/266"],
    designation: "OFAC EO 14065",
    effectiveSince: "2022-02-21",
    note: "Comprehensive prohibition on dealings with the so-called LPR.",
  },
  {
    iso2: "UA",
    region: "Zaporizhzhia Oblast (occupied)",
    patterns: [/\bzaporizhzhia\b/i, /\bzaporozhye\b/i, /\bmelitopol\b/i, /\benerhodar\b/i],
    regimes: ["OFAC EO 14065 (extended Sept 2022)", "EU Council Decision 2022/1908"],
    designation: "OFAC EO 14065",
    effectiveSince: "2022-09-30",
    note: "Sanctions extended to Zaporizhzhia Sept 2022 — verify whether address falls in the occupied portion.",
  },
  {
    iso2: "UA",
    region: "Kherson Oblast (occupied)",
    patterns: [/\bkherson\b/i, /\bnova\s+kakhovka\b/i, /\bskadovsk\b/i],
    regimes: ["OFAC EO 14065 (extended Sept 2022)", "EU Council Decision 2022/1908"],
    designation: "OFAC EO 14065",
    effectiveSince: "2022-09-30",
    note: "Sanctions extended to Kherson Sept 2022 — verify whether address falls in the occupied portion.",
  },
  {
    iso2: "GE",
    region: "South Ossetia / Abkhazia",
    patterns: [/\bsouth\s+ossetia\b/i, /\babkhazia\b/i, /\btskhinval\b/i, /\bsukhumi\b/i],
    regimes: ["EU CFSP/Georgia"],
    designation: "EU CFSP",
    effectiveSince: "2008-08-26",
    note: "EU recognises Georgian sovereignty; transactions with Russian-administered authorities restricted.",
  },
  {
    iso2: "MD",
    region: "Transnistria",
    patterns: [/\btransnistria\b/i, /\btiraspol\b/i, /\bbender\b/i],
    regimes: ["EU CFSP/Moldova"],
    designation: "EU CFSP",
    effectiveSince: "2003-02-27",
    note: "EU travel-ban / asset-freeze targets Transnistrian leadership.",
  },
];

export interface SubnationalReport {
  matched: boolean;
  region?: RegionEntry;
  rationale: string;
}

export function detectSubnationalRegion(addressOrCity: string | null | undefined): SubnationalReport {
  if (!addressOrCity) return { matched: false, rationale: "No address provided." };
  for (const r of REGIONS) {
    for (const p of r.patterns) {
      if (p.test(addressOrCity)) {
        return {
          matched: true,
          region: r,
          rationale: `Address matches ${r.region} (${r.iso2}) — designated under ${r.regimes.join(", ")}; ${r.note}`,
        };
      }
    }
  }
  return { matched: false, rationale: "No sub-national-region sanctions match." };
}
