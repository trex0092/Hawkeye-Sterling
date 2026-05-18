// Hawkeye Sterling — wave-3 mode: art_auction_provenance_gap
// (audit follow-up #7 + #48). Detects provenance + wash-trade signals
// in high-value art / NFT transactions.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface ArtTransaction {
  pieceId?: string;
  title?: string;
  artist?: string;
  saleAmountUsd?: number;
  saleDate?: string;
  sellerEntity?: string;
  buyerEntity?: string;
  buyerType?: 'individual' | 'shell' | 'foundation' | 'museum' | 'unknown';
  provenanceChain?: Array<{ owner: string; from: string; to?: string }>;
  catalogueRaisonneListed?: boolean;
  freeportStorage?: boolean;
  rapidResaleDays?: number;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const artProvenanceGapApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<ArtTransaction>(ctx, 'artTransactions');
  if (txns.length === 0) {
    return {
      modeId: 'art_auction_provenance_gap',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No artTransactions evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];

  for (const t of txns) {
    // 1. Provenance gap.
    const chain = t.provenanceChain ?? [];
    if (chain.length === 0) {
      hits.push({ id: 'no_provenance', label: 'No provenance chain supplied', weight: 0.15, evidence: t.title ?? t.pieceId ?? '?' });
    } else {
      // Detect time gaps > 20 years between consecutive owners.
      for (let i = 1; i < chain.length; i++) {
        const prev = chain[i - 1];
        const cur = chain[i];
        if (!prev || !cur) continue;
        if (!prev.to || !cur.from) continue;
        const gap = (Date.parse(cur.from) - Date.parse(prev.to)) / (365 * 86_400_000);
        if (gap > 20) {
          hits.push({ id: 'provenance_time_gap', label: `Provenance gap ${gap.toFixed(0)} years`, weight: 0.2, evidence: `${prev.owner} (${prev.to}) → ${cur.owner} (${cur.from})` });
        }
      }
    }

    // 2. Catalogue-raisonné absence (canonical for major artists).
    if (t.catalogueRaisonneListed === false && t.artist) {
      hits.push({ id: 'no_catalogue_raisonne', label: `Not in catalogue raisonné for ${t.artist}`, weight: 0.2, evidence: t.title ?? t.pieceId ?? '?' });
    }

    // 3. Shell buyer.
    if (t.buyerType === 'shell') {
      hits.push({ id: 'shell_buyer', label: 'Buyer is a shell entity', weight: 0.15, evidence: t.buyerEntity ?? '?' });
    }

    // 4. Freeport storage with rapid resale.
    if (t.freeportStorage && t.rapidResaleDays !== undefined && t.rapidResaleDays < 365) {
      hits.push({ id: 'freeport_rapid_resale', label: `Freeport storage + rapid resale (${t.rapidResaleDays}d)`, weight: 0.3, evidence: t.title ?? '?' });
    }

    // 5. Wash-trade — same parties on both sides via shared shell.
    if (t.sellerEntity && t.buyerEntity && t.sellerEntity === t.buyerEntity) {
      hits.push({ id: 'self_dealing', label: 'Same entity on both sides of sale', weight: 0.4, evidence: t.sellerEntity });
    }

    // 6. Out-of-band high-value (>$1M without provenance).
    if ((t.saleAmountUsd ?? 0) >= 1_000_000 && chain.length === 0) {
      hits.push({ id: 'high_value_no_provenance', label: '$1M+ sale without provenance', weight: 0.3, evidence: `$${(t.saleAmountUsd ?? 0).toLocaleString()}` });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'art_auction_provenance_gap',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} art-provenance signal(s) across ${txns.length} txn(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.22 · OFAC Art Market Advisory 2020 · UAE FDL 10/2025 Art.4.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default artProvenanceGapApply;
