// Hawkeye Sterling — wave-3 mode: crypto_chain_hop_layering
// Detects cross-asset / cross-chain hopping designed to break taint
// trace (BTC → bridge → ETH → swap → USDT → mixer). Anchors: FATF
// R.15 (VASPs) + Travel Rule · UAE VARA Rulebooks.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface ChainHop {
  hopId: string;
  fromAsset?: string;
  toAsset?: string;
  fromChain?: string;
  toChain?: string;
  bridgeProtocol?: string;
  swapProtocol?: string;
  timestampSec?: number;
  fundsAedEquivalent?: number;
  isMixerInvolved?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const cryptoChainHopApply = async (ctx: BrainContext): Promise<Finding> => {
  const hops = typedEvidence<ChainHop>(ctx, 'chainHops');
  if (hops.length === 0) {
    return {
      modeId: 'crypto_chain_hop_layering',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No chainHops evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  const distinctChains = new Set([
    ...hops.map((h) => h.fromChain).filter(Boolean),
    ...hops.map((h) => h.toChain).filter(Boolean),
  ]).size;
  const distinctAssets = new Set([
    ...hops.map((h) => h.fromAsset).filter(Boolean),
    ...hops.map((h) => h.toAsset).filter(Boolean),
  ]).size;
  const mixerHops = hops.filter((h) => h.isMixerInvolved === true);
  const bridgeHops = hops.filter((h) => h.bridgeProtocol);
  const swapHops = hops.filter((h) => h.swapProtocol);

  if (distinctChains >= 3) hits.push({ id: 'multi_chain_hop', label: `Funds touched ${distinctChains} chains`, weight: 0.3, evidence: `${distinctChains} chains` });
  if (distinctAssets >= 4) hits.push({ id: 'multi_asset_hop', label: `Funds touched ${distinctAssets} assets`, weight: 0.25, evidence: `${distinctAssets} assets` });
  if (mixerHops.length >= 1) hits.push({ id: 'mixer_in_chain', label: `${mixerHops.length} mixer hop(s)`, weight: 0.4, evidence: mixerHops.slice(0, 4).map((h) => h.hopId).join(', ') });
  if (bridgeHops.length >= 2) hits.push({ id: 'multi_bridge', label: `${bridgeHops.length} bridge hop(s)`, weight: 0.2, evidence: Array.from(new Set(bridgeHops.map((h) => h.bridgeProtocol).filter(Boolean))).slice(0, 4).join(', ') });
  if (swapHops.length >= 3) hits.push({ id: 'rapid_swaps', label: `${swapHops.length} swap hops`, weight: 0.2, evidence: Array.from(new Set(swapHops.map((h) => h.swapProtocol).filter(Boolean))).slice(0, 4).join(', ') });

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'crypto_chain_hop_layering',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} chain-hop signal(s) over ${hops.length} hop(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.15 + Travel Rule · UAE VARA Rulebooks.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default cryptoChainHopApply;
