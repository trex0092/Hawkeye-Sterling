/**
 * Entity Resolution and Deduplication Engine.
 *
 * Merges duplicate entities across different screening sources (OFAC,
 * UN, EU, UK OFSI, OpenSanctions, adverse media) into a single
 * canonical "golden record" per real-world entity.
 *
 * Core capabilities:
 *   - Fuzzy name matching via Jaro-Winkler, token-set ratio, partial ratio
 *   - Multi-attribute comparison: name, DOB, country, ID numbers, addresses
 *   - Confidence scoring (0-1) with configurable merge thresholds
 *   - Automatic merge, suggested merge, or ignore based on confidence
 *   - Golden record creation with conflict resolution
 *   - Full merge audit trail with undo capability
 *   - Bulk deduplication scan across entire entity store
 *
 * References:
 *   - Federal Decree-Law No. 10/2025, Art. 9 (customer identification)
 *   - Cabinet Resolution 134/2025, Art. 12 (record-keeping and accuracy)
 *
 * Zero external dependencies.
 */

import { normalize } from '../lib/normalize.js';
import {
  jaroWinkler,
  tokenSetRatio,
  tokenSortRatio,
  partialRatio,
  levenshteinSim,
} from '../lib/fuzzy.js';

// ─────────────────────────────────────────────────────────────────────
//  Configuration
// ─────────────────────────────────────────────────────────────────────

/** @type {{ autoMerge: number, suggestMerge: number, ignore: number }} */
const DEFAULT_THRESHOLDS = {
  autoMerge: 0.95,     // >= 0.95: merge automatically
  suggestMerge: 0.80,  // 0.80 - 0.94: flag for human review
  ignore: 0.80,        // < 0.80: not a match
};

/**
 * Weights for individual match attributes. Sum to 1.0.
 * Name similarity carries the heaviest weight because it is the only
 * attribute guaranteed to be present across all sources.
 */
const ATTRIBUTE_WEIGHTS = {
  name: 0.40,
  dob: 0.20,
  country: 0.15,
  identifiers: 0.15,
  addresses: 0.10,
};

/**
 * Source authority ranking. When two sources disagree on a field value,
 * the source with higher authority wins. Ties broken by recency.
 */
const SOURCE_AUTHORITY = {
  'un':                100,
  'ofac-sdn':          95,
  'uk-ofsi':           90,
  'eu-fsf':            85,
  'opensanctions':     70,
  'adverse-media':     30,
};

// ─────────────────────────────────────────────────────────────────────
//  Match Scoring
// ─────────────────────────────────────────────────────────────────────

/**
 * Compare two entity records and produce a confidence score.
 *
 * @param {object} entityA - First entity record
 * @param {object} entityB - Second entity record
 * @returns {{ confidence: number, breakdown: object, decision: string }}
 */
export function compareEntities(entityA, entityB) {
  if (!entityA || !entityB) {
    throw new Error('compareEntities: both entityA and entityB are required');
  }

  const breakdown = {};
  let totalWeight = 0;
  let weightedScore = 0;

  // Name similarity (always available)
  const nameConf = _compareNames(entityA, entityB);
  breakdown.name = nameConf;
  weightedScore += nameConf.score * ATTRIBUTE_WEIGHTS.name;
  totalWeight += ATTRIBUTE_WEIGHTS.name;

  // Date of birth
  const dobConf = _compareDOB(entityA, entityB);
  if (dobConf !== null) {
    breakdown.dob = dobConf;
    weightedScore += dobConf.score * ATTRIBUTE_WEIGHTS.dob;
    totalWeight += ATTRIBUTE_WEIGHTS.dob;
  }

  // Country
  const countryConf = _compareCountry(entityA, entityB);
  if (countryConf !== null) {
    breakdown.country = countryConf;
    weightedScore += countryConf.score * ATTRIBUTE_WEIGHTS.country;
    totalWeight += ATTRIBUTE_WEIGHTS.country;
  }

  // Identifiers (passport, tax ID, etc.)
  const idConf = _compareIdentifiers(entityA, entityB);
  if (idConf !== null) {
    breakdown.identifiers = idConf;
    weightedScore += idConf.score * ATTRIBUTE_WEIGHTS.identifiers;
    totalWeight += ATTRIBUTE_WEIGHTS.identifiers;
  }

  // Addresses
  const addrConf = _compareAddresses(entityA, entityB);
  if (addrConf !== null) {
    breakdown.addresses = addrConf;
    weightedScore += addrConf.score * ATTRIBUTE_WEIGHTS.addresses;
    totalWeight += ATTRIBUTE_WEIGHTS.addresses;
  }

  // Normalize by available weights
  const confidence = totalWeight > 0 ? weightedScore / totalWeight : 0;
  const rounded = Math.round(confidence * 10000) / 10000;

  const decision = _classifyMatch(rounded);

  return {
    confidence: rounded,
    decision,
    breakdown,
    entityAId: entityA.id || null,
    entityBId: entityB.id || null,
  };
}

