/**
 * Bulk Entity Onboarding — CSV upload for mass screening.
 *
 * Enables compliance teams to:
 *   1. Upload a CSV of counterparties / customers
 *   2. Screen all entities against sanctions/PEP lists
 *   3. Calculate risk scores for each entity
 *   4. Generate a prioritized onboarding report
 *   5. Flag entities requiring EDD before onboarding
 *
 * CSV format (flexible headers, auto-detected):
 *   name, country, type, dob, id_number, annual_volume, product_type
 *
 * Output: Structured report with pass/fail/review decisions per entity.
 */

import { resolve } from 'node:path';

/**
 * Parse a CSV string into entity records.
 * Auto-detects column mapping from headers.
 */
export function parseCSV(csvString) {
  const lines = csvString.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

  const colMap = {
    name: headers.findIndex(h => h.includes('name') && !h.includes('country')),
    country: headers.findIndex(h => h.includes('country') || h.includes('jurisdiction')),
    type: headers.findIndex(h => h.includes('type') && !h.includes('product')),
    dob: headers.findIndex(h => h.includes('dob') || h.includes('date_of_birth') || h.includes('birth')),
    idNumber: headers.findIndex(h => h.includes('id') && (h.includes('number') || h.includes('passport') || h.includes('emirates'))),
    annualVolume: headers.findIndex(h => h.includes('volume') || h.includes('turnover') || h.includes('revenue')),
    productType: headers.findIndex(h => h.includes('product')),
  };

  if (colMap.name < 0) throw new Error('CSV must have a "name" column');

  return lines.slice(1).map((line, idx) => {
    const cols = parseCSVLine(line);
    return {
      rowIndex: idx + 2,
      name: (cols[colMap.name] || '').trim(),
      country: colMap.country >= 0 ? (cols[colMap.country] || '').trim() : '',
      type: colMap.type >= 0 ? (cols[colMap.type] || 'entity').trim() : 'entity',
      dob: colMap.dob >= 0 ? (cols[colMap.dob] || '').trim() : '',
      idNumber: colMap.idNumber >= 0 ? (cols[colMap.idNumber] || '').trim() : '',
      annualVolume: colMap.annualVolume >= 0 ? Number(cols[colMap.annualVolume]) || 0 : 0,
      productType: colMap.productType >= 0 ? (cols[colMap.productType] || '').trim() : '',
    };
  }).filter(e => e.name);
}

function parseCSVLine(line) {
  const cols = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { cols.push(current); current = ''; continue; }
    current += ch;
  }
  cols.push(current);
  return cols;
}

/**
 * Run bulk screening on parsed entities.
 *
 * @param {Array} entities - Parsed entity records
 * @param {object} [opts]
 * @param {string} [opts.projectRoot] - Project root for screening module
 * @param {boolean} [opts.includeRiskScore] - Calculate risk scores (default true)
 * @param {Function} [opts.onProgress] - Progress callback (idx, total, entity)
 * @returns {BulkScreeningResult}
 */
export async function bulkScreen(entities, opts = {}) {
  const projectRoot = opts.projectRoot || process.cwd();
  const includeRisk = opts.includeRiskScore !== false;

  let screening;
  try {
    screening = await import(resolve(projectRoot, 'screening', 'index.js'));
    await screening.init();
  } catch (err) {
    throw new Error(`Cannot initialize screening engine: ${err.message}`);
  }

  const results = [];
  const summary = { total: entities.length, clear: 0, review: 0, block: 0, error: 0 };

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    opts.onProgress?.(i, entities.length, entity);

    try {
      const screenResult = await screening.screen({
        name: entity.name,
        type: entity.type || 'entity',
        countries: entity.country ? [entity.country] : undefined,
        dob: entity.dob || undefined,
      }, { force: true, includeAdverseMedia: false });

      let riskScore = null;
      if (includeRisk) {
        try {
          const { calculateRisk } = await import(resolve(projectRoot, 'screening', 'analysis', 'risk-scoring.mjs'));
          riskScore = calculateRisk({
            name: entity.name,
            country: entity.country,
            annualVolumeAed: entity.annualVolume,
            productType: entity.productType || 'mixed',
          });
        } catch { /* risk scoring optional */ }
      }

      const decision = screenResult.decision || 'clear';
      summary[decision === 'clear' ? 'clear' : decision === 'block' ? 'block' : 'review']++;

      results.push({
        row: entity.rowIndex,
        name: entity.name,
        country: entity.country,
        type: entity.type,
        screening: {
          decision: screenResult.decision,
          topBand: screenResult.topBand,
          hitCount: screenResult.hits?.length || 0,
          topScore: screenResult.hits?.[0]?.score || 0,
          topMatchName: screenResult.hits?.[0]?.matchedName || null,
          caseId: screenResult.caseId,
        },
        risk: riskScore ? {
          score: riskScore.score,
          band: riskScore.band,
          cddLevel: riskScore.cddLevel,
          reviewCycle: riskScore.reviewCycle,
        } : null,
        onboardingDecision: getOnboardingDecision(screenResult, riskScore),
      });
    } catch (err) {
      summary.error++;
      results.push({
        row: entity.rowIndex,
        name: entity.name,
        country: entity.country,
        error: err.message,
        onboardingDecision: 'ERROR',
      });
    }
  }

  return {
    results,
    summary,
    report: generateOnboardingReport(results, summary),
    screenedAt: new Date().toISOString(),
  };
}

function getOnboardingDecision(screenResult, riskScore) {
  if (screenResult.decision === 'block') return 'REJECT';
  if (screenResult.topBand === 'high' || screenResult.topBand === 'exact') return 'REJECT';
  if (screenResult.topBand === 'medium') return 'EDD_REQUIRED';
  if (riskScore && riskScore.score >= 16) return 'EDD_REQUIRED';
  if (riskScore && riskScore.band === 'HIGH') return 'EDD_REQUIRED';
  if (screenResult.topBand === 'low') return 'CDD_ENHANCED';
  return 'APPROVED';
}

function generateOnboardingReport(results, summary) {
  const lines = [];
  const d = new Date().toISOString().split('T')[0];

  lines.push('BULK ONBOARDING SCREENING REPORT');
  lines.push(`Date: ${d}`);
  lines.push(`Total entities: ${summary.total}`);
  lines.push(`Clear: ${summary.clear} | Review: ${summary.review} | Block: ${summary.block} | Error: ${summary.error}`);
  lines.push('');

  const blocked = results.filter(r => r.onboardingDecision === 'REJECT');
  if (blocked.length > 0) {
    lines.push('*** REJECTED — DO NOT ONBOARD ***');
    for (const r of blocked) {
      lines.push(`  [ROW ${r.row}] ${r.name} (${r.country || 'N/A'}) — ${r.screening?.topBand || 'blocked'}, score: ${r.screening?.topScore || 'N/A'}`);
    }
    lines.push('');
  }

  const edd = results.filter(r => r.onboardingDecision === 'EDD_REQUIRED');
  if (edd.length > 0) {
    lines.push('*** EDD REQUIRED BEFORE ONBOARDING ***');
    for (const r of edd) {
      lines.push(`  [ROW ${r.row}] ${r.name} (${r.country || 'N/A'}) — ${r.screening?.topBand || 'review'}, risk: ${r.risk?.band || 'N/A'}`);
    }
    lines.push('');
  }

  const approved = results.filter(r => r.onboardingDecision === 'APPROVED');
  lines.push(`APPROVED FOR ONBOARDING: ${approved.length} entities`);
  lines.push('');
  lines.push('For review by the MLRO.');

  return lines.join('\n');
}

export { parseCSVLine };
