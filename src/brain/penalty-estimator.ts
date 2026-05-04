// Hawkeye Sterling — Cabinet Resolution 71/2024 penalty estimator
// (audit follow-up #39).
//
// Given a verdict's findings + redlines fired + jurisdiction, returns a
// quantified penalty exposure estimate per UAE Cabinet Resolution 71 of
// 2024 (DNFBP penalties schedule). NOT legal advice — this is the
// MLRO's defensible "what is this case potentially worth in fines"
// number for risk-based prioritisation. Charter P3: never expressed as
// a legal conclusion.

export type PenaltyCategory =
  | 'cdd_failure'
  | 'edd_failure'
  | 'str_late_or_missed'
  | 'tipping_off'
  | 'sanctions_screening_gap'
  | 'tfs_freeze_failure'
  | 'record_retention_failure'
  | 'four_eyes_violation'
  | 'governance_lapse'
  | 'training_gap';

export interface PenaltySchedule {
  category: PenaltyCategory;
  minAed: number;
  maxAed: number;
  description: string;
  regulatoryAnchor: string;
  aggravators: string[];
}

// Indicative penalty bands — per Cabinet Resolution 71/2024 + MoE
// guidance. Amounts here are indicative ranges from public schedules;
// actual fines vary with aggravators + remediation history.
const SCHEDULE: Record<PenaltyCategory, PenaltySchedule> = {
  cdd_failure: {
    category: 'cdd_failure',
    minAed: 50_000,
    maxAed: 500_000,
    description: 'Failure to perform required customer due diligence on a high-risk relationship.',
    regulatoryAnchor: 'Cabinet Res 71/2024 + UAE FDL 10/2025 Art.6-10',
    aggravators: ['repeat offence', 'high-value transactions', 'concealment by firm'],
  },
  edd_failure: {
    category: 'edd_failure',
    minAed: 100_000,
    maxAed: 1_000_000,
    description: 'Failure to apply enhanced due diligence on PEP / high-risk / cross-border.',
    regulatoryAnchor: 'Cabinet Res 71/2024 + FATF R.12',
    aggravators: ['PEP transaction processed', 'CAHRA jurisdiction nexus', 'no senior approval'],
  },
  str_late_or_missed: {
    category: 'str_late_or_missed',
    minAed: 100_000,
    maxAed: 5_000_000,
    description: 'STR not filed or filed after the statutory window upon reasonable suspicion.',
    regulatoryAnchor: 'UAE FDL 10/2025 Art.15 + Cabinet Res 71/2024',
    aggravators: ['suspicion confirmed by external authority', '>30 days late', 'value > AED 1m'],
  },
  tipping_off: {
    category: 'tipping_off',
    minAed: 500_000,
    maxAed: 5_000_000,
    description: 'Disclosure to subject (or 3rd party) of suspicion / STR / investigation.',
    regulatoryAnchor: 'UAE FDL 10/2025 Art.16',
    aggravators: ['intent established', 'subject fled', 'recorded in writing/email'],
  },
  sanctions_screening_gap: {
    category: 'sanctions_screening_gap',
    minAed: 200_000,
    maxAed: 10_000_000,
    description: 'Onboarded or transacted with a sanctioned party due to screening gap.',
    regulatoryAnchor: 'Cabinet Decision 74/2020 + FDL 10/2025',
    aggravators: ['UN/UNSC list', 'TFS regime', 'transaction completed'],
  },
  tfs_freeze_failure: {
    category: 'tfs_freeze_failure',
    minAed: 500_000,
    maxAed: 50_000_000,
    description: 'Failure to freeze without delay upon TFS / EOCN / UN designation.',
    regulatoryAnchor: 'Cabinet Decision 74/2020 Art.4-7',
    aggravators: ['delay > 24h', 'transferred funds', 'tipping-off compounded'],
  },
  record_retention_failure: {
    category: 'record_retention_failure',
    minAed: 50_000,
    maxAed: 500_000,
    description: 'Failure to retain CDD / transaction / reasoning records for the statutory period.',
    regulatoryAnchor: 'UAE FDL 10/2025 Art.20-24',
    aggravators: ['records destroyed deliberately', 'tamper evident broken'],
  },
  four_eyes_violation: {
    category: 'four_eyes_violation',
    minAed: 50_000,
    maxAed: 500_000,
    description: 'Designated AML decision approved without MLRO + deputy MLRO co-signature.',
    regulatoryAnchor: 'UAE FDL 10/2025 Art.46 + Cabinet Res 134/2025 Art.19',
    aggravators: ['repeat', 'high-value disposition'],
  },
  governance_lapse: {
    category: 'governance_lapse',
    minAed: 50_000,
    maxAed: 1_000_000,
    description: 'Inadequate governance, MLRO not appointed, no policies, untrained staff.',
    regulatoryAnchor: 'Cabinet Res 134/2025 + FATF R.18',
    aggravators: ['repeated supervisory finding', 'no remediation'],
  },
  training_gap: {
    category: 'training_gap',
    minAed: 25_000,
    maxAed: 250_000,
    description: 'AML training not delivered at required cadence / role-specific.',
    regulatoryAnchor: 'FATF R.18 + UAE FDL 10/2025',
    aggravators: ['no training in 24 months', 'untrained MLRO'],
  },
};

