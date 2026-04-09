/**
 * goAML XML Schema Validator — Validates filing XML against UAE FIU schema.
 *
 * Checks:
 *   1. Required XML elements present
 *   2. Report code matches valid type (STR, SAR, CTR, DPMSR, HRC, HRCA, CNMR, PNMR, AIF)
 *   3. Entity information complete
 *   4. Transaction details present for transaction-based reports
 *   5. Date formats correct (YYYY-MM-DD)
 *   6. Amount fields are numeric
 *   7. Currency codes are valid ISO 4217
 *   8. No empty mandatory fields
 *
 * Usage:
 *   import { validateGoamlXml } from './goaml-validator.mjs';
 *   const result = validateGoamlXml(xmlString);
 */

const VALID_REPORT_CODES = ['STR', 'SAR', 'CTR', 'DPMSR', 'HRC', 'HRCA', 'CNMR', 'PNMR', 'FFR', 'AIF', 'AIFT'];

const VALID_CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CNY', 'INR', 'SAR', 'KWD', 'BHD', 'OMR', 'QAR'];

const REQUIRED_ELEMENTS = {
  reportHeader: ['reportCode', 'reportId', 'reportDate', 'reportingEntity'],
  reportingEntity: ['entityType', 'entityName'],
  reportBody: [], // varies by report type
};

const REPORT_SPECIFIC_REQUIREMENTS = {
  STR: { requiresNarrative: true, requiresTransaction: false, requiresSubject: true },
  SAR: { requiresNarrative: true, requiresTransaction: false, requiresSubject: true },
  CTR: { requiresNarrative: false, requiresTransaction: true, requiresSubject: false },
  DPMSR: { requiresNarrative: false, requiresTransaction: true, requiresSubject: false },
  HRC: { requiresNarrative: false, requiresTransaction: true, requiresSubject: false },
  HRCA: { requiresNarrative: true, requiresTransaction: false, requiresSubject: false },
  CNMR: { requiresNarrative: true, requiresTransaction: false, requiresSubject: true },
  PNMR: { requiresNarrative: true, requiresTransaction: false, requiresSubject: true },
};

/**
 * Validate a goAML XML string.
 *
 * @param {string} xml - The goAML XML string.
 * @returns {{ valid, errors, warnings, reportCode, summary }}
 */
