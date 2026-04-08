/**
 * Customer Onboarding Workflow — Complete KYC → Screening → Risk → CDD → Approval flow.
 *
 * Decision tree per CLAUDE.md:
 *   1. Screen customer (sanctions + PEP + adverse media)
 *   2. Score < 6 → SDD, review at 12 months
 *   3. Score 6-15 → CDD, review at 6 months
 *   4. Score >= 16 → EDD, review at 3 months + Senior Management approval
 *   5. PEP detected → EDD + Board approval
 *   6. Sanctions match → STOP, run TFS decision tree
 */

import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname || '.', '..');

/**
 * Run the full onboarding workflow for a new customer.
 *
 * @param {object} customer
 * @param {string} customer.name
 * @param {string} customer.type - 'individual' | 'corporate'
 * @param {string} customer.country - ISO 2-letter code
 * @param {string} [customer.nationality]
 * @param {boolean} [customer.isPEP]
 * @param {number} [customer.expectedVolume] - Annual volume in AED
 * @param {string} [customer.productType] - fine_gold, gold_jewellery, precious_stones, mixed
 * @returns {{ decision, steps, nextActions, timeline }}
 */
export async function onboardCustomer(customer) {
  const steps = [];
  const timeline = [];
  const today = new Date().toISOString().split('T')[0];

  // Step 1: Screening
  timeline.push({ step: 1, action: 'Sanctions + PEP + Adverse Media Screening', date: today });
  const screening = await runScreening(customer);
  steps.push({ step: 1, name: 'Screening', result: screening });

  // Check for sanctions match → STOP
  if (screening.band === 'high') {
    const tfsResult = await runTFS(customer, screening);
    steps.push({ step: 'TFS', name: 'TFS Decision Tree', result: tfsResult });

    return {
      decision: 'REJECTED',
      reason: 'Sanctions match detected. TFS freeze procedure initiated.',
      steps,
      nextActions: tfsResult.actions?.map(a => a.action) || ['Initiate TFS freeze procedure'],
      timeline,
      cddLevel: null,
      reviewCycle: null,
    };
  }

  // Step 2: Risk Scoring
  timeline.push({ step: 2, action: 'Risk Assessment', date: today });
  const risk = calculateRisk(customer, screening);
  steps.push({ step: 2, name: 'Risk Assessment', result: risk });

  // Step 3: CDD Level Determination
  let cddLevel, reviewMonths, requiresApproval, approver;

  if (customer.isPEP) {
    cddLevel = 'EDD';
    reviewMonths = 3;
    requiresApproval = true;
    approver = 'Board of Directors';
  } else if (risk.score >= 16) {
    cddLevel = 'EDD';
    reviewMonths = 3;
    requiresApproval = true;
    approver = 'Senior Management';
  } else if (risk.score >= 6) {
    cddLevel = 'CDD';
    reviewMonths = 6;
    requiresApproval = false;
    approver = null;
  } else {
    cddLevel = 'SDD';
    reviewMonths = 12;
    requiresApproval = false;
    approver = null;
  }

  const reviewDate = new Date();
  reviewDate.setMonth(reviewDate.getMonth() + reviewMonths);

  timeline.push({ step: 3, action: `CDD Level: ${cddLevel}`, date: today });
  steps.push({
    step: 3, name: 'CDD Determination',
    result: { cddLevel, reviewMonths, requiresApproval, approver, nextReview: reviewDate.toISOString().split('T')[0] },
  });

  // Step 4: Documentation Requirements
  const docs = getRequiredDocuments(cddLevel, customer.type, customer.isPEP);
  steps.push({ step: 4, name: 'Documentation', result: { required: docs } });

  // Step 5: Approval (if required)
  if (requiresApproval) {
    timeline.push({ step: 5, action: `Approval required from ${approver}`, date: today });
    steps.push({
      step: 5, name: 'Approval',
      result: { required: true, approver, regulation: 'FDL No.10/2025 Art.14 | Cabinet Res 134/2025 Art.14' },
    });
  }

  // Build next actions
  const nextActions = [
    `Collect ${cddLevel} documentation from customer`,
    ...docs.map(d => `Obtain: ${d}`),
  ];

  if (requiresApproval) {
    nextActions.push(`Submit for ${approver} approval before proceeding`);
  }

  nextActions.push(`Set CDD review date: ${reviewDate.toISOString().split('T')[0]} (${reviewMonths} months)`);
  nextActions.push('Record onboarding in counterparty register');
  nextActions.push('Retain all documentation for minimum 10 years');

  // Record in memory
  await recordInMemory(customer, cddLevel, risk.score);

  return {
    decision: 'PROCEED',
    cddLevel,
    riskScore: risk.score,
    riskRating: risk.rating,
    reviewCycle: `${reviewMonths} months`,
    nextReview: reviewDate.toISOString().split('T')[0],
    requiresApproval,
    approver,
    steps,
    nextActions,
    timeline,
    documentation: docs,
  };
}

