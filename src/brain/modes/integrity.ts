// Hawkeye Sterling — integrity reasoning modes (PR #224: brain weaponize batch 2).
//
// Twelve more stubs promoted to real algorithms across crypto integrity,
// market abuse, identity fraud, and forensic accounting:
//
//   - bridge_risk             — cross-chain bridge exploit / hop attribution
//   - nft_wash                — NFT wash-trading detection
//   - privacy_coin_reasoning  — privacy-coin (XMR/ZEC) exposure scoring
//   - sensitivity_tornado     — Tornado-style mixer sensitivity (sanctioned-pool taint)
//   - stablecoin_reserve      — stablecoin reserve composition + attestation freshness
//   - app_scam                — authorised push payment scam pattern
//   - synthetic_id            — synthetic-identity stitched-identifier signal
//   - market_manipulation     — pump-and-dump / spoofing / layering patterns
//   - front_running           — order-book front-running indicators
//   - lapping                 — accounts-receivable lapping pattern
//   - linguistic_forensics    — BEC / phishing linguistic markers
//   - cross_case_triangulation — corroborate findings across related cases
//
// Each consumes typed entries from ctx.evidence and returns a Finding.
// Charter P1 (no assertion without basis): every mode returns 'inconclusive'
// if its prerequisite evidence is absent. Charter P3 (training-data ban):
// these modes do not recall any external fact — they only score what the
// caller hands them.

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function mkFinding(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  score: number,
  confidence: number,
  rationale: string,
  evidence: string[] = [],
): Finding {
  return {
    modeId,
    category,
    faculties,
    score: clamp01(score),
    confidence: clamp01(confidence),
    verdict,
    rationale,
    evidence,
    producedAt: Date.now(),
  };
}

function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function singleEvidence<T>(ctx: BrainContext, key: string): T | undefined {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return v === null || v === undefined ? undefined : (v as T);
}

// ──────────────────────────────────────────────────────────────────────
// bridge_risk — cross-chain bridge exposure scoring. Bridges are the most
// frequent target of crypto-theft; sanctioned-bridge interaction is a hard
// red flag.
// ──────────────────────────────────────────────────────────────────────
interface BridgeHop {
  bridgeName: string;
  fromChain: string;
  toChain: string;
  notional: number;       // USD-equivalent
  sanctionedBridge: boolean;
  exploitHistoryUsd?: number | undefined; // cumulative known exploit volume
  sourceRef: string;
}

