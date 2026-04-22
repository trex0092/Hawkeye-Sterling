// Hawkeye Sterling — tipping-off egress guard.
// Runs on ANY text destined for a customer, counterparty, or external channel.
// Blocks (does not sanitise) any output that discloses or hints at an internal
// suspicion, investigation, STR/SAR/FFR/PNMR, consent request, or regulatory
// enquiry. Charter P4 is non-negotiable: the guard fails closed.

export interface TippingOffMatch {
  patternId: string;
  severity: 'high' | 'medium';
  excerpt: string;
  indexStart: number;
  indexEnd: number;
}

export interface TippingOffVerdict {
  allowed: boolean;
  matches: TippingOffMatch[];
  recommendation: string;
}

interface PatternRule {
  id: string;
  severity: 'high' | 'medium';
  rx: RegExp;
}

const RULES: PatternRule[] = [
  { id: 'explicit_str', severity: 'high', rx: /\b(STR|SAR|SUSPICIOUS ACTIVITY REPORT|SUSPICIOUS TRANSACTION REPORT)\b/i },
  { id: 'explicit_ffr_pnmr', severity: 'high', rx: /\b(FFR|PNMR|FUNDS FREEZE REPORT|PARTIAL NAME MATCH REPORT)\b/i },
  { id: 'explicit_goaml', severity: 'high', rx: /\bgoAML\b/i },
  { id: 'ongoing_investigation', severity: 'high', rx: /\bongoing (investigation|review|enquiry|inquiry)\b/i },
  { id: 'we_reported_you', severity: 'high', rx: /\b(we|the bank|this firm) (have|has) (filed|reported|submitted)\b/i },
  { id: 'flagged_for_suspicion', severity: 'high', rx: /\b(flagged|reported) for (suspicion|suspicious|review|investigation)\b/i },
  { id: 'regulator_enquiry', severity: 'high', rx: /\b(regulator|FIU|OFAC|OFSI|EU Commission|MoE) (has |have )?(asked|requested|enquired|contacted us)\b/i },
  { id: 'move_funds_warning', severity: 'high', rx: /\b(please|you should|you must) (move|transfer|withdraw|relocate) (the )?(funds|money|balance)/i },
  { id: 'aml_suspicion_lang', severity: 'medium', rx: /\bsuspected (money laundering|terrorist financing|proliferation financing|sanctions evasion)\b/i },
  { id: 'before_filing', severity: 'high', rx: /\bbefore (we )?(submit|file|report) (the )?(STR|SAR|FFR|PNMR|filing|report)\b/i },
  { id: 'reason_tied_to_suspicion', severity: 'medium', rx: /\b(the )?reason (is|was) (regulatory|compliance|sanctions|aml|cft|cpf)\b/i },
  { id: 'no_reason_offboarding_violation', severity: 'medium', rx: /\bwe (cannot|can't) (continue|maintain|keep) (your )?(account|relationship) (because|due to) (compliance|regulatory|sanctions|aml|cft)\b/i },
];

export function tippingOffScan(text: string): TippingOffVerdict {
  const matches: TippingOffMatch[] = [];
  for (const rule of RULES) {
    const m = rule.rx.exec(text);
    if (!m) continue;
    matches.push({
      patternId: rule.id,
      severity: rule.severity,
      excerpt: m[0],
      indexStart: m.index,
      indexEnd: m.index + m[0].length,
    });
  }
  const anyHigh = matches.some((x) => x.severity === 'high');
  return {
    allowed: matches.length === 0,
    matches,
    recommendation: anyHigh
      ? 'Block egress. Replace with neutral offboarding/status language that states no reasons tied to suspicion.'
      : matches.length > 0
      ? 'Review: medium-severity patterns detected. MLRO sign-off required before egress.'
      : 'Safe to egress per tipping-off guard.',
  };
}

// Neutral replacement language that operators can use.
export const NEUTRAL_OFFBOARDING_TEMPLATE = `Dear {NAME},

We have decided to discontinue our business relationship. This decision has been taken at the discretion of {ENTITY_NAME}. Please provide instructions for the return of any residual balance to a verified account in your name.

Regards,
{ENTITY_NAME}`;
