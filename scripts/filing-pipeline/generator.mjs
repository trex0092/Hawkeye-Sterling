/**
 * Automated Filing Pipeline — Draft generator and deadline tracker.
 *
 * Generates compliance filings (STR, SAR, CTR, DPMSR, CNMR) with:
 *   1. Plain-text narrative draft (MLRO review format)
 *   2. goAML-compatible XML skeleton
 *   3. Deadline countdown with business day calculation
 *   4. Auto-archive to history/filings/
 *
 * Called by the MCP Compliance Copilot or directly:
 *   import { generateFiling } from './filing-pipeline/generator.mjs';
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const HISTORY_DIR = resolve(PROJECT_ROOT, '..', 'history', 'filings');

/** Filing type configurations with deadlines and goAML codes. */
const FILING_TYPES = {
  STR: {
    fullName: 'Suspicious Transaction Report',
    goamlCode: 'STR',
    deadlineBusinessDays: 10,
    regulation: 'FDL No.10/2025 Art.26-27',
    requiresApproval: true,
    approver: 'MLRO',
    noTippingOff: true,
  },
  SAR: {
    fullName: 'Suspicious Activity Report',
    goamlCode: 'SAR',
    deadlineBusinessDays: 10,
    regulation: 'FDL No.10/2025 Art.26-27',
    requiresApproval: true,
    approver: 'MLRO',
    noTippingOff: true,
  },
  CTR: {
    fullName: 'Cash Transaction Report (DPMS)',
    goamlCode: 'CTR',
    deadlineBusinessDays: 15,
    regulation: 'MoE Circular 08/AML/2021',
    requiresApproval: false,
    threshold: 55000,
  },
  DPMSR: {
    fullName: 'Dealer in Precious Metals and Stones Report',
    goamlCode: 'DPMSR',
    deadlineBusinessDays: 15,
    regulation: 'MoE Circular 08/AML/2021',
    requiresApproval: false,
    threshold: 55000,
  },
  CNMR: {
    fullName: 'Confirmed Name Match Report',
    goamlCode: 'CNMR',
    deadlineBusinessDays: 5,
    regulation: 'Cabinet Res 74/2020 Art.4-7',
    requiresApproval: true,
    approver: 'MLRO + Senior Management',
    freezeDeadlineHours: 24,
  },
};

/**
 * Generate a compliance filing draft.
 *
 * @param {object} params
 * @param {string} params.type          - Filing type (STR, SAR, CTR, DPMSR, CNMR)
 * @param {string} params.subject_name  - Subject of the filing
 * @param {string} params.narrative     - Description of suspicious activity
 * @param {number} [params.amount_aed]  - Transaction amount
 * @param {string} [params.trigger_date] - Date of trigger event (YYYY-MM-DD)
 * @returns {{ draft: string, xml: string, deadline: object, filing_id: string }}
 */
export async function generateFiling(params) {
  const { type, subject_name, narrative, amount_aed, trigger_date } = params;

  const config = FILING_TYPES[type];
  if (!config) {
    throw new Error(`Unknown filing type: ${type}. Valid: ${Object.keys(FILING_TYPES).join(', ')}`);
  }

  const filingId = `${type}-${Date.now().toString(36).toUpperCase()}`;
  const triggerDate = trigger_date || new Date().toISOString().split('T')[0];
  const deadline = calculateDeadline(triggerDate, config.deadlineBusinessDays);

  // Generate plain-text draft
  const draft = generateDraft({ config, type, filingId, subject_name, narrative, amount_aed, triggerDate, deadline });

  // Generate goAML XML skeleton
  const xml = generateGoamlXml({ config, type, filingId, subject_name, narrative, amount_aed, triggerDate });

  // Archive
  await archiveFiling(filingId, type, draft, xml);

  return {
    filing_id: filingId,
    type,
    subject: subject_name,
    draft,
    xml,
    deadline: {
      trigger_date: triggerDate,
      due_date: deadline.dueDate,
      business_days_remaining: deadline.remaining,
      is_overdue: deadline.remaining < 0,
      freeze_deadline: config.freezeDeadlineHours
        ? { hours: config.freezeDeadlineHours, expires: addHours(triggerDate, config.freezeDeadlineHours) }
        : null,
    },
    requires_approval: config.requiresApproval,
    approver: config.approver || null,
    no_tipping_off: config.noTippingOff || false,
    regulation: config.regulation,
    next_actions: buildNextActions(config, type, deadline),
  };
}

/**
 * Generate plain-text filing draft in compliance register voice.
 */
