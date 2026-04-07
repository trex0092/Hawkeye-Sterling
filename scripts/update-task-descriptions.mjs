#!/usr/bin/env node
/**
 * Update Asana Task Descriptions
 *
 * Adds a formal regulatory description to every task in all 6 compliance
 * programme projects. Each description cites the applicable UAE law,
 * supervisory authority, and international standard.
 *
 * Usage:
 *   export ASANA_TOKEN=1/...
 *   node scripts/update-task-descriptions.mjs
 */

const TOKEN = process.env.ASANA_TOKEN;
if (!TOKEN) { console.error("Set ASANA_TOKEN"); process.exit(1); }

const HEADERS = { Authorization: `Bearer ${TOKEN}` };
const BASE = "https://app.asana.com/api/1.0";

const PROJECTS = [
  { gid: "1213908508433868", name: "FG BRANCH" },
  { gid: "1213908827982041", name: "NAPLES LLC" },
  { gid: "1213908611350810", name: "MADISON LLC" },
  { gid: "1213909833048586", name: "FG LLC" },
  { gid: "1213908611400789", name: "GRAMALTIN AS" },
  { gid: "1213908828069020", name: "ZOE FZE" },
];

async function fetchAllTasks(projectGid) {
  const tasks = [];
  let url = `${BASE}/tasks?project=${projectGid}&opt_fields=name,notes&limit=100`;
  while (url) {
    const res = await fetch(url, { headers: HEADERS });
    const json = await res.json();
    if (json.data) tasks.push(...json.data);
    url = json.next_page ? json.next_page.uri : null;
  }
  return tasks;
}

