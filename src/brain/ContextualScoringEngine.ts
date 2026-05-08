// Hawkeye Sterling — contextual scoring engine.
// Adjusts raw fuzzy-match scores based on entity type, jurisdiction,
// sanctions list, and data completeness. Weights change dynamically
// so a partial name match against an OFAC SDN entity in a high-risk
// jurisdiction scores significantly higher than the same match against
// a domestic watchlist entry.
//
// Principle: context disambiguates. A 0.82 Jaro-Winkler score means
// different things depending on whether the candidate is an IRGC officer
// or a domestic traffic offender.

// ── Jurisdiction risk tiers ───────────────────────────────────────────────────

const HIGH_RISK_JURISDICTIONS = new Set([
  // FATF black list
  'KP', 'IR', 'MM',
  // FATF grey list (as of 2025)
  'AF', 'AL', 'BB', 'BF', 'CM', 'CF', 'CG', 'CU', 'ET', 'HT', 'JM', 'LY',
  'ML', 'MZ', 'NG', 'PK', 'PA', 'PH', 'RU', 'SN', 'SS', 'SY', 'TZ', 'TN',
  'UG', 'AE_GREY', 'VN', 'YE',
  // Sanctioned jurisdictions
  'BY', 'VE', 'ZW', 'CD', 'SO', 'SD',
]);

const MEDIUM_RISK_JURISDICTIONS = new Set([
  'TR', 'UA', 'KZ', 'UZ', 'TJ', 'TM', 'KG', 'AZ', 'AM', 'GE',
  'MD', 'RS', 'MK', 'BA', 'AL', 'ME', 'XK',
  'EG', 'MA', 'DZ', 'TN', 'LB', 'JO', 'IQ',
]);

// ── Sanctions list weight multipliers ────────────────────────────────────────

const SANCTIONS_LIST_WEIGHT: Record<string, number> = {
  // Highest — primary international designations
  'ofac_sdn': 1.40,
  'ofac-sdn': 1.40,
  'un_consolidated': 1.35,
  'un-consolidated': 1.35,
  'eu_consolidated': 1.25,
  'eu-consolidated': 1.25,
  // Secondary
  'uk_ofsi': 1.20,
  'uk-ofsi': 1.20,
  'ofac_cons': 1.15,
  'ofac-cons': 1.15,
  'uae_local': 1.10,
  'uae-local': 1.10,
  // Tertiary / regional
  'interpol_red': 1.30,
  'interpol-red': 1.30,
  'fatf_blacklist': 1.35,
  // PEP lists
  'pep_tier1': 1.15,
  'pep_tier2': 1.08,
  'pep_tier3': 1.05,
  // Default unknown list
  'unknown': 1.00,
};

// ── Entity type sensitivity ───────────────────────────────────────────────────

const ENTITY_TYPE_SENSITIVITY: Record<string, number> = {
  // Individuals on sanctions lists are highest priority — lower threshold for match
  'individual': 1.10,
  // Organisations can have many aliases and transliterations
  'organisation': 1.05,
  'vessel': 1.15,    // vessels are frequently flagged to evade sanctions
  'aircraft': 1.15,
  'other': 1.00,
};

// ── Booster conditions ────────────────────────────────────────────────────────

export interface ContextualInput {
  entityType: 'individual' | 'organisation' | 'vessel' | 'aircraft' | 'other';
  jurisdiction?: string;           // ISO 3166-1 alpha-2 of subject or candidate
  sanctionsList?: string;          // list id the candidate appears on
  dataCompleteness: number;        // 0..1 — how complete is the subject's data
  hasNativeScript?: boolean;       // subject has native-script name
  hasPhoneticAgreement?: boolean;  // phonetic algorithms agreed
  hasIdentifierOverlap?: boolean;  // shared passport/ID
  hasAddressOverlap?: boolean;     // shared registered address
  hasDobMatch?: boolean;           // date of birth matches
  isHighProfileProgram?: boolean;  // e.g., IRAN, DPRK, RUSSIA sanctions programs
}

export interface ContextualScoreResult {
  rawScore: number;
  adjustedScore: number;
  boosters: string[];
  penalties: string[];
  jurisdictionTier: 'high' | 'medium' | 'low' | 'unknown';
  listWeight: number;
  entitySensitivity: number;
  effectiveThreshold: number;   // adjusted threshold below which the match is discarded
}

// ── Scoring function ──────────────────────────────────────────────────────────

