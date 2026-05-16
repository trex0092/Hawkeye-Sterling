// Hawkeye Sterling — relationship intelligence engine.
// Analyses the EntityGraph to detect:
//   - Hidden UBOs through nominee/shell layers
//   - Shell-company chains and layered ownership
//   - Indirect sanctions exposure through related parties
//   - Common directors/shareholders across entities
//   - Nominee structures and circular ownership
//   - PEP relationships and political exposure chains
//
// Operates on the EntityGraph from entity-graph.ts.
// Designed for Neo4j-compatible graph queries when a graph DB is available.

import { EntityGraph, type GraphNode, type EdgeKind } from './entity-graph.js';

// ── Detection types ───────────────────────────────────────────────────────────

export interface UBOChain {
  ultimateBeneficialOwnerId: string;
  ultimateBeneficialOwnerName: string;
  targetEntityId: string;
  targetEntityName: string;
  effectiveOwnershipPercent: number;
  chainDepth: number;
  path: Array<{ nodeId: string; nodeName: string; edgeKind: EdgeKind; weight?: number | undefined }>;
  viaNominee: boolean;
  riskFlags: string[];
}

export interface ShellChain {
  startId: string;
  endId: string;
  intermediateEntities: Array<{ id: string; name: string; jurisdiction?: string | undefined }>;
  depth: number;
  riskScore: number;   // 0..1
  characteristics: string[];   // 'nominee_directors', 'offshore_jurisdiction', 'circular', etc.
}

export interface CommonController {
  controllerId: string;
  controllerName: string;
  controlledEntities: Array<{ id: string; name: string; edgeKind: EdgeKind }>;
  controlCount: number;
  riskImplication: string;
}

export interface SanctionsProximity {
  subjectId: string;
  sanctionedNodeId: string;
  sanctionedNodeName: string;
  distanceHops: number;
  exposurePath: string[];
  exposureScore: number;   // 0..1 — decays with distance
  requiresEDD: boolean;
}

export interface GraphIntelligenceReport {
  subjectId: string;
  subjectName: string;
  analysedAt: string;

  uboChains: UBOChain[];
  shellChains: ShellChain[];
  commonControllers: CommonController[];
  sanctionsProximities: SanctionsProximity[];

  totalEntitiesAnalysed: number;
  maxDepthSearched: number;

