// Hawkeye Sterling — Multi-Jurisdiction STR Obligation Conflict Resolver (Wave 14 Feature 10).
// Resolves STR/SAR filing obligation conflicts across jurisdictions.
// Partially closes CG-4 (goAML entity ID requirements per jurisdiction).

import {
  STR_OBLIGATION_MATRIX,
  applicableJurisdictions,
  type JurisdictionObligation,
  type ObligationConflict,
} from './str-obligation-matrix.js';

export interface StrObligationRequest {
  subjectJurisdiction?: string;
  transactionJurisdictions?: string[];
  reportType: 'STR' | 'SAR' | 'CTR' | 'FFR';
  amountUsd?: number;
}

export interface StrObligationResponse {
  obligations: JurisdictionObligation[];
  conflicts: ObligationConflict[];
  recommendedFilingOrder: JurisdictionObligation[];
  goAmlEntityIdRequirements: string[];
  tippingOffRiskSummary: string;
  methodology: string;
}

// Jurisdiction risk ranking for UAE-nexus cases (higher = file first)
const JURISDICTION_PRIORITY: Record<string, number> = {
  UAE: 100,
  FATF: 80,
  EU: 70,
  UK: 65,
  US: 60,
};

function detectConflicts(obligations: JurisdictionObligation[]): ObligationConflict[] {
  const conflicts: ObligationConflict[] = [];
  const mandatory = obligations.filter((o) => o.obligationType === 'mandatory');
  const prohibited = obligations.filter((o) => o.obligationType === 'prohibited');

  // Conflict: one requires, another prohibits
  for (const m of mandatory) {
    for (const p of prohibited) {
      conflicts.push({
        conflictType: 'one_requires_other_prohibits',
        jurisdictions: [m.jurisdiction, p.jurisdiction],
        resolution: 'seek_legal_advice',
        regulatoryGuidance:
          `${m.jurisdiction} mandates filing while ${p.jurisdiction} prohibits it. ` +
          `Seek qualified legal advice. Generally, home-country obligations (${m.jurisdiction}) take precedence, ` +
          `but legal professional privilege may apply.`,
        articleCitations: [...m.legalBasis, ...p.legalBasis],
      });
    }
  }

  // Conflict: deadline mismatch (more than 3× difference)
  for (let i = 0; i < mandatory.length; i++) {
    for (let j = i + 1; j < mandatory.length; j++) {
      const a = mandatory[i]; const b = mandatory[j];
      if (!a || !b) continue;
      if (a.filingDeadlineHours === null || b.filingDeadlineHours === null) continue;
      const ratio = Math.max(a.filingDeadlineHours, b.filingDeadlineHours) /
        Math.min(a.filingDeadlineHours, b.filingDeadlineHours);
      if (ratio >= 3) {
        const earlier = a.filingDeadlineHours < b.filingDeadlineHours ? a : b;
        const later = earlier === a ? b : a;
        conflicts.push({
          conflictType: 'deadline_mismatch',
          jurisdictions: [a.jurisdiction, b.jurisdiction],
          resolution: 'file_in_highest_risk_first',
          regulatoryGuidance:
            `${earlier.jurisdiction} requires filing within ${earlier.filingDeadlineHours}h ` +
            `while ${later.jurisdiction} allows ${later.filingDeadlineHours}h. ` +
            `File to ${earlier.jurisdiction} first to meet the tighter deadline.`,
          articleCitations: [...a.legalBasis.slice(0, 1), ...b.legalBasis.slice(0, 1)],
        });
      }
    }
  }

  // Conflict: tipping-off scope mismatch
  for (let i = 0; i < mandatory.length; i++) {
    for (let j = i + 1; j < mandatory.length; j++) {
      const a = mandatory[i]; const b = mandatory[j];
      if (!a || !b) continue;
      if (
        (a.tippingOffProhibitionScope === 'broad' && b.tippingOffProhibitionScope === 'narrow') ||
        (b.tippingOffProhibitionScope === 'broad' && a.tippingOffProhibitionScope === 'narrow')
      ) {
        conflicts.push({
          conflictType: 'tipping_off_scope_conflict',
          jurisdictions: [a.jurisdiction, b.jurisdiction],
          resolution: 'escalate_to_mlro',
          regulatoryGuidance:
            `${a.jurisdiction} has a ${a.tippingOffProhibitionScope} tipping-off prohibition ` +
            `while ${b.jurisdiction} has ${b.tippingOffProhibitionScope} scope. ` +
            `Apply the stricter (broad) prohibition: do not disclose to subject under any circumstances.`,
          articleCitations: [
            ...a.legalBasis.filter((l) => l.toLowerCase().includes('tipping')),
            ...b.legalBasis.filter((l) => l.toLowerCase().includes('tipping')),
          ],
        });
      }
    }
  }

  // Conflict: both mandatory (simultaneous filing)
  if (mandatory.length >= 2) {
    conflicts.push({
      conflictType: 'simultaneous_filing_required',
      jurisdictions: [mandatory[0]?.jurisdiction ?? '', mandatory[1]?.jurisdiction ?? ''],
      resolution: 'file_both',
      regulatoryGuidance:
        `Multiple jurisdictions require filing. File to all mandatory jurisdictions. ` +
        `Use the prioritised filing order to meet the tightest deadline first.`,
      articleCitations: mandatory.flatMap((o) => o.legalBasis.slice(0, 1)),
    });
  }

  return conflicts;
}

