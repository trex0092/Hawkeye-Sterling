// Hawkeye Sterling — typed entity graph.
// Builds an in-memory graph of persons + entities + vessels + wallets +
// accounts, linked by typed edges (owns, controls, director_of, spouse_of,
// paid, received, transacted_with, nominee_for, beneficiary_of, custody_of,
// wire_to, associated_with). Used for UBO traversal, connected-party
// discovery, and downstream graph analytics.
//
// Pure in-memory + deterministic — no storage layer, no I/O.

export type NodeKind = 'person' | 'entity' | 'vessel' | 'wallet' | 'account' | 'address' | 'document';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  attrs?: Record<string, string | number | boolean>;
}

export type EdgeKind =
  | 'owns'
  | 'controls'
  | 'director_of'
  | 'shareholder_of'
  | 'spouse_of'
  | 'family_of'
  | 'close_associate_of'
  | 'paid'
  | 'received'
  | 'transacted_with'
  | 'nominee_for'
  | 'beneficiary_of'
  | 'custody_of'
  | 'wire_to'
  | 'registered_at'
  | 'associated_with';

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** Optional edge weight (share %, transaction value, confidence 0..1). */
  weight?: number;
  /** Optional observation date — ISO 8601. */
  at?: string;
  attrs?: Record<string, string | number | boolean>;
}

export class EntityGraph {
  private nodesById: Map<string, GraphNode> = new Map();
  private outgoing: Map<string, GraphEdge[]> = new Map();
  private incoming: Map<string, GraphEdge[]> = new Map();

