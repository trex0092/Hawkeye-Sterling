/**
 * OECD 5-Step Due Diligence Framework for Responsible Gold Supply Chains.
 *
 * Implements the OECD Due Diligence Guidance for Responsible Supply Chains
 * of Minerals from Conflict-Affected and High-Risk Areas, aligned with:
 *   - LBMA Responsible Gold Guidance (RGG) v9
 *   - UAE MoE Responsible Sourcing of Gold Framework
 *   - Dubai Good Delivery (DGD) Standard
 *
 * The 5 Steps:
 *   1. ESTABLISH — Strong management systems, policies, internal controls
 *   2. IDENTIFY  — Map supply chain, identify red flags (Annex II)
 *   3. RESPOND   — Design risk management strategy, mitigate or disengage
 *   4. AUDIT     — Independent third-party supply chain audit
 *   5. REPORT    — Annual public disclosure of due diligence
 *
 * Each step is scored 0-100 based on evidence and compliance indicators.
 */

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname || '.', '..');
const HISTORY_ROOT = resolve(PROJECT_ROOT, 'history');

/**
 * OECD Annex II Red Flags — triggers for enhanced due diligence.
 * Any of these in the supply chain requires immediate Step 3 response.
 */
export const ANNEX_II_RED_FLAGS = [
  { id: 'RF-01', flag: 'Mineral originates from or transits through CAHRA', category: 'origin', severity: 'CRITICAL' },
  { id: 'RF-02', flag: 'Mineral claimed from recycled/scrap sources without adequate documentation', category: 'documentation', severity: 'HIGH' },
  { id: 'RF-03', flag: 'Supplier unable to provide chain of custody documentation', category: 'documentation', severity: 'CRITICAL' },
  { id: 'RF-04', flag: 'Known or suspected use of child labour in extraction', category: 'human_rights', severity: 'CRITICAL' },
  { id: 'RF-05', flag: 'Evidence of forced labour in mining operations', category: 'human_rights', severity: 'CRITICAL' },
  { id: 'RF-06', flag: 'Mineral extraction in areas controlled by non-state armed groups', category: 'conflict', severity: 'CRITICAL' },
  { id: 'RF-07', flag: 'Payments to non-state armed groups or public/private security forces', category: 'conflict', severity: 'CRITICAL' },
  { id: 'RF-08', flag: 'Bribery or fraudulent misrepresentation of origin', category: 'corruption', severity: 'CRITICAL' },
  { id: 'RF-09', flag: 'Money laundering through minerals trade', category: 'financial_crime', severity: 'CRITICAL' },
  { id: 'RF-10', flag: 'Non-payment of taxes, fees, or royalties to government', category: 'financial_crime', severity: 'HIGH' },
  { id: 'RF-11', flag: 'Supplier on sanctions list or connected to sanctioned entities', category: 'sanctions', severity: 'CRITICAL' },
  { id: 'RF-12', flag: 'Supplier from jurisdiction with weak AML/CFT framework', category: 'jurisdiction', severity: 'HIGH' },
  { id: 'RF-13', flag: 'Unusually complex supply chain with no clear business rationale', category: 'structure', severity: 'HIGH' },
  { id: 'RF-14', flag: 'Significant discrepancy between declared and actual weight/purity', category: 'documentation', severity: 'HIGH' },
  { id: 'RF-15', flag: 'Supplier refuses to allow site visits or audits', category: 'transparency', severity: 'HIGH' },
  { id: 'RF-16', flag: 'Artisanal/small-scale mining (ASM) without formalisation evidence', category: 'asm', severity: 'MEDIUM' },
  { id: 'RF-17', flag: 'Environmental degradation beyond legal limits at source', category: 'environmental', severity: 'MEDIUM' },
  { id: 'RF-18', flag: 'Gold refined by non-LBMA/DGD accredited refiner', category: 'accreditation', severity: 'MEDIUM' },
];

