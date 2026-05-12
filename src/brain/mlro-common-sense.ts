// Hawkeye Sterling — MLRO common-sense rule library.
//
// 150+ regulator-grade imperative rules organised by MLRO topic. The
// classifier resolves these per question and the advisor injects them
// into the system prompt as anchored guidance — the model can cite the
// doctrineAnchor verbatim, which keeps charter prohibition P9 (no opaque
// scoring) honoured.

import type { MlroTopic } from './mlro-question-classifier.js';

export interface CommonSenseRule {
  id: string;
  topic: MlroTopic;
  rule: string;
  doctrineAnchor: string;
}

export const COMMON_SENSE_RULES: readonly CommonSenseRule[] = [
  // ── CDD ────────────────────────────────────────────────────────────────
  { id: 'cs_cdd_01', topic: 'cdd', rule: 'Verify natural-person identity with primary photo-ID + proof of address dated within 90 days; copies must show full document.', doctrineAnchor: 'FDL No.10/2025 Art.10' },
  { id: 'cs_cdd_02', topic: 'cdd', rule: 'For legal persons, walk the ownership chain to natural persons holding ≥25% control; if you stop at another legal person, the file is incomplete.', doctrineAnchor: 'UAE Cabinet Resolution 58/2020' },
  { id: 'cs_cdd_03', topic: 'cdd', rule: 'Risk-rate every customer at onboarding and re-rate on triggers (relationship change, adverse media, sanctions update); never skip the rating step.', doctrineAnchor: 'FATF R.10 INR.10' },
  { id: 'cs_cdd_04', topic: 'cdd', rule: 'Capture purpose-and-intended-nature of relationship in the customer\'s own words; vague answers ("personal use", "business") trigger follow-up.', doctrineAnchor: 'FATF R.10' },
  { id: 'cs_cdd_05', topic: 'cdd', rule: 'No transactions before CDD is complete except where strictly necessary not to interrupt normal business and only with managed risk controls.', doctrineAnchor: 'FATF R.10 INR.10(a)' },

  // ── EDD ────────────────────────────────────────────────────────────────
  { id: 'cs_edd_01', topic: 'edd', rule: 'EDD is mandatory for high-risk customers, PEPs, complex/unusual transactions, and CAHRA-domiciled relationships — not optional even with senior approval.', doctrineAnchor: 'FATF R.10 INR.10(b), R.12, R.19' },
  { id: 'cs_edd_02', topic: 'edd', rule: 'Source-of-wealth and source-of-funds must be evidenced (bank statements, sale deed, tax filing, employment contract) — verbal declarations alone are insufficient.', doctrineAnchor: 'FATF R.12 INR.12' },
  { id: 'cs_edd_03', topic: 'edd', rule: 'Senior-management approval (not branch manager) is required to establish or continue any high-risk business relationship.', doctrineAnchor: 'FATF R.12, FDL No.10/2025 Art.10' },
  { id: 'cs_edd_04', topic: 'edd', rule: 'Apply enhanced ongoing monitoring with shorter review cycles (max 12 months for high-risk; quarterly for PEP) and tighter alert thresholds.', doctrineAnchor: 'FATF R.10 INR.10(d)' },
  { id: 'cs_edd_05', topic: 'edd', rule: 'EDD findings must be documented in a memo signed by the MLRO, retained for 5 years, and reviewable on FIU request.', doctrineAnchor: 'FATF R.11; UAE FDL No.10/2025 Art.16' },

  // ── Ongoing monitoring ────────────────────────────────────────────────
  { id: 'cs_om_01', topic: 'ongoing_monitoring', rule: 'Transaction monitoring must compare actual against expected behaviour; rules-only systems without anomaly detection are insufficient at scale.', doctrineAnchor: 'FATF R.10 INR.10(d)' },
  { id: 'cs_om_02', topic: 'ongoing_monitoring', rule: 'Periodic review cadence: low risk every 36 months, medium 24, high 12, PEP 12 (or sooner on triggers).', doctrineAnchor: 'Wolfsberg AML Principles' },
  { id: 'cs_om_03', topic: 'ongoing_monitoring', rule: 'Re-screen the entire customer book whenever a sanctions list updates — partial / sample re-screens are non-compliant.', doctrineAnchor: 'UAE Cabinet Decision 74/2020' },
  { id: 'cs_om_04', topic: 'ongoing_monitoring', rule: 'Alerts must be triaged within 7 days; backlog beyond 30 days must be escalated to the MLRO and reported to the Board.', doctrineAnchor: 'FATF R.20 INR.20' },
  { id: 'cs_om_05', topic: 'ongoing_monitoring', rule: 'Document the disposition of every alert (cleared, escalated, filed) with a written rationale; "false positive" alone is not a rationale.', doctrineAnchor: 'FATF R.11' },

  // ── Source of funds ───────────────────────────────────────────────────
  { id: 'cs_sof_01', topic: 'source_of_funds', rule: 'Source-of-funds covers the immediate origin of the specific transaction (bank withdrawal, salary, asset sale); evidence must match value and timing.', doctrineAnchor: 'Wolfsberg SoW/SoF FAQ' },
  { id: 'cs_sof_02', topic: 'source_of_funds', rule: 'Cash deposits ≥ AED 55,000 require source-of-funds documentation regardless of customer risk rating.', doctrineAnchor: 'UAE Cabinet Decision 10/2019' },
  { id: 'cs_sof_03', topic: 'source_of_funds', rule: 'Third-party funding triggers EDD: confirm legitimate relationship, verify the third party, and document the rationale.', doctrineAnchor: 'FATF R.10 INR.10' },
  { id: 'cs_sof_04', topic: 'source_of_funds', rule: 'Crypto-funded fiat transactions require chain analysis attestation showing no exposure to mixers, sanctioned addresses, or known scams.', doctrineAnchor: 'FATF R.15 + Travel-Rule guidance' },
  { id: 'cs_sof_05', topic: 'source_of_funds', rule: 'Inheritance, gift, and lottery wins must be evidenced by court orders, gift declarations, or lottery payout confirmations — verbal narrative alone fails EDD.', doctrineAnchor: 'Wolfsberg SoW/SoF FAQ' },

  // ── Source of wealth ──────────────────────────────────────────────────
  { id: 'cs_sow_01', topic: 'source_of_wealth', rule: 'Source-of-wealth is the cumulative legitimate wealth-creation story — career, business sale, inheritance, investments — over the customer\'s economic lifetime.', doctrineAnchor: 'Wolfsberg SoW/SoF FAQ' },
  { id: 'cs_sow_02', topic: 'source_of_wealth', rule: 'For HNWI / PEP / high-risk: corroborate at least two independent SoW sources (audited financials, tax returns, public registries).', doctrineAnchor: 'FATF R.12' },
  { id: 'cs_sow_03', topic: 'source_of_wealth', rule: 'Wealth disproportionate to declared occupation or known earnings history is itself a red flag — quantify and document the gap.', doctrineAnchor: 'FATF R.10 INR.10(c)' },
  { id: 'cs_sow_04', topic: 'source_of_wealth', rule: 'PEP wealth tied to public office requires kleptocracy screening (StAR, OCCRP, ICIJ leaks) before relationship establishment.', doctrineAnchor: 'StAR Initiative; FATF R.12' },
  { id: 'cs_sow_05', topic: 'source_of_wealth', rule: 'Do not accept "private" or "confidential" as a SoW reason; if a customer cannot evidence wealth origin lawfully, decline the relationship.', doctrineAnchor: 'Wolfsberg AML Principles' },

  // ── Beneficial ownership ──────────────────────────────────────────────
  { id: 'cs_bo_01', topic: 'beneficial_ownership', rule: 'Identify natural persons who ultimately own or control ≥25% of voting rights, equity, or exercise effective control through other means.', doctrineAnchor: 'FATF R.24, R.25; UAE Cabinet Resolution 58/2020' },
  { id: 'cs_bo_02', topic: 'beneficial_ownership', rule: 'Where no natural person meets the threshold, document senior managing official as the BO of last resort — never leave the field blank.', doctrineAnchor: 'EU AMLD 4/5 Art.3(6); UAE CR 58/2020' },
  { id: 'cs_bo_03', topic: 'beneficial_ownership', rule: 'Trusts: identify settlor, trustee, protector, beneficiaries (named and class), and any natural person exercising effective control.', doctrineAnchor: 'FATF R.25 INR.25' },
  { id: 'cs_bo_04', topic: 'beneficial_ownership', rule: 'Verify BO with primary documents (passport, registry extract); rely on customer self-declaration only for low-risk legal persons and corroborate independently.', doctrineAnchor: 'FATF R.10 INR.10(b)' },
  { id: 'cs_bo_05', topic: 'beneficial_ownership', rule: 'BO data must be filed with the UBO registry within 15 days of change; failure is a strict-liability offence under FDL 10/2025.', doctrineAnchor: 'UAE FDL 10/2025 Art.18' },

  // ── PEP handling ──────────────────────────────────────────────────────
  { id: 'cs_pep_01', topic: 'pep_handling', rule: 'PEP determination uses the FATF four-tier framework: foreign / domestic / international-organisation / RCA — domestic PEPs require risk-based EDD, not blanket EDD.', doctrineAnchor: 'FATF R.12 INR.12; UAE Cabinet Decision 10/2019' },
  { id: 'cs_pep_02', topic: 'pep_handling', rule: 'Once PEP, always-PEP for foreign PEPs: continuing-influence test must justify any step-down, not just time-since-office.', doctrineAnchor: 'FATF R.12 INR.12(d)' },
  { id: 'cs_pep_03', topic: 'pep_handling', rule: 'Senior-management approval is mandatory before establishing or continuing a foreign PEP relationship — not the branch manager, not the relationship manager.', doctrineAnchor: 'FATF R.12 INR.12(b)' },
  { id: 'cs_pep_04', topic: 'pep_handling', rule: 'Take reasonable measures to establish source of wealth and source of funds for PEP, family members, and close associates.', doctrineAnchor: 'FATF R.12 INR.12(b)(c)' },
  { id: 'cs_pep_05', topic: 'pep_handling', rule: 'Conduct enhanced ongoing monitoring on PEP relationships: tighter thresholds, lower aggregation triggers, quarterly file review.', doctrineAnchor: 'FATF R.12 INR.12(d)' },

  // ── PEP RCA ───────────────────────────────────────────────────────────
  { id: 'cs_rca_01', topic: 'pep_rca', rule: 'RCA scope: spouse(s), parents, children, siblings, and any natural person identified as a known close business associate or close personal associate.', doctrineAnchor: 'FATF Glossary' },
  { id: 'cs_rca_02', topic: 'pep_rca', rule: 'RCA risk inheritance is the default; rebut only with documented economic and legal independence from the connected PEP.', doctrineAnchor: 'Wolfsberg PEP Guidance' },
  { id: 'cs_rca_03', topic: 'pep_rca', rule: 'Map RCA via public records, leaks (Pandora/Panama/Paradise/OCCRP), corporate-registry shared directorships, and customer disclosure.', doctrineAnchor: 'FATF R.12; OCCRP investigative methodology' },
  { id: 'cs_rca_04', topic: 'pep_rca', rule: 'When PEP steps down, re-evaluate RCA risk; do not auto-step-down RCAs without continuing-influence test.', doctrineAnchor: 'FATF R.12 INR.12(d)' },
  { id: 'cs_rca_05', topic: 'pep_rca', rule: 'RCA designation propagates: family-of-RCA who is also family-of-PEP is treated as RCA, not lower-tier.', doctrineAnchor: 'Wolfsberg PEP Guidance' },

  // ── Sanctions screening ───────────────────────────────────────────────
  { id: 'cs_sanc_01', topic: 'sanctions_screening', rule: 'Screen at onboarding, on every transaction, and on every sanctions-list update; partial sweeps are non-compliant under UAE TFS regime.', doctrineAnchor: 'UAE Cabinet Decision 74/2020' },
  { id: 'cs_sanc_02', topic: 'sanctions_screening', rule: 'Screen against UN Consolidated, OFAC SDN, EU Consolidated, UK OFSI, and UAE EOCN at minimum; add jurisdiction-specific lists where exposed.', doctrineAnchor: 'UNSCR 1267/1988; UAE CD 74/2020' },
  { id: 'cs_sanc_03', topic: 'sanctions_screening', rule: 'Apply the OFAC 50%-Rule: aggregate ownership across multiple SDNs in the same entity counts; Russia/EU sectoral controls have different mechanics.', doctrineAnchor: 'OFAC FAQ 401; EU Reg 269/2014, 833/2014' },
  { id: 'cs_sanc_04', topic: 'sanctions_screening', rule: 'On a possible match: freeze + notify regulator within 24 hours under FDL No.10/2025; do NOT tip off the customer.', doctrineAnchor: 'UAE FDL No.10/2025 Art.22; UAE CD 74/2020' },
  { id: 'cs_sanc_05', topic: 'sanctions_screening', rule: 'False-positive disposition requires documented match-key analysis (DOB, ID, nationality) and second-pair-of-eyes review.', doctrineAnchor: 'Wolfsberg Sanctions Screening Guidance' },

  // ── Adverse media ─────────────────────────────────────────────────────
  { id: 'cs_am_01', topic: 'adverse_media', rule: 'Distinguish allegation, charge, and conviction; weight each accordingly — never auto-block on a single arrest article.', doctrineAnchor: 'FATF Methodology IO.4' },
  { id: 'cs_am_02', topic: 'adverse_media', rule: 'Triangulate at least two independent reputable sources before treating an adverse-media hit as material; aggregator restatements do not count.', doctrineAnchor: 'OECD media-reliability guidance' },
  { id: 'cs_am_03', topic: 'adverse_media', rule: 'Multilingual sweeps in subject\'s nationality / operating-geography languages are mandatory for high-risk customers.', doctrineAnchor: 'Wolfsberg AML Principles' },
  { id: 'cs_am_04', topic: 'adverse_media', rule: 'Refresh adverse-media on cycle aligned to risk rating: 90 days for high-risk, 12 months for low; sooner on triggers.', doctrineAnchor: 'FATF R.10 INR.10(d)' },
  { id: 'cs_am_05', topic: 'adverse_media', rule: 'Document MLRO disposition for every material adverse-media hit (clear / EDD / decline / exit) with rationale and sources cited.', doctrineAnchor: 'FATF R.11' },

  // ── STR / SAR filing ──────────────────────────────────────────────────
  { id: 'cs_str_01', topic: 'str_sar_filing', rule: 'STR filing duty triggers on reasonable suspicion of ML/TF — not certainty, not "proof beyond doubt"; under-filing breaches FDL No.10/2025 Art.16.', doctrineAnchor: 'UAE FDL No.10/2025 Art.16; FATF R.20' },
  { id: 'cs_str_02', topic: 'str_sar_filing', rule: 'File via goAML within the regulator\'s window (UAE: without delay; some jurisdictions: 35 calendar days max). Document the trigger date.', doctrineAnchor: 'UAE FDL 10/2025 Art.26-27' },
  { id: 'cs_str_03', topic: 'str_sar_filing', rule: 'STRs are fact-only: dates, transactions, parties, indicators. No legal conclusions, no ethical labels, no allegation-to-finding upgrades.', doctrineAnchor: 'UAE FIU goAML Filing Manual' },
  { id: 'cs_str_04', topic: 'str_sar_filing', rule: 'STR drafting must be by trained personnel, MLRO-reviewed, and four-eyes signed off before submission.', doctrineAnchor: 'FATF R.18' },
  { id: 'cs_str_05', topic: 'str_sar_filing', rule: 'Continuing-activity STRs every 90 days while the relationship and suspicion persist; do not file once and forget.', doctrineAnchor: 'FATF R.20 INR.20' },

  // ── Recordkeeping ─────────────────────────────────────────────────────
  { id: 'cs_rk_01', topic: 'recordkeeping', rule: 'Retain CDD, transaction, and STR records for 5 years from end-of-relationship or transaction date — UAE extends to 10 years for some categories.', doctrineAnchor: 'UAE FDL No.10/2025 Art.19; UAE FDL 10/2025' },
  { id: 'cs_rk_02', topic: 'recordkeeping', rule: 'Records must reconstruct the transaction sufficiently to support investigation; partial records (no narrative, no parties) are non-compliant.', doctrineAnchor: 'FATF R.11' },
  { id: 'cs_rk_03', topic: 'recordkeeping', rule: 'STR records and ancillary investigation files retain even longer (10 years) and survive customer-exit, GDPR-erasure requests, and migration.', doctrineAnchor: 'GDPR Art.17(3)(b); UAE PDPL FDL 45/2021' },
  { id: 'cs_rk_04', topic: 'recordkeeping', rule: 'Electronic recordkeeping must support legal admissibility: tamper-evidence, access audit trail, integrity hash.', doctrineAnchor: 'ISO 15489; UAE Cabinet Resolution 16/2021' },
  { id: 'cs_rk_05', topic: 'recordkeeping', rule: 'Record-destruction outside the retention window is itself a compliance event — document the disposal authorisation and method.', doctrineAnchor: 'UAE FDL 10/2025 retention rules' },

  // ── Training ──────────────────────────────────────────────────────────
  { id: 'cs_tr_01', topic: 'training', rule: 'AML training is mandatory at onboarding and at least annually; role-specific (front office, ops, compliance) — generic training is insufficient.', doctrineAnchor: 'FATF R.18; UAE FDL No.10/2025 Art.16' },
  { id: 'cs_tr_02', topic: 'training', rule: 'Track training completion and assessment scores; non-completion is a personal compliance breach for the employee and a control failure for the firm.', doctrineAnchor: 'FATF R.18' },
  { id: 'cs_tr_03', topic: 'training', rule: 'Refresh training when laws change (e.g. UAE FDL 10/2025) within 60 days; new-regulation knowledge cannot wait for the annual cycle.', doctrineAnchor: 'UAE MoE DNFBP Circular 4/2025' },
  { id: 'cs_tr_04', topic: 'training', rule: 'Senior management and Board members require dedicated AML training tailored to oversight responsibilities — operational training does not satisfy.', doctrineAnchor: 'FATF R.18; Wolfsberg AML Principles' },
  { id: 'cs_tr_05', topic: 'training', rule: 'Record case studies, typology updates, and red-flag refreshers; abstract regulatory training without typology examples fails FATF effectiveness assessment.', doctrineAnchor: 'FATF Methodology IO.4' },

  // ── Governance ────────────────────────────────────────────────────────
  { id: 'cs_gov_01', topic: 'governance', rule: 'AML governance follows the three lines of defence: business owns risk, compliance/MLRO oversees, internal audit assures — never collapse two into one.', doctrineAnchor: 'IIA Three Lines Model 2020' },
  { id: 'cs_gov_02', topic: 'governance', rule: 'MLRO must report independently to the Board (or Audit Committee) at least quarterly; reporting via the CEO is a structural conflict.', doctrineAnchor: 'FATF R.18; UAE FDL No.10/2025 Art.16' },
  { id: 'cs_gov_03', topic: 'governance', rule: 'Approve AML policy at Board level annually; updates in-cycle for material regulatory change must be Board-noted within 60 days.', doctrineAnchor: 'COSO ERM 2017' },
  { id: 'cs_gov_04', topic: 'governance', rule: 'Key Risk Indicators must be reported to the Board with thresholds and trend analysis; raw counts without context are not governance-grade reporting.', doctrineAnchor: 'ISO 31000; COSO ERM' },
  { id: 'cs_gov_05', topic: 'governance', rule: 'Policy exceptions are themselves a control point: log every exception, name the approver, set a sunset, and report frequency to the Board.', doctrineAnchor: 'Wolfsberg AML Principles' },

  // ── Four eyes ─────────────────────────────────────────────────────────
  { id: 'cs_4e_01', topic: 'four_eyes', rule: 'High-risk decisions (PEP onboarding, sanctions disposition, STR filing, customer exit) require two-person independent review — same person for both fails the test.', doctrineAnchor: 'Wolfsberg AML Principles' },
  { id: 'cs_4e_02', topic: 'four_eyes', rule: 'Maker-checker controls extend to system permissions: maker cannot approve their own request, checker cannot edit and approve.', doctrineAnchor: 'COSO Control Activities' },
  { id: 'cs_4e_03', topic: 'four_eyes', rule: 'For sanctions or terrorist-financing dispositions, the second pair of eyes must be MLRO or delegate — not a peer relationship manager.', doctrineAnchor: 'UAE Cabinet Decision 74/2020' },
  { id: 'cs_4e_04', topic: 'four_eyes', rule: 'Document both reviewers, time-stamp the decision, and retain the decision pack — verbal sign-off without record breaks the audit trail.', doctrineAnchor: 'FATF R.11' },
  { id: 'cs_4e_05', topic: 'four_eyes', rule: 'Bypassing four-eyes under "urgency" or "system unavailable" is a hard-stop violation; create a manual override log and Board-report any uses.', doctrineAnchor: 'Wolfsberg AML Principles' },

  // ── Correspondent banking ─────────────────────────────────────────────
  { id: 'cs_cb_01', topic: 'correspondent_banking', rule: 'Apply Wolfsberg Correspondent Banking Due Diligence Questionnaire (CBDDQ) at onboarding and every 24 months thereafter.', doctrineAnchor: 'Wolfsberg Correspondent Banking Principles' },
  { id: 'cs_cb_02', topic: 'correspondent_banking', rule: 'No nested / payable-through accounts where the respondent bank cannot evidence its own KYC controls.', doctrineAnchor: 'FATF R.13 INR.13' },
  { id: 'cs_cb_03', topic: 'correspondent_banking', rule: 'Shell-bank correspondents are prohibited; respondent must have a physical presence and meaningful management in its licensing jurisdiction.', doctrineAnchor: 'FATF R.13 INR.13(c)' },
  { id: 'cs_cb_04', topic: 'correspondent_banking', rule: 'Risk-tier respondent banks (high/medium/low) and apply EDD to high-risk; revisit on adverse media, sanctions update, or supervisor enforcement event.', doctrineAnchor: 'Wolfsberg CB Principles' },
  { id: 'cs_cb_05', topic: 'correspondent_banking', rule: 'Senior-management approval is required at onboarding and on adverse-event review — not a correspondent-relations team decision.', doctrineAnchor: 'FATF R.13 INR.13(b)' },

  // ── VASP / crypto ─────────────────────────────────────────────────────
  { id: 'cs_vasp_01', topic: 'vasp_crypto', rule: 'Apply FATF Travel Rule to virtual-asset transfers ≥ USD/EUR 1,000: originator + beneficiary identifying data must accompany the transfer.', doctrineAnchor: 'FATF R.16 INR.16; UAE VARA / SCA rulebook' },
  { id: 'cs_vasp_02', topic: 'vasp_crypto', rule: 'On-chain analytics (TRM/Chainalysis/Elliptic) must screen counterparty wallets for sanctioned, mixer, or scam exposure before deposit credit.', doctrineAnchor: 'FATF R.15 INR.15' },
  { id: 'cs_vasp_03', topic: 'vasp_crypto', rule: 'Self-hosted (unhosted) wallet transactions require enhanced due diligence and customer attestation of the wallet\'s control.', doctrineAnchor: 'FATF Updated R.16 Guidance 2021' },
  { id: 'cs_vasp_04', topic: 'vasp_crypto', rule: 'Privacy-coin (Monero, Zcash) deposits require enhanced source-of-funds; default bias is to refuse without compelling evidence.', doctrineAnchor: 'FATF R.15; Wolfsberg Crypto Principles' },
  { id: 'cs_vasp_05', topic: 'vasp_crypto', rule: 'Mixer / tumbler exposure (Tornado Cash, Sinbad, Wasabi CoinJoin) must be flagged at hop-depth 3; designated mixers require automatic block.', doctrineAnchor: 'OFAC SDN designations 2022-2024' },

  // ── DPMS / precious metals ────────────────────────────────────────────
  { id: 'cs_dpms_01', topic: 'dpms_precious_metals', rule: 'DNFBP DPMS entities must register with the MoE supervisor and file annual EOCN return covering all qualifying cash transactions.', doctrineAnchor: 'UAE Cabinet Resolution 10/2019; UAE MoE DPMS Circulars' },
  { id: 'cs_dpms_02', topic: 'dpms_precious_metals', rule: 'Cash transactions ≥ AED 55,000 (single or linked) trigger CDD + STR review and goAML reporting per Cabinet Decision 10/2019.', doctrineAnchor: 'UAE Cabinet Decision 10/2019' },
  { id: 'cs_dpms_03', topic: 'dpms_precious_metals', rule: 'Apply LBMA Responsible Gold Guidance Step-by-Step to upstream supply (mine, refinery, intermediate); CAHRA-origin requires OECD DDG Annex II.', doctrineAnchor: 'LBMA RGG; OECD DDG Annex II' },
  { id: 'cs_dpms_04', topic: 'dpms_precious_metals', rule: 'Maintain Kimberley Process certificates for diamonds; mismatch between certificate, customs, and invoice is an STR trigger.', doctrineAnchor: 'KPCS UAE Office; FATF R.20' },
  { id: 'cs_dpms_05', topic: 'dpms_precious_metals', rule: 'Annual public report on supply-chain due diligence is mandatory; non-publication is a strict-liability breach under DPMS Circulars.', doctrineAnchor: 'UAE MoE DPMS Annual Report Circular' },

  // ── Trade-based ML ────────────────────────────────────────────────────
  { id: 'cs_tbml_01', topic: 'trade_based_ml', rule: 'Compare invoice unit price against authoritative reference (LBMA, LME, MSRP); over-/under-invoicing > 15% is a TBML red flag requiring rationale.', doctrineAnchor: 'FATF TBML Typologies 2006/2020' },
  { id: 'cs_tbml_02', topic: 'trade_based_ml', rule: 'Verify physical shipment via independent surveyor or BL/AWB authentication; invoices without physical-goods evidence are presumptive phantom shipments.', doctrineAnchor: 'FATF R.20; ICC IBPP' },
  { id: 'cs_tbml_03', topic: 'trade_based_ml', rule: 'Routing through high-risk hubs (free zones, transshipment) without commercial rationale is a TBML pattern requiring senior review.', doctrineAnchor: 'FATF Free-Trade-Zone Vulnerabilities Report' },
  { id: 'cs_tbml_04', topic: 'trade_based_ml', rule: 'Third-party payments (buyer-of-record ≠ payer) without documented commercial linkage require BMPE / hawala typology screen.', doctrineAnchor: 'FinCEN FIN-2014-A005' },
  { id: 'cs_tbml_05', topic: 'trade_based_ml', rule: 'Circular trade (A→B→C→A) with no apparent economic purpose is the canonical TBML/sanctions-evasion fingerprint; file STR and exit by default.', doctrineAnchor: 'FATF TBML Typologies' },

  // ── Structuring ───────────────────────────────────────────────────────
  { id: 'cs_str2_01', topic: 'structuring', rule: 'Aggregate cash transactions across linked customers, accounts, branches, and time windows (rolling 7/30/90 days) — single-account view is non-compliant.', doctrineAnchor: 'FATF R.20; FinCEN structuring guidance' },
  { id: 'cs_str2_02', topic: 'structuring', rule: 'Pattern of deposits clustered just below CTR / cash thresholds is structuring per se — file STR; do not request the customer "explain".', doctrineAnchor: 'UAE Cabinet Decision 10/2019' },
  { id: 'cs_str2_03', topic: 'structuring', rule: 'Smurfing: multiple low-tier customers funding one consolidator account triggers network analysis and STR on all participants.', doctrineAnchor: 'FATF Methodology IO.4' },
  { id: 'cs_str2_04', topic: 'structuring', rule: 'Cuckoo smurfing: legitimate beneficiary expecting wire receives offsetting cash deposits — verify originator and freeze pending check.', doctrineAnchor: 'FATF Cuckoo Smurfing Typology' },
  { id: 'cs_str2_05', topic: 'structuring', rule: 'Threshold-avoidance behaviour persists despite RFI → relationship exit + STR; do not "explain" the threshold to the customer.', doctrineAnchor: 'UAE FDL No.10/2025 Art.16' },

  // ── NPO risk ──────────────────────────────────────────────────────────
  { id: 'cs_npo_01', topic: 'npo_risk', rule: 'NPO sector requires risk-based oversight per FATF R.8 — not blanket EDD on all charities, but targeted on high-risk segments.', doctrineAnchor: 'FATF R.8 INR.8' },
  { id: 'cs_npo_02', topic: 'npo_risk', rule: 'Cross-border NPO disbursements to conflict zones / CAHRA require enhanced beneficiary diligence and outcome documentation.', doctrineAnchor: 'FATF R.8; UNSCR 2462' },
  { id: 'cs_npo_03', topic: 'npo_risk', rule: 'NPO fundraising via cash and crypto without identifying donors above threshold is a TF vulnerability — apply CDD on large or recurring donors.', doctrineAnchor: 'FATF R.8 INR.8(b)' },
  { id: 'cs_npo_04', topic: 'npo_risk', rule: 'Verify NPO governance: registered status, audited financials, board independence, programme delivery evidence.', doctrineAnchor: 'FATF R.8; UAE FANR/CDA NPO supervision' },
  { id: 'cs_npo_05', topic: 'npo_risk', rule: 'Adverse media on NPO leadership or beneficiaries (TF designations, embezzlement) triggers immediate disposition review and freeze if necessary.', doctrineAnchor: 'FATF R.6; UNSCR 1267' },

  // ── Shell company ─────────────────────────────────────────────────────
  { id: 'cs_shell_01', topic: 'shell_company', rule: 'Shell-company indicators: no employees, registered-agent address, no fixed assets, single-customer revenue. Two or more = EDD trigger.', doctrineAnchor: 'FATF R.24, R.25; OCCRP shell typology' },
  { id: 'cs_shell_02', topic: 'shell_company', rule: 'Common indicators across linked entities (shared director, address, payment patterns) require corporate-network mapping and UBO consolidation.', doctrineAnchor: 'OFAC FAQ 401; OCCRP methodology' },
  { id: 'cs_shell_03', topic: 'shell_company', rule: 'Substance-test the shell: physical office, employees, revenue model, banking relationship, customer contracts. No substance = exit.', doctrineAnchor: 'OECD BEPS Action 5; substance requirements' },
  { id: 'cs_shell_04', topic: 'shell_company', rule: 'Shell entities are sanctions-evasion vehicles; apply OFAC 50%-Rule cascade across the network, not entity-by-entity.', doctrineAnchor: 'OFAC FAQ 401' },
  { id: 'cs_shell_05', topic: 'shell_company', rule: 'When in doubt, apply the principle: "shell unless proven substantive" — burden of proof is on the customer, not the bank.', doctrineAnchor: 'Wolfsberg AML Principles' },

  // ── Proliferation financing ───────────────────────────────────────────
  { id: 'cs_pf_01', topic: 'proliferation_financing', rule: 'Identify dual-use goods via EU Annex I / WA / NSG / AG / MTCR control lists; HS-code mapping alone is insufficient.', doctrineAnchor: 'FATF R.7; UNSCR 1540, 2231, 1718' },
  { id: 'cs_pf_02', topic: 'proliferation_financing', rule: 'End-user certificates must be authenticated against issuing-authority records; template tampering, font mismatch, altered seal = refuse.', doctrineAnchor: 'FATF R.7; ECA-J / Wassenaar Arrangement' },
  { id: 'cs_pf_03', topic: 'proliferation_financing', rule: 'Iran / DPRK nexus screening covers IRISL, NIOC, NITC, IRGC and Lazarus Group; trade through third countries does not avoid PF risk.', doctrineAnchor: 'UNSCR 1718, 2231; UN Panel of Experts annual reports' },
  { id: 'cs_pf_04', topic: 'proliferation_financing', rule: 'Apply targeted financial sanctions for PF: freeze without delay on UNSC 1540/1718/2231 designations and notify regulator within 24 hours.', doctrineAnchor: 'UAE Cabinet Decision 74/2020; FATF R.7' },
  { id: 'cs_pf_05', topic: 'proliferation_financing', rule: 'Catch-all controls: items capable of military / WMD end-use require licence even if not on a control list.', doctrineAnchor: 'EU dual-use Reg 2021/821; UAE Federal Decree-Law 13/2007' },

  // ── CAHRA jurisdiction ────────────────────────────────────────────────
  { id: 'cs_cahra_01', topic: 'cahra_jurisdiction', rule: 'CAHRA-domiciled relationships always require EDD, regardless of customer-risk score — UAE alignment with OECD CAHRA list.', doctrineAnchor: 'OECD DDG Annex II; UAE MoE DPMS Circular' },
  { id: 'cs_cahra_02', topic: 'cahra_jurisdiction', rule: 'Supply-chain due diligence for minerals, gold, gemstones from CAHRA must follow OECD DDG five-step methodology and document each step.', doctrineAnchor: 'OECD DDG Annex II; LBMA RGG' },
  { id: 'cs_cahra_03', topic: 'cahra_jurisdiction', rule: 'Trade or finance routed via CAHRA without commercial substance is a sanctions-evasion / armed-group-financing red flag — exit by default.', doctrineAnchor: 'FATF R.7; OECD DDG' },
  { id: 'cs_cahra_04', topic: 'cahra_jurisdiction', rule: 'Annual public report on CAHRA-related due diligence is mandatory under MoE DPMS Circulars; align disclosure with OECD DDG Annex II reporting framework.', doctrineAnchor: 'UAE MoE DPMS; OECD DDG' },
  { id: 'cs_cahra_05', topic: 'cahra_jurisdiction', rule: 'CAHRA classification updates dynamically; align internal CAHRA list with OECD updates, USAID / UN / WPS data quarterly.', doctrineAnchor: 'OECD CAHRA portal; UN Security Council reporting' },

  // ── Risk appetite ─────────────────────────────────────────────────────
  { id: 'cs_ra_01', topic: 'risk_appetite', rule: 'Risk appetite must be Board-approved, quantified per customer / product / geography segment, and reviewed annually.', doctrineAnchor: 'COSO ERM 2017; ISO 31000' },
  { id: 'cs_ra_02', topic: 'risk_appetite', rule: 'Out-of-appetite relationships require explicit documented Board or delegated-committee approval — never line-management exception.', doctrineAnchor: 'COSO ERM 2017' },
  { id: 'cs_ra_03', topic: 'risk_appetite', rule: 'Track residual risk vs appetite by segment; persistent breach triggers de-risking plan or appetite recalibration with rationale.', doctrineAnchor: 'ISO 31000; FATF R.1 INR.1' },
  { id: 'cs_ra_04', topic: 'risk_appetite', rule: 'Appetite for sanctions and TF risk is structurally zero; "low" appetite is non-compliant — these risks must be eliminated, not tolerated.', doctrineAnchor: 'FDL No.10/2025; UNSCR 1267' },
  { id: 'cs_ra_05', topic: 'risk_appetite', rule: 'KRI breaches are reported to the Board within the cycle they occur; "wait for the next quarterly report" is not adequate governance.', doctrineAnchor: 'COSO ERM 2017' },

  // ── Tipping-off guard ─────────────────────────────────────────────────
  { id: 'cs_to_01', topic: 'tipping_off_guard', rule: 'Tipping-off prohibition covers any communication that could alert the subject to an investigation or STR — direct, indirect, or by inference.', doctrineAnchor: 'UAE FDL No.10/2025 Art.25; FATF R.21' },
  { id: 'cs_to_02', topic: 'tipping_off_guard', rule: 'Customer requests for KYC documents during an active STR must use neutral language — no implication of investigation, no acknowledgement.', doctrineAnchor: 'UAE FDL No.10/2025 Art.25' },
  { id: 'cs_to_03', topic: 'tipping_off_guard', rule: 'Account closure rationale during an active STR is "commercial reasons" — never "we cannot continue due to compliance concerns".', doctrineAnchor: 'UAE FIU goAML guidance' },
  { id: 'cs_to_04', topic: 'tipping_off_guard', rule: 'Internal disclosure of STR is on a strict need-to-know basis; relationship managers, frontline, and operations staff outside the loop.', doctrineAnchor: 'FATF R.21; Wolfsberg AML Principles' },
  { id: 'cs_to_05', topic: 'tipping_off_guard', rule: 'External professional advice (legal, audit) requires legally-privileged channels; ad-hoc consultations risk inadvertent tipping-off.', doctrineAnchor: 'UAE FDL No.10/2025 Art.25' },

  // ── Regulatory reporting ──────────────────────────────────────────────
  { id: 'cs_reg_01', topic: 'regulatory_reporting', rule: 'goAML STRs, EOCN annual return, sanctions blocking reports, and Board AML reports each have distinct windows — track separately.', doctrineAnchor: 'UAE FDL 10/2025; CD 74/2020; CD 10/2019' },
  { id: 'cs_reg_02', topic: 'regulatory_reporting', rule: 'FIU information requests (RFIs) must be answered within the stated window; non-response is a strict-liability breach.', doctrineAnchor: 'UAE FDL No.10/2025 Art.16; FATF R.29' },
  { id: 'cs_reg_03', topic: 'regulatory_reporting', rule: 'Cross-border transmission of regulatory reports requires authorised channel (Egmont, MLAT, MoU); informal sharing breaches data-protection law.', doctrineAnchor: 'Egmont Group; UAE PDPL FDL 45/2021' },
  { id: 'cs_reg_04', topic: 'regulatory_reporting', rule: 'Maintain a regulatory-correspondence log with traceable acknowledgements; lost or unacknowledged filings expose the firm to enforcement.', doctrineAnchor: 'FATF R.11; UAE MoE DNFBP supervision' },
  { id: 'cs_reg_05', topic: 'regulatory_reporting', rule: 'Material errors in prior filings require corrective filing within the FIU window — concealment compounds the original breach.', doctrineAnchor: 'UAE FIU goAML Filing Manual' },

  // ── Audit / examination ───────────────────────────────────────────────
  { id: 'cs_aud_01', topic: 'audit_examination', rule: 'Independent AML audit at least every 24 months; high-risk firms annually. Internal audit must be independent of MLRO and compliance.', doctrineAnchor: 'FATF R.18; UAE FDL No.10/2025 Art.16' },
  { id: 'cs_aud_02', topic: 'audit_examination', rule: 'Regulatory examination preparation: maintain CDD, transaction, STR, and training files in audit-ready form at all times — not assembled on examiner request.', doctrineAnchor: 'FATF Methodology IO.4' },
  { id: 'cs_aud_03', topic: 'audit_examination', rule: 'Audit findings tracker: every finding has owner, deadline, action, and verification step. Closed-without-evidence is a finding in itself.', doctrineAnchor: 'IIA Standards 2017' },
  { id: 'cs_aud_04', topic: 'audit_examination', rule: 'Privileged information during examination requires legal-privilege handling protocol; default-share is a confidentiality breach.', doctrineAnchor: 'UAE PDPL FDL 45/2021; legal privilege doctrine' },
  { id: 'cs_aud_05', topic: 'audit_examination', rule: 'Post-examination remediation plan must be Board-noted, time-bound, and reported on progress at every Board meeting until closure.', doctrineAnchor: 'COSO ERM 2017; Board oversight standards' },

  // ── Typology research ────────────────────────────────────────────────
  { id: 'cs_typ_01', topic: 'typology_research', rule: 'Refresh internal typology library against FATF typologies report annually; align red-flag indicators with the latest report.', doctrineAnchor: 'FATF Annual Typologies Report' },
  { id: 'cs_typ_02', topic: 'typology_research', rule: 'Document typology deployment across detection rules, training, and case management; orphaned typologies (in policy, not in detection) are a control gap.', doctrineAnchor: 'FATF R.10 INR.10(d)' },
  { id: 'cs_typ_03', topic: 'typology_research', rule: 'New regional typologies (e.g. UAE-specific DPMS schemes) must be ingested via direct supervisor contact and Egmont channels.', doctrineAnchor: 'UAE FIU; Egmont Group' },
  { id: 'cs_typ_04', topic: 'typology_research', rule: 'Map each typology to predicate offences and FATF Recommendations; isolated typologies without R-mapping reduce to descriptive lore.', doctrineAnchor: 'FATF R.3 + Glossary' },
  { id: 'cs_typ_05', topic: 'typology_research', rule: 'Track emerging typologies (AI-enabled fraud, deep-fake KYC bypass, on-chain mixers) and refresh within one cycle of public reporting.', doctrineAnchor: 'FATF + INTERPOL emerging-threat reports' },

  // ── AI fraud ──────────────────────────────────────────────────────────
  { id: 'cs_aif_01', topic: 'ai_fraud', rule: 'Treat any unverified text-only customer instruction (email, chat, SMS) as potentially LLM-generated; require call-back to known number for high-value or beneficiary changes.', doctrineAnchor: 'NIST AI RMF Govern 2.1' },
  { id: 'cs_aif_02', topic: 'ai_fraud', rule: 'Voice authorisation alone is insufficient post 2024 — voice-clone tooling can replicate any sample over 3 seconds; require two-factor or biometric-on-device confirmation.', doctrineAnchor: 'FATF Emerging Threats Report 2024' },
  { id: 'cs_aif_03', topic: 'ai_fraud', rule: 'Flag customer disclosures referencing "AI advisor", "trading bot", or "guaranteed yield AI fund" — recurring pattern in pig-butchering and Ponzi typologies.', doctrineAnchor: 'FATF Pig-Butchering Typology 2023' },
  { id: 'cs_aif_04', topic: 'ai_fraud', rule: 'AI-generated KYC documents typically fail forensic checks (font kerning, metadata absence, header anomalies); train ops staff on detection and require document-forensics tool at onboarding.', doctrineAnchor: 'FATF Identity Guidance 2020' },
  { id: 'cs_aif_05', topic: 'ai_fraud', rule: 'Internal LLM tooling exposed to customer text is a prompt-injection target; sandbox model output, never auto-execute model-recommended actions on customer accounts.', doctrineAnchor: 'OWASP LLM Top 10 (LLM01 prompt injection)' },

  // ── Deepfake KYC ──────────────────────────────────────────────────────
  { id: 'cs_dfk_01', topic: 'deepfake_kyc', rule: 'Onboarding liveness must meet ISO/IEC 30107-3 Level 2 (PAD) at minimum; Level 1 is bypassable with consumer-grade deepfakes.', doctrineAnchor: 'ISO/IEC 30107-3' },
  { id: 'cs_dfk_02', topic: 'deepfake_kyc', rule: 'Inject randomised challenges (head turn, blink count, smile) into the liveness flow; static head-on capture is the canonical deepfake bypass.', doctrineAnchor: 'NIST FRTE/SP 800-63 IAL' },
  { id: 'cs_dfk_03', topic: 'deepfake_kyc', rule: 'Detect virtual-camera injection attacks at the device layer (driver-level enumeration, signed-attestation); browser-side detection alone is insufficient.', doctrineAnchor: 'FIDO Alliance Face Verification Certification' },
  { id: 'cs_dfk_04', topic: 'deepfake_kyc', rule: 'Confirmed deepfake KYC → file STR, retain biometric capture under legal hold, notify shared fraud bureau (HUNTER / SIRA), do not reuse the captured selfie elsewhere.', doctrineAnchor: 'UAE FDL No.10/2025 Art.16' },
  { id: 'cs_dfk_05', topic: 'deepfake_kyc', rule: 'Vendor PAD providers must publish FRR/FAR/APCER metrics from independent testing (NIST, iBeta) — internal claims alone do not satisfy regulator expectations.', doctrineAnchor: 'iBeta Level 2 PAD certification' },

  // ── Fintech BaaS ──────────────────────────────────────────────────────
  { id: 'cs_baas_01', topic: 'fintech_baas', rule: 'Sponsor bank retains end-customer AML responsibility regardless of program-manager arrangement — outsourcing programme operations does not outsource liability.', doctrineAnchor: 'FATF R.17 INR.17' },
  { id: 'cs_baas_02', topic: 'fintech_baas', rule: 'Define written allocation of CDD, monitoring, screening, and STR-filing responsibilities between sponsor and program manager; no gaps.', doctrineAnchor: 'EBA Outsourcing Guidelines EBA/GL/2019/02' },
  { id: 'cs_baas_03', topic: 'fintech_baas', rule: 'Concentration limits on sponsor exposure to any single program manager — programme failure must not collapse the sponsor\'s control framework.', doctrineAnchor: 'CBUAE Outsourcing Regulation' },
  { id: 'cs_baas_04', topic: 'fintech_baas', rule: 'Programme onboarding requires AML risk assessment, compliance-officer interview, sample CDD review, and right-to-audit clause in the contract.', doctrineAnchor: 'EBA Outsourcing Guidelines' },
  { id: 'cs_baas_05', topic: 'fintech_baas', rule: 'Maintain a programme-manager registry with kill-switch playbook; on AML control failure, suspend new account opening immediately and remediate before resumption.', doctrineAnchor: 'CBUAE BaaS supervisory guidance' },

  // ── Embedded finance ──────────────────────────────────────────────────
  { id: 'cs_ef_01', topic: 'embedded_finance', rule: 'In an embedded-payments flow, the regulated entity (payment licence holder) is responsible for KYC of the end-user; pass-through KYC chains must not break this chain.', doctrineAnchor: 'EU PSD2; UAE Payment Token Services Reg' },
  { id: 'cs_ef_02', topic: 'embedded_finance', rule: 'Platform-level merchant onboarding is not a substitute for end-user KYC where the end-user holds funds or initiates payments.', doctrineAnchor: 'FATF R.10' },
  { id: 'cs_ef_03', topic: 'embedded_finance', rule: 'Aggregated KYC under a platform umbrella requires explicit regulator approval; default position is per-end-user CDD.', doctrineAnchor: 'CBUAE Stored-Value Facilities Regulation' },
  { id: 'cs_ef_04', topic: 'embedded_finance', rule: 'Embedded lending (BNPL, point-of-sale finance) requires creditworthiness + AML check on the consumer; merchant KYC is insufficient.', doctrineAnchor: 'EU CCD 2008/48/EC; FATF R.10' },
  { id: 'cs_ef_05', topic: 'embedded_finance', rule: 'Document data-flow between platform, processor, and licensed entity; PDPL / GDPR compliance is the licensed entity\'s ultimate responsibility.', doctrineAnchor: 'UAE PDPL FDL 45/2021' },

  // ── AI governance ─────────────────────────────────────────────────────
  { id: 'cs_aig_01', topic: 'ai_governance', rule: 'AML decisioning models are "high-risk" under the EU AI Act — require risk management system, data governance, human oversight, transparency, and post-market monitoring.', doctrineAnchor: 'EU AI Act Art.6 + Annex III' },
  { id: 'cs_aig_02', topic: 'ai_governance', rule: 'Maintain a model card per AI/ML system: training data lineage, performance metrics, intended use, known limitations, governance owner.', doctrineAnchor: 'NIST AI RMF Govern 1.4' },
  { id: 'cs_aig_03', topic: 'ai_governance', rule: 'Drift monitoring required: PSI, KS-test, or equivalent on input features and outputs; deteriorating drift triggers retrain or rollback.', doctrineAnchor: 'NIST AI RMF Manage 4.1' },
  { id: 'cs_aig_04', topic: 'ai_governance', rule: 'Explainability is non-negotiable for adverse customer impact (account closure, screening hit confirmation); SHAP / LIME / counterfactual explanations must be retrievable on request.', doctrineAnchor: 'EU AI Act Art.13; OECD AI Principles' },
  { id: 'cs_aig_05', topic: 'ai_governance', rule: 'Use of a foundation model (LLM) for compliance decisions requires evaluation against the OWASP LLM Top 10, not just functional accuracy.', doctrineAnchor: 'OWASP LLM Top 10 v1.1' },

  // ── ESG / climate ─────────────────────────────────────────────────────
  { id: 'cs_esg_01', topic: 'esg_climate', rule: 'Greenwashing is increasingly an enforcement priority — verify ESG / sustainability claims against independent assurance (ISSB/ISAE 3000) before relying on them.', doctrineAnchor: 'ISSB IFRS S1/S2; SFDR' },
  { id: 'cs_esg_02', topic: 'esg_climate', rule: 'Carbon-credit counterparties require KYC on registry account, retirement-ledger access, and double-counting check (ICVCM CCP).', doctrineAnchor: 'ICVCM Core Carbon Principles' },
  { id: 'cs_esg_03', topic: 'esg_climate', rule: 'CSRD / CSDDD bring environmental & human-rights diligence into AML scope for in-scope groups; align ESG due diligence with AML R.10 EDD where possible.', doctrineAnchor: 'EU CSRD 2022/2464; CSDDD 2024/1760' },
  { id: 'cs_esg_04', topic: 'esg_climate', rule: 'Climate-related transition-risk customers (high-emission sectors) may face counterparty pressure and stranded-asset risk — factor into CRR refresh.', doctrineAnchor: 'TCFD; CBUAE Climate Risk Mgt Framework' },
  { id: 'cs_esg_05', topic: 'esg_climate', rule: 'Carbon-market fraud is a FATF-recognised typology — mismatched offsets, ghost projects, double issuance — apply environmental-crime predicate framing.', doctrineAnchor: 'FATF Environmental Crime Report 2021' },

  // ── Modern slavery ────────────────────────────────────────────────────
  { id: 'cs_ms_01', topic: 'modern_slavery', rule: 'Identify supply-chain forced-labour exposure via UFLPA rebuttable presumption (Xinjiang origin), ILO indicators, and second-tier supplier visibility.', doctrineAnchor: 'US UFLPA 2021; ILO Forced Labour Indicators' },
  { id: 'cs_ms_02', topic: 'modern_slavery', rule: 'CSDDD due-diligence obligations propagate up to in-scope groups\' direct suppliers; map your customers in scope for these expectations.', doctrineAnchor: 'EU CSDDD 2024/1760' },
  { id: 'cs_ms_03', topic: 'modern_slavery', rule: 'Red flags: passport retention by employer, wage underpayment, restricted movement, debt-bondage indicators in employment-disbursement accounts.', doctrineAnchor: 'FATF Human-Trafficking Typology 2018' },
  { id: 'cs_ms_04', topic: 'modern_slavery', rule: 'Modern slavery proceeds laundered via cash-intensive SMEs (massage, nail bars, manual-labour subcontractors); screen these segments with sector-tuned typologies.', doctrineAnchor: 'FATF Human-Trafficking Typology 2018' },
  { id: 'cs_ms_05', topic: 'modern_slavery', rule: 'STR filings on suspected human trafficking should be classified as TF-adjacent for FIU prioritisation, even where TF predicate is not established.', doctrineAnchor: 'UNODC Trafficking in Persons Protocol' },

  // ── Sectoral sanctions ────────────────────────────────────────────────
  { id: 'cs_ss_01', topic: 'sectoral_sanctions', rule: 'Sectoral controls differ from SDN: they restrict specific products, services, or activities rather than full asset freeze. Map each transaction line-by-line to applicable Directive.', doctrineAnchor: 'OFAC SSI; EU Reg 833/2014' },
  { id: 'cs_ss_02', topic: 'sectoral_sanctions', rule: 'Russia oil price-cap requires attestation chain at every tier; service providers (insurance, finance, brokerage) need price-cap compliance at counterparty onboarding.', doctrineAnchor: 'Price-Cap Coalition Guidance 2022-2024' },
  { id: 'cs_ss_03', topic: 'sectoral_sanctions', rule: 'Capital-market restrictions: new issuances post-cutoff are blocked even though secondary trading of legacy paper may be permitted; check ISIN issue date.', doctrineAnchor: 'EU Reg 833/2014 Art.5' },
  { id: 'cs_ss_04', topic: 'sectoral_sanctions', rule: 'Shadow-fleet maritime evasion: AIS gaps + STS transfers + flag-of-convenience swap are the canonical fingerprints; require IMO + class society + insurer triangulation.', doctrineAnchor: 'OFAC / OFSI shipping advisories 2022-2024' },
  { id: 'cs_ss_05', topic: 'sectoral_sanctions', rule: 'EU sectoral SDD-list inclusion does not equal SDN-equivalent freeze; verify the specific Annex and Article that applies to the counterparty before transaction decision.', doctrineAnchor: 'EU Council Reg 269/2014, 833/2014' },

  // ── Third-party risk ─────────────────────────────────────────────────
  { id: 'cs_tpr_01', topic: 'third_party_risk', rule: 'Tier vendors at onboarding by AML / sanctions / cyber / data-protection risk; minimum diligence depth scales with tier.', doctrineAnchor: 'EBA Outsourcing Guidelines; ISO 31000' },
  { id: 'cs_tpr_02', topic: 'third_party_risk', rule: 'Critical vendors require right-to-audit, exit plan, sub-contractor visibility, business-continuity plan and SOC 2 Type II (or equivalent) at a minimum.', doctrineAnchor: 'EBA Outsourcing GL/2019/02' },
  { id: 'cs_tpr_03', topic: 'third_party_risk', rule: 'Vendor security incidents are reportable events: define SLA for incident notification (e.g. 24h), align with internal escalation playbook.', doctrineAnchor: 'EU DORA 2022/2554' },
  { id: 'cs_tpr_04', topic: 'third_party_risk', rule: 'Concentration risk across critical vendors must be reported to the Risk Committee; multiple critical functions on a single provider triggers diversification plan.', doctrineAnchor: 'EU DORA Art.28' },
  { id: 'cs_tpr_05', topic: 'third_party_risk', rule: 'Document a vendor\'s sub-contractors at engagement; chain-of-trust gaps are a top regulatory finding in TPRM exams.', doctrineAnchor: 'EBA Outsourcing GL/2019/02 Art.71' },

  // ── Outsourcing ───────────────────────────────────────────────────────
  { id: 'cs_out_01', topic: 'outsourcing', rule: 'Outsourcing AML functions does not transfer regulatory accountability — the licensed entity remains accountable for compliance outcomes.', doctrineAnchor: 'FATF R.18; CBUAE Outsourcing Regulation' },
  { id: 'cs_out_02', topic: 'outsourcing', rule: 'Critical-or-important outsourcing requires regulator notification and, in some jurisdictions, prior approval.', doctrineAnchor: 'EBA Outsourcing GL/2019/02; CBUAE OS Reg' },
  { id: 'cs_out_03', topic: 'outsourcing', rule: 'Data-residency and access controls must align with PDPL / GDPR expectations; offshore TM operations require regulator-sanctioned data-flow framework.', doctrineAnchor: 'UAE PDPL; EU GDPR Art.44-49' },
  { id: 'cs_out_04', topic: 'outsourcing', rule: 'Outsourced AML monitoring requires sample-based quality assurance by the licensed entity; "trust the vendor" is not a control.', doctrineAnchor: 'FATF R.18 INR.18' },
  { id: 'cs_out_05', topic: 'outsourcing', rule: 'Exit plan required for any critical outsourced AML function — including data return, knowledge transfer, and continuity of detection rules.', doctrineAnchor: 'EBA Outsourcing GL/2019/02 Art.79' },

  // ── Gambling / betting ────────────────────────────────────────────────
  { id: 'cs_gam_01', topic: 'gambling_betting', rule: 'Casino CDD threshold ≥ USD/EUR 3,000 single transaction (FATF R.22) — or as set by jurisdiction; some jurisdictions apply CDD on entry.', doctrineAnchor: 'FATF R.22 INR.22' },
  { id: 'cs_gam_02', topic: 'gambling_betting', rule: 'Chip dumping in poker: large losing sessions to a counter-party with no game logic is canonical ML; flag via game telemetry analysis.', doctrineAnchor: 'FATF Casino Typologies 2009' },
  { id: 'cs_gam_03', topic: 'gambling_betting', rule: 'Sports betting: arbitrage betting at multiple bookmakers / accounts to reduce variance is a classic structuring proxy — apply linked-account aggregation.', doctrineAnchor: 'FATF Sports Betting Typology 2009' },
  { id: 'cs_gam_04', topic: 'gambling_betting', rule: 'Junket / VIP rooms require enhanced due diligence on the junket operator, source-of-funds for buy-ins, and independent audit of cage records.', doctrineAnchor: 'Macao Gaming Inspection; UNODC' },
  { id: 'cs_gam_05', topic: 'gambling_betting', rule: 'iGaming KYC at registration + EDD on first deposit ≥ EUR 2,000 — then continuous monitoring of deposit / withdrawal patterns vs game volume.', doctrineAnchor: 'EU 4AMLD Art.11; EGBA Standards' },

  // ── Real-estate AML ───────────────────────────────────────────────────
  { id: 'cs_re_01', topic: 'real_estate_aml', rule: 'Cash purchase of real estate at any value triggers CDD per FATF R.22; UAE thresholds apply at AED 55,000 and above with EOCN reporting.', doctrineAnchor: 'FATF R.22; UAE CD 10/2019' },
  { id: 'cs_re_02', topic: 'real_estate_aml', rule: 'Off-plan / pre-construction purchases require additional diligence: developer escrow, construction-progress alignment with payments, source of funds at each milestone.', doctrineAnchor: 'UAE RERA Law 8/2007; Dubai Land Dept' },
  { id: 'cs_re_03', topic: 'real_estate_aml', rule: 'Corporate buyer with no operating substance + cash purchase + offshore UBO is a near-textbook ML pattern; require substance-test before transaction.', doctrineAnchor: 'FATF Real Estate Typology 2007/2022' },
  { id: 'cs_re_04', topic: 'real_estate_aml', rule: 'Title-deed transfers must align with payment-flow records; mismatch in price between contract, deed, and bank transfer is a TBML / sanctions-evasion red flag.', doctrineAnchor: 'FATF Real Estate Typology' },
  { id: 'cs_re_05', topic: 'real_estate_aml', rule: 'Real-estate agents are DNFBPs under FATF R.22; in UAE, registered with MoE and supervised under DNFBP Circulars.', doctrineAnchor: 'UAE MoE DNFBP Circular' },

  // ── Insurance AML ─────────────────────────────────────────────────────
  { id: 'cs_ins_01', topic: 'insurance_aml', rule: 'Single-premium life insurance > USD/EUR 25,000 is a known ML vector; require source-of-funds at issuance and at any premium top-up.', doctrineAnchor: 'IAIS ICP 22; FATF Life Insurance Typology' },
  { id: 'cs_ins_02', topic: 'insurance_aml', rule: 'Third-party premium payments require enhanced due diligence on payer-policyholder relationship and lawful purpose.', doctrineAnchor: 'FATF R.10 INR.10' },
  { id: 'cs_ins_03', topic: 'insurance_aml', rule: 'Early surrender within 12-24 months of issuance with payout to a third party is a textbook ML pattern; flag for STR review.', doctrineAnchor: 'FATF Life Insurance Typology 2015' },
  { id: 'cs_ins_04', topic: 'insurance_aml', rule: 'Free-look-period cancellations with payout redirection to non-policyholder accounts require enhanced scrutiny.', doctrineAnchor: 'IAIS ICP 22' },
  { id: 'cs_ins_05', topic: 'insurance_aml', rule: 'Reinsurance and treaty arrangements require BO and sanctions diligence on cedent + reinsurer + retrocessionaire chain.', doctrineAnchor: 'IAIS ICP 13; Wolfsberg Reinsurance Guidance' },

  // ── Tax evasion ───────────────────────────────────────────────────────
  { id: 'cs_te_01', topic: 'tax_evasion', rule: 'Tax evasion is a designated FATF predicate offence; STR filing required on suspicion regardless of whether the underlying tax is criminal in the home country.', doctrineAnchor: 'FATF R.3 INR.3 (designated category 21)' },
  { id: 'cs_te_02', topic: 'tax_evasion', rule: 'Apply CRS / FATCA reporting to all reportable accounts; CRS gaps (declared "non-reportable" with weak basis) are an STR trigger.', doctrineAnchor: 'OECD CRS; US FATCA' },
  { id: 'cs_te_03', topic: 'tax_evasion', rule: 'Loan-back schemes (offshore-funded loan to onshore taxpayer) are a textbook tax-evasion pattern; document substance of the lender and arms-length terms.', doctrineAnchor: 'OECD BEPS Action 4' },
  { id: 'cs_te_04', topic: 'tax_evasion', rule: 'Aggressive tax-planning structures (Mauritius / BVI / Cayman holding) require BO transparency and substance verification — zero-tax does not equal compliance.', doctrineAnchor: 'OECD BEPS; UAE economic substance regulations' },
  { id: 'cs_te_05', topic: 'tax_evasion', rule: 'Voluntary tax-disclosure regimes (where applicable) do not exempt the firm from STR obligations on the underlying conduct.', doctrineAnchor: 'FATF R.20 + relevant national VDP rules' },

  // ── Cyber incident ────────────────────────────────────────────────────
  { id: 'cs_cyb_01', topic: 'cyber_incident', rule: 'Material cyber incidents must be reported per the relevant regime — SEC 4-business-day disclosure for US-listed firms; DORA major-ICT-incident notification in EU.', doctrineAnchor: 'SEC Cybersecurity Disclosure Rule 2023; EU DORA Art.19' },
  { id: 'cs_cyb_02', topic: 'cyber_incident', rule: 'Ransomware payment may itself be a sanctions violation — screen the destination wallet against OFAC + comparable lists before any payment consideration.', doctrineAnchor: 'OFAC Ransomware Advisory 2021' },
  { id: 'cs_cyb_03', topic: 'cyber_incident', rule: 'Preserve forensic evidence in admissible form (chain-of-custody, hash) — incident response must align with DFIR best-practice and regulator expectations.', doctrineAnchor: 'NIST SP 800-86; ISO/IEC 27037' },
  { id: 'cs_cyb_04', topic: 'cyber_incident', rule: 'Cyber-incident-induced operational disruption that affects AML controls (TM offline, screening latency) is itself a reportable AML control failure.', doctrineAnchor: 'EU DORA; CBUAE Operational Resilience' },
  { id: 'cs_cyb_05', topic: 'cyber_incident', rule: 'Coordinate incident response with sector CERT, FIU, and supervisor; isolated handling without regulator notification is an enforcement-priority finding.', doctrineAnchor: 'NIS2 Directive 2022/2555' },

  // ── Data protection / PDPL ────────────────────────────────────────────
  { id: 'cs_dp_01', topic: 'data_protection_pdpl', rule: 'AML processing has a lawful basis under PDPL / GDPR (compliance with legal obligation); document the basis, not "consent".', doctrineAnchor: 'UAE PDPL FDL 45/2021 Art.5; GDPR Art.6(1)(c)' },
  { id: 'cs_dp_02', topic: 'data_protection_pdpl', rule: 'Erasure requests on AML-retained records are refused on legal-obligation grounds; document the refusal rationale and retention period.', doctrineAnchor: 'GDPR Art.17(3)(b); UAE PDPL' },
  { id: 'cs_dp_03', topic: 'data_protection_pdpl', rule: 'AML risk assessments using personal data may require a DPIA — particularly where automated profiling is involved.', doctrineAnchor: 'GDPR Art.35; UAE PDPL DPIA guidance' },
  { id: 'cs_dp_04', topic: 'data_protection_pdpl', rule: 'Cross-border AML data transfers require a permitted mechanism (adequacy, SCC, BCR, or specific derogation under Art.49).', doctrineAnchor: 'GDPR Chapter V; UAE PDPL Art.22' },
  { id: 'cs_dp_05', topic: 'data_protection_pdpl', rule: 'Data-subject access rights coexist with tipping-off — handle SARs (subject access requests) with legal-counsel review during active investigation.', doctrineAnchor: 'GDPR Art.15; UAE PDPL Art.13' },

  // ── Wire transfer Travel Rule ────────────────────────────────────────
  { id: 'cs_wt_01', topic: 'wire_transfer_travel_rule', rule: 'Cross-border wires ≥ USD/EUR 1,000 must include originator name, account/IBAN, and physical address (or national-ID); beneficiary name + account.', doctrineAnchor: 'FATF R.16 INR.16' },
  { id: 'cs_wt_02', topic: 'wire_transfer_travel_rule', rule: 'Truncated, missing, or meaningless originator data is a Travel-Rule breach; reject the transfer or apply enhanced scrutiny per risk-based approach.', doctrineAnchor: 'FATF R.16 INR.16(c)' },
  { id: 'cs_wt_03', topic: 'wire_transfer_travel_rule', rule: 'Virtual asset transfers ≥ USD/EUR 1,000 are subject to the Travel Rule; both originating and beneficiary VASPs must exchange required information.', doctrineAnchor: 'FATF Updated R.16 Guidance 2021' },
  { id: 'cs_wt_04', topic: 'wire_transfer_travel_rule', rule: 'Batch processing or "cover payment" methods cannot be used to circumvent Travel-Rule obligations; the originating institution remains responsible.', doctrineAnchor: 'FATF R.16 INR.16(b)' },
  { id: 'cs_wt_05', topic: 'wire_transfer_travel_rule', rule: 'Counterparty VASP non-compliance with Travel Rule requires risk-based response: hold, decline, or terminate the corridor as appropriate.', doctrineAnchor: 'FATF R.16 INR.16; FATF VA Guidance 2021' },

  // ── MVTS / Remittance ─────────────────────────────────────────────────
  { id: 'cs_mvts_01', topic: 'mvts_remittance', rule: 'MVTS providers must be licensed/registered and subject to AML/CFT supervision; agents are within scope of the principal\'s programme.', doctrineAnchor: 'FATF R.14 INR.14' },
  { id: 'cs_mvts_02', topic: 'mvts_remittance', rule: 'Hawala-style settlement (offsetting deposits without wire) is a designated MVTS activity in most jurisdictions and requires licensing.', doctrineAnchor: 'FATF Hawala Typology 2013' },
  { id: 'cs_mvts_03', topic: 'mvts_remittance', rule: 'Customer base of MVTS is structurally migrant / remitter — apply tailored CDD and ongoing-monitoring rules sensitive to corridor patterns.', doctrineAnchor: 'FATF MVTS Guidance 2016' },
  { id: 'cs_mvts_04', topic: 'mvts_remittance', rule: 'Round-amount / offsetting flow patterns between unrelated parties in different jurisdictions are textbook underground-banking signatures.', doctrineAnchor: 'FATF Hawala / Underground Banking Typology' },
  { id: 'cs_mvts_05', topic: 'mvts_remittance', rule: 'Action against unregistered MVTS is mandatory — ignoring known unlicensed activity is itself a supervisory failure.', doctrineAnchor: 'FATF R.14 INR.14(b)' },

  // ── Environmental predicate ──────────────────────────────────────────
  { id: 'cs_env_01', topic: 'environmental_predicate', rule: 'Environmental crime is a designated FATF predicate offence (R.3 + 22 categories list, 2021 update).', doctrineAnchor: 'FATF R.3 INR.3; FATF Environmental Crime Report 2021' },
  { id: 'cs_env_02', topic: 'environmental_predicate', rule: 'Illegal logging proceeds enter trade finance via false-origin certification; verify FLEGT licence and chain-of-custody for high-risk timber species.', doctrineAnchor: 'EU FLEGT; EUTR; FATF Illegal Logging Typology' },
  { id: 'cs_env_03', topic: 'environmental_predicate', rule: 'IUU fishing proceeds: cross-reference vessel against RFMO IUU lists, validate catch certificate (EU IUU Reg.), screen for AIS gaps and STS transfers.', doctrineAnchor: 'EU IUU Reg 1005/2008; INTERPOL Project Scale' },
  { id: 'cs_env_04', topic: 'environmental_predicate', rule: 'Illegal mining proceeds laundered via gold and gemstone trade — apply OECD DDG Annex II and KP certification rigour, especially on artisanal-source supply.', doctrineAnchor: 'OECD DDG Annex II; LBMA RGG' },
  { id: 'cs_env_05', topic: 'environmental_predicate', rule: 'STR filings on environmental-crime proceeds must explicitly cite the predicate (timber, fisheries, mining, wildlife) and FATF R.3 categorisation.', doctrineAnchor: 'FATF R.20; FATF Environmental Crime Report 2021' },

  // ── Wildlife predicate ───────────────────────────────────────────────
  { id: 'cs_wlp_01', topic: 'wildlife_predicate', rule: 'CITES Appendix I species (e.g. ivory, rhino horn) carry a strict prohibition; permits are commercial trade by definition for Appendix II.', doctrineAnchor: 'CITES Convention; UN ECOSOC' },
  { id: 'cs_wlp_02', topic: 'wildlife_predicate', rule: 'Mislabel-freight typology: "plastic figurines" for ivory, "fish meal" for pangolin scales — verify HS-code consistency with weight and provenance docs.', doctrineAnchor: 'FATF Wildlife Trafficking Typology 2020' },
  { id: 'cs_wlp_03', topic: 'wildlife_predicate', rule: 'Trafficking hubs (Vietnam, Mozambique, UAE transit) require enhanced shipping-route diligence on cargo manifests and consignees.', doctrineAnchor: 'TRAFFIC; UNODC World Wildlife Crime Report' },
  { id: 'cs_wlp_04', topic: 'wildlife_predicate', rule: 'Coordinate STR-flagged wildlife cases with INTERPOL Project Wisdom and UNODC focal point — cross-border evidence sharing is critical for prosecution.', doctrineAnchor: 'INTERPOL; UNODC' },
  { id: 'cs_wlp_05', topic: 'wildlife_predicate', rule: 'Wildlife trafficking is a designated FATF predicate offence (2021 R.3 update) — STR + ML investigation flow applies.', doctrineAnchor: 'FATF R.3 INR.3; FATF Wildlife Crime Report 2020' },

  // ── General compliance ────────────────────────────────────────────────
  { id: 'cs_gc_01', topic: 'general_compliance', rule: 'When in doubt, apply the conservative interpretation; regulators rarely sanction a firm for over-compliance, only for under-compliance.', doctrineAnchor: 'Wolfsberg AML Principles' },
  { id: 'cs_gc_02', topic: 'general_compliance', rule: 'Document the decision, the rationale, the approver, and the evidence; "we discussed it and decided" is not a record.', doctrineAnchor: 'FATF R.11' },
  { id: 'cs_gc_03', topic: 'general_compliance', rule: 'Compliance is risk-based but not consequence-free — accept residual risk only with explicit Board / committee acceptance.', doctrineAnchor: 'COSO ERM 2017' },
  { id: 'cs_gc_04', topic: 'general_compliance', rule: 'Treat regulator guidance, examination feedback, and enforcement actions as binding, not advisory; under-compliance is the typical enforcement trigger.', doctrineAnchor: 'UAE supervisor guidance hierarchy' },
  { id: 'cs_gc_05', topic: 'general_compliance', rule: 'Keep regulators informed early on material control failures; self-disclosure is consistently a mitigating factor in enforcement outcomes.', doctrineAnchor: 'UAE supervisor enforcement guidelines' },
];

export function rulesForTopic(topic: MlroTopic, limit = 5): CommonSenseRule[] {
  return COMMON_SENSE_RULES.filter((r) => r.topic === topic).slice(0, limit);
}

export function ruleById(id: string): CommonSenseRule | undefined {
  return COMMON_SENSE_RULES.find((r) => r.id === id);
}
