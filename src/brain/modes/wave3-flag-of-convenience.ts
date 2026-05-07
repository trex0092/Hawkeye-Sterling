// Hawkeye Sterling — wave-3 mode: flag_of_convenience
// Detects vessels registered under Flag-of-Convenience jurisdictions or
// with frequent reflagging — classic sanctions-evasion / dark-fleet
// indicator. Anchors: FATF Vessel-Risk Indicators (Sept 2020), ITF FoC
// list, IMO Resolution A.1117(30), UN Security Council Resolution 2375.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface FlagChange { flag?: string; from?: string; to?: string }

interface VesselRegistration {
  imo?: string;
  currentFlag?: string;
  currentFlagSince?: string;
  flagHistory?: FlagChange[];
  vesselType?: string;
  ownerJurisdiction?: string;
  operatorJurisdiction?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// ITF Flag-of-Convenience list as of 2024 — verify annually via
// https://www.itfglobal.org/en/sector/seafarers/flags-of-convenience
const FOC_FLAGS = new Set([
  'PA', 'LR', 'MH', 'VC', 'CY', 'MT', 'AG', 'BS', 'BM', 'KH',
  'KY', 'KM', 'GQ', 'GE', 'GI', 'HN', 'LB', 'MV', 'MU', 'MD',
  'MN', 'MM', 'KP', 'VU', 'SL', 'LK', 'TO',
]);

function flagChangesInWindow(history: FlagChange[] | undefined, monthsBack: number, now: Date = new Date()): number {
  if (!Array.isArray(history)) return 0;
  const windowStart = new Date(now.getTime() - monthsBack * 30 * 86_400_000).getTime();
  return history.filter((h) => {
    const t = h.from ? Date.parse(h.from) : NaN;
    return !Number.isNaN(t) && t >= windowStart;
  }).length;
}

export const flagOfConvenienceApply = async (ctx: BrainContext): Promise<Finding> => {
  const vessels = typedEvidence<VesselRegistration>(ctx, 'vesselRegistrations');
  if (vessels.length === 0) {
    return {
      modeId: 'flag_of_convenience',
      category: 'forensic' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No vesselRegistrations evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const v of vessels) {
    const ref = v.imo ?? '(unknown IMO)';
    const flag = (v.currentFlag ?? '').toUpperCase();
    if (flag && FOC_FLAGS.has(flag)) {
      hits.push({ id: 'foc_registration', label: `Vessel registered under ITF FoC flag: ${flag}`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    const changes24mo = flagChangesInWindow(v.flagHistory, 24);
    if (changes24mo >= 3) {
      hits.push({ id: 'frequent_reflagging', label: `${changes24mo} flag changes in 24 months (≥3)`, weight: 0.45, evidence: ref, severity: 'escalate' });
    } else if (changes24mo >= 2) {
      hits.push({ id: 'multiple_reflagging', label: `${changes24mo} flag changes in 24 months (≥2)`, weight: 0.25, evidence: ref, severity: 'flag' });
    }
    const owner = (v.ownerJurisdiction ?? '').toUpperCase();
    const op = (v.operatorJurisdiction ?? '').toUpperCase();
    if (flag && (owner || op) && owner !== flag && op !== flag) {
      hits.push({ id: 'jurisdiction_mismatch', label: `Owner/operator (${owner || '?'}/${op || '?'}) does not match flag (${flag})`, weight: 0.2, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'flag_of_convenience',
    category: 'forensic' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${vessels.length} vessel registration(s) reviewed; ${hits.length} signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF Vessel-Risk Indicators (Sept 2020) · ITF FoC list · IMO Res A.1117(30) · UNSCR 2375.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default flagOfConvenienceApply;
