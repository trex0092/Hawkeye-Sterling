// Hawkeye Sterling — sanctions exposure path finder.
// Traces all paths from a customer to a sanctioned entity through the
// ownership/relationship graph, calculates exposure scores, and
// generates MLRO-grade narrative for each path.
//
// Example output:
//   Customer → Company A (owns 40%) → Director B → Relative C → Sanctioned Person
//   Exposure distance: 4 hops | Score: 0.27 | EDD required: yes
//
// Exposure decays exponentially with distance but boosts for:
//   - Ownership edges (stronger than association)
//   - Offshore jurisdictions
//   - Nominee structures

import { EntityGraph, type EdgeKind, type GraphEdge } from './entity-graph.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PathStep {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  edgeKind: EdgeKind;
  edgeWeight?: number | undefined;
  jurisdiction?: string | undefined;
  isNominee: boolean;
  stepScore: number;
}

export interface ExposurePath {
  pathId: string;
  customerId: string;
  customerName: string;
  sanctionedId: string;
  sanctionedName: string;
  sanctionedPrograms: string[];
  steps: PathStep[];
  totalHops: number;
  exposureScore: number;     // 0..1 — higher = more exposed
  exposureLevel: 'critical' | 'high' | 'medium' | 'low' | 'negligible';
  requiresEDD: boolean;
  requiresSAR: boolean;
  narrative: string;
  riskFactors: string[];
  mitigatingFactors: string[];
}

export interface ExposureAnalysis {
  customerId: string;
  customerName: string;
  analysedAt: string;
  sanctionedEntitiesSearched: number;
  pathsFound: number;
  paths: ExposurePath[];
  worstCase: ExposurePath | null;
  aggregateScore: number;
  overallExposureLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
  requiredActions: string[];
}

// ── Offshore jurisdictions ────────────────────────────────────────────────────

const OFFSHORE_JURISDICTIONS = new Set([
  'KY', 'VG', 'PA', 'SC', 'BZ', 'MH', 'VU', 'WS', 'AG', 'LC',
  'BS', 'GG', 'JE', 'IM', 'LI', 'BM', 'TC', 'AI', 'MS', 'AN',
]);

// ── Edge weight lookup ────────────────────────────────────────────────────────

const EDGE_WEIGHT_DEFAULTS: Record<string, number> = {
  owns: 0.90,
  controls: 0.85,
  shareholder_of: 0.70,
  director_of: 0.60,
  nominee_for: 0.80,
  beneficiary_of: 0.75,
  spouse_of: 0.70,
  family_of: 0.60,
  close_associate_of: 0.40,
  associated_with: 0.30,
  wire_to: 0.50,
  paid: 0.55,
  received: 0.55,
  registered_at: 0.20,
  custody_of: 0.65,
  transacted_with: 0.35,
};

function edgeExposureWeight(edge: GraphEdge): number {
  const base = EDGE_WEIGHT_DEFAULTS[edge.kind] ?? 0.30;
  const nodeWeight = edge.weight !== undefined
    ? Math.max(0, Math.min(1, edge.weight > 1 ? edge.weight / 100 : edge.weight))
    : 1;
  return base * Math.sqrt(nodeWeight); // sqrt to avoid over-penalising small shares
}

// ── Exposure score calculator ─────────────────────────────────────────────────

function calculateExposureScore(steps: PathStep[], _graph: EntityGraph): number {
  if (steps.length === 0) return 0;

  let score = 1.0;
  for (const step of steps) {
    score *= step.stepScore;

    // Offshore boost
    if (step.jurisdiction && OFFSHORE_JURISDICTIONS.has(step.jurisdiction)) {
      score *= 1.20; // offshore does NOT reduce risk — it increases it
    }

    // Nominee boost
    if (step.isNominee) score *= 1.15;
  }

  // Clamp to [0,1]
  return Math.min(1, Math.max(0, score));
}