function generateDraft({ config, type, filingId, subject_name, narrative, amount_aed, triggerDate, deadline }) {
  const lines = [];

  lines.push(`DRAFT ${config.fullName}`);
  lines.push(`Filing ID: ${filingId}`);
  lines.push(`Status: DRAFT - Pending MLRO review`);
  lines.push(`Date prepared: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');
  lines.push('1. SUBJECT DETAILS');
  lines.push(`   Name: ${subject_name}`);
  lines.push(`   Filing type: ${type} (${config.goamlCode})`);
  lines.push(`   Trigger date: ${triggerDate}`);
  if (amount_aed) {
    lines.push(`   Amount: AED ${amount_aed.toLocaleString()}`);
  }
  lines.push('');
  lines.push('2. NARRATIVE');
  lines.push(`   ${narrative}`);
  lines.push('');
  lines.push('3. REGULATORY BASIS');
  lines.push(`   Authority: ${config.regulation}`);
  if (config.noTippingOff) {
    lines.push('   WARNING: No tipping off (FDL Art.29). Do not disclose this filing to the subject.');
  }
  lines.push('');
  lines.push('4. FILING DEADLINE');
  lines.push(`   Due: ${deadline.dueDate} (${config.deadlineBusinessDays} business days from trigger)`);
  lines.push(`   Business days remaining: ${deadline.remaining}`);
  if (config.freezeDeadlineHours) {
    lines.push(`   Asset freeze deadline: ${config.freezeDeadlineHours} hours from confirmation`);
    lines.push(`   Freeze expires: ${addHours(triggerDate, config.freezeDeadlineHours)}`);
  }
  lines.push('');
  lines.push('5. REQUIRED ACTIONS');
  const actions = buildNextActions(config, type, deadline);
  for (const a of actions) {
    lines.push(`   [ ] ${a}`);
  }
  lines.push('');
  lines.push('For review by the MLRO.');

  return lines.join('\n');
}

/**
 * Generate goAML-compatible XML skeleton.
 */
function generateGoamlXml({ config, type, filingId, subject_name, narrative, amount_aed, triggerDate }) {
  const amount = amount_aed ? `<amount>${amount_aed}</amount><currency>AED</currency>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<goAMLMessage xmlns="http://www.uaefiu.gov.ae/goaml" version="4.0">
  <reportHeader>
    <reportCode>${config.goamlCode}</reportCode>
    <reportId>${filingId}</reportId>
    <reportStatus>DRAFT</reportStatus>
    <reportDate>${new Date().toISOString().split('T')[0]}</reportDate>
    <reportingEntity>
      <entityType>DPMS</entityType>
      <entityName>Hawkeye Sterling</entityName>
      <supervisoryAuthority>Ministry of Economy</supervisoryAuthority>
    </reportingEntity>
  </reportHeader>
  <reportBody>
    <suspiciousActivity>
      <subjectName>${escapeXml(subject_name)}</subjectName>
      <triggerDate>${triggerDate}</triggerDate>
      ${amount}
      <narrative>${escapeXml(narrative)}</narrative>
    </suspiciousActivity>
    <transactionDetails>
      ${amount}
      <transactionDate>${triggerDate}</transactionDate>
    </transactionDetails>
  </reportBody>
  <reportFooter>
    <filingDeadline>${calculateDeadline(triggerDate, config.deadlineBusinessDays).dueDate}</filingDeadline>
    <preparedBy>Automated Draft - Pending MLRO Review</preparedBy>
  </reportFooter>
</goAMLMessage>`;
}

/**
 * Calculate deadline in business days from a start date.
 */
function calculateDeadline(startDate, businessDays) {
  const start = new Date(startDate);
  let current = new Date(start);
  let counted = 0;

  while (counted < businessDays) {
    current.setDate(current.getDate() + 1);
    const dow = current.getDay();
    // Skip weekends (UAE: Friday-Saturday are weekends)
    if (dow !== 5 && dow !== 6) {
      counted++;
    }
  }

  const dueDate = current.toISOString().split('T')[0];

  // Calculate remaining business days from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let remaining = 0;
  const cursor = new Date(today);

  if (cursor <= current) {
    while (cursor < current) {
      cursor.setDate(cursor.getDate() + 1);
      const dow = cursor.getDay();
      if (dow !== 5 && dow !== 6) remaining++;
    }
  } else {
    // Overdue
    while (cursor > current) {
      current.setDate(current.getDate() + 1);
      const dow = current.getDay();
      if (dow !== 5 && dow !== 6) remaining--;
    }
  }

  return { dueDate, remaining };
}

function addHours(dateStr, hours) {
  const d = new Date(dateStr);
  d.setHours(d.getHours() + hours);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function buildNextActions(config, type, deadline) {
  const actions = [];

  if (config.freezeDeadlineHours) {
    actions.push(`Execute asset freeze within ${config.freezeDeadlineHours} hours of confirmation`);
    actions.push('Report freeze to EOCN immediately');
  }

  if (config.requiresApproval) {
    actions.push(`Obtain ${config.approver} approval before submission`);
  }

  if (config.noTippingOff) {
    actions.push('DO NOT disclose filing to the subject (FDL Art.29)');
  }

  actions.push(`Submit via goAML by ${deadline.dueDate} (${deadline.remaining} business days remaining)`);
  actions.push('Retain copy in history/filings/ for 10-year retention');

  if (type === 'STR' || type === 'SAR') {
    actions.push('Attach supporting documents (transaction records, screening results, CDD file)');
  }

  return actions;
}

function escapeXml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function archiveFiling(filingId, type, draft, xml) {
  try {
    if (!existsSync(HISTORY_DIR)) {
      await mkdir(HISTORY_DIR, { recursive: true });
    }
    const today = new Date().toISOString().split('T')[0];
    await writeFile(resolve(HISTORY_DIR, `${today}-${filingId}.txt`), draft, 'utf8');
    await writeFile(resolve(HISTORY_DIR, `${today}-${filingId}.xml`), xml, 'utf8');
  } catch { /* non-critical if archive fails */ }
}

/**
 * Detect if a screening result should trigger a filing.
 *
 * @param {object} screeningResult - Result from the screening engine.
 * @returns {{ shouldFile: boolean, type: string|null, reason: string }}
 */
export function detectFilingTrigger(screeningResult) {
  if (!screeningResult) return { shouldFile: false, type: null, reason: 'No screening result' };

  const { band, score, matches } = screeningResult;

  if (band === 'high' && score >= 0.92) {
    return {
      shouldFile: true,
      type: 'CNMR',
      reason: `Confirmed sanctions match (score ${score}). Asset freeze required within 24 hours.`,
    };
  }

  if (band === 'high' || (band === 'medium' && score >= 0.85)) {
    return {
      shouldFile: true,
      type: 'STR',
      reason: `High-confidence sanctions/PEP match (score ${score}). STR filing recommended.`,
    };
  }

  return { shouldFile: false, type: null, reason: `Score ${score} below filing threshold.` };
}
