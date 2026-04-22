// Hawkeye Sterling — forensic graph / chronology modes.
//
// These three modes compute structure over the evidence and prior-finding set:
//   · timeline_reconstruction  — orders timestamped events, flags gaps / reversals
//   · evidence_graph           — mode↔evidence bipartite graph; orphan modes & hub evidence
//   · link_analysis            — finding-to-finding links via shared evidence / shared faculties

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

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

export const FORENSIC_MODE_APPLIES = {
  timeline_reconstruction: timelineReconstructionApply,
  evidence_graph: evidenceGraphApply,
  link_analysis: linkAnalysisApply,
} as const;
