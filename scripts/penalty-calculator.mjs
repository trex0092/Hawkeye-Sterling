/**
 * Penalty Calculator — Cabinet Resolution 71/2024.
 *
 * Calculates expected penalty exposure for compliance violations.
 * Used by the MOE Inspection Simulator and Health Score to quantify risk.
 *
 * Penalty ranges: AED 10,000 to AED 100,000,000 (depending on violation).
 * Aggravating/mitigating factors adjust within the range.
 */

/** Violation categories with penalty ranges per Cabinet Res 71/2024. */
const VIOLATIONS = {
  // ── Governance ──
  NO_COMPLIANCE_OFFICER: { min: 50000, max: 1000000, article: 'FDL Art.20 | Cabinet Res 71/2024', category: 'Governance' },
  NO_COMPLIANCE_MANUAL: { min: 50000, max: 500000, article: 'FDL Art.20-21 | Cabinet Res 134/2025 Art.5-6', category: 'Governance' },
  NO_GOAML_REGISTRATION: { min: 50000, max: 1000000, article: 'MoE Circular 08/AML/2021', category: 'Governance' },
  CO_NOT_NOTIFIED: { min: 50000, max: 500000, article: 'Cabinet Res 134/2025 Art.18', category: 'Governance' },

  // ── Risk Assessment ──
  NO_EWRA: { min: 100000, max: 1000000, article: 'Cabinet Res 134/2025 Art.5 | UAE NRA', category: 'Risk Assessment' },
  EWRA_NOT_CURRENT: { min: 50000, max: 500000, article: 'Cabinet Res 134/2025 Art.5', category: 'Risk Assessment' },
  NO_PF_RISK_ASSESSMENT: { min: 100000, max: 1000000, article: 'Cabinet Res 156/2025 | FATF Rec 1, 2, 7', category: 'Risk Assessment' },

  // ── CDD ──
  NO_CDD: { min: 100000, max: 1000000, article: 'FDL Art.12-14 | Cabinet Res 134/2025 Art.7-10', category: 'CDD' },
  INADEQUATE_CDD: { min: 50000, max: 500000, article: 'Cabinet Res 134/2025 Art.7', category: 'CDD' },
  NO_EDD_FOR_HIGH_RISK: { min: 100000, max: 1000000, article: 'FDL Art.14 | Cabinet Res 134/2025 Art.14', category: 'CDD' },
  UBO_NOT_IDENTIFIED: { min: 100000, max: 1000000, article: 'Cabinet Decision 109/2023 | FDL Art.18', category: 'CDD' },
  CDD_NOT_REFRESHED: { min: 50000, max: 500000, article: 'Cabinet Res 134/2025 Art.11', category: 'CDD' },

  // ── Screening ──
  NO_SANCTIONS_SCREENING: { min: 100000, max: 5000000, article: 'FDL Art.35 | Cabinet Res 74/2020', category: 'Screening' },
  INCOMPLETE_LIST_COVERAGE: { min: 50000, max: 1000000, article: 'EOCN TFS Guidance', category: 'Screening' },
  NO_PEP_SCREENING: { min: 100000, max: 1000000, article: 'Cabinet Res 134/2025 Art.14', category: 'Screening' },

  // ── Reporting ──
  FAILURE_TO_FILE_STR: { min: 100000, max: 5000000, article: 'FDL Art.26-27', category: 'Reporting' },
  LATE_STR: { min: 50000, max: 1000000, article: 'FDL Art.26-27', category: 'Reporting' },
  FAILURE_TO_FILE_DPMSR: { min: 50000, max: 1000000, article: 'MoE Circular 08/AML/2021', category: 'Reporting' },
  NO_HRC_REPORTING: { min: 50000, max: 1000000, article: 'FIU goAML Report Types Guide', category: 'Reporting' },
  FAILURE_TO_FILE_CNMR: { min: 100000, max: 5000000, article: 'EOCN TFS Guidance | Cabinet Res 74/2020', category: 'Reporting' },

  // ── TFS ──
  FAILURE_TO_FREEZE: { min: 1000000, max: 10000000, article: 'Cabinet Res 74/2020 Art.4 | FDL Art.35', category: 'TFS' },
  LATE_FREEZE: { min: 500000, max: 5000000, article: 'Cabinet Res 74/2020 Art.4', category: 'TFS' },
  TIPPING_OFF: { min: 1000000, max: 100000000, article: 'FDL Art.29 (criminal offence)', category: 'TFS' },

  // ── Training ──
  NO_TRAINING: { min: 50000, max: 500000, article: 'FDL Art.21 | Cabinet Res 134/2025 Art.20', category: 'Training' },
  TRAINING_NOT_CURRENT: { min: 50000, max: 500000, article: 'Cabinet Res 134/2025 Art.20', category: 'Training' },

  // ── Records ──
  INADEQUATE_RECORD_KEEPING: { min: 50000, max: 1000000, article: 'FDL Art.24', category: 'Record Keeping' },
  PREMATURE_RECORD_DESTRUCTION: { min: 100000, max: 1000000, article: 'FDL Art.24 | MoE DPMS Guidance', category: 'Record Keeping' },
  NO_INDEPENDENT_AUDIT: { min: 100000, max: 1000000, article: 'Cabinet Res 134/2025 Art.19', category: 'Record Keeping' },

  // ── Supply Chain ──
  NO_SUPPLY_CHAIN_DD: { min: 50000, max: 500000, article: 'LBMA RGG v9 | UAE MoE RSG | OECD Guidance', category: 'Supply Chain' },
];