  riskSummary: {
    overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'clear';
    primaryDrivers: string[];
    requiresEDD: boolean;
    requiresSAR: boolean;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HIGH_RISK_JURISDICTIONS = new Set([
  'KY', 'VG', 'BVI', 'PA', 'SC', 'BZ', 'MH', 'VU', 'WS', 'AG', 'LC',
  'VC', 'BB', 'KN', 'AI', 'TC', 'BS', 'GG', 'JE', 'IM', 'LI', 'SM',
  'MC', 'AD', 'LU',
]);

const OWNERSHIP_EDGES: EdgeKind[] = ['owns', 'controls', 'shareholder_of'];
const PEP_EDGES: EdgeKind[] = ['family_of', 'spouse_of', 'close_associate_of'];
const ALL_CORPORATE_EDGES: EdgeKind[] = ['owns', 'controls', 'shareholder_of', 'director_of', 'nominee_for', 'beneficiary_of'];

// ── UBO analysis ──────────────────────────────────────────────────────────────

export function detectUBOChains(
  graph: EntityGraph,
  subjectId: string,
  _maxDepth = 6,
): UBOChain[] {
  const chains: UBOChain[] = [];
  const subject = graph.node(subjectId);
  if (!subject) return chains;

  const uboResults = graph.effectiveOwnership(subjectId);

  for (const ubo of uboResults) {
    const person = graph.node(ubo.personId);
    if (!person) continue;

    const path = graph.shortestPath(ubo.personId, subjectId, OWNERSHIP_EDGES);

    const riskFlags: string[] = [];
    if (ubo.viaNominee) riskFlags.push('nominee_structure_detected');
    if (ubo.percent < 25 && ubo.percent > 0) riskFlags.push('below_25pct_ubo_threshold');
    if (ubo.chain.length > 3) riskFlags.push('deep_ownership_chain');

    // Check if any intermediate nodes are in high-risk jurisdictions
    for (const nodeId of ubo.chain) {
      const n = graph.node(nodeId);
      const jurisdiction = n?.attrs?.['jurisdiction'] as string | undefined;
      if (jurisdiction && HIGH_RISK_JURISDICTIONS.has(jurisdiction)) {
        riskFlags.push(`offshore_jurisdiction_${jurisdiction}`);
      }
    }

    const pathWithNames = (path ?? ubo.chain).map((nodeId, idx) => {
      const n = graph.node(nodeId);
      const edges = idx < ubo.chain.length - 1
        ? graph.out(nodeId, OWNERSHIP_EDGES)
        : [];
      return {
        nodeId,
        nodeName: n?.label ?? nodeId,
        edgeKind: edges[0]?.kind ?? ('owns' as EdgeKind),
        weight: edges[0]?.weight,
      };
    });

    chains.push({
      ultimateBeneficialOwnerId: ubo.personId,
      ultimateBeneficialOwnerName: person.label,
      targetEntityId: subjectId,
      targetEntityName: subject.label,
      effectiveOwnershipPercent: ubo.percent,
      chainDepth: ubo.chain.length - 1,
      path: pathWithNames,
      viaNominee: ubo.viaNominee,
      riskFlags,
    });
  }

  return chains;
}

// ── Shell chain detection ──────────────────────────────────────────────────────

function isShellEntity(node: GraphNode): boolean {
  return (
    node.kind === 'entity' &&
    (Boolean(node.attrs?.['is_shell']) ||
      Boolean(node.attrs?.['nominee_directors']) ||
      Boolean(node.attrs?.['no_operations']))
  );
}

export function detectShellChains(
  graph: EntityGraph,
  startId: string,
  maxDepth = 5,
): ShellChain[] {
  const chains: ShellChain[] = [];
  const neighbourhood = graph.neighbourhood(startId, maxDepth, OWNERSHIP_EDGES);

  for (const [nodeId, depth] of neighbourhood) {
    if (nodeId === startId || depth === 0) continue;
    const node = graph.node(nodeId);
    if (!node || node.kind === 'person') continue;

    const path = graph.shortestPath(startId, nodeId, OWNERSHIP_EDGES);
    if (!path || path.length < 3) continue;

    const intermediates = path.slice(1, -1).map((id) => {
      const n = graph.node(id);
      return {
        id,
        name: n?.label ?? id,
        jurisdiction: n?.attrs?.['jurisdiction'] as string | undefined,
      };
    });

    const characteristics: string[] = [];
    let riskScore = 0;

    for (const inter of intermediates) {
      if (inter.jurisdiction && HIGH_RISK_JURISDICTIONS.has(inter.jurisdiction)) {
        characteristics.push('offshore_intermediate');
        riskScore += 0.30;
      }
      const n = graph.node(inter.id);
      if (n && isShellEntity(n)) {
        characteristics.push('shell_entity_in_chain');
        riskScore += 0.25;
      }
    }

    if (depth >= 3) {
      characteristics.push('deep_chain');
      riskScore += 0.10 * (depth - 2);
    }

    // Check for circular ownership
    const endNeighbours = graph.neighbourhood(nodeId, 2, OWNERSHIP_EDGES);
    if (endNeighbours.has(startId)) {
      characteristics.push('circular_ownership');
      riskScore += 0.40;
    }

    if (characteristics.length > 0) {
      chains.push({
        startId,
        endId: nodeId,
        intermediateEntities: intermediates,
        depth,
        riskScore: Math.min(1, riskScore),
        characteristics: [...new Set(characteristics)],
      });
    }
  }

  return chains.sort((a, b) => b.riskScore - a.riskScore);
}

// ── Common controller detection ───────────────────────────────────────────────

export function detectCommonControllers(
  graph: EntityGraph,
  subjectIds: string[],
): CommonController[] {
  const controllerMap = new Map<string, Array<{ id: string; name: string; edgeKind: EdgeKind }>>();

  for (const subjectId of subjectIds) {
    // Find all persons/entities that have control over this subject
    const controllers = graph.in(subjectId, ALL_CORPORATE_EDGES);
    for (const edge of controllers) {
      const controller = graph.node(edge.from);
      if (!controller || controller.kind === 'entity') continue; // only persons
      const existing = controllerMap.get(edge.from) ?? [];
      const subject = graph.node(subjectId);
      existing.push({ id: subjectId, name: subject?.label ?? subjectId, edgeKind: edge.kind });
      controllerMap.set(edge.from, existing);
    }
  }

  const results: CommonController[] = [];
  for (const [controllerId, controlled] of controllerMap) {
    if (controlled.length < 2) continue; // only common controllers
    const controller = graph.node(controllerId);
    const uniqueEntities = [...new Map(controlled.map((c) => [c.id, c])).values()];
    results.push({
      controllerId,
      controllerName: controller?.label ?? controllerId,
      controlledEntities: uniqueEntities,
      controlCount: uniqueEntities.length,
      riskImplication: uniqueEntities.length >= 5
        ? 'Possible nominee director / straw man arrangement'
        : uniqueEntities.length >= 3
        ? 'Multiple entity control — enhanced due diligence required'
        : 'Common controller — verify independence of entities',
    });
  }

  return results.sort((a, b) => b.controlCount - a.controlCount);
}

// ── Sanctions proximity analysis ──────────────────────────────────────────────

export function detectSanctionsProximity(
  graph: EntityGraph,
  subjectId: string,
  sanctionedNodeIds: string[],
  maxHops = 4,
): SanctionsProximity[] {
  const proximities: SanctionsProximity[] = [];
  const neighbourhood = graph.neighbourhood(subjectId, maxHops);

  for (const sanctionedId of sanctionedNodeIds) {
    const distance = neighbourhood.get(sanctionedId);
    if (distance === undefined) continue;

    const path = graph.shortestPath(subjectId, sanctionedId) ?? [];
    const sanctioned = graph.node(sanctionedId);

    // Exposure decays with distance: 1.0 at 1 hop, 0.5 at 2 hops, 0.25 at 3 hops, etc.
    const exposureScore = Math.max(0, 1 / Math.pow(2, distance - 1));

    proximities.push({
      subjectId,
      sanctionedNodeId: sanctionedId,
      sanctionedNodeName: sanctioned?.label ?? sanctionedId,
      distanceHops: distance,
      exposurePath: path.map((id) => graph.node(id)?.label ?? id),
      exposureScore,
      requiresEDD: distance <= 2 || exposureScore >= 0.40,
    });
  }

  return proximities.sort((a, b) => b.exposureScore - a.exposureScore);
}

// ── PEP relationship detection ────────────────────────────────────────────────

export function detectPEPExposure(
  graph: EntityGraph,
  subjectId: string,
  pepNodeIds: string[],
): Array<{ pepId: string; pepName: string; relationship: EdgeKind; path: string[] }> {
  const results: Array<{ pepId: string; pepName: string; relationship: EdgeKind; path: string[] }> = [];

  for (const pepId of pepNodeIds) {
    // Check direct edges
    const directOut = graph.out(subjectId, PEP_EDGES).filter((e) => e.to === pepId);
    const directIn = graph.in(subjectId, PEP_EDGES).filter((e) => e.from === pepId);

    for (const edge of [...directOut, ...directIn]) {
      const pep = graph.node(pepId);
      results.push({
        pepId,
        pepName: pep?.label ?? pepId,
        relationship: edge.kind,
        path: [subjectId, pepId],
      });
    }

    // Check 2-hop relationships
    if (results.some((r) => r.pepId === pepId)) continue;
    const path = graph.shortestPath(subjectId, pepId, PEP_EDGES);
    if (path && path.length <= 3) {
      const pep = graph.node(pepId);
      results.push({
        pepId,
        pepName: pep?.label ?? pepId,
        relationship: 'close_associate_of',
        path: path.map((id) => graph.node(id)?.label ?? id),
      });
    }
  }

  return results;
}

// ── Main intelligence report ──────────────────────────────────────────────────

export function buildRelationshipIntelligenceReport(
  graph: EntityGraph,
  subjectId: string,
  sanctionedNodeIds: string[] = [],
  _pepNodeIds: string[] = [],
): GraphIntelligenceReport {
  const subject = graph.node(subjectId);
  const allNodeIds = graph.nodes().map((n) => n.id);

  const uboChains = detectUBOChains(graph, subjectId);
  const shellChains = detectShellChains(graph, subjectId);
  const commonControllers = detectCommonControllers(graph, allNodeIds.filter((id) => id !== subjectId));
  const sanctionsProximities = detectSanctionsProximity(graph, subjectId, sanctionedNodeIds);

  // Risk summary
  const primaryDrivers: string[] = [];
  let overallRisk: GraphIntelligenceReport['riskSummary']['overallRisk'] = 'clear';

  if (sanctionsProximities.some((p) => p.distanceHops <= 1)) {
    overallRisk = 'critical';
    primaryDrivers.push('Direct connection to sanctioned entity');
  } else if (sanctionsProximities.some((p) => p.distanceHops === 2)) {
    overallRisk = 'high';
    primaryDrivers.push('Two-hop sanctions exposure');
  }

  if (uboChains.some((c) => c.viaNominee)) {
    if (overallRisk === 'clear') overallRisk = 'high';
    primaryDrivers.push('Nominee/shell UBO structure detected');
  }

  if (shellChains.some((c) => c.riskScore >= 0.60)) {
    if ((['clear', 'low'] as typeof overallRisk[]).includes(overallRisk)) overallRisk = 'medium';
    primaryDrivers.push('High-risk shell chain in ownership structure');
  }

  if (shellChains.some((c) => c.characteristics.includes('circular_ownership'))) {
    if (overallRisk !== 'critical') overallRisk = 'high';
    primaryDrivers.push('Circular ownership detected — possible fraud indicator');
  }

  const requiresEDD = overallRisk === 'critical' || overallRisk === 'high' ||
    sanctionsProximities.some((p) => p.requiresEDD);

  const requiresSAR = overallRisk === 'critical' ||
    sanctionsProximities.some((p) => p.distanceHops <= 1);

  return {
    subjectId,
    subjectName: subject?.label ?? subjectId,
    analysedAt: new Date().toISOString(),
    uboChains,
    shellChains,
    commonControllers,
    sanctionsProximities,
    totalEntitiesAnalysed: graph.nodes().length,
    maxDepthSearched: 6,
    riskSummary: {
      overallRisk: overallRisk === 'clear' ? 'clear' : overallRisk,
      primaryDrivers,
      requiresEDD,
      requiresSAR,
    },
  };
}
