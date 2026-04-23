// Hawkeye Sterling — known-entity fixtures.
//
// Name-based lookups applied inside /api/super-brain so subjects that are
// household-name PEPs or well-documented adverse-media subjects still flag
// even when no roleText is supplied and the Google News feed is unreachable.
// This is a deliberately small, auditable list — NOT a replacement for live
// PEP / adverse-media data. It ensures demo subjects render a realistic
// posture on first load.

export interface KnownPEP {
  names: string[];          // aliases, all lowercase, trim
  tier:
    | "tier_1_head_of_state_or_gov"
    | "tier_2_senior_political_judicial_military"
    | "tier_3_state_owned_enterprise_exec"
    | "tier_4_party_official_senior_civil_servant"
    | "family"
    | "close_associate";
  role: string;              // synthetic role text (fed into assessPEP)
  rationale: string;         // human-readable
  jurisdiction?: string;     // ISO2
}

export interface KnownAdverse {
  names: string[];
  categories: Array<{ categoryId: string; keyword: string }>;
  keywords: string[];        // feeds the adverse-keyword classifier
  rationale: string;
}

const PEPS: KnownPEP[] = [
  {
    names: ["donald trump", "donald j trump", "donald j. trump", "president trump"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of the United States — head of state and head of government",
    rationale:
      "Serving head of state / head of government — FATF tier-1 PEP (foreign PEP in UAE context).",
    jurisdiction: "US",
  },
  {
    names: ["joe biden", "joseph biden", "joseph r biden"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former President of the United States — head of state",
    rationale: "Former head of state — FATF PEP status retained for 12+ months post-office.",
    jurisdiction: "US",
  },
  {
    names: ["vladimir putin"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of the Russian Federation — head of state",
    rationale: "Serving head of state — sanctioned jurisdiction, CAHRA-relevant.",
    jurisdiction: "RU",
  },
  {
    names: ["recep tayyip erdogan", "erdogan"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of Turkey — head of state and head of government",
    rationale: "Serving head of state.",
    jurisdiction: "TR",
  },
  {
    names: [
      "mohammed bin rashid al maktoum",
      "sheikh mohammed bin rashid",
      "sheikh mohammed",
    ],
    tier: "tier_1_head_of_state_or_gov",
    role: "Prime Minister and Vice President of the UAE — Ruler of Dubai",
    rationale: "Serving head of government (UAE) — domestic PEP.",
    jurisdiction: "AE",
  },
  {
    names: ["mohammed bin salman", "mbs"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Crown Prince and Prime Minister of Saudi Arabia",
    rationale: "Serving head of government (SA).",
    jurisdiction: "SA",
  },
];

const ADVERSE: KnownAdverse[] = [
  {
    names: ["ozcan halac", "özcan halaç", "ozcan halaç"],
    categories: [
      { categoryId: "corruption_organised_crime", keyword: "investigation" },
      { categoryId: "legal_criminal_regulatory", keyword: "proceedings" },
    ],
    keywords: ["investigation", "alleged", "proceedings"],
    rationale:
      "Subject name appears in open-source adverse-media coverage — requires analyst review and live news corroboration.",
  },
];

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function lookupKnownPEP(name: string): KnownPEP | null {
  const q = norm(name);
  if (!q) return null;
  for (const p of PEPS) {
    for (const alias of p.names) {
      if (norm(alias) === q) return p;
    }
  }
  return null;
}

export function lookupKnownAdverse(name: string): KnownAdverse | null {
  const q = norm(name);
  if (!q) return null;
  for (const a of ADVERSE) {
    for (const alias of a.names) {
      if (norm(alias) === q) return a;
    }
  }
  return null;
}
