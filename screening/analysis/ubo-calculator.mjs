/**
 * Ultimate Beneficial Owner (UBO) Calculator.
 *
 * Traces ownership chains through layered corporate structures to identify
 * natural persons who ultimately control an entity. Required by Cabinet
 * Resolution 134/2025, Art. 4-6, which mandates identification of every
 * natural person holding >= 25% effective ownership or exercising control
 * through other means.
 *
 * Capabilities:
 *   - Ownership graph: directed weighted graph of entity -> entity links
 *   - Recursive chain traversal: multiplies percentages along each path
 *   - Multi-path aggregation: sums effective ownership across all paths
 *   - Circular ownership detection: breaks infinite loops
 *   - Nominee/trust detection: flags ownership through known structures
 *   - Jurisdiction risk: FATF blacklist/greylist risk uplift
 *   - Tree output: full ownership chain with percentages
 *   - JSON-backed ownership register
 *
 * References:
 *   - Federal Decree-Law No. 10/2025, Art. 9 (beneficial ownership)
 *   - Cabinet Resolution 134/2025, Art. 4-6 (UBO identification threshold)
 *   - FATF Recommendation 24 (transparency of legal persons)
 *
 * Zero external dependencies.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { FATF_LISTS } from '../config.js';

/** @type {number} UAE standard UBO threshold per Cabinet Res 134/2025 */
const UBO_THRESHOLD = 0.25;

/** Maximum traversal depth to prevent runaway recursion */
const MAX_DEPTH = 20;

/**
 * Known nominee/trust structure indicators. Ownership through these
 * entity types triggers a nominee flag and requires look-through to
 * the natural person behind the arrangement.
 */
const NOMINEE_INDICATORS = new Set([
  'nominee',
  'trust',
  'trustee',
  'foundation',
  'fiduciary',
  'custodian',
  'agent',
  'bearer',
  'shell',
  'spv',
  'special purpose vehicle',
]);

/**
 * Ownership graph node.
 * @typedef {object} OwnershipNode
 * @property {string} id - Unique entity identifier
 * @property {string} name - Entity display name
 * @property {string} type - 'person' | 'company' | 'trust' | 'foundation' | 'other'
 * @property {string} country - ISO 2-letter country code
 * @property {string|null} dob - Date of birth (persons only)
 * @property {boolean} isNominee - Whether entity is a known nominee structure
 * @property {object} metadata - Additional entity data
 */

/**
 * Ownership edge (directed: source owns a percentage of target).
 * @typedef {object} OwnershipEdge
 * @property {string} ownerId - Entity that holds the ownership stake
 * @property {string} ownedId - Entity that is owned
 * @property {number} percentage - Ownership percentage (0-1, e.g. 0.60 = 60%)
 * @property {string} type - 'direct' | 'indirect' | 'nominee' | 'control'
 * @property {string|null} source - Data source for this link
 * @property {string} recordedAt - ISO timestamp when link was recorded
 */

/**
 * UBO result for a single beneficial owner.
 * @typedef {object} UBOResult
 * @property {string} personId - Natural person entity ID
 * @property {string} personName - Natural person name
 * @property {string} country - Person's country
 * @property {number} effectiveOwnership - Aggregated effective ownership (0-1)
 * @property {boolean} exceedsThreshold - Whether >= 25%
 * @property {boolean} nomineeFlag - Whether ownership passes through nominee
 * @property {number} riskScore - Jurisdiction + nominee risk score (0-10)
 * @property {Array} chains - All ownership paths with percentages
 */

// ─────────────────────────────────────────────────────────────────────
//  Ownership Graph
// ─────────────────────────────────────────────────────────────────────

export class OwnershipGraph {
  constructor() {
    /** @type {Map<string, OwnershipNode>} */
    this.nodes = new Map();
    /** @type {Array<OwnershipEdge>} */
    this.edges = [];
    /** @type {Map<string, Array<OwnershipEdge>>} edges keyed by owned entity */
    this._ownersOf = new Map();
    /** @type {Map<string, Array<OwnershipEdge>>} edges keyed by owner entity */
    this._ownsIn = new Map();
  }

