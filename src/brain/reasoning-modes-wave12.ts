// Wave 12 — template-fill reasoning modes.
//
// The Wave-1..11 registry shipped before the question-template authors had
// finalised every mode id their probes need. Wave 12 closes the gap so the
// brain audit (auditBrain → templates point at real modes) is green. Every
// mode below is a stub-apply pending Phase 12 implementation; the metadata
// (id / name / category / faculties / description) is canonical.

import type {
  FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';
import { defaultApply } from './modes/default-apply.js';

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
): ReasoningMode => ({
  id, name, category, faculties, wave: 12, description,
  apply: defaultApply(id, category, faculties, description),
});

export const WAVE12_MODES: ReasoningMode[] = [
  // DPMS threshold-splitting — complements split_payment_detection but scoped
  // to the DPMS reporting threshold (AED 55,000 cash) rather than generic.
  m('threshold_split_detection', 'Threshold Split Detection', 'predicate_crime',
    ['data_analysis', 'smartness'],
    'Detect splitting of a single economic event into multiple legs each just below a regulatory reporting threshold (DPMS AED 55,000 cash; CTR USD 10,000; STR-trigger anti-structuring).'),

  // Insurance PEP connection — life-insurance, annuity, surrender beneficiary.
  m('pep_connection_reasoning', 'PEP Connection Reasoning', 'behavioral_signals',
    ['intelligence', 'inference'],
    'Reason over policy ownership, premium-payer, beneficiary, and claim-collection identity to surface PEP exposure that is not visible on the customer record alone.'),

  // Funnel / mule velocity — compresses spike_detection + velocity_analysis
  // into one fast-feed-forward mode the funnel-mule probe template uses.
  m('velocity_anomaly_reasoning', 'Velocity Anomaly Reasoning', 'statistical',
    ['data_analysis', 'smartness'],
    'Compute multi-window velocity (1h/24h/7d) on inflows and outflows; flag funnel-account and mule-account velocity signatures (rapid pass-through, dwell-time < 60 minutes, debit-credit ratio ≈ 1).'),

  // Romance / pig-butchering — the financial fingerprint, not the dialogue.
  m('romance_scam_financial_profile_reasoning', 'Romance-Scam Financial Profile', 'behavioral_signals',
    ['intelligence', 'smartness'],
    'Profile the romance / pig-butchering financial fingerprint: increasing-amount remittances to a new beneficiary in a high-risk jurisdiction, post-emotional-trigger spike, late-stage redemption refusal, and cross-border crypto onramp.'),

  // Offshore layering — tax-evasion-specific layering pattern.
  m('offshore_layering', 'Offshore Layering', 'predicate_crime',
    ['intelligence', 'ratiocination'],
    'Identify offshore-vehicle-based layering: nominee director chains, BVI/Cayman/Marshall holdings, opaque trusts, transfer-pricing manipulation, and round-trip via low-tax jurisdictions ahead of repatriation.'),

  // Generic structuring pattern reasoning (daigou parallel-import probe).
  m('structuring_pattern_reasoning', 'Structuring Pattern Reasoning', 'predicate_crime',
    ['data_analysis', 'smartness'],
    'Detect deliberate structuring of cash deposits / wires / invoices to evade reporting thresholds — including same-day multi-branch deposits, just-below-threshold wires, and parallel-import (daigou) commercial-cover structuring.'),

  // Legal privilege — gatekeeper / professional-ML probes need to reason about
  // when LPP shields communications and when it does not (crime-fraud exception).
  m('legal_privilege_assessment', 'Legal Privilege Assessment', 'legal_reasoning',
    ['argumentation', 'introspection'],
    'Assess whether legal professional privilege applies to a piece of evidence: client-lawyer relationship, dominant-purpose test, crime-fraud exception, and the relevant jurisdictional carve-outs (e.g. UK MLR 2017 reg.39).'),

  // CAHRA determination — formal reasoning over the CAHRA seed registry +
  // OECD Annex II indicators to declare a jurisdiction CAHRA for a transaction.
  m('cahra_determination', 'CAHRA Determination', 'geopolitical_risk',
    ['intelligence', 'geopolitical_awareness'],
    'Determine whether a sourcing / transit / counterparty jurisdiction is a Conflict-Affected or High-Risk Area per OECD DDG Annex II indicators; emit the CAHRA flag and the indicator set that triggered it.'),

  // Chain of custody — provenance trace specifically for evidentiary / refinery
  // contexts (LBMA RGG five-step + ISO 22095).
  m('chain_of_custody_reasoning', 'Chain-of-Custody Reasoning', 'forensic',
    ['ratiocination', 'intelligence'],
    'Reason over the chain of custody for physical / digital evidence: assignment of custody, transfer documentation, integrity seals, hash continuity, and the impact of a single broken link on admissibility.'),

  // Travel-rule record-keeping — VASP-specific record-keeping standard.
  m('record_keeping_standard_reasoning', 'Record-Keeping Standard Reasoning', 'governance',
    ['ratiocination'],
    'Reason over which record-keeping obligations apply (FATF R.11 5y; FDL 20/2018 Art.16 5y; Travel Rule originator-beneficiary set; PDPL retention limits) and detect gaps in the supplied evidence pack.'),

  // PDPL — UAE Personal Data Protection Law application reasoning.
  m('pdpl_application_reasoning', 'PDPL Application Reasoning', 'legal_reasoning',
    ['argumentation', 'ratiocination'],
    'Determine whether the UAE PDPL (FDL 45/2021) applies to a processing activity, identify the lawful basis, and surface obligations (consent, DPIA, cross-border transfer assessment, data-subject rights).'),

  // Consent reasoning — the lawful-basis and freely-given test.
  m('consent_reasoning', 'Consent Reasoning', 'legal_reasoning',
    ['argumentation', 'reasoning'],
    'Test whether a consent-based lawful basis is valid: freely given, specific, informed, and unambiguous; identify pre-ticked boxes, bundled consent, and power-imbalance failures.'),

  // Tipping-off analysis — companion to the tipping-off-guard module; reasons
  // about whether outbound text would constitute prohibited tipping-off.
  m('tipping_off_analysis', 'Tipping-Off Analysis', 'governance',
    ['introspection', 'argumentation'],
    'Analyse outbound communications for tipping-off risk per FDL 20/2018 Art.25: explicit references to STR/SAR filings, hints of escalation, or any disclosure that would prejudice an investigation.'),

  // Escalation logic — the L1→L2→MLRO escalation decision tree.
  m('escalation_logic', 'Escalation Logic', 'governance',
    ['reasoning', 'ratiocination'],
    'Evaluate whether a finding meets the L1 → L2 → MLRO → SAR escalation thresholds; surface the path with named gates and the regulatory anchors that fix each gate.'),

  // Audit-trail integrity — extension of evidence_chain_audit specifically
  // for the case-management audit log.
  m('audit_trail_integrity_assessment', 'Audit-Trail Integrity Assessment', 'data_quality',
    ['ratiocination', 'introspection'],
    'Assess the audit trail for completeness, immutability, and tamper-evidence: hash chain continuity, four-eyes signatures, timestamp monotonicity, and gaps that would defeat a regulator examination.'),

  // Compliance maturity — Wolfsberg / FATF effectiveness IO mapping.
  m('compliance_maturity_reasoning', 'Compliance-Maturity Reasoning', 'governance',
    ['strong_brain', 'deep_thinking'],
    'Map controls evidence to the FATF effectiveness Immediate Outcomes (IO 3, 4, 8) and Wolfsberg AML programme tiers; emit a maturity grade and the gap list a regulator would record.'),

  // Examination preparation — pre-mortem for a regulator examination.
  m('examination_preparation_logic', 'Examination-Preparation Logic', 'governance',
    ['deep_thinking', 'strong_brain'],
    'Pre-mortem a regulator examination: enumerate the questions the examiner is most likely to ask, the evidence each question demands, and the gaps that would result in findings.'),
];

export const WAVE12_OVERRIDES: ReasoningMode[] = [];
