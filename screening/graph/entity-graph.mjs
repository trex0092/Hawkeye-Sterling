/**
 * Entity Relationship Graph — Map counterparty connections,
 * detect hidden UBO chains, and flag links to sanctioned entities.
 *
 * The graph is built from:
 *   1. Counterparty register CSV (entities, addresses, UBOs)
 *   2. Screening results (sanctions matches, PEP status)
 *   3. Transaction history (entity-to-entity flows)
 *   4. Memory observations (past compliance decisions)
 *
 * Stored as an adjacency list in JSON for zero-dependency operation.
 * No external graph database required.
 *
 * Usage:
 *   import { buildGraph, queryGraph, detectRiskClusters } from './entity-graph.mjs';
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const GRAPH_FILE = resolve(PROJECT_ROOT, '.screening', 'entity-graph.json');

// ── Graph Data Structure ────────────────────────────────────

/**
 * @typedef {object} GraphNode
 * @property {string} id           - Normalised entity identifier
 * @property {string} name         - Display name
 * @property {string} type         - 'person' | 'entity' | 'address' | 'ubo' | 'account'
 * @property {object} metadata     - Country, risk score, PEP status, etc.
 * @property {boolean} sanctioned  - Whether this node is on a sanctions list
 */

/**
 * @typedef {object} GraphEdge
 * @property {string} source  - Source node ID
 * @property {string} target  - Target node ID
 * @property {string} type    - Relationship type
 * @property {number} weight  - Strength of relationship (0-1)
 * @property {string} evidence - What established this link
 */

let _graph = null;

// ── Graph Construction ──────────────────────────────────────

/**
 * Build or refresh the entity relationship graph from all available data.
 */
export async function buildGraph() {
  const nodes = new Map();
  const edges = [];

  // 1. Load counterparty register
  await loadCounterpartyRegister(nodes, edges);

  // 2. Load entities from screening store
  await loadScreeningStore(nodes, edges);

  // 3. Load historical observations from memory
  await loadMemoryObservations(nodes, edges);

  _graph = { nodes: Object.fromEntries(nodes), edges, builtAt: new Date().toISOString() };

  // Persist
  const dir = dirname(GRAPH_FILE);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(GRAPH_FILE, JSON.stringify(_graph, null, 2), 'utf8');

  return {
    nodeCount: nodes.size,
    edgeCount: edges.length,
    sanctionedNodes: [...nodes.values()].filter(n => n.sanctioned).length,
  };
}

/**
 * Load the graph from disk (or build if missing).
 */
async function ensureGraph() {
  if (_graph) return _graph;

  if (existsSync(GRAPH_FILE)) {
    try {
      _graph = JSON.parse(await readFile(GRAPH_FILE, 'utf8'));
      return _graph;
    } catch { /* rebuild */ }
  }

  await buildGraph();
  return _graph;
}

// ── Graph Queries ───────────────────────────────────────────

/**
 * Query the graph for an entity and its relationships.
 *
 * @param {string} entityName - Entity to query.
 * @param {object} opts
 * @param {number} [opts.depth=2]            - Traversal depth.
 * @param {boolean} [opts.includeSanctions=true] - Flag sanctioned connections.
 * @returns {{ entity, connections, risk_flags, sanctions_exposure, graph_snippet }}
 */
