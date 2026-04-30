"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";

// Policies (SOP vault) — your charter, redlines, risk appetite, sector
// policies. Brain cites these inline on every disposition. Versioned
// locally; operators can edit inline.

function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

interface Policy {
  id: string;
  section: string;
  title: string;
  body: string;
  lastReviewed: string;
}

const STORAGE = "hawkeye.policies.v1";

const DEFAULT_POLICIES: Policy[] = [
  {
    id: "charter",
    section: "Charter",
    title: "MLRO Charter",
    body:
      "The MLRO is independent of commercial lines. Decisions to file / withhold STR are the MLRO's alone; no commercial pressure overrides the MLRO's duty under FDL 10/2025 Art.15. The MLRO reports quarterly to the Board Audit Committee.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "redline-freeze",
    section: "Redlines",
    title: "Hard-stop freeze triggers",
    body:
      "Immediate freeze on: (1) any OFAC SDN / UN Consolidated match ≥ 92%; (2) any transaction where counterparty is a CAHRA-listed jurisdiction AND over-invoicing > 20%; (3) any DPRK / Iran / Syria nexus. No commercial override. Freeze held until the MLRO dispositions.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "risk-appetite",
    section: "Risk Appetite",
    title: "Tier risk appetite",
    body:
      "Zero-tolerance for tier-1 sanctions hits. Low tolerance for tier-1 PEPs (CEO sign-off required). Medium tolerance for domestic PEPs with EDD complete. High tolerance for clear-screening domestic customers with standard CDD.",
    lastReviewed: "2026-03-12",
  },
  {
    id: "dpms-kpis",
    section: "Sector: DPMS",
    title: "DPMS KPI framework",
    body:
      "Monthly KPIs: CDD completion rate ≥ 98%, DPMSR filing < 30 days from trigger, UBO identification rate ≥ 95%, high-risk EDD completion ≤ 14 days, false-positive rate ≤ 1.0%. Board reviews KPIs quarterly.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "pep-policy",
    section: "PEP Policy",
    title: "PEP handling — FATF R.12 alignment",
    body:
      "All PEPs (foreign / domestic / international-org + family + close associates) get EDD. Tier-1 requires CEO + Board Chair approval. Source-of-wealth triangulation against public filings mandatory. Thrice-daily ongoing monitoring enrolment automatic.",
    lastReviewed: "2026-03-20",
  },
  {
    id: "retention",
    section: "Data",
    title: "Record retention",
    body:
      "10-year retention on all CDD records, STR artefacts, case timelines, audit-chain entries, goAML envelopes, and ongoing-monitoring snapshots per FDL 10/2025 Art.24. Encrypted at rest. Access audited.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "customer-acceptance",
    section: "Onboarding",
    title: "Customer Acceptance Policy",
    body:
      "No business relationship is established until: (1) CDD is complete and documented; (2) sanctions screen returns clear or MLRO-approved; (3) source-of-funds narrative is obtained for any cash or equivalent > AED 55,000; (4) beneficial ownership ≥ 25% is identified and verified. Shell companies with no identifiable UBO are declined.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "wire-transfer",
    section: "Onboarding",
    title: "Wire Transfer & Payment Policy",
    body:
      "All outbound wires > AED 3,500 require full originator and beneficiary information per FATF R.16. Third-party payments are prohibited without prior MLRO approval. Payments to jurisdictions on the FATF grey/black list require Board-level sign-off and enhanced due diligence on end-use. Correspondent bank accounts must be pre-approved and listed in the authorised counterparty register.",
    lastReviewed: "2026-03-28",
  },
  {
    id: "str-triage",
    section: "Reporting",
    title: "STR Triage & Filing Policy",
    body:
      "Any red-flag event must be escalated to the MLRO within 24 hours. MLRO has 7 working days to triage and determine whether to file. goAML submission must be completed within 30 calendar days of the trigger event. No tipping-off: staff must not disclose the existence of an STR to the subject or any third party. MLRO may extend the triage window by 7 days with documented rationale.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "aml-training",
    section: "Governance",
    title: "AML/CFT Training Policy",
    body:
      "All staff with AML/CFT responsibilities must complete initial training before onboarding and annual refresher training thereafter. Training covers: FATF recommendations, UAE FDL 10/2025, red-flag typologies, goAML filing, and four-eyes procedures. MLRO maintains a training register. Non-completion blocks system access after a 14-day grace period. Board members receive annual AML awareness briefing.",
    lastReviewed: "2026-03-15",
  },
  {
    id: "sanctions-screening",
    section: "Screening",
    title: "Sanctions Screening Policy",
    body:
      "All customers, UBOs, and counterparties are screened at onboarding and on every list refresh (minimum 3× daily). Threshold for a positive match: ≥ 85% fuzzy score against OFAC SDN, UN Consolidated, EU Consolidated, UK HMT, or EOCN. Any match ≥ 85% triggers an automatic freeze and MLRO notification. The false-positive rate target is ≤ 1.0%; breaches are reported to the Board.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "nested-structures",
    section: "Onboarding",
    title: "Nested Structures & Shell Company Policy",
    body:
      "No customer relationship with a legal entity whose UBO cannot be identified through a maximum of two levels of corporate ownership. Any structure with a nominee director or nominee shareholder requires independent verification of the beneficial owner's identity and source of wealth. Bearer shares are not accepted. Regulated financial intermediaries (banks, funds) operating under equivalent AML regimes may be accepted at CO level without piercing to UBO.",
    lastReviewed: "2026-03-22",
  },
  {
    id: "cash-policy",
    section: "Screening",
    title: "Cash & High-Value Dealer Policy",
    body:
      "Cash transactions ≥ AED 55,000 (or equivalent) must be reported to the MLRO within one business day. Structuring (splitting transactions to avoid thresholds) is a red flag and triggers immediate escalation. DPMS transactions in precious metals or gemstones above AED 55,000 require full CDD regardless of payment method. No anonymous cash accepted. All cash receipts recorded in the DPMSR register within 24 hours.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "virtual-assets",
    section: "Sector: VASP",
    title: "Crypto & Virtual Asset Policy",
    body:
      "Virtual asset transactions require on-chain address screening against Chainalysis / Elliptic blacklists before settlement. No interaction with unhosted wallets > AED 3,500 without verified KYC. DeFi protocols on the FATF grey-list require MLRO pre-approval. Travel Rule compliance mandatory for all transfers > USD 1,000 equivalent. VASP counterparties must be VARA-licensed or operating under equivalent regulation.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "ongoing-monitoring",
    section: "Governance",
    title: "Ongoing Monitoring Policy",
    body:
      "All active customers are subject to continuous transaction monitoring. Tier-1 (PEP / high-risk) customers: daily name-screen refresh, all transactions reviewed. Tier-2 (medium-risk): weekly screen refresh, transaction monitoring via automated rules. Tier-3 (low-risk): monthly screen refresh, statistical anomaly detection only. Any change in customer profile triggers a full re-KYC within 30 days.",
    lastReviewed: "2026-03-31",
  },
  {
    id: "whistleblowing",
    section: "Governance",
    title: "Escalation & Whistleblowing Policy",
    body:
      "Any employee who becomes aware of actual or suspected money laundering, terrorist financing, or sanctions breaches must report to the MLRO immediately and no later than the next business day. Anonymous reports may be submitted via the confidential whistleblowing channel. No employee shall be subject to retaliation, demotion, or dismissal for a good-faith report. The MLRO maintains a secure escalation register. Failure to report is a disciplinary offence and may constitute a criminal act under FDL 10/2025 Art.25. Board Audit Committee reviews the escalation register annually.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "tfs-policy",
    section: "Screening",
    title: "Targeted Financial Sanctions (TFS) Policy",
    body:
      "All persons and entities are screened against TFS lists before any transaction is processed. Lists covered: OFAC SDN & Blocked Persons, UN Security Council Consolidated, EU Financial Sanctions, UK OFSI, EOCN, and UAE Local Terrorist List. Screening uses fuzzy matching at ≥ 85% confidence. Any potential match triggers an immediate freeze of funds and assets and a no-tipping-off obligation. The MLRO must be notified within 2 hours of a TFS freeze. Unblocking requires written MLRO approval and, where required, regulator no-objection. Records of all TFS freezes and releases are retained for 10 years.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "four-eyes",
    section: "Governance",
    title: "Four-Eyes / Dual-Authorisation Control",
    body:
      "All STR filings, customer offboarding decisions, TFS freeze/release actions, and EDD approvals for tier-1 PEPs require two independent authorisations. The initiating analyst and approving MLRO must be different individuals. No single officer may initiate and approve the same action. Dual-approval is logged in the audit chain with timestamps and individual identities. Automated controls block single-operator approval for designated actions. Quarterly review of four-eyes logs by Internal Audit.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "dpmsr-filing",
    section: "Reporting",
    title: "DPMSR Filing Policy",
    body:
      "A Dealers in Precious Metals and Stones Report (DPMSR) must be filed with MoE within 30 calendar days of any single or linked cash transaction(s) ≥ AED 55,000. The DPMSR register is updated within 24 hours of each qualifying transaction. The MLRO countersigns every DPMSR before submission. Amendments to filed DPMSRs must be submitted within 5 business days of discovering an error. A copy of each DPMSR and supporting documentation is retained for 10 years. Monthly reconciliation of DPMSR filings against the transaction ledger is mandatory.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "outsourcing",
    section: "Governance",
    title: "Outsourcing & Third-Party Risk Policy",
    body:
      "Any outsourcing of AML/CFT functions (screening, CDD, goAML filing) requires prior Board approval and a written outsourcing agreement specifying AML obligations, audit rights, and data-protection requirements. The MLRO retains full regulatory accountability for outsourced functions — liability cannot be contracted away. Third-party providers are assessed annually against the same risk criteria as customers. Material failures by a third-party provider are reported to the relevant regulator within 5 business days. Access to customer data by third parties is logged and reviewed quarterly.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "mlro-succession",
    section: "Governance",
    title: "MLRO Succession & Continuity Policy",
    body:
      "A designated Deputy MLRO is authorised to exercise all MLRO powers in the event of absence, incapacity, or vacancy. The Deputy MLRO must hold equivalent AML/CFT qualifications. Any MLRO vacancy must be filled and the replacement notified to CBUAE / MoE within 30 calendar days per FDL 10/2025 Art.15(5). A succession plan is reviewed annually by the Board. The outgoing MLRO must complete a structured handover including case briefings, open investigations, and regulatory correspondence within 10 business days.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "data-privacy",
    section: "Data",
    title: "Data Privacy & Subject Access Policy",
    body:
      "Customer personal data is processed solely for the purposes of AML/CFT compliance under FDL 10/2025 and UAE Federal Decree-Law No. 45/2021 on Personal Data Protection. Data is retained for exactly 10 years from the end of the business relationship and then securely destroyed. Subject access requests are acknowledged within 5 business days and fulfilled within 30 days. Data shared with regulators or FIU is logged. International data transfers require a documented lawful basis. Breaches involving personal data are reported to the relevant authority within 72 hours.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "customer-exit",
    section: "Onboarding",
    title: "Customer Exit & De-risking Policy",
    body:
      "A customer relationship must be terminated where: (1) CDD cannot be completed within 30 days of a re-KYC trigger; (2) a confirmed sanctions match exists with no licence to continue; (3) the customer refuses to provide UBO information; (4) an STR has been filed and the MLRO determines continued relationship poses unacceptable risk. Exit decisions require MLRO sign-off and are logged in the audit chain. Funds are returned to a verified account in the customer's name — no cash exits. A post-exit monitoring flag is maintained for 12 months. Exits driven by regulatory direction require Board notification within 5 business days.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "third-party-reliance",
    section: "Onboarding",
    title: "Third-Party Reliance Policy",
    body:
      "The firm may rely on CDD conducted by a regulated third party (bank, DNFBP, or equivalent) where: (a) the third party is subject to AML/CFT regulation and supervision equivalent to UAE standards; (b) a written reliance agreement is in place; (c) the third party agrees to provide CDD documentation within 5 business days on request. Reliance does not transfer regulatory liability — the MLRO retains full accountability. High-risk customers, PEPs, and TFS-flagged subjects are excluded from third-party reliance regardless of the relying institution's status. Third-party reliance arrangements are reviewed annually.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "internal-audit-scope",
    section: "Governance",
    title: "Internal Audit Scope & AML Testing",
    body:
      "Internal Audit must conduct an independent AML/CFT effectiveness review at least annually covering: (1) adequacy of policies and procedures; (2) quality of CDD files including PEP and high-risk subjects; (3) transaction monitoring alert quality and closure rationale; (4) STR filing timeliness and completeness; (5) training completion rates; (6) four-eyes control operation; (7) sanctions screening configuration and false-positive rates. Audit findings are reported to the Board Audit Committee within 15 business days. Open findings are tracked to closure with MLRO sign-off. Any critical finding (risk-rated High) triggers an immediate interim review.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "sanctions-evasion-redflags",
    section: "Screening",
    title: "Sanctions Evasion Red-Flag Policy",
    body:
      "The following patterns constitute sanctions-evasion red flags requiring immediate MLRO escalation: (1) transaction routed through a jurisdiction on the FATF grey/black list for no documented commercial reason; (2) third-party payment from an unrelated entity in a high-risk jurisdiction; (3) counterparty name phonetically or typographically similar to a listed person with no clear distinction; (4) use of corporate vehicles with nominee structures in secrecy jurisdictions; (5) requests to split transactions below AED 55,000 thresholds; (6) pressure from the customer to process rapidly without explanation; (7) shipment routes inconsistent with stated origin or destination of goods. Each red flag is documented in the case file and dispositioned by the MLRO within 48 hours.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "cross-border-wire",
    section: "Reporting",
    title: "Cross-Border Wire Transfer Policy",
    body:
      "All cross-border wire transfers must include full originator and beneficiary information per FATF R.16 / CBUAE Notice 35/2021. Transfers to or from FATF grey-list jurisdictions require MLRO pre-approval and enhanced due diligence on the stated purpose. Transfers to FATF black-list jurisdictions are prohibited absent a specific regulatory licence. The Travel Rule applies to all transfers ≥ USD 1,000 (or equivalent): originator name, account number, address, and beneficiary name and account number must accompany the payment instruction. Correspondent banks must be pre-approved and included in the authorised counterparty register. Outbound wire instructions without complete beneficiary data are rejected and the customer notified within 1 business day.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "account-dormancy",
    section: "Data",
    title: "Dormant Account & Inactive Customer Policy",
    body:
      "A customer account is classified dormant where no transaction or documented contact has occurred for 12 consecutive months. Dormant accounts are flagged in the CRM within 5 business days of the trigger date. The MLRO is notified of all dormant accounts quarterly. Before reactivation: full re-KYC must be completed, sanctions re-screen performed, and source-of-funds re-verified. Dormant accounts with a risk rating of High or with open adverse-media flags require Board-level approval to reactivate. Unclaimed assets are handled per UAE Central Bank Notice 29/2019. Records for dormant accounts are retained for the full 10-year statutory period from last activity.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "new-product-risk",
    section: "Governance",
    title: "New Product & Service Risk Assessment Policy",
    body:
      "No new product, service, delivery channel, or technology is launched without a documented AML/CFT risk assessment approved by the MLRO and Board. The assessment must address: ML/TF typologies specific to the product; customer segments likely to use it; jurisdictional exposure; controls needed to mitigate identified risks; and monitoring mechanisms. The assessment is completed before commercial launch — no exceptions. Where the product involves virtual assets, crypto-to-fiat conversion, or non-face-to-face onboarding, CBUAE/VARA notification may be required. Post-launch monitoring report is submitted to the MLRO within 90 days of launch. Significant product modifications trigger a re-assessment.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "gifts-entertainment",
    section: "Governance",
    title: "Gifts, Entertainment & Anti-Bribery Policy",
    body:
      "No employee may solicit or accept gifts, hospitality, or entertainment from customers, suppliers, or counterparties with a value exceeding AED 500 per occasion or AED 1,000 per calendar year from the same source. All gifts and entertainment received above AED 200 must be declared in the Gifts Register within 5 business days. Gifts of cash or cash equivalents (gift cards, vouchers) are prohibited regardless of value. Providing gifts to public officials or regulators is prohibited in all circumstances. Facilitation payments are never acceptable. Breaches are reported to the MLRO and may constitute grounds for disciplinary action or referral to law enforcement. The Gifts Register is reviewed by Internal Audit annually.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "ungp-human-rights",
    section: "Human Rights",
    title: "UN Guiding Principles Human-Rights Policy",
    body:
      "We commit to respect internationally recognised human rights as articulated in the International Bill of Human Rights and the ILO Core Conventions. Salient human-rights risks across our operations and value chain are identified annually and prioritised by severity (scale, scope, irremediability) and likelihood, consistent with UNGP Pillar 2. We integrate findings into business decisions, track effectiveness, and communicate externally. Operational-level grievance mechanisms must be legitimate, accessible, predictable, equitable, transparent, rights-compatible, and a source of continuous learning. Where we have caused or contributed to adverse impacts we provide or cooperate in remedy. The MLRO escalates any salient-risk breach to the Board within 15 business days.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "ai-governance",
    section: "AI Governance",
    title: "Responsible AI Governance Policy",
    body:
      "Every AI / ML system in scope (rule-augmenting models, screening uplift, narrative drafting, anomaly detection) is classified into a risk tier aligned with the EU AI Act and NIST AI RMF Govern-Map-Measure-Manage profile. High-risk systems require: (1) a published model card; (2) documented training-data lineage; (3) bias and fairness evaluation across protected cohorts; (4) human-in-the-loop disposition for any adverse customer outcome; (5) post-deployment monitoring for drift. The MLRO is the accountable owner; the AI Governance Committee approves go-live. Generative-AI outputs in regulatory filings must be reviewed by a qualified human and labelled in the audit chain.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "ai-explainability",
    section: "AI Governance",
    title: "AI Explainability & Contestability Policy",
    body:
      "Any AI-derived score that materially affects a customer disposition (onboarding refusal, exit, EDD, freeze) must be accompanied by a human-readable explanation citing the contributing features and the policy rule applied. Customers may contest an AI-derived disposition; contests are routed to a non-author MLRO reviewer within 5 business days. Black-box models without satisfactory feature attribution are prohibited from making terminal decisions. Explanations are stored in the case file and retained for the full 10-year window. Quarterly explainability audits sampled by Internal Audit.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "lbma-rgg-policy",
    section: "Responsible Sourcing",
    title: "LBMA Responsible Gold Guidance Policy",
    body:
      "All gold counterparties are due-diligenced under the LBMA RGG five-step framework: (1) establish strong company management systems; (2) identify and assess supply-chain risks; (3) design and implement a strategy to respond to identified risks; (4) arrange for an independent third-party audit of the supply chain; (5) report annually on supply-chain due-diligence. Counterparty country-of-origin and refinery-of-origin must be evidenced before settlement. Gold from CAHRA jurisdictions requires Step-3 mitigation evidence reviewed by the MLRO. Annual public RGG report is published within 90 days of fiscal year-end.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "uae-rsg-policy",
    section: "Responsible Sourcing",
    title: "UAE Responsible Sourcing of Gold Policy",
    body:
      "We comply with the UAE Good Delivery (UAEGD) Standard and the DMCC Rules for Risk-Based Due Diligence in the Gold and Precious Metals Supply Chain. Country-of-origin attestation, KYS (Know-Your-Supplier) onboarding files, and chain-of-custody records are mandatory before any gold receipt. A risk-based five-step due-diligence cycle is operated and audited annually by an approved DMCC reviewer. Findings are reported to the DMCC Precious Metals & Gemstones Office within statutory deadlines.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "rmi-rmap-policy",
    section: "Responsible Sourcing",
    title: "Responsible Minerals Initiative / RMAP Policy",
    body:
      "All tin, tungsten, tantalum, gold (3TG) and cobalt smelters in our supply chain must hold valid RMAP-conformant status or be on an active corrective-action plan tracked by the MLRO. The annual Conflict Minerals Reporting Template (CMRT) is collected from every Tier-1 supplier; non-response triggers a 60-day cure period followed by escalation. Smelter list is reconciled against the RMI public list quarterly. Non-conformant smelters with no remediation pathway are exited.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "cahra-policy",
    section: "Responsible Sourcing",
    title: "CAHRA Determination Policy",
    body:
      "Conflict-Affected and High-Risk Areas are determined using the OECD-DDG indicative list as a baseline, supplemented by the Heidelberg Conflict Barometer, ACLED conflict data, the Fragile States Index, and UN Panel of Experts reports. The CAHRA list is reviewed quarterly by the MLRO and ratified by the Board. Sourcing from a CAHRA jurisdiction is permitted only with documented Step-3 mitigation, independent audit (Step-4), and senior-management approval. CAHRA determinations are published in the annual responsible-sourcing report.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "oecd-anti-bribery",
    section: "Anti-Bribery",
    title: "OECD Anti-Bribery Convention Policy",
    body:
      "We prohibit bribery of foreign public officials in international business transactions, consistent with the OECD Anti-Bribery Convention, UAE Federal Decree-Law No. 31/2021 (Penal Code) Articles 234-239, and the UK Bribery Act where extraterritorial. Facilitation payments are not permitted. Third-party intermediaries are subject to anti-bribery due diligence and contractual representations. Books and records must accurately reflect every transaction; off-book accounts are prohibited. Suspected bribery is reported to the MLRO immediately and, where required, to law enforcement.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "oecd-mne-guidelines",
    section: "Human Rights",
    title: "OECD Guidelines for Multinational Enterprises Policy",
    body:
      "We adopt the OECD Guidelines for Multinational Enterprises chapters on disclosure, human rights, employment, environment, anti-bribery, consumer interests, and tax. We participate in good faith with the UAE National Contact Point in any specific instance raised. Annual self-assessment against each chapter is reported to the Board. Material non-conformities trigger a remediation plan reviewed by the MLRO and Internal Audit.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "oecd-ddg-policy",
    section: "Responsible Sourcing",
    title: "OECD Due Diligence Guidance Policy",
    body:
      "The OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from Conflict-Affected and High-Risk Areas is the primary reference framework for our minerals due-diligence programme. Annex II red flags (location, supplier, transaction circumstances) are screened on every consignment. Step-3 risk-mitigation strategies are documented in the case file with measurable targets and a re-assessment date. Supply-chain ruptures or unmitigated Annex-II hits trigger temporary suspension pending Board review.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "fatf-rba-policy",
    section: "Risk Appetite",
    title: "FATF Risk-Based Approach Policy",
    body:
      "The firm operates a documented FATF Risk-Based Approach: customer, geographic, product, channel, and transaction risk factors are scored on a calibrated matrix; controls are commensurate with assessed risk. The methodology is reviewed annually and ratified by the Board. Higher-risk relationships receive enhanced due-diligence and intensified ongoing monitoring; lower-risk relationships receive simplified measures only where explicit FATF and CBUAE conditions are met. Risk-acceptance decisions outside appetite require MLRO and Board sign-off.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "fatf-grey-list-policy",
    section: "Screening",
    title: "FATF Grey-List Jurisdiction Policy",
    body:
      "Counterparties resident, incorporated, or beneficially owned in a FATF Increased-Monitoring (grey-list) jurisdiction are tagged in the case file and subject to: (1) source-of-funds verification independent of the customer; (2) MLRO pre-approval of any single transaction ≥ AED 200,000; (3) ongoing monitoring at the highest tier; (4) annual re-KYC. Grey-list status is refreshed within 5 business days of each FATF plenary publication. Any uplift to FATF Call-for-Action (black) list triggers an immediate freeze and Board notification.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "moe-circular-impl",
    section: "Reporting",
    title: "MoE Circular Implementation Policy",
    body:
      "Every UAE Ministry of Economy circular relevant to DNFBPs is reviewed by the MLRO within 5 business days of publication. A circular-implementation log records: date received, applicable scope, gap analysis vs current policy, target close date, owner, and Board ratification. The implementation deadline is the earlier of the regulator-stated date or 30 calendar days from publication. Open circulars are reported to the Board Audit Committee monthly.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "fiu-goaml-tech",
    section: "Reporting",
    title: "FIU goAML Technical Policy",
    body:
      "All reports to the UAE Financial Intelligence Unit are submitted exclusively through the goAML XML portal using the active schema version. The technical pipeline performs schema validation, business-rule validation, and four-eyes review prior to submission. Submission acknowledgements (XML envelope IDs) are captured in the audit chain with the corresponding case ID. Any rejection is remediated and re-submitted within 5 business days with root-cause analysis.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "modern-slavery-policy",
    section: "Human Rights",
    title: "Modern Slavery Policy",
    body:
      "We have a zero-tolerance approach to modern slavery in our business and supply chain. Annual modern-slavery statements are prepared in accordance with the UK Modern Slavery Act 2015 Section 54, the Australian Modern Slavery Act 2018, and the California Transparency in Supply Chains Act where applicable. Statements are signed by the Board, published on our website, and lodged with the relevant national registers. Suppliers contractually warrant compliance and submit to audit. Confirmed instances trigger remediation aligned with the UNGP, not punitive disengagement.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "forced-labour-policy",
    section: "Human Rights",
    title: "Forced Labour Policy",
    body:
      "We apply the ILO Indicators of Forced Labour to all upstream and downstream relationships: abuse of vulnerability, deception, restriction of movement, isolation, physical and sexual violence, intimidation and threats, retention of identity documents, withholding of wages, debt bondage, abusive working and living conditions, and excessive overtime. Any indicator confirmed in the supply chain triggers a documented investigation and remediation plan with worker-voice input. Where remediation is impossible we exit responsibly. Supplier exits are coordinated with NGO partners to avoid worker harm.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "child-labour-policy",
    section: "Human Rights",
    title: "Child Labour Policy",
    body:
      "We prohibit any form of child labour in our operations and supply chain. The minimum age for any worker is 15 (or the local statutory minimum if higher); for hazardous work, 18. Worst forms of child labour as defined in ILO Convention 182 are subject to immediate escalation to the MLRO and the relevant national authority. Where children are found in our value chain, remediation prioritises return to education and family economic support, not summary disengagement.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "un-sanctions-impl",
    section: "Screening",
    title: "UN Security Council Sanctions Implementation Policy",
    body:
      "We implement UNSC sanctions regimes including Resolution 1267 (Al-Qaida / ISIL / Taliban), 1718 (DPRK), and 2231 (Iran nuclear). Designations are propagated to screening engines within 24 hours of UN Sanctions List publication. Any positive match is treated as a hard-stop freeze with no commercial override; tipping-off prohibited. Travel-Rule, dual-use export controls, and maritime sectoral restrictions arising under these regimes are enforced through the relevant operational policies. EOCN is the UAE national contact point for delisting and licence applications.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "un-comtrade-validation",
    section: "Reporting",
    title: "UN Comtrade Trade-Statistics Validation Policy",
    body:
      "Counterparty trade narratives (declared origin, declared destination, declared product, declared volume) are validated against UN Comtrade bilateral trade statistics on a sample basis. Material divergence between declared trade and Comtrade-reported flows is recorded as a TBML red flag and dispositioned by the MLRO within 5 business days. Validation queries and outputs are stored in the case file for the 10-year retention window.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "environmental-dd",
    section: "Responsible Sourcing",
    title: "Environmental Due Diligence Policy",
    body:
      "Environmental crime predicates (illegal logging, IUU fishing, wildlife trafficking, illegal mining, illegal waste trafficking) are screened across the customer and counterparty book in line with FATF Best Practices on Environmental Crime. CITES documentation is verified for any in-scope fauna/flora; FLEGT licences for timber; CITES-equivalent attestations for processed wildlife products. Confirmed environmental-crime nexus is treated as a financial-crime predicate and triggers an STR.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "responsible-ai-procurement",
    section: "AI Governance",
    title: "Responsible AI Procurement Policy",
    body:
      "Third-party AI products are procured only from vendors who provide: (1) a model card or system card; (2) evidence of bias testing; (3) data-lineage documentation including any synthetic data generation; (4) contractual representations on training-data licensing and IP; (5) a security questionnaire covering OWASP LLM Top-10 controls. Vendors must accept audit rights and incident-disclosure obligations. Procurements without these artefacts require AI Governance Committee waiver with documented compensating controls.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "esg-disclosure",
    section: "Disclosure",
    title: "ESG Disclosure Policy",
    body:
      "We publish an annual ESG report aligned with the IFRS Sustainability Disclosure Standards (S1 / S2), the GRI Standards, and where applicable the SFDR Article 8/9 templates. Climate disclosures follow the TCFD recommendations and double-materiality assessment principles. Forward-looking metrics include scope-1, scope-2, and material scope-3 emissions, water stewardship, and human-rights salient risks. Greenwashing is prohibited; every quantitative disclosure must trace to an auditable methodology in the disclosure-control register.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "code-of-conduct",
    section: "Charter",
    title: "Code of Conduct",
    body:
      "Every staff member, contractor, and Board member must read and acknowledge the Code of Conduct annually. The Code prohibits bribery, facilitation payments, market abuse, conflicts of interest, retaliation against whistleblowers, and any conduct that would bring the firm into disrepute. Breaches are investigated by Compliance and may result in disciplinary action, dismissal, or referral to law enforcement. Acknowledgement is recorded and access to systems is suspended after a 14-day grace period for any unsigned attestation.",
    lastReviewed: "2026-04-20",
  },
  {
    id: "three-lines-of-defense",
    section: "Charter",
    title: "Three Lines of Defense",
    body:
      "Risk and control responsibilities are split: 1LoD (business operations) owns risk identification, control execution, and first-pass disposition; 2LoD (Compliance / Risk / MLRO) sets policy, monitors execution, and challenges 1LoD; 3LoD (Internal Audit) provides independent assurance to the Board. Reporting lines preserve 2LoD and 3LoD independence — neither reports to a 1LoD line manager. The model is reviewed annually by the Board Audit Committee against the IIA Three Lines Model 2020.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "compliance-independence",
    section: "Charter",
    title: "Compliance Function Independence Charter",
    body:
      "The Compliance function reports administratively to the CEO and functionally to the Board Audit Committee. The CCO and MLRO have direct, unfiltered access to the Board Chair. Compliance budget, staffing, and tools are approved by the Board, not the business heads. No compensation element of any Compliance officer is tied to commercial KPIs. Removal of the CCO or MLRO requires Board approval and regulator notification within 30 days per FDL 10/2025 Art.15.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "ewra-methodology",
    section: "Risk Appetite",
    title: "Enterprise-Wide Risk Assessment Methodology",
    body:
      "The Enterprise-Wide Risk Assessment (EWRA) is performed annually and on material change. Methodology anchors to FATF risk-based-approach guidance and the latest UAE National Risk Assessment. Inherent risk is scored across geography, customer mix, products, channels, transaction volume, and delivery channels; control effectiveness is tested via sample-based assurance; residual risk drives the EWRA-led control plan. Board approval is required before publication. Material changes (new product, new geography, regulator finding) trigger an out-of-cycle refresh.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "concentration-risk-limits",
    section: "Risk Appetite",
    title: "Concentration Risk Limits",
    body:
      "Single-customer exposure must not exceed 10% of group AML-relevant revenue. Single-jurisdiction exposure (excluding home market) is capped at 25%. Single-sector exposure is capped at 35% (DPMS / Real Estate / VASP / Banking each measured separately). Breaches trigger Board notification within 5 business days and a remediation plan including controlled de-risking. Limits are reviewed annually against the EWRA and refreshed risk appetite statement.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "source-of-wealth-standards",
    section: "Onboarding",
    title: "Source-of-Wealth Verification Standards",
    body:
      "Source-of-Wealth (SoW) is documented for all PEPs, high-risk customers, and any customer whose AUM or transaction profile exceeds AED 5,000,000 over a 12-month period. The evidence hierarchy (most to least probative): regulator-issued asset disclosures, audited financial statements, tax filings, Big-4 advisor letters, listed-share custody records, and bank statements covering the wealth-accumulation period. Self-certification alone is insufficient. SoW evidence is dated and refreshed every 24 months for tier-1 PEPs.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "bo-threshold-policy",
    section: "Onboarding",
    title: "Beneficial Ownership Threshold Policy",
    body:
      "Beneficial owners are identified at the 25% ownership-or-control threshold per FATF R.24/25 and FDL 10/2025 Art.20. Where no natural person meets the threshold through ownership, identification proceeds via control (voting rights, board appointment, contractual rights). Where neither path identifies a BO, the senior managing official is recorded with a documented rationale. Nominee directors or shareholders trigger automatic EDD and verification of the natural person behind the nominee.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "non-face-to-face",
    section: "Onboarding",
    title: "Non-Face-to-Face Customer Policy",
    body:
      "Customers onboarded without in-person presence must complete liveness-detected biometric verification, document-authenticity checks (NFC where available), and at minimum one out-of-band verification (penny test, video call, employer letter). Higher transaction limits remain restricted until enhanced verification or in-person KYC is completed. Onboarding through a regulated agent is permitted under FATF R.17 reliance with a written reliance agreement. Recordings of liveness sessions are retained for 10 years.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "charity-ngo-policy",
    section: "Onboarding",
    title: "Charity & NGO Customer Policy",
    body:
      "Charities and non-profit organisations are screened against TF risk per FATF R.8. CDD captures registered status, governing-board members, source of funding (donor concentration), end-use of funds, and operational footprint in CAHRA jurisdictions. Cash transactions over AED 55,000 in a 6-month window trigger EDD and a TF-typology review. UAE-resident NGOs must be registered with the Ministry of Community Development (MoCD) or relevant Emirate authority. Cross-border donor flows are monitored against the EOCN list.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "adverse-media-methodology",
    section: "Screening",
    title: "Adverse Media Screening Methodology",
    body:
      "Adverse-media screening is run at onboarding and refreshed at the same cadence as sanctions screening. Sources include 50,000+ global publications in English, Arabic, French, Chinese, Russian, and Spanish — covering ML, TF, predicate offences, sanctions evasion, fraud, corruption, environmental crime, and human-rights abuses. Hits older than 7 years are de-prioritised unless they relate to ongoing investigations. False-positive workflow requires documented disposition; true positives trigger an EDD case. Source URLs are captured for every adverse-media flag.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "vessel-aircraft-screening",
    section: "Screening",
    title: "Vessel & Aircraft Sanctions Screening",
    body:
      "Vessels are screened against IMO numbers, MMSI, flag changes, and AIS dark-period indicators. Aircraft are screened against tail number, ICAO 24-bit address, and registry. Screening covers OFAC, UN, EU, UK, OFSI, and EOCN designation lists at every transaction. Vessels exhibiting AIS spoofing, flag-hopping, or STS (ship-to-ship) transfer in proscribed zones are escalated to MLRO regardless of nominal beneficial ownership. Voyage history is captured for any cargo movement linked to DPRK, Iran, Syria, Russia, or Venezuela.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "dual-use-export-control",
    section: "Screening",
    title: "Dual-Use Goods & Export Control Policy",
    body:
      "Trade in dual-use goods (Wassenaar Arrangement, EAR, EU Reg 2021/821) requires end-user / end-use certification before any payment is processed. Diversion red flags include over-specification, unusual routing, and end-users in proximity to military programmes. Export to FATF black-list jurisdictions or to entities on the BIS Entity List is prohibited absent a specific licence. Annual export-control training is mandatory for trade-finance, payments, and relationship-management staff. Records are retained for 10 years.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "ctr-policy",
    section: "Reporting",
    title: "Cash Threshold Reporting (CTR) Policy",
    body:
      "Single or aggregated cash transactions of AED 55,000 or equivalent (within a 24-hour window or 5-day linked period) are reported to the FIU on goAML within 30 days. Aggregation includes related accounts, related parties, and structured deposits. Operational thresholds for analyst escalation are set 10% below the regulatory threshold to capture structuring at the boundary. The CTR register is reviewed monthly by the MLRO and reconciled to the cash ledger. Failure to file is a disciplinary offence and may constitute a criminal act.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "travel-rule-policy",
    section: "Reporting",
    title: "Travel Rule Policy (FATF R.16)",
    body:
      "All wires of USD 1,000 or equivalent must carry full originator information (name, account, address, ID number) and beneficiary information (name, account). VASP transfers above the same threshold must transmit Travel Rule data via an approved protocol (TRP, Sygna, Notabene, OpenVASP) using IVMS-101 schema. Inbound transfers missing required Travel Rule data are rejected. Sunrise-period exceptions require senior-management approval and are reviewed quarterly. Records are retained for 10 years.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "independent-aml-audit",
    section: "Governance",
    title: "Independent AML Audit Policy",
    body:
      "An independent third-party AML audit is commissioned every 24 months covering the design and operating effectiveness of the AML / CFT programme: governance, risk assessment, CDD / EDD, screening, transaction monitoring, STR filing, training, and record-keeping. The auditor must be independent of any advisory engagement with the firm in the last 24 months. Findings are reported to the Board Audit Committee within 15 business days of issuance. High-risk findings trigger an interim review at 6 months. Audit reports are retained for 10 years.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "conflicts-of-interest",
    section: "Governance",
    title: "Conflicts of Interest Policy",
    body:
      "All staff, Board members, and senior managers must declare actual, potential, and perceived conflicts of interest in the COI Register at onboarding and annually thereafter. Material conflicts trigger recusal from related decisions. Personal account dealing in instruments influenced by the firm's customers is prohibited. Outside business interests require pre-approval. The COI Register is reviewed by Internal Audit annually and by the Board Audit Committee at least once per year. Concealment of a material conflict is a disciplinary matter.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "information-barriers",
    section: "Governance",
    title: "Information Barriers / Chinese Walls Policy",
    body:
      "Information barriers separate AML / Compliance / MLRO functions from front-office and trading desks. Customer suspicion files, STR drafts, and freeze decisions are not accessible to commercial lines except on a strict need-to-know basis approved by the MLRO. Wall-crossings are logged with timestamp, requestor, recipient, and rationale. Breach of an information barrier is a disciplinary offence and may also constitute tipping-off under FDL 10/2025. Annual testing of barriers is performed by Internal Audit.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "cpd-policy",
    section: "Governance",
    title: "Continuous Professional Development Policy",
    body:
      "All AML / CFT staff complete documented CPD covering FATF updates, UAE regulatory changes, sectoral typologies, sanctions developments, and case-study debriefs. Minimum CPD: 40 hours per year for the MLRO and Deputy MLRO; 25 hours for analysts; 15 hours for first-line staff with AML touchpoints. CPD is tracked in the training register. Failure to meet CPD blocks system access after a 30-day grace period. External certifications (CAMS, ICA, ACAMS) are encouraged and partially funded.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "data-quality-mdm",
    section: "Data",
    title: "Data Quality & Master Data Management Policy",
    body:
      "Customer master data (golden record) is the authoritative source for KYC, screening, monitoring, and reporting. Material data fields (name, DOB, nationality, address, BO chain, risk rating) are validated at onboarding and on every refresh. Data-quality KPIs (completeness, accuracy, timeliness) are reported monthly. Material discrepancies between master data and downstream systems are reconciled within 5 business days. The MDM Steering Committee approves master-data schema changes; the MLRO has veto over changes affecting AML-relevant fields.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "cross-border-data",
    section: "Data",
    title: "Cross-Border Data Transfer Policy",
    body:
      "Personal data transfers outside the UAE require a documented lawful basis under UAE Federal Decree-Law 45/2021 (PDPL) Art.22. Transfers to jurisdictions without an adequacy decision require Standard Contractual Clauses, explicit consent, or a regulator-approved exception. Transfers to regulators or FIUs under MLAT or international cooperation are exempt where covered by a specific legal gateway. The Cross-Border Transfer Register lists every data flow with destination, lawful basis, safeguards, and review date. The DPO reviews the Register quarterly.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "data-breach-notification",
    section: "Data",
    title: "Data Breach Notification Policy",
    body:
      "Any actual or suspected breach of personal data integrity, confidentiality, or availability is reported internally within 1 hour of detection. The DPO and MLRO assess severity within 4 hours. Reportable breaches (high risk to data subjects) are notified to the UAE Data Office within 72 hours of awareness per PDPL. Affected data subjects are notified without undue delay where high risk persists. The breach register captures incident, root cause, mitigation, and lessons learned. Annual tabletop exercises test the response runbook.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "real-estate-aml",
    section: "Sector: Real Estate",
    title: "Real-Estate AML Policy (Cabinet Res 10/2019)",
    body:
      "Brokers, agents, and developers covered by Cabinet Resolution 10/2019 must apply CDD on every buyer, seller, and intermediary. Cash, virtual asset, or single / linked transactions of AED 55,000 or equivalent trigger DPMS-equivalent EDD. Source-of-funds covering the full purchase price must be documented before completion. UBO of any corporate party is identified at the 25% threshold. Real-Estate Activity Reports (REAR) are filed on goAML within 30 days of the trigger event. Records and underlying evidence are retained for 10 years.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "tcsp-policy",
    section: "Sector: TCSP",
    title: "Trust & Company Service Provider Policy",
    body:
      "TCSP services (company formation, trust administration, nominee director / shareholder, registered office) require enhanced CDD on every settlor, trustee, protector, beneficiary, director, shareholder, and source of funds. Bearer-share companies and shelf companies with undisclosed UBOs are not accepted. Nominee arrangements are permitted only where the underlying natural person is identified and screened. STR triggers include any client unwilling to disclose source of wealth, multiple shell-layer transfers, or onboarding under an alias. Records retained 10 years post-relationship.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "legal-profession-aml",
    section: "Sector: Legal",
    title: "Legal Profession AML Policy",
    body:
      "Lawyers performing in-scope FATF R.22 gateway services (real estate, business sale, trust formation, account management, BO formation) apply CDD before substantive work. Legal Professional Privilege (LPP) does not extend to client communications made for the purpose of furthering a crime, or to information that the lawyer is legally required to report. Where reporting and LPP appear to conflict, the matter is referred to a different firm for independent advice. Privileged and AML files are kept on separate access-controlled systems.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "auditor-aml",
    section: "Sector: Audit",
    title: "Auditor / Accountant AML Policy",
    body:
      "Engagements involving in-scope FATF R.22 gateway services require CDD before commencement. Auditors must apply professional scepticism to indicators of ML, TF, and predicate offences encountered during the engagement. Suspicions are escalated to the engagement partner and the firm's MLRO; STRs are filed where reasonable suspicion exists. The audit firm coordinates with the relevant Self-Regulatory Body and applies tipping-off rules. Working papers and CDD are retained for 10 years.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "insurance-aml",
    section: "Sector: Insurance",
    title: "Insurance AML Policy",
    body:
      "Life-insurance products (single-premium, investment-linked, surrender-eligible) are within scope. CDD is applied to policyholder, premium funder, and beneficiary. Single-premium deposits over AED 100,000 trigger EDD. Suspicious indicators include rapid surrender within 24 months, third-party premium funders without familial link, frequent change of beneficiary, and assignment to unrelated parties. STR triggers cascade to MLRO with documented evidence. Claims paid to third-party accounts require Compliance pre-approval.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "fintech-open-banking",
    section: "Sector: FinTech",
    title: "FinTech / Open Banking AML Policy",
    body:
      "Account Information Service Providers (AISPs) and Payment Initiation Service Providers (PISPs) operating under CBUAE, ADGM FSRA, or DIFC DFSA licensing apply CDD to platform users and the linked PSU. Strong customer authentication and consent capture are mandatory. Data scope is limited to the explicit user consent. Onward data sharing requires both regulatory permission and user consent. AML signals (account churn, structuring, sanctioned-counterparty exposure) are surfaced to the partner financial institution within agreed SLAs.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "correspondent-banking",
    section: "Sector: Banking",
    title: "Correspondent Banking Policy (FATF R.13)",
    body:
      "Correspondent relationships are established only after CBDDQ (Wolfsberg) collection, senior-management approval, and documented respective AML / CFT responsibilities. Shell banks are prohibited; respondents that allow shell-bank access are also prohibited. Payable-through accounts require evidence that the respondent applies CDD on its own customers and grants the firm right of access. Annual review reconfirms respondent licensing, ownership, and AML programme. Termination occurs on adverse regulator action or material risk increase, with regulator notification per Cabinet Res 74/2020 where TFS is implicated.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "trade-finance-aml",
    section: "Sector: Banking",
    title: "Trade Finance AML Policy",
    body:
      "Letters of credit, bank guarantees, and documentary collections undergo trade-AML screening covering price-anomaly checks (LBMA / LME / commodity reference), goods-vessel-port consistency, dual-use commodity flags, and counterparty UBO transparency. CAHRA-jurisdiction transit triggers EDD. Phantom shipments, circular trade flows, and over- / under-invoicing more than 15% of reference are escalated to MLRO. Every trade-finance instrument is logged in the trade-AML register with disposition rationale. Retention is 10 years.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "front-company-trade-diversion",
    section: "Screening",
    title: "Front Company & Trade-Diversion Red-Flag Policy",
    body:
      "Indicators of front-company use include: registered address shared with multiple unrelated entities, no online or commercial footprint, goods inconsistent with declared activity, recently incorporated companies transacting at high volume, and ownership traced to high-risk jurisdictions through nominee chains. Trade-diversion red flags include circuitous shipping routes, transhipment via free zones, end-use inconsistency, and end-user distance from declared customer. Each indicator is logged; aggregation of three or more indicators triggers MLRO escalation within 24 hours.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "russia-belarus-sanctions",
    section: "Screening",
    title: "Russia / Belarus Sanctions Compliance Policy",
    body:
      "EU Reg 833/2014 sectoral measures, EU Reg 765/2006 (Belarus), US Executive Orders 14024 / 14071, and UK SAMLA / Russia Regulations 2019 are incorporated into the screening list. Restricted goods, oil-price-cap attestations, dual-use prohibitions, and SWIFT-disconnected respondents are reflected in transaction controls. 'No Russian-touch' supply-chain certification is required on dual-use goods. AIS spoofing and flag-of-convenience indicators are screened on every cargo movement. Updates from the EU Official Journal, OFAC, and UK OFSI are reflected within 24 hours.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "iran-sanctions",
    section: "Screening",
    title: "Iran Sanctions Compliance Policy",
    body:
      "UN Security Council Resolution 2231 (post-JCPOA), US OFAC primary and secondary sanctions, and EU Reg 267/2012 are reflected in the screening list. IRGC, MODAFL, NIOC, and sanctioned Iranian banks are blocked counterparties. Dual-use goods require procurement-channel approval per UN 2231 Annex B. Humanitarian carve-outs are processed only with regulator no-objection and with full Travel Rule transparency. Iran-connected vessels and aircraft are screened via IMO / ICAO. Records retained 10 years.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "ai-model-risk",
    section: "AI Governance",
    title: "AI Model Risk Management Policy",
    body:
      "Every AI / ML model used in AML / CFT decisions (screening, scoring, monitoring, GenAI advisory) is registered in the Model Inventory with intended use, training data lineage, performance metrics, validation evidence, drift thresholds, and review cycle. Pre-deployment validation is independent of model development. Production models are monitored daily for drift (PSI / KS) and quarterly for fairness. Model owners are accountable to the Risk and Compliance Committee. Models cannot be promoted without Compliance + Risk sign-off.",
    lastReviewed: "2026-04-15",
  },
  {
    id: "ai-bias-fairness-audit",
    section: "AI Governance",
    title: "AI Bias & Fairness Audit Policy",
    body:
      "Annual independent bias audits are conducted on every AML / CFT model with a stratified sample across protected attributes and risk tiers. Metrics computed: disparate impact, equalised odds, calibration by group, and adverse-impact ratios. Documented thresholds for each metric are pre-agreed with Compliance and Risk. Audit findings are reported to the Board Risk Committee. Material breaches block production use until remediation (reweighting, threshold adjustment, data refresh) and re-validation are complete. Audit reports retained 10 years.",
    lastReviewed: "2026-04-15",
  },
];

