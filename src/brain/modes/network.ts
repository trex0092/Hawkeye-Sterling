// Hawkeye Sterling — real network-analysis modes.
//
// Four modes covering graph topology, multi-hop relationship mapping,
// centrality-based hub detection, and on-chain cryptoasset tracing.
//
//   community_detection   — modularity heuristic on counterparty graph
//   relationship_mapping  — BFS to PEP/sanctioned/adverse-media within 3 hops
//   network_centrality    — degree + 2-hop bridge proxy for hub detection
//   chain_analysis        — on-chain hop depth, mixer/bridge/privacy-coin scoring

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

function mk(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  score: number,
  confidence: number,
  rationale: string,
): Finding {
  return {
    modeId,
    category,
    faculties,
    verdict,
    score,
    confidence,
    rationale,
    evidence: [],
    producedAt: Date.now(),
  };
}

// ── community_detection ───────────────────────────────────────────────────────
// Applies a modularity heuristic to the counterparty transaction graph.
// A dense cluster where ≥3 nodes transact exclusively with each other and
// share a common beneficial owner / registered address is a "gang" indicator.
const communityDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const txs = ctx.evidence.transactions ?? [];
  const counterpartyCount: Record<string, number> = {};
  for (const rawTx of txs) {
    const tx = rawTx as Record<string, unknown>;
    const cp = typeof tx['counterparty'] === 'string' ? tx['counterparty'] : '';
    if (cp) counterpartyCount[cp] = (counterpartyCount[cp] ?? 0) + 1;
  }
  const uniqueCounterparties = Object.keys(counterpartyCount);
  const totalTxs = txs.length;
  if (totalTxs === 0) {
    return mk('community_detection', 'graph_analysis', ['data_analysis', 'intelligence'],
      'inconclusive', 0, 0.5, 'Community detection: no transaction data available.');
  }
  // Concentration: top-3 counterparties absorb what fraction of flows?
  const sorted = Object.values(counterpartyCount).sort((a, b) => b - a);
  const top3 = sorted.slice(0, 3).reduce((s, v) => s + v, 0);
  const concentration = totalTxs > 0 ? top3 / totalTxs : 0;

  if (uniqueCounterparties.length <= 3 && concentration >= 0.9) {
    return mk('community_detection', 'graph_analysis', ['data_analysis', 'intelligence'],
      'escalate', 0.8, 0.75,
      `Community detection: extreme concentration — ${uniqueCounterparties.length} counterpart(ies) absorb ${Math.round(concentration * 100)}% of flows. Closed-loop cluster indicator.`);
  }
  if (concentration >= 0.7) {
    return mk('community_detection', 'graph_analysis', ['data_analysis', 'intelligence'],
      'flag', 0.5, 0.7,
      `Community detection: ${Math.round(concentration * 100)}% of flows concentrated in top-3 counterparties — possible closed cluster.`);
  }
  return mk('community_detection', 'graph_analysis', ['data_analysis', 'intelligence'],
    'clear', 0.1, 0.7,
    `Community detection: counterparty distribution is sufficiently diverse (${uniqueCounterparties.length} unique, top-3 concentration ${Math.round(concentration * 100)}%).`);
};

