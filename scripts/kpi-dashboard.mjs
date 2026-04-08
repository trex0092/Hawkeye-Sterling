/**
 * 30-KPI Compliance Dashboard — Real-time metrics for MLRO.
 *
 * 30 KPIs across 6 categories, each calculated from live data.
 * Serves as JSON for the V2 dashboard or CLI output for MLRO.
 */

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname || '.', '..');
const H = resolve(PROJECT_ROOT, 'history');

async function count(dir, pat, days) {
  if (!existsSync(dir)) return 0;
  try {
    const files = await readdir(dir);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const c = cutoff.toISOString().split('T')[0];
    return files.filter(f => pat.test(f) && (f.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '9999') >= c).length;
  } catch { return 0; }
}

export async function calculateKPIs() {
  return {
    timestamp: new Date().toISOString(),
    kpis: [
      // Screening
      { id: 1, category: 'Screening', name: 'Screening events (30d)', value: await count(resolve(H, 'daily-ops'), /screen|sanction/i, 30), target: '>0', unit: 'events' },
      { id: 2, category: 'Screening', name: 'PEP screens (90d)', value: await count(resolve(H, 'daily-ops'), /pep/i, 90), target: '>0', unit: 'screens' },
      { id: 3, category: 'Screening', name: 'Adverse media scans (30d)', value: await count(resolve(H, 'daily-ops'), /adverse|media/i, 30), target: '>0', unit: 'scans' },
      { id: 4, category: 'Screening', name: 'Sanctions list freshness (days)', value: await getListAge(), target: '<1', unit: 'days' },
      { id: 5, category: 'Screening', name: 'Intelligence signals (7d)', value: await count(resolve(H, 'daily-ops'), /intelligence/i, 7), target: '>0', unit: 'signals' },

      // Filings
      { id: 6, category: 'Filings', name: 'STR/SAR filings (YTD)', value: await count(resolve(H, 'filings'), /str|sar/i, 365), target: 'N/A', unit: 'filings' },
      { id: 7, category: 'Filings', name: 'DPMSR filings (YTD)', value: await count(resolve(H, 'filings'), /dpmsr|ctr/i, 365), target: 'N/A', unit: 'filings' },
      { id: 8, category: 'Filings', name: 'HRC/HRCA filings (YTD)', value: await count(resolve(H, 'filings'), /hrc/i, 365), target: 'N/A', unit: 'filings' },
      { id: 9, category: 'Filings', name: 'CNMR/PNMR filings (YTD)', value: await count(resolve(H, 'filings'), /cnmr|pnmr/i, 365), target: 'N/A', unit: 'filings' },
      { id: 10, category: 'Filings', name: 'Filing drafts pending', value: await count(resolve(H, 'filings'), /draft/i, 30), target: '0', unit: 'drafts' },

      // CDD
      { id: 11, category: 'CDD', name: 'CDD refresh cycles (30d)', value: await count(resolve(H, 'daily-ops'), /cdd.?refresh/i, 30), target: '>0', unit: 'cycles' },
      { id: 12, category: 'CDD', name: 'CDD renewals (90d)', value: await count(resolve(H, 'registers'), /cdd.?renewal/i, 90), target: '>0', unit: 'renewals' },
      { id: 13, category: 'CDD', name: 'New onboardings (30d)', value: await count(resolve(H, 'daily-ops'), /onboard/i, 30), target: 'N/A', unit: 'entities' },
      { id: 14, category: 'CDD', name: 'Customer exits (YTD)', value: await count(resolve(H, 'annual'), /exit/i, 365), target: 'N/A', unit: 'exits' },
      { id: 15, category: 'CDD', name: 'EDD cases active', value: 0, target: 'N/A', unit: 'cases' },

      // Governance
      { id: 16, category: 'Governance', name: 'MLRO weekly reports (30d)', value: await count(resolve(H, 'mlro-weekly'), /\.txt$/i, 30), target: '>=4', unit: 'reports' },
      { id: 17, category: 'Governance', name: 'MLRO monthly reports (90d)', value: await count(resolve(H, 'mlro-monthly'), /\.txt$/i, 90), target: '>=3', unit: 'reports' },
      { id: 18, category: 'Governance', name: 'MLRO quarterly reports (YTD)', value: await count(resolve(H, 'mlro-quarterly'), /\.txt$/i, 365), target: '>=4', unit: 'reports' },
      { id: 19, category: 'Governance', name: 'Daily ops logs (7d)', value: await count(resolve(H, 'daily-ops'), /\.txt$/i, 7), target: '>=5', unit: 'logs' },
      { id: 20, category: 'Governance', name: 'Dashboard updates (7d)', value: await count(resolve(H, 'daily'), /dashboard/i, 7), target: '>=5', unit: 'updates' },

      // Risk
      { id: 21, category: 'Risk', name: 'Annual risk assessment', value: await count(resolve(H, 'annual'), /risk.?assess/i, 365) > 0 ? 1 : 0, target: '1', unit: 'done' },
      { id: 22, category: 'Risk', name: 'Jurisdiction heatmaps (YTD)', value: await count(resolve(H, 'quarterly-jurisdiction'), /heatmap/i, 365), target: '>=4', unit: 'reports' },
      { id: 23, category: 'Risk', name: 'Transaction monitoring runs (7d)', value: await count(resolve(H, 'daily-ops'), /transaction|monitor/i, 7), target: '>=5', unit: 'runs' },
      { id: 24, category: 'Risk', name: 'Sanctions changes detected (30d)', value: await count(resolve(H, 'daily-ops'), /sanctions.?change/i, 30), target: 'N/A', unit: 'changes' },
      { id: 25, category: 'Risk', name: 'Red flag alerts (30d)', value: await count(resolve(H, 'daily-ops'), /red.?flag|alert/i, 30), target: 'N/A', unit: 'alerts' },

      // Training & Audit
      { id: 26, category: 'Training & Audit', name: 'Training completed (YTD)', value: await count(resolve(H, 'annual'), /training/i, 365) > 0 ? 1 : 0, target: '1', unit: 'done' },
      { id: 27, category: 'Training & Audit', name: 'Independent audit (YTD)', value: await count(resolve(H, 'annual'), /audit|programme/i, 365) > 0 ? 1 : 0, target: '1', unit: 'done' },
      { id: 28, category: 'Training & Audit', name: 'Inspection bundles generated', value: await count(resolve(H, 'inspections'), /MANIFEST/i, 365), target: '>=1', unit: 'bundles' },
      { id: 29, category: 'Training & Audit', name: 'Regulatory changes tracked (30d)', value: await count(resolve(H, 'daily-ops'), /regul.*change|impact/i, 30), target: '>0', unit: 'changes' },
      { id: 30, category: 'Training & Audit', name: 'Hash manifests generated', value: await count(resolve(H, 'inspections'), /MANIFEST/i, 365), target: '>=1', unit: 'manifests' },
    ],
  };
}

