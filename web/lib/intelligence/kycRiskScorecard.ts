// Hawkeye Sterling — KYC risk scorecard (Layers 61-70).
//
// Pure functions to compute and consume a 0..100 customer-risk scorecard
// composed of customer / channel / product / geography / tenure / volume /
// activity drift / static-recalc / refresh-due / completeness.

export interface CustomerProfile {
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  industrySegment?: string;
  isPep?: boolean;
  pepTier?: string | null;
  jurisdictionIso2?: string;
  onboardedAt?: string;
  cddPosture?: "CDD" | "EDD" | "SDD";
}

export interface ChannelProfile {
  channel: "branch" | "remote_kyc" | "agent" | "online" | "introducer" | "ecommerce";
  introducerType?: "lawyer" | "tcsp" | "accountant" | "individual" | "none";
  faceToFace?: boolean;
}

export interface ProductProfile {
  productLine: "current_account" | "savings" | "trade_finance" | "investment" | "fx" | "crypto" | "card" | "loan" | "wealth";
  highRiskFlags?: string[];
  estimatedThroughputUsdPerMonth?: number;
}

export interface ActivityProfile {
  declaredMonthlyVolumeUsd?: number;
  observedMonthlyVolumeUsd?: number;
  lastActivityAt?: string;
  txCountLast30d?: number;
}

// 61. Customer scorecard
export function customerRisk(p: CustomerProfile): number {
  let s = 25;
  if (p.entityType === "organisation") s += 15;
  if (p.entityType === "vessel" || p.entityType === "aircraft") s += 25;
  if (p.isPep) s += 30;
  if (p.pepTier === "tier_1") s += 15;
  return Math.min(100, s);
}

// 62. Onboarding-channel risk
export function channelRisk(c: ChannelProfile): number {
  let s = 10;
  if (c.channel === "online" || c.channel === "remote_kyc") s += 25;
  if (c.channel === "agent" || c.channel === "introducer") s += 35;
  if (c.channel === "ecommerce") s += 20;
  if (c.faceToFace === false) s += 10;
  if (c.introducerType === "lawyer" || c.introducerType === "tcsp") s += 15;
  return Math.min(100, s);
}

// 63. Product/service risk
export function productRisk(p: ProductProfile): number {
  let s = 10;
  if (p.productLine === "trade_finance") s += 35;
  if (p.productLine === "fx") s += 30;
  if (p.productLine === "crypto") s += 45;
  if (p.productLine === "wealth" || p.productLine === "investment") s += 25;
  s += Math.min(20, (p.highRiskFlags?.length ?? 0) * 5);
  if ((p.estimatedThroughputUsdPerMonth ?? 0) >= 1_000_000) s += 15;
  return Math.min(100, s);
}

// 64. Geography overlay (tier-driven)
export function geographyRisk(inherentRisk: number): number {
  return Math.max(0, Math.min(100, inherentRisk));
}

// 65. Customer-tenure risk (newer = higher)
export function tenureRisk(onboardedAt: string | null | undefined, nowMs = Date.now()): number {
  if (!onboardedAt) return 50;
  const t = Date.parse(onboardedAt);
  if (!Number.isFinite(t)) return 50;
  const months = Math.max(0, (nowMs - t) / (30 * 86400000));
  if (months < 1) return 80;
  if (months < 6) return 55;
  if (months < 12) return 35;
  if (months < 36) return 20;
  return 10;
}

// 66. Volume-vs-profile mismatch
export function volumeMismatch(act: ActivityProfile): { score: number; deltaPct: number; rationale: string } {
  const declared = act.declaredMonthlyVolumeUsd ?? 0;
  const observed = act.observedMonthlyVolumeUsd ?? 0;
  if (declared <= 0) return { score: 0, deltaPct: 0, rationale: "No declared baseline." };
  const delta = (observed - declared) / declared;
  const abs = Math.abs(delta);
  const score = Math.min(100, Math.round(abs * 100));
  return {
    score,
    deltaPct: Number((delta * 100).toFixed(1)),
    rationale:
      abs < 0.25 ? "Within tolerance." :
      abs < 0.5  ? "Moderate variance from declared baseline." :
      abs < 1    ? "High variance — investigate underlying cause." :
                   "Material mismatch — possible structuring / unauthorised business expansion.",
  };
}

