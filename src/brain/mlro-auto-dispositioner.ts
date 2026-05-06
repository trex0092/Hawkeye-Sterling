// Hawkeye Sterling — auto-dispositioner.
// Given a pipeline result + charter checks + redline evaluations, PROPOSES
// a disposition code (D00–D10) with rationale. The MLRO still decides —
// this is decision support (charter P3 + P10). The auto-proposal is shown
// as a chip on the card; accepting it logs a calibration sample.

import type { DispositionCode } from './dispositions.js';

export interface AutoDispositionInput {
  partial: boolean;
  charterAllowed: boolean;
  tippingOffMatches: number;
  structuralIssues: string[];
  narrative: string;
  firedRedlineIds: readonly string[];
}

export interface AutoDispositionProposal {
  code: DispositionCode;
  confidence: number;   // 0..1
  rationale: string;
  flags: string[];
}

const RX_FREEZE = /\b(FREEZE|FFR[ _]FILED|CONFIRMED[ _]SANCTIONS[ _]MATCH)\b/i;
const RX_PARTIAL_SANCTIONS = /\b(PNMR|PARTIAL[ _](NAME[ _])?MATCH)\b/i;
const RX_EXIT = /\b(EXIT[ _]RELATIONSHIP|TERMINATE)\b/i;
const RX_DO_NOT_ONBOARD = /\b(DO[ _]NOT[ _]ONBOARD|DECLINE[ _]ONBOARDING)\b/i;
const RX_EDD = /\b(ESCALATE[_ ]TO[_ ]EDD|ENHANCED[_ ]DUE[_ ]DILIGENCE|EDD[_ ]REQUIRED)\b/i;
const RX_STR = /\b(STR[_ ]FILED|SUSPICIOUS[_ ]TRANSACTION[_ ]REPORT)\b/i;
const RX_HEIGHTENED = /\b(HEIGHTENED[_ ]MONITORING)\b/i;
const RX_NO_MATCH = /\bNO[ _]MATCH(?!\w)/i;
const RX_CLEARED = /\b(CLEARED|APPROVED|PROCEED)\b/i;
const RX_REFER_AUTHORITY = /\b(REFER[_ ]TO[_ ]AUTHORITY|COMPETENT[_ ]AUTHORITY)\b/i;

export function proposeDisposition(input: AutoDispositionInput): AutoDispositionProposal {
  return escalateIfLowConfidence(_proposeDisposition(input));
}