async function runScreening(customer) {
  try {
    const screening = await import(resolve(PROJECT_ROOT, 'screening', 'index.js'));
    await screening.init();
    return await screening.screen(customer.name, { type: customer.type, country: customer.country });
  } catch {
    return { score: 0, band: 'unknown', matches: [] };
  }
}

async function runTFS(customer, screening) {
  try {
    const { processScreeningResult } = await import(resolve(PROJECT_ROOT, 'screening', 'tfs', 'decision-tree.mjs'));
    return processScreeningResult({
      subjectName: customer.name,
      outcome: 'confirmed',
      score: screening.score,
      matchedLists: screening.matches?.map(m => m.source) || [],
    });
  } catch {
    return { state: 'CONFIRMED_MATCH', actions: [{ action: 'FREEZE immediately and file CNMR' }] };
  }
}

function calculateRisk(customer, screening) {
  let likelihood = 1;
  const factors = [];

  const BLACKLIST = ['IR', 'KP', 'MM'];
  const GREYLIST = ['AL', 'BG', 'BF', 'CM', 'HR', 'CD', 'EG', 'HT', 'KE', 'LB', 'MG', 'MC', 'MZ', 'NA', 'NG', 'PH', 'SN', 'ZA', 'SS', 'SY', 'VE', 'YE'];

  if (BLACKLIST.includes(customer.country)) { likelihood += 3; factors.push('FATF blacklist'); }
  else if (GREYLIST.includes(customer.country)) { likelihood += 2; factors.push('FATF greylist'); }
  if (customer.isPEP) { likelihood += 2; factors.push('PEP'); }
  if (customer.expectedVolume > 5000000) { likelihood += 1; factors.push('High volume'); }
  if (customer.productType === 'fine_gold') { likelihood += 1; factors.push('Fine gold'); }
  if (screening.band === 'medium') { likelihood += 1; factors.push('Screening match'); }

  likelihood = Math.min(5, likelihood);
  const impact = 4;
  const score = likelihood * impact;
  const rating = score >= 16 ? 'HIGH' : score >= 6 ? 'MEDIUM' : 'LOW';

  return { score, rating, likelihood, impact, factors };
}

function getRequiredDocuments(cddLevel, customerType, isPEP) {
  const docs = [];

  // Base CDD docs
  if (customerType === 'individual') {
    docs.push('Valid passport or Emirates ID (certified copy)');
    docs.push('Proof of address (utility bill or bank statement, < 3 months)');
    docs.push('Source of funds declaration');
  } else {
    docs.push('Trade license (certified copy)');
    docs.push('Certificate of incorporation');
    docs.push('Memorandum/Articles of Association');
    docs.push('Board resolution authorizing signatory');
    docs.push('UBO identification (>= 25% ownership)');
    docs.push('Passport copies of all UBOs and authorized signatories');
  }

  // EDD additional docs
  if (cddLevel === 'EDD') {
    docs.push('Source of wealth documentation');
    docs.push('Enhanced source of funds verification');
    docs.push('Business purpose statement for gold transactions');
    docs.push('Bank reference letter');
    if (isPEP) {
      docs.push('PEP declaration form');
      docs.push('Board/Senior Management approval documentation');
    }
  }

  return docs;
}

async function recordInMemory(customer, cddLevel, riskScore) {
  try {
    const mem = (await import(resolve(PROJECT_ROOT, 'claude-mem', 'index.mjs'))).default;
    mem.startSession(`onboard-${Date.now().toString(36)}`);
    mem.observe({
      category: 'entity_interaction',
      content: `Onboarding: ${customer.name} (${customer.country}), risk: ${riskScore}, CDD: ${cddLevel}`,
      entityName: customer.name,
      importance: riskScore >= 16 ? 8 : 6,
    });
    await mem.endSession(`Onboarding: ${customer.name}`);
    mem.close();
  } catch { /* optional */ }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const name = process.argv[2] || 'Test Entity';
  const country = process.argv[3] || 'AE';
  onboardCustomer({ name, type: 'corporate', country, productType: 'fine_gold' })
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e.message); process.exit(1); });
}
