// Hawkeye Sterling — GDPR data-subject rights helpers.
//
// Provides:
//   pseudonymizeSubject   — Article 17 erasure: replace PII with redaction tokens.
//   buildGdprExportPackage — Article 20 portability: package subject + cases.

import type { Subject, CaseRecord } from "@/lib/types";

export interface GdprExportPackage {
  exportedAt: string;
  subject: Partial<Subject>;
  cases: CaseRecord[];
  screeningHistory: Subject["screeningHistory"];
}

/**
 * Returns a copy of the subject with all PII fields replaced by redaction
 * tokens. The subject ID is preserved so audit trail entries remain linkable.
 * Fields cleared: name, meta, aliases, notes, walletAddresses, pep rationale.
 * Structural fields (id, status, riskScore, country, etc.) are kept so the
 * compliance record remains usable for AML reporting obligations.
 */
export function pseudonymizeSubject(subject: Subject): Subject {
  const token = `[REDACTED-${subject.id.slice(0, 8)}]`;
  return {
    ...subject,
    name: token,
    meta: "",
    aliases: [],
    notes: undefined,
    walletAddresses: [],
    // Clear PEP rationale (names a real person) but keep tier flag.
    pep: subject.pep ? { tier: subject.pep.tier } : undefined,
    // Signal that GDPR erasure has been applied.
    gdprErased: true,
  } as Subject & { gdprErased: boolean };
}

/**
 * Assembles the Article 20 data-portability export package. The subject
 * record is included in full (minus fields already redacted by prior erasure).
 * Screening history is extracted at the top level for analyst readability.
 */
export function buildGdprExportPackage(
  subject: Subject,
  cases: CaseRecord[],
): GdprExportPackage {
  const { screeningHistory, ...subjectWithoutHistory } = subject;
  return {
    exportedAt: new Date().toISOString(),
    subject: subjectWithoutHistory,
    cases,
    screeningHistory: screeningHistory ?? [],
  };
}
