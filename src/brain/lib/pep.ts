// Hawkeye Sterling — PEP heuristic library.
// Role-based detection, FATF tier classification, family / close-associate
// enrichment cues. Applied to subject + supplied evidence.

export type PEPTier =
  | 'tier_1_head_of_state_or_gov'
  | 'tier_2_senior_political_judicial_military'
  | 'tier_3_state_owned_enterprise_exec'
  | 'tier_4_party_official_senior_civil_servant'
  | 'family'
  | 'close_associate'
  | 'none';

interface RoleMatcher {
  pattern: RegExp;
  tier: PEPTier;
  label: string;
}

const ROLE_MATCHERS: RoleMatcher[] = [
  // Tier 1 — heads of state / government
  { pattern: /\b(president|prime minister|pm|chancellor|monarch|king|queen|sultan|emir|sheikh|crown prince|first lady|first gentleman|head of state|head of government)\b/i, tier: 'tier_1_head_of_state_or_gov', label: 'head of state/government' },
  // Tier 2 — senior political / judicial / military
  { pattern: /\b(minister|secretary of state|cabinet|senator|member of parliament|mp|congress(?:man|woman)?|representative|governor|mayor of (?:capital|major city)|ambassador|high commissioner)\b/i, tier: 'tier_2_senior_political_judicial_military', label: 'minister / legislator / ambassador' },
  { pattern: /\b(chief justice|supreme court (?:justice|judge)|constitutional court|attorney general|prosecutor general|solicitor general)\b/i, tier: 'tier_2_senior_political_judicial_military', label: 'senior judicial' },
  { pattern: /\b(chief of (?:staff|defence|army|navy|air force)|general|field marshal|admiral|chief marshal|commander-in-chief|joint chiefs)\b/i, tier: 'tier_2_senior_political_judicial_military', label: 'senior military' },
  { pattern: /\b(central bank governor|central bank deputy governor|reserve bank governor|monetary authority chair)\b/i, tier: 'tier_2_senior_political_judicial_military', label: 'central bank leadership' },
  // Tier 3 — SOE executive
  { pattern: /\b((?:state[- ]owned|state-controlled|sovereign|parastatal|public sector)\s+(?:enterprise|company|firm|corporation|bank|utility|oil|gas|mining|port|airline|telecom)|soe|sovereign wealth|npc)\b/i, tier: 'tier_3_state_owned_enterprise_exec', label: 'state-owned enterprise' },
  { pattern: /\b(ceo|chief executive|chairman|chair|board member|director general|managing director|deputy ceo)\b.*\b(state|sovereign|parastatal|government|ministry)\b/i, tier: 'tier_3_state_owned_enterprise_exec', label: 'SOE C-suite' },
  // Tier 4 — party official / senior civil servant
  { pattern: /\b(party (?:chair|secretary|leader|central committee|politburo)|secretary[- ]general|central committee|politburo|permanent secretary|principal secretary|chief secretary|director general \(government\))\b/i, tier: 'tier_4_party_official_senior_civil_servant', label: 'party / senior civil servant' },
  { pattern: /\b(international organi[sz]ation executive|un under-secretary|imf|world bank|oecd secretary|wto director|fatf president)\b/i, tier: 'tier_4_party_official_senior_civil_servant', label: 'IGO senior' },
  // Family / close associates
  { pattern: /\b(son|daughter|spouse|wife|husband|partner|sibling|brother|sister|father|mother|in-law) of (?:a |the )?(president|prime minister|minister|sheikh|emir|king|queen|governor|mp|senator)\b/i, tier: 'family', label: 'family of PEP' },
  { pattern: /\b(close associate|business partner|known collaborator|confidant|ally) of (?:a |the )?(president|prime minister|minister|sheikh|emir|king|queen|governor|mp|senator)\b/i, tier: 'close_associate', label: 'close associate of PEP' },
];

const TIER_WEIGHTS: Record<PEPTier, number> = {
  tier_1_head_of_state_or_gov: 1.0,
  tier_2_senior_political_judicial_military: 0.85,
  tier_3_state_owned_enterprise_exec: 0.7,
  tier_4_party_official_senior_civil_servant: 0.6,
  family: 0.7,
  close_associate: 0.65,
  none: 0,
};

export interface PEPAssessment {
  isLikelyPEP: boolean;
  highestTier: PEPTier;
  matchedRoles: Array<{ tier: PEPTier; label: string; snippet: string }>;
  riskScore: number;  // 0..1
}

const MAX_PEP_CHARS = 50_000;

export function assessPEP(freeText: string, subjectName = ''): PEPAssessment {
  const haystack = `${subjectName}\n${freeText}`.slice(0, MAX_PEP_CHARS);
  const matched: PEPAssessment['matchedRoles'] = [];
  for (const rm of ROLE_MATCHERS) {
    const m = rm.pattern.exec(haystack);
    if (m) {
      const start = Math.max(0, (m.index ?? 0) - 24);
      const end = Math.min(haystack.length, (m.index ?? 0) + m[0].length + 24);
      matched.push({ tier: rm.tier, label: rm.label, snippet: haystack.slice(start, end).replace(/\s+/g, ' ').trim() });
    }
  }
  if (matched.length === 0) {
    return { isLikelyPEP: false, highestTier: 'none', matchedRoles: [], riskScore: 0 };
  }
  const highestTier = matched.reduce((best, r) =>
    TIER_WEIGHTS[r.tier] > TIER_WEIGHTS[best] ? r.tier : best, matched[0]?.tier ?? 'none');
  return {
    isLikelyPEP: true,
    highestTier,
    matchedRoles: matched.slice(0, 10),
    riskScore: TIER_WEIGHTS[highestTier],
  };
}
