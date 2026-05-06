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
  /** Used for Over-confidence-on-zero-score check (meta-check #3). */
  aggregateScore?: number;
  aggregateConfidence?: number;
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

  // ── Four mandatory meta-checks (HS-GOV-001 Part 5) ──────────────────────
  const metaCheckWarnings: string[] = [];

  // MC-1: Cross-category contradiction — same category has both clear and non-clear verdict.
  const byCategory = new Map<string, { hasClear: boolean; hasNonClear: boolean }>();
  for (const f of contributors) {
    const entry = byCategory.get(f.category) ?? { hasClear: false, hasNonClear: false };
    if (f.verdict === 'clear') entry.hasClear = true;
    else entry.hasNonClear = true;
    byCategory.set(f.category, entry);
  }
  for (const [cat, entry] of byCategory) {
    if (entry.hasClear && entry.hasNonClear) {
      metaCheckWarnings.push(`MC-1:cross_category_contradiction:category=${cat}`);
    }
  }

  // MC-2: Under-triangulation — fewer than 3 distinct faculties engaged on substantive evidence.
  const activeFaculties = new Set<string>();
  for (const f of contributors) {
    if (f.score > 0) {
      for (const fac of f.faculties) activeFaculties.add(fac);
    }
  }
  if (activeFaculties.size < 3) {
    metaCheckWarnings.push(`MC-2:under_triangulation:active_faculties=${activeFaculties.size}`);
  }

  // MC-3: Over-confidence on zero score — tight high-confidence clear when aggregate score is 0.
  const aggScore = opts.aggregateScore ?? 0;
  const aggConf = opts.aggregateConfidence ?? 0;
  if (aggScore === 0 && aggConf > 0.8) {
    metaCheckWarnings.push(`MC-3:overconfidence_on_zero_score:confidence=${aggConf.toFixed(2)}`);
  }

  // MC-4: Calibration collapse — σ of finding confidences < 0.05.
  if (contributors.length >= 2) {
    const confs = contributors.map((f) => f.confidence);
    const mean = confs.reduce((s, c) => s + c, 0) / confs.length;
    const variance = confs.reduce((s, c) => s + (c - mean) ** 2, 0) / confs.length;
    const sigma = Math.sqrt(variance);
    if (sigma < 0.05) {
      metaCheckWarnings.push(`MC-4:calibration_collapse:sigma=${sigma.toFixed(4)}`);
    }
  }

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
  for (const w of metaCheckWarnings) notes.push(w);

  return {
    chainQuality,
    biasesDetected,
    calibrationGap,
    coverageGaps,
    confidenceAdjustment,
    notes,
    producedAt: Date.now(),
    metaCheckWarnings,
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
