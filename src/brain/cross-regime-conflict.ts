// Hawkeye Sterling — cross-regime conflict detector.
// Given a subject and the regimes that fired (UN / OFAC / EU / UK / UAE
// EOCN / UAE Local / CH / CA), surface where the regimes DISAGREE on the
// subject's status. Disagreement requires MLRO attention — not all
// regimes apply equally and the institution may need to adopt the
// stricter regime pending confirmation.

export type RegimeHit =
  | 'designated'       // subject is explicitly designated on this regime
  | 'delisted'         // subject was designated but has been delisted
  | 'not_designated'   // explicitly NOT on this regime
  | 'unknown'          // couldn't determine against this regime
  | 'partial_match';   // partial / possible match pending disambiguation

export interface RegimeStatus {
  regimeId: string;    // e.g. 'un_1267', 'ofac_sdn', 'eu_consolidated', 'uk_ofsi', 'uae_eocn'
  hit: RegimeHit;
  asOf: string;        // ISO 8601 list-version date
  sourceRef?: string;  // upstream reference
  program?: string;    // sanctions program, where applicable
  note?: string;
}

export interface CrossRegimeConflictReport {
  anyDesignated: boolean;
  unanimousDesignated: boolean;
  unanimousNotDesignated: boolean;
  split: boolean;
  mostRestrictive: RegimeStatus | null;
  leastRestrictive: RegimeStatus | null;
  conflicts: Array<{
    regimeA: string;
    regimeB: string;
    detail: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  partialMatchRegimes: string[];
  unknownRegimes: string[];
  staleRegimes: string[];   // list snapshot older than 7 days
  recommendedAction: 'block' | 'freeze' | 'escalate' | 'review' | 'proceed_with_scope_declaration';
  rationale: string[];
}

const RESTRICTIVENESS: Record<RegimeHit, number> = {
  designated: 4,
  partial_match: 3,
  unknown: 2,
  delisted: 1,
  not_designated: 0,
};

function stale(asOf: string, now: Date = new Date(), maxDays = 7): boolean {
  const t = Date.parse(asOf);
  if (Number.isNaN(t)) return true;
  return (now.getTime() - t) / 86_400_000 > maxDays;
}

export function detectCrossRegimeConflict(
  statuses: readonly RegimeStatus[],
  opts: { now?: Date; stalenessMaxDays?: number } = {},
): CrossRegimeConflictReport {
  const now = opts.now ?? new Date();
  const stalenessMax = opts.stalenessMaxDays ?? 7;

  const anyDesignated = statuses.some((s) => s.hit === 'designated');
  const unanimousDesignated = statuses.length > 0 && statuses.every((s) => s.hit === 'designated');
  const unanimousNotDesignated = statuses.length > 0 && statuses.every((s) => s.hit === 'not_designated');
  const split = !unanimousDesignated && !unanimousNotDesignated && statuses.some((s) => s.hit === 'designated') && statuses.some((s) => s.hit === 'not_designated');

  const sortedByRestrictive = [...statuses].sort((a, b) => RESTRICTIVENESS[b.hit] - RESTRICTIVENESS[a.hit]);
  const mostRestrictive = sortedByRestrictive[0] ?? null;
  const leastRestrictive = sortedByRestrictive[sortedByRestrictive.length - 1] ?? null;

  const conflicts: CrossRegimeConflictReport['conflicts'] = [];
  // Pairwise only where one says designated and another says not_designated / delisted.
  for (let i = 0; i < statuses.length; i++) {
    for (let j = i + 1; j < statuses.length; j++) {
      const a = statuses[i]!;
      const b = statuses[j]!;
      if (a.hit === b.hit) continue;
      if ((a.hit === 'designated' && (b.hit === 'not_designated' || b.hit === 'delisted')) ||
          (b.hit === 'designated' && (a.hit === 'not_designated' || a.hit === 'delisted'))) {
        conflicts.push({
          regimeA: a.regimeId,
          regimeB: b.regimeId,
          detail: `${a.regimeId}=${a.hit} vs ${b.regimeId}=${b.hit} — regimes disagree on designation.`,
          severity: 'high',
        });
      } else if (a.hit === 'partial_match' || b.hit === 'partial_match') {
        conflicts.push({
          regimeA: a.regimeId,
          regimeB: b.regimeId,
          detail: `${a.regimeId}=${a.hit} vs ${b.regimeId}=${b.hit} — partial match pending disambiguation.`,
          severity: 'medium',
        });
      } else if ((a.hit === 'unknown' && b.hit === 'designated') || (b.hit === 'unknown' && a.hit === 'designated')) {
        conflicts.push({
          regimeA: a.regimeId,
          regimeB: b.regimeId,
          detail: `${a.regimeId}=${a.hit} vs ${b.regimeId}=${b.hit} — one regime uncovered.`,
          severity: 'medium',
        });
      }
    }
  }

  const partialMatchRegimes = statuses.filter((s) => s.hit === 'partial_match').map((s) => s.regimeId);
  const unknownRegimes = statuses.filter((s) => s.hit === 'unknown').map((s) => s.regimeId);
  const staleRegimes = statuses.filter((s) => stale(s.asOf, now, stalenessMax)).map((s) => s.regimeId);

  let recommendedAction: CrossRegimeConflictReport['recommendedAction'] = 'proceed_with_scope_declaration';
  if (unanimousDesignated) recommendedAction = 'freeze';
  else if (anyDesignated) recommendedAction = 'block';
  else if (partialMatchRegimes.length > 0) recommendedAction = 'escalate';
  else if (split || conflicts.length > 0) recommendedAction = 'review';

  const rationale: string[] = [];
  if (unanimousDesignated) rationale.push('All declared regimes designate the subject — freeze within 24 hours and file FFR (CR 74/2020 Art.4-7).');
  else if (anyDesignated) rationale.push(`Subject is designated under ${statuses.filter((s) => s.hit === 'designated').map((s) => s.regimeId).join(', ')} — block the transaction pending MLRO review.`);
  if (partialMatchRegimes.length > 0) rationale.push(`Partial match under ${partialMatchRegimes.join(', ')} — disambiguate before onboarding (charter P6).`);
  if (staleRegimes.length > 0) rationale.push(`Stale snapshots (> ${stalenessMax}d) for ${staleRegimes.join(', ')} — refresh feed before relying (charter P8).`);
  if (unknownRegimes.length > 0) rationale.push(`Coverage gap for ${unknownRegimes.join(', ')} — re-screen once the feed is available.`);
  if (split) rationale.push('Regimes split on the designation — apply the most-restrictive-regime rule pending confirmation.');
  if (rationale.length === 0) rationale.push('No conflicts detected; proceed with scope declaration per charter P7.');

  return {
    anyDesignated,
    unanimousDesignated,
    unanimousNotDesignated,
    split,
    mostRestrictive,
    leastRestrictive,
    conflicts,
    partialMatchRegimes,
    unknownRegimes,
    staleRegimes,
    recommendedAction,
    rationale,
  };
}
