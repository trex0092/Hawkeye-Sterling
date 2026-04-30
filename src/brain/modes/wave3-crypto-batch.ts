// Hawkeye Sterling — wave-3 crypto batch (12 modes).
// Anchors: FATF R.15 + Travel Rule · UAE VARA Rulebooks · OFAC SDN.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
type ModeApply = (ctx: BrainContext) => Promise<Finding>;
const FAC: FacultyId[] = ['data_analysis', 'forensic_accounting'];
const CAT: ReasoningCategory = 'cryptoasset_forensics';
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}
function empty(modeId: string, key: string): Finding {
  return { modeId, category: CAT, faculties: FAC, score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict, rationale: `No ${key} evidence supplied.`, evidence: [], producedAt: Date.now() };
}
function build(modeId: string, hits: SignalHit[], n: number, anchors: string): Finding {
  const raw = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(raw > 0.7 ? 0.7 + (raw - 0.7) * 0.3 : raw);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
  return { modeId, category: CAT, faculties: FAC, score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict, rationale: `${hits.length} signal(s) over ${n} item(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: ${anchors}.`, evidence: hits.slice(0, 8).map((h) => h.evidence), producedAt: Date.now() };
}

interface VaspTransfer { transferId: string; originatorVaspIdentified?: boolean; beneficiaryVaspIdentified?: boolean; valueAedEquivalent?: number; travelRuleAttached?: boolean; }
const travelRuleApply: ModeApply = async (ctx) => {
  const items = typedEvidence<VaspTransfer>(ctx, 'vaspTransfers');
  if (items.length === 0) return empty('travel_rule_compliance_gap', 'vaspTransfers');
  const hits: SignalHit[] = [];
  for (const i of items) {
    const overThreshold = (i.valueAedEquivalent ?? 0) >= 3_675;
    if (overThreshold && i.travelRuleAttached !== true) hits.push({ id: 'missing_travel_rule', label: `≥AED 3,675 transfer without travel-rule`, weight: 0.4, evidence: i.transferId });
    if (overThreshold && i.originatorVaspIdentified === false) hits.push({ id: 'unidentified_originator', label: 'Originator VASP unidentified', weight: 0.3, evidence: i.transferId });
  }
  return build('travel_rule_compliance_gap', hits, items.length, 'FATF R.16/R.15 · UAE VARA · USD 1k threshold (~AED 3,675)');
};

interface UnhostedFlow { addr: string; volumeAedLast30d?: number; counterpartyVaspName?: string; sourceOfFundsKnown?: boolean; }
const unhostedWalletApply: ModeApply = async (ctx) => {
  const items = typedEvidence<UnhostedFlow>(ctx, 'unhostedFlows');
  if (items.length === 0) return empty('unhosted_wallet_high_volume', 'unhostedFlows');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.volumeAedLast30d ?? 0) >= 1_000_000) hits.push({ id: 'high_volume_unhosted', label: `${i.volumeAedLast30d} AED last 30d`, weight: 0.35, evidence: i.addr });
    if (i.sourceOfFundsKnown === false) hits.push({ id: 'unknown_source', label: 'Source of funds unknown', weight: 0.3, evidence: i.addr });
  }
  return build('unhosted_wallet_high_volume', hits, items.length, 'FATF Targeted Update on VASPs 2023 · VARA');
};

interface PeelingChain { chainId: string; hopCount?: number; peelOffPercentMedian?: number; finalDestinationFlagged?: boolean; }
const peelingChainApply: ModeApply = async (ctx) => {
  const items = typedEvidence<PeelingChain>(ctx, 'peelingChains');
  if (items.length === 0) return empty('peeling_chain_pattern', 'peelingChains');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.hopCount ?? 0) >= 8) hits.push({ id: 'long_peel', label: `${i.hopCount} hops`, weight: 0.35, evidence: i.chainId });
    if ((i.peelOffPercentMedian ?? 0) > 0 && (i.peelOffPercentMedian ?? 0) <= 0.05) hits.push({ id: 'small_peelings', label: `Median peel ${((i.peelOffPercentMedian ?? 0) * 100).toFixed(1)}%`, weight: 0.3, evidence: i.chainId });
    if (i.finalDestinationFlagged === true) hits.push({ id: 'final_dest_flagged', label: 'Final destination flagged', weight: 0.4, evidence: i.chainId });
  }
  return build('peeling_chain_pattern', hits, items.length, 'Chainalysis crypto crime taxonomy · FATF VASP Guidance');
};

