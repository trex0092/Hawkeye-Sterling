// Hawkeye-Sterling — ongoing monitoring configuration.
//
// Single source of truth for:
//   1. Risk-based monitoring frequency schedules (per FATF R.10 / R.12 / Federal Decree-Law No. 10 of 2025)
//   2. Per-customer alert threshold configuration (stored in Netlify Blobs)
//   3. Monitoring queue prioritisation logic
//   4. Change-detection helpers (sanctions score jump, new adverse-media category, jurisdiction change)
//
// Risk tier → screening/news-check cadences (days):
//   standard  (CDD):       screen 365 d, news  30 d
//   enhanced  (EDD):       screen  90 d, news   7 d
//   intensive:             screen  30 d, news   1 d
//   pep:                   screen   7 d, news   1 d  [mandatory per FATF R.12]
//   prohibited:            screen   1 d, news 0.25 d (6 h)

import { getJson, setJson } from "@/lib/server/store";
import { getCountryRisk, isCahra, CAHRA_COUNTRIES } from "@/lib/server/high-risk-countries";

// ── Risk tier type ─────────────────────────────────────────────────────────────

export type CustomerRiskTier =
  | "standard"    // CDD — low/medium risk, routine monitoring
  | "enhanced"    // EDD — high risk, enhanced monitoring
  | "intensive"   // Very high risk, intensive monitoring
  | "pep"         // Politically exposed person — FATF R.12 mandatory schedule
  | "prohibited"; // Highest risk / blocked entity — near-real-time monitoring

// ── Monitoring frequency schedules ────────────────────────────────────────────

export interface MonitoringFrequency {
  /** Days between full sanctions/watchlist re-screens. */
  screenIntervalDays: number;
  /** Days between adverse-media / news-check runs. */
  newsCheckIntervalDays: number;
  /** Regulatory basis for this schedule. */
  regulatoryBasis: string;
}

export const MONITORING_FREQUENCIES: Record<CustomerRiskTier, MonitoringFrequency> = {
  standard: {
    screenIntervalDays: 365,
    newsCheckIntervalDays: 30,
    regulatoryBasis: "CDD — FATF R.10, standard customer due diligence",
  },
  enhanced: {
    screenIntervalDays: 90,
    newsCheckIntervalDays: 7,
    regulatoryBasis: "EDD — FATF R.10/R.19, high-risk third-country enhanced due diligence",
  },
  intensive: {
    screenIntervalDays: 30,
    newsCheckIntervalDays: 1,
    regulatoryBasis: "Intensive monitoring — very high risk customer, Federal Decree-Law No. (10) of 2025 Art.21",
  },
  pep: {
    screenIntervalDays: 7,
    newsCheckIntervalDays: 1,
    regulatoryBasis: "PEP mandatory monitoring — FATF R.12, Federal Decree-Law No. (10) of 2025 Art.18, UAE CBUAE guidance",
  },
  prohibited: {
    screenIntervalDays: 1,
    newsCheckIntervalDays: 0.25, // 6 hours
    regulatoryBasis: "Prohibited/blocked entity — daily sanctions sweep, FATF R.6/R.7",
  },
};

/**
 * Compute the next run timestamp (ms since epoch) given the last run time
 * and the configured interval in days.
 */
export function nextRunTimestamp(lastRunMs: number, intervalDays: number): number {
  return lastRunMs + intervalDays * 24 * 60 * 60 * 1_000;
}

/**
 * Returns true when a re-screen is due for the given risk tier + last-run time.
 * Subjects with no prior run are always considered due.
 */
export function isScreenDue(
  riskTier: CustomerRiskTier,
  lastRunMs: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (lastRunMs == null) return true;
  const freq = MONITORING_FREQUENCIES[riskTier];
  return nowMs >= nextRunTimestamp(lastRunMs, freq.screenIntervalDays);
}

/**
 * Returns true when a news/adverse-media check is due.
 */
export function isNewsCheckDue(
  riskTier: CustomerRiskTier,
  lastNewsCheckMs: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (lastNewsCheckMs == null) return true;
  const freq = MONITORING_FREQUENCIES[riskTier];
  return nowMs >= nextRunTimestamp(lastNewsCheckMs, freq.newsCheckIntervalDays);
}

// ── Global monitoring floor (3×/day) ──────────────────────────────────────────
// MLRO mandate (2026-06-04): every enrolled customer is re-screened AT MINIMUM
// three times per day, regardless of risk tier. This is a FLOOR layered under
// the risk-based cadences above — it never screens LESS often, so the FATF R.10
// risk-based approach is preserved: PEP/prohibited tiers keep their tighter
// intervals; standard/enhanced subjects are pulled UP to 3×/day.
//
// Slots: 08:30 / 15:00 / 17:30 Dubai (UTC+4, no DST) → 04:30 / 11:00 / 13:30 UTC.
// These mirror the thrice_daily cadence slots used by /api/ongoing/run so the
// per-subject Asana reports land at the same three times the MLRO board expects.
export const GLOBAL_SCREEN_FLOOR_SLOTS_UTC: ReadonlyArray<readonly [number, number]> = [
  [4, 30],
  [11, 0],
  [13, 30],
];

