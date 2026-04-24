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
    regulatoryAnchor: 'FDL 20/2018 Art.25',
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
    regulatoryAnchor: 'FDL 20/2018 Art.15; Cabinet Resolution 10/2019',
    severity: 'critical',
  },
  {
    id: 'rl_pep_edd_not_completed',
    label: 'PEP onboarded or maintained without completed EDD file',
    precondition: 'Subject classified as PEP or PEP-RCA and EDD package is absent or > 12 months stale.',
    action: 'escalate_immediately',
    playbookId: 'pb_high_risk_customer',
    regulatoryAnchor: 'FDL 20/2018 Art.14; Wolfsberg FAQ',
    severity: 'high',
  },
  {
    id: 'rl_kyc_expired_high_risk',
    label: 'KYC/EDD expired > 12 months on active high-risk account',
    precondition: 'Account risk tier = HIGH and last full CDD review completed > 12 months ago.',
    action: 'escalate_immediately',
    regulatoryAnchor: 'FDL 20/2018 Art.14; CBUAE Guidance 2023',
    severity: 'high',
  },
  {
    id: 'rl_ubo_threshold_missing',
    label: 'UBO not identified above 25% threshold for entity relationship',
    precondition: 'Legal-entity subject with relationship value > AED 500k and no UBO declared above 25% ownership threshold.',
    action: 'do_not_onboard',
    regulatoryAnchor: 'FDL 20/2018 Art.12; CBUAE AML Guidance',
    severity: 'high',
  },
  {
    id: 'rl_data_retention_premature_destruction',
    label: 'CDD / transaction records destroyed before mandatory 5-year retention period',
    precondition: 'Record deletion event detected before the mandatory 5-year retention period has elapsed from relationship end or transaction date.',
    action: 'block',
    regulatoryAnchor: 'FDL 20/2018 Art.24; FDL 45/2021 (PDPL)',
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
    regulatoryAnchor: 'FDL 20/2018 Art.15; UAEFIU goAML TM v2',
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