export async function queryGraph(entityName, opts = {}) {
  const graph = await ensureGraph();
  const depth = Math.min(opts.depth || 2, 3);
  const includeSanctions = opts.includeSanctions !== false;

  const entityId = normaliseId(entityName);
  const rootNode = graph.nodes[entityId];

  if (!rootNode) {
    // Try fuzzy match
    const fuzzyMatch = findFuzzyMatch(entityName, graph.nodes);
    if (!fuzzyMatch) {
      return {
        entity: entityName,
        found: false,
        connections: [],
        risk_flags: [],
        sanctions_exposure: { direct: false, indirect: false, path: null },
        hint: 'Entity not found in graph. Run buildGraph() to refresh, or check the entity name.',
      };
    }
    return queryGraph(fuzzyMatch.name, opts);
  }

  // BFS traversal up to depth
  const visited = new Set([entityId]);
  const connections = [];
  const riskFlags = [];
  let queue = [{ id: entityId, depth: 0 }];

  while (queue.length > 0) {
    const nextQueue = [];

    for (const { id, depth: d } of queue) {
      if (d >= depth) continue;

      const relatedEdges = graph.edges.filter(e => e.source === id || e.target === id);

      for (const edge of relatedEdges) {
        const otherId = edge.source === id ? edge.target : edge.source;
        if (visited.has(otherId)) continue;
        visited.add(otherId);

        const otherNode = graph.nodes[otherId];
        if (!otherNode) continue;

        connections.push({
          name: otherNode.name,
          type: otherNode.type,
          relationship: edge.type,
          weight: edge.weight,
          depth: d + 1,
          sanctioned: otherNode.sanctioned || false,
          country: otherNode.metadata?.country || null,
          evidence: edge.evidence,
        });

        // Flag risks
        if (otherNode.sanctioned) {
          riskFlags.push({
            flag: 'SANCTIONS_CONNECTION',
            severity: d === 0 ? 'CRITICAL' : d === 1 ? 'HIGH' : 'MEDIUM',
            entity: otherNode.name,
            relationship: edge.type,
            depth: d + 1,
            action: d === 0
              ? 'Direct sanctions match. Freeze immediately.'
              : `Indirect sanctions exposure via ${edge.type}. Escalate to CO.`,
          });
        }

        if (otherNode.metadata?.is_pep) {
          riskFlags.push({
            flag: 'PEP_CONNECTION',
            severity: 'HIGH',
            entity: otherNode.name,
            relationship: edge.type,
            depth: d + 1,
            action: 'Apply Enhanced Due Diligence (FDL Art.14)',
          });
        }

        if (otherNode.metadata?.risk_score >= 16) {
          riskFlags.push({
            flag: 'HIGH_RISK_CONNECTION',
            severity: 'HIGH',
            entity: otherNode.name,
            relationship: edge.type,
            depth: d + 1,
            action: 'Review relationship. High-risk counterparty detected.',
          });
        }

        nextQueue.push({ id: otherId, depth: d + 1 });
      }
    }

    queue = nextQueue;
  }

  // Sanctions exposure analysis
  const directSanctions = rootNode.sanctioned;
  const indirectSanctions = connections.some(c => c.sanctioned);
  const sanctionsPath = indirectSanctions
    ? connections.filter(c => c.sanctioned).map(c => `${entityName} -> (${c.relationship}) -> ${c.name} [SANCTIONED]`)
    : null;

  return {
    entity: rootNode.name,
    found: true,
    type: rootNode.type,
    country: rootNode.metadata?.country,
    risk_score: rootNode.metadata?.risk_score,
    sanctioned: rootNode.sanctioned,
    connections,
    connection_count: connections.length,
    risk_flags: riskFlags,
    sanctions_exposure: {
      direct: directSanctions,
      indirect: indirectSanctions,
      paths: sanctionsPath,
      total_sanctioned_connections: connections.filter(c => c.sanctioned).length,
    },
  };
}

/**
 * Detect risk clusters — groups of connected entities with elevated risk.
 */
