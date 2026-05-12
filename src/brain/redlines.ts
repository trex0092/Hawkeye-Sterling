// Hawkeye Sterling — redlines.
// Hard-stop rules that override any other logic. When a redline fires, the
// brain is REQUIRED to apply the action regardless of score, heuristic, or
// operator override. Redlines are the last safety layer before a decision.

export type RedlineAction = 'freeze' | 'block' | 'escalate_immediately' | 'exit_relationship' | 'do_not_onboard';

export interface Redline {
  id: string;
  label: string;
  precondition: string;
  action: RedlineAction;
  playbookId?: string;
  regulatoryAnchor: string;
  severity: 'critical' | 'high';
}

export const REDLINES: Redline[] = [
  {
    id: 'rl_eocn_confirmed',
    label: 'Confirmed EOCN / UAE Local Terrorist List hit',
    precondition: 'Screening yields EXACT or STRONG match with two strong identifiers against UAE EOCN or UAE Local Terrorist List.',
    action: 'freeze',
    playbookId: 'pb_confirmed_sanctions_match',
    regulatoryAnchor: 'Cabinet Decision 74/2020 Art.4-7',
    severity: 'critical',
  },
  {
    id: 'rl_un_consolidated_confirmed',
    label: 'Confirmed UN Security Council Consolidated List hit',
    precondition: 'Screening yields EXACT or STRONG match with two strong identifiers against UN Consolidated List.',
    action: 'freeze',
    playbookId: 'pb_confirmed_sanctions_match',
    regulatoryAnchor: 'UNSCR 1267 / 1373 / 1988 / 2253',
    severity: 'critical',
  },
  {
    id: 'rl_ofac_sdn_confirmed',
    label: 'Confirmed OFAC SDN hit with USD or US-person nexus',
    precondition: 'Screening yields EXACT or STRONG match with two strong identifiers against OFAC SDN.',
    action: 'freeze',
    playbookId: 'pb_confirmed_sanctions_match',
    regulatoryAnchor: 'OFAC SDN regulation',
    severity: 'critical',
  },
  {
    id: 'rl_tipping_off_draft',
    label: 'Tipping-off language detected in egress text',
    precondition: 'Tipping-off guard returns any high-severity match on outbound communication.',
    action: 'block',
    playbookId: 'pb_tipping_off_risk',
    regulatoryAnchor: 'FDL No.10/2025 Art.25',
    severity: 'critical',
  },
  {
    id: 'rl_dpms_cahra_without_oecd',
    label: 'DPMS refinery input from CAHRA without OECD Annex II documentation',
    precondition: 'Refinery input originates from active_cahra country and no OECD Annex II evidence attached.',
    action: 'do_not_onboard',
    playbookId: 'pb_lbma_rgg_cahra',
    regulatoryAnchor: 'OECD DDG Annex II; LBMA RGG 5-step',
    severity: 'high',
  },
  {
    id: 'rl_four_eyes_violated',
    label: 'Four-eyes / separation-of-duties violation attempted',
    precondition: 'Submitter == first approver, or second approver == first approver, or second == submitter.',
    action: 'block',
    regulatoryAnchor: 'Cabinet Resolution 134/2025 Art.19',
    severity: 'critical',
  },
  {
    id: 'rl_training_data_as_sanctions_source',
    label: 'Sanctions assertion sourced only from training data',
    precondition: 'Finding cites sanctions status with no current primary source evidence attached.',
    action: 'block',
    regulatoryAnchor: 'Charter P1 + P8',
    severity: 'critical',
  },
  {
    id: 'rl_missing_charter_hash',
    label: 'Outbound case envelope missing compliance-charter integrity hash',
    precondition: 'Filing envelope or narrative export missing complianceCharterVersionHash.',
    action: 'block',
    regulatoryAnchor: 'Charter (structural)',
    severity: 'high',
  },
  // ── Extended redlines — Wave 5 ───────────────────────────────────────
  {
    id: 'rl_eu_cfsp_confirmed',
    label: 'Confirmed EU CFSP / EU Sanctions Map hit',
    precondition: 'Screening yields EXACT or STRONG match with two strong identifiers against EU Consolidated Sanctions List (CFSP).',
    action: 'freeze',
    regulatoryAnchor: 'EU Regulation 269/2014; Council Decision 2014/145/CFSP',
    severity: 'critical',
  },
  {
    id: 'rl_uk_ofsi_confirmed',
    label: 'Confirmed UK OFSI Financial Sanctions hit',
    precondition: 'Screening yields EXACT or STRONG match with two strong identifiers against UK OFSI Consolidated List.',
    action: 'freeze',
    regulatoryAnchor: 'Sanctions and Anti-Money Laundering Act 2018',
    severity: 'critical',
  },
  {
    id: 'rl_str_filing_deadline_exceeded',
    label: 'STR / goAML filing deadline exceeded without submission',
    precondition: 'Case status = "reportable" for > 24 hours and goAML submission has not been completed.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'FDL No.10/2025 Art.15; CR No.134/2025',
    severity: 'critical',
  },
  {
    id: 'rl_pep_edd_not_completed',
    label: 'PEP onboarded or maintained without completed EDD file',
    precondition: 'Subject classified as PEP or PEP-RCA and EDD package is absent or > 12 months stale.',
    action: 'escalate_immediately',
    playbookId: 'pb_high_risk_customer',
    regulatoryAnchor: 'FDL No.10/2025 Art.14; Wolfsberg FAQ',
    severity: 'high',
  },
  {
    id: 'rl_kyc_expired_high_risk',
    label: 'KYC/EDD expired > 12 months on active high-risk account',
    precondition: 'Account risk tier = HIGH and last full CDD review completed > 12 months ago.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'FDL No.10/2025 Art.14; CBUAE Guidance 2023',
    severity: 'high',
  },
  {
    id: 'rl_ubo_threshold_missing',
    label: 'UBO not identified above 25% threshold for entity relationship',
    precondition: 'Legal-entity subject with relationship value > AED 500k and no UBO declared above 25% ownership threshold.',
    action: 'do_not_onboard',
    regulatoryAnchor: 'FDL No.10/2025 Art.12; CBUAE AML Guidance',
    severity: 'high',
  },
  {
    id: 'rl_data_retention_premature_destruction',
    label: 'CDD / transaction records destroyed before mandatory 5-year retention period',
    precondition: 'Record deletion event detected before the mandatory 5-year retention period has elapsed from relationship end or transaction date.',
    action: 'block',
    regulatoryAnchor: 'FDL No.10/2025 Art.24; FDL 45/2021 (PDPL)',
    severity: 'high',
  },
  {
    id: 'rl_ai_high_risk_no_human_in_loop',
    label: 'High-risk AI decision issued without human-in-the-loop review',
    precondition: 'AI/ML model makes a disposition on a high-risk CDD, credit, or compliance case without a human reviewer signing off before effect.',
    action: 'block',
    regulatoryAnchor: 'EU AI Act Art.14; NIST AI RMF Govern 1.2',
    severity: 'high',
  },
  {
    id: 'rl_proliferation_dual_use_no_end_user_cert',
    label: 'Dual-use goods transaction without end-user / end-use certificate',
    precondition: 'Transaction involves HS-code dual-use commodity and no export licence or end-user certificate is on file.',
    action: 'do_not_onboard',
    regulatoryAnchor: 'Cabinet Decision 74/2020 Art.14; FATF R.7',
    severity: 'critical',
  },
  {
    id: 'rl_insider_bulk_data_exfil',
    label: 'Privileged user bulk client-data export detected outside business hours',
    precondition: 'Privileged employee or contractor performs mass export of client PII or case data in the 30-day pre-departure window or outside declared business hours.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'FDL 45/2021 Art.7; Charter P5',
    severity: 'high',
  },
  {
    id: 'rl_consent_not_obtained_data_sharing',
    label: 'Data sharing to third party without documented consent or legal basis',
    precondition: 'Client data disclosed to third party without explicit consent recorded or a recognised legal exemption documented.',
    action: 'block',
    regulatoryAnchor: 'FDL 45/2021 (PDPL) Art.4; Cabinet Resolution 33/2022',
    severity: 'high',
  },
  {
    id: 'rl_goaml_system_unavailable_str_due',
    label: 'goAML system unavailable with STR deadline within 24 hours',
    precondition: 'goAML API or portal returns connectivity error and at least one pending STR filing has a statutory deadline within 24 hours.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'FDL No.10/2025 Art.15; UAEFIU goAML TM v2',
    severity: 'critical',
  },
  // ── Wave 6 extended redlines ─────────────────────────────────────────────
  {
    id: 'rl_canada_osfi_confirmed',
    label: 'Confirmed Global Affairs Canada SEMA / JVCFO sanctions hit',
    precondition: 'Screening yields EXACT or STRONG match against Global Affairs Canada SEMA or Justice for Victims of Corrupt Foreign Officials list with two strong identifiers.',
    action: 'freeze',
    regulatoryAnchor: 'Special Economic Measures Act (SEMA) s.4; JVCFO Act s.4',
    severity: 'critical',
  },
  {
    id: 'rl_australia_dfat_confirmed',
    label: 'Confirmed Australian DFAT Consolidated Sanctions List hit',
    precondition: 'Screening yields EXACT or STRONG match against the Australian DFAT Consolidated Sanctions List with two strong identifiers.',
    action: 'freeze',
    regulatoryAnchor: 'Charter of the United Nations Act 1945 (Cth); Autonomous Sanctions Act 2011 (Cth)',
    severity: 'critical',
  },
  {
    id: 'rl_npo_without_programme_edd',
    label: 'NPO / charity relationship without programme-level EDD',
    precondition: 'Entity is classified as NPO and no programme-level EDD (including geographic programme risk assessment) is on file or is more than 12 months stale.',
    action: 'escalate_immediately',
    playbookId: 'pb_high_risk_customer',
    regulatoryAnchor: 'FATF R.8; FDL No.10/2025 Art.14',
    severity: 'high',
  },
  {
    id: 'rl_unregulated_vasp_transaction',
    label: 'Transaction with unregistered / unlicensed VASP',
    precondition: 'Counterparty is a virtual-asset service provider that is not registered or licensed in any FATF-member jurisdiction and transaction value exceeds USD 1,000 equivalent.',
    action: 'block',
    regulatoryAnchor: 'FATF R.15; VARA Regulations 2023; Cabinet Resolution 111/2022',
    severity: 'critical',
  },
  {
    id: 'rl_proliferation_financing_indicator',
    label: 'Proliferation financing red-flag indicator without ECSG escalation',
    precondition: 'Two or more FATF R.7 proliferation-financing indicators fire simultaneously and no escalation to the Economic Crimes and Security Group (ECSG) is initiated within 4 hours.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'FATF R.7; Cabinet Decision 74/2020 Art.14',
    severity: 'critical',
  },
  {
    id: 'rl_tax_crime_predicate_no_disclosure',
    label: 'Tax crime predicate offence detected without proactive disclosure',
    precondition: 'Transaction pattern is consistent with a tax-crime predicate offence (VAT carousel, undisclosed offshore account, or aggressive profit shifting) and no proactive regulatory disclosure has been initiated within 5 business days.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'FATF R.3; FDL No.10/2025 Art.2; OECD BEPS Action 12',
    severity: 'high',
  },
  {
    id: 'rl_env_crime_predicate_no_cahra_trace',
    label: 'Environmental crime predicate without CAHRA supply-chain trace',
    precondition: 'Transaction involves proceeds suspected of environmental crime (illegal mining, logging, wildlife trafficking) from an active-CAHRA or known conflict-resource jurisdiction without a primary-source OECD DDG trace on file.',
    action: 'do_not_onboard',
    regulatoryAnchor: 'FATF 2021 Environmental Crime Guidance; OECD DDG Annex II',
    severity: 'high',
  },
  {
    id: 'rl_correspondent_shell_bank_detected',
    label: 'Shell bank identified in correspondent chain',
    precondition: 'Correspondent relationship review identifies a respondent or nested institution with no physical presence in any jurisdiction and not affiliated with a regulated group — i.e. a shell bank.',
    action: 'exit_relationship',
    regulatoryAnchor: 'FATF R.13; FDL No.10/2025 Art.17; Basel CDD Paper',
    severity: 'critical',
  },
  {
    id: 'rl_carbon_credit_double_counting',
    label: 'Carbon credit double-counting or phantom credit detected',
    precondition: 'Registry reconciliation reveals the same carbon offset unit appears in two or more retirement records, or no corresponding adjustment under Paris Agreement Art.6 is evidenced for a cross-border transfer.',
    action: 'block',
    regulatoryAnchor: 'Paris Agreement Art.6; ICVCM Core Carbon Principles 2023; FATF 2021 Environmental Guidance',
    severity: 'high',
  },
  {
    id: 'rl_ai_model_no_sbom_or_model_card',
    label: 'High-risk AI model deployed without SBOM or model card on file',
    precondition: 'A model tier-2 (high-risk) or above AI model under EU AI Act classification is in live production and either the software bill of materials (SBOM) or the model card is absent from the AI model inventory.',
    action: 'block',
    regulatoryAnchor: 'EU AI Act Art.11; ISO/IEC 42001 Clause 8.4; NIST AI RMF Map 1.6',
    severity: 'high',
  },
  {
    id: 'rl_human_trafficking_proceeds_no_str',
    label: 'Human trafficking proceeds suspected without STR in SLA',
    precondition: 'Two or more human trafficking red-flag indicators fire on a case and no STR filing has been initiated within the 24-hour statutory window.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'FDL No.10/2025 Art.15; FATF R.3; UN Palermo Protocol',
    severity: 'critical',
  },
  {
    id: 'rl_politically_exposed_transaction_bypassed',
    label: 'PEP transaction processed without MLRO sign-off',
    precondition: 'A transaction involving a confirmed PEP or PEP-RCA is processed through the payments system without a recorded MLRO sign-off on that specific transaction.',
    action: 'block',
    regulatoryAnchor: 'FDL No.10/2025 Art.14; Wolfsberg PEP FAQ; CBUAE Guidance 2023',
    severity: 'high',
  },
  // ── Wave 7 redlines — common sense gates, data quality, and challenger integrity ──
  {
    id: 'rl_narrative_plausibility_failure',
    label: 'Narrative fails basic plausibility bounds — temporal, financial, or geographic',
    precondition: 'The subject\'s declared business narrative, source of wealth, or transaction rationale fails one or more plausibility bounds (temporal impossibility, financial implausibility versus declared scale, geographic irrationality) and no alternative explanation is documented.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'Charter P10 (insufficient information); FDL No.10/2025 Art.12',
    severity: 'high',
  },
  {
    id: 'rl_challenger_overturned_no_mlro_review',
    label: 'Challenger stage OVERTURNED advisor verdict without scheduled MLRO review',
    precondition: 'The adversarial challenger stage returns a CHALLENGE OUTCOME: OVERTURNED verdict but no MLRO review appointment has been scheduled within 24 hours of the overturned finding.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'Charter P3 (MLRO disposition authority); Cabinet Resolution 134/2025 Art.19',
    severity: 'high',
  },
  {
    id: 'rl_sanctions_dataset_stale',
    label: 'Sanctions screening run on a dataset more than 48 hours old',
    precondition: 'A sanctions screening result is relied upon for a CDD or transaction decision where the underlying sanctions list dataset was last refreshed more than 48 hours before the screening run.',
    action: 'block',
    playbookId: 'pb_confirmed_sanctions_match',
    regulatoryAnchor: 'Cabinet Decision 74/2020 Art.4; OFAC CACR / SDN update policy; FATF IO.11',
    severity: 'critical',
  },
  {
    id: 'rl_deepfake_kyc_not_forensic_referred',
    label: 'KYC document scoring ≥2 deepfake indicators not referred for forensic review',
    precondition: 'A submitted KYC document returns ≥2 deepfake or document-fraud indicators (EXIF anomaly, GAN artefacts, MRZ checksum failure, font inconsistency, metadata mismatch) and the case has not been escalated for forensic document examination before any onboarding decision proceeds.',
    action: 'do_not_onboard',
    regulatoryAnchor: 'FDL No.10/2025 Art.12; CBUAE AML Guidance 2023; FATF R.10',
    severity: 'critical',
  },
  {
    id: 'rl_ubo_chain_break_not_escalated',
    label: 'UBO chain has a verified break and EDD not initiated within 24 hours',
    precondition: 'A beneficial-ownership chain walk identifies a layer where the legal owner cannot be confirmed (nominee indicators, missing registry data, jurisdiction with no disclosure obligation) and no EDD has been initiated within 24 hours of identifying the break.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'FATF R.24/25; FDL No.10/2025 Art.12; UAE Companies Law Federal Decree-Law No. 32/2021 Art.24',
    severity: 'high',
  },
  {
    id: 'rl_economic_rationality_failure_unaddressed',
    label: 'Economically irrational structure documented but not escalated',
    precondition: 'The economic rationality test identifies a structure or transaction whose cost, complexity, or routing is materially inconsistent with the declared legitimate purpose — i.e., a rational legitimate actor would not choose this arrangement — and the finding has not triggered an EDD request or MLRO escalation.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'Charter P9 (opaque risk methodology); FDL No.10/2025 Art.14; FATF R.10',
    severity: 'high',
  },
  // ── Wave 8 redlines — game theory, mechanism design, and strategic rationality gates ──
  {
    id: 'rl_synthetic_identity_onboarded',
    label: 'Synthetic identity detected but onboarding not blocked',
    precondition: 'KYC analysis returns ≥2 synthetic-identity indicators (real-attribute / fabricated-attribute mix, AI-generated documentation, Emirates ID number mismatch with ICP registry response) and the subject has been onboarded or a relationship has been approved without MLRO sign-off on the synthetic-identity finding.',
    action: 'do_not_onboard',
    regulatoryAnchor: 'FDL No.10/2025 Art.12; CBUAE AML Guidance 2023; FATF R.10',
    severity: 'critical',
  },
  {
    id: 'rl_consecutive_mlro_turnover',
    label: '≥3 MLRO changes in 24 months at counterparty institution — governance instability',
    precondition: 'An institutional due diligence review of a counterparty institution reveals that ≥3 different persons have occupied the MLRO role within any rolling 24-month window without a documented, credible business rationale for each transition.',
    action: 'escalate_immediately',
    playbookId: 'pb_high_risk_customer',
    regulatoryAnchor: 'FATF R.18; Cabinet Resolution 134/2025 Art.19; CBUAE Fit and Proper Guidance',
    severity: 'high',
  },
  {
    id: 'rl_mechanism_design_circumvention',
    label: 'Structure achieves regulatory opacity by mechanism design across ≥2 jurisdictions',
    precondition: 'Mechanism design audit (mc.mechanism-design-audit) identifies a cross-jurisdictional structure that systematically places the UBO outside every applicable regulatory perimeter and routes transactions below reporting thresholds in each jurisdiction — achieving opacity as a systematic engineering outcome, not incidentally — and no legitimate business rationale has been established for the structure.',
    action: 'block',
    regulatoryAnchor: 'FATF R.24/25 (beneficial ownership); FDL No.10/2025 Art.12; FATF R.10 INR.10(b)',
    severity: 'critical',
  },
  {
    id: 'rl_commitment_credibility_failure',
    label: 'Subject compliance commitment deemed not credible and risk tier maintained at LOW',
    precondition: 'The commitment-credibility test (mc.commitment-credibility-test) returns LOW credibility for a subject\'s remediation plan, compliance undertaking, or cooperation representation — because the commitment is unverifiable, the subject lacks an enforcement mechanism, or the subject has a history of non-performance — yet the overall risk tier has been set to LOW in reliance on that commitment.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'Charter P9 (opaque risk scoring); FDL No.10/2025 Art.14; CBUAE Guidance 2023',
    severity: 'high',
  },
  {
    id: 'rl_ai_agent_unsanctioned_scope',
    label: 'Agentic AI operating outside approved capability manifest',
    precondition: 'An autonomous agent or automated workflow invokes a tool call, makes a risk determination, or executes an action not listed in its approved capability manifest — including accessing CDD data, initiating transactions, or modifying case files without the required human-in-the-loop checkpoint.',
    action: 'block',
    regulatoryAnchor: 'EU AI Act Art.14; NIST AI RMF Govern 1.2; Charter P9',
    severity: 'critical',
  },
  {
    id: 'rl_tf_ml_cross_filing_omitted',
    label: 'TF or PF finding generated without required dual goAML filing',
    precondition: 'A finding simultaneously establishes both terrorist financing (TF) and proliferation financing (PF) dimensions for the same subject and only a single goAML STR is prepared, without the required separate PF Freeze/Restriction Report (FFR) or PNMR filing under Cabinet Decision 74/2020.',
    action: 'block',
    regulatoryAnchor: 'FDL 26/2021 Art.2; Cabinet Decision 74/2020 Art.4-7; FATF R.5/R.7',
    severity: 'critical',
  },

  // ── Wave 9 — Behavioral Science & Epistemic Integrity Redlines ─────────────
  {
    id: 'rl_confirmed_bias_verdict_unreviewed',
    label: 'Verdict sealed with documented confirmation bias and no independent review',
    precondition: 'The confirmation-bias guard (mc.confirmation-bias-guard) has flagged a bias-risk indicator in the analytical chain AND the assessment was sealed without an independent reviewer being appointed or without the disconfirming-evidence search mandate being completed.',
    action: 'block',
    regulatoryAnchor: 'FATF R.1 (RBA); CBUAE AML/CFT Standards Art.3.2 (quality of assessment); FDL 10/2025 Art.14 (MLRO responsibilities)',
    severity: 'high',
  },
  {
    id: 'rl_social_engineering_onboarding',
    label: 'Social engineering of onboarding analyst detected',
    precondition: 'Evidence exists — from call recordings, email analysis, or analyst report — that a counterparty or subject deliberately exploited authority bias, social proof, or urgency pressure to circumvent a standard due diligence gate; AND the onboarding was approved without an independent compliance review after the manipulation was detected.',
    action: 'block',
    regulatoryAnchor: 'CBUAE AML/CFT Standards Art.7 (CDD integrity); FDL 10/2025 Art.10 (internal controls); FATF R.10',
    severity: 'critical',
  },
  {
    id: 'rl_insider_compliance_integrity_failure',
    label: 'Compliance integrity failure — insider motivated reasoning',
    precondition: 'An assessment produced a risk-lowering conclusion that is directly attributable to a named analyst or approver who held a personal, financial, or hierarchical interest in the subject of the assessment; AND the name-swap test (mc.motivated-reasoning-detector) produces a materially different verdict for an equivalent anonymous counterparty.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'FDL 10/2025 Art.14 (MLRO independence); CBUAE AML/CFT Standards Art.3 (governance); FATF R.18 (internal controls)',
    severity: 'critical',
  },
  {
    id: 'rl_ai_fabricated_kyc_document',
    label: 'KYC document identified as AI-generated or deepfake — onboarding blocked',
    precondition: 'A submitted KYC document scores ≥2 AI-generation or deepfake indicators from the detection framework (absent/inconsistent EXIF metadata, GAN-model image artefacts, MRZ checksum failure, structural perfection inconsistent with human authorship, font/microprint inconsistency) AND onboarding or account activation is attempted without a forensic document examination clearance.',
    action: 'block',
    regulatoryAnchor: 'FDL 10/2025 Art.9 (CDD — identity verification); CBUAE KYC Standards; FDL 45/2021 PDPL Art.4 (data accuracy); FATF R.10',
    severity: 'critical',
  },
  {
    id: 'rl_groupthink_high_risk_approval',
    label: 'Unanimous committee approval of HIGH/CRITICAL case without documented dissent review',
    precondition: 'A committee or approval chain has produced a unanimous APPROVE decision on a case with a composite risk score of HIGH or CRITICAL; AND the case record contains no documented dissent solicitation, no named devil\'s advocate, and no indication that junior-member pressure was assessed; AND deliberation time documented in the minutes was under 15 minutes.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'CBUAE AML/CFT Standards Art.3.2 (assessment quality); FDL 10/2025 Art.14 (MLRO oversight); FATF R.18 (internal controls)',
    severity: 'high',
  },
  {
    id: 'rl_undisclosed_cryptoasset_exposure',
    label: 'Material undisclosed cryptoasset or DeFi exposure confirmed post-onboarding',
    precondition: 'Post-onboarding on-chain intelligence or transaction monitoring has confirmed that a customer or counterparty holds, transacts, or controls cryptoassets or DeFi positions that were not disclosed during CDD; AND the undisclosed exposure includes a mixer/tumbler interaction, a cross-chain bridge hop to a privacy chain, or a wallet cluster attributed to a sanctioned entity or VASP.',
    action: 'block',
    regulatoryAnchor: 'FDL 10/2025 Art.9/11 (CDD — accuracy obligation); VARA VASPS Rulebook; FATF Virtual Assets Guidance 2021; Cabinet Decision 74/2020 Art.4 (TFS)',
    severity: 'critical',
  },
];

export const REDLINE_BY_ID: Map<string, Redline> = new Map(REDLINES.map((r) => [r.id, r]));

export interface RedlineCheck {
  fired: Redline[];
  action: RedlineAction | null;
  summary: string;
}

export function evaluateRedlines(firedIds: string[]): RedlineCheck {
  const fired = firedIds
    .map((id) => REDLINE_BY_ID.get(id))
    .filter((r): r is Redline => !!r);
  if (fired.length === 0) {
    return { fired: [], action: null, summary: 'No redlines fired.' };
  }
  // Severity priority: freeze > block > escalate > exit > do_not_onboard.
  const priority: Record<RedlineAction, number> = {
    freeze: 5, block: 4, escalate_immediately: 3, exit_relationship: 2, do_not_onboard: 1,
  };
  const sorted = [...fired].sort((a, b) => priority[b.action] - priority[a.action]);
  return {
    fired: sorted,
    action: sorted[0]!.action,
    summary: `Redlines fired: ${sorted.map((r) => r.id).join(', ')}. Overriding action: ${sorted[0]!.action}.`,
  };
}
