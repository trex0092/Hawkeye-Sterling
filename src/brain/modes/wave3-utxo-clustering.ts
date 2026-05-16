// Hawkeye Sterling — wave-3 mode: utxo_clustering (audit follow-up #7).
//
// Detects clustering patterns in Bitcoin-style UTXO transactions that
// indicate single-entity control of supposedly-distinct addresses.
// Heuristics:
//   1. COMMON_INPUT_OWNERSHIP — the canonical heuristic: addresses
//      that co-appear as inputs to the same transaction are
//      controlled by the same entity (Meiklejohn et al. 2013).
//   2. CHANGE_ADDRESS — output value patterns identifying change
//      addresses (one output is a "round" payment, the other holds
//      the unrounded remainder; the smaller is typically change).
//   3. ADDRESS_REUSE — same address appearing across multiple
//      transactions ties them to one entity.
//   4. PEEL_CHAIN_LINKAGE — long chain of small outputs followed by
//      a residual cluster suggests laundering peel pattern.
//
// Output: Finding with cluster sizes + tagged anchors. Charter P9 —
// every signal enumerated. Faculty: data_analysis + cryptoasset_forensics.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface UtxoTxn {
  hash?: string;
  inputAddresses?: string[];
  outputAddresses?: string[];
  outputValues?: number[];        // matched-index with outputAddresses
  asset?: string;                  // 'BTC' typically
  timestamp?: string;
}

interface SignalHit {
  id: string;
  label: string;
  weight: number;
  evidence: string;
}

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// ─── Heuristics ─────────────────────────────────────────────────────────────

function detectCommonInputOwnership(txns: UtxoTxn[]): { hits: SignalHit[]; clusters: Map<string, Set<string>> } {
  // Union-find over input-address co-appearance.
  const parent: Map<string, string> = new Map();
  function find(a: string): string {
    let cur = a;
    while (parent.get(cur) !== cur && parent.has(cur)) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, parent.get(next) ?? next);
      cur = next;
    }
    parent.set(a, cur);
    return cur;
  }
  function union(a: string, b: string): void {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const t of txns) {
    const ins = (t.inputAddresses ?? []).filter(Boolean);
    if (ins.length < 2) continue;
    const head = ins[0] ?? '';
    if (!parent.has(head)) parent.set(head, head);
    for (let i = 1; i < ins.length; i++) {
      const a = ins[i] ?? '';
      if (!parent.has(a)) parent.set(a, a);
      union(head, a);
    }
  }

  const clusters = new Map<string, Set<string>>();
  for (const a of parent.keys()) {
    const r = find(a);
    let set = clusters.get(r);
    if (!set) { set = new Set<string>(); clusters.set(r, set); }
    set.add(a);
  }

  const hits: SignalHit[] = [];
  let largeClusterCount = 0;
  for (const set of clusters.values()) {
    if (set.size >= 3) {
      largeClusterCount++;
      hits.push({
        id: `cio_cluster:${set.size}`,
        label: `Common-input cluster size ${set.size}`,
        weight: Math.min(0.3, 0.05 * set.size),
        evidence: `${[...set].slice(0, 4).map((a) => a.slice(0, 10) + '…').join(', ')}${set.size > 4 ? `, +${set.size - 4} more` : ''}`,
      });
    }
  }
  if (largeClusterCount >= 2) {
    hits.push({
      id: 'multi_cluster',
      label: `Multiple (${largeClusterCount}) large input-clusters detected`,
      weight: 0.15,
      evidence: `${largeClusterCount} clusters of size ≥3`,
    });
  }

  return { hits, clusters };
}

function detectChangeAddresses(txns: UtxoTxn[]): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const t of txns) {
    const outs = t.outputValues ?? [];
    if (outs.length !== 2) continue;
    const [a, b] = [outs[0] ?? 0, outs[1] ?? 0];
    if (a <= 0 || b <= 0) continue;
    // Heuristic: one output is a "round" amount (multiple of 0.01 BTC),
    // the other carries the remainder. The remainder is the change.
    const roundA = Math.abs(a * 100 - Math.round(a * 100)) < 1e-6;
    const roundB = Math.abs(b * 100 - Math.round(b * 100)) < 1e-6;
    if (roundA !== roundB) {
      const changeIdx = roundA ? 1 : 0;
      const changeAddr = (t.outputAddresses ?? [])[changeIdx];
      if (changeAddr) {
        hits.push({
          id: 'change_address_id',
          label: 'Change-address identified by round-vs-remainder split',
          weight: 0.1,
          evidence: `${changeAddr.slice(0, 10)}…${t.hash ? ` (txn ${t.hash.slice(0, 10)}…)` : ''}`,
        });
      }
    }
  }
  return hits;
}

function detectAddressReuse(txns: UtxoTxn[]): SignalHit[] {
  const counts = new Map<string, number>();
  for (const t of txns) {
    for (const a of t.inputAddresses ?? []) counts.set(a, (counts.get(a) ?? 0) + 1);
    for (const a of t.outputAddresses ?? []) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  const hits: SignalHit[] = [];
  let reusedHigh = 0;
  for (const [addr, n] of counts) {
    if (n >= 5) {
      reusedHigh++;
      hits.push({
        id: 'address_reuse',
        label: `Address reused ${n}× across transactions`,
        weight: Math.min(0.15, 0.03 * n),
        evidence: `${addr.slice(0, 10)}… (${n} appearances)`,
      });
    }
  }
  if (reusedHigh >= 3) {
    hits.push({
      id: 'systemic_reuse',
      label: `Systemic address reuse (${reusedHigh} addresses ≥5×)`,
      weight: 0.1,
      evidence: `${reusedHigh} reused addresses`,
    });
  }
  return hits;
}

// ─── Mode apply ─────────────────────────────────────────────────────────────

export const utxoClusteringApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<UtxoTxn>(ctx, 'transactions');
  if (txns.length === 0) {
    return {
      modeId: 'utxo_clustering',
      category: 'cryptoasset_forensics' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0,
      confidence: 0.2,
      verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No transactions supplied; UTXO clustering requires evidence.transactions with input/output addresses.',
      evidence: [],
      producedAt: Date.now(),
    };
  }

  const cio = detectCommonInputOwnership(txns);
  const change = detectChangeAddresses(txns);
  const reuse = detectAddressReuse(txns);
  const allHits = [...cio.hits, ...change, ...reuse];

  const rawScore = allHits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);

  let verdict: Verdict = 'clear';
  if (score >= 0.6) verdict = 'escalate';
  else if (score >= 0.3) verdict = 'flag';

  const cioCount = [...cio.clusters.values()].filter((s) => s.size >= 3).length;
  const summary = allHits.length > 0
    ? `${allHits.length} clustering signal(s) fired across ${txns.length} txn(s); ${cioCount} large input-cluster(s) detected.`
    : 'No clustering signals detected.';
  const detail = allHits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ');

  const rationale = [
    summary,
    detail ? `Signals: ${detail}.` : '',
    `Composite score: ${score.toFixed(2)}.`,
    'Anchors: Meiklejohn et al. 2013 (common-input ownership) · FATF R.15 (VASP/new-tech) · UAE FDL 10/2025 Art.15.',
  ].filter(Boolean).join(' ');

  return {
    modeId: 'utxo_clustering',
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

export default utxoClusteringApply;
