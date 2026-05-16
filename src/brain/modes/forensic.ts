// Hawkeye Sterling — forensic graph / chronology modes.
//
// These three modes compute structure over the evidence and prior-finding set:
//   · timeline_reconstruction  — orders timestamped events, flags gaps / reversals
//   · evidence_graph           — mode↔evidence bipartite graph; orphan modes & hub evidence
//   · link_analysis            — finding-to-finding links via shared evidence / shared faculties

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';
import { EntityGraph, type EdgeKind, type NodeKind } from '../entity-graph.js';

// Edge kinds that count as "ownership / control" traversal for UBO walk.
const UBO_EDGE_KINDS: readonly EdgeKind[] = ['owns', 'controls', 'shareholder_of', 'director_of'];

interface UboWalkPath {
  nodes: string[];
  cumulativeShare: number;
  terminated: 'natural_person' | 'cycle' | 'opaque' | 'max_depth';
}

function walkUbo(g: EntityGraph, rootId: string, maxDepth = 8): { paths: UboWalkPath[]; opaque: string[] } {
  const paths: UboWalkPath[] = [];
  const opaque: string[] = [];
  const walk = (id: string, visited: Set<string>, trail: string[], share: number, depth: number): void => {
    const node = g.node(id);
    if (!node) {
      paths.push({ nodes: [...trail, id], cumulativeShare: share, terminated: 'opaque' });
      opaque.push(id);
      return;
    }
    if (visited.has(id)) {
      paths.push({ nodes: [...trail, id], cumulativeShare: share, terminated: 'cycle' });
      return;
    }
    if (depth > maxDepth) {
      paths.push({ nodes: [...trail, id], cumulativeShare: share, terminated: 'max_depth' });
      return;
    }
    if (node.kind === 'person') {
      paths.push({ nodes: [...trail, id], cumulativeShare: share, terminated: 'natural_person' });
      return;
    }
    const owners = g.out(id, UBO_EDGE_KINDS);
    if (owners.length === 0) {
      paths.push({ nodes: [...trail, id], cumulativeShare: share, terminated: 'opaque' });
      opaque.push(id);
      return;
    }
    const next = new Set(visited).add(id);
    for (const e of owners) {
      // Normalise percentage weights (e.g. 51 for 51%) to fractions, consistent
      // with belief-propagation.ts effectiveEdgeWeight(). Without this, a weight
      // of 51 would multiply the cumulative share by 51× rather than 0.51×.
      const raw = typeof e.weight === 'number' ? e.weight : 1;
      const w = raw > 1 ? raw / 100 : raw;
      walk(e.to, next, [...trail, id], share * w, depth + 1);
    }
  };
  walk(rootId, new Set(), [], 1, 0);
  return { paths, opaque: [...new Set(opaque)] };
}

function buildUboGraph(rootId: string, chain: unknown[]): EntityGraph {
  const g = new EntityGraph();
  g.addNode({ id: rootId, kind: 'entity', label: rootId });
  for (const raw of chain) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const from = typeof rec.from === 'string' ? rec.from : rootId;
    const to = typeof rec.to === 'string' ? rec.to
      : typeof rec.id === 'string' ? rec.id : undefined;
    if (!to) continue;
    const label = typeof rec.label === 'string' ? rec.label
      : typeof rec.name === 'string' ? rec.name : to;
    const kind: NodeKind = rec.kind === 'person' || rec.type === 'natural_person' || rec.kind === 'individual'
      ? 'person' : 'entity';
    if (!g.node(from)) g.addNode({ id: from, kind: 'entity', label: from });
    if (!g.node(to)) g.addNode({ id: to, kind, label });
    const share = typeof rec.share === 'number' ? rec.share
      : typeof rec.weight === 'number' ? rec.weight : undefined;
    const edge: { from: string; to: string; kind: EdgeKind; weight?: number } = {
      from, to, kind: 'owns',
    };
    if (share !== undefined) edge.weight = share;
    g.addEdge(edge);
  }
  return g;
}

function findingOf(
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
    modeId, category, faculties, verdict,
    score: Math.min(1, Math.max(0, score)),
    confidence: Math.min(1, Math.max(0, confidence)),
    rationale, evidence,
    producedAt: Date.now(),
  };
}

function priors(ctx: BrainContext): Finding[] {
  return ctx.priorFindings.filter((f) => {
    if (f.tags?.includes('meta') || f.tags?.includes('introspection')) return false;
    if (f.rationale.startsWith('[stub]')) return false;
    return true;
  });
}

