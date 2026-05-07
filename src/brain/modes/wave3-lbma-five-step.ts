// Hawkeye Sterling — wave-3 mode: lbma_five_step_gate
// Verifies refiner compliance with the LBMA Responsible Gold Guidance v9
// 5-step framework. Anchors: LBMA RGG v9 (effective 2022-01-01),
// LBMA Good Delivery Rules, OECD DDG 5-step framework,
// UAE MoE Circular 2/2024 (LBMA-aligned obligations for UAE refiners).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface StepStatus { complete?: boolean; lastUpdated?: string }
interface Step2 extends StepStatus { cahraIdentified?: boolean }
interface Step3 extends StepStatus { suspendedSuppliers?: number }
interface Step4 extends StepStatus { auditorName?: string; auditDate?: string; outcome?: 'conformant' | 'major_findings' | 'minor_findings' }
interface Step5 extends StepStatus { publicUrl?: string; publishedAt?: string }

interface LbmaComplianceRecord {
  refinerId?: string;
  reportingYear?: string;
  step1_managementSystems?: StepStatus;
  step2_riskIdentification?: Step2;
  step3_riskMitigation?: Step3;
  step4_independentAudit?: Step4;
  step5_publicReport?: Step5;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const lbmaFiveStepGateApply = async (ctx: BrainContext): Promise<Finding> => {
  const records = typedEvidence<LbmaComplianceRecord>(ctx, 'lbmaCompliance');
  if (records.length === 0) {
    return {
      modeId: 'lbma_five_step_gate',
      category: 'compliance_framework' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'reasoning'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No lbmaCompliance evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const thisYear = new Date().getFullYear().toString();
  const hits: SignalHit[] = [];

  for (const r of records) {
    const ref = r.refinerId ?? '(unidentified)';
    const steps = [
      { n: 1, label: 'Management Systems', s: r.step1_managementSystems },
      { n: 2, label: 'Risk Identification', s: r.step2_riskIdentification },
      { n: 3, label: 'Risk Mitigation', s: r.step3_riskMitigation },
      { n: 4, label: 'Independent Audit', s: r.step4_independentAudit },
      { n: 5, label: 'Public Report', s: r.step5_publicReport },
    ];
    const completeCount = steps.filter((x) => x.s?.complete).length;

    for (const x of steps) {
      if (!x.s?.complete) {
        const isAudit = x.n === 4;
        hits.push({
          id: `step${x.n}_incomplete`,
          label: `Step ${x.n} (${x.label}) incomplete`,
          weight: isAudit ? 0.35 : 0.15,
          evidence: ref,
          severity: isAudit ? 'escalate' : 'flag',
        });
      }
    }
    if (r.step4_independentAudit?.outcome === 'major_findings') {
      hits.push({ id: 'step4_major_findings', label: 'Step 4 audit reported MAJOR findings', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (completeCount < 3) {
      hits.push({ id: 'majority_incomplete', label: `Only ${completeCount}/5 LBMA steps complete (majority gap)`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (completeCount < 5 && r.reportingYear === thisYear) {
      hits.push({ id: 'year_end_gap', label: `${5 - completeCount} step(s) incomplete for current reporting year ${thisYear}`, weight: 0.2, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'lbma_five_step_gate',
    category: 'compliance_framework' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'reasoning'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.95, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${records.length} refiner record(s) reviewed; ${hits.length} LBMA 5-step gap(s) detected.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: LBMA RGG v9 (2022-01-01) · LBMA Good Delivery Rules · OECD DDG 5-step · UAE MoE Circular 2/2024.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default lbmaFiveStepGateApply;
