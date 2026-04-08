/**
 * Regulatory Traceability Matrix — Maps every regulatory requirement
 * to its implementation in code, tests, and evidence.
 *
 * This is what LBMA auditors, MOE inspectors, and external reviewers
 * ask for: "Show me where each requirement is implemented."
 *
 * Covers:
 *   - FDL No.10/2025 (54 articles)
 *   - Cabinet Resolution 134/2025 (implementing regulations)
 *   - Cabinet Resolution 74/2020 (TFS)
 *   - Cabinet Resolution 156/2025 (PF)
 *   - Cabinet Resolution 71/2024 (penalties)
 *   - Cabinet Decision 109/2023 (UBO)
 *   - MoE Circular 08/AML/2021 (DPMS)
 *   - FATF Recommendations 22, 23, 28
 *   - OECD Due Diligence Guidance
 *   - LBMA RGG v9
 */

/**
 * The traceability matrix. Each entry maps a requirement to:
 *   - regulation: source law/article
 *   - requirement: plain English description
 *   - implementation: which module/file implements it
 *   - test: which test validates it
 *   - evidence: where the compliance evidence is stored
 *   - status: IMPLEMENTED, PARTIAL, GAP, N/A
 */
export const TRACEABILITY_MATRIX = [
  // ── FDL No.10/2025 ──
  { id: 'FDL-12', regulation: 'FDL No.10/2025 Art.12', requirement: 'Customer identification and verification', implementation: 'compliance-suite.js (CDD module)', test: 'tests/scoring.test.ts', evidence: 'history/registers/', status: 'IMPLEMENTED' },
  { id: 'FDL-13', regulation: 'FDL No.10/2025 Art.13', requirement: 'CDD timing — before establishing business relationship', implementation: 'scripts/cdd-engine/refresh-engine.mjs', test: 'tests/decisions.test.ts', evidence: '.screening/cdd-state.json', status: 'IMPLEMENTED' },
  { id: 'FDL-14', regulation: 'FDL No.10/2025 Art.14', requirement: 'Enhanced CDD for high-risk and PEPs', implementation: 'compliance-suite.js (EDD triggers at score >= 16)', test: 'tests/scoring.test.ts', evidence: 'history/registers/', status: 'IMPLEMENTED' },
  { id: 'FDL-15', regulation: 'FDL No.10/2025 Art.15-16', requirement: 'Transaction thresholds (AED 55K cash, AED 60K cross-border)', implementation: 'threshold-monitor.js + scripts/hrc-reporting.mjs', test: 'tests/constants.test.ts', evidence: 'history/filings/', status: 'IMPLEMENTED' },
  { id: 'FDL-18', regulation: 'FDL No.10/2025 Art.18', requirement: 'Beneficial ownership identification (UBO >= 25%)', implementation: 'compliance-suite.js (UBO Register)', test: 'tests/constants.test.ts', evidence: 'history/registers/', status: 'IMPLEMENTED' },
  { id: 'FDL-20', regulation: 'FDL No.10/2025 Art.20-21', requirement: 'Compliance Officer / MLRO appointment and duties', implementation: 'MLRO reporting scripts', test: 'N/A (governance)', evidence: 'history/mlro-weekly/ mlro-monthly/ mlro-quarterly/', status: 'IMPLEMENTED' },
  { id: 'FDL-24', regulation: 'FDL No.10/2025 Art.24', requirement: 'Record retention minimum 10 years', implementation: 'compliance-suite.js (Retention Register) + history/', test: 'tests/constants.test.ts', evidence: 'history/ (10-year archive)', status: 'IMPLEMENTED' },
  { id: 'FDL-26', regulation: 'FDL No.10/2025 Art.26-27', requirement: 'STR filing without delay', implementation: 'scripts/filing-pipeline/generator.mjs + scripts/str-narrative-generator.mjs', test: 'N/A', evidence: 'history/filings/', status: 'IMPLEMENTED' },
  { id: 'FDL-29', regulation: 'FDL No.10/2025 Art.29', requirement: 'No tipping off', implementation: 'Filing pipeline (noTippingOff flag) + TFS decision tree', test: 'N/A (procedural)', evidence: 'goAML filings', status: 'IMPLEMENTED' },
  { id: 'FDL-35', regulation: 'FDL No.10/2025 Art.35', requirement: 'Targeted Financial Sanctions implementation', implementation: 'screening/ + screening/tfs/decision-tree.mjs + screening/webhooks/', test: 'screening/test/smoke.mjs', evidence: '.screening/audit.log', status: 'IMPLEMENTED' },

  // ── Cabinet Resolution 134/2025 ──
  { id: 'CR134-5', regulation: 'Cabinet Res 134/2025 Art.5', requirement: 'Risk appetite statement and EWRA', implementation: 'compliance-suite.js (Risk Model) + scripts/compliance-health-score.mjs', test: 'tests/scoring.test.ts', evidence: 'history/annual/', status: 'IMPLEMENTED' },
  { id: 'CR134-7', regulation: 'Cabinet Res 134/2025 Art.7-10', requirement: 'CDD tiers (SDD/CDD/EDD)', implementation: 'src/risk/decisions.ts + compliance-suite.js', test: 'tests/decisions.test.ts', evidence: 'history/registers/', status: 'IMPLEMENTED' },
  { id: 'CR134-11', regulation: 'Cabinet Res 134/2025 Art.11', requirement: 'Ongoing monitoring and periodic review', implementation: 'scripts/cdd-engine/refresh-engine.mjs + transaction-monitor', test: 'N/A', evidence: 'history/daily-ops/', status: 'IMPLEMENTED' },
  { id: 'CR134-14', regulation: 'Cabinet Res 134/2025 Art.14', requirement: 'PEP EDD + Board approval', implementation: 'compliance-suite.js (PEP detection + approval matrix)', test: 'N/A', evidence: 'history/registers/', status: 'IMPLEMENTED' },
  { id: 'CR134-16', regulation: 'Cabinet Res 134/2025 Art.16', requirement: 'Cross-border cash/BNI AED 60K declaration', implementation: 'scripts/hrc-reporting.mjs', test: 'tests/constants.test.ts', evidence: 'history/filings/', status: 'IMPLEMENTED' },
  { id: 'CR134-18', regulation: 'Cabinet Res 134/2025 Art.18', requirement: 'CO change notification to MoE', implementation: 'scripts/compliance-calendar.mjs (event E-03)', test: 'N/A', evidence: 'MoE correspondence', status: 'IMPLEMENTED' },
  { id: 'CR134-19', regulation: 'Cabinet Res 134/2025 Art.19', requirement: 'Independent audit function', implementation: 'scripts/moe-inspection-simulator.mjs (check RET-02)', test: 'N/A', evidence: 'history/annual/', status: 'IMPLEMENTED' },
  { id: 'CR134-20', regulation: 'Cabinet Res 134/2025 Art.20', requirement: 'Staff training programme', implementation: 'scripts/compliance-calendar.mjs (A-03)', test: 'N/A', evidence: 'history/annual/', status: 'IMPLEMENTED' },

  // ── Cabinet Resolution 74/2020 (TFS) ──
  { id: 'CR74-4', regulation: 'Cabinet Res 74/2020 Art.4', requirement: 'Asset freeze within 24 clock hours', implementation: 'screening/tfs/decision-tree.mjs (FREEZE_HOURS: 24)', test: 'N/A', evidence: 'TFS screening events', status: 'IMPLEMENTED' },
  { id: 'CR74-5', regulation: 'Cabinet Res 74/2020 Art.5', requirement: 'Report freeze to EOCN without delay', implementation: 'screening/tfs/decision-tree.mjs (action order 2)', test: 'N/A', evidence: 'goAML CNMR', status: 'IMPLEMENTED' },
  { id: 'CR74-CNMR', regulation: 'EOCN TFS Guidance July 2025', requirement: 'CNMR within 5 business days', implementation: 'screening/tfs/decision-tree.mjs + goaml-export.js (CNMR type)', test: 'N/A', evidence: 'history/filings/', status: 'IMPLEMENTED' },
  { id: 'CR74-PNMR', regulation: 'EOCN TFS Guidance July 2025', requirement: 'PNMR within 5 business days for partial matches', implementation: 'screening/tfs/decision-tree.mjs', test: 'N/A', evidence: 'history/filings/', status: 'IMPLEMENTED' },

  // ── Cabinet Resolution 156/2025 (PF) ──
  { id: 'CR156-PF', regulation: 'Cabinet Res 156/2025', requirement: 'Proliferation financing risk assessment', implementation: 'screening/analysis/pf-risk-assessment.mjs', test: 'N/A', evidence: 'PF risk reports', status: 'IMPLEMENTED' },

  // ── Cabinet Decision 109/2023 (UBO) ──
  { id: 'CD109-UBO', regulation: 'Cabinet Decision 109/2023', requirement: 'UBO register with >= 25% threshold', implementation: 'compliance-suite.js (UBO Register)', test: 'tests/constants.test.ts', evidence: 'history/registers/', status: 'IMPLEMENTED' },
  { id: 'CD109-REVERIFY', regulation: 'Cabinet Decision 109/2023', requirement: 'UBO re-verification within 15 working days', implementation: 'scripts/compliance-calendar.mjs (E-02)', test: 'N/A', evidence: 'CDD refresh records', status: 'IMPLEMENTED' },

  // ── MoE Circular 08/AML/2021 ──
  { id: 'MOE-DPMSR', regulation: 'MoE Circular 08/AML/2021', requirement: 'DPMSR for cash >= AED 55K within 2 weeks', implementation: 'compliance-suite.js (DPMSR module) + goaml-export.js', test: 'tests/constants.test.ts', evidence: 'history/filings/', status: 'IMPLEMENTED' },
  { id: 'MOE-GOAML', regulation: 'MoE Circular 08/AML/2021', requirement: 'goAML portal registration', implementation: 'goaml-export.js + all filing modules', test: 'N/A', evidence: 'goAML portal access', status: 'IMPLEMENTED' },

  // ── Cabinet Resolution 71/2024 (Penalties) ──
  { id: 'CR71-PENALTIES', regulation: 'Cabinet Res 71/2024', requirement: 'Administrative penalty framework', implementation: 'scripts/penalty-calculator.mjs', test: 'N/A', evidence: 'Penalty calculation records', status: 'IMPLEMENTED' },

  // ── FATF ──
  { id: 'FATF-22', regulation: 'FATF Recommendation 22', requirement: 'DPMS CDD obligations', implementation: 'compliance-suite.js + src/risk/', test: 'tests/scoring.test.ts', evidence: 'history/registers/', status: 'IMPLEMENTED' },
  { id: 'FATF-23', regulation: 'FATF Recommendation 23', requirement: 'DPMS STR obligations', implementation: 'scripts/filing-pipeline/ + str-narrative-generator.mjs', test: 'N/A', evidence: 'history/filings/', status: 'IMPLEMENTED' },
  { id: 'FATF-28', regulation: 'FATF Recommendation 28', requirement: 'Regulation and supervision of DNFBPs', implementation: 'scripts/moe-inspection-simulator.mjs', test: 'N/A', evidence: 'Inspection results', status: 'IMPLEMENTED' },
  { id: 'FATF-GOLD', regulation: 'FATF Gold Report', requirement: 'ML/TF risks and vulnerabilities of gold', implementation: 'screening/analysis/fatf-gold-red-flags.mjs', test: 'N/A', evidence: 'Red flag scan results', status: 'IMPLEMENTED' },
  { id: 'FATF-RBA', regulation: 'FATF RBA for DPMS', requirement: 'Risk-based approach for dealers', implementation: 'src/risk/scoring.ts + compliance-suite.js (risk model)', test: 'tests/scoring.test.ts', evidence: 'CRA records', status: 'IMPLEMENTED' },

  // ── OECD ──
  { id: 'OECD-5STEP', regulation: 'OECD DD Guidance', requirement: '5-Step due diligence for mineral supply chains', implementation: 'scripts/oecd-five-step.mjs', test: 'N/A', evidence: 'OECD assessment reports', status: 'IMPLEMENTED' },
  { id: 'OECD-ANNEX2', regulation: 'OECD Annex II', requirement: 'Red flag identification in supply chain', implementation: 'scripts/oecd-five-step.mjs (ANNEX_II_RED_FLAGS)', test: 'N/A', evidence: 'Red flag records', status: 'IMPLEMENTED' },

  // ── LBMA ──
  { id: 'LBMA-RGG', regulation: 'LBMA RGG v9', requirement: 'Responsible gold guidance 5-step framework', implementation: 'scripts/oecd-five-step.mjs (aligned)', test: 'N/A', evidence: 'Annual LBMA audit', status: 'IMPLEMENTED' },

  // ── FIU goAML ──
  { id: 'FIU-STR', regulation: 'UAE FIU', requirement: 'STR filing via goAML', implementation: 'goaml-export.js + scripts/filing-pipeline/', test: 'N/A', evidence: 'history/filings/', status: 'IMPLEMENTED' },
  { id: 'FIU-HRC', regulation: 'UAE FIU', requirement: 'HRC/HRCA for cross-border high-risk country transfers', implementation: 'scripts/hrc-reporting.mjs', test: 'N/A', evidence: 'history/filings/', status: 'IMPLEMENTED' },
  { id: 'FIU-DPMSR', regulation: 'UAE FIU', requirement: 'DPMSR via goAML', implementation: 'goaml-export.js (DPMSR type)', test: 'N/A', evidence: 'history/filings/', status: 'IMPLEMENTED' },
];