export async function detectRiskClusters() {
  const graph = await ensureGraph();
  const clusters = [];
  const visited = new Set();

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (visited.has(id)) continue;
    if (!node.sanctioned && (!node.metadata?.risk_score || node.metadata.risk_score < 10)) continue;

    // BFS to find cluster
    const cluster = { anchor: node.name, nodes: [], totalRisk: 0, hasSanctioned: false };
    const queue = [id];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);

      const n = graph.nodes[current];
      if (!n) continue;

      cluster.nodes.push({
        name: n.name,
        type: n.type,
        sanctioned: n.sanctioned,
        risk_score: n.metadata?.risk_score || 0,
      });
      cluster.totalRisk += n.metadata?.risk_score || 0;
      if (n.sanctioned) cluster.hasSanctioned = true;

      const related = graph.edges
        .filter(e => e.source === current || e.target === current)
        .map(e => e.source === current ? e.target : e.source);

      for (const r of related) {
        if (!visited.has(r)) queue.push(r);
      }
    }

    if (cluster.nodes.length >= 2) {
      clusters.push(cluster);
    }
  }

  clusters.sort((a, b) => b.totalRisk - a.totalRisk);
  return clusters;
}

/**
 * Find shared attributes between entities (addresses, UBOs, phone numbers).
 */
