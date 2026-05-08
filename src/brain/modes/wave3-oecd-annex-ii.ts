// Hawkeye Sterling — wave-3 mode: oecd_annex_ii_discipline
// Detects gold-supply-chain red flags from the OECD Due Diligence Guidance
// Annex II (Conflict-Affected & High-Risk Areas).
// Anchors: OECD DDG Gold Supplement (2016) Annex II red-flag locations
// & circumstances; LBMA RGG v9; UAE MoE Circular 2/2024;
// UN Security Council Resolution 1857 (DRC, gold-trade nexus).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface GoldShipment {
  shipmentId?: string;
  originCountry?: string;
  transitCountries?: string[];
  refinery?: string;
  refineryRmapStatus?: 'conformant' | 'active' | 'expired' | 'not_enrolled';
  smelterId?: string;
  isCahraOrigin?: boolean;
  hasArtisanalOrigin?: boolean;
  hasMilitaryControl?: boolean;
  yearOfShipment?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate' | 'block'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// UN/OFAC/EU sanctioned country list relevant to gold trade as of 2024.
const SANCTIONED_COUNTRIES = new Set([
  'IR', 'KP', 'SY', 'CU', 'RU', 'BY', 'VE', 'MM',
]);

export const oecdAnnexIIDisciplineApply = async (ctx: BrainContext): Promise<Finding> => {
  const shipments = typedEvidence<GoldShipment>(ctx, 'goldSupplyChain');
  if (shipments.length === 0) {
    return {
      modeId: 'oecd_annex_ii_discipline',
      category: 'compliance_framework' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No goldSupplyChain evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const s of shipments) {
    const ref = s.shipmentId ?? '(unidentified)';
    const transit = (s.transitCountries ?? []).map((c) => c.toUpperCase());

    if (s.hasMilitaryControl) {
      hits.push({ id: 'military_control', label: 'Mine/refinery under non-state armed group control (Annex II §1.b)', weight: 0.6, evidence: ref, severity: 'block' });
    }
    if (s.isCahraOrigin && s.refineryRmapStatus === 'not_enrolled') {
      hits.push({ id: 'cahra_no_rmap', label: 'CAHRA-origin gold from RMAP-not-enrolled refinery', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (s.isCahraOrigin && s.refineryRmapStatus === 'expired') {
      hits.push({ id: 'cahra_rmap_expired', label: 'CAHRA-origin gold from RMAP-expired refinery', weight: 0.35, evidence: ref, severity: 'flag' });
    }
    if (s.hasArtisanalOrigin && !s.isCahraOrigin) {
      hits.push({ id: 'artisanal_no_cahra', label: 'Artisanal sourcing without CAHRA flag (Annex II §1.a — verify chain)', weight: 0.25, evidence: ref, severity: 'flag' });
    }
    const sanctionedTransit = transit.filter((c) => SANCTIONED_COUNTRIES.has(c));
    if (sanctionedTransit.length > 0) {
      hits.push({
        id: 'sanctioned_transit',
        label: `Transit through sanctioned country: ${sanctionedTransit.join(', ')}`,
        weight: 0.5,
        evidence: ref,
        severity: 'escalate',
      });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'block') ? 'block'
    : hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'oecd_annex_ii_discipline',
    category: 'compliance_framework' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.95, 0.55 + 0.06 * hits.length),
    verdict,
    rationale: [
      `${shipments.length} gold shipment(s) reviewed; ${hits.length} Annex II red-flag(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: OECD DDG Gold Supplement Annex II · LBMA RGG v9 · UAE MoE Circular 2/2024 · UNSCR 1857.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default oecdAnnexIIDisciplineApply;
