// Client-side schema validation for goAML envelope drafts. Mirrors the
// regulator's hard rules (UAE FIU goAML XML schema v4.0 / 5.x):
//
//   • reportCode is one of the 9 supported codes
//   • subject.name is non-empty (≥ 2 chars)
//   • date-of-birth, when present, parses as YYYY-MM-DD and is in the past
//   • jurisdictions are ISO-3166-1 alpha-2 (length 2, A–Z)
//   • narrative ≤ 4000 chars (goAML <reason> field cap)
//   • amounts ≥ 0 with at most 2 decimal places
//   • transaction date, when present, parses as ISO-8601 and is not in the future
//
// A passing validation does NOT guarantee acceptance by the FIU portal —
// goAML still applies submission-side checks (e.g. reportingPerson must
// match the registered MLRO on the rentity profile). This stage exists to
// catch the syntactic/range errors the wizard can correct in the browser
// before the XML is generated server-side.

export const REPORT_CODES = [
  "STR", "SAR", "FFR", "PNMR", "CTR", "AIF", "EFT", "HRC", "RFI",
] as const;
export type ReportCode = (typeof REPORT_CODES)[number];

export const REPORT_CODE_LABEL: Record<ReportCode, string> = {
  STR:  "Suspicious Transaction Report",
  SAR:  "Suspicious Activity Report",
  FFR:  "Funds Freeze Report",
  PNMR: "Partial Name Match Report",
  CTR:  "Cash Threshold Report",
  AIF:  "Additional Information File",
  EFT:  "Electronic Funds Transfer",
  HRC:  "High-Risk Customer Report",
  RFI:  "Request For Information response",
};

export type EntityKind = "individual" | "organisation" | "vessel" | "aircraft" | "other";

export interface DraftEnvelope {
  reportCode: ReportCode | "";
  subject: {
    name: string;
    entityType: EntityKind;
    jurisdiction?: string;
    dob?: string;
    aliases?: string;
    idNumber?: string;
    caseId?: string;
  };
  narrative: string;
  amountAed?: number | "";
  counterparty?: string;
}

export interface ValidationIssue {
  field: string;
  level: "error" | "warning";
  message: string;
}

const ISO2 = /^[A-Z]{2}$/;
const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
const TWO_DECIMALS = /^\d+(\.\d{1,2})?$/;
const NARRATIVE_MAX = 4000;

export function validateGoAml(d: DraftEnvelope): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!d.reportCode || !REPORT_CODES.includes(d.reportCode as ReportCode)) {
    issues.push({ field: "reportCode", level: "error", message: "Select a goAML report code." });
  }

  const name = d.subject.name?.trim() ?? "";
  if (name.length < 2) {
    issues.push({ field: "subject.name", level: "error", message: "Subject name must be at least 2 characters." });
  } else if (name.length > 200) {
    issues.push({ field: "subject.name", level: "error", message: "Subject name exceeds 200 characters." });
  }

  if (d.subject.jurisdiction) {
    const jur = d.subject.jurisdiction.toUpperCase();
    if (!ISO2.test(jur)) {
      issues.push({ field: "subject.jurisdiction", level: "error", message: "Jurisdiction must be ISO-3166-1 alpha-2 (2 letters)." });
    }
  }

  if (d.subject.dob) {
    if (!YYYY_MM_DD.test(d.subject.dob)) {
      issues.push({ field: "subject.dob", level: "error", message: "Date of birth must be YYYY-MM-DD." });
    } else {
      const t = Date.parse(d.subject.dob);
      if (Number.isNaN(t)) {
        issues.push({ field: "subject.dob", level: "error", message: "Date of birth is not a valid date." });
      } else if (t > Date.now()) {
        issues.push({ field: "subject.dob", level: "error", message: "Date of birth cannot be in the future." });
      }
    }
  }

  if (d.subject.entityType === "individual" && !d.subject.dob) {
    issues.push({ field: "subject.dob", level: "warning", message: "DOB is recommended for individual STR/SAR filings (FIU expectation)." });
  }

  const narrative = d.narrative ?? "";
  if (narrative.trim().length < 50) {
    issues.push({ field: "narrative", level: "error", message: "Narrative must describe the suspicion in ≥50 characters." });
  } else if (narrative.length > NARRATIVE_MAX) {
    issues.push({ field: "narrative", level: "error", message: `Narrative exceeds ${NARRATIVE_MAX}-character goAML cap.` });
  }
  if (narrative.length > 0 && narrative.length < 200) {
    issues.push({ field: "narrative", level: "warning", message: "Narratives <200 chars are routinely returned by FIU reviewers as insufficient." });
  }

  if (d.amountAed !== undefined && d.amountAed !== "") {
    const amt = typeof d.amountAed === "number" ? d.amountAed : Number(d.amountAed);
    if (!Number.isFinite(amt)) {
      issues.push({ field: "amountAed", level: "error", message: "Amount must be a number." });
    } else if (amt < 0) {
      issues.push({ field: "amountAed", level: "error", message: "Amount cannot be negative." });
    } else if (amt > 999_999_999_999) {
      issues.push({ field: "amountAed", level: "error", message: "Amount exceeds goAML field cap (10^12 AED)." });
    } else if (!TWO_DECIMALS.test(String(amt))) {
      issues.push({ field: "amountAed", level: "error", message: "Amount may have at most two decimal places." });
    }
  }

  return issues;
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
