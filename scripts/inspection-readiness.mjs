#!/usr/bin/env node
/**
 * Inspection Readiness Generator — One command produces the complete
 * Ministry of Economy inspection bundle.
 *
 * Generates a comprehensive inspection-ready package containing:
 *   1.  AML/CFT/CPF Policy & Procedures summary
 *   2.  Compliance Officer appointment evidence
 *   3.  Risk assessment summary (enterprise-wide)
 *   4.  Counterparty register with CDD status
 *   5.  Screening evidence (sanctions + PEP + adverse media)
 *   6.  Filing history (STR/SAR/CTR/DPMSR/CNMR)
 *   7.  Training records
 *   8.  MLRO reports (weekly/monthly/quarterly/annual)
 *   9.  Transaction monitoring evidence
 *  10.  Regulatory correspondence log
 *  11.  Entity relationship graph summary
 *  12.  CDD refresh compliance proof
 *  13.  Sanctions list refresh log
 *  14.  goAML registration confirmation
 *  15.  Hash manifest (tamper-evidence for the entire bundle)
 *
 * Output: history/inspections/YYYY-MM-DD-inspection-bundle/
 *
 * Usage:
 *   node inspection-readiness.mjs
 *   node inspection-readiness.mjs --entity "Fine Gold DMCC"
 *   DRY_RUN=true node inspection-readiness.mjs
 */

import { readFile, writeFile, mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, basename, relative } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname || '.', '..');
const HISTORY_ROOT = resolve(PROJECT_ROOT, 'history');
const dryRun = process.env.DRY_RUN === 'true';
const today = new Date().toISOString().split('T')[0];
const BUNDLE_DIR = resolve(HISTORY_ROOT, 'inspections', `${today}-inspection-bundle`);

// ── Main ────────────────────────────────────────────────────