interface VerdictForPenalty {
  outcome: string;
  findings?: Array<{ modeId: string; verdict?: string; score?: number }>;
  redlines?: { fired?: Array<{ id?: string; severity?: string }> };
  crossRegimeConflict?: { recommendedAction?: string; unanimousDesignated?: boolean };
}

export interface PenaltyEstimate {
  category: PenaltyCategory;
  minAed: number;
  maxAed: number;
  reason: string;
  regulatoryAnchor: string;
}

/** Estimate aggregated penalty exposure for a verdict. NOT legal advice. */
export function estimatePenalty(verdict: VerdictForPenalty): {
  estimates: PenaltyEstimate[];
  totalMinAed: number;
  totalMaxAed: number;
  caveats: string[];
} {
  const estimates: PenaltyEstimate[] = [];
  const caveats: string[] = [
    'Indicative range only — Cabinet Res 71/2024 schedule applies aggravators / mitigators.',
    'Charter P3: this estimate is NOT a legal conclusion. Final penalty is the supervisor\'s.',
    'Currency AED. Actual fines may attract foreign-currency conversion if cross-border.',
  ];

  const fired = verdict.redlines?.fired ?? [];
  const findings = verdict.findings ?? [];

  // Map redline IDs → penalty categories.
  for (const r of fired) {
    if (!r.id) continue;
    if (r.id.includes('eocn_confirmed') || r.id.includes('un_consolidated_confirmed') || r.id.includes('ofac_sdn_confirmed')) {
      estimates.push(toEstimate('tfs_freeze_failure', `Redline '${r.id}' fired — TFS freeze obligation engaged`));
    }
    if (r.id.includes('tipping_off')) {
      estimates.push(toEstimate('tipping_off', `Redline '${r.id}' — Article 16 tipping-off prohibition`));
    }
    if (r.id.includes('four_eyes')) {
      estimates.push(toEstimate('four_eyes_violation', `Redline '${r.id}' — co-signature requirement breached`));
    }
    if (r.id.includes('training_data_as_sanctions_source')) {
      estimates.push(toEstimate('record_retention_failure', `Redline '${r.id}' — training-data citation breaches Art.20 + Charter P8`));
    }
  }

  // Findings → categories.
  for (const f of findings) {
    if (f.score === undefined || f.score < 0.5) continue;
    if (f.modeId === 'list_walk') estimates.push(toEstimate('sanctions_screening_gap', `Mode '${f.modeId}' fired with score ${f.score.toFixed(2)}`));
    if (f.modeId === 'ubo_tree_walk') estimates.push(toEstimate('cdd_failure', `Mode '${f.modeId}' — opaque UBO chain`));
    if (f.modeId === 'velocity_analysis' || f.modeId === 'cash_courier_ctn') estimates.push(toEstimate('str_late_or_missed', `Mode '${f.modeId}' — pattern likely required STR`));
    if (f.modeId === 'four_eyes_stress') estimates.push(toEstimate('four_eyes_violation', `Mode '${f.modeId}' — control breach`));
  }

  // Cross-regime escalation.
  if (verdict.crossRegimeConflict?.unanimousDesignated) {
    estimates.push(toEstimate('tfs_freeze_failure', 'Unanimous designation across regimes — freeze obligation engaged'));
  }

  // De-dupe by category — keep the one whose reason mentions a redline (more authoritative).
  const seen = new Map<PenaltyCategory, PenaltyEstimate>();
  for (const e of estimates) {
    const prev = seen.get(e.category);
    if (!prev || (!prev.reason.includes('Redline') && e.reason.includes('Redline'))) {
      seen.set(e.category, e);
    }
  }
  const deduped = [...seen.values()];

  const totalMinAed = deduped.reduce((a, e) => a + e.minAed, 0);
  const totalMaxAed = deduped.reduce((a, e) => a + e.maxAed, 0);

  return { estimates: deduped, totalMinAed, totalMaxAed, caveats };
}

function toEstimate(cat: PenaltyCategory, reason: string): PenaltyEstimate {
  const s = SCHEDULE[cat];
  return {
    category: cat,
    minAed: s.minAed,
    maxAed: s.maxAed,
    reason,
    regulatoryAnchor: s.regulatoryAnchor,
  };
}

export function penaltySchedule(): readonly PenaltySchedule[] {
  return Object.values(SCHEDULE);
}