/** Next global-floor slot strictly after `fromMs` (epoch ms). */
export function nextGlobalFloorSlot(fromMs: number): number {
  const candidates = GLOBAL_SCREEN_FLOOR_SLOTS_UTC.map(([h, m]) => {
    const d = new Date(fromMs);
    d.setUTCHours(h, m, 0, 0);
    if (d.getTime() <= fromMs) d.setUTCDate(d.getUTCDate() + 1);
    return d.getTime();
  });
  return Math.min(...candidates);
}

/**
 * Floor-aware "is a re-screen due?" check. A subject is due when EITHER its
 * risk-tier cadence is due (isScreenDue) OR a global-floor slot has elapsed
 * since the last screen. Subjects with no prior screen are always due.
 */
export function isScreenDueWithFloor(
  riskTier: CustomerRiskTier,
  lastScreenMs: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (lastScreenMs == null) return true;
  if (isScreenDue(riskTier, lastScreenMs, nowMs)) return true;
  return nowMs >= nextGlobalFloorSlot(lastScreenMs);
}

/**
 * Next scheduled screen timestamp with the global 3×/day floor applied:
 * the SOONER of the risk-tier interval and the next global-floor slot.
 */
export function nextScreenAtWithFloor(
  riskTier: CustomerRiskTier,
  lastRunMs: number,
  nowMs: number = Date.now(),
): number {
  const tierNext = nextRunTimestamp(
    lastRunMs,
    MONITORING_FREQUENCIES[riskTier].screenIntervalDays,
  );
  return Math.min(tierNext, nextGlobalFloorSlot(nowMs));
}

// ── Alert threshold configuration ─────────────────────────────────────────────

export type AdverseMediaSeverityThreshold = "low" | "medium" | "high" | "critical";

export interface AlertThresholdConfig {
  customerId: string;
  /** Sanctions match score (0.70 – 1.0) below which a hit is suppressed as noise. */
  sanctionsMatchThreshold: number;
  /** Minimum adverse-media severity that triggers an alert task. */
  adverseMediaSeverityThreshold: AdverseMediaSeverityThreshold;
  /** PEP salience score (0–100) below which a PEP match is suppressed. */
  pepSalienceThreshold: number;
  updatedAt: string;
  updatedBy: string;
}

const THRESHOLD_DEFAULTS: Omit<AlertThresholdConfig, "customerId" | "updatedAt" | "updatedBy"> = {
  sanctionsMatchThreshold: 0.80,
  adverseMediaSeverityThreshold: "high",
  pepSalienceThreshold: 50,
};

const THRESHOLD_KEY = (customerId: string) => `ongoing/thresholds/${customerId}`;

/** Load per-customer alert thresholds, falling back to defaults. */
export async function loadAlertThresholds(customerId: string): Promise<AlertThresholdConfig> {
  const stored = await getJson<AlertThresholdConfig>(THRESHOLD_KEY(customerId));
  if (stored) return stored;
  return {
    customerId,
    ...THRESHOLD_DEFAULTS,
    updatedAt: new Date(0).toISOString(),
    updatedBy: "system/defaults",
  };
}

/** Persist per-customer alert thresholds. Validates ranges. */
export async function saveAlertThresholds(
  customerId: string,
  updates: Partial<Pick<AlertThresholdConfig, "sanctionsMatchThreshold" | "adverseMediaSeverityThreshold" | "pepSalienceThreshold">>,
  updatedBy: string,
): Promise<AlertThresholdConfig> {
  const current = await loadAlertThresholds(customerId);
  const next: AlertThresholdConfig = { ...current };

  if (updates.sanctionsMatchThreshold !== undefined) {
    const v = updates.sanctionsMatchThreshold;
    if (typeof v !== "number" || v < 0.70 || v > 1.0) {
      throw new RangeError(`sanctionsMatchThreshold must be 0.70 – 1.0, got ${v}`);
    }
    next.sanctionsMatchThreshold = v;
  }
  if (updates.adverseMediaSeverityThreshold !== undefined) {
    const allowed: AdverseMediaSeverityThreshold[] = ["low", "medium", "high", "critical"];
    if (!allowed.includes(updates.adverseMediaSeverityThreshold)) {
      throw new RangeError(`adverseMediaSeverityThreshold must be one of ${allowed.join("|")}`);
    }
    next.adverseMediaSeverityThreshold = updates.adverseMediaSeverityThreshold;
  }
  if (updates.pepSalienceThreshold !== undefined) {
    const v = updates.pepSalienceThreshold;
    if (typeof v !== "number" || v < 0 || v > 100) {
      throw new RangeError(`pepSalienceThreshold must be 0–100, got ${v}`);
    }
    next.pepSalienceThreshold = v;
  }

  next.updatedAt = new Date().toISOString();
  next.updatedBy = updatedBy;
  await setJson(THRESHOLD_KEY(customerId), next);
  return next;
}

