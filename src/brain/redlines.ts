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
