// Hawkeye Sterling — alert prioritiser.
// Ranks alerts for MLRO triage. Priority is a composite of (a) redline
// severity, (b) red-flag severity, (c) risk tier, (d) freshness, and (e)
// regulatory sensitivity (EOCN / UN / OFAC > others).

export type AlertKind =
  | 'sanctions_match'
  | 'partial_sanctions_match'
  | 'adverse_media'
  | 'red_flag'
  | 'high_risk_country'
  | 'pep_onboarding'
  | 'transaction_anomaly'
  | 'policy_violation'
  | 'data_quality';

export interface Alert {
  id: string;
  kind: AlertKind;
  subject: string;
  createdAt: string;
  severityHints?: {
    redlineFired?: string;
    highestRedFlagSeverity?: 'low' | 'medium' | 'high';
    riskTier?: 'low' | 'medium' | 'high' | 'very_high';
    regimes?: string[];
  };
}

export interface PrioritisedAlert extends Alert {
  priority: number; // 0..100
  reasons: string[];
}

function regimeSensitivity(regimes: string[] = []): number {
  const critical = ['uae_eocn', 'uae_local_terrorist', 'un_1267', 'un_1988', 'un_dprk', 'un_iran'];
  const high = ['ofac_sdn', 'ofac_cons', 'eu_consolidated', 'uk_ofsi'];
  if (regimes.some((r) => critical.includes(r))) return 1;
  if (regimes.some((r) => high.includes(r))) return 0.7;
  if (regimes.length > 0) return 0.4;
  return 0;
}

function tierWeight(tier?: string): number {
  switch (tier) {
    case 'very_high': return 1;
    case 'high': return 0.7;
    case 'medium': return 0.4;
    case 'low': return 0.2;
    default: return 0.3;
  }
}

function freshnessWeight(createdAt: string, now: Date = new Date()): number {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return 0.5;
  const ageHours = Math.max(0, (now.getTime() - t) / 3_600_000);
  if (ageHours < 4) return 1;
  if (ageHours < 24) return 0.8;
  if (ageHours < 72) return 0.6;
  if (ageHours < 168) return 0.4;
  return 0.2;
}

function redFlagWeight(sev?: 'low' | 'medium' | 'high'): number {
  switch (sev) {
    case 'high': return 1;
    case 'medium': return 0.6;
    case 'low': return 0.3;
    default: return 0.2;
  }
}

export function prioritiseAlerts(alerts: Alert[]): PrioritisedAlert[] {
  return alerts
    .map((a) => {
      const reasons: string[] = [];
      const base =
        (a.severityHints?.redlineFired ? 1 : 0) * 0.35 +
        regimeSensitivity(a.severityHints?.regimes) * 0.25 +
        tierWeight(a.severityHints?.riskTier) * 0.2 +
        redFlagWeight(a.severityHints?.highestRedFlagSeverity) * 0.15 +
        freshnessWeight(a.createdAt) * 0.05;

      if (a.severityHints?.redlineFired) reasons.push(`redline:${a.severityHints.redlineFired}`);
      if (a.severityHints?.regimes?.length) reasons.push(`regimes:${a.severityHints.regimes.join('|')}`);
      if (a.severityHints?.riskTier) reasons.push(`tier:${a.severityHints.riskTier}`);
      if (a.severityHints?.highestRedFlagSeverity) reasons.push(`red_flag:${a.severityHints.highestRedFlagSeverity}`);

      return { ...a, priority: Math.round(Math.min(1, base) * 100), reasons };
    })
    .sort((a, b) => b.priority - a.priority);
}
