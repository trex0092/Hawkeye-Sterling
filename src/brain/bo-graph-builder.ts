// Hawkeye Sterling — beneficial-ownership graph builder from registry data
// (audit follow-up #14). Composes the multi-modal extractor (#11) with
// the EntityGraph engine (already shipped). Takes a corporate-registry
// extraction (corporate_registry schema from /api/agent/extract) and
// emits a fully-populated EntityGraph that ubo_tree_walk + entity-graph.
// effectiveOwnership consume directly.

import { EntityGraph } from './entity-graph.js';

export interface CorporateRegistryRecord {
  entityName: string;
  registrationNumber?: string;
  incorporationDate?: string;
  registeredAddress?: string;
  jurisdiction?: string;
  status?: string;
  directors?: Array<{ name: string; role?: string; isNominee?: boolean }>;
  beneficialOwners?: Array<{ name: string; percentage?: number; isNominee?: boolean; viaEntity?: string }>;
}

export interface BoGraphBuildOptions {
  /** Pre-existing graph to extend. Default: build fresh. */
  graph?: EntityGraph;
  /** Prefix for synthetic IDs (e.g. tenant id). */
  idPrefix?: string;
}

export interface BoGraphBuildResult {
  graph: EntityGraph;
  rootEntityId: string;
  added: { nodes: number; edges: number };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

function nodeId(prefix: string | undefined, kind: string, name: string): string {
  const slug = slugify(name);
  return prefix ? `${prefix}_${kind}_${slug}` : `${kind}_${slug}`;
}

/** Build / extend an EntityGraph from a corporate-registry record. */
export function buildBoGraphFromRegistry(
  record: CorporateRegistryRecord,
  opts: BoGraphBuildOptions = {},
): BoGraphBuildResult {
  const graph = opts.graph ?? new EntityGraph();
  const prefix = opts.idPrefix;
  let nodes = 0;
  let edges = 0;

  // Root entity.
  const rootId = nodeId(prefix, 'entity', record.entityName);
  if (!graph.node(rootId)) {
    graph.addNode({
      id: rootId,
      kind: 'entity',
      label: record.entityName,
      attrs: {
        ...(record.registrationNumber ? { registrationNumber: record.registrationNumber } : {}),
        ...(record.jurisdiction ? { jurisdiction: record.jurisdiction } : {}),
        ...(record.status ? { status: record.status } : {}),
        ...(record.incorporationDate ? { incorporationDate: record.incorporationDate } : {}),
      },
    });
    nodes++;
  }

  // Address (for ring-detector linkage).
  if (record.registeredAddress) {
    const addrId = nodeId(prefix, 'address', record.registeredAddress);
    if (!graph.node(addrId)) {
      graph.addNode({ id: addrId, kind: 'address', label: record.registeredAddress });
      nodes++;
    }
    graph.addEdge({ from: rootId, to: addrId, kind: 'registered_at' });
    edges++;
  }

  // Directors.
  for (const d of record.directors ?? []) {
    if (!d?.name) continue;
    const dirId = nodeId(prefix, 'person', d.name);
    if (!graph.node(dirId)) {
      graph.addNode({
        id: dirId,
        kind: 'person',
        label: d.name,
        attrs: { ...(d.role ? { role: d.role } : {}), ...(d.isNominee ? { nominee: true } : {}) },
      });
      nodes++;
    }
    graph.addEdge({
      from: dirId,
      to: rootId,
      kind: 'director_of',
      attrs: d.isNominee ? { nominee: true } : {},
    });
    edges++;
    if (d.isNominee) {
      // Nominee edge so EntityGraph.effectiveOwnership taints the chain.
      graph.addEdge({ from: dirId, to: rootId, kind: 'nominee_for' });
      edges++;
    }
  }

  // Beneficial owners.
  for (const bo of record.beneficialOwners ?? []) {
    if (!bo?.name) continue;
    const personId = nodeId(prefix, 'person', bo.name);
    if (!graph.node(personId)) {
      graph.addNode({
        id: personId,
        kind: 'person',
        label: bo.name,
        attrs: bo.isNominee ? { nominee: true } : {},
      });
      nodes++;
    }

    // Multi-layer: bo.viaEntity creates an intermediate entity node.
    let immediate: string;
    if (bo.viaEntity) {
      const intId = nodeId(prefix, 'entity', bo.viaEntity);
      if (!graph.node(intId)) {
        graph.addNode({ id: intId, kind: 'entity', label: bo.viaEntity });
        nodes++;
      }
      // person owns intermediate, intermediate owns root.
      graph.addEdge({
        from: personId,
        to: intId,
        kind: 'owns',
        ...(bo.percentage !== undefined ? { weight: bo.percentage / 100 } : {}),
        attrs: bo.isNominee ? { nominee: true } : {},
      });
      edges++;
      graph.addEdge({ from: intId, to: rootId, kind: 'owns' });
      edges++;
      immediate = intId;
    } else {
      graph.addEdge({
        from: personId,
        to: rootId,
        kind: 'owns',
        ...(bo.percentage !== undefined ? { weight: bo.percentage / 100 } : {}),
        attrs: bo.isNominee ? { nominee: true } : {},
      });
      edges++;
      immediate = rootId;
    }

    if (bo.isNominee) {
      graph.addEdge({ from: personId, to: immediate, kind: 'nominee_for' });
      edges++;
    }
  }

  return { graph, rootEntityId: rootId, added: { nodes, edges } };
}

/** Build graphs for many registry records, deduplicating by entity name slug.
 *  Produces a single graph the cross-case ring-detector can scan. */
export function buildBoGraphsBulk(
  records: readonly CorporateRegistryRecord[],
  opts: BoGraphBuildOptions = {},
): { graph: EntityGraph; roots: Array<{ rootEntityId: string; record: CorporateRegistryRecord }>; totals: { nodes: number; edges: number } } {
  const graph = opts.graph ?? new EntityGraph();
  const roots: Array<{ rootEntityId: string; record: CorporateRegistryRecord }> = [];
  let totalNodes = 0;
  let totalEdges = 0;
  for (const r of records) {
    const built = buildBoGraphFromRegistry(r, { ...opts, graph });
    roots.push({ rootEntityId: built.rootEntityId, record: r });
    totalNodes += built.added.nodes;
    totalEdges += built.added.edges;
  }
  return { graph, roots, totals: { nodes: totalNodes, edges: totalEdges } };
}
