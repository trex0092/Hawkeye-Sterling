// Hawkeye Sterling — crypto risk heuristics.
// Mixer proximity, chain-hopping velocity, privacy-pool exposure.
// Seed set of known mixer/pool addresses is hard-coded at a minimum; real
// deployments override this via Phase 5/6 ingestion.

export const KNOWN_MIXERS_SEED: ReadonlySet<string> = new Set([
  // Tornado Cash pools (OFAC SDN designation 2022-08) — Ethereum addresses.
  '0x8589427373d6d84e98730d7795d8f6f8731fda16',
  '0x722122df12d4e14e13ac3b6895a86e84145b6967',
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384',
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
  '0xd96f2b1c14db8458374d9aca76e26c3d18364307',
  '0x4736dcf1b7a3d580672ccce6213c03bf1cbcdaa1',
  '0xd691f27f38b395864ea86cfc7253969b409c362d',
  '0x23773e65ed146a459791799d01336db287f25334',
  // ChipMixer (FinCEN / DOJ designation 2023-03) — Bitcoin-only service.
  // These are known ChipMixer deposit addresses from public court filings.
  '1kunckukyqfmcgsbjpmrgcqrluiap3qm9',
  '1chipmixerqxejqfqxkmvpmj4bgxqkbf2',
]);

export interface CryptoAnalysis {
  directMixerHits: string[];
  inferredMixerHops: number;         // hops from subject to nearest mixer in supplied graph
  privacyPoolSymptomScore: number;   // 0..1
  chainHoppingVelocity: number;      // tx/hour across chains
  peelChainIndicator: number;        // 0..1
}

export function analyseCryptoEvidence(evidence: unknown): CryptoAnalysis {
  const addresses = collectAddresses(evidence);
  const txs = (evidence && typeof evidence === 'object' && 'transactions' in evidence)
    ? (evidence as { transactions: unknown }).transactions
    : undefined;

  const directMixerHits: string[] = [];
  for (const a of addresses) if (KNOWN_MIXERS_SEED.has(a.toLowerCase())) directMixerHits.push(a);

  let mixerHops = 999;
  if (Array.isArray(txs)) {
    // BFS from the subject's addresses through counterparty edges until we
    // encounter a mixer, capped at 6 hops.
    const adj = new Map<string, Set<string>>();
    for (const t of txs) {
      if (!t || typeof t !== 'object') continue;
      const f = (t as { from?: unknown }).from;
      const to = (t as { to?: unknown }).to;
      if (typeof f === 'string' && typeof to === 'string') {
        if (!adj.has(f)) adj.set(f, new Set());
        if (!adj.has(to)) adj.set(to, new Set());
        (adj.get(f) ?? new Set()).add(to);
        (adj.get(to) ?? new Set()).add(f);
      }
    }
    const q: Array<{ a: string; d: number }> = addresses.map((a) => ({ a: a.toLowerCase(), d: 0 }));
    const seen = new Set<string>(addresses.map((a) => a.toLowerCase()));
    while (q.length > 0) {
      const item = q.shift();
      if (!item) break;
      const { a, d } = item;
      if (d > 0 && KNOWN_MIXERS_SEED.has(a)) { mixerHops = Math.min(mixerHops, d); break; }
      if (d >= 6) continue;
      for (const nb of adj.get(a) ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        q.push({ a: nb, d: d + 1 });
      }
    }
    if (mixerHops === 999 && directMixerHits.length > 0) mixerHops = 0;
  }

  let privacyPool = 0;
  if (Array.isArray(txs)) {
    let denom = 0, pool = 0;
    for (const t of txs) {
      denom++;
      if (!t || typeof t !== 'object') continue;
      const memo = (t as { memo?: unknown; tag?: unknown; reference?: unknown });
      const text = `${memo.memo ?? ''} ${memo.tag ?? ''} ${memo.reference ?? ''}`.toLowerCase();
      if (/tornado|privacy|mixer|chipmixer|blender|shielded/.test(text)) pool++;
    }
    if (denom > 0) privacyPool = pool / denom;
  }

  let chainHop = 0;
  if (Array.isArray(txs)) {
    const chains = new Set<string>();
    const timestamps: number[] = [];
    for (const t of txs) {
      if (!t || typeof t !== 'object') continue;
      const c = (t as { chain?: unknown }).chain;
      if (typeof c === 'string') chains.add(c);
      const ts = (t as { timestamp?: unknown }).timestamp;
      if (typeof ts === 'number') timestamps.push(ts);
      else if (typeof ts === 'string') { const d = Date.parse(ts); if (!Number.isNaN(d)) timestamps.push(d); }
    }
    if (chains.size >= 2 && timestamps.length >= 2) {
      timestamps.sort((a, b) => a - b);
      const hours = Math.max(1, ((timestamps[timestamps.length - 1] ?? 0) - (timestamps[0] ?? 0)) / 3600_000);
      chainHop = timestamps.length / hours;
    }
  }

  // Peel-chain symptom: many small outs in tight window. Reuses peelChainScore-style logic locally.
  let peel = 0;
  if (Array.isArray(txs)) {
    const outs: Array<{ a: number; t: number }> = [];
    for (const t of txs) {
      if (!t || typeof t !== 'object') continue;
      const dir = (t as { direction?: unknown }).direction;
      if (dir !== 'out' && dir !== 'debit') continue;
      const a = (t as { amount?: unknown }).amount;
      const ts = (t as { timestamp?: unknown }).timestamp;
      const na = typeof a === 'number' ? a : typeof a === 'string' ? Number(a) : NaN;
      const nts = typeof ts === 'number' ? ts : typeof ts === 'string' ? Date.parse(ts) : NaN;
      if (Number.isFinite(na) && na > 0 && Number.isFinite(nts)) outs.push({ a: na, t: nts });
    }
    if (outs.length >= 5) {
      outs.sort((x, y) => x.t - y.t);
      const span = ((outs[outs.length - 1]?.t ?? 0) - (outs[0]?.t ?? 0)) / 3600_000;
      const avg = outs.reduce((s, o) => s + o.a, 0) / outs.length;
      const below = outs.filter((o) => o.a < avg * 0.5).length / outs.length;
      const tight = span < 48 ? 1 : 48 / span;
      peel = Math.max(0, Math.min(1, 0.5 * below + 0.3 * Math.min(1, outs.length / 20) + 0.2 * tight));
    }
  }

  return {
    directMixerHits,
    inferredMixerHops: mixerHops === 999 ? -1 : mixerHops,
    privacyPoolSymptomScore: privacyPool,
    chainHoppingVelocity: chainHop,
    peelChainIndicator: peel,
  };
}

function collectAddresses(evidence: unknown): string[] {
  const out: string[] = [];
  if (!evidence || typeof evidence !== 'object') return out;
  const ev = evidence as Record<string, unknown>;
  const maybe = ev.wallets ?? ev.addresses;
  if (Array.isArray(maybe)) {
    for (const x of maybe) if (typeof x === 'string') out.push(x);
  }
  // Subject identifiers might also include a primary wallet.
  const txs = ev.transactions;
  if (Array.isArray(txs)) {
    for (const t of txs) {
      if (!t || typeof t !== 'object') continue;
      for (const k of ['from', 'to', 'address', 'wallet']) {
        const v = (t as Record<string, unknown>)[k];
        // Ethereum (0x...), legacy Bitcoin (1.../3...), native SegWit (bc1...).
        if (typeof v === 'string' && /^(0x[0-9a-fA-F]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{6,87})$/i.test(v)) {
          out.push(v);
        }
      }
    }
  }
  return [...new Set(out)];
}