/** Conflict-Affected and High-Risk Areas (CAHRA). */
export const CAHRA_COUNTRIES = [
  'AF', 'CF', 'CD', 'IQ', 'LY', 'ML', 'MM', 'NI', 'KP', 'SO',
  'SS', 'SD', 'SY', 'UA', 'VE', 'YE', 'ZW',
];

/**
 * Assess compliance with the OECD 5-Step Framework.
 *
 * @param {object} [data] - Supply chain data and evidence.
 * @returns {{ steps, compositeScore, grade, redFlags, actions }}
 */
export async function assessFiveSteps(data = {}) {
  const steps = {};
  const actions = [];

  steps.step1 = await assessStep1(data, actions);
  steps.step2 = await assessStep2(data, actions);
  steps.step3 = await assessStep3(data, actions);
  steps.step4 = await assessStep4(data, actions);
  steps.step5 = await assessStep5(data, actions);

  const scores = Object.values(steps).map(s => s.score);
  const compositeScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const grade = compositeScore >= 90 ? 'A' : compositeScore >= 75 ? 'B' : compositeScore >= 60 ? 'C' : compositeScore >= 40 ? 'D' : 'F';

  // Check for Annex II red flags in supplied data
  const redFlags = data.suppliers ? checkAnnexIIRedFlags(data.suppliers) : [];

  actions.sort((a, b) => {
    const pri = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (pri[a.priority] || 4) - (pri[b.priority] || 4);
  });

  return {
    steps,
    compositeScore,
    grade,
    redFlags,
    actions,
    framework: 'OECD Due Diligence Guidance for Responsible Supply Chains of Minerals',
    alignedWith: ['LBMA RGG v9', 'UAE MoE RSG Framework', 'Dubai Good Delivery Standard'],
    timestamp: new Date().toISOString(),
  };
}

// ── Step Assessors ──────────────────────────────────────────

async function assessStep1(data, actions) {
  let score = 0;
  const checks = [];

  // 1.1 Written supply chain policy
  if (data.hasPolicy !== false) { score += 20; checks.push({ item: 'Supply chain DD policy', status: 'PASS' }); }
  else { checks.push({ item: 'Supply chain DD policy', status: 'FAIL' }); actions.push({ step: 1, priority: 'CRITICAL', action: 'Draft and adopt a supply chain due diligence policy per OECD Annex II Model Policy' }); }

  // 1.2 Internal team/responsibility assigned
  if (data.hasResponsiblePerson !== false) { score += 20; checks.push({ item: 'Responsible person assigned', status: 'PASS' }); }
  else { checks.push({ item: 'Responsible person assigned', status: 'FAIL' }); actions.push({ step: 1, priority: 'HIGH', action: 'Assign a senior manager responsible for supply chain DD' }); }

  // 1.3 Supplier engagement (KYS)
  const hasKys = data.suppliers?.length > 0;
  if (hasKys) { score += 20; checks.push({ item: 'Supplier KYS records', status: 'PASS' }); }
  else { checks.push({ item: 'Supplier KYS records', status: 'FAIL' }); actions.push({ step: 1, priority: 'HIGH', action: 'Implement Know Your Supplier (KYS) programme' }); }

  // 1.4 Grievance mechanism
  if (data.hasGrievanceMechanism !== false) { score += 20; checks.push({ item: 'Grievance mechanism', status: 'PASS' }); }
  else { checks.push({ item: 'Grievance mechanism', status: 'FAIL' }); actions.push({ step: 1, priority: 'MEDIUM', action: 'Establish grievance mechanism for supply chain concerns' }); }

  // 1.5 Record keeping system
  const hasArchive = existsSync(resolve(HISTORY_ROOT, 'on-demand'));
  if (hasArchive) { score += 20; checks.push({ item: 'Record keeping system', status: 'PASS' }); }
  else { checks.push({ item: 'Record keeping system', status: 'FAIL' }); }

  return { step: 1, name: 'Establish Strong Management Systems', score, checks };
}

