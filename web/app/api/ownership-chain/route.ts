// Hawkeye Sterling — beneficial ownership chain traversal API.
// GET /api/ownership-chain?entity=<name>&depth=<number>&sanctionsExposure=true
//
// Returns the full ownership/control tree for an entity, with optional
// sanctions exposure propagation (FtM FollowTheMoney-inspired graph traversal).

import { NextRequest, NextResponse } from 'next/server';
import { EntityGraph, type GraphNode } from '../../../../src/brain/entity-graph';
import { buildBoGraphFromRegistry, type CorporateRegistryRecord } from '../../../../src/brain/bo-graph-builder';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const records = raw['records'] as CorporateRegistryRecord[] | undefined;
  const depth = Math.min(Number(raw['depth'] ?? 5), 10);
  const sanctionsExposure = raw['sanctionsExposure'] === true || raw['sanctionsExposure'] === 'true';
  const anchorEntity = raw['anchorEntity'] as string | undefined;

  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: 'records array of CorporateRegistryRecord required' }, { status: 400 });
  }

  // Build graph from registry records
  let graph = new EntityGraph();
  const rootIds: string[] = [];

  for (const record of records) {
    if (!record.entityName?.trim()) continue;
    const { graph: g, rootEntityId } = buildBoGraphFromRegistry(record, { graph, idPrefix: 'api' });
    graph = g;
    rootIds.push(rootEntityId);
  }

  const anchorId = anchorEntity
    ? graph.allNodes().find(n => n.label.toLowerCase().includes(anchorEntity.toLowerCase()))?.id ?? rootIds[0]
    : rootIds[0];

  if (!anchorId) {
    return NextResponse.json({ error: 'Could not establish anchor entity in graph' }, { status: 422 });
  }

  const anchorNode = graph.node(anchorId);
  const owned = graph.ownedBy(anchorId, depth);
  const owners = graph.ownersOf(anchorId, depth);
  const connected = graph.connectedComponents(anchorId, Math.min(depth, 3));

  // Compute sanctions exposure flag (would be enriched by screening in production)
  const flagged: Array<{ nodeId: string; label: string; reason: string }> = [];
  if (sanctionsExposure) {
    // Placeholder: in production, each node's label would be screened against sanctions lists
    // Here we flag nodes with suspicious attributes
    for (const { node } of [...owned, ...owners]) {
      if (node.attrs?.['isNominee'] === true) {
        flagged.push({ nodeId: node.id, label: node.label, reason: 'Nominee director/shareholder — enhanced due diligence required' });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    anchorEntity: { id: anchorId, ...anchorNode },
    graph: graph.toJson(),
    traversal: {
      depth,
      ownedByAnchor: owned.map(({ node, path, depth: d, totalWeight }) => ({
        id: node.id, label: node.label, kind: node.kind, path, depth: d, ownershipPct: Math.round(totalWeight * 100),
      })),
      ownersOfAnchor: owners.map(({ node, path, depth: d, totalWeight }) => ({
        id: node.id, label: node.label, kind: node.kind, path, depth: d, ownershipPct: Math.round(totalWeight * 100),
      })),
      connectedParties: connected.map(({ node, hop, via }) => ({
        id: node.id, label: node.label, kind: node.kind, hopsFromAnchor: hop, relationshipType: via,
      })),
    },
    sanctionsExposure: {
      checked: sanctionsExposure,
      flaggedNodes: flagged,
      totalFlagged: flagged.length,
    },
    stats: {
      totalNodes: graph.allNodes().length,
      totalEdges: graph.allEdges().length,
      ownedCount: owned.length,
      ownerCount: owners.length,
    },
  });
}
