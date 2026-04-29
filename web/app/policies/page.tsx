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
