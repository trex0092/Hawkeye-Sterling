// Hawkeye Sterling — MLRO Cognitive Load & Alert Fatigue Monitor (Wave 14 Feature 9).
// Detects alert-fatigue signatures in MLRO decision patterns.
// SOC2 CC7.4 / UAE FDL 10/2025 (human oversight of AI).

export type FatigueSignalKind =
  | 'HIGH_VELOCITY'
  | 'FAST_DECISIONS'
  | 'APPROVAL_STREAK'
  | 'FAST_HIGH_RISK'
  | 'OFF_HOURS_VELOCITY';

export type FatigueSignalSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface FatigueSignal {
  kind: FatigueSignalKind;
  severity: FatigueSignalSeverity;
  detail: string;
}

export interface DisposalEvent {
  eventId: string;
  actorId: string;
  caseId: string;
  toVerdict: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  caseReviewDurationMs?: number;
  disposedAt: string;
}

export interface CognitiveFatigueProfile {
  actorId: string;
  windowHours: number;
  caseCount: number;
  signals: FatigueSignal[];
  fatigueScore: number;
  recommendation: string;
  computedAt: string;
}

const SEVERITY_WEIGHTS: Record<FatigueSignalSeverity, number> = {
  critical: 40,
  high: 20,
  medium: 10,
  low: 5,
};

function maxConsecutiveApprovals(verdicts: string[]): number {
  const approveSet = new Set(['approve', 'proceed', 'clear']);
  let max = 0, cur = 0;
  for (const v of verdicts) {
    if (approveSet.has(v)) { cur++; max = Math.max(max, cur); }
    else cur = 0;
  }
  return max;
}

export function detectAlertFatigue(
  events: DisposalEvent[],
  windowHours = 4,
): CognitiveFatigueProfile {
  const actorId = events[0]?.actorId ?? 'unknown';
  const windowMs = windowHours * 3_600_000;
  const now = Date.now();
  const recent = events.filter((e) => now - new Date(e.disposedAt).getTime() < windowMs);
  const signals: FatigueSignal[] = [];

  // Signal 1: Decision velocity
  const casesPerHour = recent.length / windowHours;
  if (casesPerHour > 8) {
    signals.push({
      kind: 'HIGH_VELOCITY',
      severity: casesPerHour > 12 ? 'critical' : 'high',
      detail: `${recent.length} cases in ${windowHours}h (${casesPerHour.toFixed(1)}/h, threshold: 8/h).`,
    });
  }

  // Signal 2: Sub-30s case reviews
  const withDuration = recent.filter((e) => e.caseReviewDurationMs !== undefined);
  if (withDuration.length > 0) {
    const fastCount = withDuration.filter((e) => (e.caseReviewDurationMs ?? Infinity) < 30_000).length;
    const fastRate = fastCount / withDuration.length;
    if (fastRate > 0.40) {
      signals.push({
        kind: 'FAST_DECISIONS',
        severity: fastRate > 0.65 ? 'critical' : 'high',
        detail: `${(fastRate * 100).toFixed(0)}% of decisions under 30s (${fastCount}/${withDuration.length}).`,
      });
    }
  }

  // Signal 3: Consecutive approval streak
  const verdicts = recent.map((e) => e.toVerdict);
  const streak = maxConsecutiveApprovals(verdicts);
  if (streak >= 5) {
    signals.push({
      kind: 'APPROVAL_STREAK',
      severity: streak >= 8 ? 'high' : 'medium',
      detail: `Streak of ${streak} consecutive approve/proceed decisions.`,
    });
  }

  // Signal 4: High-risk fast approvals (most critical)
  const fastHighRisk = recent.filter(
    (e) =>
      (e.riskLevel === 'high' || e.riskLevel === 'critical') &&
      (e.caseReviewDurationMs ?? Infinity) < 30_000,
  );
  if (fastHighRisk.length > 0) {
    signals.push({
      kind: 'FAST_HIGH_RISK',
      severity: 'critical',
      detail: `${fastHighRisk.length} high/critical-risk case(s) approved in <30s. Immediate review recommended.`,
    });
  }

  // Signal 5: Off-hours velocity
  const hour = new Date().getUTCHours();
  const isOffHours = hour < 7 || hour > 19;
  if (isOffHours && casesPerHour > 4) {
    signals.push({
      kind: 'OFF_HOURS_VELOCITY',
      severity: 'medium',
      detail: `High case velocity (${casesPerHour.toFixed(1)}/h) outside business hours (UTC ${hour}:00).`,
    });
  }

  const fatigueScore = signals.reduce((s, sig) => s + SEVERITY_WEIGHTS[sig.severity], 0);

  const recommendation =
    fatigueScore >= 40
      ? 'IMMEDIATE: Reassign case queue to a second MLRO. Mandatory break required before resuming reviews.'
      : fatigueScore >= 20
        ? 'WARNING: Consider a short break and case queue review. High-risk cases should be peer-reviewed.'
        : fatigueScore >= 10
          ? 'ADVISORY: Monitor decision patterns. Recommend supervisory spot-check of recent approvals.'
          : 'NORMAL: No fatigue indicators detected.';

  return {
    actorId,
    windowHours,
    caseCount: recent.length,
    signals,
    fatigueScore,
    recommendation,
    computedAt: new Date().toISOString(),
  };
}