async function assessStep2(data, actions) {
  let score = 0;
  const checks = [];

  // 2.1 Supply chain mapped
  if (data.supplyChainMapped) { score += 25; checks.push({ item: 'Supply chain mapping', status: 'PASS' }); }
  else { checks.push({ item: 'Supply chain mapping', status: 'FAIL' }); actions.push({ step: 2, priority: 'CRITICAL', action: 'Map the full supply chain from mine to market' }); }

  // 2.2 Red flag identification process
  if (data.hasRedFlagProcess !== false) { score += 25; checks.push({ item: 'Red flag identification', status: 'PASS' }); }
  else { checks.push({ item: 'Red flag identification', status: 'FAIL' }); actions.push({ step: 2, priority: 'HIGH', action: 'Implement Annex II red flag screening for all suppliers' }); }

  // 2.3 CAHRA assessment
  if (data.cahraAssessed) { score += 25; checks.push({ item: 'CAHRA assessment', status: 'PASS' }); }
  else { checks.push({ item: 'CAHRA assessment', status: 'FAIL' }); actions.push({ step: 2, priority: 'HIGH', action: 'Assess all origin countries against CAHRA list' }); }

  // 2.4 Chain of custody documentation
  if (data.hasCustodyDocs) { score += 25; checks.push({ item: 'Chain of custody docs', status: 'PASS' }); }
  else { checks.push({ item: 'Chain of custody docs', status: 'FAIL' }); actions.push({ step: 2, priority: 'HIGH', action: 'Collect chain of custody documentation for all gold sources' }); }

  return { step: 2, name: 'Identify and Assess Supply Chain Risks', score, checks };
}

async function assessStep3(data, actions) {
  let score = 0;
  const checks = [];

  // 3.1 Risk management plan exists
  if (data.hasRiskPlan) { score += 25; checks.push({ item: 'Risk management plan', status: 'PASS' }); }
  else { checks.push({ item: 'Risk management plan', status: 'FAIL' }); actions.push({ step: 3, priority: 'HIGH', action: 'Develop risk management plan for identified supply chain risks' }); }

  // 3.2 Measurable mitigation steps
  if (data.hasMitigationSteps) { score += 25; checks.push({ item: 'Mitigation measures', status: 'PASS' }); }
  else { checks.push({ item: 'Mitigation measures', status: 'FAIL' }); }

  // 3.3 Senior management sign-off
  if (data.mgmtSignOff) { score += 25; checks.push({ item: 'Management sign-off', status: 'PASS' }); }
  else { checks.push({ item: 'Management sign-off', status: 'FAIL' }); actions.push({ step: 3, priority: 'MEDIUM', action: 'Obtain senior management sign-off on risk management strategy' }); }

  // 3.4 Disengagement criteria defined
  if (data.hasDisengagementCriteria) { score += 25; checks.push({ item: 'Disengagement criteria', status: 'PASS' }); }
  else { checks.push({ item: 'Disengagement criteria', status: 'FAIL' }); actions.push({ step: 3, priority: 'MEDIUM', action: 'Define criteria for supplier disengagement' }); }

  return { step: 3, name: 'Design and Implement Risk Management Strategy', score, checks };
}

async function assessStep4(data, actions) {
  let score = 0;
  const checks = [];

  // 4.1 Independent audit conducted
  const annualDir = resolve(HISTORY_ROOT, 'annual');
  let hasAudit = false;
  if (existsSync(annualDir)) {
    try {
      const files = await readdir(annualDir);
      hasAudit = files.some(f => /audit|programme.?effect/i.test(f));
    } catch { /* skip */ }
  }

  if (hasAudit || data.hasIndependentAudit) { score += 50; checks.push({ item: 'Independent audit', status: 'PASS' }); }
  else { checks.push({ item: 'Independent audit', status: 'FAIL' }); actions.push({ step: 4, priority: 'CRITICAL', action: 'Engage independent third-party auditor for supply chain DD audit' }); }

  // 4.2 Audit covers full supply chain
  if (data.auditCoversFullChain) { score += 25; checks.push({ item: 'Full chain coverage', status: 'PASS' }); }
  else { checks.push({ item: 'Full chain coverage', status: 'FAIL' }); }

  // 4.3 Corrective action plan from audit
  if (data.hasCorrectiveActions) { score += 25; checks.push({ item: 'Corrective action plan', status: 'PASS' }); }
  else { checks.push({ item: 'Corrective action plan', status: 'FAIL' }); }

  return { step: 4, name: 'Independent Third-Party Audit', score, checks };
}

