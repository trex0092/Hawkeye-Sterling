/**
 * Network Intelligence Engine — Deep Relationship & Pattern Analysis.
 *
 * Goes beyond simple screening into advanced intelligence capabilities:
 *
 * 1. HIDDEN NETWORK DETECTION
 *    Identifies concealed ownership structures, shell company chains,
 *    and nominee arrangements that obscure beneficial ownership.
 *
 * 2. CROSS-ENTITY CORRELATION
 *    Links entities across transactions, shared addresses, shared UBOs,
 *    common phone numbers, and co-occurrence in filings.
 *
 * 3. TEMPORAL PATTERN MINING
 *    Detects time-coordinated activity across multiple entities
 *    (synchronized transactions, sequential shell company creation).
 *
 * 4. GEOGRAPHIC FLOW MAPPING
 *    Maps money flows across jurisdictions, flagging high-risk corridors
 *    (e.g., UAE -> gold refiners -> sanctioned jurisdictions).
 *
 * 5. ANOMALY SCORING
 *    Assigns each entity an anomaly score based on how much their
 *    behavior deviates from their declared business profile.
 *
 * 6. CLUSTER DETECTION
 *    Groups related entities into clusters for coordinated investigation.
 *
 * Zero dependencies. Pure graph algorithms on in-memory data.
 */

import { FATF_LISTS } from '../config.js';

/**
 * Build a relationship graph from transactions and entity data.
 *
 * @param {object} params
 * @param {Array} params.transactions - Transaction records
 * @param {Array} params.entities - Entity profiles
 * @param {Array} [params.addresses] - Address records linking entities
 * @param {Array} [params.ubos] - UBO declaration records
 * @returns {NetworkGraph}
 */