async function updateDescription(gid, notes) {
  const res = await fetch(`${BASE}/tasks/${gid}`, {
    method: "PUT",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { notes } }),
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// REGULATORY DESCRIPTIONS BY TASK CATEGORY
//
// Each description is written in the formal register of a UAE compliance
// officer. No AI language. No em-dashes. No markdown headings.
// Citations limited to confirmed references only.
// ---------------------------------------------------------------------------

const DESCRIPTIONS = {
  // ── Customer Due Diligence ──────────────────────────────────────────────
  "CDD": `This task forms part of the firm's Customer Due Diligence programme maintained under the applicable provisions of Federal Decree-Law No. 10 of 2025. The firm, as a Dealer in Precious Metals and Stones classified as a Designated Non-Financial Business and Profession, is supervised by the Ministry of Economy for AML/CFT purposes.

Customer Due Diligence is required at the opening of every customer relationship, at the point of any occasional transaction above the firm's internal threshold, and at periodic refresh intervals set by the customer's risk rating. Enhanced Due Diligence applies to all Politically Exposed Persons, to all high-risk and critical-risk counterparties, and to counterparties in jurisdictions on the FATF increased monitoring list.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 22 (DNFBPs: customer due diligence); FATF Recommendation 11 (record-keeping).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Targeted Financial Sanctions ────────────────────────────────────────
  "TFS": `This task forms part of the firm's Targeted Financial Sanctions programme maintained under the applicable provisions of Federal Decree-Law No. 10 of 2025. The Executive Office for Control and Non-Proliferation is the UAE implementing authority for targeted financial sanctions, including the UN Security Council Consolidated List and the UAE Local Terrorist List.

The firm screens its counterparty register and active customer population on each business day. Confirmed matches require immediate asset freeze and reporting to the Financial Intelligence Unit through the goAML platform. Medium-confidence matches require a Partial Name Match Report. The MLRO is the sole authority for filing decisions.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 20 (suspicious transaction reporting); FATF Recommendation 6 (targeted financial sanctions).
Supervisory authority: Executive Office for Control and Non-Proliferation.
Reporting channel: Financial Intelligence Unit via goAML.
Retention: 10 years minimum.`,

  // ── FIU Filing and Reporting ────────────────────────────────────────────
  "FIU": `This task forms part of the firm's reporting obligations to the Financial Intelligence Unit through the goAML platform, maintained under the applicable provisions of Federal Decree-Law No. 10 of 2025.

The firm files Suspicious Transaction Reports, Suspicious Activity Reports, Dealers in Precious Metals and Stones Reports, Partial Name Match Reports, and Funds Freeze Reports. Every filing is prepared by the compliance function as a draft and submitted only on the MLRO's personal authority. The automation never submits to goAML directly.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 20 (suspicious transaction reporting).
Supervisory authority: Ministry of Economy.
Reporting channel: Financial Intelligence Unit via goAML.
Retention: 10 years minimum.`,

  // ── FIU Red Flags ──────────────────────────────────────────────────────
  "FIU-RF": `This task tracks a red-flag indicator identified by the Financial Intelligence Unit in its published DPMS typology guidance. The compliance function monitors this indicator across all programme entities as part of the firm's ongoing compliance obligations under Federal Decree-Law No. 10 of 2025.

Red-flag indicators support the firm's transaction monitoring, suspicious activity detection, and filing obligations to the Financial Intelligence Unit through the goAML platform.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 20 (suspicious transaction reporting); FIU DPMS Typology Guidance.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── National Risk Assessment Red Flags ──────────────────────────────────
  "NRA-RF": `This task tracks a red-flag typology derived from the UAE National Risk Assessment. The compliance function monitors this typology across all programme entities to ensure the firm's risk-based approach remains aligned with the national assessment of Money Laundering and Terrorism Financing risk.

The Ministry of Economy reviews the firm's alignment with the National Risk Assessment during supervisory inspections.

Regulatory basis: Federal Decree-Law No. 10 of 2025; UAE National Risk Assessment; FATF Recommendation 22 (DNFBPs: customer due diligence); FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Recycled Gold Red Flags ────────────────────────────────────────────
  "RF-R": `This task tracks a red-flag indicator specific to recycled gold transactions. The compliance function monitors source-of-material evidence, refinery certificates, and counterparty profiles for indicators of money laundering, sanctions evasion, or proceeds of crime through the recycled gold supply chain.

This indicator is part of the firm's enterprise-wide risk assessment and supports its obligations as a Dealer in Precious Metals and Stones under the applicable provisions of Federal Decree-Law No. 10 of 2025.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 22 (DNFBPs: customer due diligence); LBMA Responsible Gold Guidance.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Mined Gold Red Flags ───────────────────────────────────────────────
  "RF-M": `This task tracks a red-flag indicator specific to mined gold supply chains. The compliance function monitors origin documentation, chain-of-custody integrity, refinery due diligence, and conflict-affected and high-risk area indicators.

This indicator supports the firm's responsible sourcing obligations and its enterprise-wide risk assessment under the applicable provisions of Federal Decree-Law No. 10 of 2025.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 22 (DNFBPs: customer due diligence); LBMA Responsible Gold Guidance; OECD Due Diligence Guidance for Responsible Supply Chains.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Responsible Sourcing Red Flags ──────────────────────────────────────
  "RS-RF": `This task tracks a responsible sourcing red-flag indicator aligned with the LBMA Responsible Gold Guidance and the OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from Conflict-Affected and High-Risk Areas.

The compliance function monitors supply chain due diligence, refinery accreditation, and conflict-affected area assessments to ensure the firm meets its sourcing obligations.

Regulatory basis: Federal Decree-Law No. 10 of 2025; OECD Due Diligence Guidance; LBMA Responsible Gold Guidance Steps 1-5; FATF Recommendation 22.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── General Red Flags (RF-01 to RF-15) ─────────────────────────────────
  "RF": `This task maintains a red-flag indicator in the firm's compliance programme. The indicator supports the firm's transaction monitoring, customer due diligence, and suspicious activity detection obligations under the applicable provisions of Federal Decree-Law No. 10 of 2025.

The firm's red-flag library is reviewed annually and updated to reflect changes in the UAE National Risk Assessment, FIU typology guidance, and FATF recommendations.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 20 (suspicious transaction reporting); FATF Recommendation 22 (DNFBPs: customer due diligence).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Transaction Monitoring ─────────────────────────────────────────────
  "TM": `This task forms part of the firm's transaction monitoring programme maintained under the applicable provisions of Federal Decree-Law No. 10 of 2025. The monitoring system applies nine detection rules covering DPMSR triggers, structuring, round amounts, high-risk jurisdictions, all-cash settlement, same-day aggregation, rapid frequency, unusual payment methods, and rolling 30-day aggregation.

Alerts are reviewed by the compliance function and escalated to the MLRO for filing determination. The MLRO is the sole authority for all filings to the Financial Intelligence Unit.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 20 (suspicious transaction reporting); FATF Recommendation 22 (DNFBPs: customer due diligence).
Supervisory authority: Ministry of Economy.
Reporting channel: Financial Intelligence Unit via goAML.
Retention: 10 years minimum.`,

  // ── Record-Keeping ─────────────────────────────────────────────────────
  "RK": `This task forms part of the firm's record-keeping obligations under the applicable provisions of Federal Decree-Law No. 10 of 2025. The firm retains all AML/CFT records for a minimum of 10 years, covering customer due diligence records, transaction records, sanctions screening logs, training records, STR and supporting evidence, and MLRO reports.

All compliance artefacts are archived as plain-text UTF-8 files in the firm's git-backed repository, with hash-chained integrity verification.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 11 (record-keeping).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Anti-Corruption and Ethics ─────────────────────────────────────────
  "ACE": `This task forms part of the firm's anti-corruption and ethics programme. The programme supports the firm's obligations under UAE law and international best practice to prevent bribery, corruption, conflicts of interest, and unethical conduct in the precious metals and stones sector.

Regulatory basis: Federal Decree-Law No. 10 of 2025; UAE Penal Code; FATF Recommendation 22 (DNFBPs: customer due diligence).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Anti-Corruption Execution Plan ─────────────────────────────────────
  "ACEP": `This task forms part of the firm's Anti-Corruption Execution Plan. The plan implements the firm's anti-corruption policy through internal circulars, training modules, compliance calendar, gifts and hospitality register, conflict of interest declarations, and staff acknowledgements.

Regulatory basis: Federal Decree-Law No. 10 of 2025; UAE Penal Code; FATF Recommendation 22.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Policy Management ──────────────────────────────────────────────────
  "POL": `This task forms part of the firm's policy management programme. The compliance function maintains the Compliance Manual, Responsible Sourcing Manual, and supporting procedures. All policies are reviewed at least annually and approved by the Board.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Risk Assessment ────────────────────────────────────────────────────
  "RA": `This task forms part of the firm's risk assessment programme maintained under the applicable provisions of Federal Decree-Law No. 10 of 2025. The enterprise-wide risk assessment covers five pillars: customer risk, product and service risk, geographic risk, delivery channel risk, and internal controls risk.

The methodology is aligned with the FATF risk-based approach and the UAE National Risk Assessment.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 22 (DNFBPs: customer due diligence); FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── LBMA Responsible Gold Guidance ──────────────────────────────────────
  "LBMA": `This task forms part of the firm's compliance with the London Bullion Market Association Responsible Gold Guidance. The guidance requires a five-step framework: management systems, risk identification, supply chain due diligence, independent third-party audit, and annual public reporting.

Regulatory basis: Federal Decree-Law No. 10 of 2025; LBMA Responsible Gold Guidance Steps 1-5; OECD Due Diligence Guidance for Responsible Supply Chains.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Management Approvals ───────────────────────────────────────────────
  "MA": `This task requires Senior Management or Board approval. The governing body of the firm is responsible for approving AML/CFT policies, risk assessments, high-risk relationship onboardings, filing decisions, new products, and compliance resource allocation.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── AI Governance ──────────────────────────────────────────────────────
  "AIG": `This task forms part of the firm's AI governance framework. The framework ensures that AI and machine learning tools used in the compliance function are subject to risk assessment, human oversight, algorithmic bias monitoring, model validation, data privacy controls, and vendor due diligence.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Human Resources and Training ───────────────────────────────────────
  "HR": `This task forms part of the firm's human resources and training programme for AML/CFT compliance. The programme covers pre-employment screening, training needs assessment, MLRO qualifications, whistleblower protection, staff attestation, succession planning, disciplinary framework, and compliance culture assessment.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 22 (DNFBPs: customer due diligence); FATF Recommendation 23 (DNFBPs: other measures).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Training Modules ───────────────────────────────────────────────────
  "TRN": `This task delivers a training module in the firm's AML/CFT training programme. The programme is designed in alignment with the FATF Recommendations and covers all staff whose functions expose them to Money Laundering or Terrorism Financing risk.

Training completion records are retained for a minimum of 10 years under the applicable provisions of Federal Decree-Law No. 10 of 2025.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 22 (DNFBPs: customer due diligence); FATF Recommendation 23 (DNFBPs: other measures).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Regulatory Gap Remediation ─────────────────────────────────────────
  "GAP": `This task addresses a gap identified in the firm's compliance gap assessment. The three-phase remediation roadmap targets full compliance by December 2026. Each gap is tracked through identification, remediation, and verification.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── MOE Regulatory Tasks ───────────────────────────────────────────────
  "MOE": `This task addresses a regulatory obligation to the Ministry of Economy as the supervisory authority for Designated Non-Financial Businesses and Professions in the UAE. The Ministry of Economy conducts inspections, reviews compliance documentation, and may impose administrative penalties for non-compliance.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Regulatory Compliance (REG series) ─────────────────────────────────
  "REG": `This task addresses a regulatory compliance item identified through the firm's regulatory change monitoring process. These items require updates to policies, procedures, or operational controls to maintain compliance with the current UAE AML/CFT framework.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Reporting channel: Financial Intelligence Unit via goAML (where applicable).
Retention: 10 years minimum.`,

  // ── Operational Ethics and Compliance (OEC) ────────────────────────────
  "OEC": `This task forms part of the firm's operational ethics and compliance programme. The programme covers compliance charter, risk assessment, sanctions clauses, screening automation, training, board reporting, investigation protocols, and compliance culture initiatives.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Operational Controls (OPS) ─────────────────────────────────────────
  "OPS": `This task maintains an operational compliance control in the firm's AML/CFT programme. Operational controls cover daily screening, cash transaction reporting, transaction monitoring, customer risk scoring, supply chain traceability, adverse media screening, counterparty due diligence, and regulatory examination readiness.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 22 (DNFBPs: customer due diligence); FATF Recommendation 20 (suspicious transaction reporting).
Supervisory authority: Ministry of Economy.
Reporting channel: Financial Intelligence Unit via goAML (where applicable).
Retention: 10 years minimum.`,

  // ── Quality Assurance ──────────────────────────────────────────────────
  "QA": `This task forms part of the firm's quality assurance programme for AML/CFT compliance. The programme covers first-line CDD file reviews, STR filing quality, transaction monitoring rule tuning, sanctions screening accuracy, and thematic compliance reviews.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Group-Level Controls ───────────────────────────────────────────────
  "GRP": `This task forms part of the firm's group-level AML/CFT coordination framework. Group controls cover consolidated risk monitoring, intra-group information sharing, document version control, and training standardisation across all programme entities.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28 (regulation and supervision of DNFBPs).
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── CBUAE Banking Compliance ────────────────────────────────────────────
  "CBUAE": `This task addresses the firm's compliance obligations related to the Central Bank of the UAE. While the Ministry of Economy is the firm's primary supervisor as a DNFBP, banking relationships, payment channels, and foreign currency controls require alignment with CBUAE guidance.

Regulatory basis: Federal Decree-Law No. 10 of 2025; CBUAE Regulations; FATF Recommendation 22.
Supervisory authority: Ministry of Economy (primary); CBUAE (banking relationship).
Retention: 10 years minimum.`,

  // ── Gap Assessment Coloured Tasks (C, H, M, R) ─────────────────────────
  "C": `This task is classified as CRITICAL in the firm's compliance gap assessment. It requires immediate remediation to meet the firm's obligations under Federal Decree-Law No. 10 of 2025. The Ministry of Economy may review the status of critical gaps during supervisory inspections.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  "H": `This task is classified as HIGH priority in the firm's compliance gap assessment. It requires remediation within the current compliance programme cycle to maintain the firm's compliance posture under Federal Decree-Law No. 10 of 2025.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  "M": `This task is classified as MEDIUM priority in the firm's compliance gap assessment. It supports the firm's ongoing improvement of its AML/CFT programme under Federal Decree-Law No. 10 of 2025.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  "R": `This task is classified as ROUTINE in the firm's compliance programme. It supports recurring regulatory obligations and periodic reporting requirements under Federal Decree-Law No. 10 of 2025.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendation 28.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,

  // ── Milestones ─────────────────────────────────────────────────────────
  "MILESTONE": `This task marks a compliance programme milestone. Milestones track the firm's progress through its three-phase remediation roadmap toward full compliance with the applicable provisions of Federal Decree-Law No. 10 of 2025.

Supervisory authority: Ministry of Economy.`,

  // ── Default (for tasks that don't match any category) ──────────────────
  "DEFAULT": `This task forms part of the firm's AML/CFT compliance programme maintained under the applicable provisions of Federal Decree-Law No. 10 of 2025. The firm is a UAE-licensed Dealer in Precious Metals and Stones, classified as a Designated Non-Financial Business and Profession, supervised by the Ministry of Economy.

Regulatory basis: Federal Decree-Law No. 10 of 2025; FATF Recommendations.
Supervisory authority: Ministry of Economy.
Retention: 10 years minimum.`,
};

/**
 * Match a task name to its description category.
 */
function getCategory(name) {
  // Strip emoji and priority tags
  let stripped = name.replace(/^[^\w[(-]*/u, "").trim();
  stripped = stripped.replace(/^\[(Critical|High|Medium)\]\s*/i, "").trim();

  // Try exact prefix matches (longest first to avoid false matches)
  const prefixes = [
    "NRA-RF", "FIU-RF", "RS-RF", "RF-R", "RF-M",
    "ACEP", "ACE", "AIG", "CDD", "FIU", "TFS", "TRN",
    "LBMA", "CBUAE", "GRP", "OEC", "OPS", "MOE", "REG",
    "POL", "GAP", "MA", "HR", "RA", "RK", "QA", "TM", "RF",
  ];

  for (const prefix of prefixes) {
    if (stripped.startsWith(prefix + "-") || stripped.startsWith(prefix + " ")) {
      return prefix;
    }
  }

  // Single-letter codes (C-01, H-01, M-01, R-01)
  const singleMatch = stripped.match(/^([CHMR])-\d+/);
  if (singleMatch) return singleMatch[1];

  // Special cases
  if (name.includes("MILESTONE")) return "MILESTONE";
  if (name.includes("CDD-CRITICAL")) return "CDD";
  if (name.includes("Today's Priorities") || name.includes("📌")) return null; // Skip pinned
  if (name.includes("CO Annual Report")) return "DEFAULT";
  if (name.includes("COMPLIANCE MANUAL")) return "DEFAULT";

  return "DEFAULT";
}

async function main() {
  console.log("=== Updating task descriptions across all projects ===\n");

  for (const proj of PROJECTS) {
    console.log(`\n--- ${proj.name} ---`);
    const tasks = await fetchAllTasks(proj.gid);
    console.log(`  ${tasks.length} tasks`);

    let updated = 0;
    let skipped = 0;
    let alreadySet = 0;

    for (const task of tasks) {
      const category = getCategory(task.name);

      // Skip pinned task
      if (!category) { skipped++; continue; }

      const description = DESCRIPTIONS[category] || DESCRIPTIONS["DEFAULT"];

      // Skip if task already has a description (don't overwrite manual notes)
      if (task.notes && task.notes.trim().length > 50) {
        alreadySet++;
        continue;
      }

      if (await updateDescription(task.gid, description)) {
        updated++;
      }
    }

    console.log(`  Updated: ${updated}, Already had description: ${alreadySet}, Skipped: ${skipped}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
