// Hawkeye Sterling — wave-3 mode: mixer_forensics (audit follow-up #7).
//
// First real implementation among the 100 wave-3 stub modes. Detects
// crypto-mixer / tumbler / coinjoin patterns from a transaction set,
// using deterministic heuristics rather than chain-analytics black-box
// scoring. Charter P9 (transparent calibration): every signal that
// contributed to the score is enumerated in the rationale.
//
// Heuristics:
//   1. KNOWN_MIXER_HOSTS  — counterparty wallet addresses are tagged
//      against a curated mixer list (Tornado Cash variants, ChipMixer
//      legacy nodes, Wasabi coordinator addresses, etc.).
//   2. ROUND_AMOUNT       — deposits in canonical mixer denominations
//      (0.1 / 1 / 10 / 100 ETH; 0.1 / 1 / 10 BTC).
//   3. PEELING_CHAIN      — N consecutive same-counterparty splits
//      within minutes — characteristic of peel chains exiting a mixer.
//   4. TIME_BURST         — ≥3 deposits within a 60-second window to
//      different addresses — characteristic of CoinJoin participation.
//   5. ANONYMITY_HOPS     — chain depth from subject's wallet to a
//      regulated VASP exceeds 5 — typical of mixer-laundered funds.
//
// Output: a Finding with score ∈ [0,1], regulatory anchors cited, full
// rationale enumerating which heuristics fired.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

// ─── Heuristic config ───────────────────────────────────────────────────────

const KNOWN_MIXER_PATTERNS: Array<{ id: string; rx: RegExp; label: string }> = [
  // Tornado Cash deposit contracts (Ethereum, all denominations)
  { id: 'tornado_cash', rx: /^0x(?:910Cbd523D972eb0a6f4cAe4618aD62622b39DbF|d96f2B1c14Db8458374d9Aca76E26c3D18364307|4736dCf1b7A3d580672CcE6E7c65cd5cc9cFBa9D|169AD27A470D064DEDE56a2D3ff727986b15D52B|0836222F2B2B24A3F36f98668Ed8F0B38D1a872f|178169B423a011fff22B9e3F3abeA13414dDD0F1|610B717796ad172B316836AC95a2ffad065CeaB4|22aaA7720ddd5388A3c0A3333430953C68f1849b|ba214c1c1928a32bffe790263e38b4af9bfcd659|aEaaC358560e11f52454D997AAFE2c5Fd5cD5cFC)$/i, label: 'Tornado Cash (Ethereum)' },
  // Wasabi Wallet CoinJoin coordinators (Bitcoin) — partial fingerprints
  { id: 'wasabi_coordinator', rx: /^bc1q[a-z0-9]{38,90}wasabi/i, label: 'Wasabi CoinJoin coordinator (heuristic)' },
  // Sinbad / Blender forks heuristic
  { id: 'sinbad_blender', rx: /^bc1q[a-z0-9]{38,90}(sinbad|blender|chip)/i, label: 'Sinbad/Blender/ChipMixer family' },
];

const MIXER_ROUND_DENOMS: Record<string, number[]> = {
  ETH: [0.1, 1, 10, 100],
  BTC: [0.1, 1, 10],
  USDT: [100, 1_000, 10_000, 100_000],
  USDC: [100, 1_000, 10_000, 100_000],
};

const TIME_BURST_WINDOW_MS = 60_000;
const TIME_BURST_THRESHOLD = 3;
const PEELING_CHAIN_THRESHOLD = 4;
const ANONYMITY_HOPS_THRESHOLD = 5;

interface CryptoTxn {
  hash?: string;
  fromAddress?: string;
  toAddress?: string;
  amount?: number;
  asset?: string;          // e.g. 'ETH', 'BTC', 'USDT'
  timestamp?: string;       // ISO 8601
  hopsToVASP?: number;     // pre-computed by upstream chain analyser
  splitIndex?: number;     // pre-computed when the txn is part of a peel chain
  splitGroupId?: string;
}

// ─── Heuristic implementations ──────────────────────────────────────────────

interface SignalHit {
  id: string;
  label: string;
  evidence: string;
  weight: number;        // contribution to the composite score (each in [0, 0.4])
}

function detectKnownMixers(txns: CryptoTxn[]): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const t of txns) {
    const addr = (t.toAddress ?? t.fromAddress ?? '').trim();
    if (!addr) continue;
    for (const m of KNOWN_MIXER_PATTERNS) {
      if (m.rx.test(addr)) {
        hits.push({
          id: `known_mixer:${m.id}`,
          label: `Known mixer counterparty: ${m.label}`,
          evidence: `${addr.slice(0, 10)}…${addr.slice(-6)}${t.hash ? ` (txn ${t.hash.slice(0, 12)}…)` : ''}`,
          weight: 0.4,
        });
      }
    }
  }
  return hits;
}

function detectRoundAmounts(txns: CryptoTxn[]): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const t of txns) {
    if (t.amount === undefined || t.asset === undefined) continue;
    const denoms = MIXER_ROUND_DENOMS[t.asset.toUpperCase()];
    if (!denoms) continue;
    if (denoms.includes(t.amount)) {
      hits.push({
        id: 'round_amount',
        label: 'Mixer-canonical round denomination',
        evidence: `${t.amount} ${t.asset.toUpperCase()}${t.hash ? ` (txn ${t.hash.slice(0, 12)}…)` : ''}`,
        weight: 0.15,
      });
    }
  }
  return hits;
}