function load(): Policy[] {
  if (typeof window === "undefined") return DEFAULT_POLICIES;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? JSON.parse(raw) : DEFAULT_POLICIES;
  } catch {
    return DEFAULT_POLICIES;
  }
}

function save(policies: Policy[]) {
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(policies));
  } catch {
    /* */
  }
}

const SECTIONS = [
  "Charter", "Redlines", "Risk Appetite", "Onboarding", "Screening",
  "Reporting", "Governance", "Data", "Sector: DPMS", "Sector: VASP", "PEP Policy",
  "Human Rights", "AI Governance", "Responsible Sourcing", "Anti-Bribery", "Disclosure",
  "Sector: Real Estate", "Sector: TCSP", "Sector: Legal", "Sector: Audit",
  "Sector: Insurance", "Sector: FinTech", "Sector: Banking",
];

const BLANK_NEW: Omit<Policy, "id"> = {
  section: "Governance",
  title: "",
  body: "",
  lastReviewed: new Date().toISOString().slice(0, 10),
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState<Omit<Policy, "id">>(BLANK_NEW);

  useEffect(() => {
    setPolicies(load());
  }, []);

  const startEdit = (p: Policy) => {
    setEditing(p.id);
    setDraft(p.body);
  };

  const saveEdit = (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const next = policies.map((p) =>
      p.id === id ? { ...p, body: draft, lastReviewed: today } : p,
    );
    save(next);
    setPolicies(next);
    setEditing(null);
  };

  const deletePolicy = (id: string) => {
    const next = policies.filter((p) => p.id !== id);
    save(next);
    setPolicies(next);
  };

  const saveNew = () => {
    if (!newForm.title.trim() || !newForm.body.trim()) return;
    const id = `custom-${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);
    const next = [...policies, { ...newForm, id, lastReviewed: today }];
    save(next);
    setPolicies(next);
    setAdding(false);
    setNewForm(BLANK_NEW);
  };

  const sections = Array.from(new Set(policies.map((p) => p.section)));

  return (
    <ModuleLayout asanaModule="policies" asanaLabel="Policies">
        <ModuleHero
          moduleNumber={32}
          eyebrow="Module 17 · SOP vault"
          title="Policies"
          titleEm="charter."
          intro={
            <>
              <strong>One source of truth for every rule the brain cites.</strong>{" "}
              Charter, redlines, risk appetite, sector policies — versioned
              and click-to-edit. Every disposition in the audit chain binds
              to the policy revision in effect when the decision was made.
            </>
          }
        />

        <div className="mt-6 space-y-6">
          {sections.map((sec) => (
            <section key={sec}>
              <h2 className="text-10 uppercase tracking-wide-4 font-semibold text-ink-2 mb-2">
                {sec}
              </h2>
              <div className="space-y-2">
                {policies
                  .filter((p) => p.section === sec)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="bg-bg-panel border border-hair-2 rounded-lg p-4"
                    >
                      <div className="flex items-baseline justify-between mb-2">
                        <h3 className="text-13 font-semibold text-ink-0 m-0">
                          {p.title}
                        </h3>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-10 text-ink-3">
                            reviewed {fmtDate(p.lastReviewed)}
                          </span>
                          <RowActions
                            label={`policy ${p.id}`}
                            onEdit={() => startEdit(p)}
                            onDelete={() => deletePolicy(p.id)}
                            confirmDelete={false}
                          />
                        </div>
                      </div>
                      {editing === p.id ? (
                        <>
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={5}
                            className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-bg-panel text-ink-0"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(p.id)}
                              className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              className="text-11 font-medium px-3 py-1 rounded text-ink-2"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-11.5 text-ink-1 leading-relaxed m-0">
                            {p.body}
                          </p>
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="mt-2 text-10 font-mono text-brand hover:underline"
                          >
                            edit
                          </button>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          ))}

          {/* Add new policy */}
          {adding ? (
            <div className="bg-bg-panel border border-brand/40 rounded-lg p-4">
              <h3 className="text-12 font-semibold text-ink-0 mb-3">New policy</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Title</label>
                  <input
                    type="text"
                    value={newForm.title}
                    onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                    placeholder="Policy title"
                    className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                  />
                </div>
                <div>
                  <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Section</label>
                  <select
                    value={newForm.section}
                    onChange={(e) => setNewForm({ ...newForm, section: e.target.value })}
                    className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                  >
                    {SECTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mb-3">
                <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Body</label>
                <textarea
                  value={newForm.body}
                  onChange={(e) => setNewForm({ ...newForm, body: e.target.value })}
                  rows={4}
                  placeholder="Policy text…"
                  className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-bg-0 text-ink-0"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveNew}
                  disabled={!newForm.title.trim() || !newForm.body.trim()}
                  className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0 disabled:opacity-40"
                >
                  Add policy
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewForm(BLANK_NEW); }}
                  className="text-11 font-medium px-3 py-1 rounded text-ink-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-11 font-mono text-ink-2 hover:text-brand transition-colors"
            >
              <span className="text-14 leading-none">+</span> add policy
            </button>
          )}
        </div>
    </ModuleLayout>
  );
}