export function scoreContextual(
  rawScore: number,
  ctx: ContextualInput,
): ContextualScoreResult {
  const boosters: string[] = [];
  const penalties: string[] = [];

  let score = rawScore;

  // 1. Jurisdiction risk
  const jur = (ctx.jurisdiction ?? '').toUpperCase();
  let jurisdictionTier: 'high' | 'medium' | 'low' | 'unknown' = 'unknown';
  if (jur) {
    if (HIGH_RISK_JURISDICTIONS.has(jur)) {
      score += 0.05;
      boosters.push(`High-risk jurisdiction (${jur}): +0.05`);
      jurisdictionTier = 'high';
    } else if (MEDIUM_RISK_JURISDICTIONS.has(jur)) {
      score += 0.02;
      boosters.push(`Medium-risk jurisdiction (${jur}): +0.02`);
      jurisdictionTier = 'medium';
    } else {
      jurisdictionTier = 'low';
    }
  }

  // 2. Sanctions list weight
  const listKey = (ctx.sanctionsList ?? 'unknown').toLowerCase().replace(/\s+/g, '_');
  const listWeight = SANCTIONS_LIST_WEIGHT[listKey] ?? SANCTIONS_LIST_WEIGHT['unknown']!;
  if (listWeight > 1.0) {
    const boost = (listWeight - 1.0) * rawScore * 0.15;
    score += boost;
    boosters.push(`${listKey} list weight (${listWeight.toFixed(2)}): +${boost.toFixed(3)}`);
  }

  // 3. Entity type sensitivity
  const entitySensitivity = ENTITY_TYPE_SENSITIVITY[ctx.entityType] ?? 1.0;
  if (entitySensitivity > 1.0) {
    const boost = (entitySensitivity - 1.0) * rawScore * 0.10;
    score += boost;
    boosters.push(`${ctx.entityType} entity type sensitivity (${entitySensitivity.toFixed(2)}): +${boost.toFixed(3)}`);
  }

  // 4. High-profile program bonus
  if (ctx.isHighProfileProgram) {
    score += 0.04;
    boosters.push('High-profile sanctions program (IRAN/DPRK/RUSSIA): +0.04');
  }

  // 5. Phonetic agreement bonus
  if (ctx.hasPhoneticAgreement) {
    score += 0.03;
    boosters.push('Phonetic agreement across algorithms: +0.03');
  }

  // 6. Native script corroboration bonus
  if (ctx.hasNativeScript) {
    score += 0.03;
    boosters.push('Native-script name present: +0.03');
  }

  // 7. Identifier overlap bonus (strong)
  if (ctx.hasIdentifierOverlap) {
    score += 0.15;
    boosters.push('Shared identifier (passport/ID): +0.15');
  }

  // 8. DOB match bonus
  if (ctx.hasDobMatch) {
    score += 0.10;
    boosters.push('Date of birth match: +0.10');
  }

  // 9. Address overlap
  if (ctx.hasAddressOverlap) {
    score += 0.05;
    boosters.push('Registered address overlap: +0.05');
  }

  // 10. Data incompleteness penalty
  if (ctx.dataCompleteness < 0.4) {
    const penalty = (0.4 - ctx.dataCompleteness) * 0.10;
    score -= penalty;
    penalties.push(`Low data completeness (${(ctx.dataCompleteness * 100).toFixed(0)}%): -${penalty.toFixed(3)}`);
  }

  // Clamp to [0, 1]
  score = Math.min(1, Math.max(0, score));

  // Effective threshold: lower for high-risk contexts (catch more)
  let effectiveThreshold = 0.75;
  if (jurisdictionTier === 'high' || ctx.isHighProfileProgram) effectiveThreshold = 0.65;
  else if (jurisdictionTier === 'medium') effectiveThreshold = 0.70;
  if (ctx.hasIdentifierOverlap) effectiveThreshold = 0.50;

  return {
    rawScore,
    adjustedScore: score,
    boosters,
    penalties,
    jurisdictionTier,
    listWeight,
    entitySensitivity,
    effectiveThreshold,
  };
}

// ── Dynamic weight profile for different screening contexts ───────────────────

export interface ContextualWeightProfile {
  name: string;
  fuzzyWeight: number;
  phoneticWeight: number;
  identifierWeight: number;
  dobWeight: number;
  jurisdictionWeight: number;
  listWeight: number;
}

export const WEIGHT_PROFILES: Record<string, ContextualWeightProfile> = {
  ofac_sdn_individual: {
    name: 'OFAC SDN Individual',
    fuzzyWeight: 0.30,
    phoneticWeight: 0.15,
    identifierWeight: 0.25,
    dobWeight: 0.15,
    jurisdictionWeight: 0.10,
    listWeight: 0.05,
  },
  un_consolidated_entity: {
    name: 'UN Consolidated Entity',
    fuzzyWeight: 0.35,
    phoneticWeight: 0.10,
    identifierWeight: 0.30,
    dobWeight: 0.05,
    jurisdictionWeight: 0.12,
    listWeight: 0.08,
  },
  pep_monitoring: {
    name: 'PEP Monitoring',
    fuzzyWeight: 0.40,
    phoneticWeight: 0.10,
    identifierWeight: 0.20,
    dobWeight: 0.10,
    jurisdictionWeight: 0.15,
    listWeight: 0.05,
  },
  adverse_media_subject: {
    name: 'Adverse Media Subject',
    fuzzyWeight: 0.50,
    phoneticWeight: 0.15,
    identifierWeight: 0.10,
    dobWeight: 0.05,
    jurisdictionWeight: 0.10,
    listWeight: 0.10,
  },
  default: {
    name: 'Default',
    fuzzyWeight: 0.40,
    phoneticWeight: 0.15,
    identifierWeight: 0.20,
    dobWeight: 0.10,
    jurisdictionWeight: 0.10,
    listWeight: 0.05,
  },
};

export function selectWeightProfile(ctx: ContextualInput): ContextualWeightProfile {
  const list = (ctx.sanctionsList ?? '').toLowerCase();
  if (list.includes('sdn') && ctx.entityType === 'individual') return WEIGHT_PROFILES.ofac_sdn_individual!;
  if (list.includes('un')) return WEIGHT_PROFILES.un_consolidated_entity!;
  if (list.includes('pep')) return WEIGHT_PROFILES.pep_monitoring!;
  return WEIGHT_PROFILES.default!;
}