/**
 * Generate a traceability report.
 */
export function generateReport() {
  const today = new Date().toISOString().split('T')[0];
  const implemented = TRACEABILITY_MATRIX.filter(r => r.status === 'IMPLEMENTED');
  const partial = TRACEABILITY_MATRIX.filter(r => r.status === 'PARTIAL');
  const gaps = TRACEABILITY_MATRIX.filter(r => r.status === 'GAP');

  const lines = [
    'REGULATORY TRACEABILITY MATRIX',
    `Date: ${today}`,
    `Total requirements: ${TRACEABILITY_MATRIX.length}`,
    `Implemented: ${implemented.length}`,
    `Partial: ${partial.length}`,
    `Gaps: ${gaps.length}`,
    `Coverage: ${Math.round((implemented.length / TRACEABILITY_MATRIX.length) * 100)}%`,
    '',
  ];

  // Group by regulation source
  const grouped = {};
  for (const r of TRACEABILITY_MATRIX) {
    const source = r.regulation.split(' ')[0] + ' ' + r.regulation.split(' ')[1];
    if (!grouped[source]) grouped[source] = [];
    grouped[source].push(r);
  }

  for (const [source, items] of Object.entries(grouped)) {
    lines.push(`--- ${source} ---`);
    for (const r of items) {
      const icon = r.status === 'IMPLEMENTED' ? '+' : r.status === 'PARTIAL' ? '~' : 'x';
      lines.push(`  ${icon} [${r.id}] ${r.requirement}`);
      lines.push(`    Regulation: ${r.regulation}`);
      lines.push(`    Code: ${r.implementation}`);
      lines.push(`    Evidence: ${r.evidence}`);
    }
    lines.push('');
  }

  lines.push('For review by the MLRO.');
  return lines.join('\n');
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(generateReport());
}