/**
 * Compare name fields across all aliases.
 * @param {object} a
 * @param {object} b
 * @returns {{ score: number, detail: string }}
 */
function _compareNames(a, b) {
  const aNamesRaw = _extractNames(a);
  const bNamesRaw = _extractNames(b);

  if (aNamesRaw.length === 0 || bNamesRaw.length === 0) {
    return { score: 0, detail: 'One or both entities have no names' };
  }

  let bestScore = 0;
  let bestPair = ['', ''];

  for (const aName of aNamesRaw) {
    const aNorm = normalize(aName);
    for (const bName of bNamesRaw) {
      const bNorm = normalize(bName);

      // Compute multiple fuzzy scores and take the best
      const jw = jaroWinkler(aNorm.stripped, bNorm.stripped);
      const tsr = tokenSetRatio(aNorm.tokens, bNorm.tokens);
      const tsort = tokenSortRatio(aNorm.tokens, bNorm.tokens);
      const pr = partialRatio(aNorm.stripped, bNorm.stripped);

      // Weighted combination favoring token-set (handles reordering)
      const combined = jw * 0.25 + tsr * 0.35 + tsort * 0.20 + pr * 0.20;

      if (combined > bestScore) {
        bestScore = combined;
        bestPair = [aName, bName];
      }
    }
  }

  return {
    score: Math.round(bestScore * 10000) / 10000,
    detail: `Best match: "${bestPair[0]}" vs "${bestPair[1]}"`,
  };
}

/**
 * Compare dates of birth. Exact match = 1.0, year-only match = 0.5,
 * mismatch = 0.0. Returns null if neither entity has a DOB.
 * @param {object} a
 * @param {object} b
 * @returns {{ score: number, detail: string }|null}
 */
function _compareDOB(a, b) {
  const aDob = a.dob || null;
  const bDob = b.dob || null;

  if (aDob === null && bDob === null) return null;
  if (aDob === null || bDob === null) {
    return { score: 0.5, detail: 'DOB available for only one entity' };
  }

  const aStr = String(aDob).trim();
  const bStr = String(bDob).trim();

  if (aStr === bStr) {
    return { score: 1.0, detail: `Exact DOB match: ${aStr}` };
  }

  // Year-only comparison
  const aYear = aStr.slice(0, 4);
  const bYear = bStr.slice(0, 4);
  if (aYear.length === 4 && bYear.length === 4 && aYear === bYear) {
    return { score: 0.5, detail: `Year match only: ${aYear}` };
  }

  return { score: 0.0, detail: `DOB mismatch: ${aStr} vs ${bStr}` };
}

/**
 * Compare country fields. Supports both single country and arrays.
 * @param {object} a
 * @param {object} b
 * @returns {{ score: number, detail: string }|null}
 */
function _compareCountry(a, b) {
  const aCountries = _extractCountries(a);
  const bCountries = _extractCountries(b);

  if (aCountries.length === 0 && bCountries.length === 0) return null;
  if (aCountries.length === 0 || bCountries.length === 0) {
    return { score: 0.3, detail: 'Country available for only one entity' };
  }

  const aSet = new Set(aCountries.map(c => c.toUpperCase()));
  const bSet = new Set(bCountries.map(c => c.toUpperCase()));

  let overlap = 0;
  for (const c of aSet) {
    if (bSet.has(c)) overlap++;
  }

  if (overlap > 0) {
    const score = overlap / Math.max(aSet.size, bSet.size);
    return { score, detail: `Country overlap: ${overlap} of ${Math.max(aSet.size, bSet.size)}` };
  }

  return { score: 0.0, detail: `No country overlap` };
}