// ── Severity ordering for adverse-media threshold comparison ──────────────────

const SEVERITY_ORDER: Record<AdverseMediaSeverityThreshold, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Returns true when `articleSeverity` meets or exceeds the configured threshold.
 */
export function meetsAdverseMediaThreshold(
  articleSeverity: string,
  threshold: AdverseMediaSeverityThreshold,
): boolean {
  const articleLevel = SEVERITY_ORDER[articleSeverity as AdverseMediaSeverityThreshold] ?? -1;
  return articleLevel >= SEVERITY_ORDER[threshold];
}

// ── Monitoring queue prioritisation ───────────────────────────────────────────

export interface QueueItem {
  subjectId: string;
  subjectName: string;
  riskTier: CustomerRiskTier;
  isPep: boolean;
  nextScheduledAt: number; // epoch ms
  isOverdue: boolean;
  /** Higher = screened sooner (0=low risk, 4=prohibited). */
  riskPriority: number;
}

const RISK_PRIORITY: Record<CustomerRiskTier, number> = {
  prohibited: 4,
  pep: 3,
  intensive: 2,
  enhanced: 1,
  standard: 0,
};

/**
 * Sort monitoring queue items by:
 *   1. Overdue items first
 *   2. Higher risk tier before lower (prohibited > pep > intensive > enhanced > standard)
 *   3. PEPs before non-PEPs within the same tier
 *   4. Ascending by next scheduled date (soonest due first)
 */
export function sortMonitoringQueue(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    // 1. Overdue first
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    // 2. Higher risk priority first
    if (a.riskPriority !== b.riskPriority) return b.riskPriority - a.riskPriority;
    // 3. PEPs before non-PEPs within same tier
    if (a.isPep !== b.isPep) return a.isPep ? -1 : 1;
    // 4. Ascending by next scheduled date
    return a.nextScheduledAt - b.nextScheduledAt;
  });
}

/**
 * Build a QueueItem from raw subject data for queue ordering.
 */
export function buildQueueItem(params: {
  subjectId: string;
  subjectName: string;
  riskTier: CustomerRiskTier;
  isPep: boolean;
  nextScheduledAt: number;
  nowMs?: number;
}): QueueItem {
  const nowMs = params.nowMs ?? Date.now();
  return {
    subjectId: params.subjectId,
    subjectName: params.subjectName,
    riskTier: params.riskTier,
    isPep: params.isPep,
    nextScheduledAt: params.nextScheduledAt,
    isOverdue: nowMs > params.nextScheduledAt,
    riskPriority: RISK_PRIORITY[params.riskTier],
  };
}

// ── Change detection ───────────────────────────────────────────────────────────

/** Adverse-media categories tracked for "new category emerged" detection. */
export type AdverseMediaCategory =
  | "terrorism-financing"
  | "proliferation-wmd"
  | "money-laundering"
  | "organised-crime"
  | "bribery-corruption"
  | "human-trafficking"
  | "fraud-forgery"
  | "environmental-crime"
  | "tax-crime"
  | "cybercrime"
  | "market-abuse"
  | "regulatory-action"
  | "insider-threat"
  | "political-exposure"
  | "law-enforcement"
  | "ai-misuse";

export interface ChangeDetectionResult {
  /** True when any escalation condition was triggered. */
  shouldEscalate: boolean;
  /** Sanctions score increased by > 10 points since last run. */
  sanctionsScoreJumped: boolean;
  /** Delta in sanctions score (positive = increased). */
  sanctionsScoreDelta: number;
  /** New adverse-media categories that weren't in the previous snapshot. */
  newAdverseMediaCategories: AdverseMediaCategory[];
  /** True when the subject's jurisdiction moved to a CAHRA or FATF-blacklist country. */
  jurisdictionEscalated: boolean;
  /** Human-readable summary of triggered conditions. */
  changeSummary: string[];
}

const SANCTIONS_JUMP_THRESHOLD = 10; // > 10 points triggers escalation

/** FATF blacklist ISO-2 codes (countries subject to Call for Action). */
export const FATF_BLACKLIST_COUNTRIES = new Set<string>(["KP", "IR", "MM"]);