export async function findSharedAttributes(entityName) {
  const graph = await ensureGraph();
  const entityId = normaliseId(entityName);
  const shared = { addresses: [], ubos: [], contacts: [] };

  // Find all address/ubo nodes connected to this entity
  const myConnections = graph.edges
    .filter(e => e.source === entityId || e.target === entityId)
    .map(e => ({
      nodeId: e.source === entityId ? e.target : e.source,
      type: e.type,
    }));

  for (const conn of myConnections) {
    const node = graph.nodes[conn.nodeId];
    if (!node) continue;

    if (node.type === 'address' || conn.type === 'registered_at') {
      // Find other entities at this address
      const othersHere = graph.edges
        .filter(e => (e.source === conn.nodeId || e.target === conn.nodeId) &&
                     e.source !== entityId && e.target !== entityId)
        .map(e => {
          const otherId = e.source === conn.nodeId ? e.target : e.source;
          return graph.nodes[otherId]?.name;
        })
        .filter(Boolean);

      if (othersHere.length > 0) {
        shared.addresses.push({
          address: node.name,
          shared_with: othersHere,
          risk: othersHere.some(o => graph.nodes[normaliseId(o)]?.sanctioned) ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    if (node.type === 'ubo' || conn.type === 'beneficial_owner') {
      // Find other entities owned by this UBO
      const otherOwned = graph.edges
        .filter(e => (e.source === conn.nodeId || e.target === conn.nodeId) &&
                     e.type === 'beneficial_owner' &&
                     e.source !== entityId && e.target !== entityId)
        .map(e => {
          const otherId = e.source === conn.nodeId ? e.target : e.source;
          return graph.nodes[otherId]?.name;
        })
        .filter(Boolean);

      if (otherOwned.length > 0) {
        shared.ubos.push({
          ubo: node.name,
          also_owns: otherOwned,
          risk: node.sanctioned ? 'CRITICAL' : 'HIGH',
        });
      }
    }
  }

  return shared;
}

// ── Data Loaders ────────────────────────────────────────────

async function loadCounterpartyRegister(nodes, edges) {
  const registerDir = resolve(PROJECT_ROOT, 'history', 'registers');
  if (!existsSync(registerDir)) return;

  try {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(registerDir).filter(f => f.endsWith('.csv')).sort().reverse();
    if (files.length === 0) return;

    const csv = await readFile(resolve(registerDir, files[0]), 'utf8');
    const rows = csv.split('\n').filter(r => r.trim());
    if (rows.length < 2) return;

    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name'));
    const countryIdx = headers.findIndex(h => h.includes('country') || h.includes('jurisdiction'));
    const addressIdx = headers.findIndex(h => h.includes('address'));
    const uboIdx = headers.findIndex(h => h.includes('ubo') || h.includes('beneficial'));

    for (let i = 1; i < rows.length; i++) {
      const cols = parseCSVRow(rows[i]);
      const name = cols[nameIdx]?.trim();
      if (!name) continue;

      const id = normaliseId(name);
      nodes.set(id, {
        id, name, type: 'entity',
        metadata: { country: cols[countryIdx]?.trim() || null },
        sanctioned: false,
      });

      // Address node
      if (addressIdx >= 0 && cols[addressIdx]?.trim()) {
        const addr = cols[addressIdx].trim();
        const addrId = normaliseId(addr);
        if (!nodes.has(addrId)) {
          nodes.set(addrId, { id: addrId, name: addr, type: 'address', metadata: {}, sanctioned: false });
        }
        edges.push({ source: id, target: addrId, type: 'registered_at', weight: 0.8, evidence: 'counterparty register' });
      }

      // UBO node
      if (uboIdx >= 0 && cols[uboIdx]?.trim()) {
        const ubo = cols[uboIdx].trim();
        const uboId = normaliseId(ubo);
        if (!nodes.has(uboId)) {
          nodes.set(uboId, { id: uboId, name: ubo, type: 'ubo', metadata: {}, sanctioned: false });
        }
        edges.push({ source: uboId, target: id, type: 'beneficial_owner', weight: 1.0, evidence: 'counterparty register UBO field' });
      }
    }
  } catch { /* register may not exist yet */ }
}

async function loadScreeningStore(nodes, edges) {
  const storePath = resolve(PROJECT_ROOT, '.screening', 'store.json');
  if (!existsSync(storePath)) return;

  try {
    const store = JSON.parse(await readFile(storePath, 'utf8'));
    const entities = store.entities || store;
    if (!Array.isArray(entities) && typeof entities === 'object') {
      for (const [sourceId, sourceEntities] of Object.entries(entities)) {
        if (!Array.isArray(sourceEntities)) continue;
        for (const ent of sourceEntities) {
          const name = ent.name || ent.caption || ent.fullName;
          if (!name) continue;
          const id = normaliseId(name);

          if (!nodes.has(id)) {
            nodes.set(id, {
              id, name, type: ent.schema === 'Person' ? 'person' : 'entity',
              metadata: { country: ent.country || null, source: sourceId },
              sanctioned: true,
            });
          } else {
            nodes.get(id).sanctioned = true;
          }
        }
      }
    }
  } catch { /* store may not exist yet */ }
}

async function loadMemoryObservations(nodes, edges) {
  try {
    const mem = (await import(resolve(PROJECT_ROOT, 'claude-mem', 'index.mjs'))).default;

    // Load entity interactions from memory
    const entityObs = mem.search('', { category: 'entity_interaction', limit: 100 });
    for (const obs of entityObs) {
      if (obs.entity) {
        const id = normaliseId(obs.entity);
        if (!nodes.has(id)) {
          nodes.set(id, {
            id, name: obs.entity, type: 'entity',
            metadata: { fromMemory: true },
            sanctioned: false,
          });
        }
      }
    }

    // Load screening results to mark sanctioned entities
    const screenObs = mem.search('', { category: 'screening_result', limit: 100 });
    for (const obs of screenObs) {
      if (obs.entity) {
        const id = normaliseId(obs.entity);
        if (nodes.has(id) && obs.snippet?.includes('high')) {
          nodes.get(id).sanctioned = true;
        }
      }
    }

    mem.close();
  } catch { /* memory system optional */ }
}

// ── Helpers ─────────────────────────────────────────────────

function normaliseId(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .trim();
}

function findFuzzyMatch(name, nodes) {
  const target = name.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const node of Object.values(nodes)) {
    const nodeName = node.name.toLowerCase();
    if (nodeName.includes(target) || target.includes(nodeName)) {
      const score = Math.min(target.length, nodeName.length) / Math.max(target.length, nodeName.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = node;
      }
    }
  }

  return bestScore > 0.5 ? bestMatch : null;
}

function parseCSVRow(row) {
  const cols = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"') {
        if (row[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cols.push(current); current = ''; }
      else current += ch;
    }
  }
  cols.push(current);
  return cols;
}
