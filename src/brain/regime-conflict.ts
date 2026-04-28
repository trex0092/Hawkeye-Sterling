// Hawkeye Sterling — cross-regime conflict resolver.
//
// When a subject is screened against multiple sanctions regimes (UN, OFAC,
// EU, OFSI, UAE EOCN, …) the verdicts can disagree: one regime designates
// the subject, another shows no hit, a third is silent.  The fusion layer
// already aggregates findings by self-reported confidence; this resolver
// adds the missing dimension — REGIME PRIMACY in the UAE supervisory
// context. The output is a primacy-weighted aggregate score plus an
// explanation trace the MLRO can cite verbatim.
//
// Primacy ordering for a UAE Reporting Entity follows Cabinet Decision
// 74/2020 + UAE FDL 10/2025 Art.24 — UN consolidated and UAE EOCN are
// mandatory primary obligations; OFAC / EU / UK secondary obligations
// flow from US-correspondent / EU / UK-counterparty exposure. Other G7-
// equivalent regimes are corroborating signals.
//
// Charter principle: when regimes conflict, the higher-primacy designation
// wins UNLESS the lower-primacy regime carries strictly stronger evidence
// (per the evidence-weighted-fusion adjunct). This module never produces
// a legal conclusion — it produces a citable score and a reason chain.

import type { SanctionRegimeId } from './sanction-regimes.js';

export type RegimeStance = 'designated' | 'cleared' | 'silent';

export interface RegimeFinding {
  regime: SanctionRegimeId;
  stance: RegimeStance;
  /** Self-reported confidence in the stance, 0..1. A `cleared` stance
   *  with confidence 1 means the screen ran cleanly with no hit. */
  confidence: number;
  /** Optional source citation (list version, snapshot date, etc.) carried
   *  forward into the resolver's notes. */
  source?: string;
}

export interface RegimeConflictResolution {
  /** Aggregate "designation pressure" 0..1 after primacy weighting. 1 means
   *  the highest-primacy regime designates with full confidence; 0 means
   *  every regime cleared. */
  score: number;
  /** True iff there is a non-trivial primacy-weighted disagreement between
   *  regimes. Drives whether the MLRO must record an exception rationale. */
  conflict: boolean;
  /** Highest-primacy designation among the inputs (if any). */
  topDesignation?: SanctionRegimeId;
  /** Per-regime contributions, primacy×confidence weighted. */
  cited: Array<{
    regime: SanctionRegimeId;
    stance: RegimeStance;
    primacy: number;
    confidence: number;
    contribution: number;
  }>;
  notes: string[];
  methodology: string;
}

/** Primacy weights for a UAE Reporting Entity. Higher = stricter binding
 *  in UAE supervisory context. The values are deliberately coarse-grained
 *  so they survive minor legal-instrument refresh — calibrate at this
 *  layer, not in the regime catalogue. */
const PRIMACY: Readonly<Record<SanctionRegimeId, number>> = Object.freeze({
  // Tier 1 — UN consolidated and UAE national list are non-negotiable.
  un_1267: 1.00,
  un_1988: 1.00,
  un_dprk: 1.00,
  un_iran: 1.00,
  un_libya: 1.00,
  un_somalia: 1.00,
  un_mali: 1.00,
  uae_eocn: 1.00,
  uae_local_terrorist: 1.00,

  // Tier 2 — large-bloc autonomous regimes; binding when nexus exists.
  ofac_sdn: 0.85,
  ofac_cons: 0.80,
  ofac_capta: 0.80,
  ofac_13599: 0.80,
  ofac_ukraine_related: 0.80,
  eu_consolidated: 0.80,
  eu_russia: 0.80,
  eu_belarus: 0.80,
  eu_iran: 0.80,
  uk_ofsi: 0.80,
  uk_russia: 0.80,
  uk_belarus: 0.80,

  // Tier 3 — corroborating regimes; weighted into the verdict but never
  // the sole basis for a UAE designation.
  switzerland_fdfa: 0.65,
  canada_sema: 0.65,
  australia_dfat: 0.65,
  australia_russia: 0.65,
  japan_meti: 0.65,
  japan_mofa: 0.65,
  singapore_mas: 0.65,
  south_korea_mofa: 0.60,
  new_zealand_mfat: 0.55,
  norway_mfa: 0.55,
  liechtenstein_llv: 0.50,
});

