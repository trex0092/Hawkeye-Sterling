// Hawkeye Sterling — real governance modes.
//
//   four_eyes_stress        — submitter/approver overlap detection
//   escalation_trigger      — did any finding exceed the stated escalation threshold?
//   control_effectiveness   — control-pass rate vs target
//   policy_drift            — divergence between written policy + observed practice
//   residual_vs_inherent    — delta between inherent risk and residual after controls
//   regulatory_mapping      — proportion of controls mapped to citations
//   documentation_quality   — completeness / recency of supporting docs

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

function mk(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  score: number,
  confidence: number,
  rationale: string,
  hypothesis?: Finding['hypothesis'],
): Finding {
  const f: Finding = {
    modeId, category, faculties, verdict,
    score: Math.min(1, Math.max(0, score)),
    confidence: Math.min(1, Math.max(0, confidence)),
    rationale,
    evidence: [],
    producedAt: Date.now(),
  };
  if (hypothesis !== undefined) f.hypothesis = hypothesis;
  return f;
}

function recs(name: string, ctx: BrainContext): Array<Record<string, unknown>> {
  const v = (ctx.evidence as Record<string, unknown>)[name];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') as Array<Record<string, unknown>>;
}

// ── four_eyes_stress ───────────────────────────────────────────────────
// Four-eyes / segregation-of-duties check. Looks at evidence.approvals:
// [{submitter, firstApprover, secondApprover}]. Violations: same actor in
// >1 role on any row (Cabinet Resolution 134/2025 Art.19).
export const fourEyesStressApply = async (ctx: BrainContext): Promise<Finding> => {
  const rows = recs('approvals', ctx);
  if (rows.length === 0) {
    return mk('four_eyes_stress', 'governance', ['strong_brain'],
      'inconclusive', 0, 0.5,
      'Four-eyes: evidence.approvals not supplied; cannot audit SoD.');
  }
  const violations: string[] = [];
  for (const r of rows) {
    const s = typeof r.submitter === 'string' ? r.submitter : '';
    const a1 = typeof r.firstApprover === 'string' ? r.firstApprover : '';
    const a2 = typeof r.secondApprover === 'string' ? r.secondApprover : '';
    if (s && a1 && s === a1) violations.push(`${r.caseId ?? '?'}: submitter=first approver (${s})`);
    if (a1 && a2 && a1 === a2) violations.push(`${r.caseId ?? '?'}: 1st=2nd approver (${a1})`);
    if (s && a2 && s === a2) violations.push(`${r.caseId ?? '?'}: submitter=2nd approver (${s})`);
  }
  if (violations.length === 0) {
    return mk('four_eyes_stress', 'governance', ['strong_brain'],
      'clear', 0, 0.9,
      `Four-eyes: ${rows.length} approval rows, no overlapping actors. Cabinet Resolution 134/2025 Art.19 satisfied.`);
  }
  const severity = Math.min(1, violations.length / Math.max(1, rows.length));
  return mk('four_eyes_stress', 'governance', ['strong_brain'],
    severity > 0.2 ? 'block' : 'escalate', severity, 0.95,
    `Four-eyes: ${violations.length}/${rows.length} approval rows violate SoD: ${violations.slice(0, 4).join(' | ')}${violations.length > 4 ? ` | ... (+${violations.length - 4} more)` : ''}. Hard-stop: redline 'rl_four_eyes_violated' (Cabinet Resolution 134/2025 Art.19).`,
    'material_concern');
};

// ── escalation_trigger ─────────────────────────────────────────────────
// Any prior finding with score ≥ 0.75 → escalation warranted.
export const escalationTriggerApply = async (ctx: BrainContext): Promise<Finding> => {
  const priors = ctx.priorFindings.filter((f) =>
    !(f.tags?.includes('meta') || f.tags?.includes('introspection')) &&
    !f.rationale.startsWith('[stub]'));
  const triggers = priors.filter((f) => f.score >= 0.75);
  if (triggers.length === 0) {
    return mk('escalation_trigger', 'governance', ['strong_brain'],
      'clear', 0, 0.85,
      `Escalation: no prior finding reached the 0.75 severity threshold across ${priors.length} contributors.`);
  }
  return mk('escalation_trigger', 'governance', ['strong_brain'],
    'escalate', 0.7, 0.9,
    `Escalation: ${triggers.length} finding(s) exceeded 0.75 severity (${triggers.slice(0, 3).map((f) => `${f.modeId}@${f.score.toFixed(2)}`).join(', ')}); 2-sign-off required.`);
};

// ── control_effectiveness ──────────────────────────────────────────────
// evidence.controls: [{ id, designEffective, operatingEffective }]
export const controlEffectivenessApply = async (ctx: BrainContext): Promise<Finding> => {
  const ctrls = recs('controls', ctx);
  if (ctrls.length === 0) {
    return mk('control_effectiveness', 'governance', ['strong_brain'],
      'inconclusive', 0, 0.5,
      'Control effectiveness: evidence.controls not supplied.');
  }
  const passDesign = ctrls.filter((c) => c.designEffective === true).length;
  const passOp = ctrls.filter((c) => c.operatingEffective === true).length;
  const dRate = passDesign / ctrls.length;
  const oRate = passOp / ctrls.length;
  const composite = (dRate + oRate) / 2;
  const verdict: Verdict = composite < 0.5 ? 'escalate' : composite < 0.75 ? 'flag' : 'clear';
  return mk('control_effectiveness', 'governance', ['strong_brain'],
    verdict, 1 - composite, 0.9,
    `Control effectiveness: design ${(dRate * 100).toFixed(0)}% (${passDesign}/${ctrls.length}), operating ${(oRate * 100).toFixed(0)}% (${passOp}/${ctrls.length}); composite ${(composite * 100).toFixed(0)}%.`,
    composite < 0.5 ? 'material_concern' : undefined);
};

