/**
 * Automated Compliance Grading System.
 *
 * Produces a holistic compliance health score (A+ to F) for the entire
 * organisation, based on measurable indicators across six pillars:
 *
 *   1. SCREENING COVERAGE — % of counterparties screened within cycle
 *   2. LIST FRESHNESS — Age of sanctions data sources
 *   3. FILING TIMELINESS — % of filings submitted before deadline
 *   4. AUDIT INTEGRITY — Hash chain verification status
 *   5. TRAINING COMPLIANCE — Staff training completion rate
 *   6. REVIEW CADENCE — CDD reviews completed on schedule
 *
 * Output: A compliance scorecard suitable for board reporting and
 * supervisory inspection evidence.
 *
 * References:
 *   - Federal Decree-Law No. 10/2025, Art. 20-22 (internal controls)
 *   - FATF Recommendation 18 (internal controls)
 *   - MoE Supervisory Inspection Checklist for DNFBPs
 */

const GRADES = [
  { min: 95, grade: 'A+', label: 'Exemplary', color: '#15803d' },
  { min: 90, grade: 'A',  label: 'Excellent', color: '#22c55e' },
  { min: 85, grade: 'B+', label: 'Very Good', color: '#65a30d' },
  { min: 80, grade: 'B',  label: 'Good',      color: '#84cc16' },
  { min: 75, grade: 'C+', label: 'Adequate',  color: '#eab308' },
  { min: 70, grade: 'C',  label: 'Fair',      color: '#f59e0b' },
  { min: 60, grade: 'D',  label: 'Poor',      color: '#f97316' },
  { min: 0,  grade: 'F',  label: 'Failing',   color: '#ef4444' },
];

const PILLAR_WEIGHTS = {
  screening:  0.25,
  freshness:  0.20,
  filing:     0.20,
  audit:      0.15,
  training:   0.10,
  review:     0.10,
};

/**
 * Calculate the overall compliance grade.
 *
 * @param {object} metrics
 * @param {object} metrics.screening - { totalCounterparties, screenedWithinCycle, cycleMonths }
 * @param {object} metrics.freshness - { sources: [{ id, ageHours, maxAgeHours, stale }] }
 * @param {object} metrics.filing - { totalFilings, filedOnTime, overdue, pending }
 * @param {object} metrics.audit - { chainValid, entriesVerified, lastVerified }
 * @param {object} metrics.training - { totalStaff, trained, dueDate }
 * @param {object} metrics.review - { totalDue, completedOnTime, overdue }
 * @returns {ComplianceScorecard}
 */
export function calculateComplianceGrade(metrics) {
  const pillars = {};
  let weightedTotal = 0;

  // 1. Screening Coverage
  const sc = metrics.screening || {};
  const screeningPct = sc.totalCounterparties > 0
    ? (sc.screenedWithinCycle / sc.totalCounterparties) * 100
    : 100; // If no counterparties, consider screened
  pillars.screening = {
    score: Math.min(100, screeningPct),
    weight: PILLAR_WEIGHTS.screening,
    detail: `${sc.screenedWithinCycle || 0}/${sc.totalCounterparties || 0} counterparties screened within ${sc.cycleMonths || 6}-month cycle`,
    findings: screeningPct < 80
      ? [`${Math.round(100 - screeningPct)}% of counterparties not screened within review cycle`]
      : [],
  };
  weightedTotal += pillars.screening.score * PILLAR_WEIGHTS.screening;

  // 2. List Freshness
  const fr = metrics.freshness || {};
  const sources = fr.sources || [];
  const freshSources = sources.filter(s => !s.stale).length;
  const freshPct = sources.length > 0 ? (freshSources / sources.length) * 100 : 100;
  pillars.freshness = {
    score: Math.min(100, freshPct),
    weight: PILLAR_WEIGHTS.freshness,
    detail: `${freshSources}/${sources.length} sources fresh`,
    findings: sources.filter(s => s.stale).map(s => `${s.id}: ${s.ageHours}h old (max: ${s.maxAgeHours}h)`),
  };
  weightedTotal += pillars.freshness.score * PILLAR_WEIGHTS.freshness;

  // 3. Filing Timeliness
  const fi = metrics.filing || {};
  const filingTotal = fi.totalFilings || 0;
  const filingPct = filingTotal > 0 ? ((fi.filedOnTime || 0) / filingTotal) * 100 : 100;
  let filingScore = filingPct;
  if (fi.overdue > 0) filingScore = Math.max(0, filingScore - fi.overdue * 10);
  pillars.filing = {
    score: Math.min(100, Math.max(0, filingScore)),
    weight: PILLAR_WEIGHTS.filing,
    detail: `${fi.filedOnTime || 0}/${filingTotal} filings on time, ${fi.overdue || 0} overdue`,
    findings: fi.overdue > 0 ? [`${fi.overdue} filing(s) past deadline — immediate MLRO action required`] : [],
  };
  weightedTotal += pillars.filing.score * PILLAR_WEIGHTS.filing;

  // 4. Audit Integrity
  const au = metrics.audit || {};
  const auditScore = au.chainValid ? 100 : 0;
  pillars.audit = {
    score: auditScore,
    weight: PILLAR_WEIGHTS.audit,
    detail: au.chainValid
      ? `Chain valid: ${au.entriesVerified} entries verified`
      : `CHAIN BROKEN at seq ${au.breakSeq}: ${au.breakReason}`,
    findings: au.chainValid ? [] : ['CRITICAL: Audit chain integrity failure — investigate immediately'],
  };
  weightedTotal += pillars.audit.score * PILLAR_WEIGHTS.audit;

  // 5. Training Compliance
  const tr = metrics.training || {};
  const trainingPct = tr.totalStaff > 0 ? ((tr.trained || 0) / tr.totalStaff) * 100 : 100;
  pillars.training = {
    score: Math.min(100, trainingPct),
    weight: PILLAR_WEIGHTS.training,
    detail: `${tr.trained || 0}/${tr.totalStaff || 0} staff trained`,
    findings: trainingPct < 100
      ? [`${tr.totalStaff - (tr.trained || 0)} staff member(s) require AML/CFT training`]
      : [],
  };
  weightedTotal += pillars.training.score * PILLAR_WEIGHTS.training;

  // 6. Review Cadence
  const rv = metrics.review || {};
  const reviewPct = rv.totalDue > 0 ? ((rv.completedOnTime || 0) / rv.totalDue) * 100 : 100;
  pillars.review = {
    score: Math.min(100, reviewPct),
    weight: PILLAR_WEIGHTS.review,
    detail: `${rv.completedOnTime || 0}/${rv.totalDue || 0} CDD reviews completed on schedule`,
    findings: rv.overdue > 0 ? [`${rv.overdue} CDD review(s) overdue`] : [],
  };
  weightedTotal += pillars.review.score * PILLAR_WEIGHTS.review;

  // Overall grade
  const overallScore = Math.round(weightedTotal);
  const gradeInfo = GRADES.find(g => overallScore >= g.min) || GRADES[GRADES.length - 1];

  // Collect all findings
  const allFindings = Object.entries(pillars)
    .flatMap(([name, p]) => p.findings.map(f => ({ pillar: name, finding: f, severity: p.score < 50 ? 'critical' : p.score < 70 ? 'high' : p.score < 85 ? 'medium' : 'low' })));

  return {
    overallScore,
    grade: gradeInfo.grade,
    label: gradeInfo.label,
    color: gradeInfo.color,
    pillars,
    findings: allFindings,
    recommendations: generateGradeRecommendations(pillars, gradeInfo),
    assessedAt: new Date().toISOString(),
    nextAssessment: calculateNextAssessment(),
    methodology: {
      pillars: Object.entries(PILLAR_WEIGHTS).map(([k, v]) => `${k}: ${v * 100}%`),
      gradeScale: GRADES.map(g => `${g.grade} (>=${g.min}%): ${g.label}`),
      reference: 'FDL No.10/2025 Art.20-22 | FATF Rec.18 | MoE DNFBP Inspection Checklist',
    },
  };
}