function _proposeDisposition(input: AutoDispositionInput): AutoDispositionProposal {
  const flags: string[] = [];

  // Hard redline — tipping-off draft detected → block everything, suggest
  // D08 (exit) while the MLRO handles the control failure. Do not ship.
  if (input.tippingOffMatches > 0 || input.firedRedlineIds.includes('rl_tipping_off_draft')) {
    flags.push('tipping-off risk intercepted');
    return {
      code: 'D08_exit_relationship',
      confidence: 0.8,
      rationale: 'Tipping-off phrasing was detected in the egress path. The charter (P4) blocks this output; recommend a neutral-offboarding pathway while the control lapse is reviewed.',
      flags,
    };
  }

  // Confirmed sanctions match → D05 freeze + FFR.
  if (input.firedRedlineIds.some((r) => /rl_(eocn|un_consolidated|ofac_sdn)_confirmed/.test(r)) ||
      RX_FREEZE.test(input.narrative)) {
    flags.push('confirmed sanctions redline fired');
    return {
      code: 'D05_frozen_ffr',
      confidence: 0.92,
      rationale: 'A confirmed sanctions match was asserted (exact or strong confidence with two strong identifiers). Freeze within 24 hours and file FFR within 5 business days per Cabinet Decision 74/2020 Art.4-7.',
      flags,
    };
  }

  // Partial sanctions → D06 PNMR.
  if (RX_PARTIAL_SANCTIONS.test(input.narrative)) {
    flags.push('partial sanctions phrasing detected');
    return {
      code: 'D06_partial_match_pnmr',
      confidence: 0.75,
      rationale: 'Partial match not ruled out. File PNMR via goAML within 5 business days; record disambiguation attempts in the audit chain.',
      flags,
    };
  }

  // CAHRA without docs → do not onboard.
  if (input.firedRedlineIds.includes('rl_dpms_cahra_without_oecd')) {
    flags.push('CAHRA input without OECD Annex II documentation');
    return {
      code: 'D09_do_not_onboard',
      confidence: 0.88,
      rationale: 'CAHRA-sourced refinery input lacks OECD DDG Annex II documentation. Refuse intake; preserve the rationale on file.',
      flags,
    };
  }

  // STR drafted → D07.
  if (RX_STR.test(input.narrative)) {
    flags.push('STR-filing language present');
    return {
      code: 'D07_str_filed',
      confidence: 0.7,
      rationale: 'Narrative indicates an STR has been filed or is about to be filed. Preserve evidence; no tipping-off in subsequent comms.',
      flags,
    };
  }

  // Exit relationship cue.
  if (RX_EXIT.test(input.narrative)) {
    flags.push('exit-relationship language');
    return {
      code: 'D08_exit_relationship',
      confidence: 0.68,
      rationale: 'Narrative proposes exiting the relationship. Use neutral offboarding language; preserve audit trail.',
      flags,
    };
  }

  // Do not onboard cue.
  if (RX_DO_NOT_ONBOARD.test(input.narrative)) {
    flags.push('do-not-onboard language');
    return {
      code: 'D09_do_not_onboard',
      confidence: 0.72,
      rationale: 'Narrative recommends declining onboarding. Document rationale and preserve the record.',
      flags,
    };
  }

  // Refer to authority.
  if (RX_REFER_AUTHORITY.test(input.narrative)) {
    flags.push('refer-to-authority language');
    return {
      code: 'D10_refer_to_authority',
      confidence: 0.65,
      rationale: 'Narrative recommends referring the matter to a competent authority. MLRO and senior management must sign off before referral.',
      flags,
    };
  }

  // Partial pipeline run → D03 EDD to collect what we missed.
  if (input.partial) {
    flags.push('partial pipeline output — insufficient information (charter P10)');
    return {
      code: 'D03_edd_required',
      confidence: 0.5,
      rationale: 'Pipeline completed partially — insufficient information to propose a final disposition. Per charter P10, return a gap list and request EDD.',
      flags,
    };
  }

  // Structural charter failure → D03 EDD.
  if (!input.charterAllowed || input.structuralIssues.length > 0) {
    flags.push('charter validator flagged issues');
    return {
      code: 'D03_edd_required',
      confidence: 0.55,
      rationale: `Output failed charter validation (${input.structuralIssues.length} issue(s)). Strengthen citations / disambiguators under EDD before dispositioning.`,
      flags,
    };
  }

  // EDD cue.
  if (RX_EDD.test(input.narrative)) {
    flags.push('EDD recommended');
    return {
      code: 'D03_edd_required',
      confidence: 0.7,
      rationale: 'Narrative recommends Enhanced Due Diligence. Document the scope + evidence requirements and schedule a review.',
      flags,
    };
  }

  // Heightened monitoring cue.
  if (RX_HEIGHTENED.test(input.narrative)) {
    return {
      code: 'D04_heightened_monitoring',
      confidence: 0.68,
      rationale: 'Narrative recommends uplifted monitoring. Enable heightened rules; document review cadence.',
      flags,
    };
  }

  // No match — scope declaration is required for D00 (charter P7).
  if (RX_NO_MATCH.test(input.narrative)) {
    return {
      code: 'D00_no_match',
      confidence: 0.72,
      rationale: 'No hits against the declared scope. Scope declaration (lists + version dates + identifiers) is attached per charter P7.',
      flags,
    };
  }

  // Cleared / approved cue → D02.
  if (RX_CLEARED.test(input.narrative)) {
    return {
      code: 'D02_cleared_proceed',
      confidence: 0.7,
      rationale: 'No residual AML/CFT concern identified under current scope; proceed with standard monitoring.',
      flags,
    };
  }

  // Default: needs MLRO attention; avoid committing to a disposition.
  return {
    code: 'D03_edd_required',
    confidence: 0.4,
    rationale: 'No strong signal detected either way. Default to EDD to collect further evidence before the MLRO dispositions.',
    flags,
  };
}

// HS-004 hard constraint (Part 13, Prohibition #11):
// Any proposal with confidence ≤ 0.65 must prepend "ESCALATE — human review required".
function escalateIfLowConfidence(proposal: AutoDispositionProposal): AutoDispositionProposal {
  if (proposal.confidence <= 0.65) {
    return {
      ...proposal,
      rationale: `ESCALATE — human review required. ${proposal.rationale}`,
    };
  }
  return proposal;
}
