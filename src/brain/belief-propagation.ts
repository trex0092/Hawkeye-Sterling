// Hawkeye Sterling — Bayesian belief propagation over the entity graph
// (audit follow-up #5).
//
// Extends EntityGraph with weighted-edge belief propagation: given a
// SOURCE node with an asserted belief (e.g. "subject is sanctioned, P=0.95")
// and the graph of relationships, computes the posterior P(target) for
// every reachable node using log-odds composition along weighted edges.
//
// Used to answer: "if P(entity X is sanctioned) = 0.95 and entity Y owns
// X via a chain of nominees, what is P(Y is materially exposed)?".
//
// Algorithm (sum-product over a DAG-truncated graph):
//   1. From each SOURCE, BFS up to maxDepth.
//   2. Each edge has a propagation weight ∈ [0,1] = how strongly the
//      source's belief transfers to the target. Per edge kind:
//        - 'owns'           = 1.0 × weight (share %)
//        - 'controls'       = 0.95
//        - 'nominee_for'    = 0.85 (taint propagates)
//        - 'shareholder_of' = weight (share %)
//        - 'beneficiary_of' = 0.7
//        - 'family_of'      = 0.6
//        - 'close_associate_of' = 0.5
//        - 'transacted_with' = 0.3
//        - everything else  = 0.1
//   3. Compose multiple paths using independence approximation:
//        P(target | sources) ≈ 1 - prod(1 - P_path_i).
//   4. Clamp every probability to [0.001, 0.999] to avoid log(0).

import type { EntityGraph, EdgeKind, GraphEdge } from './entity-graph.js';

const PROPAGATION_WEIGHTS: Record<EdgeKind, number> = {
  owns: 1.0,
  controls: 0.95,
  shareholder_of: 1.0,
  director_of: 0.7,
  nominee_for: 0.85,
  beneficiary_of: 0.7,
  family_of: 0.6,
  close_associate_of: 0.5,
  spouse_of: 0.6,
  paid: 0.3,
  received: 0.3,
  transacted_with: 0.3,
  custody_of: 0.6,
  wire_to: 0.25,
  registered_at: 0.1,
  associated_with: 0.2,
};

const MIN_P = 0.001;
const MAX_P = 0.999;
const DEFAULT_MAX_DEPTH = 6;

function clampP(p: number): number {
  if (!Number.isFinite(p)) return MIN_P;
  return Math.min(MAX_P, Math.max(MIN_P, p));
}

export interface BeliefSource {
  nodeId: string;
  prior: number;            // P(hypothesis | source) ∈ (0,1)
  hypothesisLabel?: string; // free-text e.g. 'sanctioned', 'pep'
}

export interface BeliefPosterior {
  nodeId: string;
  posterior: number;
  contributingPaths: Array<{ from: string; via: string[]; weight: number; pathProbability: number }>;
}

export interface BeliefPropagationOptions {
  maxDepth?: number;
  /** Override per-edge propagation weights. */
  edgeWeights?: Partial<Record<EdgeKind, number>>;
  /** Walk both incoming + outgoing edges. Default true (sanctions taint
   *  spreads upward AND downward through ownership). */
  bidirectional?: boolean;
}

interface PathState {
  fromSource: string;
  via: string[];
  cumWeight: number;       // ∏ edge weights along the path
}

/** Propagate beliefs from a set of source nodes through the graph and
 *  return posterior probabilities for every reachable node. */
export function propagateBeliefs(
  graph: EntityGraph,
  sources: readonly BeliefSource[],
  opts: BeliefPropagationOptions = {},
): BeliefPosterior[] {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const bidirectional = opts.bidirectional ?? true;
  const weights = { ...PROPAGATION_WEIGHTS, ...(opts.edgeWeights ?? {}) };

  // Per node → list of path states (one per source × path).
  const nodeStates = new Map<string, PathState[]>();
  // Source priors keyed by sourceId.
  const sourcePriors = new Map<string, number>();

  for (const src of sources) {
    sourcePriors.set(src.nodeId, clampP(src.prior));
    if (!graph.node(src.nodeId)) continue;

    // BFS from this source.
    const queue: Array<{ id: string; depth: number; via: string[]; cum: number }> = [
      { id: src.nodeId, depth: 0, via: [src.nodeId], cum: 1 },
    ];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const slot = nodeStates.get(cur.id) ?? [];
      slot.push({ fromSource: src.nodeId, via: cur.via, cumWeight: cur.cum });
      nodeStates.set(cur.id, slot);
      if (cur.depth >= maxDepth) continue;

      const out = graph.out(cur.id);
      const inn = bidirectional ? graph.in(cur.id) : [];

      for (const e of out) {
        if (cur.via.includes(e.to)) continue; // cycle
        const edgeWeight = effectiveEdgeWeight(e, weights);
        if (edgeWeight === 0) continue;
        queue.push({ id: e.to, depth: cur.depth + 1, via: [...cur.via, e.to], cum: cur.cum * edgeWeight });
      }
      for (const e of inn) {
        if (cur.via.includes(e.from)) continue;
        const edgeWeight = effectiveEdgeWeight(e, weights);
        if (edgeWeight === 0) continue;
        queue.push({ id: e.from, depth: cur.depth + 1, via: [...cur.via, e.from], cum: cur.cum * edgeWeight });
      }
    }
  }

  // Compose posterior per node using independence approximation:
  //   P(node | all paths) = 1 - ∏ (1 - P(node | path)).
  // Where P(node | path_i) = cumWeight_i × prior(source_i).
  const out: BeliefPosterior[] = [];
  for (const [nodeId, paths] of nodeStates) {
    let acc = 1; // ∏ (1 - p_i)
    const contributing: BeliefPosterior['contributingPaths'] = [];
    for (const p of paths) {
      const prior = sourcePriors.get(p.fromSource) ?? 0;
      const pathP = clampP(prior * p.cumWeight);
      acc *= 1 - pathP;
      contributing.push({
        from: p.fromSource,
        via: p.via,
        weight: p.cumWeight,
        pathProbability: pathP,
      });
    }
    out.push({
      nodeId,
      posterior: clampP(1 - acc),
      contributingPaths: contributing.sort((a, b) => b.pathProbability - a.pathProbability).slice(0, 8),
    });
  }
  return out.sort((a, b) => b.posterior - a.posterior);
}

function effectiveEdgeWeight(edge: GraphEdge, weights: Record<EdgeKind, number>): number {
  const base = weights[edge.kind] ?? 0.1;
  // For ownership-style edges, the edge.weight (share %) modulates the
  // base. Convert percentage → fraction if > 1.
  if (edge.kind === 'owns' || edge.kind === 'shareholder_of') {
    const share = edge.weight === undefined ? 1 : (edge.weight > 1 ? edge.weight / 100 : edge.weight);
    return Math.max(0, Math.min(1, base * share));
  }
  // Nominee taint always carries; fixed weight regardless of edge.weight.
  return Math.max(0, Math.min(1, base));
}

/** Convenience: rank nodes by posterior P(hypothesis), top-K. */
export function topRiskNodes(
  graph: EntityGraph,
  sources: readonly BeliefSource[],
  k = 10,
  opts: BeliefPropagationOptions = {},
): BeliefPosterior[] {
  return propagateBeliefs(graph, sources, opts).slice(0, k);
}
