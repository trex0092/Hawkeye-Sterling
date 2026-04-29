// Hawkeye Sterling — graph analytics.
// Build an entity/counterparty graph from evidence; run centrality, k-core,
// bridge detection, community labelling, cycle detection, triadic closure.

export interface Edge { from: string; to: string; weight?: number; }
export interface EntityGraph {
  nodes: string[];
  adjacency: Map<string, Set<string>>;
  weights: Map<string, number>;    // 'a|b' with a<b
}

export function buildGraph(edges: ReadonlyArray<Edge>): EntityGraph {
  const adj = new Map<string, Set<string>>();
  const w = new Map<string, number>();
  for (const e of edges) {
    if (!e.from || !e.to || e.from === e.to) continue;
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
    const key = [e.from, e.to].sort().join('|');
    w.set(key, (w.get(key) ?? 0) + (e.weight ?? 1));
  }
  return { nodes: [...adj.keys()], adjacency: adj, weights: w };
}

// Build a counterparty graph from an `evidence.transactions[]` array.
export function graphFromTransactions(txs: unknown, selfId = 'SUBJECT'): EntityGraph {
  const edges: Edge[] = [];
  if (Array.isArray(txs)) {
    for (const t of txs) {
      if (!t || typeof t !== 'object') continue;
      const cp = (t as { counterparty?: unknown }).counterparty;
      if (typeof cp === 'string' && cp.length > 0) edges.push({ from: selfId, to: cp });
      const chain = (t as { chain?: unknown }).chain;
      if (Array.isArray(chain)) {
        for (let i = 0; i < chain.length - 1; i++) {
          const a = chain[i], b = chain[i + 1];
          if (typeof a === 'string' && typeof b === 'string') edges.push({ from: a, to: b });
        }
      }
    }
  }
  return buildGraph(edges);
}

// Build a UBO graph from `evidence.uboChain[]` — each item is expected to have
// { parent, child } or { owner, owned } or an ordered pair [a,b].
export function graphFromUBO(uboChain: unknown): EntityGraph {
  const edges: Edge[] = [];
  if (Array.isArray(uboChain)) {
    for (const n of uboChain) {
      if (!n) continue;
      if (Array.isArray(n) && typeof n[0] === 'string' && typeof n[1] === 'string') {
        edges.push({ from: n[0], to: n[1] });
      } else if (typeof n === 'object') {
        const r = n as Record<string, unknown>;
        const a = (typeof r.parent === 'string' && r.parent)
          ?? (typeof r.owner === 'string' && r.owner)
          ?? (typeof r.from === 'string' && r.from) ?? '';
        const b = (typeof r.child === 'string' && r.child)
          ?? (typeof r.owned === 'string' && r.owned)
          ?? (typeof r.to === 'string' && r.to) ?? '';
        if (typeof a === 'string' && typeof b === 'string' && a && b) edges.push({ from: a, to: b });
      }
    }
  }
  return buildGraph(edges);
}

export function degree(g: EntityGraph): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of g.nodes) out.set(n, g.adjacency.get(n)?.size ?? 0);
  return out;
}

// Betweenness via Brandes' algorithm (unit weights).
export function betweenness(g: EntityGraph): Map<string, number> {
  const CB = new Map<string, number>();
  for (const n of g.nodes) CB.set(n, 0);
  for (const s of g.nodes) {
    const S: string[] = [];
    const P = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const d = new Map<string, number>();
    for (const t of g.nodes) { P.set(t, []); sigma.set(t, 0); d.set(t, -1); }
    sigma.set(s, 1); d.set(s, 0);
    const Q: string[] = [s];
    while (Q.length > 0) {
      const v = Q.shift()!;
      S.push(v);
      for (const w of g.adjacency.get(v) ?? []) {
        if ((d.get(w) ?? -1) < 0) { Q.push(w); d.set(w, (d.get(v) ?? 0) + 1); }
        if ((d.get(w) ?? -1) === (d.get(v) ?? 0) + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
          P.get(w)!.push(v);
        }
      }
    }
    const delta = new Map<string, number>();
    for (const n of g.nodes) delta.set(n, 0);
    while (S.length > 0) {
      const w = S.pop()!;
      for (const v of P.get(w) ?? []) {
        const add = ((sigma.get(v) ?? 0) / (sigma.get(w) ?? 1)) * (1 + (delta.get(w) ?? 0));
        delta.set(v, (delta.get(v) ?? 0) + add);
      }
      if (w !== s) CB.set(w, (CB.get(w) ?? 0) + (delta.get(w) ?? 0));
    }
  }
  return CB;
}

// k-core: iteratively strip nodes with degree < k.
export function kCore(g: EntityGraph, k: number): string[] {
  const deg = new Map<string, number>();
  for (const n of g.nodes) deg.set(n, g.adjacency.get(n)?.size ?? 0);
  const removed = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [n, d] of deg) {
      if (removed.has(n)) continue;
      if (d < k) {
        removed.add(n);
        for (const nb of g.adjacency.get(n) ?? []) {
          if (!removed.has(nb)) deg.set(nb, (deg.get(nb) ?? 0) - 1);
        }
        changed = true;
      }
    }
  }
  return g.nodes.filter((n) => !removed.has(n));
}