/**
 * Compare identifiers (passports, tax IDs, IMO numbers, etc.).
 * Any exact match on an identifier is a strong signal.
 * @param {object} a
 * @param {object} b
 * @returns {{ score: number, detail: string }|null}
 */
function _compareIdentifiers(a, b) {
  const aIds = _extractIdentifiers(a);
  const bIds = _extractIdentifiers(b);

  if (aIds.length === 0 && bIds.length === 0) return null;
  if (aIds.length === 0 || bIds.length === 0) {
    return { score: 0.3, detail: 'Identifiers available for only one entity' };
  }

  const aNorm = new Set(aIds.map(id => id.replace(/[\s\-\.]/g, '').toUpperCase()));
  const bNorm = new Set(bIds.map(id => id.replace(/[\s\-\.]/g, '').toUpperCase()));

  let matches = 0;
  const matchedIds = [];
  for (const id of aNorm) {
    if (bNorm.has(id)) {
      matches++;
      matchedIds.push(id);
    }
  }

  if (matches > 0) {
    return {
      score: Math.min(1.0, 0.8 + matches * 0.1),
      detail: `${matches} identifier match(es): ${matchedIds.join(', ')}`,
    };
  }

  return { score: 0.0, detail: 'No matching identifiers' };
}

/**
 * Compare addresses using fuzzy string matching.
 * @param {object} a
 * @param {object} b
 * @returns {{ score: number, detail: string }|null}
 */
function _compareAddresses(a, b) {
  const aAddrs = _extractAddresses(a);
  const bAddrs = _extractAddresses(b);

  if (aAddrs.length === 0 && bAddrs.length === 0) return null;
  if (aAddrs.length === 0 || bAddrs.length === 0) {
    return { score: 0.2, detail: 'Address available for only one entity' };
  }

  let bestScore = 0;
  for (const aAddr of aAddrs) {
    const aNorm = normalize(aAddr);
    for (const bAddr of bAddrs) {
      const bNorm = normalize(bAddr);
      const sim = levenshteinSim(aNorm.stripped, bNorm.stripped);
      if (sim > bestScore) bestScore = sim;
    }
  }

  return {
    score: Math.round(bestScore * 10000) / 10000,
    detail: `Best address similarity: ${(bestScore * 100).toFixed(1)}%`,
  };
}

/**
 * Classify a confidence score into a merge decision.
 * @param {number} confidence
 * @returns {string}
 */
function _classifyMatch(confidence) {
  if (confidence >= DEFAULT_THRESHOLDS.autoMerge) return 'auto_merge';
  if (confidence >= DEFAULT_THRESHOLDS.suggestMerge) return 'suggest_merge';
  return 'ignore';
}

// ─────────────────────────────────────────────────────────────────────
//  Field Extractors (tolerant of varying entity shapes)
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract all names (primary + aliases) from an entity.
 * @param {object} entity
 * @returns {Array<string>}
 */
function _extractNames(entity) {
  const names = [];
  if (entity.name) names.push(entity.name);
  if (entity.names && Array.isArray(entity.names)) {
    for (const n of entity.names) {
      if (n && !names.includes(n)) names.push(n);
    }
  }
  if (entity.aliases && Array.isArray(entity.aliases)) {
    for (const a of entity.aliases) {
      if (a && !names.includes(a)) names.push(a);
    }
  }
  return names;
}

/**
 * Extract country codes from an entity.
 * @param {object} entity
 * @returns {Array<string>}
 */
function _extractCountries(entity) {
  if (entity.countries && Array.isArray(entity.countries)) return entity.countries;
  if (entity.country) return [entity.country];
  return [];
}

/**
 * Extract identifiers from an entity.
 * @param {object} entity
 * @returns {Array<string>}
 */
function _extractIdentifiers(entity) {
  if (entity.identifiers && Array.isArray(entity.identifiers)) return entity.identifiers;
  const ids = [];
  if (entity.passportNumber) ids.push(entity.passportNumber);
  if (entity.taxId) ids.push(entity.taxId);
  if (entity.imoNumber) ids.push(entity.imoNumber);
  if (entity.nationalId) ids.push(entity.nationalId);
  return ids;
}

