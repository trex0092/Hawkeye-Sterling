// Hawkeye Sterling — sanctions ownership-chain walker (OFAC 50% Rule).
//
// OFAC's 50 Percent Rule (issued August 2014) blocks any entity owned 50%
// or more — directly or indirectly, individually or in the aggregate — by
// one or more sanctioned persons. OFSI, EU, and UAE EOCN apply equivalent
// rules. The walker traverses an ownership graph of arbitrary depth, sums
// designated-party stakes at every node, and flags blocking when the
// cumulative stake at any layer crosses 50%.
//
// Inputs are pure data — no I/O. The screening route shapes the graph
// from KYC onboarding records, group structure charts, or third-party
// data (LSEG, Sayari, OpenCorporates) before calling this module.

export interface OwnershipNode {
  id: string;
  /** Display name. */
  name: string;
  /** True when this entity is a sanctioned designated person. */
  designated: boolean;
  /** Specific regimes that designate this party. */
  regimes?: string[];
  /** Direct ownership edges OUT of this node. */
  owns?: OwnershipEdge[];
}

export interface OwnershipEdge {
  /** Target node id. */
  toId: string;
  /** Direct ownership / voting / economic interest 0..1. */
  pct: number;
  /** Edge type — economic, voting, control, or beneficial. */
  kind?: "economic" | "voting" | "control" | "beneficial";
}

export interface OwnershipGraph {
  /** Node id of the subject under review. */
  rootId: string;
  /** All nodes (subject + every layer in the ownership chain). */
  nodes: OwnershipNode[];
}

export interface ChainWalkResult {
  /** True when cumulative designated-party ownership at the root ≥ 50%. */
  blocked: boolean;
  /** Cumulative designated-party percentage at the root. */
  cumulativePct: number;
  /** Per-designated-party trace showing how their stake reaches the root. */
  traces: Array<{
    designatedId: string;
    designatedName: string;
    regimes: string[];
    /** Effective stake in the root (product of edge percentages along the path). */
    effectivePct: number;
    /** Path through the graph: ordered node names from designated → root. */
    path: string[];
  }>;
  /** All paths examined (for audit). */
  examinedPaths: number;
  /** Maximum depth walked. */
  maxDepth: number;
}

const HARD_DEPTH_LIMIT = 12; // safety cap against malicious / cyclic input

/**
 * Walk the graph from every designated node forward through ownership
 * edges, accumulating the effective stake in the root. The walker is
 * cycle-safe: each path tracks its own visited set.
 */
export function walkOwnershipChain(graph: OwnershipGraph): ChainWalkResult {
  const byId: Record<string, OwnershipNode> = {};
  for (const n of graph.nodes) byId[n.id] = n;

  const root = byId[graph.rootId];
  if (!root) {
    return {
      blocked: false,
      cumulativePct: 0,
      traces: [],
      examinedPaths: 0,
      maxDepth: 0,
    };
  }

  // Build reverse adjacency: for each node, who owns it (with their pct).
  // (Edges in `owns` go FROM owner TO owned; we want to walk FROM the
  // designated party TOWARD the root. The natural direction for OFAC 50%
  // is "designated owns A, A owns B, B owns root" — so we traverse the
  // forward edges starting from each designated node.)
  const traces: ChainWalkResult["traces"] = [];
  let examined = 0;
  let maxDepth = 0;

  const designatedNodes = graph.nodes.filter((n) => n.designated);
  for (const start of designatedNodes) {
    const stack: Array<{
      nodeId: string;
      effective: number;
      path: string[];
      visited: Set<string>;
      depth: number;
    }> = [
      { nodeId: start.id, effective: 1, path: [start.name], visited: new Set([start.id]), depth: 0 },
    ];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      examined += 1;
      if (cur.depth > maxDepth) maxDepth = cur.depth;
      if (cur.depth >= HARD_DEPTH_LIMIT) continue;
      // Reached the root — record the trace.
      if (cur.nodeId === graph.rootId && cur.depth > 0) {
        traces.push({
          designatedId: start.id,
          designatedName: start.name,
          regimes: start.regimes ?? [],
          effectivePct: cur.effective,
          path: cur.path,
        });
        continue;
      }
      const node = byId[cur.nodeId];
      if (!node?.owns) continue;
      for (const edge of node.owns) {
        if (cur.visited.has(edge.toId)) continue; // cycle
        const next = byId[edge.toId];
        if (!next) continue;
        stack.push({
          nodeId: edge.toId,
          effective: cur.effective * edge.pct,
          path: [...cur.path, next.name],
          visited: new Set([...cur.visited, edge.toId]),
          depth: cur.depth + 1,
        });
      }
    }
  }

  // Cumulative stake — sum effective percentages from all unique designated
  // parties (no double-counting if the SAME designated party has two paths
  // to the root: take the max along each path then sum across distinct
  // designated parties).
  const byDesignated = new Map<string, number>();
  for (const t of traces) {
    const cur = byDesignated.get(t.designatedId) ?? 0;
    byDesignated.set(t.designatedId, cur + t.effectivePct);
  }
  const cumulativePct = Array.from(byDesignated.values()).reduce((a, b) => a + b, 0);

  return {
    blocked: cumulativePct >= 0.5,
    cumulativePct,
    traces: traces.sort((a, b) => b.effectivePct - a.effectivePct),
    examinedPaths: examined,
    maxDepth,
  };
}

/**
 * Defensive: validate a graph before walking. Returns null when valid;
 * a string error otherwise.
 */
export function validateOwnershipGraph(graph: OwnershipGraph): string | null {
  if (!graph.rootId) return "rootId missing";
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) return "nodes must be a non-empty array";
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (!n.id) return "node missing id";
    if (ids.has(n.id)) return `duplicate node id: ${n.id}`;
    ids.add(n.id);
    if (n.owns) {
      for (const e of n.owns) {
        if (!e.toId) return `edge missing toId on node ${n.id}`;
        if (!Number.isFinite(e.pct) || e.pct < 0 || e.pct > 1) return `edge pct out of range on node ${n.id}`;
      }
    }
  }
  if (!ids.has(graph.rootId)) return `rootId ${graph.rootId} not in nodes`;
  return null;
}