function extractTimestamps(items: unknown): number[] {
  if (!Array.isArray(items)) return [];
  const ts: number[] = [];
  for (const x of items) {
    if (x && typeof x === 'object') {
      const rec = x as Record<string, unknown>;
      const t = rec.timestamp ?? rec.date ?? rec.observedAt ?? rec.ts;
      if (typeof t === 'number' && Number.isFinite(t)) ts.push(t);
      else if (typeof t === 'string') {
        const n = Date.parse(t);
        if (!Number.isNaN(n)) ts.push(n);
      }
    }
  }
  return ts.sort((a, b) => a - b);
}

// ── timeline_reconstruction ─────────────────────────────────────────────
export const timelineReconstructionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ts = [
    ...extractTimestamps(ctx.evidence.transactions),
    ...extractTimestamps(ctx.evidence.adverseMedia),
    ...extractTimestamps(ctx.evidence.documents),
  ].sort((a, b) => a - b);
  if (ts.length < 3) {
    return findingOf(
      'timeline_reconstruction', 'forensic', ['intelligence', 'ratiocination'],
      'inconclusive', 0, 0.5,
      `Timeline: only ${ts.length} timestamped event(s); unable to reconstruct a meaningful sequence.`,
    );
  }
  // Gaps: intervals between consecutive events in days.
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) {
    const prev = ts[i - 1]!;
    const cur = ts[i]!;
    gaps.push((cur - prev) / 86_400_000);
  }
  gaps.sort((a, b) => b - a);
  const medianGap = gaps[Math.floor(gaps.length / 2)] ?? 0;
  const maxGap = gaps[0] ?? 0;
  const burst = gaps.filter((g) => g < 1).length;  // events < 1 day apart
  const notes: string[] = [
    `events=${ts.length}`,
    `median_gap_days=${medianGap.toFixed(2)}`,
    `max_gap_days=${maxGap.toFixed(2)}`,
    `sub_day_bursts=${burst}`,
  ];
  const anomalous =
    (maxGap > 10 * Math.max(1, medianGap) && medianGap > 0) ||
    burst >= Math.max(3, Math.floor(ts.length / 3));
  return findingOf(
    'timeline_reconstruction', 'forensic', ['intelligence', 'ratiocination'],
    anomalous ? 'flag' : 'clear',
    anomalous ? 0.55 : 0.1,
    0.8,
    `Timeline: ${notes.join('; ')}.${anomalous ? ' Anomaly: long gap or sub-day burst pattern.' : ''}`,
  );
};

// ── evidence_graph ──────────────────────────────────────────────────────
export const evidenceGraphApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  if (p.length === 0) {
    return findingOf(
      'evidence_graph', 'forensic', ['intelligence', 'ratiocination'],
      'inconclusive', 0, 0.4,
      'Evidence graph: no prior findings.',
    );
  }
  const evidenceDegree = new Map<string, number>();
  const orphanModes: string[] = [];
  for (const f of p) {
    if (f.evidence.length === 0) orphanModes.push(f.modeId);
    for (const e of f.evidence) {
      evidenceDegree.set(e, (evidenceDegree.get(e) ?? 0) + 1);
    }
  }
  const hubs = [...evidenceDegree.entries()]
    .filter(([, d]) => d >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const totalEdges = [...evidenceDegree.values()].reduce((a, b) => a + b, 0);
  const density = totalEdges / (p.length * Math.max(1, evidenceDegree.size));

  const notes = [
    `modes=${p.length}`,
    `evidence_nodes=${evidenceDegree.size}`,
    `edges=${totalEdges}`,
    `density=${density.toFixed(2)}`,
    `orphans=${orphanModes.length}`,
  ];
  const risky = orphanModes.length >= Math.ceil(p.length / 2) || evidenceDegree.size === 0;
  return findingOf(
    'evidence_graph', 'forensic', ['intelligence', 'ratiocination'],
    risky ? 'flag' : 'clear',
    risky ? 0.5 : 0.1,
    0.85,
    `Evidence graph: ${notes.join('; ')}. ${
      hubs.length > 0 ? `Hub evidence: ${hubs.map(([e, d]) => `${e}(×${d})`).join(', ')}.` : ''
    }${
      risky ? ` Reasoning is evidence-thin: ${orphanModes.length}/${p.length} modes cite zero evidence.` : ''
    }`,
    [...evidenceDegree.keys()].slice(0, 10),
  );
};

