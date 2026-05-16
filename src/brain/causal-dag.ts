// Hawkeye Sterling — causal DAG auto-generation (audit follow-up #6).
//
// Builds a directed acyclic causal graph over the modes that fired in
// a verdict, with edges encoding "mode A's finding causally influences
// what mode B observes". The graph is a regulator-grade explanation
// artefact: not a regression, but a chain of cause-and-effect the MLRO
// can read top-down to understand WHY the verdict landed where it did.
//
// Charter P9 — every edge is justified by a typed CausalRelation that
// names the mechanism (evidence_dependency / threshold_trigger /
// regime_uplift / etc.).

export type CausalMechanism =
  | 'evidence_dependency'      // mode B reads evidence that mode A produced/cited
  | 'threshold_trigger'         // mode B fires only when mode A's score exceeds T
  | 'regime_uplift'             // mode A established jurisdiction → mode B applies regime rule
  | 'redline_block'             // mode A fired a redline → downstream verdict is blocked
  | 'category_inheritance'      // mode B operates on the typology category mode A surfaced
  | 'consistency_check'         // mode B is the meta-check on mode A
  | 'feedback_calibration';     // mode B's posterior depends on mode A's calibration history

export interface CausalEdge {
  fromModeId: string;
  toModeId: string;
  mechanism: CausalMechanism;
  rationale: string;
}

export interface CausalNode {
  modeId: string;
  category: string;
  score: number;
  verdict: string;
  faculties: string[];
}

export interface CausalDAG {
  nodes: CausalNode[];
  edges: CausalEdge[];
  roots: string[];       // nodes with no incoming edges
  leaves: string[];      // nodes with no outgoing edges
  topologicalOrder: string[];
}

interface FindingLite {
  modeId: string;
  category?: string;
  score?: number;
  verdict?: string;
  faculties?: string[];
  evidence?: string[];   // evidence IDs cited
  rationale?: string;
}

// Hand-rolled mechanism catalogue — mode-id pairs that have known
// causal directionality. Production should generate this from
// reasoning-modes.ts metadata; for now it's seeded with high-confidence
// pairs that show up in DPMS / sanctions / PEP screening flows.
const KNOWN_MECHANISMS: Array<{ from: string; to: string; mechanism: CausalMechanism; rationale: string }> = [
  { from: 'list_walk', to: 'sanctions_regime_matrix', mechanism: 'regime_uplift', rationale: 'list_walk surfaces which lists fired; the matrix scores cross-regime exposure on top.' },
  { from: 'list_walk', to: 'cross_regime_conflict', mechanism: 'evidence_dependency', rationale: 'cross-regime detection consumes the per-list hits list_walk produced.' },
  { from: 'sanctions_regime_matrix', to: 'redlines', mechanism: 'redline_block', rationale: 'matrix exposure triggers the eocn_confirmed / un_consolidated_confirmed redlines.' },
  { from: 'classify_pep', to: 'edd_required', mechanism: 'threshold_trigger', rationale: 'salience > 0.85 triggers EDD requirement.' },
  { from: 'classify_pep', to: 'four_eyes_stress', mechanism: 'threshold_trigger', rationale: 'high-tier PEP forces senior-management approval (four-eyes test).' },
  { from: 'ubo_tree_walk', to: 'jurisdiction_cascade', mechanism: 'evidence_dependency', rationale: 'UBO chain reveals jurisdictional layering for the cascade analyser.' },
  { from: 'ubo_tree_walk', to: 'cdd_failure_indicator', mechanism: 'threshold_trigger', rationale: 'opacity score > 0.5 → CDD inadequacy flag.' },
  { from: 'cash_courier_ctn', to: 'velocity_analysis', mechanism: 'evidence_dependency', rationale: 'cash-courier patterns inform velocity threshold analysis.' },
  { from: 'cash_courier_ctn', to: 'kpi_dpms_thirty', mechanism: 'category_inheritance', rationale: 'DPMS-specific cash KPIs ride on the cash-courier signals.' },
  { from: 'mixer_forensics', to: 'utxo_clustering', mechanism: 'evidence_dependency', rationale: 'mixer-tagged transactions seed UTXO cluster analysis.' },
  { from: 'mixer_forensics', to: 'sanctions_regime_matrix', mechanism: 'regime_uplift', rationale: 'mixer use raises VASP regulatory exposure (FATF R.15).' },
  { from: 'utxo_clustering', to: 'mixer_forensics', mechanism: 'feedback_calibration', rationale: 'cluster overlap with known mixer addresses recalibrates mixer-detection priors.' },
  { from: 'vessel_ais_gap', to: 'sanctions_regime_matrix', mechanism: 'regime_uplift', rationale: 'AIS gap near sanctioned port elevates TFS regime exposure.' },
  { from: 'cognitive_bias_audit', to: 'confidence_calibration', mechanism: 'consistency_check', rationale: 'meta-mode audits the calibration mode\'s outputs.' },
  { from: 'confidence_calibration', to: 'introspection', mechanism: 'feedback_calibration', rationale: 'calibration informs the chain-quality introspection.' },
  { from: 'popper_falsification', to: 'introspection', mechanism: 'consistency_check', rationale: 'falsification result feeds the introspection report.' },
  { from: 'source_triangulation', to: 'evidence_corroboration', mechanism: 'evidence_dependency', rationale: 'triangulation determines independent-source count for corroboration.' },
];