interface CoinjoinTx { txId: string; participantCount?: number; mixerName?: string; postMixDestinationFlagged?: boolean; }
const coinjoinApply: ModeApply = async (ctx) => {
  const items = typedEvidence<CoinjoinTx>(ctx, 'coinjoinTxs');
  if (items.length === 0) return empty('coinjoin_participation', 'coinjoinTxs');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.participantCount ?? 0) >= 10) hits.push({ id: 'high_anonset', label: `${i.participantCount} participants`, weight: 0.3, evidence: i.txId });
    if (i.mixerName) hits.push({ id: 'identified_mixer', label: i.mixerName, weight: 0.35, evidence: i.txId });
    if (i.postMixDestinationFlagged === true) hits.push({ id: 'post_mix_dest_flagged', label: 'Post-mix destination flagged', weight: 0.4, evidence: i.txId });
  }
  return build('coinjoin_participation', hits, items.length, 'FATF VASP Guidance 2021 · OFAC Wasabi/Samourai actions');
};

interface TornadoFlow { addrTrace: string; depositToTornado?: boolean; withdrawalFromTornado?: boolean; hopsToSubject?: number; }
const tornadoCashApply: ModeApply = async (ctx) => {
  const items = typedEvidence<TornadoFlow>(ctx, 'tornadoFlows');
  if (items.length === 0) return empty('tornado_cash_proximity', 'tornadoFlows');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.depositToTornado === true && (i.hopsToSubject ?? Infinity) <= 2) hits.push({ id: 'deposit_proximity', label: `Tornado deposit ${i.hopsToSubject} hops away`, weight: 0.5, evidence: i.addrTrace });
    if (i.withdrawalFromTornado === true && (i.hopsToSubject ?? Infinity) <= 2) hits.push({ id: 'withdrawal_proximity', label: `Tornado withdrawal ${i.hopsToSubject} hops away`, weight: 0.5, evidence: i.addrTrace });
  }
  return build('tornado_cash_proximity', hits, items.length, 'OFAC Tornado Cash designation 2022');
};

interface AddrMatch { addr: string; cluster?: string; lazarusOverlap?: boolean; confidence?: number; }
const lazarusAddressApply: ModeApply = async (ctx) => {
  const items = typedEvidence<AddrMatch>(ctx, 'addressMatches');
  if (items.length === 0) return empty('lazarus_address_match', 'addressMatches');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.lazarusOverlap === true && (i.confidence ?? 0) >= 0.8) hits.push({ id: 'lazarus_high_conf', label: `Lazarus cluster overlap (conf=${i.confidence?.toFixed(2)})`, weight: 0.55, evidence: `${i.addr} (${i.cluster ?? '?'})` });
    else if (i.lazarusOverlap === true) hits.push({ id: 'lazarus_low_conf', label: `Lazarus possible overlap`, weight: 0.3, evidence: i.addr });
  }
  return build('lazarus_address_match', hits, items.length, 'OFAC SDN · DPRK Lazarus Group');
};

interface SdnAddrMatch { addr: string; sdnProgram?: string; matchType?: 'exact' | 'cluster' | 'fuzzy'; }
const ofacSdnAddrApply: ModeApply = async (ctx) => {
  const items = typedEvidence<SdnAddrMatch>(ctx, 'sdnAddrMatches');
  if (items.length === 0) return empty('ofac_sdn_address_match', 'sdnAddrMatches');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.matchType === 'exact') hits.push({ id: 'sdn_exact', label: `Exact SDN match (${i.sdnProgram})`, weight: 0.6, evidence: i.addr });
    else if (i.matchType === 'cluster') hits.push({ id: 'sdn_cluster', label: `SDN cluster match (${i.sdnProgram})`, weight: 0.4, evidence: i.addr });
    else if (i.matchType === 'fuzzy') hits.push({ id: 'sdn_fuzzy', label: 'Fuzzy SDN match', weight: 0.2, evidence: i.addr });
  }
  return build('ofac_sdn_address_match', hits, items.length, 'OFAC SDN List');
};

interface DefiLoan { positionId: string; protocol?: string; recursiveLoops?: number; collateralRatio?: number; }
const defiRecursiveApply: ModeApply = async (ctx) => {
  const items = typedEvidence<DefiLoan>(ctx, 'defiLoans');
  if (items.length === 0) return empty('defi_recursive_loan', 'defiLoans');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.recursiveLoops ?? 0) >= 5) hits.push({ id: 'leverage_loop', label: `${i.recursiveLoops} recursive loops`, weight: 0.4, evidence: `${i.positionId} (${i.protocol})` });
    if ((i.collateralRatio ?? 2) < 1.1) hits.push({ id: 'razor_thin_collateral', label: `Collateral ratio ${i.collateralRatio?.toFixed(2)}`, weight: 0.3, evidence: i.positionId });
  }
  return build('defi_recursive_loan', hits, items.length, 'FATF DeFi Guidance 2023 · VARA');
};

