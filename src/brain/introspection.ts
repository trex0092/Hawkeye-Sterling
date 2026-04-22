// Hawkeye Sterling — introspection pass.
//
// Runs after all reasoning modes have produced findings. Reads the meta findings
// emitted by the six always-on meta-cognitive modes (bias audit, calibration,
// Popper, two triangulations, Occam) and the resulting fusion firepower, and
// computes a regulator-auditable IntrospectionReport.
//
// The report returns a `confidenceAdjustment` in [-0.2, 0.2] that the engine
// applies to the aggregate confidence. This is how the brain audits its own
// reasoning quality and either stands behind or dampens its expressed confidence.

import type {
  CognitiveFirepower, Finding, FindingConflict, IntrospectionReport,
} from './types.js';

export interface IntrospectOptions {
  conflicts: FindingConflict[];
  firepower: CognitiveFirepower;
}

export function introspect(findings: Finding[], opts: IntrospectOptions): IntrospectionReport {
  const meta = findings.filter((f) => f.tags?.includes('meta') || f.tags?.includes('introspection'));
  const contributors = findings.filter(
    (f) => !(f.tags?.includes('meta') || f.tags?.includes('introspection')) &&
           !f.rationale.startsWith('[stub]'),
  );

  const biasesDetected: string[] = [];
  let flagCount = 0;
  for (const m of meta) {
    if (m.verdict === 'flag') flagCount++;
    if (m.modeId === 'cognitive_bias_audit' && m.verdict === 'flag') {
      // Rationale carries the ' | '-joined list. Extract first tokens as bias IDs.
      for (const chunk of m.rationale.split('|')) {
        const trimmed = chunk.trim();
        const head = trimmed.split(':')[0] ?? '';
        const id = head.replace(/^Bias signatures detected.*?\(\d+\)\s*/, '').trim();
        if (id && id.length < 40) biasesDetected.push(id);
      }
    }
  }

  const calibrationModeFinding = meta.find((m) => m.modeId === 'confidence_calibration');
  let calibrationGap = 0;
  if (calibrationModeFinding) {
    const match = /calibration_gap=(-?\d+\.?\d*)/.exec(calibrationModeFinding.rationale);
    if (match) {
      const g = match[1] ?? '0';
      calibrationGap = Math.min(1, Math.abs(parseFloat(g)));
    }
  }

  const coverageGaps: string[] = [];
  for (const a of opts.firepower.activations) {
    if (a.status === 'silent' && a.facultyId !== 'strong_brain') {
      coverageGaps.push(`faculty:${a.facultyId} silent`);
    }
  }
  if (opts.firepower.independentEvidenceCount < 3) {
    coverageGaps.push(`evidence:only ${opts.firepower.independentEvidenceCount} independent item(s)`);
  }
  if (opts.firepower.categoriesSpanned < 3 && contributors.length >= 3) {
    coverageGaps.push(`categories:only ${opts.firepower.categoriesSpanned} spanned`);
  }

  // Chain quality: composite of meta pass rate × firepower × low-conflict × calibration.
  const metaPassRate = meta.length === 0 ? 0.5 : (meta.length - flagCount) / meta.length;
  const conflictPenalty = Math.min(1, opts.conflicts.length / 4);
  const calibrationPenalty = Math.min(1, calibrationGap / 0.4);
  const chainQuality = clamp01(
    0.35 * metaPassRate +
    0.30 * opts.firepower.firepowerScore +
    0.20 * (1 - conflictPenalty) +
    0.15 * (1 - calibrationPenalty),
  );

  // Adjustment: quality above 0.7 boosts confidence; below 0.4 dampens.
  let confidenceAdjustment = 0;
  if (chainQuality >= 0.7) confidenceAdjustment = 0.05 + 0.15 * (chainQuality - 0.7) / 0.3;
  else if (chainQuality <= 0.4) confidenceAdjustment = -0.05 - 0.15 * (0.4 - chainQuality) / 0.4;
  confidenceAdjustment = Math.max(-0.2, Math.min(0.2, confidenceAdjustment));

  const notes: string[] = [
    `meta_pass_rate=${(metaPassRate * 100).toFixed(0)}%`,
    `firepower=${opts.firepower.firepowerScore.toFixed(2)}`,
    `conflicts=${opts.conflicts.length}`,
    `calibration_gap=${calibrationGap.toFixed(2)}`,
    `chain_quality=${chainQuality.toFixed(2)}`,
    `confidence_adjustment=${confidenceAdjustment >= 0 ? '+' : ''}${confidenceAdjustment.toFixed(2)}`,
  ];
  if (biasesDetected.length > 0) notes.push(`biases:${biasesDetected.join(',')}`);
  for (const g of coverageGaps) notes.push(g);

  return {
    chainQuality,
    biasesDetected,
    calibrationGap,
    coverageGaps,
    confidenceAdjustment,
    notes,
    producedAt: Date.now(),
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