function summariseTippingOffRisk(obligations: JurisdictionObligation[]): string {
  const broadJurisdictions = obligations
    .filter((o) => o.tippingOffProhibitionScope === 'broad')
    .map((o) => o.jurisdiction);

  if (broadJurisdictions.length > 0) {
    return `HIGH: ${broadJurisdictions.join(', ')} impose BROAD tipping-off prohibitions. ` +
      `Do not communicate STR/SAR filing status to the subject under any circumstances. ` +
      `Criminal liability attaches (UAE FDL 10/2025 Art.25, UK POCA 2002 s.333A).`;
  }
  return 'MEDIUM: Standard tipping-off prohibitions apply. Do not disclose filing status to subject.';
}

export function resolveStrObligations(
  request: StrObligationRequest,
): StrObligationResponse {
  const jurisdictionIds = applicableJurisdictions(
    request.subjectJurisdiction,
    request.transactionJurisdictions ?? [],
  );

  const obligations = jurisdictionIds
    .map((j) => STR_OBLIGATION_MATRIX[j])
    .filter((o): o is JurisdictionObligation => {
      if (!o) return false;
      // Apply amount threshold where applicable
      if (o.amountThresholdUsd !== null && request.amountUsd !== undefined) {
        if (request.amountUsd < o.amountThresholdUsd) {
          (o as JurisdictionObligation & { obligationType: string }).obligationType = 'not_applicable';
        }
      }
      return true;
    })
    .sort((a, b) => (JURISDICTION_PRIORITY[b.jurisdiction] ?? 0) - (JURISDICTION_PRIORITY[a.jurisdiction] ?? 0));

  const conflicts = detectConflicts(obligations);
  const recommendedFilingOrder = obligations.filter((o) => o.obligationType === 'mandatory');
  const goAmlEntityIdRequirements = obligations
    .map((o) => o.goAmlEntityIdFormat)
    .filter((f): f is string => f !== null && f !== '');

  return {
    obligations,
    conflicts,
    recommendedFilingOrder,
    goAmlEntityIdRequirements,
    tippingOffRiskSummary: summariseTippingOffRisk(obligations),
    methodology:
      'Multi-jurisdiction obligation matrix lookup + conflict detection. ' +
      'UAE FDL 10/2025 Art.17; FATF R.20-21; EU 6AMLD Art.36-40; UK POCA 2002 ss.330-332; 31 USC §5318(g). ' +
      'goAML entity ID requirements per jurisdiction (CG-4).',
  };
}