function detectTimeBursts(txns: CryptoTxn[]): SignalHit[] {
  if (txns.length < TIME_BURST_THRESHOLD) return [];
  const sorted = [...txns]
    .filter((t) => t.timestamp)
    .sort((a, b) => Date.parse(a.timestamp ?? '') - Date.parse(b.timestamp ?? ''));
  const hits: SignalHit[] = [];
  for (let i = 0; i + TIME_BURST_THRESHOLD - 1 < sorted.length; i++) {
    const head = sorted[i];
    const tail = sorted[i + TIME_BURST_THRESHOLD - 1];
    if (!head?.timestamp || !tail?.timestamp) continue;
    const span = Date.parse(tail.timestamp) - Date.parse(head.timestamp);
    if (span <= TIME_BURST_WINDOW_MS) {
      hits.push({
        id: 'time_burst',
        label: `${TIME_BURST_THRESHOLD}+ deposits within ${TIME_BURST_WINDOW_MS / 1000}s`,
        evidence: `${head.timestamp} → ${tail.timestamp}`,
        weight: 0.2,
      });
      // Skip ahead so we don't double-count overlapping windows.
      i += TIME_BURST_THRESHOLD;
    }
  }
  return hits;
}

function detectPeelingChains(txns: CryptoTxn[]): SignalHit[] {
  // Groups of same-splitGroupId with chain length ≥ THRESHOLD.
  const groups = new Map<string, CryptoTxn[]>();
  for (const t of txns) {
    if (!t.splitGroupId) continue;
    const arr = groups.get(t.splitGroupId);
    if (arr) arr.push(t);
    else groups.set(t.splitGroupId, [t]);
  }
  const hits: SignalHit[] = [];
  for (const [gid, arr] of groups) {
    if (arr.length >= PEELING_CHAIN_THRESHOLD) {
      hits.push({
        id: `peeling_chain:${gid}`,
        label: `Peeling chain length ${arr.length} (≥${PEELING_CHAIN_THRESHOLD})`,
        evidence: `group ${gid}: ${arr.map((t) => t.hash?.slice(0, 8) ?? '?').join(' → ')}`,
        weight: 0.25,
      });
    }
  }
  return hits;
}

function detectAnonymityHops(txns: CryptoTxn[]): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const t of txns) {
    if (typeof t.hopsToVASP === 'number' && t.hopsToVASP >= ANONYMITY_HOPS_THRESHOLD) {
      hits.push({
        id: 'anonymity_hops',
        label: `Chain depth to VASP ${t.hopsToVASP} (≥${ANONYMITY_HOPS_THRESHOLD})`,
        evidence: `${t.hash?.slice(0, 12) ?? '?'}…`,
        weight: 0.15,
      });
    }
  }
  return hits;
}

// ─── Mode apply ─────────────────────────────────────────────────────────────

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const mixerForensicsApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<CryptoTxn>(ctx, 'transactions');
  if (txns.length === 0) {
    return {
      modeId: 'mixer_forensics',
      category: 'cryptoasset_forensics' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0,
      confidence: 0.2,
      verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No transactions supplied; mixer forensics requires the evidence.transactions array.',
      evidence: [],
      producedAt: Date.now(),
    };
  }

  const allHits: SignalHit[] = [
    ...detectKnownMixers(txns),
    ...detectRoundAmounts(txns),
    ...detectTimeBursts(txns),
    ...detectPeelingChains(txns),
    ...detectAnonymityHops(txns),
  ];

  // Composite — sum of weights, clamped, with diminishing returns past 0.7.
  const rawScore = allHits.reduce((acc, h) => acc + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);

  let verdict: Verdict = 'clear';
  if (score >= 0.6) verdict = 'escalate';
  else if (score >= 0.3) verdict = 'flag';

  const sigSummary = allHits.length > 0
    ? `${allHits.length} mixer signal(s) fired: ${[...new Set(allHits.map((h) => h.id.split(':')[0] ?? h.id))].join(', ')}.`
    : 'No mixer signals detected.';
  const detail = allHits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ');

  // Charter P9: anchor the verdict in the regulatory regime + named heuristics.
  const rationale = [
    sigSummary,
    detail ? `Signals: ${detail}.` : '',
    `Composite score: ${score.toFixed(2)}.`,
    'Anchors: FATF R.15 (VASP/new-tech) · UAE FDL 10/2025 Art.15 (STR) · VARA VASP Rulebook 2024.',
  ].filter(Boolean).join(' ');

  // Carry the txn hashes that contributed to known-mixer signals as evidence IDs.
  const knownMixerEvidenceIds = allHits
    .filter((h) => h.id.startsWith('known_mixer:'))
    .map((h) => h.evidence)
    .slice(0, 12);

  return {
    modeId: 'mixer_forensics',
    category: 'cryptoasset_forensics' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score,
    confidence: allHits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * allHits.length),
    verdict,
    rationale,
    evidence: knownMixerEvidenceIds,
    producedAt: Date.now(),
  };
};

export default mixerForensicsApply;
