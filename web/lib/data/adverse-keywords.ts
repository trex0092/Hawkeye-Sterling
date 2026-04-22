// Hawkeye Sterling — adverse-media keyword classifier.
//
// The classic AML/CFT adverse-media keyword set operators use in news-ingest
// alert queries, grouped by financial-crime family so each hit carries the
// typology it signals. This is the "100% right information" layer: if any of
// these terms appear in a subject's metadata, alt names, role text or media
// snippet, they fire here with the full group context.
//
// Designed to complement the 5-class classifyAdverseMedia() from the brain
// and the 25-class ESG classifier — this one is the named-keyword floor.

export type AdverseKeywordGroup =
  | "money-laundering"
  | "bribery-corruption"
  | "terrorism-financing"
  | "proliferation-wmd"
  | "organised-crime"
  | "human-trafficking"
  | "cybercrime"
  | "fraud-forgery"
  | "tax-crime"
  | "market-abuse"
  | "law-enforcement"
  | "regulatory-action"
  | "political-exposure";

export interface AdverseKeywordRule {
  group: AdverseKeywordGroup;
  label: string;
  // All terms are matched case-insensitively as whole-substring.
  terms: string[];
}

export const ADVERSE_KEYWORDS: AdverseKeywordRule[] = [
  {
    group: "money-laundering",
    label: "Money laundering & financial crime",
    terms: [
      "money laundering", "money launder", "launder",
      "financial crime", "economic crime",
      "embezzle", "embezzlement", "misappropriation", "asset misappropriation",
      "extort", "extortion", "kickback",
    ],
  },
  {
    group: "bribery-corruption",
    label: "Bribery & corruption",
    terms: [
      "bribe", "bribery", "corrupt", "corruption",
      "abuse of power", "conflict of interest", "misuse of funds",
      "kleptocracy", "state capture",
    ],
  },
  {
    group: "terrorism-financing",
    label: "Terrorism & CFT",
    terms: [
      "terrorism", "terrorist", "terrorist financing",
      "financing of terrorism", "terror funding",
      "extremist", "radicalisation", "radicalization",
      "designated terrorist", "militant",
    ],
  },
  {
    group: "proliferation-wmd",
    label: "Proliferation financing & WMD",
    terms: [
      "proliferation financing",
      "weapons of mass destruction", "wmd",
      "dual-use", "dual use",
      "sanctions evasion", "sanction evasion",
      "arms trafficking", "weapons smuggling",
      "nuclear", "chemical weapons", "biological weapons",
    ],
  },
  {
    group: "organised-crime",
    label: "Organised crime & narcotics",
    terms: [
      "organised crime", "organized crime",
      "drug trafficking", "narcotics", "cartel", "mafia",
    ],
  },
  {
    group: "human-trafficking",
    label: "Human trafficking & slavery",
    terms: [
      "human trafficking", "people smuggling",
      "forced labour", "forced labor",
      "modern slavery", "child labor", "child labour",
      "wildlife trafficking",
    ],
  },
  {
    group: "cybercrime",
    label: "Cybercrime",
    terms: [
      "cybercrime", "cyber crime", "ransomware", "darknet", "dark web",
      "cyber fraud", "wire fraud",
    ],
  },
  {
    group: "fraud-forgery",
    label: "Fraud & forgery",
    terms: [
      "fraud", "ponzi", "pyramid scheme",
      "accounting fraud", "forgery", "counterfeiting", "identity theft",
    ],
  },
  {
    group: "tax-crime",
    label: "Tax crime",
    terms: [
      "tax evasion", "tax fraud", "vat fraud",
    ],
  },
  {
    group: "market-abuse",
    label: "Market abuse",
    terms: [
      "insider trading", "market manipulation",
    ],
  },
  {
    group: "law-enforcement",
    label: "Law-enforcement & judicial",
    terms: [
      "arrest", "arrested", "blackmail", "convict", "convicted",
      "court case", "felon", "felony", "fined", "guilty",
      "illegal", "imprisonment", "jail", "jailed",
      "litigate", "litigation",
      "murder", "prosecute", "prosecuted", "prosecution",
      "theft", "unlawful", "verdict",
    ],
  },
  {
    group: "regulatory-action",
    label: "Regulatory action & sanctions",
    terms: [
      "sanctions", "sanctioned",
      "debarred", "debarment", "blacklisted", "blacklist",
      "regulatory breach", "breach",
    ],
  },
  {
    group: "political-exposure",
    label: "Political exposure",
    terms: [
      "politic", "political", "politician",
    ],
  },
];

export interface AdverseKeywordHit {
  group: AdverseKeywordGroup;
  groupLabel: string;
  term: string;
  offset: number;
}

export function classifyAdverseKeywords(
  text: string | null | undefined,
): AdverseKeywordHit[] {
  if (!text) return [];
  const hay = text.toLowerCase();
  const out: AdverseKeywordHit[] = [];
  const seen = new Set<string>();
  for (const rule of ADVERSE_KEYWORDS) {
    for (const term of rule.terms) {
      const idx = hay.indexOf(term);
      if (idx === -1) continue;
      const key = `${rule.group}:${term}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        group: rule.group,
        groupLabel: rule.label,
        term,
        offset: idx,
      });
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

// Groups that fire in this set of hits, with their hit counts.
export function adverseKeywordGroupCounts(
  hits: readonly AdverseKeywordHit[],
): Array<{ group: AdverseKeywordGroup; label: string; count: number }> {
  const map = new Map<AdverseKeywordGroup, { label: string; count: number }>();
  for (const h of hits) {
    const prev = map.get(h.group);
    if (prev) prev.count += 1;
    else map.set(h.group, { label: h.groupLabel, count: 1 });
  }
  return Array.from(map.entries()).map(([group, v]) => ({
    group,
    label: v.label,
    count: v.count,
  }));
}
