// Hawkeye Sterling — PEP cool-off period tracker (Layer #37).
//
// FATF R.12 + FDL 10/2025 Art.17: PEPs remain subject to enhanced
// scrutiny for a defined cool-off after leaving office. Different
// regimes apply different windows; the safest is the longest.
//
//   FATF R.12:        12 months minimum
//   EU 4MLD (Art.22): 12 months minimum, may be extended on risk basis
//   UK MLR 2017:      12 months minimum
//   FinCEN guidance:  12 months default; ongoing if politically active
//   Wolfsberg (2022): "permanently" for highest-risk PEPs

export interface PepCoolOffResult {
  isInCoolOff: boolean;
  /** Days since office exit, when known. */
  daysSinceExit: number | null;
  /** Days remaining in the cool-off (negative when cleared). */
  daysRemaining: number | null;
  /** Recommended cool-off duration in days. */
  recommendedCoolOffDays: number;
  rationale: string;
}

const DEFAULT_COOL_OFF_DAYS = 365;
const HIGH_RISK_COOL_OFF_DAYS = 730;          // tier-1 PEPs, kleptocracy-prone
const PERMANENT_FLAG_TIERS = new Set(["tier_1", "high"]);

export function evaluateCoolOff(input: {
  exitedOfficeAt?: string | null;
  tier?: string | null;
  highRiskJurisdiction?: boolean;
  nowMs?: number;
}): PepCoolOffResult {
  const now = input.nowMs ?? Date.now();
  if (!input.exitedOfficeAt) {
    return {
      isInCoolOff: true,
      daysSinceExit: null,
      daysRemaining: null,
      recommendedCoolOffDays: DEFAULT_COOL_OFF_DAYS,
      rationale: "Office exit date not declared — assume current PEP.",
    };
  }
  const exitMs = Date.parse(input.exitedOfficeAt);
  if (!Number.isFinite(exitMs)) {
    return {
      isInCoolOff: true,
      daysSinceExit: null,
      daysRemaining: null,
      recommendedCoolOffDays: DEFAULT_COOL_OFF_DAYS,
      rationale: "Office exit date unparseable — assume current PEP.",
    };
  }
  const daysSince = Math.floor((now - exitMs) / 86_400_000);
  const tier = (input.tier ?? "").toLowerCase();
  const recommended = (input.highRiskJurisdiction || PERMANENT_FLAG_TIERS.has(tier))
    ? HIGH_RISK_COOL_OFF_DAYS
    : DEFAULT_COOL_OFF_DAYS;
  const daysRemaining = recommended - daysSince;
  const inCoolOff = daysRemaining > 0;
  return {
    isInCoolOff: inCoolOff,
    daysSinceExit: daysSince,
    daysRemaining,
    recommendedCoolOffDays: recommended,
    rationale: inCoolOff
      ? `${daysSince}d since office exit; ${daysRemaining}d remaining in the ${recommended}-day FATF R.12 cool-off — EDD continues.`
      : `${daysSince}d since office exit; cool-off period (${recommended}d) elapsed. Continued PEP scrutiny may still apply if jurisdiction is high-risk.`,
  };
}