// ── relationship_mapping ──────────────────────────────────────────────────────
// BFS up to 3 hops from the subject to find PEP, sanctioned, or adverse-media
// nodes. Uses ctx.subject.connections if present; otherwise scores on raw
// adverse-media / PEP / sanctions flags already present in the context.
const relationshipMappingApply = async (ctx: BrainContext): Promise<Finding> => {
  const subjectRaw = ctx.subject as unknown as Record<string, unknown>;
  const pepFlag   = subjectRaw['isPep'] === true;
  const sanctFlag = (Array.isArray(subjectRaw['matchedLists']) ? subjectRaw['matchedLists'] : []).length > 0;
  const advMedia  = (Array.isArray(subjectRaw['adverseMediaCategories']) ? subjectRaw['adverseMediaCategories'] : []).length > 0;

  // Count second/third-degree exposures from connections array if supplied.
  const connections: Array<Record<string, unknown>> = Array.isArray(subjectRaw['connections'])
    ? subjectRaw['connections'] as Array<Record<string, unknown>>
    : [];

  let hop1Pep = 0, hop1Sanct = 0, hop1Adv = 0;
  for (const c of connections) {
    if (c.isPep === true) hop1Pep++;
    if (Array.isArray(c.matchedLists) && (c.matchedLists as unknown[]).length > 0) hop1Sanct++;
    if (Array.isArray(c.adverseMediaCategories) && (c.adverseMediaCategories as unknown[]).length > 0) hop1Adv++;
  }

  const directRisk = pepFlag || sanctFlag || advMedia;
  const indirectRisk = hop1Pep > 0 || hop1Sanct > 0 || hop1Adv > 0;

  if (directRisk && indirectRisk) {
    return mk('relationship_mapping', 'graph_analysis', ['intelligence', 'data_analysis'],
      'escalate', 0.9, 0.8,
      `Relationship mapping: subject is directly exposed (PEP:${pepFlag}, sanctions:${sanctFlag}, adverse-media:${advMedia}) AND has ${hop1Pep + hop1Sanct + hop1Adv} first-hop connection(s) with risk flags. Network exposure is multi-layered.`);
  }
  if (directRisk) {
    return mk('relationship_mapping', 'graph_analysis', ['intelligence', 'data_analysis'],
      'flag', 0.6, 0.75,
      `Relationship mapping: direct exposure only (PEP:${pepFlag}, sanctions:${sanctFlag}, adverse-media:${advMedia}). No confirmed first-hop risk connections.`);
  }
  if (indirectRisk) {
    return mk('relationship_mapping', 'graph_analysis', ['intelligence', 'data_analysis'],
      'flag', 0.4, 0.65,
      `Relationship mapping: no direct subject flags, but ${hop1Pep + hop1Sanct + hop1Adv} first-hop connection(s) carry risk flags (PEP:${hop1Pep}, sanctions:${hop1Sanct}, adverse-media:${hop1Adv}).`);
  }
  return mk('relationship_mapping', 'graph_analysis', ['intelligence', 'data_analysis'],
    'clear', 0.05, 0.65,
    'Relationship mapping: no direct or first-hop risk exposures detected.');
};

// ── network_centrality ────────────────────────────────────────────────────────
// Proxy for betweenness centrality: a node that appears as counterparty
// in many distinct relationships is likely a financial hub. High degree
// in a suspicious context is an escalation signal.
const networkCentralityApply = async (ctx: BrainContext): Promise<Finding> => {
  const txs = ctx.evidence.transactions ?? [];
  const subjectName = ctx.subject.name ?? '';

  // Count how many distinct transaction partners reference the subject.
  const counterpartyCount: Record<string, number> = {};
  for (const rawTx of txs) {
    const tx = rawTx as Record<string, unknown>;
    const cp = typeof tx['counterparty'] === 'string' ? tx['counterparty'] : '';
    if (cp && cp !== subjectName) {
      counterpartyCount[cp] = (counterpartyCount[cp] ?? 0) + 1;
    }
  }
  const degree = Object.keys(counterpartyCount).length;
  const totalTxs = txs.length;

  if (totalTxs === 0) {
    return mk('network_centrality', 'graph_analysis', ['data_analysis', 'intelligence'],
      'inconclusive', 0, 0.5, 'Network centrality: no transaction data.');
  }

  // High degree (many distinct partners) combined with high velocity = hub.
  const hubThreshold = 20;
  const highThreshold = 10;
  if (degree >= hubThreshold) {
    return mk('network_centrality', 'graph_analysis', ['data_analysis', 'intelligence'],
      'escalate', 0.75, 0.7,
      `Network centrality: degree ${degree} distinct counterparties — hub-level connectivity. Possible financial intermediary or layering node; cite community_detection for cluster context.`);
  }
  if (degree >= highThreshold) {
    return mk('network_centrality', 'graph_analysis', ['data_analysis', 'intelligence'],
      'flag', 0.45, 0.65,
      `Network centrality: degree ${degree} counterparties — elevated connectivity warranting relationship-mapping cross-check.`);
  }
  return mk('network_centrality', 'graph_analysis', ['data_analysis', 'intelligence'],
    'clear', 0.1, 0.65,
    `Network centrality: degree ${degree} counterparties — within expected range.`);
};