export function validateGoamlXml(xml) {
  if (!xml || typeof xml !== 'string') {
    return { valid: false, errors: [{ code: 'EMPTY', message: 'XML string is empty or not provided' }], warnings: [], reportCode: null };
  }

  const errors = [];
  const warnings = [];

  // 1. Basic XML structure
  if (!xml.includes('<?xml')) {
    warnings.push({ code: 'NO_DECLARATION', message: 'Missing XML declaration (<?xml version="1.0"?>)' });
  }

  if (!xml.includes('goAMLMessage')) {
    errors.push({ code: 'NO_ROOT', message: 'Missing <goAMLMessage> root element' });
    return { valid: false, errors, warnings, reportCode: null };
  }

  // 2. Report header
  if (!xml.includes('<reportHeader>')) {
    errors.push({ code: 'NO_HEADER', message: 'Missing <reportHeader> element' });
  }

  // 3. Report code
  const reportCodeMatch = xml.match(/<reportCode>\s*([^<]+)\s*<\/reportCode>/);
  const reportCode = reportCodeMatch ? reportCodeMatch[1].trim() : null;

  if (!reportCode) {
    errors.push({ code: 'NO_REPORT_CODE', message: 'Missing <reportCode> element' });
  } else if (!VALID_REPORT_CODES.includes(reportCode)) {
    errors.push({ code: 'INVALID_REPORT_CODE', message: `Invalid report code: "${reportCode}". Valid: ${VALID_REPORT_CODES.join(', ')}` });
  }

  // 4. Report ID
  const reportIdMatch = xml.match(/<reportId>\s*([^<]+)\s*<\/reportId>/);
  if (!reportIdMatch || !reportIdMatch[1].trim()) {
    errors.push({ code: 'NO_REPORT_ID', message: 'Missing or empty <reportId>' });
  }

  // 5. Report date
  const reportDateMatch = xml.match(/<reportDate>\s*([^<]+)\s*<\/reportDate>/);
  if (!reportDateMatch) {
    errors.push({ code: 'NO_REPORT_DATE', message: 'Missing <reportDate>' });
  } else {
    const dateStr = reportDateMatch[1].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      errors.push({ code: 'INVALID_DATE_FORMAT', message: `Report date "${dateStr}" not in YYYY-MM-DD format` });
    } else {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        errors.push({ code: 'INVALID_DATE', message: `Report date "${dateStr}" is not a valid date` });
      }
    }
  }

  // 6. Reporting entity
  if (!xml.includes('<reportingEntity>')) {
    errors.push({ code: 'NO_ENTITY', message: 'Missing <reportingEntity> element' });
  } else {
    if (!xml.includes('<entityName>') || xml.match(/<entityName>\s*<\/entityName>/)) {
      errors.push({ code: 'EMPTY_ENTITY_NAME', message: 'Entity name is empty' });
    }
    if (!xml.includes('<entityType>')) {
      warnings.push({ code: 'NO_ENTITY_TYPE', message: 'Missing <entityType> (should be "DPMS")' });
    }
  }

  // 7. Report body
  if (!xml.includes('<reportBody>')) {
    errors.push({ code: 'NO_BODY', message: 'Missing <reportBody> element' });
  }

  // 8. Report-specific requirements
  if (reportCode && REPORT_SPECIFIC_REQUIREMENTS[reportCode]) {
    const reqs = REPORT_SPECIFIC_REQUIREMENTS[reportCode];

    if (reqs.requiresNarrative && !xml.includes('<narrative>')) {
      errors.push({ code: 'NO_NARRATIVE', message: `${reportCode} requires a <narrative> element` });
    }
    if (reqs.requiresNarrative) {
      const narrativeMatch = xml.match(/<narrative>\s*([^<]*)\s*<\/narrative>/);
      if (narrativeMatch && narrativeMatch[1].trim().length < 50) {
        warnings.push({ code: 'SHORT_NARRATIVE', message: 'Narrative is very short (< 50 chars). FIU may request additional detail.' });
      }
    }

    if (reqs.requiresTransaction && !xml.includes('<transactionDetails>')) {
      errors.push({ code: 'NO_TRANSACTION', message: `${reportCode} requires <transactionDetails> element` });
    }

    if (reqs.requiresSubject && !xml.includes('<subjectName>')) {
      errors.push({ code: 'NO_SUBJECT', message: `${reportCode} requires a <subjectName> element` });
    }
  }

  // 9. Amount validation
  const amounts = xml.matchAll(/<amount>\s*([^<]*)\s*<\/amount>/g);
  for (const match of amounts) {
    const val = match[1].trim();
    if (val && isNaN(Number(val))) {
      errors.push({ code: 'INVALID_AMOUNT', message: `Non-numeric amount: "${val}"` });
    }
  }

  // 10. Currency validation
  const currencies = xml.matchAll(/<currency>\s*([^<]*)\s*<\/currency>/g);
  for (const match of currencies) {
    const cur = match[1].trim();
    if (cur && !VALID_CURRENCIES.includes(cur)) {
      warnings.push({ code: 'UNKNOWN_CURRENCY', message: `Currency "${cur}" not in common list. Verify ISO 4217 code.` });
    }
  }

  // 11. Check for DRAFT status warning
  if (xml.includes('DRAFT')) {
    warnings.push({ code: 'DRAFT_STATUS', message: 'Report is in DRAFT status. Change to final before goAML submission.' });
  }

  // 12. Check for empty mandatory fields
  const emptyElements = xml.matchAll(/<(\w+)>\s*<\/\1>/g);
  for (const match of emptyElements) {
    const tag = match[1];
    if (['narrative', 'subjectName', 'amount', 'transactionDate', 'originCountry', 'destinationCountry'].includes(tag)) {
      warnings.push({ code: 'EMPTY_FIELD', message: `Empty <${tag}> element — populate before submission` });
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    reportCode,
    summary: valid
      ? `${reportCode} XML is valid (${warnings.length} warning${warnings.length !== 1 ? 's' : ''})`
      : `${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`,
  };
}

/**
 * Validate and return a detailed report.
 */
export function validateAndReport(xml) {
  const result = validateGoamlXml(xml);

  const lines = [
    'goAML XML VALIDATION REPORT',
    `Date: ${new Date().toISOString().split('T')[0]}`,
    `Report code: ${result.reportCode || 'UNKNOWN'}`,
    `Status: ${result.valid ? 'VALID' : 'INVALID'}`,
    '',
  ];

  if (result.errors.length > 0) {
    lines.push('ERRORS (must fix before submission):');
    for (const e of result.errors) {
      lines.push(`  [${e.code}] ${e.message}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('WARNINGS (review recommended):');
    for (const w of result.warnings) {
      lines.push(`  [${w.code}] ${w.message}`);
    }
    lines.push('');
  }

  if (result.valid && result.warnings.length === 0) {
    lines.push('No issues found. Ready for goAML submission.');
  }

  lines.push('');
  lines.push('For review by the MLRO.');

  return { ...result, report: lines.join('\n') };
}

export { VALID_REPORT_CODES, VALID_CURRENCIES };
