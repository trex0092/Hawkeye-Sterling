// Hawkeye Sterling — onboarding deterministic risk-tier scorer.
//
// Replaces the inline `computeTier` from the onboarding wizard with a
// scorer that consumes the same registry / jurisdictional-lookup
// infrastructure the MLRO Advisor uses, so the wizard's tier output
// is consistent with what the Advisor and the audit log will say
// about the same subject. Pure; no I/O; no external feeds.
//
// Output: a Tier ∈ {tier-1, tier-2, tier-3} where tier-1 is highest
// risk (matching the existing UI colour map) plus a ranked list of
// contributing factors so the operator's chip row can show WHY this
// tier was chosen.

import {
  lookupCountry,
  type ListId,
} from './registry/jurisdictional-lookup.js';

export type OnboardingTier = 'tier-1' | 'tier-2' | 'tier-3';

export interface ScoredFactor {
  /** Stable id — e.g. 'screening_hit', 'fatf_listed', 'sof_thin'. */
  id: string;
  /** Human-readable label rendered as a chip. */
  label: string;
  /** Points contributed to the composite score. Always > 0. */
  points: number;
  /** Optional registry source id ('UAE-FIU-DNFBP-CIRCULAR-DPMS', etc.) */
  anchor?: string;
}

export interface OnboardingRiskInput {
  /** Free-text full name. */
  fullName?: string;
  /** ISO-3166 alpha-2. */
  nationalityIso2?: string;
  /** ISO-8601 date of birth, YYYY-MM-DD. */
  dob?: string;
  /** Free-text occupation. */
  occupation?: string;
  /** Free-text source-of-funds narrative. */
  sourceOfFunds?: string;
  /** Free-text expected-transaction-profile. */
  expectedProfile?: string;
  /** Free-text address. */
  address?: string;
  /** Screening hits captured at step 3 (≥ 0.85 score by default). */
  screeningHits?: Array<{ listId: string; candidateName: string; score: number }>;
  /** Optional clock injected for deterministic tests. */
  now?: Date;
}

export interface OnboardingRiskResult {
  tier: OnboardingTier;
  /** 0-100 composite — bucketed into tiers at the thresholds below. */
  score: number;
  /** Every factor that contributed, descending by points. */
  factors: ScoredFactor[];
  /** Concise rationale joined for the existing single-line UI. */
  rationale: string;
  /** Per-list jurisdictional hits surfaced for the chip row. */
  jurisdictionHits: Array<{ list: ListId; label: string; stale: boolean; classification?: 'grey' | 'black' }>;
}

const TIER_THRESHOLDS = {
  tier1Min: 50,
  tier2Min: 20,
};

// High-risk-country sectors that bump tier when present in occupation
// text. Curated against FATF/Wolfsberg DPMS guidance.
const HIGH_RISK_SECTOR_RX: RegExp[] = [
  /\b(?:gold|bullion|jewell?er|precious\s*metals?|dpms)\b/i,
  /\bdiamond|gemstone|kimberley\b/i,
  /\bcrypto|virtual\s*asset|vasp|exchange|wallet\b/i,
  /\bcasino|gambling|sports\s*bet\b/i,
  /\bmoney\s*service\s*business|\bmsb\b|hawala|remittance\b/i,
  /\bweapons?|firearms|defen[cs]e|munitions\b/i,
];

const PEP_KEYWORD_RX: RegExp[] = [
  /\b(?:minister|senator|governor|ambassador|judge|head\s+of\s+state|prime\s+minister|president)\b/i,
  /\b(?:central\s*bank|state[- ]owned|sovereign\s*wealth)\b/i,
  /\b(?:senior\s+political|political\s+party)\b/i,
];

const SUSPICIOUS_OCCUPATION_RX: RegExp[] = [
  /\b(?:retired|unemployed|student|housewife)\b/i, // mismatch with high-value flow
  /\b(?:consultant|investor|entrepreneur)\b/i,     // generic, often a cover
];

// Score caps so a single axis can't dominate.
const PER_AXIS_CAP = 50;

