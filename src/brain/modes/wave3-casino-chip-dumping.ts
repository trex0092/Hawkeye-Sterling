// Hawkeye Sterling — wave-3 mode: casino_chip_dumping
// Detects casino chip-layering: large chip purchases, minimal play,
// chip cash-out — a classic placement / layering technique. Anchors:
// FATF Casino Sector report 2009 · UAE FDL 10/2025 Art.15.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface CasinoSession {
  sessionId: string;
  customerId: string;
  chipPurchaseAed?: number;
  chipsPlayedAed?: number;
  chipsCashedOutAed?: number;
  cashOutAtCage?: 'cash' | 'cheque' | 'wire';
  durationMinutes?: number;
  identityFullyVerified?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const casinoChipDumpingApply = async (ctx: BrainContext): Promise<Finding> => {
  const sessions = typedEvidence<CasinoSession>(ctx, 'casinoSessions');
  if (sessions.length === 0) {
    return {
      modeId: 'casino_chip_dumping',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No casinoSessions evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const s of sessions) {
    const purchase = s.chipPurchaseAed ?? 0;
    const played = s.chipsPlayedAed ?? 0;
    const cashedOut = s.chipsCashedOutAed ?? 0;
    if (purchase >= 50_000 && played > 0 && played / purchase < 0.1) {
      hits.push({ id: 'minimal_play_ratio', label: `Chip purchase AED${purchase} but <10% played`, weight: 0.4, evidence: `${s.sessionId} (${s.customerId}): purchase=${purchase}, played=${played}` });
    }
    if (purchase >= 25_000 && cashedOut > 0 && cashedOut / purchase >= 0.85) {
      hits.push({ id: 'high_cashout_ratio', label: `${(cashedOut / purchase * 100).toFixed(0)}% cashed out`, weight: 0.3, evidence: `${s.sessionId}: cashout=${cashedOut}/${purchase}` });
    }
    if (purchase >= 10_000 && (s.durationMinutes ?? 0) <= 15) {
      hits.push({ id: 'short_session', label: `Large purchase + ≤15min session`, weight: 0.2, evidence: `${s.sessionId}: ${s.durationMinutes}min` });
    }
    if (s.identityFullyVerified === false && purchase >= 5_000) {
      hits.push({ id: 'unverified_high_value', label: `High-value chip purchase without full ID`, weight: 0.3, evidence: `${s.sessionId} (${s.customerId})` });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'casino_chip_dumping',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} casino-chip-dumping signal(s) over ${sessions.length} session(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF Casino 2009 · UAE FDL 10/2025 Art.15.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default casinoChipDumpingApply;