const DEFAULT_PRIMACY = 0.50;

export function primacyOf(id: SanctionRegimeId): number {
  return PRIMACY[id] ?? DEFAULT_PRIMACY;
}

/** Resolve a set of regime findings into a primacy-weighted verdict.
 *  Pure function. No I/O. No mutation. */
export function resolveRegimeConflict(findings: readonly RegimeFinding[]): RegimeConflictResolution {
  const notes: string[] = [];
  if (findings.length === 0) {
    return {
      score: 0,
      conflict: false,
      cited: [],
      notes: ['No regime findings supplied; resolver returns score 0 (no signal).'],
      methodology: 'Regime conflict resolver: empty input.',
    };
  }

  const cited: RegimeConflictResolution['cited'] = [];
  let designatedSum = 0;
  let designatedWeight = 0;
  let clearedWeight = 0;
  let topPrimacy = -1;
  let topDesignation: SanctionRegimeId | undefined;

  for (const f of findings) {
    const conf = clamp01(f.confidence);
    const primacy = primacyOf(f.regime);
    const w = primacy * conf;
    let contribution = 0;
    if (f.stance === 'designated') {
      designatedSum += primacy * conf;
      designatedWeight += primacy;
      contribution = w;
      if (primacy > topPrimacy) {
        topPrimacy = primacy;
        topDesignation = f.regime;
      }
    } else if (f.stance === 'cleared') {
      clearedWeight += primacy * conf;
      contribution = -w;
    }
    cited.push({
      regime: f.regime,
      stance: f.stance,
      primacy: Number(primacy.toFixed(3)),
      confidence: Number(conf.toFixed(3)),
      contribution: Number(contribution.toFixed(4)),
    });
    if (f.source) notes.push(`${f.regime}: ${f.source}`);
  }

  // Aggregate score: primacy-weighted designations / total primacy in play.
  // `cleared` stances pull the score down toward 0; `silent` is ignored
  // (no signal). The designation half-life is the highest-primacy entry.
  const totalWeight = designatedWeight + (clearedWeight > 0 ? clearedWeight : 0);
  const rawScore = totalWeight > 0 ? designatedSum / totalWeight : 0;
  const score = clamp01(rawScore);

  // Conflict detection: at least one designation AND at least one cleared
  // stance AND their primacies are within 0.20 of each other (close call
  // requiring MLRO rationale).
  let conflict = false;
  const designations = findings.filter((f) => f.stance === 'designated');
  const clearings = findings.filter((f) => f.stance === 'cleared');
  if (designations.length > 0 && clearings.length > 0) {
    const dPrim = Math.max(...designations.map((d) => primacyOf(d.regime)));
    const cPrim = Math.max(...clearings.map((c) => primacyOf(c.regime)));
    if (Math.abs(dPrim - cPrim) <= 0.20) {
      conflict = true;
      notes.push(
        `Conflict: designation (max primacy ${dPrim.toFixed(2)}) and clearance (max primacy ${cPrim.toFixed(2)}) within 0.20 — MLRO must record exception rationale.`,
      );
    }
  }

  const methodology = [
    `Regime conflict resolver: ${findings.length} input(s).`,
    `Primacy-weighted designation pressure ${score.toFixed(3)}.`,
    topDesignation
      ? `Top designation: ${topDesignation} (primacy ${topPrimacy.toFixed(2)}).`
      : 'No designation found.',
    conflict ? 'Conflict flagged.' : 'No primacy-weighted conflict.',
  ].join(' ');

  return {
    score: Number(score.toFixed(4)),
    conflict,
    ...(topDesignation !== undefined ? { topDesignation } : {}),
    cited,
    notes,
    methodology,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