export function classifyOnboardingRiskTier(input: OnboardingRiskInput): OnboardingRiskResult {
  const factors: ScoredFactor[] = [];
  const jurisdictionHits: OnboardingRiskResult['jurisdictionHits'] = [];

  // Axis 1 — screening hits.
  const hits = input.screeningHits ?? [];
  if (hits.length > 0) {
    const hitPts = Math.min(PER_AXIS_CAP, hits.length * 30);
    const labels = hits
      .slice(0, 3)
      .map((h) => `${h.listId} (${Math.round(h.score * 100)}%)`)
      .join(', ');
    factors.push({
      id: 'screening_hit',
      label: `${hits.length} screening hit(s) — ${labels}`,
      points: hitPts,
      anchor: 'FATF-R10',
    });
  }

  // Axis 2 — jurisdiction (uses the Layer-6 five-list lookup).
  const iso = (input.nationalityIso2 ?? '').toUpperCase().slice(0, 2);
  if (iso.length === 2) {
    const lookup = lookupCountry(iso, iso, input.now ?? new Date());
    let jurisdictionPts = 0;
    for (const h of lookup.hits) {
      jurisdictionHits.push({
        list: h.list,
        label: h.label,
        stale: h.stale,
        ...(h.classification ? { classification: h.classification } : {}),
      });
      // Black-listed = highest weight; grey = medium; otherwise small.
      if (h.classification === 'black') jurisdictionPts = Math.max(jurisdictionPts, 40);
      else if (h.classification === 'grey') jurisdictionPts = Math.max(jurisdictionPts, 20);
      else if (h.list === 'OFAC_SDN' || h.list === 'UNSC_consolidated') jurisdictionPts = Math.max(jurisdictionPts, 30);
      else if (h.list === 'CAHRA_OECD') jurisdictionPts = Math.max(jurisdictionPts, 25);
      else jurisdictionPts = Math.max(jurisdictionPts, 10);
    }
    if (jurisdictionPts > 0) {
      factors.push({
        id: 'jurisdiction',
        label: `${iso} on ${lookup.hits.length} list(s) — ${lookup.hits.map((h) => h.list).join(', ')}`,
        points: jurisdictionPts,
        anchor: 'FATF-R19',
      });
    }
  }

  // Axis 3 — PEP signal in name + occupation text.
  const nameOccText = `${input.fullName ?? ''} ${input.occupation ?? ''}`;
  if (PEP_KEYWORD_RX.some((rx) => rx.test(nameOccText))) {
    factors.push({
      id: 'pep_signal',
      label: 'PEP / public-function language detected — apply FATF R.12 EDD',
      points: 25,
      anchor: 'FATF-R12',
    });
  }

  // Axis 4 — source-of-funds narrative depth.
  const sof = (input.sourceOfFunds ?? '').trim();
  const sofWords = sof.split(/\s+/).filter(Boolean).length;
  if (sof.length === 0) {
    factors.push({ id: 'sof_missing', label: 'Source-of-funds missing entirely', points: 20, anchor: 'FATF-R10' });
  } else if (sofWords < 10) {
    factors.push({ id: 'sof_thin', label: `Source-of-funds narrative thin (${sofWords} word(s))`, points: 15, anchor: 'FATF-R10' });
  } else if (sofWords > 60 && /\bcash\b/i.test(sof)) {
    // Long but cash-heavy narratives are a known evasion pattern.
    factors.push({ id: 'sof_cash_heavy', label: 'Source-of-funds heavy in cash references', points: 10, anchor: 'FATF-R10' });
  }

  // Axis 5 — expected profile inconsistency.
  const expected = (input.expectedProfile ?? '').trim();
  if (expected.length === 0) {
    factors.push({ id: 'expected_missing', label: 'Expected transaction profile missing', points: 10, anchor: 'FATF-R10' });
  }

  // Axis 6 — high-risk sector via occupation text.
  const occ = input.occupation ?? '';
  const hrcSectorMatch = HIGH_RISK_SECTOR_RX.find((rx) => rx.test(occ));
  if (hrcSectorMatch) {
    factors.push({
      id: 'hrc_sector',
      label: `High-risk sector indicator in occupation`,
      points: 15,
      anchor: 'WOLFSBERG-DPMS',
    });
  }

  // Axis 7 — suspicious occupation (generic / mismatched).
  if (SUSPICIOUS_OCCUPATION_RX.some((rx) => rx.test(occ))) {
    factors.push({
      id: 'occupation_generic',
      label: 'Generic / mismatched occupation — verify with documents',
      points: 5,
      anchor: 'FATF-R10',
    });
  }

  // Axis 8 — proxy / age-based.
  if (input.dob && /^\d{4}-\d{2}-\d{2}$/.test(input.dob)) {
    const dobYear = parseInt(input.dob.slice(0, 4), 10);
    if (Number.isFinite(dobYear)) {
      const now = input.now ?? new Date();
      const age = now.getUTCFullYear() - dobYear;
      if (age >= 80) {
        factors.push({ id: 'elderly_proxy_risk', label: `Subject age ≥ 80 — verify presence of EPA / proxy controls`, points: 5 });
      } else if (age < 18) {
        factors.push({ id: 'minor', label: 'Subject is a minor — escalate to senior review', points: 30 });
      }
    }
  }

  // Compose score (sum of factors, capped at 100).
  const rawScore = factors.reduce((acc, f) => acc + f.points, 0);
  const score = Math.min(100, rawScore);

  // Tier from score thresholds.
  const tier: OnboardingTier =
    score >= TIER_THRESHOLDS.tier1Min ? 'tier-1' : score >= TIER_THRESHOLDS.tier2Min ? 'tier-2' : 'tier-3';

  factors.sort((a, b) => b.points - a.points);

  const rationale =
    factors.length === 0
      ? 'Standard customer — no elevated indicators across screening, jurisdiction, PEP signal, SoF depth, sector, or demographics.'
      : factors
          .slice(0, 4)
          .map((f) => f.label)
          .join('; ');

  return { tier, score, factors, rationale, jurisdictionHits };
}