const bridgeRiskApply = async (ctx: BrainContext): Promise<Finding> => {
  const hops = typedEvidence<BridgeHop>(ctx, 'bridgeHops');
  if (hops.length === 0) {
    return mkFinding('bridge_risk', 'crypto_defi', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No bridge hops supplied. Mode requires bridgeHops[].');
  }
  const sanctioned = hops.filter((h) => h.sanctionedBridge);
  const exploited = hops.filter((h) => (h.exploitHistoryUsd ?? 0) >= 100_000_000);
  const totalNotional = hops.reduce((s, h) => s + h.notional, 0);
  const sanctionedNotional = sanctioned.reduce((s, h) => s + h.notional, 0);
  const sanctionedPct = totalNotional > 0 ? sanctionedNotional / totalNotional : 0;
  let verdict: Verdict;
  let score: number;
  let rationale: string;
  if (sanctioned.length > 0) {
    verdict = 'escalate';
    score = clamp01(0.7 + sanctionedPct * 0.3);
    rationale = `${sanctioned.length}/${hops.length} hop(s) traverse sanctioned bridge(s) (${sanctioned.map((h) => h.bridgeName).join(', ')}); ${(sanctionedPct * 100).toFixed(1)}% of notional. Hard freeze trigger.`;
  } else if (exploited.length > 0) {
    verdict = 'flag';
    score = 0.55;
    rationale = `${exploited.length} hop(s) via bridge(s) with >=USD 100M historical exploit volume (${exploited.map((h) => h.bridgeName).join(', ')}). Apply EDD on counterparty.`;
  } else {
    verdict = 'clear';
    score = 0.1;
    rationale = `${hops.length} bridge hop(s) reviewed; no sanctioned or major-exploit bridges in path.`;
  }
  return mkFinding('bridge_risk', 'crypto_defi', ['reasoning', 'data_analysis'],
    verdict, score, sanctioned.length > 0 ? 0.9 : 0.7, rationale, hops.map((h) => h.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// nft_wash — NFT wash-trading: same-cluster round-trip trades inflating
// volume / valuation.
// ──────────────────────────────────────────────────────────────────────
interface NftTrade {
  tokenId: string;
  buyer: string;       // wallet
  seller: string;
  pricedUsd: number;
  buyerCluster?: string | undefined; // chain-analytics cluster ID
  sellerCluster?: string | undefined;
  sourceRef: string;
}

const nftWashApply = async (ctx: BrainContext): Promise<Finding> => {
  const trades = typedEvidence<NftTrade>(ctx, 'nftTrades');
  if (trades.length === 0) {
    return mkFinding('nft_wash', 'crypto_defi', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No NFT trades supplied. Mode requires nftTrades[].');
  }
  const sameCluster = trades.filter(
    (t) => t.buyerCluster && t.sellerCluster && t.buyerCluster === t.sellerCluster,
  );
  const sameWallet = trades.filter((t) => t.buyer === t.seller);
  const ratio = (sameCluster.length + sameWallet.length) / trades.length;
  const score = clamp01(ratio * 1.2);
  const verdict: Verdict = ratio >= 0.4 ? 'escalate' : ratio >= 0.15 ? 'flag' : 'clear';
  const rationale = sameWallet.length > 0
    ? `${sameWallet.length} trade(s) have buyer == seller (same wallet wash-trade); ${sameCluster.length} additional same-cluster trades. Ratio ${(ratio * 100).toFixed(1)}%.`
    : sameCluster.length > 0
      ? `${sameCluster.length}/${trades.length} (${(ratio * 100).toFixed(1)}%) trades match same chain-analytics cluster on both sides — wash-trading indicator.`
      : `${trades.length} trade(s) reviewed; no same-cluster or self-trade patterns.`;
  return mkFinding('nft_wash', 'crypto_defi', ['reasoning', 'data_analysis'],
    verdict, score, 0.75, rationale, trades.map((t) => t.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// privacy_coin_reasoning — exposure to privacy coins (XMR / ZEC / DASH).
// Privacy coins are not sanctioned per se, but a HIGH share of customer
// activity in privacy coins warrants EDD per FATF R.15 + UAE VARA rules.
// ──────────────────────────────────────────────────────────────────────
interface PrivacyCoinFlow {
  coin: 'XMR' | 'ZEC' | 'DASH' | 'PIVX' | 'BEAM' | 'GRIN' | string;
  notionalUsd: number;
  direction: 'in' | 'out';
  shieldedPool?: boolean | undefined; // true for ZEC if pool is shielded
  sourceRef: string;
}

const privacyCoinReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const flows = typedEvidence<PrivacyCoinFlow>(ctx, 'privacyCoinFlows');
  if (flows.length === 0) {
    return mkFinding('privacy_coin_reasoning', 'crypto_defi', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No privacy-coin flows supplied. Mode requires privacyCoinFlows[].');
  }
  const total = flows.reduce((s, f) => s + f.notionalUsd, 0);
  const shielded = flows.filter((f) => f.shieldedPool === true);
  const shieldedNotional = shielded.reduce((s, f) => s + f.notionalUsd, 0);
  const shieldedPct = total > 0 ? shieldedNotional / total : 0;
  const xmrNotional = flows.filter((f) => f.coin === 'XMR').reduce((s, f) => s + f.notionalUsd, 0);
  const xmrPct = total > 0 ? xmrNotional / total : 0;
  const score = clamp01(xmrPct * 0.5 + shieldedPct * 0.4 + (total >= 1_000_000 ? 0.2 : 0));
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.2 ? 'flag' : 'clear';
  const rationale = score >= 0.2
    ? `Privacy-coin exposure: USD ${total.toLocaleString()} total, XMR ${(xmrPct * 100).toFixed(1)}%, shielded-pool ${(shieldedPct * 100).toFixed(1)}%. Apply EDD per FATF R.15.`
    : `Privacy-coin exposure modest (USD ${total.toLocaleString()}); standard CDD adequate.`;
  return mkFinding('privacy_coin_reasoning', 'crypto_defi', ['reasoning', 'data_analysis'],
    verdict, score, 0.7, rationale, flows.map((f) => f.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// sensitivity_tornado — Tornado-style mixer taint. OFAC sanctioned Tornado
// Cash in 2022; any direct or close-hop interaction is a hard red flag.
// ──────────────────────────────────────────────────────────────────────
interface MixerInteraction {
  mixerName: string;
  hopsToCustomer: number; // 1 = direct, 2 = one-hop, etc.
  notionalUsd: number;
  sanctioned: boolean;
  sourceRef: string;
}

const sensitivityTornadoApply = async (ctx: BrainContext): Promise<Finding> => {
  const ints = typedEvidence<MixerInteraction>(ctx, 'mixerInteractions');
  if (ints.length === 0) {
    return mkFinding('sensitivity_tornado', 'crypto_defi', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No mixer interactions supplied. Mode requires mixerInteractions[].');
  }
  const sanctioned = ints.filter((i) => i.sanctioned);
  const direct = sanctioned.filter((i) => i.hopsToCustomer <= 1);
  const close = sanctioned.filter((i) => i.hopsToCustomer >= 2 && i.hopsToCustomer <= 3);
  let verdict: Verdict;
  let score: number;
  let rationale: string;
  if (direct.length > 0) {
    verdict = 'escalate';
    score = 0.95;
    rationale = `${direct.length} direct (1-hop) interaction(s) with sanctioned mixer(s) (${[...new Set(direct.map((i) => i.mixerName))].join(', ')}). Hard freeze + STR (charter redline).`;
  } else if (close.length > 0) {
    verdict = 'escalate';
    score = 0.7;
    rationale = `${close.length} close-hop (2-3) interaction(s) with sanctioned mixer(s). Strong taint — apply EDD + restrict.`;
  } else if (sanctioned.length > 0) {
    verdict = 'flag';
    score = 0.4;
    rationale = `${sanctioned.length} distant-hop interaction(s) with sanctioned mixer(s). Document and monitor.`;
  } else {
    verdict = 'clear';
    score = 0.1;
    rationale = `${ints.length} mixer interaction(s) reviewed; none sanctioned.`;
  }
  return mkFinding('sensitivity_tornado', 'crypto_defi', ['reasoning', 'data_analysis'],
    verdict, score, direct.length > 0 ? 0.95 : 0.8, rationale, ints.map((i) => i.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// stablecoin_reserve — verifies stablecoin issuer reserve composition and
// attestation freshness.
// ──────────────────────────────────────────────────────────────────────
interface StablecoinAttestation {
  issuer: string;
  reserveCompositionPct: { cash: number; treasuries: number; corporate: number; commercialPaper: number; other: number };
  attestationDate: string;     // ISO date
  attestor?: string | undefined;
  isFullReserve: boolean;
  sourceRef: string;
}

const stablecoinReserveApply = async (ctx: BrainContext): Promise<Finding> => {
  const a = singleEvidence<StablecoinAttestation>(ctx, 'stablecoinAttestation');
  if (!a) {
    return mkFinding('stablecoin_reserve', 'crypto_defi', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No stablecoin attestation supplied. Mode requires stablecoinAttestation.');
  }
  const reasons: string[] = [];
  let score = 0;
  const compTotal = Object.values(a.reserveCompositionPct).reduce((s, v) => s + v, 0);
  if (Math.abs(compTotal - 100) > 1) {
    reasons.push(`reserve composition sums to ${compTotal}% (not 100%)`);
    score += 0.3;
  }
  if (!a.isFullReserve) {
    reasons.push('not full-reserve');
    score += 0.4;
  }
  const cashAndTbills = a.reserveCompositionPct.cash + a.reserveCompositionPct.treasuries;
  if (cashAndTbills < 50) {
    reasons.push(`only ${cashAndTbills}% in cash+treasuries`);
    score += 0.2;
  }
  if (a.reserveCompositionPct.commercialPaper > 25) {
    reasons.push(`${a.reserveCompositionPct.commercialPaper}% in commercial paper (run-risk)`);
    score += 0.15;
  }
  if (!a.attestor) {
    reasons.push('attestor not named');
    score += 0.1;
  }
  const ageDays = (Date.now() - new Date(a.attestationDate).getTime()) / 86_400_000;
  if (Number.isFinite(ageDays) && ageDays > 90) {
    reasons.push(`attestation stale: ${Math.round(ageDays)}d old`);
    score += 0.15;
  }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.2 ? 'flag' : 'clear';
  const rationale = reasons.length === 0
    ? `${a.issuer}: full reserve, ${cashAndTbills}% cash+treasuries, attestation by ${a.attestor} dated ${a.attestationDate}.`
    : `${a.issuer} reserve issues: ${reasons.join('; ')}.`;
  return mkFinding('stablecoin_reserve', 'crypto_defi', ['reasoning', 'data_analysis'],
    verdict, score, 0.75, rationale, [a.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// app_scam — authorised push payment scam pattern: customer pays out
// under social-engineered duress to a counterparty they cannot verify.
// ──────────────────────────────────────────────────────────────────────
interface AppPaymentEvent {
  paymentId: string;
  amountAed: number;
  beneficiaryNew: boolean;
  beneficiaryFlaggedByOther?: boolean | undefined; // peer-bank intel
  customerOverrideOfWarning: boolean;
  hurriedClaimedReason?: 'urgent_legal' | 'tax_office' | 'family_emergency' | 'investment_opportunity' | 'other' | undefined;
  sourceRef: string;
}

const appScamApply = async (ctx: BrainContext): Promise<Finding> => {
  const events = typedEvidence<AppPaymentEvent>(ctx, 'appPaymentEvents');
  if (events.length === 0) {
    return mkFinding('app_scam', 'identity_fraud', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No APP payment events supplied. Mode requires appPaymentEvents[].');
  }
  let score = 0;
  const flagged: string[] = [];
  for (const e of events) {
    let s = 0;
    const why: string[] = [];
    if (e.beneficiaryFlaggedByOther) { s += 0.5; why.push('beneficiary flagged by peer bank'); }
    if (e.beneficiaryNew && e.customerOverrideOfWarning) { s += 0.35; why.push('new beneficiary + warning override'); }
    if (e.hurriedClaimedReason && ['urgent_legal', 'tax_office', 'family_emergency'].includes(e.hurriedClaimedReason)) {
      s += 0.25; why.push(`pretext: ${e.hurriedClaimedReason}`);
    }
    if (e.amountAed >= 50_000) { s += 0.1; why.push(`large amount AED ${e.amountAed.toLocaleString()}`); }
    if (s > 0) {
      flagged.push(`${e.paymentId}: ${why.join('; ')}`);
      score = Math.max(score, s);
    }
  }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.25 ? 'flag' : 'clear';
  const rationale = flagged.length === 0
    ? `${events.length} APP event(s) reviewed; no scam indicators.`
    : `APP-scam indicators on ${flagged.length}/${events.length} event(s): ${flagged.join(' | ')}.`;
  return mkFinding('app_scam', 'identity_fraud', ['reasoning', 'data_analysis'],
    verdict, score, 0.75, rationale, events.map((e) => e.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// synthetic_id — synthetic identity: real SSN/EID + fabricated PII stitched
// together. Indicators: thin file, recent-issue ID, address mismatches.
// ──────────────────────────────────────────────────────────────────────
interface SyntheticIdSignal {
  fileAgeDays: number;        // age of credit / banking file
  idIssueDays: number;        // age of EID / passport
  addressMatchesEmployer: boolean;
  addressMatchesUtility: boolean;
  livenessVerified: boolean;
  socialFootprintScore?: number | undefined; // 0..1 — completeness of social presence
  sourceRef: string;
}

const syntheticIdApply = async (ctx: BrainContext): Promise<Finding> => {
  const sig = singleEvidence<SyntheticIdSignal>(ctx, 'syntheticIdSignal');
  if (!sig) {
    return mkFinding('synthetic_id', 'identity_fraud', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No synthetic-id signal supplied. Mode requires syntheticIdSignal.');
  }
  const reasons: string[] = [];
  let score = 0;
  if (sig.fileAgeDays < 90) { reasons.push(`thin file (${sig.fileAgeDays}d)`); score += 0.3; }
  if (sig.idIssueDays < 90) { reasons.push(`recent ID issuance (${sig.idIssueDays}d)`); score += 0.2; }
  if (!sig.addressMatchesEmployer) { reasons.push('address ≠ employer record'); score += 0.15; }
  if (!sig.addressMatchesUtility) { reasons.push('address ≠ utility bill'); score += 0.15; }
  if (!sig.livenessVerified) { reasons.push('no liveness check'); score += 0.2; }
  if ((sig.socialFootprintScore ?? 0.5) < 0.2) { reasons.push('thin social footprint'); score += 0.2; }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.2 ? 'flag' : 'clear';
  const rationale = reasons.length === 0
    ? 'Identity profile mature and corroborated; no synthetic-id signal.'
    : `Synthetic-id indicators: ${reasons.join('; ')}. Run document-fraud + liveness re-check.`;
  return mkFinding('synthetic_id', 'identity_fraud', ['reasoning', 'data_analysis'],
    verdict, score, 0.75, rationale, [sig.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// market_manipulation — pump-and-dump / spoofing / layering: orderbook +
// price patterns inconsistent with informed trading.
// ──────────────────────────────────────────────────────────────────────
interface OrderBookSignal {
  symbol: string;
  windowMin: number;
  pumpReturnPct: number;        // % rise within window
  dumpReturnPct: number;        // % fall after pump
  cancelToTradeRatio: number;   // > 5 is suspicious of spoofing
  largeOrdersAtTopPct?: number | undefined; // % of order time near top of book
  sourceRef: string;
}

const marketManipulationApply = async (ctx: BrainContext): Promise<Finding> => {
  const sigs = typedEvidence<OrderBookSignal>(ctx, 'orderBookSignals');
  if (sigs.length === 0) {
    return mkFinding('market_manipulation', 'market_integrity', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No order-book signals supplied. Mode requires orderBookSignals[].');
  }
  const flagged: string[] = [];
  let score = 0;
  for (const s of sigs) {
    let local = 0;
    const why: string[] = [];
    if (s.pumpReturnPct >= 25 && s.dumpReturnPct <= -15) {
      local += 0.5; why.push(`pump ${s.pumpReturnPct.toFixed(0)}% then dump ${s.dumpReturnPct.toFixed(0)}%`);
    }
    if (s.cancelToTradeRatio >= 5) {
      local += 0.35; why.push(`cancel/trade ratio ${s.cancelToTradeRatio.toFixed(1)} (spoofing)`);
    }
    if ((s.largeOrdersAtTopPct ?? 0) >= 0.4) {
      local += 0.2; why.push(`${Math.round((s.largeOrdersAtTopPct ?? 0) * 100)}% time at top of book`);
    }
    if (local > 0) {
      flagged.push(`${s.symbol}: ${why.join('; ')}`);
      score = Math.max(score, local);
    }
  }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.25 ? 'flag' : 'clear';
  const rationale = flagged.length === 0
    ? `${sigs.length} symbol(s) reviewed; no manipulation patterns.`
    : `Manipulation indicators: ${flagged.join(' | ')}.`;
  return mkFinding('market_manipulation', 'market_integrity', ['reasoning', 'data_analysis'],
    verdict, score, 0.8, rationale, sigs.map((s) => s.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// front_running — trading ahead of an own client's known order. Signal:
// trader account beating the customer book by < N seconds repeatedly.
// ──────────────────────────────────────────────────────────────────────
interface PrePostTrade {
  traderId: string;
  customerId: string;
  symbol: string;
  traderSecondsBeforeCustomer: number;
  pnlBpsForTrader: number;
  sourceRef: string;
}

const frontRunningApply = async (ctx: BrainContext): Promise<Finding> => {
  const obs = typedEvidence<PrePostTrade>(ctx, 'prePostTrades');
  if (obs.length === 0) {
    return mkFinding('front_running', 'market_integrity', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No pre/post trade pairs supplied. Mode requires prePostTrades[].');
  }
  const beats = obs.filter((o) => o.traderSecondsBeforeCustomer >= 0 && o.traderSecondsBeforeCustomer <= 5);
  const profitableBeats = beats.filter((o) => o.pnlBpsForTrader > 0);
  const ratio = profitableBeats.length / Math.max(obs.length, 1);
  const score = clamp01(ratio * 1.4);
  const verdict: Verdict = ratio >= 0.4 ? 'escalate' : ratio >= 0.15 ? 'flag' : 'clear';
  const traders = new Set(profitableBeats.map((o) => o.traderId));
  const rationale = ratio >= 0.15
    ? `${profitableBeats.length}/${obs.length} pre-trades by ${traders.size} trader(s) precede customer order by ≤5s and are profitable. Investigate insider-information / front-running.`
    : `${obs.length} pre/post pair(s) reviewed; no systematic front-running pattern.`;
  return mkFinding('front_running', 'market_integrity', ['reasoning', 'data_analysis'],
    verdict, score, 0.8, rationale, obs.map((o) => o.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// lapping — accounts-receivable lapping: posting customer A's payment to
// customer B's account to hide an embezzlement of A's funds.
// ──────────────────────────────────────────────────────────────────────
interface ArPosting {
  customerId: string;
  invoiceId: string;
  paymentDate: string;
  postingDate: string;
  postingDelayDays: number;
  postingMismatch: boolean; // payment received from a different customer than the invoice
  sourceRef: string;
}

const lappingApply = async (ctx: BrainContext): Promise<Finding> => {
  const posts = typedEvidence<ArPosting>(ctx, 'arPostings');
  if (posts.length === 0) {
    return mkFinding('lapping', 'forensic_accounting', ['reasoning', 'forensic_accounting'],
      'inconclusive', 0, 0.2,
      'No AR postings supplied. Mode requires arPostings[].');
  }
  const mismatches = posts.filter((p) => p.postingMismatch);
  const delayed = posts.filter((p) => p.postingDelayDays >= 7);
  const both = posts.filter((p) => p.postingMismatch && p.postingDelayDays >= 7);
  const score = clamp01(both.length * 0.4 + mismatches.length * 0.15 + delayed.length * 0.05);
  const verdict: Verdict = both.length >= 2 ? 'escalate' : mismatches.length > 0 ? 'flag' : 'clear';
  const rationale = both.length > 0
    ? `${both.length} posting(s) BOTH mismatched-payer AND delayed >=7d (classic lapping). Audit AR clerk + reconcile.`
    : mismatches.length > 0
      ? `${mismatches.length} mismatched-payer posting(s); ${delayed.length} delayed >=7d. Investigate.`
      : `${posts.length} AR posting(s) reviewed; no lapping signature.`;
  return mkFinding('lapping', 'forensic_accounting', ['reasoning', 'forensic_accounting'],
    verdict, score, 0.8, rationale, posts.map((p) => p.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// linguistic_forensics — BEC / phishing linguistic markers: sender domain
// typosquat, urgency-pressure phrases, banking-detail change.
// ──────────────────────────────────────────────────────────────────────
interface MessageSignal {
  messageId: string;
  senderDomain: string;
  expectedDomain?: string | undefined;
  urgencyKeywords: number;        // count of urgent / immediate / asap
  bankingChangeRequest: boolean;
  vendorCounterpartyImpersonation?: boolean | undefined;
  sourceRef: string;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j] ?? 0;
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j] ?? 0, dp[j - 1] ?? 0);
      prev = tmp;
    }
  }
  return dp[n] ?? 0;
}

const linguisticForensicsApply = async (ctx: BrainContext): Promise<Finding> => {
  const msgs = typedEvidence<MessageSignal>(ctx, 'messageSignals');
  if (msgs.length === 0) {
    return mkFinding('linguistic_forensics', 'identity_fraud', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No message signals supplied. Mode requires messageSignals[].');
  }
  const flagged: string[] = [];
  let score = 0;
  for (const m of msgs) {
    let local = 0;
    const why: string[] = [];
    if (m.expectedDomain) {
      const d = levenshtein(m.senderDomain.toLowerCase(), m.expectedDomain.toLowerCase());
      if (d >= 1 && d <= 2) {
        local += 0.5; why.push(`typosquat: "${m.senderDomain}" vs "${m.expectedDomain}" (edit-distance ${d})`);
      } else if (d > 2 && d < 5) {
        local += 0.2; why.push(`unfamiliar sender domain (edit-distance ${d})`);
      }
    }
    if (m.urgencyKeywords >= 3) { local += 0.2; why.push(`${m.urgencyKeywords} urgency keywords`); }
    if (m.bankingChangeRequest) { local += 0.35; why.push('banking-detail change requested'); }
    if (m.vendorCounterpartyImpersonation) { local += 0.4; why.push('claimed vendor mismatch'); }
    if (local > 0) {
      flagged.push(`${m.messageId}: ${why.join('; ')}`);
      score = Math.max(score, local);
    }
  }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.25 ? 'flag' : 'clear';
  const rationale = flagged.length === 0
    ? `${msgs.length} message(s) reviewed; no BEC linguistic markers.`
    : `BEC indicators on ${flagged.length}/${msgs.length} message(s): ${flagged.join(' | ')}.`;
  return mkFinding('linguistic_forensics', 'identity_fraud', ['reasoning', 'data_analysis'],
    verdict, score, 0.8, rationale, msgs.map((m) => m.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// cross_case_triangulation — corroborates a finding by checking whether
// the same indicator surfaced across N related cases.
// ──────────────────────────────────────────────────────────────────────
interface RelatedCaseHit {
  caseId: string;
  indicator: string;
  verdict: 'flag' | 'escalate' | 'clear' | 'inconclusive';
  observedAt: string;
  sourceRef: string;
}

const crossCaseTriangulationApply = async (ctx: BrainContext): Promise<Finding> => {
  const hits = typedEvidence<RelatedCaseHit>(ctx, 'relatedCaseHits');
  if (hits.length === 0) {
    return mkFinding('cross_case_triangulation', 'epistemic_quality', ['reasoning', 'introspection'],
      'inconclusive', 0, 0.2,
      'No related-case hits supplied. Mode requires relatedCaseHits[].');
  }
  const corroborating = hits.filter((h) => h.verdict === 'escalate' || h.verdict === 'flag');
  const escalations = corroborating.filter((h) => h.verdict === 'escalate');
  const indicators = new Map<string, number>();
  for (const h of corroborating) {
    indicators.set(h.indicator, (indicators.get(h.indicator) ?? 0) + 1);
  }
  const recurring = [...indicators.entries()].filter(([, n]) => n >= 2);
  const score = clamp01(escalations.length * 0.3 + recurring.length * 0.25);
  const verdict: Verdict = escalations.length >= 2 || recurring.length >= 1 ? 'escalate' : corroborating.length >= 1 ? 'flag' : 'clear';
  const rationale = recurring.length > 0
    ? `Indicator(s) recur across cases: ${recurring.map(([k, n]) => `${k} (${n} cases)`).join(', ')}. ${escalations.length} escalation(s) corroborate.`
    : corroborating.length > 0
      ? `${corroborating.length} related case(s) flagged or escalated; no single indicator recurs.`
      : `${hits.length} related case(s) reviewed; none corroborate the current concern.`;
  return mkFinding('cross_case_triangulation', 'epistemic_quality', ['reasoning', 'introspection'],
    verdict, score, 0.7, rationale, hits.map((h) => h.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// Bundle export
// ──────────────────────────────────────────────────────────────────────
export const INTEGRITY_MODE_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  bridge_risk:               bridgeRiskApply,
  nft_wash:                  nftWashApply,
  privacy_coin_reasoning:    privacyCoinReasoningApply,
  sensitivity_tornado:       sensitivityTornadoApply,
  stablecoin_reserve:        stablecoinReserveApply,
  app_scam:                  appScamApply,
  synthetic_id:              syntheticIdApply,
  market_manipulation:       marketManipulationApply,
  front_running:             frontRunningApply,
  lapping:                   lappingApply,
  linguistic_forensics:      linguisticForensicsApply,
  cross_case_triangulation:  crossCaseTriangulationApply,
};