function exposureLevel(score: number): ExposurePath['exposureLevel'] {
  if (score >= 0.70) return 'critical';
  if (score >= 0.40) return 'high';
  if (score >= 0.20) return 'medium';
  if (score >= 0.05) return 'low';
  return 'negligible';
}

// ── Path narrative builder ────────────────────────────────────────────────────

function buildNarrative(
  customerName: string,
  sanctionedName: string,
  steps: PathStep[],
  score: number,
  programs: string[],
): string {
  const chain = [customerName, ...steps.map((s) => `${s.toName} (via ${s.edgeKind.replace(/_/g, ' ')})`)]
    .join(' → ');

  const progText = programs.length > 0 ? ` under sanctions program(s) ${programs.join(', ')}` : '';
  const scoreText = `Exposure score: ${(score * 100).toFixed(0)}%`;

  return `${chain}. Subject "${sanctionedName}" is designated${progText}. ${scoreText} across ${steps.length} relationship hop(s).`;
}

// ── All-paths BFS ─────────────────────────────────────────────────────────────

interface BFSState {
  nodeId: string;
  steps: PathStep[];
  visitedNodes: Set<string>;
  cumulativeScore: number;
}

const _ALL_EDGE_KINDS: EdgeKind[] = [
  'owns', 'controls', 'shareholder_of', 'director_of', 'nominee_for',
  'beneficiary_of', 'spouse_of', 'family_of', 'close_associate_of',
  'associated_with', 'wire_to', 'paid', 'received', 'transacted_with', 'custody_of',
];

function findAllPaths(
  graph: EntityGraph,
  startId: string,
  targetId: string,
  maxHops: number,
  minScore: number,
): PathStep[][] {
  const results: PathStep[][] = [];
  const queue: BFSState[] = [{
    nodeId: startId,
    steps: [],
    visitedNodes: new Set([startId]),
    cumulativeScore: 1.0,
  }];

  while (queue.length > 0) {
    const state = queue.shift()!;
    if (state.steps.length > maxHops) continue;
    if (state.cumulativeScore < minScore) continue;

    if (state.nodeId === targetId && state.steps.length > 0) {
      results.push([...state.steps]);
      continue;
    }

    const outEdges = graph.out(state.nodeId);
    const inEdges = graph.in(state.nodeId);

    for (const edge of [...outEdges, ...inEdges]) {
      const nextId = edge.from === state.nodeId ? edge.to : edge.from;
      if (state.visitedNodes.has(nextId)) continue;

      const fromNode = graph.node(state.nodeId);
      const toNode = graph.node(nextId);
      if (!toNode) continue;

      const stepWeight = edgeExposureWeight(edge);
      const nextScore = state.cumulativeScore * stepWeight;
      if (nextScore < minScore && nextId !== targetId) continue;

      const step: PathStep = {
        fromId: state.nodeId,
        fromName: fromNode?.label ?? state.nodeId,
        toId: nextId,
        toName: toNode.label,
        edgeKind: edge.kind,
        edgeWeight: edge.weight,
        jurisdiction: toNode.attrs?.['jurisdiction'] as string | undefined,
        isNominee: Boolean(edge.attrs?.['nominee']) || edge.kind === 'nominee_for',
        stepScore: stepWeight,
      };

      queue.push({
        nodeId: nextId,
        steps: [...state.steps, step],
        visitedNodes: new Set([...state.visitedNodes, nextId]),
        cumulativeScore: nextScore,
      });
    }
  }

  return results;
}

// ── Path ID generator ─────────────────────────────────────────────────────────