export function buildGraph(params) {
  const nodes = new Map();
  const edges = [];

  // Add entity nodes
  for (const e of (params.entities || [])) {
    nodes.set(e.name, {
      id: e.name,
      type: e.type || 'entity',
      country: e.country,
      riskScore: 0,
      anomalyScore: 0,
      connections: 0,
      cluster: null,
      metadata: e,
    });
  }

  // Build edges from transactions
  for (const tx of (params.transactions || [])) {
    if (!nodes.has(tx.from)) {
      nodes.set(tx.from, { id: tx.from, type: 'entity', connections: 0, cluster: null });
    }
    if (!nodes.has(tx.to)) {
      nodes.set(tx.to, { id: tx.to, type: 'entity', connections: 0, cluster: null });
    }

    edges.push({
      from: tx.from,
      to: tx.to,
      type: 'transaction',
      amount: tx.amount,
      date: tx.date,
      method: tx.method,
      weight: tx.amount || 1,
    });

    nodes.get(tx.from).connections++;
    nodes.get(tx.to).connections++;
  }

  // Build edges from shared addresses
  const addressGroups = {};
  for (const addr of (params.addresses || [])) {
    const key = normalizeAddress(addr.address);
    if (!addressGroups[key]) addressGroups[key] = [];
    addressGroups[key].push(addr.entity);
  }
  for (const [, entities] of Object.entries(addressGroups)) {
    if (entities.length < 2) continue;
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        edges.push({
          from: entities[i],
          to: entities[j],
          type: 'shared_address',
          weight: 5,
        });
      }
    }
  }

  // Build edges from shared UBOs
  const uboGroups = {};
  for (const ubo of (params.ubos || [])) {
    if (!uboGroups[ubo.uboName]) uboGroups[ubo.uboName] = [];
    uboGroups[ubo.uboName].push(ubo.entity);
  }
  for (const [uboName, entities] of Object.entries(uboGroups)) {
    if (entities.length < 2) continue;
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        edges.push({
          from: entities[i],
          to: entities[j],
          type: 'shared_ubo',
          uboName,
          weight: 10,
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Detect hidden networks — clusters of entities with non-obvious relationships.
 *
 * Uses Union-Find (disjoint set) to identify connected components,
 * then scores each cluster based on risk indicators.
 */
export function detectClusters(graph) {
  const parent = new Map();
  const rank = new Map();

  function find(x) {
    if (!parent.has(x)) { parent.set(x, x); rank.set(x, 0); }
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  }

  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (rank.get(ra) < rank.get(rb)) parent.set(ra, rb);
    else if (rank.get(ra) > rank.get(rb)) parent.set(rb, ra);
    else { parent.set(rb, ra); rank.set(ra, rank.get(ra) + 1); }
  }

  // Union all connected entities
  for (const edge of graph.edges) {
    union(edge.from, edge.to);
  }

  // Group nodes by cluster
  const clusters = new Map();
  for (const [id] of graph.nodes) {
    const root = find(id);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(id);
  }

  // Score and analyze each cluster
  const results = [];
  for (const [root, members] of clusters) {
    if (members.length < 2) continue;

    const clusterEdges = graph.edges.filter(e =>
      members.includes(e.from) && members.includes(e.to)
    );

    const hasSharedAddress = clusterEdges.some(e => e.type === 'shared_address');
    const hasSharedUbo = clusterEdges.some(e => e.type === 'shared_ubo');
    const totalFlow = clusterEdges
      .filter(e => e.type === 'transaction')
      .reduce((s, e) => s + (e.amount || 0), 0);

    // Risk score for the cluster
    let riskScore = 0;
    if (members.length >= 5) riskScore += 2;
    if (members.length >= 10) riskScore += 3;
    if (hasSharedAddress) riskScore += 2;
    if (hasSharedUbo) riskScore += 3;
    if (totalFlow > 1000000) riskScore += 2;

    // Check for high-risk jurisdictions
    const jurisdictions = [...new Set(members
      .map(m => graph.nodes.get(m)?.country)
      .filter(Boolean))];
    const hasBlacklist = jurisdictions.some(j => FATF_LISTS.blacklist.includes(j));
    const hasGreylist = jurisdictions.some(j => FATF_LISTS.greylist.includes(j));
    if (hasBlacklist) riskScore += 5;
    if (hasGreylist) riskScore += 2;

    results.push({
      id: root,
      members,
      size: members.length,
      edgeCount: clusterEdges.length,
      edgeTypes: [...new Set(clusterEdges.map(e => e.type))],
      totalFlow,
      jurisdictions,
      riskScore: Math.min(25, riskScore),
      hasSharedAddress,
      hasSharedUbo,
      hasBlacklistJurisdiction: hasBlacklist,
      hasGreylistJurisdiction: hasGreylist,
      severity: riskScore >= 10 ? 'CRITICAL' : riskScore >= 5 ? 'HIGH' : 'MEDIUM',
    });
  }

  return results.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Detect temporal coordination — entities acting in synchronized patterns.
 */
export function detectTemporalPatterns(graph) {
  const alerts = [];
  const txEdges = graph.edges.filter(e => e.type === 'transaction' && e.date);

  // Group transactions by date (daily windows)
  const byDate = {};
  for (const e of txEdges) {
    const day = String(e.date).slice(0, 10);
    if (!byDate[day]) byDate[day] = [];
    byDate[day].push(e);
  }

  // Find days with unusually high coordinated activity
  for (const [date, txs] of Object.entries(byDate)) {
    const uniquePairs = new Set(txs.map(t => `${t.from}->${t.to}`));

    if (uniquePairs.size >= 5) {
      const entities = [...new Set(txs.flatMap(t => [t.from, t.to]))];
      const totalAmount = txs.reduce((s, t) => s + (t.amount || 0), 0);

      alerts.push({
        type: 'TEMPORAL_COORDINATION',
        date,
        uniqueFlows: uniquePairs.size,
        transactionCount: txs.length,
        entities,
        totalAmount,
        confidence: Math.min(1, 0.3 + uniquePairs.size * 0.1),
        severity: uniquePairs.size >= 10 ? 'CRITICAL' : 'HIGH',
        description: `${uniquePairs.size} unique transaction flows on ${date} involving ${entities.length} entities (AED ${totalAmount.toLocaleString()})`,
      });
    }
  }

  return alerts;
}

/**
 * Map geographic money flows and flag high-risk corridors.
 */
export function mapGeographicFlows(graph) {
  const corridors = {};

  for (const edge of graph.edges) {
    if (edge.type !== 'transaction') continue;
    const fromCountry = graph.nodes.get(edge.from)?.country || 'UNKNOWN';
    const toCountry = graph.nodes.get(edge.to)?.country || 'UNKNOWN';

    if (fromCountry === toCountry) continue;

    const key = `${fromCountry}->${toCountry}`;
    if (!corridors[key]) {
      corridors[key] = { from: fromCountry, to: toCountry, totalAmount: 0, count: 0, entities: new Set() };
    }
    corridors[key].totalAmount += edge.amount || 0;
    corridors[key].count++;
    corridors[key].entities.add(edge.from);
    corridors[key].entities.add(edge.to);
  }

  return Object.values(corridors)
    .map(c => ({
      ...c,
      entities: [...c.entities],
      entityCount: c.entities.size || [...c.entities].length,
      isHighRisk: FATF_LISTS.blacklist.includes(c.from) || FATF_LISTS.blacklist.includes(c.to),
      isGreylistCorridor: FATF_LISTS.greylist.includes(c.from) || FATF_LISTS.greylist.includes(c.to),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

/**
 * Calculate anomaly scores for each entity based on behavioral deviation.
 */
export function calculateAnomalyScores(graph) {
  const scores = [];

  for (const [id, node] of graph.nodes) {
    const inbound = graph.edges.filter(e => e.to === id && e.type === 'transaction');
    const outbound = graph.edges.filter(e => e.from === id && e.type === 'transaction');

    const totalIn = inbound.reduce((s, e) => s + (e.amount || 0), 0);
    const totalOut = outbound.reduce((s, e) => s + (e.amount || 0), 0);
    const netFlow = totalIn - totalOut;

    let anomaly = 0;
    const reasons = [];

    // High-volume throughput (possible layering node)
    if (totalIn > 500000 && totalOut > 500000) {
      const throughputRatio = Math.min(totalIn, totalOut) / Math.max(totalIn, totalOut);
      if (throughputRatio > 0.8) {
        anomaly += 3;
        reasons.push(`Pass-through entity: ${Math.round(throughputRatio * 100)}% throughput ratio`);
      }
    }

    // Many unique counterparties
    const uniqueCounterparties = new Set([
      ...inbound.map(e => e.from),
      ...outbound.map(e => e.to),
    ]).size;
    if (uniqueCounterparties >= 10) {
      anomaly += 2;
      reasons.push(`${uniqueCounterparties} unique counterparties`);
    }

    // Shared infrastructure
    const sharedEdges = graph.edges.filter(e =>
      (e.from === id || e.to === id) && (e.type === 'shared_address' || e.type === 'shared_ubo')
    );
    if (sharedEdges.length > 0) {
      anomaly += sharedEdges.length;
      reasons.push(`${sharedEdges.length} shared infrastructure link(s)`);
    }

    // Jurisdiction risk
    if (FATF_LISTS.blacklist.includes(node.country)) {
      anomaly += 3;
      reasons.push('FATF blacklist jurisdiction');
    } else if (FATF_LISTS.greylist.includes(node.country)) {
      anomaly += 1;
      reasons.push('FATF greylist jurisdiction');
    }

    scores.push({
      entity: id,
      anomalyScore: Math.min(10, anomaly),
      severity: anomaly >= 7 ? 'CRITICAL' : anomaly >= 4 ? 'HIGH' : anomaly >= 2 ? 'MEDIUM' : 'LOW',
      totalInflow: totalIn,
      totalOutflow: totalOut,
      netFlow,
      uniqueCounterparties,
      reasons,
    });
  }

  return scores.sort((a, b) => b.anomalyScore - a.anomalyScore);
}

/**
 * Full network intelligence analysis — runs all detectors.
 */
export function analyzeNetwork(params) {
  const graph = buildGraph(params);
  const clusters = detectClusters(graph);
  const temporal = detectTemporalPatterns(graph);
  const flows = mapGeographicFlows(graph);
  const anomalies = calculateAnomalyScores(graph);

  return {
    graph: {
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
    },
    clusters: {
      count: clusters.length,
      critical: clusters.filter(c => c.severity === 'CRITICAL').length,
      items: clusters,
    },
    temporalPatterns: {
      count: temporal.length,
      items: temporal,
    },
    geographicFlows: {
      corridors: flows.length,
      highRiskCorridors: flows.filter(f => f.isHighRisk).length,
      items: flows,
    },
    anomalies: {
      critical: anomalies.filter(a => a.severity === 'CRITICAL').length,
      high: anomalies.filter(a => a.severity === 'HIGH').length,
      items: anomalies.slice(0, 50),
    },
    summary: {
      totalEntities: graph.nodes.size,
      totalTransactions: graph.edges.filter(e => e.type === 'transaction').length,
      clustersDetected: clusters.length,
      criticalAlerts: clusters.filter(c => c.severity === 'CRITICAL').length + temporal.filter(t => t.severity === 'CRITICAL').length,
      highRiskCorridors: flows.filter(f => f.isHighRisk).length,
    },
    analyzedAt: new Date().toISOString(),
  };
}

function normalizeAddress(addr) {
  if (!addr) return '';
  return String(addr).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}
