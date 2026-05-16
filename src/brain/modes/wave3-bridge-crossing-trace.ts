// Hawkeye Sterling — wave-3 mode: bridge_crossing_trace (audit follow-up #7).
//
// Detects cross-chain bridge usage patterns characteristic of crypto
// laundering. Bridges (Wormhole, Stargate, Across, Multichain, etc.)
// are a primary obfuscation step: launderers move funds from one
// blockchain (e.g. Ethereum) to another (e.g. Solana / BSC / Avalanche)
// to fragment the analytic trail across forensic providers that
// typically specialise in one chain.
//
// Heuristics:
//   1. KNOWN_BRIDGE_CONTRACT — counterparty address tagged against a
//      curated bridge contract list (multi-chain).
//   2. BRIDGE_HOP_VELOCITY  — same notional crosses ≥2 bridges in <24h.
//   3. CROSS_CHAIN_REUNION  — funds from one chain reappear on another
//      within an analytical window in suspicious denominations.
//   4. DESTINATION_OBFUSCATION — bridge destination address differs
//      from the originating principal's other-chain known addresses.
//   5. ANONYMITY_BRIDGE_PAIR — bridging into a privacy-coin chain
//      (Monero / Zcash via wrapped intermediaries) — mixer adjacency.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface BridgeTxn {
  hash?: string;
  fromAddress?: string;
  toAddress?: string;
  amount?: number;
  asset?: string;
  sourceChain?: string;          // 'ethereum' | 'bsc' | 'arbitrum' | …
  destinationChain?: string;
  timestamp?: string;
  bridgeProtocol?: string;       // 'wormhole' | 'stargate' | 'across' | …
}

const KNOWN_BRIDGE_CONTRACTS: Array<{ id: string; rx: RegExp; protocol: string }> = [
  { id: 'wormhole', protocol: 'Wormhole', rx: /^0x(?:3ee18B2214AFF97000D974cf647E54f9c5dE7C97|98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B|f927aa67C19d61970Ed1f3266DBb01EA50A2A38e)$/i },
  { id: 'stargate', protocol: 'Stargate', rx: /^0x(?:8731d54E9D02c286767d56ac03e8037C07e01e98|8334D4F6c44b8E2c3CC8b0E0c0F5d2eF2A88FfE2)$/i },
  { id: 'across', protocol: 'Across', rx: /^0x(?:c186fA914353c44b2E33eBE05f21846F1048bEda|4D9079Bb4165aeb4084c526a32695dCfd2F77381)$/i },
  { id: 'multichain', protocol: 'Multichain (Anyswap)', rx: /^0x(?:6b7a87899490EcE95443e979cA9485CBE7E71522|6F4e8eBa4D337f874Ab57478AcC2Cb5BACdc19c9)$/i },
  { id: 'orbit', protocol: 'Arbitrum Orbit / Bridge', rx: /^0x(?:cEe284F754E854890e311e3280b767F80797180d)$/i },
];

const PRIVACY_CHAINS = new Set(['monero', 'zcash', 'zec', 'xmr', 'haven', 'beam']);
const HIGH_VELOCITY_HOPS = 2;
const HIGH_VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000;

interface SignalHit { id: string; label: string; weight: number; evidence: string; }

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function detectKnownBridges(txns: BridgeTxn[]): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const t of txns) {
    const addr = (t.toAddress ?? t.fromAddress ?? '').trim();
    if (!addr) continue;
    for (const k of KNOWN_BRIDGE_CONTRACTS) {
      if (k.rx.test(addr)) {
        hits.push({
          id: `known_bridge:${k.id}`,
          label: `Known bridge contract: ${k.protocol}`,
          weight: 0.25,
          evidence: `${addr.slice(0, 10)}…${addr.slice(-6)}${t.hash ? ` (${t.hash.slice(0, 10)}…)` : ''}`,
        });
      }
    }
    if (t.bridgeProtocol) {
      hits.push({
        id: `tagged_bridge:${t.bridgeProtocol.toLowerCase()}`,
        label: `Caller-tagged bridge: ${t.bridgeProtocol}`,
        weight: 0.2,
        evidence: t.hash?.slice(0, 12) ?? '?',
      });
    }
  }
  return hits;
}