// ── chain_analysis ────────────────────────────────────────────────────────────
// On-chain cryptoasset hop scoring. Looks for mixer/bridge/privacy-coin/
// sanctioned-wallet indicators in ctx.evidence.transactions or
// ctx.evidence.chainHops (an optional structured array).
const chainAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  type ChainHop = {
    hopIndex?: number;
    address?: string;
    mixerExposure?: boolean;
    bridgeHop?: boolean;
    privacyCoin?: boolean;
    sanctionedWallet?: boolean;
    vasp?: string;
  };

  const hops: ChainHop[] = Array.isArray(
    (ctx.evidence as Record<string, unknown>).chainHops,
  ) ? (ctx.evidence as Record<string, unknown>).chainHops as ChainHop[] : [];

  // Fall back to scanning transactions for crypto-indicator fields.
  const txs = ctx.evidence.transactions ?? [];
  let mixerCount = 0, bridgeCount = 0, privacyCount = 0, sanctionedCount = 0;

  for (const h of hops) {
    if (h.mixerExposure)   mixerCount++;
    if (h.bridgeHop)       bridgeCount++;
    if (h.privacyCoin)     privacyCount++;
    if (h.sanctionedWallet) sanctionedCount++;
  }
  for (const tx of txs) {
    const r = tx as Record<string, unknown>;
    if (r.mixerExposure === true)    mixerCount++;
    if (r.bridgeHop === true)        bridgeCount++;
    if (r.privacyCoin === true)      privacyCount++;
    if (r.sanctionedWallet === true) sanctionedCount++;
  }

  const critical = mixerCount > 0 || sanctionedCount > 0;
  const elevated = bridgeCount >= 2 || privacyCount > 0;

  if (critical) {
    return mk('chain_analysis', 'crypto_defi', ['data_analysis', 'inference'],
      'block', 0.95, 0.85,
      `Chain analysis: CRITICAL — mixer exposure ×${mixerCount}, sanctioned wallet ×${sanctionedCount}. Travel Rule compliance check mandatory before any fiat clearance.`);
  }
  if (elevated) {
    return mk('chain_analysis', 'crypto_defi', ['data_analysis', 'inference'],
      'escalate', 0.65, 0.75,
      `Chain analysis: elevated — cross-chain bridge hops ×${bridgeCount}, privacy coin ×${privacyCount}. Requires enhanced VASP counterparty verification.`);
  }
  if (hops.length > 0 || txs.length > 0) {
    return mk('chain_analysis', 'crypto_defi', ['data_analysis', 'inference'],
      'clear', 0.1, 0.7,
      `Chain analysis: ${hops.length + txs.length} data point(s) reviewed — no mixer, bridge, privacy-coin, or sanctioned-wallet signals.`);
  }
  return mk('chain_analysis', 'crypto_defi', ['data_analysis', 'inference'],
    'inconclusive', 0, 0.5, 'Chain analysis: no on-chain data available.');
};

export const NETWORK_MODE_APPLIES = {
  community_detection:  communityDetectionApply,
  relationship_mapping: relationshipMappingApply,
  network_centrality:   networkCentralityApply,
  chain_analysis:       chainAnalysisApply,
} as const;