function pathId(customerId: string, sanctionedId: string, steps: PathStep[]): string {
  const key = `${customerId}→${steps.map((s) => s.toId).join('→')}→${sanctionedId}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Main exposure path finder ─────────────────────────────────────────────────

export interface ExposureSearchConfig {
  maxHops?: number;           // default 5
  minExposureScore?: number;  // default 0.05 (5%)
  maxPathsPerTarget?: number; // default 3
}

export function findExposurePaths(
  graph: EntityGraph,
  customerId: string,
  sanctionedEntities: Array<{ id: string; name: string; programs: string[] }>,
  config: ExposureSearchConfig = {},
): ExposureAnalysis {
  const maxHops = config.maxHops ?? 5;
  const minScore = config.minExposureScore ?? 0.05;
  const maxPathsPerTarget = config.maxPathsPerTarget ?? 3;

  const customer = graph.node(customerId);
  const allPaths: ExposurePath[] = [];

  for (const sanctioned of sanctionedEntities) {
    const rawPaths = findAllPaths(graph, customerId, sanctioned.id, maxHops, minScore);
    const topPaths = rawPaths
      .map((steps) => {
        const score = calculateExposureScore(steps, graph);
        return { steps, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPathsPerTarget);

    for (const { steps, score } of topPaths) {
      if (steps.length === 0) continue;
      const level = exposureLevel(score);
      const riskFactors: string[] = [];
      const mitigatingFactors: string[] = [];

      if (steps.some((s) => s.isNominee)) riskFactors.push('Nominee structure in chain');
      if (steps.some((s) => s.jurisdiction && OFFSHORE_JURISDICTIONS.has(s.jurisdiction))) {
        riskFactors.push('Offshore jurisdiction in chain');
      }
      if (steps.length <= 2) riskFactors.push(`Close relationship (${steps.length} hop${steps.length === 1 ? '' : 's'})`);
      if (steps.some((s) => s.edgeKind === 'owns' || s.edgeKind === 'controls')) {
        riskFactors.push('Direct ownership or control relationship');
      }

      if (score < 0.20) mitigatingFactors.push('Distant indirect relationship');
      if (steps.every((s) => !s.isNominee)) mitigatingFactors.push('No nominee structures in chain');

      allPaths.push({
        pathId: pathId(customerId, sanctioned.id, steps),
        customerId,
        customerName: customer?.label ?? customerId,
        sanctionedId: sanctioned.id,
        sanctionedName: sanctioned.name,
        sanctionedPrograms: sanctioned.programs,
        steps,
        totalHops: steps.length,
        exposureScore: score,
        exposureLevel: level,
        requiresEDD: score >= 0.20 || level === 'critical' || level === 'high',
        requiresSAR: score >= 0.60 || level === 'critical',
        narrative: buildNarrative(customer?.label ?? customerId, sanctioned.name, steps, score, sanctioned.programs),
        riskFactors,
        mitigatingFactors,
      });
    }
  }

  allPaths.sort((a, b) => b.exposureScore - a.exposureScore);

  const worstCase = allPaths[0] ?? null;
  const aggregateScore = allPaths.reduce((max, p) => Math.max(max, p.exposureScore), 0);
  const overallLevel = exposureLevel(aggregateScore);

  const requiredActions: string[] = [];
  if (allPaths.some((p) => p.requiresSAR)) {
    requiredActions.push('File STR/SAR — direct or close sanctions exposure identified (FATF R.20)');
  }
  if (allPaths.some((p) => p.requiresEDD)) {
    requiredActions.push('Perform Enhanced Due Diligence — sanctions proximity requires investigation (FATF R.10, R.19)');
  }
  if (allPaths.some((p) => p.steps.some((s) => s.isNominee))) {
    requiredActions.push('Investigate nominee structures — possible concealment of beneficial ownership (FATF R.24, R.25)');
  }
  if (requiredActions.length === 0) {
    requiredActions.push('No immediate action required — continue standard monitoring');
  }

  return {
    customerId,
    customerName: customer?.label ?? customerId,
    analysedAt: new Date().toISOString(),
    sanctionedEntitiesSearched: sanctionedEntities.length,
    pathsFound: allPaths.length,
    paths: allPaths,
    worstCase,
    aggregateScore,
    overallExposureLevel: overallLevel === 'negligible' ? 'none' : overallLevel,
    requiredActions,
  };
}