/** Aggravating factors that push penalty toward maximum. */
const AGGRAVATING_FACTORS = [
  { id: 'AGG-01', factor: 'Repeat offence', multiplier: 1.5, description: 'Previously penalised for same or similar violation' },
  { id: 'AGG-02', factor: 'Deliberate non-compliance', multiplier: 2.0, description: 'Evidence of intentional circumvention' },
  { id: 'AGG-03', factor: 'Actual ML/TF occurred', multiplier: 3.0, description: 'The failure directly facilitated money laundering or terrorism financing' },
  { id: 'AGG-04', factor: 'Large entity / high turnover', multiplier: 1.3, description: 'Entity with significant annual revenue (>AED 50M)' },
  { id: 'AGG-05', factor: 'Multiple violations', multiplier: 1.2, description: 'More than 3 violations found in same inspection' },
  { id: 'AGG-06', factor: 'Non-cooperation with inspector', multiplier: 1.5, description: 'Refusal or delay in providing requested information' },
];

/** Mitigating factors that push penalty toward minimum. */
const MITIGATING_FACTORS = [
  { id: 'MIT-01', factor: 'First offence', multiplier: 0.5, description: 'No prior enforcement history' },
  { id: 'MIT-02', factor: 'Self-reported', multiplier: 0.6, description: 'Entity self-identified and reported the violation' },
  { id: 'MIT-03', factor: 'Remediation in progress', multiplier: 0.7, description: 'Active steps being taken to address the gap' },
  { id: 'MIT-04', factor: 'Small entity / low turnover', multiplier: 0.7, description: 'Small business with limited resources' },
  { id: 'MIT-05', factor: 'Full cooperation', multiplier: 0.8, description: 'Full cooperation with supervisory authority' },
];

/**
 * Calculate expected penalty for a set of violations.
 *
 * @param {string[]} violationIds - Array of VIOLATIONS keys.
 * @param {string[]} [aggravating] - Array of aggravating factor IDs.
 * @param {string[]} [mitigating] - Array of mitigating factor IDs.
 * @returns {{ totalMin, totalMax, adjusted, violations, factors }}
 */
export function calculatePenalty(violationIds, aggravating = [], mitigating = []) {
  const results = [];
  let totalMin = 0;
  let totalMax = 0;

  for (const id of violationIds) {
    const v = VIOLATIONS[id];
    if (!v) continue;
    results.push({ id, ...v });
    totalMin += v.min;
    totalMax += v.max;
  }

  // Apply aggravating multiplier (compound)
  let aggMultiplier = 1;
  const appliedAgg = [];
  for (const id of aggravating) {
    const factor = AGGRAVATING_FACTORS.find(f => f.id === id);
    if (factor) {
      aggMultiplier *= factor.multiplier;
      appliedAgg.push(factor);
    }
  }

  // Apply mitigating multiplier (compound)
  let mitMultiplier = 1;
  const appliedMit = [];
  for (const id of mitigating) {
    const factor = MITIGATING_FACTORS.find(f => f.id === id);
    if (factor) {
      mitMultiplier *= factor.multiplier;
      appliedMit.push(factor);
    }
  }

  const adjustedMin = Math.round(totalMin * mitMultiplier);
  const adjustedMax = Math.min(100000000, Math.round(totalMax * aggMultiplier));
  const midpoint = Math.round((adjustedMin + adjustedMax) / 2);

  return {
    violations: results,
    violationCount: results.length,
    totalMin,
    totalMax,
    aggravatingFactors: appliedAgg,
    mitigatingFactors: appliedMit,
    adjusted: {
      min: adjustedMin,
      max: adjustedMax,
      likely: midpoint,
    },
    formatted: {
      min: `AED ${adjustedMin.toLocaleString()}`,
      max: `AED ${adjustedMax.toLocaleString()}`,
      likely: `AED ${midpoint.toLocaleString()}`,
    },
    regulation: 'Cabinet Resolution 71/2024 | FDL No.10/2025 Art.17',
    note: 'Penalties may also include license suspension/revocation and criminal prosecution for tipping off.',
  };
}

/**
 * List all available violations.
 */
export function listViolations() {
  return Object.entries(VIOLATIONS).map(([id, v]) => ({
    id, ...v,
    formatted: `AED ${v.min.toLocaleString()} — ${v.max.toLocaleString()}`,
  }));
}

export { VIOLATIONS, AGGRAVATING_FACTORS, MITIGATING_FACTORS };

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Penalty Calculator — Cabinet Resolution 71/2024');
  console.log('================================================\n');

  const all = listViolations();
  const grouped = {};
  for (const v of all) {
    if (!grouped[v.category]) grouped[v.category] = [];
    grouped[v.category].push(v);
  }

  for (const [cat, items] of Object.entries(grouped)) {
    console.log(`${cat}:`);
    for (const v of items) {
      console.log(`  ${v.id.padEnd(30)} ${v.formatted}`);
    }
    console.log();
  }

  // Example calculation
  const example = calculatePenalty(
    ['NO_SANCTIONS_SCREENING', 'FAILURE_TO_FILE_STR', 'NO_EWRA'],
    ['AGG-05'],
    ['MIT-01']
  );
  console.log('Example: 3 violations (no screening + missed STR + no EWRA), first offence, multiple violations:');
  console.log(`  Range: ${example.formatted.min} — ${example.formatted.max}`);
  console.log(`  Likely: ${example.formatted.likely}`);
}
