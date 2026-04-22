// Hawkeye Sterling — FIU filing shapes (goAML-aligned).
// Structured contracts for UAE FIU filings. The brain NEVER auto-submits.
// It assembles the envelope, surfaces gaps, and queues to the MLRO.
//
// Filing kinds supported:
//   - STR  · Suspicious Transaction Report
//   - SAR  · Suspicious Activity Report
//   - FFR  · Funds Freeze Report (following a confirmed sanctions match)
//   - PNMR · Partial-Name Match Report (partial match per EOCN regime)
//   - HRF  · High-Risk Country Funds (where applicable)
//
// The charter (P3) forbids legal conclusions in the narrative. Use
// "observable facts" language; the MLRO/FIU characterise the offence.

export type FilingKind = 'STR' | 'SAR' | 'FFR' | 'PNMR' | 'HRF';

export interface FilingSubject {
  name: string;
  aliases?: string[];
  entityType: 'individual' | 'organisation' | 'vessel' | 'aircraft' | 'other';
  nationality?: string;
  dateOfBirth?: string;
  identifiers?: Array<{ kind: string; number: string; issuer?: string }>;
}

export interface FilingReportingEntity {
  legalName: string;
  tradeLicence: string;
  moeRegistration: string;
  goamlRegistration: string;
  mlroName: string;
  mlroContact: string;
}

export interface FilingTransactionRef {
  transactionId: string;
  date: string;
  amount: number;
  currency: string;
  channel: 'cash' | 'wire' | 'card' | 'crypto' | 'barter' | 'other';
  counterparty?: string;
}

export interface FilingEnvelope {
  kind: FilingKind;
  reference: string;            // internal reference, e.g. HWK-01-...
  submittedAt: string;          // ISO 8601
  reportingEntity: FilingReportingEntity;
  subject: FilingSubject;
  transactions?: FilingTransactionRef[];
  narrative: {
    observableFacts: string[];  // verb-first factual statements
    redFlagIds: string[];
    typologyIds: string[];
    reasoningModeIds: string[];
    doctrineIds: string[];
  };
  attachments: Array<{ filename: string; mimeType: string; sha256?: string }>;
  approvals: {
    submitter: string;
    firstApprover: string;
    secondApprover: string;    // independent per CR 134/2025 Art.19
    mlroSignOff?: string;
  };
  deadlines: {
    freezeByUtc?: string;       // FFR — 24h from confirmed match
    fileByUtc?: string;         // FFR/PNMR — 5 business days
  };
  tippingOffGuardAck: true;     // literal true — structural attestation
  complianceCharterVersionHash: string; // from weaponized manifest
}

const DAY_MS = 86_400_000;

export interface DeadlineSeed {
  confirmedMatchUtc?: string;
  partialMatchUtc?: string;
  now?: Date;
}

export function deadlinesFor(kind: FilingKind, seed: DeadlineSeed = {}): FilingEnvelope['deadlines'] {
  const now = seed.now ?? new Date();
  const addBusinessDays = (d: Date, n: number) => {
    const out = new Date(d.getTime());
    let added = 0;
    while (added < n) {
      out.setTime(out.getTime() + DAY_MS);
      const day = out.getUTCDay();
      if (day !== 0 && day !== 6) added++;
    }
    return out.toISOString();
  };
  if (kind === 'FFR') {
    const anchor = seed.confirmedMatchUtc ? new Date(seed.confirmedMatchUtc) : now;
    return {
      freezeByUtc: new Date(anchor.getTime() + DAY_MS).toISOString(),
      fileByUtc: addBusinessDays(anchor, 5),
    };
  }
  if (kind === 'PNMR') {
    const anchor = seed.partialMatchUtc ? new Date(seed.partialMatchUtc) : now;
    return {
      fileByUtc: addBusinessDays(anchor, 5),
    };
  }
  if (kind === 'STR' || kind === 'SAR') {
    return {
      fileByUtc: addBusinessDays(now, 5),
    };
  }
  return {};
}

export function validateEnvelope(env: FilingEnvelope): string[] {
  const gaps: string[] = [];
  if (!env.reference) gaps.push('reference missing');
  if (!env.reportingEntity.goamlRegistration) gaps.push('reporting entity goAML registration missing');
  if (!env.reportingEntity.mlroName) gaps.push('MLRO name missing');
  if (!env.subject.name) gaps.push('subject name missing');
  if (!env.narrative.observableFacts.length) gaps.push('narrative has no observable facts');
  if (!env.approvals.firstApprover || !env.approvals.secondApprover) gaps.push('four-eyes approvals incomplete');
  if (env.approvals.firstApprover === env.approvals.submitter) gaps.push('first approver must differ from submitter (SoD)');
  if (env.approvals.secondApprover === env.approvals.firstApprover) gaps.push('second approver must differ from first (SoD)');
  if (env.approvals.secondApprover === env.approvals.submitter) gaps.push('second approver must differ from submitter (SoD)');
  if (env.tippingOffGuardAck !== true) gaps.push('tipping-off guard attestation missing');
  if (!env.complianceCharterVersionHash) gaps.push('charter integrity hash missing');
  return gaps;
}