  addNode(node: GraphNode): void {
    if (!node.id) throw new Error('node.id required');
    this.nodesById.set(node.id, { ...node });
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, []);
    if (!this.incoming.has(node.id)) this.incoming.set(node.id, []);
  }

  addEdge(edge: GraphEdge): void {
    if (!this.nodesById.has(edge.from)) throw new Error(`unknown from-node: ${edge.from}`);
    if (!this.nodesById.has(edge.to)) throw new Error(`unknown to-node: ${edge.to}`);
    this.outgoing.get(edge.from)?.push({ ...edge });
    this.incoming.get(edge.to)?.push({ ...edge });
  }

  node(id: string): GraphNode | undefined { return this.nodesById.get(id); }
  nodes(): GraphNode[] { return [...this.nodesById.values()]; }
  edges(): GraphEdge[] {
    const out: GraphEdge[] = [];
    for (const list of this.outgoing.values()) out.push(...list);
    return out;
  }

  /** Edges leaving the given node. */
  out(id: string, kinds?: readonly EdgeKind[]): GraphEdge[] {
    const list = this.outgoing.get(id) ?? [];
    return kinds && kinds.length > 0 ? list.filter((e) => kinds.includes(e.kind)) : list;
  }
  /** Edges arriving at the given node. */
  in(id: string, kinds?: readonly EdgeKind[]): GraphEdge[] {
    const list = this.incoming.get(id) ?? [];
    return kinds && kinds.length > 0 ? list.filter((e) => kinds.includes(e.kind)) : list;
  }

  /** BFS returning every node reachable from `start` via edges of the
   *  optional kind filter, up to maxDepth. */
  neighbourhood(start: string, maxDepth = 3, kinds?: readonly EdgeKind[]): Map<string, number> {
    const depths = new Map<string, number>();
    if (!this.nodesById.has(start)) return depths;
    depths.set(start, 0);
    const queue: Array<[string, number]> = [[start, 0]];
    while (queue.length > 0) {
      const shifted = queue.shift();
      if (!shifted) break;
      const [id, d] = shifted;
      if (d >= maxDepth) continue;
      const out = this.out(id, kinds);
      const inn = this.in(id, kinds);
      for (const e of out) {
        if (!depths.has(e.to)) { depths.set(e.to, d + 1); queue.push([e.to, d + 1]); }
      }
      for (const e of inn) {
        if (!depths.has(e.from)) { depths.set(e.from, d + 1); queue.push([e.from, d + 1]); }
      }
    }
    return depths;
  }

  /** Shortest path (BFS) between two nodes over the optional kind filter. */
  shortestPath(fromId: string, toId: string, kinds?: readonly EdgeKind[]): string[] | null {
    if (!this.nodesById.has(fromId) || !this.nodesById.has(toId)) return null;
    if (fromId === toId) return [fromId];
    const prev = new Map<string, string>();
    const visited = new Set<string>([fromId]);
    const queue = [fromId];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (!curr) break;
      const neigh = [
        ...this.out(curr, kinds).map((e) => e.to),
        ...this.in(curr, kinds).map((e) => e.from),
      ];
      for (const n of neigh) {
        if (visited.has(n)) continue;
        visited.add(n);
        prev.set(n, curr);
        if (n === toId) {
          const path: string[] = [n];
          let step: string | undefined = curr;
          while (step !== undefined) {
            path.push(step);
            step = prev.get(step);
          }
          return path.reverse();
        }
        queue.push(n);
      }
    }
    return null;
  }

  /** Simple weighted UBO traversal: climbs `owns` / `controls` /
   *  `shareholder_of` edges and multiplies weights to estimate effective
   *  beneficial ownership per upstream person. Cycles are truncated. */
  effectiveOwnership(subjectId: string): Array<{ personId: string; percent: number; chain: string[]; viaNominee: boolean }> {
    const out: Array<{ personId: string; percent: number; chain: string[]; viaNominee: boolean }> = [];
    const upKinds: EdgeKind[] = ['owns', 'controls', 'shareholder_of'];
    const walk = (cur: string, chain: string[], acc: number, viaNominee: boolean): void => {
      if (chain.includes(cur) || chain.length > 12) return;
      const upEdges = this.in(cur, upKinds);
      if (upEdges.length === 0) return;
      for (const e of upEdges) {
        const weight = e.weight === undefined ? 1 : Math.max(0, Math.min(1, e.weight > 1 ? e.weight / 100 : e.weight));
        const fromNode = this.nodesById.get(e.from);
        if (!fromNode) continue;
        const nextChain = [...chain, cur];
        const nextAcc = acc * weight;
        const nominee = viaNominee || this.out(e.from, ['nominee_for']).length > 0 ||
                        Boolean(e.attrs && (e.attrs.nominee === true));
        if (fromNode.kind === 'person') {
          out.push({ personId: fromNode.id, percent: nextAcc * 100, chain: [...nextChain, fromNode.id], viaNominee: nominee });
        } else {
          walk(fromNode.id, nextChain, nextAcc, nominee);
        }
      }
    };
    walk(subjectId, [], 1, false);
    // Aggregate multiple paths to the same person.
    const agg = new Map<string, { percent: number; chains: string[][]; viaNominee: boolean }>();
    for (const r of out) {
      const existing = agg.get(r.personId);
      if (!existing) agg.set(r.personId, { percent: r.percent, chains: [r.chain], viaNominee: r.viaNominee });
      else {
        existing.percent += r.percent;
        existing.chains.push(r.chain);
        existing.viaNominee = existing.viaNominee || r.viaNominee;
      }
    }
    return [...agg.entries()]
      .map(([personId, v]) => ({ personId, percent: Math.min(100, v.percent), chain: v.chains[0] ?? [], viaNominee: v.viaNominee }))
      .sort((a, b) => b.percent - a.percent);
  }

  stats(): { nodes: number; edges: number; byKind: Record<string, number>; byEdgeKind: Record<string, number> } {
    const byKind: Record<string, number> = {};
    for (const n of this.nodesById.values()) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
    const byEdgeKind: Record<string, number> = {};
    for (const e of this.edges()) byEdgeKind[e.kind] = (byEdgeKind[e.kind] ?? 0) + 1;
    return { nodes: this.nodesById.size, edges: this.edges().length, byKind, byEdgeKind };
  }
}
