/**
 * Wire Transfer Rule Engine — FATF Recommendation 16 implementation.
 *
 * Validates originator and beneficiary information for all wire transfers.
 * UAE threshold: AED 3,500 (cross-border) per FATF Rec 16 / Cabinet Res 134/2025.
 *
 * For transfers >= AED 3,500:
 *   - Full originator info required (name, account, address/DOB/ID)
 *   - Full beneficiary info required (name, account)
 *   - Ordering institution must include all originator info
 *   - Intermediary must pass through all info unchanged
 *   - Beneficiary institution must identify incomplete transfers
 *
 * For transfers < AED 3,500:
 *   - Originator name and account required (minimum)
 *   - Beneficiary name required
 *   - Full info must be obtainable within 3 business days on request
 *
 * Regulatory basis:
 *   - FATF Recommendation 16 (Wire Transfers)
 *   - FATF Interpretive Note to Rec 16
 *   - Cabinet Resolution 134/2025 Art.12-13
 *   - FDL No.10/2025 Art.15
 *   - CBUAE Wire Transfer Regulations
 */

const THRESHOLD_AED = 3500;

/** Required originator fields for transfers >= threshold. */
const FULL_ORIGINATOR_FIELDS = [
  { field: 'originatorName', label: 'Originator name', required: true },
  { field: 'originatorAccount', label: 'Originator account number', required: true },
  { field: 'originatorAddress', label: 'Originator address (or DOB+birthplace, or national ID)', required: true, alternatives: ['originatorDOB', 'originatorNationalId'] },
  { field: 'originatorCountry', label: 'Originator country', required: true },
];

/** Required beneficiary fields for transfers >= threshold. */
const FULL_BENEFICIARY_FIELDS = [
  { field: 'beneficiaryName', label: 'Beneficiary name', required: true },
  { field: 'beneficiaryAccount', label: 'Beneficiary account number', required: true },
];

/** Minimum fields for transfers < threshold. */
const MIN_ORIGINATOR_FIELDS = [
  { field: 'originatorName', label: 'Originator name', required: true },
  { field: 'originatorAccount', label: 'Originator account number', required: true },
];

const MIN_BENEFICIARY_FIELDS = [
  { field: 'beneficiaryName', label: 'Beneficiary name', required: true },
];

/**
 * Validate a wire transfer against FATF Rec 16 requirements.
 *
 * @param {object} transfer
 * @param {number} transfer.amount           - Amount in AED
 * @param {boolean} transfer.isCrossBorder   - Is this cross-border?
 * @param {string} [transfer.originatorName]
 * @param {string} [transfer.originatorAccount]
 * @param {string} [transfer.originatorAddress]
 * @param {string} [transfer.originatorDOB]
 * @param {string} [transfer.originatorNationalId]
 * @param {string} [transfer.originatorCountry]
 * @param {string} [transfer.beneficiaryName]
 * @param {string} [transfer.beneficiaryAccount]
 * @param {string} [transfer.orderingInstitution]
 * @param {string} [transfer.beneficiaryInstitution]
 * @returns {{ compliant, missingFields, warnings, actions, regulation }}
 */
export function validateWireTransfer(transfer) {
  const { amount, isCrossBorder } = transfer;
  const isAboveThreshold = amount >= THRESHOLD_AED;
  const missingFields = [];
  const warnings = [];
  const actions = [];

  // Determine which fields to check
  const originatorFields = isAboveThreshold ? FULL_ORIGINATOR_FIELDS : MIN_ORIGINATOR_FIELDS;
  const beneficiaryFields = isAboveThreshold ? FULL_BENEFICIARY_FIELDS : MIN_BENEFICIARY_FIELDS;

  // Check originator fields
  for (const field of originatorFields) {
    if (field.alternatives) {
      // At least one of the alternatives must be present
      const hasMain = !!transfer[field.field];
      const hasAlt = field.alternatives.some(alt => !!transfer[alt]);
      if (!hasMain && !hasAlt) {
        missingFields.push({
          field: field.field,
          label: field.label,
          type: 'originator',
          severity: 'HIGH',
        });
      }
    } else if (!transfer[field.field]) {
      missingFields.push({
        field: field.field,
        label: field.label,
        type: 'originator',
        severity: field.required ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  // Check beneficiary fields
  for (const field of beneficiaryFields) {
    if (!transfer[field.field]) {
      missingFields.push({
        field: field.field,
        label: field.label,
        type: 'beneficiary',
        severity: field.required ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  // Cross-border specific checks
  if (isCrossBorder) {
    if (!transfer.orderingInstitution) {
      warnings.push('Cross-border transfer: ordering institution not identified');
    }
    if (!transfer.beneficiaryInstitution) {
      warnings.push('Cross-border transfer: beneficiary institution not identified');
    }

    // AED 60K cross-border declaration
    if (amount >= 60000) {
      warnings.push('AED 60,000 cross-border threshold — customs declaration required');
      actions.push('File HRC/HRCA if destination is high-risk country');
    }

    // AED 55K DPMSR
    if (amount >= 55000) {
      actions.push('File DPMSR via goAML within 2 weeks');
    }
  }

  // Determine compliance status
  const compliant = missingFields.length === 0;

  if (!compliant) {
    actions.push('Obtain missing originator/beneficiary information before processing');
    actions.push('If information cannot be obtained, REJECT the transfer');
    actions.push('Consider filing STR if refusal to provide info is suspicious');
  }

  // Below-threshold note
  if (!isAboveThreshold) {
    warnings.push(`Below AED ${THRESHOLD_AED} threshold — reduced info acceptable, but full info must be obtainable within 3 business days on request`);
  }

  return {
    compliant,
    amount,
    threshold: THRESHOLD_AED,
    aboveThreshold: isAboveThreshold,
    isCrossBorder,
    missingFields,
    missingCount: missingFields.length,
    warnings,
    actions,
    regulation: 'FATF Recommendation 16 | Cabinet Res 134/2025 Art.12-13 | FDL No.10/2025 Art.15',
  };
}

/**
 * Batch validate multiple wire transfers.
 */
export function batchValidate(transfers) {
  const results = transfers.map(t => ({ transfer: t, ...validateWireTransfer(t) }));
  const nonCompliant = results.filter(r => !r.compliant);

  return {
    total: transfers.length,
    compliant: results.filter(r => r.compliant).length,
    nonCompliant: nonCompliant.length,
    results,
    summary: nonCompliant.length > 0
      ? `${nonCompliant.length}/${transfers.length} transfers have incomplete originator/beneficiary info`
      : 'All transfers compliant with FATF Rec 16',
  };
}

export { THRESHOLD_AED };
