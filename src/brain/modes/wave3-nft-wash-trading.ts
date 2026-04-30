// Hawkeye Sterling — wave-3 mode: nft_wash_trading
// Detects NFT wash-trading patterns: self-loops, ring trades, no-bid
// floor inflation. Anchors: FATF VASP Guidance 2021 · UAE VARA NFT
// Rulebook.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface NftTrade {
  tradeId: string;
  collectionId: string;
  tokenId: string;
  fromAddr: string;
  toAddr: string;
  priceAed?: number;
  blockTimestampSec?: number;
  fundedFromSameAncestorWallet?: boolean;
  isInternalRing?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const nftWashTradingApply = async (ctx: BrainContext): Promise<Finding> => {
  const trades = typedEvidence<NftTrade>(ctx, 'nftTrades');
  if (trades.length === 0) {
    return {
      modeId: 'nft_wash_trading',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No nftTrades evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  const selfLoops = trades.filter((t) => t.fromAddr === t.toAddr);
  const ringTrades = trades.filter((t) => t.isInternalRing === true);
  const sameAncestor = trades.filter((t) => t.fundedFromSameAncestorWallet === true);

  // Round-trip detection: same token traded back to seller within 24h.
  const byToken = new Map<string, NftTrade[]>();
  for (const t of trades) {
    const k = `${t.collectionId}/${t.tokenId}`;
    const arr = byToken.get(k);
    if (arr) arr.push(t); else byToken.set(k, [t]);
  }
  let roundTrips = 0;
  for (const arr of byToken.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => (a.blockTimestampSec ?? 0) - (b.blockTimestampSec ?? 0));
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const cur = arr[i];
      if (!prev || !cur) continue;
      const dt = (cur.blockTimestampSec ?? 0) - (prev.blockTimestampSec ?? 0);
      if (cur.toAddr === prev.fromAddr && dt > 0 && dt < 86_400) roundTrips++;
    }
  }

  if (selfLoops.length >= 1) hits.push({ id: 'self_loop', label: `${selfLoops.length} self-loop trades`, weight: 0.45, evidence: selfLoops.slice(0, 4).map((t) => t.tradeId).join(', ') });
  if (ringTrades.length >= 2) hits.push({ id: 'internal_ring', label: `${ringTrades.length} ring-trade(s)`, weight: 0.4, evidence: ringTrades.slice(0, 4).map((t) => t.tradeId).join(', ') });
  if (sameAncestor.length >= 2) hits.push({ id: 'common_funding_ancestor', label: `${sameAncestor.length} trades funded from common ancestor`, weight: 0.3, evidence: sameAncestor.slice(0, 4).map((t) => t.tradeId).join(', ') });
  if (roundTrips >= 2) hits.push({ id: 'rapid_round_trip', label: `${roundTrips} round-trip(s) within 24h`, weight: 0.3, evidence: `${roundTrips} round-trips` });

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'nft_wash_trading',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} NFT-wash-trading signal(s) over ${trades.length} trade(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF VASP Guidance 2021 · UAE VARA NFT Rulebook.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default nftWashTradingApply;
