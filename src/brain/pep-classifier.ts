// Hawkeye Sterling — PEP role classifier.
// Classifies a role description into PEP tier + PEP type + salience. Used to
// decide the EDD regime and review cadence. Never asserts PEP status from
// training data alone (P8); inputs must come from a verifiable source (World-
// Check, OpenSanctions, or an authoritative registry).

export type PepTier = 'national' | 'supra_national' | 'sub_national' | 'regional_org' | 'international_org';
export type PepType =
  | 'state_leader'
  | 'minister'
  | 'deputy_minister'
  | 'parliamentarian'
  | 'judiciary_supreme'
  | 'judiciary_senior'
  | 'senior_military'
  | 'senior_police'
  | 'senior_security'
  | 'ambassador'
  | 'soe_executive'
  | 'central_bank_senior'
  | 'party_official'
  | 'regulator_senior'
  | 'sovereign_wealth_executive'
  | 'regional_official'
  | 'international_official'
  | 'former_pep'
  | 'rca_family'
  | 'rca_associate'
  | 'not_pep';

export interface PepClassification {
  role: string;
  tier: PepTier | null;
  type: PepType;
  salience: number; // 0..1
  matchedRule?: string;
  rationale: string;
}

interface Rule {
  id: string;
  rx: RegExp;
  tier: PepTier;
  type: PepType;
  salience: number;
}

const RULES: Rule[] = [
  { id: 'pres_pm', rx: /\b(president|prime minister|vice[- ]president|deputy prime minister)\b/i, tier: 'national', type: 'state_leader', salience: 1 },
  { id: 'monarch', rx: /\b(king|queen|emir|sultan|sheikh|crown prince)\b/i, tier: 'national', type: 'state_leader', salience: 1 },
  { id: 'minister', rx: /\bminister\b/i, tier: 'national', type: 'minister', salience: 0.9 },
  { id: 'deputy_minister', rx: /\b(deputy minister|vice minister|state secretary)\b/i, tier: 'national', type: 'deputy_minister', salience: 0.85 },
  { id: 'mp', rx: /\b(member of parliament|senator|congressman|congresswoman|deputy|MP)\b/i, tier: 'national', type: 'parliamentarian', salience: 0.7 },
  { id: 'supreme_judge', rx: /\b(chief justice|supreme court judge|constitutional court judge)\b/i, tier: 'national', type: 'judiciary_supreme', salience: 0.95 },
  { id: 'senior_judge', rx: /\b(appeal(s)? court judge|high court judge)\b/i, tier: 'national', type: 'judiciary_senior', salience: 0.8 },
  { id: 'military_chief', rx: /\b(general|admiral|air marshal|chief of staff|commander[- ]in[- ]chief|chief of defence)\b/i, tier: 'national', type: 'senior_military', salience: 0.9 },
  { id: 'police_chief', rx: /\b(chief of police|police commissioner|inspector general of police)\b/i, tier: 'national', type: 'senior_police', salience: 0.85 },
  { id: 'intel_chief', rx: /\b(intelligence chief|director general of (security|intelligence)|NSA|CIA|MI[56])\b/i, tier: 'national', type: 'senior_security', salience: 0.9 },
  { id: 'ambassador', rx: /\b(ambassador|high commissioner|chargé d’affaires|charge d'affaires)\b/i, tier: 'national', type: 'ambassador', salience: 0.75 },
  { id: 'soe', rx: /\b(ceo|chairman|chairperson|managing director) of (the )?(state[- ]owned|public|sovereign|national) (enterprise|company|bank|oil)\b/i, tier: 'national', type: 'soe_executive', salience: 0.8 },
  { id: 'central_bank', rx: /\b(governor|deputy governor|board member) of (the )?central bank\b/i, tier: 'national', type: 'central_bank_senior', salience: 0.95 },
  { id: 'party_official', rx: /\b(party (general )?secretary|politburo member|party central committee)\b/i, tier: 'national', type: 'party_official', salience: 0.9 },
  { id: 'swf_exec', rx: /\b(chief executive|chairman|chairperson) of .*(sovereign wealth fund|investment authority|PIF|ADIA|GIC|Mubadala)\b/i, tier: 'national', type: 'sovereign_wealth_executive', salience: 0.85 },
  { id: 'regulator', rx: /\b(chairman|chairperson|commissioner|director general) of .*(regulator|authority|commission)\b/i, tier: 'national', type: 'regulator_senior', salience: 0.7 },
  { id: 'regional', rx: /\b(governor|mayor|emirate ruler|provincial premier|state premier)\b/i, tier: 'sub_national', type: 'regional_official', salience: 0.6 },
  { id: 'int_org', rx: /\b(secretary[- ]general|director[- ]general|commissioner|undersecretary).*(united nations|UN|IMF|World Bank|WHO|WTO|OECD|IAEA|UNESCO|UNHCR)\b/i, tier: 'international_org', salience: 0.8, type: 'international_official' },
  { id: 'regional_org', rx: /\b(GCC|Arab League|African Union|AU|ASEAN|EU Commission|EU Council)\b/i, tier: 'regional_org', type: 'regional_official', salience: 0.7 },
];

const RCA_FAMILY = /\b(spouse|husband|wife|son|daughter|father|mother|brother|sister|sibling|parent|child|in[- ]law|step[- ](son|daughter|mother|father))\b/i;
const RCA_ASSOCIATE = /\b(close associate|business partner|advisor|lawyer|fixer|accountant|personal assistant|bodyguard)\b/i;
const FORMER = /\bformer\b/i;

export function classifyPepRole(role: string): PepClassification {
  if (!role || !role.trim()) {
    return { role, tier: null, type: 'not_pep', salience: 0, rationale: 'empty role string' };
  }
  const r = role.trim();

  if (RCA_FAMILY.test(r)) {
    return { role, tier: null, type: 'rca_family', salience: 0.6, matchedRule: 'rca_family', rationale: 'Detected family relationship language.' };
  }
  if (RCA_ASSOCIATE.test(r)) {
    return { role, tier: null, type: 'rca_associate', salience: 0.5, matchedRule: 'rca_associate', rationale: 'Detected close-associate language.' };
  }

  for (const rule of RULES) {
    if (rule.rx.test(r)) {
      const isFormer = FORMER.test(r);
      return {
        role,
        tier: rule.tier,
        type: isFormer ? 'former_pep' : rule.type,
        salience: isFormer ? Math.max(0, rule.salience - 0.2) : rule.salience,
        matchedRule: rule.id,
        rationale: `Matched rule ${rule.id}${isFormer ? ' (former)' : ''}.`,
      };
    }
  }

  return { role, tier: null, type: 'not_pep', salience: 0, rationale: 'No PEP rule matched.' };
}
