// Hawkeye Sterling — wave-3 mode: assay_certificate_audit
// Detects gaps and inconsistencies in gold/precious-metal assay
// certificates. Anchors: LBMA Good Delivery Rules (assay accreditation
// + reporting standard), LBMA Responsible Gold Guidance v9, ISO/IEC
// 17025 (assay laboratory accreditation), UAE MoE Circular 2/2024.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface AssayCertificate {
  certId?: string;
  batchId?: string;
  laboratory?: string;
  laboratoryIso17025Accredited?: boolean;
  laboratoryLbmaApproved?: boolean;          // LBMA Good Delivery list
  assayDate?: string;
  finenessReportedPpt?: number;              // parts per thousand (e.g. 999.9 for fine gold)
  declaredMassGrams?: number;
  assayedMassGrams?: number;
  hasSignature?: boolean;
  hasOriginCountry?: boolean;
  isCertificateScanned?: boolean;
  certificateAgeDays?: number;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// LBMA Good Delivery Rules: fine gold should be ≥ 995.0 ppt for the
// London market (4-9s standard = 999.9 ppt). Below 995 ppt requires
// special handling.
const FINENESS_LBMA_MIN = 995.0;
const MASS_DEVIATION_FLAG_PCT = 0.001;     // 0.1% — typical assay tolerance
const MASS_DEVIATION_ESCALATE_PCT = 0.01;  // 1% — material discrepancy
const STALE_CERT_DAYS = 365;

export const assayCertificateAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const certs = typedEvidence<AssayCertificate>(ctx, 'assayCertificates');
  if (certs.length === 0) {
    return {
      modeId: 'assay_certificate_audit',
      category: 'forensic' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No assayCertificates evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const c of certs) {
    const ref = c.certId ?? c.batchId ?? '(unidentified)';
    if (c.laboratoryIso17025Accredited === false) {
      hits.push({ id: 'no_iso17025', label: `Lab "${c.laboratory ?? '?'}" not ISO/IEC 17025 accredited`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (c.laboratoryLbmaApproved === false) {
      hits.push({ id: 'no_lbma_approval', label: `Lab "${c.laboratory ?? '?'}" not on LBMA Good Delivery list`, weight: 0.25, evidence: ref, severity: 'flag' });
    }
    if (typeof c.finenessReportedPpt === 'number' && c.finenessReportedPpt < FINENESS_LBMA_MIN) {
      hits.push({ id: 'sub_lbma_fineness', label: `Reported fineness ${c.finenessReportedPpt} ppt < LBMA min ${FINENESS_LBMA_MIN} ppt`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (c.declaredMassGrams && c.assayedMassGrams && c.declaredMassGrams > 0) {
      const dev = Math.abs(c.declaredMassGrams - c.assayedMassGrams) / c.declaredMassGrams;
      if (dev >= MASS_DEVIATION_ESCALATE_PCT) {
        hits.push({ id: 'mass_deviation_critical', label: `Declared vs assayed mass deviation ${(dev * 100).toFixed(2)}% (≥${MASS_DEVIATION_ESCALATE_PCT * 100}%)`, weight: 0.5, evidence: ref, severity: 'escalate' });
      } else if (dev >= MASS_DEVIATION_FLAG_PCT) {
        hits.push({ id: 'mass_deviation_flag', label: `Declared vs assayed mass deviation ${(dev * 100).toFixed(3)}% (≥${MASS_DEVIATION_FLAG_PCT * 100}%)`, weight: 0.2, evidence: ref, severity: 'flag' });
      }
    }
    if (c.hasSignature === false) {
      hits.push({ id: 'unsigned_cert', label: 'Assay certificate unsigned', weight: 0.2, evidence: ref, severity: 'flag' });
    }
    if (c.hasOriginCountry === false) {
      hits.push({ id: 'no_origin_country', label: 'Origin country missing on certificate', weight: 0.2, evidence: ref, severity: 'flag' });
    }
    if (typeof c.certificateAgeDays === 'number' && c.certificateAgeDays > STALE_CERT_DAYS) {
      hits.push({ id: 'stale_certificate', label: `Certificate ${c.certificateAgeDays} days old (> ${STALE_CERT_DAYS})`, weight: 0.15, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'assay_certificate_audit',
    category: 'forensic' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${certs.length} assay certificate(s) reviewed; ${hits.length} signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: LBMA Good Delivery Rules · LBMA RGG v9 · ISO/IEC 17025 · UAE MoE Circular 2/2024.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default assayCertificateAuditApply;