// ── link_analysis ───────────────────────────────────────────────────────
export const linkAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = priors(ctx);
  if (p.length < 2) {
    return findingOf(
      'link_analysis', 'forensic', ['intelligence', 'ratiocination'],
      'inconclusive', 0, 0.4,
      'Link analysis: fewer than 2 findings to link.',
    );
  }
  // Two findings are linked if they share ≥1 evidence ID OR ≥2 faculties.
  const links: Array<[string, string, string]> = [];
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      const a = p[i]!;
      const b = p[j]!;
      const sharedEvid = a.evidence.filter((e) => b.evidence.includes(e));
      const sharedFac = a.faculties.filter((x) => b.faculties.includes(x));
      if (sharedEvid.length >= 1) links.push([a.modeId, b.modeId, `shares evidence: ${sharedEvid.join(',')}`]);
      else if (sharedFac.length >= 2) links.push([a.modeId, b.modeId, `shares faculties: ${sharedFac.join(',')}`]);
    }
  }
  const components = new Map<string, Set<string>>();
  for (const f of p) components.set(f.modeId, new Set([f.modeId]));
  for (const [a, b] of links) {
    const ca = components.get(a)!;
    const cb = components.get(b)!;
    if (ca !== cb) {
      for (const x of cb) ca.add(x);
      for (const x of cb) components.set(x, ca);
    }
  }
  const distinctComponents = new Set<Set<string>>([...components.values()]);
  const largestSize = Math.max(...[...distinctComponents].map((s) => s.size));
  const coverage = largestSize / p.length;

  const strong = coverage >= 0.6 && links.length >= p.length - 1;
  return findingOf(
    'link_analysis', 'forensic', ['intelligence', 'ratiocination'],
    strong ? 'clear' : 'flag',
    strong ? 0.15 : 0.45,
    0.8,
    `Link analysis: ${links.length} link(s) across ${p.length} findings; largest connected component covers ${(coverage * 100).toFixed(0)}% of findings. ${
      strong
        ? 'Reasoning is internally connected — evidence and faculties cross-reference.'
        : 'Reasoning is fragmented — several findings do not connect to the main cluster; possible narrative drift.'
    }`,
  );
};

// ── ubo_tree_walk ───────────────────────────────────────────────────────
// Uses EntityGraph built from ctx.evidence.uboChain to walk ownership edges
// from the subject to all natural persons. Opaque branches ⇒ ubo_opaque.
export const uboTreeWalkApply = async (ctx: BrainContext): Promise<Finding> => {
  const chain = ctx.evidence.uboChain;
  if (!Array.isArray(chain) || chain.length === 0) {
    return findingOf(
      'ubo_tree_walk', 'compliance_framework', ['ratiocination'],
      'inconclusive', 0, 0.4,
      'UBO tree walk: evidence.uboChain not supplied.',
    );
  }
  const rootId = ctx.subject.name || 'subject';
  const g = buildUboGraph(rootId, chain);
  const result = walkUbo(g, rootId);
  const natural = result.paths.filter((p) => p.terminated === 'natural_person');
  const opaque = result.paths.filter((p) => p.terminated === 'opaque');
  const cycles = result.paths.filter((p) => p.terminated === 'cycle');
  const maxDepth = result.paths.filter((p) => p.terminated === 'max_depth');

  const explainedShare = natural.reduce((a, p) => a + p.cumulativeShare, 0);
  const opaqueShare = opaque.reduce((a, p) => a + p.cumulativeShare, 0);

  const verdict: Verdict = opaqueShare > 0.5 ? 'escalate'
    : opaqueShare > 0.25 || cycles.length > 0 ? 'flag'
    : 'clear';
  const rationale =
    `UBO walk from ${rootId}: ${natural.length} natural-person terminus(es) (cum. share ${(explainedShare * 100).toFixed(0)}%), ` +
    `${opaque.length} opaque branch(es) (cum. share ${(opaqueShare * 100).toFixed(0)}%), ` +
    `${cycles.length} cycle(s), ${maxDepth.length} max-depth truncation(s). ` +
    `${opaqueShare > 0.25 ? 'UBO transparency is weak — charter P6 requires explicit disambiguation.' : 'UBO chain resolves to natural persons.'}`;
  const f: Finding = {
    modeId: 'ubo_tree_walk',
    category: 'compliance_framework',
    faculties: ['ratiocination'],
    verdict,
    score: Math.min(1, opaqueShare),
    confidence: 0.85,
    rationale,
    evidence: [],
    producedAt: Date.now(),
  };
  if (opaqueShare > 0.25) f.hypothesis = 'ubo_opaque';
  return f;
};