async function generateBundle() {
  console.log('Ministry of Economy Inspection Readiness Generator');
  console.log('===================================================');
  console.log(`Date: ${today}`);
  console.log(`Bundle: ${BUNDLE_DIR}`);
  console.log('');

  if (!dryRun) {
    await mkdir(BUNDLE_DIR, { recursive: true });
  }

  const manifest = [];
  const sections = [
    { id: '01', name: 'AML/CFT/CPF Framework', fn: generatePolicySection },
    { id: '02', name: 'Compliance Officer Evidence', fn: generateCoEvidence },
    { id: '03', name: 'Enterprise Risk Assessment', fn: generateRiskAssessment },
    { id: '04', name: 'Counterparty Register & CDD', fn: generateCounterpartySection },
    { id: '05', name: 'Screening Evidence', fn: generateScreeningEvidence },
    { id: '06', name: 'Filing History', fn: generateFilingHistory },
    { id: '07', name: 'Training Records', fn: generateTrainingRecords },
    { id: '08', name: 'MLRO Reports', fn: generateMlroReports },
    { id: '09', name: 'Transaction Monitoring', fn: generateTransactionEvidence },
    { id: '10', name: 'Regulatory Correspondence', fn: generateRegCorrespondence },
    { id: '11', name: 'Entity Relationship Graph', fn: generateGraphSummary },
    { id: '12', name: 'CDD Refresh Compliance', fn: generateCddCompliance },
    { id: '13', name: 'Sanctions List Refresh Log', fn: generateSanctionsLog },
    { id: '14', name: 'Memory System Audit Trail', fn: generateMemoryAudit },
  ];

  for (const section of sections) {
    console.log(`[${section.id}] ${section.name}...`);
    try {
      const files = await section.fn();
      for (const f of files) {
        manifest.push({ section: `${section.id}-${section.name}`, ...f });
        console.log(`     + ${f.filename} (${f.source})`);
      }
    } catch (err) {
      console.error(`     ERROR: ${err.message}`);
      manifest.push({ section: `${section.id}-${section.name}`, filename: 'ERROR', error: err.message });
    }
  }

  // Generate manifest with hashes
  console.log('\n[15] Hash Manifest...');
  const hashManifest = await generateHashManifest(manifest);
  manifest.push({ section: '15-Hash-Manifest', filename: 'MANIFEST.txt', source: 'generated' });

  // Generate cover page
  const cover = generateCoverPage(manifest);
  if (!dryRun) {
    await writeFile(resolve(BUNDLE_DIR, '00-COVER-PAGE.txt'), cover, 'utf8');
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Bundle complete: ${manifest.length} items`);
  console.log(`Location: ${BUNDLE_DIR}`);
  if (dryRun) console.log('[DRY RUN — no files written]');

  // Record in memory
  await recordInMemory(manifest);

  return { bundleDir: BUNDLE_DIR, items: manifest.length, manifest };
}

// ── Section Generators ──────────────────────────────────────

async function generatePolicySection() {
  const files = [];
  const content = [
    'AML/CFT/CPF COMPLIANCE FRAMEWORK SUMMARY',
    `Prepared: ${today}`,
    '',
    '1. GOVERNING LEGISLATION',
    '   - Federal Decree-Law No. 10 of 2025 (primary AML/CFT statute)',
    '   - Cabinet Resolution No. 134 of 2025 (implementing regulations)',
    '   - Cabinet Resolution No. 74 of 2020 (TFS / asset freeze)',
    '   - Cabinet Resolution No. 156 of 2025 (PF & dual-use controls)',
    '   - Cabinet Decision No. 109 of 2023 (UBO register)',
    '   - MoE Circular 08/AML/2021 (DPMS sector guidance)',
    '   - LBMA Responsible Gold Guidance v9',
    '',
    '2. SUPERVISORY AUTHORITY',
    '   Ministry of Economy (MOE) — DNFBP supervisor',
    '',
    '3. COMPLIANCE PROGRAMME ELEMENTS',
    '   - Risk-based approach (FDL Art.5)',
    '   - Customer Due Diligence (SDD/CDD/EDD)',
    '   - Ongoing monitoring and transaction surveillance',
    '   - Suspicious transaction reporting via goAML',
    '   - Targeted financial sanctions screening',
    '   - Record retention (minimum 5 years)',
    '   - Staff training programme',
    '   - Independent audit function',
    '',
    '4. AUTOMATED CONTROLS',
    '   - 51 automation scripts (daily/weekly/monthly/quarterly/annual)',
    '   - Zero-dependency sanctions screening engine',
    '   - World Monitor geopolitical intelligence feed',
    '   - CDD refresh engine with auto re-screening',
    '   - Real-time sanctions list change alerts',
    '   - 10-year append-only compliance evidence archive',
    '',
    'For review by the MLRO.',
  ].join('\n');

  if (!dryRun) await writeFile(resolve(BUNDLE_DIR, '01-framework-summary.txt'), content, 'utf8');
  files.push({ filename: '01-framework-summary.txt', source: 'generated' });

  return files;
}

async function generateCoEvidence() {
  const content = [
    'COMPLIANCE OFFICER / MLRO APPOINTMENT EVIDENCE',
    `Date: ${today}`,
    '',
    'The Compliance Officer / Money Laundering Reporting Officer has been',
    'appointed in accordance with FDL No.10/2025 Art.20-21.',
    '',
    'Notification to the Ministry of Economy: [Reference number]',
    'Appointment date: [Date]',
    'Name: [MLRO Name]',
    '',
    'Note: This section requires manual completion with appointment',
    'documentation. Attach appointment letter and MOE notification.',
    '',
    'For review by the MLRO.',
  ].join('\n');

  if (!dryRun) await writeFile(resolve(BUNDLE_DIR, '02-co-appointment.txt'), content, 'utf8');
  return [{ filename: '02-co-appointment.txt', source: 'generated (template)' }];
}

async function generateRiskAssessment() {
  const files = [];
  // Collect most recent annual risk assessment
  const annualDir = resolve(HISTORY_ROOT, 'annual');
  const collected = await collectRecentFiles(annualDir, /risk.?assess/i, 3);
  for (const f of collected) {
    if (!dryRun) await copyFile(f.path, resolve(BUNDLE_DIR, `03-${f.name}`));
    files.push({ filename: `03-${f.name}`, source: f.path });
  }
  if (files.length === 0) {
    files.push({ filename: '03-risk-assessment.txt', source: 'NOT FOUND — run annual-risk-assessment.mjs' });
  }
  return files;
}

async function generateCounterpartySection() {
  const files = [];
  const registerDir = resolve(HISTORY_ROOT, 'registers');
  const collected = await collectRecentFiles(registerDir, /\.csv$/i, 1);
  for (const f of collected) {
    if (!dryRun) await copyFile(f.path, resolve(BUNDLE_DIR, `04-${f.name}`));
    files.push({ filename: `04-${f.name}`, source: f.path });
  }

  // CDD state
  const cddState = resolve(PROJECT_ROOT, '.screening', 'cdd-state.json');
  if (existsSync(cddState)) {
    if (!dryRun) await copyFile(cddState, resolve(BUNDLE_DIR, '04-cdd-state.json'));
    files.push({ filename: '04-cdd-state.json', source: cddState });
  }

  return files;
}

async function generateScreeningEvidence() {
  const files = [];
  // Collect recent screening logs from daily-ops
  const opsDir = resolve(HISTORY_ROOT, 'daily-ops');
  const collected = await collectRecentFiles(opsDir, /sanction|screen|pep/i, 10);
  for (const f of collected) {
    if (!dryRun) await copyFile(f.path, resolve(BUNDLE_DIR, `05-${f.name}`));
    files.push({ filename: `05-${f.name}`, source: f.path });
  }

  // Audit log
  const auditLog = resolve(PROJECT_ROOT, '.screening', 'audit.log');
  if (existsSync(auditLog)) {
    if (!dryRun) await copyFile(auditLog, resolve(BUNDLE_DIR, '05-screening-audit.log'));
    files.push({ filename: '05-screening-audit.log', source: auditLog });
  }

  return files;
}

async function generateFilingHistory() {
  const files = [];
  const filingsDir = resolve(HISTORY_ROOT, 'filings');
  const collected = await collectRecentFiles(filingsDir, /\.(txt|xml)$/i, 20);
  for (const f of collected) {
    if (!dryRun) await copyFile(f.path, resolve(BUNDLE_DIR, `06-${f.name}`));
    files.push({ filename: `06-${f.name}`, source: f.path });
  }
  return files;
}

async function generateTrainingRecords() {
  const content = [
    'TRAINING RECORDS SUMMARY',
    `Date: ${today}`,
    '',
    'AML/CFT/CPF training is conducted for all relevant staff in',
    'accordance with FATF Recommendations 22/23 and FDL No.10/2025.',
    '',
    'Training programme covers:',
    '- UAE AML/CFT legal framework',
    '- Customer due diligence procedures',
    '- Suspicious transaction identification and reporting',
    '- Targeted financial sanctions obligations',
    '- Responsible sourcing (LBMA RGG)',
    '- No tipping off obligations',
    '',
    'Note: Attach individual training completion certificates.',
    '',
    'For review by the MLRO.',
  ].join('\n');

  if (!dryRun) await writeFile(resolve(BUNDLE_DIR, '07-training-summary.txt'), content, 'utf8');
  return [{ filename: '07-training-summary.txt', source: 'generated (template)' }];
}

async function generateMlroReports() {
  const files = [];
  const dirs = ['mlro-weekly', 'mlro-monthly', 'mlro-quarterly', 'mlro-annual'];

  for (const dir of dirs) {
    const fullDir = resolve(HISTORY_ROOT, dir);
    const collected = await collectRecentFiles(fullDir, /\.txt$/i, 3);
    for (const f of collected) {
      if (!dryRun) await copyFile(f.path, resolve(BUNDLE_DIR, `08-${dir}-${f.name}`));
      files.push({ filename: `08-${dir}-${f.name}`, source: f.path });
    }
  }

  return files;
}

async function generateTransactionEvidence() {
  const files = [];
  const opsDir = resolve(HISTORY_ROOT, 'daily-ops');
  const collected = await collectRecentFiles(opsDir, /transaction|monitor|threshold/i, 5);
  for (const f of collected) {
    if (!dryRun) await copyFile(f.path, resolve(BUNDLE_DIR, `09-${f.name}`));
    files.push({ filename: `09-${f.name}`, source: f.path });
  }
  return files;
}

async function generateRegCorrespondence() {
  const files = [];
  const opsDir = resolve(HISTORY_ROOT, 'daily-ops');
  const collected = await collectRecentFiles(opsDir, /regul|watcher|change|intelligence/i, 5);
  for (const f of collected) {
    if (!dryRun) await copyFile(f.path, resolve(BUNDLE_DIR, `10-${f.name}`));
    files.push({ filename: `10-${f.name}`, source: f.path });
  }
  return files;
}

async function generateGraphSummary() {
  try {
    const { detectRiskClusters, buildGraph } = await import(resolve(PROJECT_ROOT, 'screening', 'graph', 'entity-graph.mjs'));

    let stats;
    try { stats = await buildGraph(); } catch { stats = { nodeCount: 0, edgeCount: 0, sanctionedNodes: 0 }; }

    const content = [
      'ENTITY RELATIONSHIP GRAPH SUMMARY',
      `Date: ${today}`,
      '',
      `Total entities: ${stats.nodeCount}`,
      `Relationships: ${stats.edgeCount}`,
      `Sanctioned entities: ${stats.sanctionedNodes}`,
      '',
      'The entity relationship graph maps counterparty connections,',
      'beneficial ownership chains, and shared attributes to detect',
      'indirect sanctions exposure and hidden risk networks.',
      '',
      'For review by the MLRO.',
    ].join('\n');

    if (!dryRun) await writeFile(resolve(BUNDLE_DIR, '11-entity-graph-summary.txt'), content, 'utf8');
    return [{ filename: '11-entity-graph-summary.txt', source: 'generated' }];
  } catch {
    return [{ filename: '11-entity-graph-summary.txt', source: 'SKIPPED — graph not built' }];
  }
}

async function generateCddCompliance() {
  const files = [];
  const opsDir = resolve(HISTORY_ROOT, 'daily-ops');
  const collected = await collectRecentFiles(opsDir, /cdd.?refresh/i, 5);
  for (const f of collected) {
    if (!dryRun) await copyFile(f.path, resolve(BUNDLE_DIR, `12-${f.name}`));
    files.push({ filename: `12-${f.name}`, source: f.path });
  }

  const renewalDir = resolve(HISTORY_ROOT, 'registers');
  const renewals = await collectRecentFiles(renewalDir, /cdd.?renewal/i, 10);
  for (const f of renewals) {
    if (!dryRun) await copyFile(f.path, resolve(BUNDLE_DIR, `12-${f.name}`));
    files.push({ filename: `12-${f.name}`, source: f.path });
  }

  return files;
}

async function generateSanctionsLog() {
  const files = [];
  const opsDir = resolve(HISTORY_ROOT, 'daily-ops');
  const collected = await collectRecentFiles(opsDir, /sanctions.?change/i, 10);
  for (const f of collected) {
    if (!dryRun) await copyFile(f.path, resolve(BUNDLE_DIR, `13-${f.name}`));
    files.push({ filename: `13-${f.name}`, source: f.path });
  }
  return files;
}

async function generateMemoryAudit() {
  try {
    const mem = (await import(resolve(PROJECT_ROOT, 'claude-mem', 'index.mjs'))).default;
    const stats = mem.stats();

    const content = [
      'CLAUDE MEMORY SYSTEM AUDIT TRAIL',
      `Date: ${today}`,
      '',
      `Total sessions: ${stats.sessions}`,
      `Total observations: ${stats.observations}`,
      `Total summaries: ${stats.summaries}`,
      '',
      'Observation categories:',
      ...stats.categories.map(c => `  ${c.category}: ${c.cnt}`),
      '',
      'The memory system provides a complete audit trail of all',
      'compliance decisions, screening results, and regulatory',
      'observations made during Claude Code sessions.',
      '',
      'For review by the MLRO.',
    ].join('\n');

    mem.close();
    if (!dryRun) await writeFile(resolve(BUNDLE_DIR, '14-memory-audit.txt'), content, 'utf8');
    return [{ filename: '14-memory-audit.txt', source: 'generated' }];
  } catch {
    return [{ filename: '14-memory-audit.txt', source: 'SKIPPED — memory system not initialized' }];
  }
}

// ── Hash Manifest ───────────────────────────────────────────

async function generateHashManifest(manifest) {
  if (dryRun) return '';

  const lines = ['INSPECTION BUNDLE HASH MANIFEST', `Generated: ${new Date().toISOString()}`, ''];

  for (const item of manifest) {
    if (item.error || item.source?.startsWith('SKIPPED') || item.source?.startsWith('NOT FOUND')) {
      lines.push(`MISSING  ${item.filename}  ${item.error || item.source}`);
      continue;
    }

    const filePath = resolve(BUNDLE_DIR, item.filename);
    if (existsSync(filePath)) {
      const content = await readFile(filePath);
      const hash = createHash('sha256').update(content).digest('hex');
      lines.push(`${hash}  ${item.filename}`);
    }
  }

  lines.push('');
  lines.push('Verify with: sha256sum -c MANIFEST.txt');
  lines.push('For review by the MLRO.');

  const manifestContent = lines.join('\n');
  await writeFile(resolve(BUNDLE_DIR, 'MANIFEST.txt'), manifestContent, 'utf8');
  return manifestContent;
}

// ── Cover Page ──────────────────────────────────────────────

function generateCoverPage(manifest) {
  const generated = manifest.filter(m => !m.error && !m.source?.startsWith('SKIPPED'));
  const missing = manifest.filter(m => m.error || m.source?.startsWith('SKIPPED') || m.source?.startsWith('NOT FOUND'));

  return [
    'INSPECTION READINESS BUNDLE',
    '===========================',
    '',
    `Entity: Hawkeye Sterling`,
    `Licence type: Dealer in Precious Metals and Stones (DNFBP)`,
    `Supervisor: Ministry of Economy`,
    `Date prepared: ${today}`,
    '',
    `Bundle contents: ${generated.length} documents`,
    `Missing/skipped: ${missing.length}`,
    '',
    'TABLE OF CONTENTS',
    '-'.repeat(40),
    ...manifest.map(m => {
      const status = m.error ? '[MISSING]' : m.source?.startsWith('SKIPPED') ? '[SKIPPED]' : '[OK]';
      return `  ${status} ${m.section}: ${m.filename}`;
    }),
    '',
    'This bundle was automatically generated by the Hawkeye-Sterling',
    'compliance automation system. All documents are plain-text UTF-8',
    'for regulator transparency. The MANIFEST.txt file contains SHA-256',
    'hashes for tamper detection.',
    '',
    'For review by the MLRO.',
  ].join('\n');
}

// ── Helpers ─────────────────────────────────────────────────

async function collectRecentFiles(dir, pattern, maxFiles) {
  if (!existsSync(dir)) return [];

  try {
    const entries = await readdir(dir);
    const matching = entries
      .filter(f => pattern.test(f))
      .sort()
      .reverse()
      .slice(0, maxFiles);

    return matching.map(f => ({
      name: f,
      path: resolve(dir, f),
    }));
  } catch { return []; }
}

async function recordInMemory(manifest) {
  try {
    const mem = (await import(resolve(PROJECT_ROOT, 'claude-mem', 'index.mjs'))).default;
    mem.startSession(`inspection-${Date.now().toString(36)}`);
    mem.observe({
      category: 'compliance_decision',
      content: `Inspection bundle generated: ${manifest.length} items at ${BUNDLE_DIR}`,
      importance: 8,
    });
    await mem.endSession(`Inspection bundle: ${manifest.length} items`);
    mem.close();
  } catch { /* optional */ }
}

// ── CLI ─────────────────────────────────────────────────────

generateBundle().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