async function assessStep5(data, actions) {
  let score = 0;
  const checks = [];

  // 5.1 Annual DD report published
  if (data.hasAnnualReport) { score += 50; checks.push({ item: 'Annual DD report', status: 'PASS' }); }
  else { checks.push({ item: 'Annual DD report', status: 'FAIL' }); actions.push({ step: 5, priority: 'HIGH', action: 'Publish annual due diligence report per OECD Step 5' }); }

  // 5.2 Ongoing monitoring in place
  const hasMonitoring = existsSync(resolve(PROJECT_ROOT, '.screening', 'webhook-state.json'));
  if (hasMonitoring) { score += 25; checks.push({ item: 'Ongoing monitoring', status: 'PASS' }); }
  else { checks.push({ item: 'Ongoing monitoring', status: 'FAIL' }); }

  // 5.3 Continuous improvement documented
  if (data.hasContinuousImprovement) { score += 25; checks.push({ item: 'Continuous improvement', status: 'PASS' }); }
  else { checks.push({ item: 'Continuous improvement', status: 'FAIL' }); }

  return { step: 5, name: 'Report on Supply Chain Due Diligence', score, checks };
}

/**
 * Check suppliers against Annex II red flags.
 */
function checkAnnexIIRedFlags(suppliers) {
  const flags = [];

  for (const supplier of suppliers) {
    // Origin country check
    if (supplier.originCountry && CAHRA_COUNTRIES.includes(supplier.originCountry)) {
      flags.push({
        supplier: supplier.name,
        redFlag: ANNEX_II_RED_FLAGS[0],
        details: `Origin country ${supplier.originCountry} is a CAHRA`,
      });
    }

    // Missing documentation
    if (!supplier.chainOfCustody) {
      flags.push({
        supplier: supplier.name,
        redFlag: ANNEX_II_RED_FLAGS[2],
        details: 'No chain of custody documentation provided',
      });
    }

    // Non-LBMA refiner
    if (supplier.refiner && !supplier.refinerAccredited) {
      flags.push({
        supplier: supplier.name,
        redFlag: ANNEX_II_RED_FLAGS[17],
        details: `Refiner "${supplier.refiner}" is not LBMA/DGD accredited`,
      });
    }

    // Sanctions check
    if (supplier.sanctioned) {
      flags.push({
        supplier: supplier.name,
        redFlag: ANNEX_II_RED_FLAGS[10],
        details: 'Supplier is on a sanctions list',
      });
    }
  }

  return flags;
}

// ── CLI ─────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('OECD 5-Step Due Diligence Assessment');
  console.log('====================================\n');

  assessFiveSteps({}).then(result => {
    console.log(`Composite Score: ${result.compositeScore}/100 (Grade: ${result.grade})\n`);

    for (const [, step] of Object.entries(result.steps)) {
      console.log(`Step ${step.step}: ${step.name} — ${step.score}/100`);
      for (const c of step.checks) {
        console.log(`  ${c.status === 'PASS' ? '+' : 'x'} ${c.item}`);
      }
    }

    if (result.actions.length > 0) {
      console.log(`\nAction Items (${result.actions.length}):`);
      for (const a of result.actions) {
        console.log(`  [${a.priority}] Step ${a.step}: ${a.action}`);
      }
    }
  }).catch(err => { console.error(err.message); process.exit(1); });
}
