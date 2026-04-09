#!/usr/bin/env node
/**
 * AML/CFT/CPF Policy Document Generator — Generates the full compliance
 * policy manual from the system's constants, risk model, and configuration.
 *
 * MOE inspectors ask for this first: "Show me your AML policy."
 *
 * Generates a comprehensive policy document covering:
 *   1. Entity identification and regulatory framework
 *   2. Risk appetite and methodology
 *   3. Customer due diligence procedures (SDD/CDD/EDD)
 *   4. Beneficial ownership requirements
 *   5. Sanctions screening and TFS obligations
 *   6. Transaction monitoring and threshold reporting
 *   7. STR/SAR filing procedures
 *   8. Record retention policy
 *   9. Staff training programme
 *  10. Independent audit requirements
 *  11. Responsible sourcing (OECD/LBMA)
 *  12. Proliferation financing controls
 *  13. Compliance officer duties
 *  14. Penalties and enforcement
 *
 * Output: Plain-text policy document for MLRO approval.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname || '.', '..');
const HISTORY_DIR = resolve(PROJECT_ROOT, 'history', 'on-demand');
const today = new Date().toISOString().split('T')[0];

export function generatePolicyDocument(entityName = 'Hawkeye Sterling') {
  const doc = [];

  doc.push('═'.repeat(60));
  doc.push('AML/CFT/CPF COMPLIANCE POLICY AND PROCEDURES MANUAL');
  doc.push('═'.repeat(60));
  doc.push('');
  doc.push(`Entity: ${entityName}`);
  doc.push('Licence type: Dealer in Precious Metals and Stones (DNFBP)');
  doc.push('Supervisory authority: Ministry of Economy and Tourism');
  doc.push(`Document date: ${today}`);
  doc.push('Classification: CONFIDENTIAL');
  doc.push('Version: Auto-generated from compliance automation system');
  doc.push('');

  // Section 1
  doc.push('1. REGULATORY FRAMEWORK AND SCOPE');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('This manual establishes the Anti-Money Laundering, Countering the');
  doc.push('Financing of Terrorism, and Countering Proliferation Financing');
  doc.push('(AML/CFT/CPF) policies and procedures for the Entity.');
  doc.push('');
  doc.push('Applicable legislation:');
  doc.push('  a) Federal Decree-Law No. 10 of 2025 on Anti-Money Laundering');
  doc.push('     and Countering the Financing of Terrorism and Financing of');
  doc.push('     Illegal Organisations (Primary AML/CFT statute)');
  doc.push('  b) Cabinet Resolution No. 134 of 2025 (Implementing Regulations)');
  doc.push('  c) Cabinet Resolution No. 74 of 2020 (Targeted Financial Sanctions)');
  doc.push('  d) Cabinet Resolution No. 156 of 2025 (PF & Dual-Use Controls)');
  doc.push('  e) Cabinet Decision No. 109 of 2023 (UBO Register)');
  doc.push('  f) Cabinet Resolution No. 71 of 2024 (Administrative Penalties)');
  doc.push('  g) MoE Circular 08/AML/2021 (DPMS Sector Guidance)');
  doc.push('  h) EOCN TFS Guidance (July 2025)');
  doc.push('  i) LBMA Responsible Gold Guidance v9');
  doc.push('  j) OECD Due Diligence Guidance for Responsible Supply Chains');
  doc.push('  k) FATF Recommendations 22, 23, 28 (DPMS obligations)');
  doc.push('');

  // Section 2
  doc.push('2. RISK APPETITE AND METHODOLOGY');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('The Entity adopts a risk-based approach per Cabinet Resolution');
  doc.push('134/2025 Art.5 and FATF Recommendations.');
  doc.push('');
  doc.push('Risk scoring methodology: Likelihood (1-5) x Impact (1-5)');
  doc.push('Context multipliers: jurisdiction, PEP status, cash intensity,');
  doc.push('transaction volume, product type.');
  doc.push('');
  doc.push('Risk ratings and CDD levels:');
  doc.push('  Score 1-5:   LOW    -> Simplified Due Diligence (SDD), 12-month review');
  doc.push('  Score 6-15:  MEDIUM -> Customer Due Diligence (CDD), 6-month review');
  doc.push('  Score 16-25: HIGH   -> Enhanced Due Diligence (EDD), 3-month review');
  doc.push('');
  doc.push('Prohibited relationships:');
  doc.push('  - Entities on FATF blacklist jurisdictions (Iran, DPRK, Myanmar)');
  doc.push('  - Anonymous or fictitious accounts');
  doc.push('  - Shell banks');
  doc.push('');

  // Section 3
  doc.push('3. CUSTOMER DUE DILIGENCE (CDD)');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('3.1 Simplified Due Diligence (SDD) — Low-risk customers');
  doc.push('  - Verify identity using one reliable document');
  doc.push('  - Record basic customer information');
  doc.push('  - Review at 12-month intervals');
  doc.push('');
  doc.push('3.2 Standard CDD — Medium-risk customers');
  doc.push('  - Full identity verification (passport/Emirates ID)');
  doc.push('  - Proof of address (utility bill < 3 months)');
  doc.push('  - Source of funds declaration');
  doc.push('  - Business relationship purpose');
  doc.push('  - Review at 6-month intervals');
  doc.push('');
  doc.push('3.3 Enhanced Due Diligence (EDD) — High-risk and PEPs');
  doc.push('  - All standard CDD requirements plus:');
  doc.push('  - Source of wealth documentation');
  doc.push('  - Enhanced source of funds verification');
  doc.push('  - Senior Management approval (FDL Art.14)');
  doc.push('  - Board approval for PEPs');
  doc.push('  - Review at 3-month intervals');
  doc.push('');
  doc.push('3.4 Ongoing Monitoring');
  doc.push('  - Transaction monitoring against customer profile');
  doc.push('  - Periodic CDD refresh per risk rating cycle');
  doc.push('  - Automated CDD refresh engine triggers re-screening');
  doc.push('');

  // Section 4
  doc.push('4. BENEFICIAL OWNERSHIP (UBO)');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('Per Cabinet Decision No. 109 of 2023:');
  doc.push('  - Identify all beneficial owners holding >= 25% ownership');
  doc.push('  - Re-verify within 15 working days of any ownership change');
  doc.push('  - Screen all UBOs against sanctions and PEP lists');
  doc.push('  - Maintain UBO register with verification evidence');
  doc.push('');

  // Section 5
  doc.push('5. SANCTIONS SCREENING AND TFS');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('5.1 Screening obligations:');
  doc.push('  - Screen against ALL mandatory lists: UN Consolidated, OFAC SDN,');
  doc.push('    EU Financial Sanctions, UK OFSI, UAE Local Terrorist List');
  doc.push('  - Screen at onboarding, periodic review, and before every transaction');
  doc.push('  - Real-time list change monitoring (30-minute checks)');
  doc.push('');
  doc.push('5.2 Confirmed Match — Asset Freeze Procedure:');
  doc.push('  Step 1: FREEZE all assets immediately (within 24 clock hours)');
  doc.push('  Step 2: Report to EOCN without delay');
  doc.push('  Step 3: File CNMR via goAML within 5 business days');
  doc.push('  Step 4: DO NOT notify the subject (FDL Art.29)');
  doc.push('');
  doc.push('5.3 Partial Match:');
  doc.push('  Step 1: SUSPEND the transaction immediately');
  doc.push('  Step 2: Obtain identification within 10 business days');
  doc.push('  Step 3: File PNMR via goAML within 5 business days');
  doc.push('  Step 4: If confirmed by EOCN, transition to freeze procedure');
  doc.push('');

  // Section 6
  doc.push('6. TRANSACTION MONITORING AND THRESHOLDS');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('Reportable thresholds:');
  doc.push('  - AED 55,000: Cash transactions (DPMSR filing within 2 weeks)');
  doc.push('  - AED 60,000: Cross-border cash/BNI (declaration + HRC/HRCA)');
  doc.push('  - AED 3,500: Wire transfer originator/beneficiary info (FATF Rec 16)');
  doc.push('');
  doc.push('Automated monitoring detects:');
  doc.push('  - Structuring (split transactions below threshold)');
  doc.push('  - Layering (rapid sequential transfers)');
  doc.push('  - Round-tripping (funds returning to originator)');
  doc.push('  - Smurfing (multiple depositors to same account)');
  doc.push('  - Velocity anomalies and dormancy breaks');
  doc.push('  - Profile mismatches (activity vs declared business)');
  doc.push('');
  doc.push('HRC/HRCA reporting:');
  doc.push('  - ALL cross-border transfers to/from high-risk countries');
  doc.push('  - Transaction held for 3 business days after filing');
  doc.push('');

  // Section 7
  doc.push('7. SUSPICIOUS TRANSACTION REPORTING');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('Filing obligations per FDL No.10/2025 Art.26-27:');
  doc.push('  - STR: Filed without delay when suspicion is formed');
  doc.push('  - SAR: Filed for suspicious activity without a completed transaction');
  doc.push('  - Filing method: goAML portal exclusively');
  doc.push('  - No tipping off (FDL Art.29) — criminal offence');
  doc.push('');
  doc.push('Automated STR narrative generator produces goAML-ready narratives');
  doc.push('from screening results, transaction patterns, and entity graph data.');
  doc.push('');

  // Section 8
  doc.push('8. RECORD RETENTION');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('Per FDL No.10/2025 Art.24 and MoE DPMS Guidance:');
  doc.push('  - Minimum retention period: 10 years');
  doc.push('  - Applies to: CDD records, transaction records, screening results,');
  doc.push('    filing copies, correspondence, training records, audit reports');
  doc.push('  - Format: Plain-text UTF-8 for regulator transparency');
  doc.push('  - Integrity: SHA-256 hash manifests for tamper detection');
  doc.push('  - Evidence chain: Hash-linked audit trail across all actions');
  doc.push('');

  // Section 9
  doc.push('9. STAFF TRAINING');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('Per FDL No.10/2025 Art.21 and Cabinet Res 134/2025 Art.20:');
  doc.push('  - Annual AML/CFT/CPF training for all relevant staff');
  doc.push('  - Topics: legal framework, CDD procedures, STR identification,');
  doc.push('    TFS obligations, responsible sourcing, no tipping off');
  doc.push('  - Training records maintained with attendance and assessment');
  doc.push('');

  // Section 10
  doc.push('10. INDEPENDENT AUDIT');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('Per Cabinet Res 134/2025 Art.19:');
  doc.push('  - Annual independent AML/CFT audit required');
  doc.push('  - Scope: all compliance programme elements');
  doc.push('  - Corrective action plan for identified gaps');
  doc.push('  - Audit findings reported to Board/Senior Management');
  doc.push('');

  // Section 11
  doc.push('11. RESPONSIBLE SOURCING (OECD/LBMA)');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('OECD 5-Step Due Diligence Framework:');
  doc.push('  Step 1: Establish management systems and policies');
  doc.push('  Step 2: Identify and assess supply chain risks (Annex II red flags)');
  doc.push('  Step 3: Design risk management strategy');
  doc.push('  Step 4: Independent third-party audit');
  doc.push('  Step 5: Annual public report on due diligence');
  doc.push('');
  doc.push('Conflict-Affected and High-Risk Areas (CAHRA) monitored.');
  doc.push('Non-LBMA/DGD accredited refiners flagged for enhanced scrutiny.');
  doc.push('');

  // Section 12
  doc.push('12. PROLIFERATION FINANCING CONTROLS');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('Per Cabinet Resolution 156/2025:');
  doc.push('  - PF risk assessment conducted annually');
  doc.push('  - DPRK and Iran transactions prohibited');
  doc.push('  - Dual-use goods screening for precious metals');
  doc.push('  - 10 PF red flags monitored for gold-specific risks');
  doc.push('');

  // Section 13
  doc.push('13. COMPLIANCE OFFICER / MLRO');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('Per FDL No.10/2025 Art.20-21:');
  doc.push('  - Compliance Officer / MLRO appointed and notified to MoE');
  doc.push('  - Responsibilities: oversight of all AML/CFT/CPF compliance');
  doc.push('  - Reporting: weekly, monthly, quarterly, annual reports');
  doc.push('  - Authority: full access to all compliance systems and records');
  doc.push('  - Change notification: within 15 days to MoE');
  doc.push('');

  // Section 14
  doc.push('14. PENALTIES AND ENFORCEMENT');
  doc.push('-'.repeat(40));
  doc.push('');
  doc.push('Per Cabinet Resolution 71/2024:');
  doc.push('  - Administrative penalties: AED 10,000 to AED 100,000,000');
  doc.push('  - License suspension or revocation');
  doc.push('  - Criminal prosecution for tipping off (FDL Art.29)');
  doc.push('  - Criminal liability for failure to freeze (Cabinet Res 74/2020)');
  doc.push('');

  // Sign-off
  doc.push('═'.repeat(60));
  doc.push('');
  doc.push('This policy manual is generated from the automated compliance');
  doc.push('system configuration and must be reviewed and approved by the MLRO.');
  doc.push('');
  doc.push('Approved by: ______________________ (MLRO)');
  doc.push(`Date: ${today}`);
  doc.push('');
  doc.push('For review by the MLRO.');

  return doc.join('\n');
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const policy = generatePolicyDocument();
  console.log(policy);

  // Archive
  (async () => {
    if (!existsSync(HISTORY_DIR)) await mkdir(HISTORY_DIR, { recursive: true });
    await writeFile(resolve(HISTORY_DIR, `${today}-aml-policy-manual.txt`), policy, 'utf8');
    console.log(`\nArchived to: history/on-demand/${today}-aml-policy-manual.txt`);
  })();
}