// ── policy_drift ───────────────────────────────────────────────────────
// evidence.policyDrift: number of control instances observed in practice
//   that diverge from the written policy.
export const policyDriftApply = async (ctx: BrainContext): Promise<Finding> => {
  const drift = (ctx.evidence as Record<string, unknown>).policyDrift;
  if (typeof drift !== 'number' || !Number.isFinite(drift)) {
    return mk('policy_drift', 'governance', ['introspection'],
      'inconclusive', 0, 0.5,
      'Policy drift: evidence.policyDrift numeric score not supplied.');
  }
  const d = Math.max(0, Math.min(1, drift));
  const verdict: Verdict = d > 0.5 ? 'escalate' : d > 0.2 ? 'flag' : 'clear';
  return mk('policy_drift', 'governance', ['introspection'],
    verdict, d, 0.85,
    `Policy drift score: ${d.toFixed(2)} (0 = written policy matches practice, 1 = total divergence).`);
};

// ── residual_vs_inherent ───────────────────────────────────────────────
// evidence.inherentRisk + evidence.residualRisk (both 0..1) — flag if
// controls don't meaningfully reduce inherent risk.
export const residualVsInherentApply = async (ctx: BrainContext): Promise<Finding> => {
  const e = ctx.evidence as Record<string, unknown>;
  const inh = typeof e.inherentRisk === 'number' ? e.inherentRisk : null;
  const res = typeof e.residualRisk === 'number' ? e.residualRisk : null;
  if (inh === null || res === null) {
    return mk('residual_vs_inherent', 'governance', ['strong_brain'],
      'inconclusive', 0, 0.5,
      'Residual vs inherent: one of evidence.inherentRisk / residualRisk absent.');
  }
  const reduction = Math.max(0, inh - res);
  const verdict: Verdict = reduction < 0.1 ? 'escalate' : reduction < 0.25 ? 'flag' : 'clear';
  return mk('residual_vs_inherent', 'governance', ['strong_brain'],
    verdict, 1 - reduction, 0.85,
    `Residual vs inherent: inherent=${inh.toFixed(2)}, residual=${res.toFixed(2)}; controls reduce risk by ${reduction.toFixed(2)}. ${reduction < 0.1 ? 'Controls are NOT materially effective.' : 'Controls achieve meaningful reduction.'}`);
};

// ── regulatory_mapping ─────────────────────────────────────────────────
// evidence.controls: each { citations?: string[] } — fraction mapped.
export const regulatoryMappingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ctrls = recs('controls', ctx);
  if (ctrls.length === 0) {
    return mk('regulatory_mapping', 'governance', ['intelligence'],
      'inconclusive', 0, 0.5, 'Regulatory mapping: evidence.controls not supplied.');
  }
  const mapped = ctrls.filter((c) => Array.isArray(c.citations) && c.citations.length > 0).length;
  const rate = mapped / ctrls.length;
  const verdict: Verdict = rate < 0.5 ? 'flag' : 'clear';
  return mk('regulatory_mapping', 'governance', ['intelligence'],
    verdict, 1 - rate, 0.85,
    `Regulatory mapping: ${mapped}/${ctrls.length} controls cite a regulatory citation (${(rate * 100).toFixed(0)}%). ${rate < 0.5 ? 'Controls lack an anchor to FATF/UAE/Wolfsberg provisions; audit defensibility is weak.' : 'Mapping adequate.'}`);
};

// ── documentation_quality ──────────────────────────────────────────────
// evidence.documents: [{ type, versionedAt?, signedAt?, retentionDays? }]
export const documentationQualityApply = async (ctx: BrainContext): Promise<Finding> => {
  const docs = recs('documents', ctx);
  if (docs.length === 0) {
    return mk('documentation_quality', 'governance', ['introspection'],
      'inconclusive', 0, 0.5, 'Documentation quality: evidence.documents not supplied.');
  }
  let versioned = 0, signed = 0, retained = 0;
  for (const d of docs) {
    if (d.versionedAt) versioned++;
    if (d.signedAt) signed++;
    if (typeof d.retentionDays === 'number' && d.retentionDays >= 1825) retained++;
  }
  const score = (versioned + signed + retained) / (3 * docs.length);
  const verdict: Verdict = score < 0.5 ? 'flag' : 'clear';
  return mk('documentation_quality', 'governance', ['introspection'],
    verdict, 1 - score, 0.85,
    `Documentation quality: ${docs.length} docs; versioned ${versioned}, signed ${signed}, retained-5y ${retained}; composite ${(score * 100).toFixed(0)}%.`);
};

export const GOVERNANCE_MODE_APPLIES = {
  four_eyes_stress: fourEyesStressApply,
  escalation_trigger: escalationTriggerApply,
  control_effectiveness: controlEffectivenessApply,
  policy_drift: policyDriftApply,
  residual_vs_inherent: residualVsInherentApply,
  regulatory_mapping: regulatoryMappingApply,
  documentation_quality: documentationQualityApply,
} as const;