/**
 * Detect material changes between two consecutive monitoring runs.
 *
 * Triggers auto-escalation when:
 *   - Sanctions score jumped by > 10 points
 *   - A new adverse-media category emerged that wasn't in the prior snapshot
 *   - Jurisdiction changed to a CAHRA or FATF-blacklist country
 */
export function detectChanges(params: {
  previousScore: number | null | undefined;
  currentScore: number;
  previousAdverseCategories: AdverseMediaCategory[];
  currentAdverseCategories: AdverseMediaCategory[];
  previousJurisdiction: string | null | undefined;
  currentJurisdiction: string | null | undefined;
}): ChangeDetectionResult {
  const {
    previousScore,
    currentScore,
    previousAdverseCategories,
    currentAdverseCategories,
    previousJurisdiction,
    currentJurisdiction,
  } = params;

  const changeSummary: string[] = [];

  // 1. Sanctions score jump
  const sanctionsScoreDelta =
    previousScore != null ? currentScore - previousScore : 0;
  const sanctionsScoreJumped =
    previousScore != null && sanctionsScoreDelta > SANCTIONS_JUMP_THRESHOLD;
  if (sanctionsScoreJumped) {
    changeSummary.push(
      `Sanctions score jumped +${sanctionsScoreDelta.toFixed(1)} (${previousScore} → ${currentScore}, threshold >${SANCTIONS_JUMP_THRESHOLD})`,
    );
  }

  // 2. New adverse-media category emerged
  const prevCatSet = new Set(previousAdverseCategories);
  const newAdverseMediaCategories = currentAdverseCategories.filter(
    (c) => !prevCatSet.has(c),
  );
  if (newAdverseMediaCategories.length > 0) {
    changeSummary.push(
      `New adverse-media categories: ${newAdverseMediaCategories.join(", ")}`,
    );
  }

  // 3. Jurisdiction escalated to CAHRA or FATF blacklist
  let jurisdictionEscalated = false;
  if (
    currentJurisdiction &&
    currentJurisdiction !== previousJurisdiction
  ) {
    const iso2 = currentJurisdiction.toUpperCase().trim();
    const isBlacklist = FATF_BLACKLIST_COUNTRIES.has(iso2);
    const isCahraJurisdiction = isCahra(iso2);
    if (isBlacklist || isCahraJurisdiction) {
      jurisdictionEscalated = true;
      const label = isBlacklist ? "FATF blacklist" : "CAHRA";
      changeSummary.push(
        `Jurisdiction changed to ${currentJurisdiction} (${label})` +
          (previousJurisdiction ? ` from ${previousJurisdiction}` : ""),
      );
    }
  }

  const shouldEscalate =
    sanctionsScoreJumped ||
    newAdverseMediaCategories.length > 0 ||
    jurisdictionEscalated;

  return {
    shouldEscalate,
    sanctionsScoreJumped,
    sanctionsScoreDelta,
    newAdverseMediaCategories,
    jurisdictionEscalated,
    changeSummary,
  };
}

// ── Monitoring snapshot (for change detection persistence) ────────────────────

export interface MonitoringSnapshot {
  runAt: string;
  riskTier: CustomerRiskTier;
  topScore: number;
  adverseMediaCategories: AdverseMediaCategory[];
  jurisdiction: string | null;
  triggeredBy: "schedule" | "manual" | "alert";
}

const SNAPSHOT_KEY = (subjectId: string) => `ongoing/monitoring-snapshot/${subjectId}`;

export async function loadMonitoringSnapshot(subjectId: string): Promise<MonitoringSnapshot | null> {
  return getJson<MonitoringSnapshot>(SNAPSHOT_KEY(subjectId));
}

export async function saveMonitoringSnapshot(
  subjectId: string,
  snapshot: MonitoringSnapshot,
): Promise<void> {
  await setJson(SNAPSHOT_KEY(subjectId), snapshot);
}

// ── Exports for void reference suppression ─────────────────────────────────────
// CAHRA_COUNTRIES imported from high-risk-countries for FATF blacklist overlap.
// Export a helper that checks both FATF blacklist and CAHRA in one call.

/**
 * Returns true when the given ISO-2 code is on either the FATF blacklist
 * or the CAHRA (Conflict-Affected and High-Risk Areas) register.
 */
export function isFatfBlacklistOrCahra(iso2: string | null | undefined): boolean {
  if (!iso2) return false;
  const code = iso2.toUpperCase().trim();
  return FATF_BLACKLIST_COUNTRIES.has(code) || CAHRA_COUNTRIES.has(code);
}

/** Convenience — resolve country risk tier from jurisdiction string. */
export { getCountryRisk, isCahra };