// 67. Activity-pattern drift
export function activityDrift(input: { txCountBaseline: number; txCountLast30d?: number }): {
  drift: number;
  flagged: boolean;
  rationale: string;
} {
  const base = input.txCountBaseline;
  const cur = input.txCountLast30d ?? 0;
  if (base === 0) return { drift: 0, flagged: false, rationale: "No baseline." };
  const ratio = cur / base;
  const flagged = ratio >= 3 || ratio <= 0.2;
  return {
    drift: Number(((ratio - 1) * 100).toFixed(0)),
    flagged,
    rationale: flagged ? `Activity ratio ${ratio.toFixed(2)}× baseline — investigate.` : "Activity within normal envelope.",
  };
}

// 68. Static risk recalculation
export function staticRiskRecalc(parts: {
  customer: number; channel: number; product: number; geography: number;
}): { score: number; breakdown: typeof parts } {
  // Geography weights heaviest given UAE supervisory focus.
  const score = Math.round(
    parts.customer * 0.25 + parts.channel * 0.15 + parts.product * 0.25 + parts.geography * 0.35,
  );
  return { score: Math.min(100, score), breakdown: parts };
}

// 69. KYC refresh due-date tracker
export function kycRefreshDue(input: { lastReviewAt?: string; band: "low" | "medium" | "high" | "edd"; nowMs?: number }): {
  due: boolean;
  daysSinceReview: number;
  intervalMonths: number;
  rationale: string;
} {
  const now = input.nowMs ?? Date.now();
  const interval = input.band === "edd" ? 6 : input.band === "high" ? 12 : input.band === "medium" ? 24 : 36;
  if (!input.lastReviewAt) return { due: true, daysSinceReview: Infinity, intervalMonths: interval, rationale: "No prior KYC review." };
  const t = Date.parse(input.lastReviewAt);
  if (!Number.isFinite(t)) return { due: true, daysSinceReview: Infinity, intervalMonths: interval, rationale: "Unparseable last-review date." };
  const days = Math.floor((now - t) / 86400000);
  const due = days > interval * 30;
  return { due, daysSinceReview: days, intervalMonths: interval, rationale: due ? `KYC refresh overdue (${days}d since review; ${interval}-month cadence).` : `KYC review current (${days}d).` };
}

// 70. KYC completeness percentage
export interface KycPackage {
  identityVerified?: boolean;
  addressVerified?: boolean;
  sowDocumented?: boolean;
  sofVerified?: boolean;
  uboMapComplete?: boolean;
  pepCertified?: boolean;
  riskRated?: boolean;
  mlroSignedOff?: boolean;
  fourEyesRecorded?: boolean;
  ongoingMonitoringEnrolled?: boolean;
}
export function kycCompleteness(pkg: KycPackage): { pct: number; missing: string[] } {
  const items: Array<[keyof KycPackage, string]> = [
    ["identityVerified", "Identity verified"],
    ["addressVerified", "Address verified"],
    ["sowDocumented", "Source of wealth documented"],
    ["sofVerified", "Source of funds verified"],
    ["uboMapComplete", "UBO map complete"],
    ["pepCertified", "PEP certification"],
    ["riskRated", "Risk rated"],
    ["mlroSignedOff", "MLRO sign-off"],
    ["fourEyesRecorded", "Four-eyes approval"],
    ["ongoingMonitoringEnrolled", "Ongoing monitoring enrolled"],
  ];
  let done = 0;
  const missing: string[] = [];
  for (const [k, label] of items) {
    if (pkg[k]) done += 1;
    else missing.push(label);
  }
  return { pct: Math.round((done / items.length) * 100), missing };
}