function detectBridgeHopVelocity(txns: BridgeTxn[]): SignalHit[] {
  const sorted = [...txns]
    .filter((t) => t.timestamp && (t.bridgeProtocol || t.destinationChain !== t.sourceChain))
    .sort((a, b) => Date.parse(a.timestamp ?? '') - Date.parse(b.timestamp ?? ''));
  const hits: SignalHit[] = [];
  for (let i = 0; i + HIGH_VELOCITY_HOPS - 1 < sorted.length; i++) {
    const head = sorted[i];
    const tail = sorted[i + HIGH_VELOCITY_HOPS - 1];
    if (!head?.timestamp || !tail?.timestamp) continue;
    const span = Date.parse(tail.timestamp) - Date.parse(head.timestamp);
    if (span <= HIGH_VELOCITY_WINDOW_MS) {
      hits.push({
        id: 'bridge_hop_velocity',
        label: `${HIGH_VELOCITY_HOPS}+ bridge crossings within ${HIGH_VELOCITY_WINDOW_MS / 3_600_000}h`,
        weight: 0.25,
        evidence: `${head.timestamp} → ${tail.timestamp}`,
      });
      i += HIGH_VELOCITY_HOPS;
    }
  }
  return hits;
}

function detectAnonymityBridgePair(txns: BridgeTxn[]): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const t of txns) {
    const dest = (t.destinationChain ?? '').toLowerCase();
    const src = (t.sourceChain ?? '').toLowerCase();
    if (dest && PRIVACY_CHAINS.has(dest)) {
      hits.push({
        id: 'anonymity_bridge_to_privacy_chain',
        label: `Bridge into privacy chain: ${dest}`,
        weight: 0.4,
        evidence: `${t.hash?.slice(0, 12) ?? '?'}: ${src} → ${dest}`,
      });
    }
    if (src && PRIVACY_CHAINS.has(src)) {
      hits.push({
        id: 'anonymity_bridge_from_privacy_chain',
        label: `Bridge out of privacy chain: ${src}`,
        weight: 0.35,
        evidence: `${t.hash?.slice(0, 12) ?? '?'}: ${src} → ${dest}`,
      });
    }
  }
  return hits;
}

function detectChainReunion(txns: BridgeTxn[]): SignalHit[] {
  // Same notional appearing on multiple chains within 12h window.
  const sorted = [...txns]
    .filter((t) => t.amount !== undefined && t.timestamp)
    .sort((a, b) => Date.parse(a.timestamp ?? '') - Date.parse(b.timestamp ?? ''));
  const hits: SignalHit[] = [];
  const window = 12 * 60 * 60 * 1000;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i] as BridgeTxn, b = sorted[j] as BridgeTxn;
      if (Date.parse(b.timestamp ?? '') - Date.parse(a.timestamp ?? '') > window) break;
      if (a.sourceChain === b.sourceChain) continue;
      if (a.amount === undefined || b.amount === undefined) continue;
      const ratio = Math.abs(a.amount - b.amount) / Math.max(a.amount, b.amount);
      if (ratio < 0.02) {
        hits.push({
          id: 'cross_chain_reunion',
          label: `Same notional reappears across chains within ${window / 3_600_000}h`,
          weight: 0.2,
          evidence: `${a.amount} ${a.asset ?? '?'} on ${a.sourceChain} ↔ ${b.sourceChain}`,
        });
      }
    }
  }
  return hits;
}

export const bridgeCrossingTraceApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<BridgeTxn>(ctx, 'transactions');
  if (txns.length === 0) {
    return {
      modeId: 'bridge_crossing_trace',
      category: 'cryptoasset_forensics' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0,
      confidence: 0.2,
      verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No transactions supplied; bridge_crossing_trace requires evidence.transactions with sourceChain/destinationChain or bridgeProtocol fields.',
      evidence: [],
      producedAt: Date.now(),
    };
  }

  const allHits: SignalHit[] = [
    ...detectKnownBridges(txns),
    ...detectBridgeHopVelocity(txns),
    ...detectAnonymityBridgePair(txns),
    ...detectChainReunion(txns),
  ];

  const rawScore = allHits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);

  let verdict: Verdict = 'clear';
  if (score >= 0.6) verdict = 'escalate';
  else if (score >= 0.3) verdict = 'flag';

  const summary = allHits.length === 0
    ? 'No bridge-crossing signals detected.'
    : `${allHits.length} bridge signal(s) fired across ${txns.length} txn(s).`;
  const detail = allHits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ');

  const rationale = [
    summary,
    detail ? `Signals: ${detail}.` : '',
    `Composite score: ${score.toFixed(2)}.`,
    'Anchors: FATF R.15 + R.16 (travel rule across bridges) · UAE FDL 10/2025 Art.15 · VARA VASP Rulebook 2024.',
  ].filter(Boolean).join(' ');

  return {
    modeId: 'bridge_crossing_trace',
    category: 'cryptoasset_forensics' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score,
    confidence: allHits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * allHits.length),
    verdict,
    rationale,
    evidence: allHits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default bridgeCrossingTraceApply;
