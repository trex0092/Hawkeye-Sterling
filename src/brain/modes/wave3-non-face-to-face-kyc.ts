// Hawkeye Sterling — wave-3 mode: non_face_to_face_kyc_anomaly
// Detects insufficient verification on remote / non-face-to-face
// onboarding. Anchors: FATF R.10 (CDD) · UAE FDL 10/2025 Art.10 ·
// Cabinet Res 10/2019.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface KycRecord {
  customerId: string;
  channel?: 'in_person' | 'remote_video' | 'remote_no_video' | 'agent_referral';
  livenessVerified?: boolean;
  documentVerificationOcrOk?: boolean;
  documentVerificationChipReadOk?: boolean;
  ipCountryIso2?: string;
  declaredCountryIso2?: string;
  edDApplied?: boolean;
  riskRating?: 'low' | 'medium' | 'high';
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const nonFaceToFaceKycApply = async (ctx: BrainContext): Promise<Finding> => {
  const records = typedEvidence<KycRecord>(ctx, 'kycRecords');
  if (records.length === 0) {
    return {
      modeId: 'non_face_to_face_kyc_anomaly',
      category: 'identity_fraud' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No kycRecords evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const r of records) {
    const isRemote = r.channel === 'remote_no_video' || r.channel === 'remote_video' || r.channel === 'agent_referral';
    if (!isRemote) continue;
    const flags: string[] = [];
    if (r.livenessVerified !== true) flags.push('no_liveness');
    if (r.documentVerificationOcrOk !== true) flags.push('no_ocr');
    if (r.documentVerificationChipReadOk !== true) flags.push('no_chip_read');
    if (r.ipCountryIso2 && r.declaredCountryIso2 && r.ipCountryIso2.toUpperCase() !== r.declaredCountryIso2.toUpperCase()) flags.push('ip_country_mismatch');
    if (r.riskRating === 'high' && r.edDApplied !== true) flags.push('high_risk_no_edd');

    if (flags.length >= 2) {
      hits.push({
        id: 'remote_kyc_gaps',
        label: `${r.customerId}: ${flags.length} verification gap(s)`,
        weight: Math.min(0.4, 0.15 + flags.length * 0.07),
        evidence: `${r.customerId} (${r.channel}): ${flags.join(', ')}`,
      });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'non_face_to_face_kyc_anomaly',
    category: 'identity_fraud' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} non-F2F-KYC signal(s) over ${records.length} record(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.10 · UAE FDL 10/2025 Art.10 · Cabinet Res 10/2019.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default nonFaceToFaceKycApply;
