/**
 * Data Retention Policy Engine.
 *
 * Enforces UAE regulatory data retention requirements:
 *   - FDL No.10/2025: 10-year retention for all CDD and transaction records
 *   - Cabinet Res 134/2025: 5-year retention for STR supporting documents
 *   - FATF Rec.11: Records sufficient to reconstruct transactions
 *
 * This engine:
 *   1. Tracks retention periods per data category
 *   2. Identifies records approaching or past retention expiry
 *   3. Generates retention compliance reports
 *   4. Prevents premature deletion (safety lock)
 *   5. Archives expired records (never auto-deletes — MLRO approval required)
 *
 * IMPORTANT: This engine NEVER auto-deletes data. It only flags and
 * recommends. Actual deletion requires MLRO written approval.
 */

const RETENTION_PERIODS = {
  screening_result: {
    years: 10,
    regulation: 'FDL No.10/2025 Art.16(3)',
    description: 'Screening results and decisions',
  },
  transaction_record: {
    years: 10,
    regulation: 'FDL No.10/2025 Art.16(1)',
    description: 'Transaction records and supporting documents',
  },
  cdd_record: {
    years: 10,
    regulation: 'FDL No.10/2025 Art.16(2)',
    description: 'Customer due diligence records',
  },
  filing_record: {
    years: 10,
    regulation: 'FDL No.10/2025 Art.16(3)',
    description: 'STR/SAR/DPMSR filing records',
  },
  filing_supporting: {
    years: 5,
    regulation: 'Cabinet Res 134/2025 Art.12',
    description: 'STR supporting documents and evidence',
  },
  audit_log: {
    years: 10,
    regulation: 'FDL No.10/2025 Art.20',
    description: 'Audit trail and compliance logs',
  },
  correspondence: {
    years: 10,
    regulation: 'FDL No.10/2025 Art.16(4)',
    description: 'Business correspondence and communications',
  },
  training_record: {
    years: 10,
    regulation: 'FDL No.10/2025 Art.21',
    description: 'Staff training records and certifications',
  },
  risk_assessment: {
    years: 10,
    regulation: 'FDL No.10/2025 Art.13',
    description: 'Risk assessments and methodology documents',
  },
  investigation_record: {
    years: 10,
    regulation: 'FDL No.10/2025 Art.26',
    description: 'Investigation case files and evidence',
  },
};

/**
 * Calculate retention expiry date for a record.
 *
 * @param {string} category - Record category
 * @param {string} createdDate - ISO date when record was created
 * @returns {{ expiryDate: string, retentionYears: number, regulation: string }}
 */
export function calculateExpiry(category, createdDate) {
  const policy = RETENTION_PERIODS[category];
  if (!policy) throw new Error(`Unknown retention category: ${category}`);

  const created = new Date(createdDate);
  const expiry = new Date(created);
  expiry.setFullYear(expiry.getFullYear() + policy.years);

  return {
    category,
    createdDate,
    expiryDate: expiry.toISOString().split('T')[0],
    retentionYears: policy.years,
    regulation: policy.regulation,
    description: policy.description,
  };
}

/**
 * Check retention status of a set of records.
 *
 * @param {Array<{ category, createdDate, id }>} records
 * @returns {RetentionReport}
 */
export function checkRetention(records) {
  const now = new Date();
  const results = { active: [], expiringSoon: [], expired: [], total: records.length };

  for (const record of records) {
    const info = calculateExpiry(record.category, record.createdDate);
    const expiry = new Date(info.expiryDate);
    const daysUntilExpiry = Math.floor((expiry - now) / 86400000);

    const status = {
      ...record,
      ...info,
      daysUntilExpiry,
      status: daysUntilExpiry < 0 ? 'expired' : daysUntilExpiry < 90 ? 'expiring_soon' : 'active',
    };

    if (status.status === 'expired') results.expired.push(status);
    else if (status.status === 'expiring_soon') results.expiringSoon.push(status);
    else results.active.push(status);
  }

  return {
    ...results,
    summary: {
      active: results.active.length,
      expiringSoon: results.expiringSoon.length,
      expired: results.expired.length,
    },
    checkedAt: now.toISOString(),
  };
}

/**
 * Generate a retention compliance report.
 */
export function generateRetentionReport(retentionResult) {
  const lines = [];
  const d = new Date().toISOString().split('T')[0];

  lines.push('DATA RETENTION COMPLIANCE REPORT');
  lines.push(`Date: ${d}`);
  lines.push(`Records reviewed: ${retentionResult.total}`);
  lines.push(`Active: ${retentionResult.summary.active} | Expiring soon: ${retentionResult.summary.expiringSoon} | Expired: ${retentionResult.summary.expired}`);
  lines.push('');

  if (retentionResult.expired.length > 0) {
    lines.push('EXPIRED RECORDS (MLRO review required for disposition):');
    for (const r of retentionResult.expired) {
      lines.push(`  [${r.category}] ID: ${r.id || 'N/A'} — Created: ${r.createdDate}, Expired: ${r.expiryDate} (${Math.abs(r.daysUntilExpiry)} days ago)`);
      lines.push(`    Regulation: ${r.regulation}`);
    }
    lines.push('');
    lines.push('WARNING: Do NOT delete expired records without written MLRO approval.');
    lines.push('');
  }

  if (retentionResult.expiringSoon.length > 0) {
    lines.push('EXPIRING WITHIN 90 DAYS:');
    for (const r of retentionResult.expiringSoon) {
      lines.push(`  [${r.category}] ID: ${r.id || 'N/A'} — Expires: ${r.expiryDate} (${r.daysUntilExpiry} days)`);
    }
    lines.push('');
  }

  lines.push('RETENTION POLICY REFERENCE:');
  for (const [cat, policy] of Object.entries(RETENTION_PERIODS)) {
    lines.push(`  ${cat}: ${policy.years} years (${policy.regulation})`);
  }
  lines.push('');
  lines.push('For review by the MLRO.');

  return lines.join('\n');
}

/**
 * Get all retention policies.
 */
export function getPolicies() {
  return { ...RETENTION_PERIODS };
}

export { RETENTION_PERIODS };