function generateGradeRecommendations(pillars, gradeInfo) {
  const recs = [];

  // Sort pillars by score ascending (worst first)
  const sorted = Object.entries(pillars)
    .sort(([, a], [, b]) => a.score - b.score);

  for (const [name, pillar] of sorted) {
    if (pillar.score >= 90) continue;

    switch (name) {
      case 'screening':
        recs.push(`Improve screening coverage: screen remaining ${Math.round(100 - pillar.score)}% of counterparties`);
        break;
      case 'freshness':
        recs.push('Update stale sanctions lists immediately — run screening/bin/refresh.mjs');
        break;
      case 'filing':
        recs.push('Expedite overdue filings — MLRO to review pending drafts');
        break;
      case 'audit':
        recs.push('CRITICAL: Investigate audit chain break and restore integrity');
        break;
      case 'training':
        recs.push('Schedule AML/CFT training for outstanding staff members');
        break;
      case 'review':
        recs.push('Complete overdue CDD reviews and update review schedule');
        break;
    }
  }

  if (gradeInfo.grade === 'A+' || gradeInfo.grade === 'A') {
    recs.push('Maintain current compliance standards. Document for supervisory evidence.');
  }

  return recs;
}

function calculateNextAssessment() {
  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  now.setDate(1);
  return now.toISOString().split('T')[0];
}

/**
 * Generate a plain-text compliance scorecard for board reporting.
 */
export function formatScorecard(scorecard) {
  const lines = [];
  const d = new Date().toISOString().split('T')[0];

  lines.push('COMPLIANCE HEALTH SCORECARD');
  lines.push(`Assessment date: ${d}`);
  lines.push(`Overall grade: ${scorecard.grade} (${scorecard.overallScore}%) — ${scorecard.label}`);
  lines.push('');

  lines.push('PILLAR SCORES');
  for (const [name, p] of Object.entries(scorecard.pillars)) {
    const bar = '█'.repeat(Math.round(p.score / 5)) + '░'.repeat(20 - Math.round(p.score / 5));
    lines.push(`  ${name.padEnd(12)} ${bar} ${Math.round(p.score)}%  ${p.detail}`);
  }
  lines.push('');

  if (scorecard.findings.length > 0) {
    lines.push('FINDINGS');
    for (const f of scorecard.findings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.pillar}: ${f.finding}`);
    }
    lines.push('');
  }

  if (scorecard.recommendations.length > 0) {
    lines.push('RECOMMENDATIONS');
    for (let i = 0; i < scorecard.recommendations.length; i++) {
      lines.push(`  ${i + 1}. ${scorecard.recommendations[i]}`);
    }
    lines.push('');
  }

  lines.push(`Next assessment due: ${scorecard.nextAssessment}`);
  lines.push('');
  lines.push('For review by the MLRO.');

  return lines.join('\n');
}

export { GRADES, PILLAR_WEIGHTS };