// ── kill_chain ──────────────────────────────────────────────────────────
// Walks a simplified ML kill chain — Placement → Layering → Integration —
// over transaction evidence. Marks which stages have observable signals.
export const killChainApply = async (ctx: BrainContext): Promise<Finding> => {
  const txs = Array.isArray(ctx.evidence.transactions) ? ctx.evidence.transactions : [];
  if (txs.length === 0) {
    return findingOf('kill_chain', 'forensic', ['intelligence'],
      'inconclusive', 0, 0.4, 'Kill chain: no transactions to stage.');
  }
  let placement = 0;  // cash-heavy, small-amount ingress
  let layering = 0;   // transfers, swaps, cross-border
  let integration = 0; // outflows to 'legitimate'-looking destinations
  for (const x of txs) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const amt = typeof r.amount === 'number' ? r.amount : 0;
    if (r.cash === true || r.mechanism === 'cash_deposit') placement++;
    if (r.crossBorder === true || r.mechanism === 'wire_transfer' || r.swap === true) layering++;
    if (amt < 0 && typeof r.destination === 'string' && (r.destination.includes('real_estate') || r.destination.includes('business') || r.legitimatePurpose === true)) integration++;
  }
  const stages = [placement > 0, layering > 0, integration > 0].filter(Boolean).length;
  const verdict: Verdict = stages === 3 ? 'escalate' : stages === 2 ? 'flag' : 'clear';
  return findingOf('kill_chain', 'forensic', ['intelligence'],
    verdict, stages / 3, 0.85,
    `ML kill chain: placement=${placement > 0 ? 'observed' : 'absent'} (${placement}), layering=${layering > 0 ? 'observed' : 'absent'} (${layering}), integration=${integration > 0 ? 'observed' : 'absent'} (${integration}). ${stages}/3 stages have observable signals.`);
};

// ── narrative_coherence ────────────────────────────────────────────────
// Does the customer-stated narrative match the observed evidence?
// evidence.statedBusiness / statedPurpose compared against transaction
// counterparty distribution and documents.
export const narrativeCoherenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const e = ctx.evidence as Record<string, unknown>;
  const stated = typeof e.statedBusiness === 'string' ? e.statedBusiness.toLowerCase() : '';
  const purpose = typeof e.statedPurpose === 'string' ? e.statedPurpose.toLowerCase() : '';
  if (!stated && !purpose) {
    return findingOf('narrative_coherence', 'forensic', ['deep_thinking', 'intelligence'],
      'inconclusive', 0, 0.4,
      'Narrative coherence: evidence.statedBusiness / statedPurpose not supplied.');
  }
  const txs = Array.isArray(ctx.evidence.transactions) ? ctx.evidence.transactions : [];
  let matches = 0; let total = 0;
  for (const x of txs) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const cp = typeof r.counterparty === 'string' ? r.counterparty.toLowerCase() : '';
    const memo = typeof r.memo === 'string' ? r.memo.toLowerCase()
      : typeof r.description === 'string' ? r.description.toLowerCase() : '';
    total++;
    const blob = cp + ' ' + memo;
    if ((stated && blob.includes(stated.split(' ')[0] ?? '')) ||
        (purpose && blob.includes(purpose.split(' ')[0] ?? ''))) {
      matches++;
    }
  }
  if (total === 0) {
    return findingOf('narrative_coherence', 'forensic', ['deep_thinking', 'intelligence'],
      'inconclusive', 0, 0.4, 'Narrative coherence: no transactions to cross-check.');
  }
  const rate = matches / total;
  const verdict: Verdict = rate < 0.2 ? 'escalate' : rate < 0.5 ? 'flag' : 'clear';
  return findingOf('narrative_coherence', 'forensic', ['deep_thinking', 'intelligence'],
    verdict, 1 - rate, 0.8,
    `Narrative coherence: ${matches}/${total} transactions reference the stated business / purpose ("${stated || purpose}"). ${rate < 0.5 ? 'Stated activity diverges from observed activity — escalate for explanation.' : 'Stated activity broadly matches observed activity.'}`);
};

export const FORENSIC_MODE_APPLIES = {
  timeline_reconstruction: timelineReconstructionApply,
  evidence_graph: evidenceGraphApply,
  link_analysis: linkAnalysisApply,
  ubo_tree_walk: uboTreeWalkApply,
  kill_chain: killChainApply,
  narrative_coherence: narrativeCoherenceApply,
} as const;