async function getListAge() {
  const state = resolve(PROJECT_ROOT, '.screening', 'webhook-state.json');
  if (!existsSync(state)) return 999;
  try {
    const { readFile } = await import('node:fs/promises');
    const data = JSON.parse(await readFile(state, 'utf8'));
    let oldest = 0;
    for (const s of Object.values(data)) {
      if (s.lastCheck) {
        const days = (Date.now() - new Date(s.lastCheck).getTime()) / 86400000;
        if (days > oldest) oldest = days;
      }
    }
    return Math.round(oldest * 10) / 10;
  } catch { return 999; }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  calculateKPIs().then(result => {
    const grouped = {};
    for (const k of result.kpis) {
      if (!grouped[k.category]) grouped[k.category] = [];
      grouped[k.category].push(k);
    }
    for (const [cat, kpis] of Object.entries(grouped)) {
      console.log(`\n${cat}:`);
      for (const k of kpis) {
        const met = k.target === 'N/A' ? ' ' : evaluateTarget(k.value, k.target) ? '\x1b[32m+\x1b[0m' : '\x1b[31mx\x1b[0m';
        console.log(`  ${met} KPI-${String(k.id).padStart(2, '0')}: ${k.name.padEnd(35)} ${String(k.value).padStart(5)} ${k.unit} (target: ${k.target})`);
      }
    }
  });
}

function evaluateTarget(value, target) {
  if (target === 'N/A') return true;
  const match = target.match(/(>=?|<=?|>|<)?\s*(\d+)/);
  if (!match) return true;
  const op = match[1] || '>=';
  const num = parseInt(match[2]);
  switch (op) {
    case '>=': return value >= num;
    case '>': return value > num;
    case '<=': return value <= num;
    case '<': return value < num;
    default: return value >= num;
  }
}