  /**
   * Add or update an entity node.
   * @param {OwnershipNode} node
   */
  addNode(node) {
    if (!node || !node.id) {
      throw new Error('OwnershipGraph.addNode: node.id is required');
    }
    const existing = this.nodes.get(node.id);
    this.nodes.set(node.id, {
      id: node.id,
      name: node.name || (existing ? existing.name : node.id),
      type: node.type || (existing ? existing.type : 'other'),
      country: node.country || (existing ? existing.country : ''),
      dob: node.dob || (existing ? existing.dob : null),
      isNominee: node.isNominee !== undefined ? node.isNominee : _detectNominee(node),
      metadata: { ...(existing ? existing.metadata : {}), ...(node.metadata || {}) },
    });
  }

  /**
   * Add an ownership link. Validates percentage range.
   * @param {string} ownerId - Entity that owns
   * @param {string} ownedId - Entity that is owned
   * @param {number} percentage - Ownership fraction (0-1)
   * @param {object} [opts]
   * @param {string} [opts.type] - Link type
   * @param {string} [opts.source] - Data source
   */
  addEdge(ownerId, ownedId, percentage, opts = {}) {
    if (typeof percentage !== 'number' || percentage < 0 || percentage > 1) {
      throw new Error(`OwnershipGraph.addEdge: percentage must be 0-1, got ${percentage}`);
    }
    if (!ownerId || !ownedId) {
      throw new Error('OwnershipGraph.addEdge: ownerId and ownedId are required');
    }
    if (ownerId === ownedId) {
      throw new Error('OwnershipGraph.addEdge: self-ownership is not permitted');
    }

    // Ensure nodes exist (create stub if needed)
    if (!this.nodes.has(ownerId)) {
      this.addNode({ id: ownerId, name: ownerId, type: 'other' });
    }
    if (!this.nodes.has(ownedId)) {
      this.addNode({ id: ownedId, name: ownedId, type: 'other' });
    }

    const edge = {
      ownerId,
      ownedId,
      percentage,
      type: opts.type || 'direct',
      source: opts.source || null,
      recordedAt: new Date().toISOString(),
    };

    this.edges.push(edge);

    // Index by owned entity
    if (!this._ownersOf.has(ownedId)) {
      this._ownersOf.set(ownedId, []);
    }
    this._ownersOf.get(ownedId).push(edge);

    // Index by owner entity
    if (!this._ownsIn.has(ownerId)) {
      this._ownsIn.set(ownerId, []);
    }
    this._ownsIn.get(ownerId).push(edge);
  }

  /**
   * Remove an ownership edge.
   * @param {string} ownerId
   * @param {string} ownedId
   * @returns {boolean} Whether an edge was removed
   */
  removeEdge(ownerId, ownedId) {
    const idx = this.edges.findIndex(
      e => e.ownerId === ownerId && e.ownedId === ownedId
    );
    if (idx === -1) return false;

    this.edges.splice(idx, 1);

    const ownersArr = this._ownersOf.get(ownedId);
    if (ownersArr) {
      const oi = ownersArr.findIndex(e => e.ownerId === ownerId);
      if (oi !== -1) ownersArr.splice(oi, 1);
    }
    const ownsArr = this._ownsIn.get(ownerId);
    if (ownsArr) {
      const oi = ownsArr.findIndex(e => e.ownedId === ownedId);
      if (oi !== -1) ownsArr.splice(oi, 1);
    }
    return true;
  }

  /**
   * Get all direct owners of an entity.
   * @param {string} entityId
   * @returns {Array<OwnershipEdge>}
   */
  getOwners(entityId) {
    return this._ownersOf.get(entityId) || [];
  }

  /**
   * Get all entities directly owned by an entity.
   * @param {string} entityId
   * @returns {Array<OwnershipEdge>}
   */
  getOwned(entityId) {
    return this._ownsIn.get(entityId) || [];
  }