interface DrainEvent { contractAddr: string; drainedAed?: number; drainTimeMinutes?: number; signatureKnownExploit?: boolean; }
const smartContractDrainApply: ModeApply = async (ctx) => {
  const items = typedEvidence<DrainEvent>(ctx, 'drainEvents');
  if (items.length === 0) return empty('smart_contract_drain', 'drainEvents');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.drainedAed ?? 0) >= 5_000_000) hits.push({ id: 'large_drain', label: `Drain AED ${i.drainedAed}`, weight: 0.45, evidence: i.contractAddr });
    if ((i.drainTimeMinutes ?? Infinity) <= 5) hits.push({ id: 'rapid_drain', label: `Drained in ${i.drainTimeMinutes}min`, weight: 0.3, evidence: i.contractAddr });
    if (i.signatureKnownExploit === true) hits.push({ id: 'known_exploit_sig', label: 'Known exploit signature', weight: 0.25, evidence: i.contractAddr });
  }
  return build('smart_contract_drain', hits, items.length, 'Chainalysis exploit taxonomy · FATF VASP Guidance');
};

interface FlashLoanTx { txId: string; loanAmountAed?: number; profitAed?: number; victimProtocols?: string[]; samBlockExecution?: boolean; }
const flashLoanApply: ModeApply = async (ctx) => {
  const items = typedEvidence<FlashLoanTx>(ctx, 'flashLoans');
  if (items.length === 0) return empty('flash_loan_attack_pattern', 'flashLoans');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.victimProtocols ?? []).length >= 1 && (i.profitAed ?? 0) >= 100_000) {
      hits.push({ id: 'attack_profit', label: `Profit ${i.profitAed} via ${(i.victimProtocols ?? []).length} victim(s)`, weight: 0.5, evidence: i.txId });
    }
    if (i.samBlockExecution === true) hits.push({ id: 'same_block_exec', label: 'Single-block flash attack', weight: 0.3, evidence: i.txId });
  }
  return build('flash_loan_attack_pattern', hits, items.length, 'DeFi exploit literature · FATF DeFi Guidance');
};

interface RugpullSignal { tokenAddr: string; liquidityRemovedPct?: number; teamWalletConcentrationPct?: number; mintFunctionPresent?: boolean; }
const rugpullApply: ModeApply = async (ctx) => {
  const items = typedEvidence<RugpullSignal>(ctx, 'rugpullSignals');
  if (items.length === 0) return empty('rugpull_indicator', 'rugpullSignals');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.liquidityRemovedPct ?? 0) >= 0.8) hits.push({ id: 'liquidity_pulled', label: `${((i.liquidityRemovedPct ?? 0) * 100).toFixed(0)}% liquidity removed`, weight: 0.5, evidence: i.tokenAddr });
    if ((i.teamWalletConcentrationPct ?? 0) >= 0.5) hits.push({ id: 'team_concentration', label: `Team holds ${((i.teamWalletConcentrationPct ?? 0) * 100).toFixed(0)}%`, weight: 0.3, evidence: i.tokenAddr });
    if (i.mintFunctionPresent === true) hits.push({ id: 'mint_backdoor', label: 'Owner-only mint function', weight: 0.25, evidence: i.tokenAddr });
  }
  return build('rugpull_indicator', hits, items.length, 'FATF VASP Guidance 2021 · VARA token issuance rules');
};

interface StablecoinArb { eventId: string; depegPctFromPar?: number; arbProfitAed?: number; venueFlagged?: boolean; }
const stablecoinArbApply: ModeApply = async (ctx) => {
  const items = typedEvidence<StablecoinArb>(ctx, 'stablecoinArbs');
  if (items.length === 0) return empty('stablecoin_arbitrage_anomaly', 'stablecoinArbs');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (Math.abs(i.depegPctFromPar ?? 0) >= 0.05 && (i.arbProfitAed ?? 0) >= 100_000) hits.push({ id: 'depeg_arb', label: `Depeg ${((i.depegPctFromPar ?? 0) * 100).toFixed(1)}%, profit ${i.arbProfitAed}`, weight: 0.35, evidence: i.eventId });
    if (i.venueFlagged === true) hits.push({ id: 'flagged_venue', label: 'Flagged exchange involved', weight: 0.3, evidence: i.eventId });
  }
  return build('stablecoin_arbitrage_anomaly', hits, items.length, 'FATF Stablecoin Update 2020 · VARA');
};

export const CRYPTO_BATCH_APPLIES: Record<string, ModeApply> = {
  travel_rule_compliance_gap: travelRuleApply,
  unhosted_wallet_high_volume: unhostedWalletApply,
  peeling_chain_pattern: peelingChainApply,
  coinjoin_participation: coinjoinApply,
  tornado_cash_proximity: tornadoCashApply,
  lazarus_address_match: lazarusAddressApply,
  ofac_sdn_address_match: ofacSdnAddrApply,
  defi_recursive_loan: defiRecursiveApply,
  smart_contract_drain: smartContractDrainApply,
  flash_loan_attack_pattern: flashLoanApply,
  rugpull_indicator: rugpullApply,
  stablecoin_arbitrage_anomaly: stablecoinArbApply,
};