/**
 * Extract addresses from an entity.
 * @param {object} entity
 * @returns {Array<string>}
 */
function _extractAddresses(entity) {
  if (entity.addresses && Array.isArray(entity.addresses)) return entity.addresses;
  if (entity.address) return [entity.address];
  return [];
}

// ─────────────────────────────────────────────────────────────────────
//  Golden Record Creation
// ─────────────────────────────────────────────────────────────────────

/**
 * Merge multiple entity records into a single canonical golden record.
 * Fields are resolved using source authority and recency.
 *
 * @param {Array<object>} entities - Entity records to merge (at least 2)
 * @param {object} [opts]
 * @param {string} [opts.goldenId] - ID for the merged record (auto-generated if omitted)
 * @returns {{ golden: object, mergeReport: object }}
 */
export function createGoldenRecord(entities, opts = {}) {
  if (!Array.isArray(entities) || entities.length < 2) {
    throw new Error('createGoldenRecord: at least 2 entities required');
  }

  // Sort by authority descending, then by recency
  const sorted = [...entities].sort((a, b) => {
    const authA = SOURCE_AUTHORITY[a.source] || 0;
    const authB = SOURCE_AUTHORITY[b.source] || 0;
    if (authA !== authB) return authB - authA;
    // Recency: later last_seen wins
    const dateA = a.last_seen || a.updatedAt || '';
    const dateB = b.last_seen || b.updatedAt || '';
    return dateB.localeCompare(dateA);
  });

  const goldenId = opts.goldenId || `golden-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Collect all names (deduplicated)
  const allNames = [];
  const nameSet = new Set();
  for (const e of sorted) {
    for (const n of _extractNames(e)) {
      const norm = normalize(n).stripped;
      if (!nameSet.has(norm)) {
        nameSet.add(norm);
        allNames.push(n);
      }
    }
  }

  // Collect all countries (deduplicated)
  const countrySet = new Set();
  for (const e of sorted) {
    for (const c of _extractCountries(e)) {
      countrySet.add(c.toUpperCase());
    }
  }

  // Collect all identifiers (deduplicated)
  const idSet = new Set();
  for (const e of sorted) {
    for (const id of _extractIdentifiers(e)) {
      idSet.add(id);
    }
  }

  // Collect all addresses (deduplicated by normalized form)
  const allAddresses = [];
  const addrNormSet = new Set();
  for (const e of sorted) {
    for (const addr of _extractAddresses(e)) {
      const norm = normalize(addr).stripped;
      if (!addrNormSet.has(norm)) {
        addrNormSet.add(norm);
        allAddresses.push(addr);
      }
    }
  }

  // Collect all programs and topics
  const programSet = new Set();
  const topicSet = new Set();
  for (const e of sorted) {
    for (const p of (e.programs || [])) programSet.add(p);
    for (const t of (e.topics || [])) topicSet.add(t);
  }

  // DOB: take from highest-authority source that has it
  let dob = null;
  for (const e of sorted) {
    if (e.dob) { dob = e.dob; break; }
  }

  // Schema: take from highest-authority source
  let schema = 'Unknown';
  for (const e of sorted) {
    if (e.schema) { schema = e.schema; break; }
  }

  const conflicts = [];

  // Detect DOB conflicts
  const dobs = sorted.filter(e => e.dob).map(e => ({ source: e.source, dob: e.dob }));
  if (dobs.length > 1) {
    const uniqueDobs = new Set(dobs.map(d => d.dob));
    if (uniqueDobs.size > 1) {
      conflicts.push({
        field: 'dob',
        values: dobs,
        resolution: `Using "${dob}" from ${sorted.find(e => e.dob)?.source || 'unknown'} (highest authority)`,
      });
    }
  }

  // Detect schema conflicts
  const schemas = sorted.filter(e => e.schema).map(e => ({ source: e.source, schema: e.schema }));
  if (schemas.length > 1) {
    const uniqueSchemas = new Set(schemas.map(s => s.schema));
    if (uniqueSchemas.size > 1) {
      conflicts.push({
        field: 'schema',
        values: schemas,
        resolution: `Using "${schema}" from ${sorted.find(e => e.schema)?.source || 'unknown'} (highest authority)`,
      });
    }
  }

  const golden = {
    id: goldenId,
    schema,
    names: allNames,
    dob,
    countries: [...countrySet],
    identifiers: [...idSet],
    addresses: allAddresses,
    programs: [...programSet],
    topics: [...topicSet],
    sources: sorted.map(e => e.source).filter(Boolean),
    sourceIds: sorted.map(e => e.id).filter(Boolean),
    first_seen: sorted.reduce((earliest, e) => {
      if (!e.first_seen) return earliest;
      if (!earliest) return e.first_seen;
      return e.first_seen < earliest ? e.first_seen : earliest;
    }, null),
    last_seen: sorted.reduce((latest, e) => {
      if (!e.last_seen) return latest;
      if (!latest) return e.last_seen;
      return e.last_seen > latest ? e.last_seen : latest;
    }, null),
    mergedAt: new Date().toISOString(),
  };

  const mergeReport = {
    goldenId,
    mergedEntityIds: sorted.map(e => e.id).filter(Boolean),
    entityCount: entities.length,
    nameCount: allNames.length,
    conflicts,
    timestamp: new Date().toISOString(),
  };

  return { golden, mergeReport };
}

// ─────────────────────────────────────────────────────────────────────
//  Entity Resolver (stateful deduplication engine)
// ─────────────────────────────────────────────────────────────────────

/**
 * Stateful entity resolution engine. Manages an entity store, finds
 * duplicates, merges them, and maintains an audit trail.
 */
export class EntityResolver {
  /**
   * @param {object} [opts]
   * @param {object} [opts.thresholds] - Override default merge thresholds
   */
  constructor(opts = {}) {
    /** @type {Map<string, object>} id -> entity record */
    this.entities = new Map();
    /** @type {Map<string, object>} goldenId -> golden record */
    this.goldenRecords = new Map();
    /** @type {Array<object>} merge audit trail */
    this.mergeLog = [];
    /** @type {Array<object>} pending merge suggestions */
    this.pendingSuggestions = [];
    /** @type {{ autoMerge: number, suggestMerge: number, ignore: number }} */
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds || {}) };
    /** @type {{ compared: number, autoMerged: number, suggested: number, ignored: number }} */
    this.stats = { compared: 0, autoMerged: 0, suggested: 0, ignored: 0 };
  }

  /**
   * Add an entity to the resolver store.
   * @param {object} entity - Entity record with at least { id, names|name }
   */
  addEntity(entity) {
    if (!entity || !entity.id) {
      throw new Error('EntityResolver.addEntity: entity.id is required');
    }
    this.entities.set(entity.id, entity);
  }

  /**
   * Add multiple entities.
   * @param {Array<object>} entities
   */
  addEntities(entities) {
    for (const e of entities) {
      this.addEntity(e);
    }
  }

  /**
   * Compare two entities by ID and return match details.
   * @param {string} idA
   * @param {string} idB
   * @returns {{ confidence: number, decision: string, breakdown: object }}
   */
  compare(idA, idB) {
    const a = this.entities.get(idA);
    const b = this.entities.get(idB);
    if (!a) throw new Error(`EntityResolver.compare: entity "${idA}" not found`);
    if (!b) throw new Error(`EntityResolver.compare: entity "${idB}" not found`);
    this.stats.compared++;
    return compareEntities(a, b);
  }

  /**
   * Find potential duplicates for a specific entity.
   * @param {string} entityId
   * @param {object} [opts]
   * @param {number} [opts.limit] - Max candidates to return
   * @returns {Array<{ entityId: string, confidence: number, decision: string, breakdown: object }>}
   */
  findDuplicates(entityId, opts = {}) {
    const limit = opts.limit || 50;
    const target = this.entities.get(entityId);
    if (!target) {
      throw new Error(`EntityResolver.findDuplicates: entity "${entityId}" not found`);
    }

    const candidates = [];
    for (const [otherId, other] of this.entities) {
      if (otherId === entityId) continue;

      const result = compareEntities(target, other);
      this.stats.compared++;

      if (result.decision !== 'ignore') {
        candidates.push({
          entityId: otherId,
          entityName: _extractNames(other)[0] || otherId,
          confidence: result.confidence,
          decision: result.decision,
          breakdown: result.breakdown,
        });
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates.slice(0, limit);
  }

  /**
   * Run bulk deduplication across all entities.
   * Uses blocking (first letter of normalized name) to avoid O(n^2)
   * comparisons on large stores.
   *
   * @param {object} [opts]
   * @param {number} [opts.batchSize] - Entities per blocking bucket
   * @returns {{ autoMerged: Array, suggestions: Array, stats: object }}
   */
  bulkDedup(opts = {}) {
    const autoMerged = [];
    const suggestions = [];

    // Build blocking buckets by first 3 chars of normalized primary name
    const buckets = new Map();
    for (const [id, entity] of this.entities) {
      const names = _extractNames(entity);
      if (names.length === 0) continue;
      const norm = normalize(names[0]);
      const key = norm.stripped.slice(0, 3) || '_empty';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(id);
    }

    // Compare within each bucket
    const compared = new Set();
    for (const [, bucket] of buckets) {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const pairKey = bucket[i] < bucket[j]
            ? `${bucket[i]}|${bucket[j]}`
            : `${bucket[j]}|${bucket[i]}`;
          if (compared.has(pairKey)) continue;
          compared.add(pairKey);

          const entityA = this.entities.get(bucket[i]);
          const entityB = this.entities.get(bucket[j]);
          const result = compareEntities(entityA, entityB);
          this.stats.compared++;

          if (result.decision === 'auto_merge') {
            autoMerged.push({
              entityAId: bucket[i],
              entityBId: bucket[j],
              confidence: result.confidence,
              breakdown: result.breakdown,
            });
            this.stats.autoMerged++;
          } else if (result.decision === 'suggest_merge') {
            suggestions.push({
              entityAId: bucket[i],
              entityBId: bucket[j],
              confidence: result.confidence,
              breakdown: result.breakdown,
            });
            this.stats.suggested++;
          } else {
            this.stats.ignored++;
          }
        }
      }
    }

    // Store suggestions for later review
    this.pendingSuggestions.push(...suggestions);

    return {
      autoMerged,
      suggestions,
      stats: { ...this.stats },
    };
  }

  /**
   * Execute a merge of two or more entities into a golden record.
   * @param {Array<string>} entityIds - IDs of entities to merge
   * @param {object} [opts]
   * @param {string} [opts.reason] - Human-readable merge reason
   * @param {string} [opts.mergedBy] - User who approved the merge
   * @returns {{ golden: object, mergeReport: object }}
   */
  merge(entityIds, opts = {}) {
    if (!Array.isArray(entityIds) || entityIds.length < 2) {
      throw new Error('EntityResolver.merge: at least 2 entity IDs required');
    }

    const entities = [];
    for (const id of entityIds) {
      const entity = this.entities.get(id);
      if (!entity) {
        throw new Error(`EntityResolver.merge: entity "${id}" not found`);
      }
      entities.push(entity);
    }

    const { golden, mergeReport } = createGoldenRecord(entities, opts);

    // Store the golden record
    this.goldenRecords.set(golden.id, golden);

    // Record the merge in the audit trail
    const logEntry = {
      mergeId: `merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      goldenId: golden.id,
      mergedEntityIds: entityIds,
      confidence: opts.confidence || null,
      reason: opts.reason || 'Manual merge',
      mergedBy: opts.mergedBy || 'system',
      timestamp: new Date().toISOString(),
      report: mergeReport,
      undone: false,
    };
    this.mergeLog.push(logEntry);
    this.stats.autoMerged++;

    // Remove merged entities from the main store and add golden record
    for (const id of entityIds) {
      this.entities.delete(id);
    }
    this.entities.set(golden.id, golden);

    // Remove resolved suggestions
    this.pendingSuggestions = this.pendingSuggestions.filter(
      s => !entityIds.includes(s.entityAId) && !entityIds.includes(s.entityBId)
    );

    return { golden, mergeReport };
  }

  /**
   * Undo a previous merge. Restores the original entities and removes
   * the golden record.
   *
   * @param {string} mergeId - The merge ID from the audit trail
   * @returns {{ restored: Array<string>, goldenRemoved: string }}
   */
  undoMerge(mergeId) {
    const logEntry = this.mergeLog.find(e => e.mergeId === mergeId);
    if (!logEntry) {
      throw new Error(`EntityResolver.undoMerge: merge "${mergeId}" not found`);
    }
    if (logEntry.undone) {
      throw new Error(`EntityResolver.undoMerge: merge "${mergeId}" was already undone`);
    }

    // Remove the golden record
    const golden = this.goldenRecords.get(logEntry.goldenId);
    if (golden) {
      this.entities.delete(golden.id);
      this.goldenRecords.delete(golden.id);
    }

    // We cannot fully restore original entities since they were deleted,
    // but we can reconstruct stubs from the golden record's sourceIds.
    // In a production system these would be fetched from the original store.
    const restored = [];
    if (golden && golden.sourceIds) {
      for (let i = 0; i < golden.sourceIds.length; i++) {
        const stub = {
          id: golden.sourceIds[i],
          names: golden.names,
          source: golden.sources ? golden.sources[i] : null,
          dob: golden.dob,
          countries: golden.countries,
          identifiers: golden.identifiers,
          restoredFrom: logEntry.goldenId,
          restoredAt: new Date().toISOString(),
        };
        this.entities.set(stub.id, stub);
        restored.push(stub.id);
      }
    }

    logEntry.undone = true;
    logEntry.undoneAt = new Date().toISOString();

    // Record the undo in the audit trail
    this.mergeLog.push({
      mergeId: `undo-${mergeId}`,
      goldenId: logEntry.goldenId,
      mergedEntityIds: logEntry.mergedEntityIds,
      reason: `Undo of merge ${mergeId}`,
      mergedBy: 'system',
      timestamp: new Date().toISOString(),
      undone: false,
    });

    return { restored, goldenRemoved: logEntry.goldenId };
  }

  /**
   * Get all pending merge suggestions for human review.
   * @returns {Array<object>}
   */
  getPendingSuggestions() {
    return [...this.pendingSuggestions];
  }

  /**
   * Dismiss a merge suggestion.
   * @param {string} entityAId
   * @param {string} entityBId
   * @returns {boolean}
   */
  dismissSuggestion(entityAId, entityBId) {
    const idx = this.pendingSuggestions.findIndex(
      s => (s.entityAId === entityAId && s.entityBId === entityBId) ||
           (s.entityAId === entityBId && s.entityBId === entityAId)
    );
    if (idx === -1) return false;
    this.pendingSuggestions.splice(idx, 1);
    return true;
  }

  /**
   * Get the full merge audit trail.
   * @param {object} [filter]
   * @param {string} [filter.since] - ISO timestamp
   * @param {boolean} [filter.includeUndone] - Include undone merges
   * @returns {Array<object>}
   */
  getMergeLog(filter = {}) {
    let log = [...this.mergeLog];
    if (filter.since) {
      log = log.filter(e => e.timestamp >= filter.since);
    }
    if (!filter.includeUndone) {
      log = log.filter(e => !e.undone);
    }
    return log;
  }

  /**
   * Get statistics about the entity resolver state.
   * @returns {object}
   */
  getStatistics() {
    return {
      totalEntities: this.entities.size,
      goldenRecords: this.goldenRecords.size,
      pendingSuggestions: this.pendingSuggestions.length,
      mergesPerformed: this.mergeLog.filter(e => !e.mergeId.startsWith('undo-')).length,
      mergesUndone: this.mergeLog.filter(e => e.undone).length,
      comparisons: this.stats.compared,
      autoMerged: this.stats.autoMerged,
      suggested: this.stats.suggested,
      ignored: this.stats.ignored,
    };
  }

  /**
   * Export the resolver state as a plain object for serialization.
   * @returns {object}
   */
  toJSON() {
    return {
      entities: [...this.entities.entries()],
      goldenRecords: [...this.goldenRecords.entries()],
      mergeLog: this.mergeLog,
      pendingSuggestions: this.pendingSuggestions,
      stats: this.stats,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Restore resolver state from a previously exported object.
   * @param {object} data
   */
  fromJSON(data) {
    if (!data) throw new Error('EntityResolver.fromJSON: data is required');
    this.entities = new Map(data.entities || []);
    this.goldenRecords = new Map(data.goldenRecords || []);
    this.mergeLog = data.mergeLog || [];
    this.pendingSuggestions = data.pendingSuggestions || [];
    this.stats = data.stats || { compared: 0, autoMerged: 0, suggested: 0, ignored: 0 };
  }
}