  /**
   * Detect circular ownership. Returns an array of cycle paths, each
   * being an array of entity IDs forming the loop.
   * @returns {Array<Array<string>>}
   */
  detectCycles() {
    const visited = new Set();
    const inStack = new Set();
    const cycles = [];

    /**
     * @param {string} nodeId
     * @param {Array<string>} path
     */
    const dfs = (nodeId, path) => {
      if (inStack.has(nodeId)) {
        // Found a cycle: extract from the repeated node onward
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart).concat(nodeId));
        }
        return;
      }
      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      inStack.add(nodeId);
      path.push(nodeId);

      const owned = this._ownsIn.get(nodeId) || [];
      for (const edge of owned) {
        dfs(edge.ownedId, [...path]);
      }

      inStack.delete(nodeId);
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }

    return cycles;
  }

  /**
   * Validate the total ownership into each entity does not exceed 100%.
   * Returns an array of entities where ownership exceeds 100%.
   * @returns {Array<{entityId: string, totalOwnership: number}>}
   */
  validateOwnership() {
    const issues = [];
    for (const [entityId, edges] of this._ownersOf) {
      const total = edges.reduce((sum, e) => sum + e.percentage, 0);
      if (total > 1.001) { // small tolerance for floating point
        issues.push({ entityId, totalOwnership: total });
      }
    }
    return issues;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  UBO Calculation Engine
// ─────────────────────────────────────────────────────────────────────

/**
 * Calculate all Ultimate Beneficial Owners of a target entity.
 *
 * Traverses the ownership graph upward from the target, multiplying
 * ownership percentages along each path. When multiple paths lead to
 * the same natural person, effective ownership is summed.
 *
 * @param {OwnershipGraph} graph
 * @param {string} targetEntityId - The entity to trace ownership for
 * @param {object} [opts]
 * @param {number} [opts.threshold] - UBO threshold (default 0.25)
 * @param {number} [opts.maxDepth] - Maximum traversal depth
 * @returns {{ ubos: Array<UBOResult>, nonUboOwners: Array<UBOResult>, tree: object, cycles: Array, warnings: Array<string> }}
 */
export function calculateUBOs(graph, targetEntityId, opts = {}) {
  const threshold = opts.threshold !== undefined ? opts.threshold : UBO_THRESHOLD;
  const maxDepth = opts.maxDepth || MAX_DEPTH;

  if (!graph.nodes.has(targetEntityId)) {
    throw new Error(`calculateUBOs: entity "${targetEntityId}" not found in graph`);
  }

  const warnings = [];

  // Detect cycles before calculation
  const cycles = graph.detectCycles();
  if (cycles.length > 0) {
    warnings.push(
      `Circular ownership detected: ${cycles.length} cycle(s). ` +
      'Cycles are broken during traversal to prevent infinite recursion.'
    );
  }

  // Validate ownership percentages
  const ownershipIssues = graph.validateOwnership();
  for (const issue of ownershipIssues) {
    warnings.push(
      `Entity "${issue.entityId}" has total inbound ownership of ` +
      `${(issue.totalOwnership * 100).toFixed(1)}% (exceeds 100%)`
    );
  }

  // Accumulator: personId -> { effectiveOwnership, chains, nomineeFlag }
  const uboMap = new Map();
  const visited = new Set(); // cycle breaker for current traversal

  /**
   * Recursively traverse ownership upward.
   * @param {string} entityId - Current entity being traced
   * @param {number} cumulativeOwnership - Product of ownership along the path
   * @param {Array} path - Current chain of { entityId, percentage }
   * @param {number} depth - Current depth
   */
  function traverse(entityId, cumulativeOwnership, path, depth) {
    if (depth > maxDepth) {
      warnings.push(`Max depth (${maxDepth}) reached at entity "${entityId}"`);
      return;
    }

    if (visited.has(entityId)) {
      // Cycle detected during traversal; break it
      return;
    }

    const owners = graph.getOwners(entityId);

    if (owners.length === 0) {
      // Terminal node: this entity has no owners above it.
      // If it is a person, record as potential UBO.
      const node = graph.nodes.get(entityId);
      if (node && (node.type === 'person' || node.type === 'individual')) {
        _recordUBO(entityId, cumulativeOwnership, path);
      }
      return;
    }

    visited.add(entityId);

    for (const edge of owners) {
      const ownerNode = graph.nodes.get(edge.ownerId);
      const stepOwnership = cumulativeOwnership * edge.percentage;
      const stepPath = [...path, {
        entityId: edge.ownerId,
        entityName: ownerNode ? ownerNode.name : edge.ownerId,
        percentage: edge.percentage,
        cumulativeOwnership: stepOwnership,
        type: edge.type,
        isNominee: ownerNode ? ownerNode.isNominee : false,
      }];

      if (ownerNode && (ownerNode.type === 'person' || ownerNode.type === 'individual')) {
        // Person found -- record as UBO candidate
        _recordUBO(edge.ownerId, stepOwnership, stepPath);
      } else {
        // Corporate entity -- continue traversal upward
        traverse(edge.ownerId, stepOwnership, stepPath, depth + 1);
      }
    }

    visited.delete(entityId);
  }

  /**
   * Record or update a UBO entry.
   * @param {string} personId
   * @param {number} effectiveOwnership
   * @param {Array} chain
   */
  function _recordUBO(personId, effectiveOwnership, chain) {
    if (!uboMap.has(personId)) {
      uboMap.set(personId, {
        effectiveOwnership: 0,
        chains: [],
        nomineeFlag: false,
      });
    }
    const entry = uboMap.get(personId);
    // Multi-path: sum effective ownership from all paths
    entry.effectiveOwnership += effectiveOwnership;
    entry.chains.push([...chain]);
    // Check if any step in the chain passes through a nominee
    if (chain.some(step => step.isNominee)) {
      entry.nomineeFlag = true;
    }
  }

  // Begin traversal from the target entity
  traverse(targetEntityId, 1.0, [], 0);

  // Build results
  const results = [];
  for (const [personId, data] of uboMap) {
    const node = graph.nodes.get(personId);
    const riskScore = _calculateUBORisk(node, data);

    results.push({
      personId,
      personName: node ? node.name : personId,
      country: node ? node.country : '',
      effectiveOwnership: Math.round(data.effectiveOwnership * 10000) / 10000,
      effectiveOwnershipPct: `${(data.effectiveOwnership * 100).toFixed(2)}%`,
      exceedsThreshold: data.effectiveOwnership >= threshold,
      nomineeFlag: data.nomineeFlag,
      riskScore,
      chains: data.chains,
    });
  }

  // Sort by effective ownership descending
  results.sort((a, b) => b.effectiveOwnership - a.effectiveOwnership);

  const ubos = results.filter(r => r.exceedsThreshold);
  const nonUboOwners = results.filter(r => !r.exceedsThreshold);

  // Build tree visualization
  const tree = _buildOwnershipTree(graph, targetEntityId, new Set(), 0, maxDepth);

  return {
    targetEntity: targetEntityId,
    targetName: graph.nodes.get(targetEntityId).name,
    threshold,
    thresholdPct: `${(threshold * 100).toFixed(0)}%`,
    ubos,
    nonUboOwners,
    tree,
    cycles,
    warnings,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate risk score for a UBO based on jurisdiction and nominee flags.
 * Score range: 0-10.
 *
 * @param {OwnershipNode|null} node
 * @param {{ nomineeFlag: boolean, chains: Array }} data
 * @returns {number}
 */
function _calculateUBORisk(node, data) {
  let score = 0;

  if (!node) return 5; // Unknown entity gets moderate risk

  // Jurisdiction risk
  const country = (node.country || '').toUpperCase();
  if (FATF_LISTS.blacklist.includes(country)) {
    score += 5;
  } else if (FATF_LISTS.greylist.includes(country)) {
    score += 3;
  }

  // Nominee flag
  if (data.nomineeFlag) {
    score += 3;
  }

  // Chain complexity: more layers = more risk
  const maxChainLength = Math.max(...data.chains.map(c => c.length), 0);
  if (maxChainLength >= 5) {
    score += 2;
  } else if (maxChainLength >= 3) {
    score += 1;
  }

  return Math.min(10, score);
}

/**
 * Build a tree representation of the ownership structure.
 *
 * @param {OwnershipGraph} graph
 * @param {string} entityId
 * @param {Set<string>} visited - Cycle breaker
 * @param {number} depth
 * @param {number} maxDepth
 * @returns {object}
 */
function _buildOwnershipTree(graph, entityId, visited, depth, maxDepth) {
  const node = graph.nodes.get(entityId);
  const tree = {
    id: entityId,
    name: node ? node.name : entityId,
    type: node ? node.type : 'unknown',
    country: node ? node.country : '',
    isNominee: node ? node.isNominee : false,
    owners: [],
  };

  if (depth >= maxDepth || visited.has(entityId)) {
    if (visited.has(entityId)) {
      tree.cyclicReference = true;
    }
    return tree;
  }

  visited.add(entityId);

  const owners = graph.getOwners(entityId);
  for (const edge of owners) {
    const ownerTree = _buildOwnershipTree(graph, edge.ownerId, new Set(visited), depth + 1, maxDepth);
    ownerTree.ownershipPercentage = edge.percentage;
    ownerTree.ownershipPct = `${(edge.percentage * 100).toFixed(2)}%`;
    ownerTree.linkType = edge.type;
    tree.owners.push(ownerTree);
  }

  return tree;
}

/**
 * Detect whether a node represents a nominee or trust structure
 * based on its name and type.
 *
 * @param {object} node
 * @returns {boolean}
 */
function _detectNominee(node) {
  if (!node) return false;
  const nameLower = (node.name || '').toLowerCase();
  const typeLower = (node.type || '').toLowerCase();
  for (const indicator of NOMINEE_INDICATORS) {
    if (nameLower.includes(indicator) || typeLower === indicator) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
//  Ownership Register (JSON persistence)
// ─────────────────────────────────────────────────────────────────────

/**
 * JSON-backed ownership register. Persists the ownership graph and
 * UBO calculation results for audit and regulatory purposes.
 */
export class OwnershipRegister {
  /**
   * @param {string} filePath - Path to the JSON register file
   */
  constructor(filePath) {
    if (!filePath) {
      throw new Error('OwnershipRegister: filePath is required');
    }
    this.filePath = filePath;
    this.data = {
      version: 1,
      entities: [],
      edges: [],
      calculations: [],
      auditLog: [],
      updatedAt: null,
    };
  }

  /**
   * Load register from disk.
   * @returns {Promise<OwnershipRegister>}
   */
  async load() {
    if (!existsSync(this.filePath)) return this;
    const raw = await readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(raw);
    this.data = {
      version: parsed.version || 1,
      entities: parsed.entities || [],
      edges: parsed.edges || [],
      calculations: parsed.calculations || [],
      auditLog: parsed.auditLog || [],
      updatedAt: parsed.updatedAt || null,
    };
    return this;
  }

  /**
   * Save register to disk.
   * @returns {Promise<OwnershipRegister>}
   */
  async save() {
    await mkdir(dirname(this.filePath), { recursive: true });
    this.data.updatedAt = new Date().toISOString();
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2));
    return this;
  }

  /**
   * Build an OwnershipGraph from the persisted register data.
   * @returns {OwnershipGraph}
   */
  toGraph() {
    const graph = new OwnershipGraph();
    for (const entity of this.data.entities) {
      graph.addNode(entity);
    }
    for (const edge of this.data.edges) {
      graph.addEdge(edge.ownerId, edge.ownedId, edge.percentage, {
        type: edge.type,
        source: edge.source,
      });
    }
    return graph;
  }

  /**
   * Persist an entity into the register.
   * @param {OwnershipNode} entity
   */
  upsertEntity(entity) {
    if (!entity || !entity.id) {
      throw new Error('OwnershipRegister.upsertEntity: entity.id is required');
    }
    const idx = this.data.entities.findIndex(e => e.id === entity.id);
    if (idx !== -1) {
      this.data.entities[idx] = { ...this.data.entities[idx], ...entity };
    } else {
      this.data.entities.push(entity);
    }
    this._log('upsert_entity', { entityId: entity.id });
  }

  /**
   * Persist an ownership edge into the register.
   * @param {string} ownerId
   * @param {string} ownedId
   * @param {number} percentage
   * @param {object} [opts]
   */
  upsertEdge(ownerId, ownedId, percentage, opts = {}) {
    if (typeof percentage !== 'number' || percentage < 0 || percentage > 1) {
      throw new Error(`OwnershipRegister.upsertEdge: percentage must be 0-1, got ${percentage}`);
    }
    const idx = this.data.edges.findIndex(
      e => e.ownerId === ownerId && e.ownedId === ownedId
    );
    const edge = {
      ownerId,
      ownedId,
      percentage,
      type: opts.type || 'direct',
      source: opts.source || null,
      recordedAt: new Date().toISOString(),
    };
    if (idx !== -1) {
      this.data.edges[idx] = edge;
    } else {
      this.data.edges.push(edge);
    }
    this._log('upsert_edge', { ownerId, ownedId, percentage });
  }

  /**
   * Remove an ownership edge from the register.
   * @param {string} ownerId
   * @param {string} ownedId
   * @returns {boolean}
   */
  removeEdge(ownerId, ownedId) {
    const idx = this.data.edges.findIndex(
      e => e.ownerId === ownerId && e.ownedId === ownedId
    );
    if (idx === -1) return false;
    this.data.edges.splice(idx, 1);
    this._log('remove_edge', { ownerId, ownedId });
    return true;
  }

  /**
   * Store a UBO calculation result for audit.
   * @param {object} result - Output of calculateUBOs()
   */
  storeCalculation(result) {
    this.data.calculations.push({
      targetEntity: result.targetEntity,
      calculatedAt: result.calculatedAt,
      uboCount: result.ubos.length,
      ubos: result.ubos.map(u => ({
        personId: u.personId,
        personName: u.personName,
        effectiveOwnership: u.effectiveOwnership,
        nomineeFlag: u.nomineeFlag,
        riskScore: u.riskScore,
      })),
      warnings: result.warnings,
    });
    this._log('store_calculation', { targetEntity: result.targetEntity });
  }

  /**
   * Retrieve the most recent UBO calculation for an entity.
   * @param {string} targetEntityId
   * @returns {object|null}
   */
  getLatestCalculation(targetEntityId) {
    const calcs = this.data.calculations.filter(
      c => c.targetEntity === targetEntityId
    );
    if (calcs.length === 0) return null;
    return calcs[calcs.length - 1];
  }

  /**
   * Append to the audit log.
   * @param {string} action
   * @param {object} detail
   */
  _log(action, detail) {
    this.data.auditLog.push({
      action,
      detail,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get audit log entries, optionally filtered.
   * @param {object} [filter]
   * @param {string} [filter.action]
   * @param {string} [filter.since] - ISO timestamp
   * @returns {Array}
   */
  getAuditLog(filter = {}) {
    let log = this.data.auditLog;
    if (filter.action) {
      log = log.filter(e => e.action === filter.action);
    }
    if (filter.since) {
      log = log.filter(e => e.timestamp >= filter.since);
    }
    return log;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Formatting helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Render the ownership tree as an indented plain-text string suitable
 * for compliance reports.
 *
 * @param {object} tree - Output of _buildOwnershipTree or calculateUBOs().tree
 * @param {number} [indent] - Current indentation level
 * @returns {string}
 */
export function formatOwnershipTree(tree, indent = 0) {
  const pad = '  '.repeat(indent);
  const pctLabel = tree.ownershipPct ? ` [${tree.ownershipPct}]` : '';
  const nomineeLabel = tree.isNominee ? ' (NOMINEE)' : '';
  const cycleLabel = tree.cyclicReference ? ' (CIRCULAR REF)' : '';
  const countryLabel = tree.country ? ` (${tree.country})` : '';

  let line = `${pad}${tree.name}${countryLabel}${pctLabel}${nomineeLabel}${cycleLabel}`;

  if (tree.linkType && tree.linkType !== 'direct') {
    line += ` [${tree.linkType}]`;
  }

  const lines = [line];

  if (tree.owners && tree.owners.length > 0) {
    for (const owner of tree.owners) {
      lines.push(formatOwnershipTree(owner, indent + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Produce a summary report of UBO calculation results.
 *
 * @param {object} result - Output of calculateUBOs()
 * @returns {string}
 */
export function formatUBOReport(result) {
  const lines = [];

  lines.push(`UBO Analysis: ${result.targetName} (${result.targetEntity})`);
  lines.push(`Threshold: ${result.thresholdPct}`);
  lines.push(`Calculated: ${result.calculatedAt}`);
  lines.push('');

  if (result.ubos.length === 0) {
    lines.push('No Ultimate Beneficial Owners identified above threshold.');
    lines.push('Manual identification may be required per Cabinet Res 134/2025 Art. 5.');
  } else {
    lines.push(`Identified UBOs (${result.ubos.length}):`);
    for (const ubo of result.ubos) {
      lines.push('');
      lines.push(`  Name:                ${ubo.personName}`);
      lines.push(`  Country:             ${ubo.country || 'Unknown'}`);
      lines.push(`  Effective ownership: ${ubo.effectiveOwnershipPct}`);
      lines.push(`  Nominee structure:   ${ubo.nomineeFlag ? 'YES -- requires look-through' : 'No'}`);
      lines.push(`  Risk score:          ${ubo.riskScore}/10`);
      lines.push(`  Ownership paths:     ${ubo.chains.length}`);
      for (let i = 0; i < ubo.chains.length; i++) {
        const chain = ubo.chains[i];
        const pathStr = chain
          .map(step => `${step.entityName} (${(step.percentage * 100).toFixed(1)}%)`)
          .join(' -> ');
        lines.push(`    Path ${i + 1}: ${pathStr}`);
      }
    }
  }

  if (result.nonUboOwners.length > 0) {
    lines.push('');
    lines.push(`Other identified owners below threshold (${result.nonUboOwners.length}):`);
    for (const owner of result.nonUboOwners) {
      lines.push(`  ${owner.personName}: ${owner.effectiveOwnershipPct}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of result.warnings) {
      lines.push(`  - ${w}`);
    }
  }

  if (result.cycles.length > 0) {
    lines.push('');
    lines.push('Circular ownership detected:');
    for (const cycle of result.cycles) {
      lines.push(`  ${cycle.join(' -> ')}`);
    }
  }

  lines.push('');
  lines.push('For review by the MLRO.');

  return lines.join('\n');
}

// ── 50% Sanctions Ownership Rule ───────────────────────────────

/**
 * SANCTIONS OWNERSHIP VALIDATION (50% Rule)
 *
 * Under FATF Rec.6 / OFAC 50% Rule / FDL No.10/2025 Art.12:
 * An entity is treated as sanctioned if 50% or more of its ownership
 * (direct or indirect, aggregated across all paths) is held by one or
 * more sanctioned persons or entities.
 *
 * This is SEPARATE from UBO identification (25% threshold).
 * The 50% rule applies even when no single sanctioned person exceeds 25%.
 *
 * Example: Sanctioned Person A owns 30% + Sanctioned Person B owns 25%
 * = 55% aggregate sanctioned ownership → entity treated as designated.
 *
 * @param {OwnershipGraph} graph - The ownership graph
 * @param {string} entityId - Entity to check
 * @param {Set<string>|Array<string>} sanctionedIds - IDs of sanctioned persons/entities
 * @param {object} [opts]
 * @param {number} [opts.threshold] - Sanctions threshold (default: 0.50)
 * @returns {SanctionsOwnershipResult}
 */
export function validateSanctionsOwnership(graph, entityId, sanctionedIds, opts = {}) {
  const threshold = opts.threshold !== undefined ? opts.threshold : 0.50;
  const sanctionedSet = sanctionedIds instanceof Set ? sanctionedIds : new Set(sanctionedIds);

  if (!graph.nodes.has(entityId)) {
    throw new Error(`validateSanctionsOwnership: entity "${entityId}" not found in graph`);
  }

  // Run full UBO traversal with 0% threshold (get ALL owners)
  const uboResult = calculateUBOs(graph, entityId, { threshold: 0, maxDepth: MAX_DEPTH });
  const allOwners = [...uboResult.ubos, ...uboResult.nonUboOwners];

  // Identify sanctioned owners and aggregate their effective ownership
  const sanctionedOwners = [];
  let aggregateSanctionedOwnership = 0;

  for (const owner of allOwners) {
    if (sanctionedSet.has(owner.personId) || sanctionedSet.has(owner.personName)) {
      sanctionedOwners.push({
        personId: owner.personId,
        personName: owner.personName,
        country: owner.country,
        effectiveOwnership: owner.effectiveOwnership,
        effectiveOwnershipPct: owner.effectiveOwnershipPct,
        chains: owner.chains,
      });
      aggregateSanctionedOwnership += owner.effectiveOwnership;
    }
  }

  // Also check if any entity IN the ownership chain is sanctioned
  // (not just terminal persons — intermediate corporate entities count too)
  const sanctionedIntermediaries = [];
  for (const owner of allOwners) {
    for (const chain of owner.chains) {
      for (const step of chain) {
        if ((sanctionedSet.has(step.entityId) || sanctionedSet.has(step.entityName)) &&
            !sanctionedOwners.some(s => s.personId === step.entityId)) {
          sanctionedIntermediaries.push({
            entityId: step.entityId,
            entityName: step.entityName,
            positionInChain: `Intermediary in ownership chain to ${owner.personName}`,
          });
        }
      }
    }
  }

  const breachesThreshold = aggregateSanctionedOwnership >= threshold;

  let determination, action;
  if (breachesThreshold) {
    determination = 'DESIGNATED_BY_OWNERSHIP';
    action = 'FREEZE immediately. Entity is treated as designated under the 50% ownership rule. ' +
             'File CNMR within 5 business days. DO NOT notify the subject (Art.29).';
  } else if (sanctionedOwners.length > 0) {
    determination = 'PARTIAL_SANCTIONED_OWNERSHIP';
    action = 'Enhanced due diligence required. Sanctioned persons hold ' +
             `${(aggregateSanctionedOwnership * 100).toFixed(1)}% (below ${threshold * 100}% threshold). ` +
             'Monitor for ownership changes. Escalate to MLRO.';
  } else if (sanctionedIntermediaries.length > 0) {
    determination = 'SANCTIONED_INTERMEDIARY_IN_CHAIN';
    action = 'Sanctioned entity found in ownership chain (not as direct owner). ' +
             'Investigate relationship. EDD and MLRO escalation required.';
  } else {
    determination = 'NO_SANCTIONS_NEXUS';
    action = 'No sanctioned ownership identified. Standard CDD applies.';
  }

  return {
    entityId,
    entityName: graph.nodes.get(entityId)?.name || entityId,
    threshold,
    thresholdPct: `${threshold * 100}%`,
    aggregateSanctionedOwnership: Math.round(aggregateSanctionedOwnership * 10000) / 10000,
    aggregateSanctionedOwnershipPct: `${(aggregateSanctionedOwnership * 100).toFixed(2)}%`,
    breachesThreshold,
    determination,
    action,
    sanctionedOwners,
    sanctionedIntermediaries,
    totalOwnersChecked: allOwners.length,
    sanctionedIdsChecked: sanctionedSet.size,
    checkedAt: new Date().toISOString(),
    regulation: 'FDL No.10/2025 Art.12 | FATF Rec.6 | OFAC 50% Ownership Rule',
  };
}
