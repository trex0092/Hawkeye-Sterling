// Customer categorization engine (Part 2 of the build spec).
// Translates screening severity + hit metadata into regulatory risk
// category, due diligence level, review schedule, and override flags
// as required by Federal Decree-Law No. 10 of 2025 and FATF R.10.

export type ScreeningSeverity = "clear" | "low" | "medium" | "high" | "critical";
export type RiskCategory      = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DueDiligenceLevel = "CDD" | "SDD" | "EDD";

// Mandatory list IDs that trigger override rules.
const LIST_UAE_LTL  = "uae_ltl";
const LIST_OFAC_SDN = "ofac_sdn";
const LIST_UAE_EOCN = "uae_eocn";

export interface CategorizationInput {
  severity: ScreeningSeverity;
  /** listId strings from every hit returned by the screener. */
  hitListIds: string[];
  isPep: boolean;
  /** Subject has a prior STR or SAR filing on record. */
  hasStrSarOnRecord: boolean;
}

export interface CategorizationResult {
  riskCategory:               RiskCategory;
  dueDiligence:               DueDiligenceLevel;
  reviewMonths:               number;
  nextReviewDate:             string;     // ISO date (YYYY-MM-DD)
  seniorManagementApproval:   boolean;
  autoFreezeRequired:         boolean;
  transactionSuspendRequired: boolean;
  provisionalResult:          boolean;    // true when any mandatory list was stale
  overrideReasons:            string[];
}

export function categorize(input: CategorizationInput): CategorizationResult {
  const { severity, hitListIds, isPep, hasStrSarOnRecord } = input;

  // ── Base mapping ─────────────────────────────────────────────────────────
  let riskCategory:             RiskCategory      = "LOW";
  let dueDiligence:             DueDiligenceLevel = "CDD";
  let reviewMonths:             number            = 12;
  let seniorManagementApproval                    = false;
  let autoFreezeRequired                          = false;
  let transactionSuspendRequired                  = false;
  const overrideReasons: string[]                 = [];

  const normSeverity = severity === "low" ? "clear" : severity;
  switch (normSeverity) {
    case "clear":
      riskCategory = "LOW"; dueDiligence = "CDD"; reviewMonths = 12;
      break;
    case "medium":
      riskCategory = "MEDIUM"; dueDiligence = "SDD"; reviewMonths = 6;
      break;
    case "high":
      riskCategory = "HIGH"; dueDiligence = "EDD"; reviewMonths = 3;
      break;
    case "critical":
      riskCategory = "CRITICAL"; dueDiligence = "EDD"; reviewMonths = 3;
      seniorManagementApproval = true;
      break;
  }

  // ── Override rules (applied in priority order) ────────────────────────────

  // UAE LTL — force CRITICAL, auto-freeze, do not wait for disambiguation.
  if (hitListIds.includes(LIST_UAE_LTL)) {
    riskCategory = "CRITICAL"; dueDiligence = "EDD"; reviewMonths = 3;
    seniorManagementApproval = true;
    autoFreezeRequired = true;
    overrideReasons.push("UAE LTL hit — force CRITICAL + auto-freeze (Cabinet Resolution 74/2020)");
  }

  // OFAC SDN / UAE EOCN — force CRITICAL, suspend all transactions immediately.
  if (hitListIds.includes(LIST_OFAC_SDN) || hitListIds.includes(LIST_UAE_EOCN)) {
    riskCategory = "CRITICAL"; dueDiligence = "EDD"; reviewMonths = 3;
    seniorManagementApproval = true;
    transactionSuspendRequired = true;
    overrideReasons.push(
      "OFAC SDN / UAE EOCN hit — force CRITICAL + suspend all transactions immediately",
    );
  }

  // PEP — force HIGH minimum, senior management approval.
  if (isPep && (riskCategory === "LOW" || riskCategory === "MEDIUM")) {
    riskCategory = "HIGH"; dueDiligence = "EDD"; reviewMonths = 3;
    seniorManagementApproval = true;
    overrideReasons.push("PEP identified — force HIGH minimum (Federal Decree-Law No. 10 of 2025 Art.19)");
  }

  // Previous STR/SAR — force HIGH minimum.
  if (hasStrSarOnRecord && (riskCategory === "LOW" || riskCategory === "MEDIUM")) {
    riskCategory = "HIGH"; dueDiligence = "EDD"; reviewMonths = 3;
    overrideReasons.push("Prior STR/SAR on record — force HIGH (Federal Decree-Law No. 10 of 2025 Art.18)");
  }

  const nextReview = new Date();
  nextReview.setMonth(nextReview.getMonth() + reviewMonths);

  return {
    riskCategory,
    dueDiligence,
    reviewMonths,
    nextReviewDate:             nextReview.toISOString().slice(0, 10),
    seniorManagementApproval,
    autoFreezeRequired,
    transactionSuspendRequired,
    provisionalResult:          false, // caller sets this when lists were stale
    overrideReasons,
  };
}

/** Compute SLA deadline from case creation time and severity. */
export function slaDeadline(createdAt: string, severity: RiskCategory): string {
  const created = new Date(createdAt);
  // CRITICAL/HIGH: 5 days. MEDIUM: 10 days. LOW: 30 days.
  const days = severity === "CRITICAL" || severity === "HIGH" ? 5
    : severity === "MEDIUM" ? 10 : 30;
  created.setDate(created.getDate() + days);
  return created.toISOString();
}
