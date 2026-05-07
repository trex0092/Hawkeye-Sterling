// Hawkeye Sterling — wave-3 mode: vessel_beneficial_owner
// Detects beneficial-owner opacity on vessels involved in trade-finance
// or commodity flows. Anchors: FATF Guidance on Beneficial Ownership
// (March 2023), IMO Resolution A.1117(30) (Unique Company & Registered
// Owner Identification Number Scheme), UNSC Resolution 2397 (DPRK
// maritime sanctions evasion typology), OFAC Sanctions Advisory on the
// Maritime Industry (May 2020), EU 6AMLD Art. 30 (UBO disclosure).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface VesselOwnership {
  imoNumber?: string;                          // IMO 7-digit ship number (mandatory under IMO Res A.600(15))
  vesselName?: string;
  flagState?: string;                          // ISO country code of registry
  registeredOwner?: string;                    // entity on the registry
  beneficialOwnerDisclosed?: boolean;          // UBO chain disclosed to lender / counterparty
  ownershipChainDepth?: number;                // # of intermediary entities between vessel and UBO
  hasShellOwnerInChain?: boolean;              // any layer is a shell company per FATF criteria
  registeredOwnerImoCompanyNumber?: string;    // IMO company number (Res A.1117(30))
  ownerJurisdictionFatfGreyOrBlack?: boolean;
  flagOfConvenience?: boolean;                 // Panama, Liberia, Marshall Islands, etc.
  recentFlagChangeDays?: number;               // days since last flag change
  recentOwnerChangeDays?: number;              // days since last registered-owner change
  aisDarkPeriodHours?: number;                 // continuous AIS-off time in trailing 30 days
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate' | 'block'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// Thresholds anchored to public typologies:
// - OFAC Maritime Advisory §III.B: flag/owner change within 12 months is
//   a sanctions-evasion red flag.
// - UNSC 2397 + UN Panel of Experts reports: AIS-off > 24h while not in
//   port is a North-Korea oil-transhipment typology indicator.
// - FATF UBO Guidance §3.2: ownership-chain depth ≥ 3 with shell layers
//   is an obfuscation indicator.
const FLAG_CHANGE_WINDOW_DAYS = 365;
const OWNER_CHANGE_WINDOW_DAYS = 365;
const AIS_DARK_FLAG_HOURS = 24;
const AIS_DARK_ESCALATE_HOURS = 72;
const CHAIN_DEPTH_FLAG = 3;
const CHAIN_DEPTH_ESCALATE = 5;

export const vesselBeneficialOwnerApply = async (ctx: BrainContext): Promise<Finding> => {
  const vessels = typedEvidence<VesselOwnership>(ctx, 'vessels');
  if (vessels.length === 0) {
    return {
      modeId: 'vessel_beneficial_owner',
      category: 'forensic' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No vessels evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const v of vessels) {
    const ref = v.imoNumber ?? v.vesselName ?? '(unidentified)';
    if (!v.imoNumber || !/^\d{7}$/.test(v.imoNumber)) {
      hits.push({ id: 'no_imo_number', label: `Vessel "${v.vesselName ?? '?'}" missing or malformed IMO number`, weight: 0.3, evidence: ref, severity: 'escalate' });
    }
    if (v.beneficialOwnerDisclosed === false) {
      hits.push({ id: 'ubo_undisclosed', label: 'Beneficial owner chain not disclosed', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (typeof v.ownershipChainDepth === 'number') {
      if (v.ownershipChainDepth >= CHAIN_DEPTH_ESCALATE) {
        hits.push({ id: 'chain_depth_extreme', label: `Ownership chain depth ${v.ownershipChainDepth} (≥${CHAIN_DEPTH_ESCALATE})`, weight: 0.4, evidence: ref, severity: 'escalate' });
      } else if (v.ownershipChainDepth >= CHAIN_DEPTH_FLAG) {
        hits.push({ id: 'chain_depth_high', label: `Ownership chain depth ${v.ownershipChainDepth} (≥${CHAIN_DEPTH_FLAG})`, weight: 0.2, evidence: ref, severity: 'flag' });
      }
    }
    if (v.hasShellOwnerInChain === true) {
      hits.push({ id: 'shell_in_chain', label: 'Shell company present in ownership chain', weight: 0.35, evidence: ref, severity: 'escalate' });
    }
    if (!v.registeredOwnerImoCompanyNumber) {
      hits.push({ id: 'no_imo_company_number', label: 'Registered owner missing IMO company number (Res A.1117(30))', weight: 0.2, evidence: ref, severity: 'flag' });
    }
    if (v.ownerJurisdictionFatfGreyOrBlack === true) {
      hits.push({ id: 'owner_high_risk_jurisdiction', label: 'Registered owner in FATF grey/black-listed jurisdiction', weight: 0.3, evidence: ref, severity: 'escalate' });
    }
    if (v.flagOfConvenience === true && (v.beneficialOwnerDisclosed === false || v.hasShellOwnerInChain === true)) {
      hits.push({ id: 'foc_plus_opacity', label: `Flag-of-convenience (${v.flagState ?? '?'}) combined with UBO opacity`, weight: 0.35, evidence: ref, severity: 'escalate' });
    }
    if (typeof v.recentFlagChangeDays === 'number' && v.recentFlagChangeDays <= FLAG_CHANGE_WINDOW_DAYS) {
      hits.push({ id: 'recent_flag_change', label: `Flag changed ${v.recentFlagChangeDays} days ago (≤${FLAG_CHANGE_WINDOW_DAYS}, OFAC red flag)`, weight: 0.25, evidence: ref, severity: 'flag' });
    }
    if (typeof v.recentOwnerChangeDays === 'number' && v.recentOwnerChangeDays <= OWNER_CHANGE_WINDOW_DAYS) {
      hits.push({ id: 'recent_owner_change', label: `Registered owner changed ${v.recentOwnerChangeDays} days ago (≤${OWNER_CHANGE_WINDOW_DAYS}, OFAC red flag)`, weight: 0.25, evidence: ref, severity: 'flag' });
    }
    if (typeof v.aisDarkPeriodHours === 'number') {
      if (v.aisDarkPeriodHours >= AIS_DARK_ESCALATE_HOURS) {
        hits.push({ id: 'ais_dark_extreme', label: `AIS dark ${v.aisDarkPeriodHours}h in last 30 days (≥${AIS_DARK_ESCALATE_HOURS}h, UNSC 2397 typology)`, weight: 0.45, evidence: ref, severity: 'block' });
      } else if (v.aisDarkPeriodHours >= AIS_DARK_FLAG_HOURS) {
        hits.push({ id: 'ais_dark_significant', label: `AIS dark ${v.aisDarkPeriodHours}h in last 30 days (≥${AIS_DARK_FLAG_HOURS}h)`, weight: 0.3, evidence: ref, severity: 'escalate' });
      }
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'block') ? 'block'
    : hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'vessel_beneficial_owner',
    category: 'forensic' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${vessels.length} vessel(s) reviewed; ${hits.length} signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF UBO Guidance (Mar 2023) · IMO Res A.1117(30) · UNSC Res 2397 · OFAC Maritime Advisory (May 2020) · EU 6AMLD Art. 30.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default vesselBeneficialOwnerApply;