/** Build the causal DAG from a verdict's findings array. */
export function buildCausalDag(findings: readonly FindingLite[]): CausalDAG {
  if (findings.length === 0) {
    return { nodes: [], edges: [], roots: [], leaves: [], topologicalOrder: [] };
  }

  const seen = new Map<string, FindingLite>();
  for (const f of findings) seen.set(f.modeId, f);

  const nodes: CausalNode[] = [...seen.values()].map((f) => ({
    modeId: f.modeId,
    category: f.category ?? 'unknown',
    score: f.score ?? 0,
    verdict: f.verdict ?? 'inconclusive',
    faculties: f.faculties ?? [],
  }));

  const edges: CausalEdge[] = [];
  for (const m of KNOWN_MECHANISMS) {
    if (seen.has(m.from) && seen.has(m.to)) {
      // Skip self-loops and respect threshold semantics: only add the
      // edge if the upstream mode's score is non-trivial.
      const upstream = seen.get(m.from);
      if (!upstream) continue;
      if ((upstream.score ?? 0) < 0.05 && m.mechanism === 'threshold_trigger') continue;
      edges.push({
        fromModeId: m.from,
        toModeId: m.to,
        mechanism: m.mechanism,
        rationale: m.rationale,
      });
    }
  }

  // Add evidence_dependency edges from cross-references in finding evidence IDs.
  // If finding A cites evidence id 'foo' and finding B was the producer of 'foo',
  // edge A → B (B causes what A observed). Heuristic: producer is the finding
  // whose modeId matches the evidence-id prefix.
  const evidenceProducers = new Map<string, string[]>();
  for (const f of findings) {
    for (const e of f.evidence ?? []) evidenceProducers.set(e, [f.modeId]);
  }
  for (const f of findings) {
    for (const e of f.evidence ?? []) {
      const prods = evidenceProducers.get(e) ?? [];
      for (const prod of prods) {
        if (prod === f.modeId) continue;
        if (edges.some((x) => x.fromModeId === prod && x.toModeId === f.modeId)) continue;
        edges.push({
          fromModeId: prod,
          toModeId: f.modeId,
          mechanism: 'evidence_dependency',
          rationale: `${f.modeId} cites evidence '${e}' produced by ${prod}.`,
        });
      }
    }
  }

  // Topo-sort + DAG enforcement (drop edges that would create cycles).
  const inDeg = new Map<string, number>();
  for (const n of nodes) inDeg.set(n.modeId, 0);
  for (const e of edges) inDeg.set(e.toModeId, (inDeg.get(e.toModeId) ?? 0) + 1);

  const queue = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const topo: string[] = [];
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.fromModeId) ?? [];
    list.push(e.toModeId);
    adj.set(e.fromModeId, list);
  }
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    topo.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  // Cycle detection: if topo doesn't include all nodes, a cycle exists.
  // Drop edges that close the cycle by walking remaining-in-degree nodes.
  if (topo.length < nodes.length) {
    const placed = new Set(topo);
    const cycleNodes = nodes.filter((n) => !placed.has(n.modeId));
    for (const cn of cycleNodes) {
      // Drop incoming edges from non-placed nodes to break the cycle.
      for (let i = edges.length - 1; i >= 0; i--) {
        const e = edges[i];
        if (!e) continue;
        if (e.toModeId === cn.modeId && !placed.has(e.fromModeId)) {
          edges.splice(i, 1);
        }
      }
      topo.push(cn.modeId);
    }
  }

  const inSet = new Set<string>();
  const outSet = new Set<string>();
  for (const e of edges) {
    inSet.add(e.toModeId);
    outSet.add(e.fromModeId);
  }
  const roots = nodes.map((n) => n.modeId).filter((id) => !inSet.has(id));
  const leaves = nodes.map((n) => n.modeId).filter((id) => !outSet.has(id));

  return { nodes, edges, roots, leaves, topologicalOrder: topo };
}

/** Render a compact text representation for audit logs / regulator narrative. */
export function renderCausalDag(dag: CausalDAG): string {
  if (dag.nodes.length === 0) return '(empty causal DAG — no findings)';
  const lines: string[] = [];
  lines.push(`Causal DAG — ${dag.nodes.length} mode(s), ${dag.edges.length} edge(s).`);
  lines.push(`Roots: ${dag.roots.join(', ') || '(none)'}.`);
  lines.push(`Leaves: ${dag.leaves.join(', ') || '(none)'}.`);
  for (const id of dag.topologicalOrder) {
    const out = dag.edges.filter((e) => e.fromModeId === id);
    if (out.length === 0) continue;
    for (const e of out) {
      lines.push(`  ${id} → ${e.toModeId} (${e.mechanism}) — ${e.rationale}`);
    }
  }
  return lines.join('\n');
}