// Tarjan-style bridge detection — iterative to avoid stack overflow on large graphs.
export function bridges(g: EntityGraph): Array<[string, string]> {
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const neighborIdx = new Map<string, number>();
  // Cache stable neighbor arrays for indexed traversal.
  const nbCache = new Map<string, string[]>();
  for (const n of g.nodes) nbCache.set(n, [...(g.adjacency.get(n) ?? [])]);

  let timer = 0;
  const result: Array<[string, string]> = [];

  for (const start of g.nodes) {
    if (disc.has(start)) continue;
    disc.set(start, timer); low.set(start, timer); timer++;
    parent.set(start, null);
    neighborIdx.set(start, 0);
    const stack: string[] = [start];

    while (stack.length > 0) {
      const u = stack[stack.length - 1]!;
      const neighbors = nbCache.get(u)!;
      const idx = neighborIdx.get(u) ?? 0;

      if (idx < neighbors.length) {
        neighborIdx.set(u, idx + 1);
        const v = neighbors[idx]!;
        if (!disc.has(v)) {
          disc.set(v, timer); low.set(v, timer); timer++;
          parent.set(v, u);
          neighborIdx.set(v, 0);
          stack.push(v);
        } else if (v !== (parent.get(u) ?? null)) {
          low.set(u, Math.min(low.get(u) ?? 0, disc.get(v) ?? 0));
        }
      } else {
        stack.pop();
        const p = parent.get(u) ?? null;
        if (p !== null) {
          low.set(p, Math.min(low.get(p) ?? 0, low.get(u) ?? 0));
          if ((low.get(u) ?? 0) > (disc.get(p) ?? 0)) result.push([p, u]);
        }
      }
    }
  }
  return result;
}

// Label-propagation community detection (stochastic, stable on small graphs).
export function communities(g: EntityGraph, iterations = 5, seed = 42): Map<string, string> {
  const labels = new Map<string, string>();
  for (const n of g.nodes) labels.set(n, n);
  let rng = seed;
  const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  for (let it = 0; it < iterations; it++) {
    const order = [...g.nodes].sort(() => rand() - 0.5);
    for (const n of order) {
      const counts = new Map<string, number>();
      for (const nb of g.adjacency.get(n) ?? []) {
        const lb = labels.get(nb) ?? nb;
        counts.set(lb, (counts.get(lb) ?? 0) + 1);
      }
      if (counts.size === 0) continue;
      let bestLabel = labels.get(n) ?? n, bestCount = -1;
      for (const [lb, c] of counts) {
        if (c > bestCount || (c === bestCount && lb < bestLabel)) { bestLabel = lb; bestCount = c; }
      }
      labels.set(n, bestLabel);
    }
  }
  return labels;
}

// Cycle existence — Union-Find (iterative, safe on large graphs).
export function hasCycle(g: EntityGraph): boolean {
  const uf = new Map<string, string>(g.nodes.map((n) => [n, n]));
  function find(x: string): string {
    while ((uf.get(x) ?? x) !== x) {
      const gp = uf.get(uf.get(x) ?? x) ?? x;
      uf.set(x, gp); // path compression
      x = gp;
    }
    return x;
  }
  const seen = new Set<string>();
  for (const [u, neighbors] of g.adjacency) {
    for (const v of neighbors) {
      const key = u < v ? `${u}|${v}` : `${v}|${u}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ru = find(u), rv = find(v);
      if (ru === rv) return true;
      uf.set(ru, rv);
    }
  }
  return false;
}

// Triadic-closure gap: pairs of neighbours of a node that are NOT themselves
// linked — high count = many "missing third edges".
export function triadicGaps(g: EntityGraph): number {
  let gaps = 0;
  for (const n of g.nodes) {
    const neigh = [...(g.adjacency.get(n) ?? [])];
    for (let i = 0; i < neigh.length; i++) {
      for (let j = i + 1; j < neigh.length; j++) {
        const a = neigh[i]!, b = neigh[j]!;
        if (!(g.adjacency.get(a)?.has(b) ?? false)) gaps++;
      }
    }
  }
  return gaps;
}

// BFS shortest path (unit weights).
export function shortestPath(g: EntityGraph, src: string, dst: string): string[] | null {
  if (src === dst) return [src];
  const prev = new Map<string, string | null>();
  prev.set(src, null);
  const q: string[] = [src];
  while (q.length > 0) {
    const u = q.shift()!;
    for (const v of g.adjacency.get(u) ?? []) {
      if (prev.has(v)) continue;
      prev.set(v, u);
      if (v === dst) {
        const path: string[] = [];
        let c: string | null = v;
        while (c !== null) { path.push(c); c = prev.get(c) ?? null; }
        return path.reverse();
      }
      q.push(v);
    }
  }
  return null;
}
