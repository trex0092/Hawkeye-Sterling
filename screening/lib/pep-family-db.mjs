/**
 * PEP Family and Associate Database.
 *
 * Maintains a structured database of Politically Exposed Persons, their
 * family members, and close associates. Supports relationship graph
 * traversal up to two degrees of separation and screens customer names
 * against the full PEP network.
 *
 * Capabilities:
 *   - PEP records with position, country, start/end dates
 *   - Family member tracking: spouse, child, parent, sibling, in_law
 *   - Close associate tracking: business_partner, advisor, agent, nominee, secretary
 *   - Relationship graph traversal (up to 2 degrees)
 *   - Name screening against PEPs, family members, and associates
 *   - Auto-flag PEP-connected customers
 *   - PEP status decay: former PEP detection with EDD grace period
 *   - CSV import, JSON persistence
 *   - Audit trail for all additions and status changes
 *
 * References:
 *   - FATF Recommendation 12 (Politically Exposed Persons)
 *   - Cabinet Resolution 134/2025, Art. 14 (PEP obligations)
 *   - Federal Decree-Law No. 10/2025 (EDD requirements for PEPs)
 *
 * Zero external dependencies.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// -----------------------------------------------------------------------
//  Constants
// -----------------------------------------------------------------------

/** Valid family member relationship types. */
export const FAMILY_TYPES = Object.freeze([
  'spouse',
  'child',
  'parent',
  'sibling',
  'in_law',
]);

/** Valid close associate relationship types. */
export const ASSOCIATE_TYPES = Object.freeze([
  'business_partner',
  'advisor',
  'agent',
  'nominee',
  'secretary',
]);

/** PEP status values. */
export const PEP_STATUS = Object.freeze({
  ACTIVE:      'active',
  FORMER:      'former',
  DECEASED:    'deceased',
});

/**
 * Months after leaving office during which former PEPs still require
 * Enhanced Due Diligence under FATF guidance.
 */
const FORMER_PEP_EDD_MONTHS = 24;

/**
 * Months after leaving office before a person is classified as a former
 * PEP rather than an active PEP.
 */
const PEP_DECAY_MONTHS = 12;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------
//  Date utilities
// -----------------------------------------------------------------------

/**
 * Parse a YYYY-MM-DD string into a Date at midnight UTC.
 *
 * @param {string} dateStr
 * @returns {Date}
 */
function parseDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d;
}

/**
 * Format a Date as YYYY-MM-DD.
 *
 * @param {Date} d
 * @returns {string}
 */
function fmtDate(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Add calendar months to a date.
 *
 * @param {Date} d
 * @param {number} months
 * @returns {Date}
 */
function addMonths(d, months) {
  const result = new Date(d.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

// -----------------------------------------------------------------------
//  Normalisation
// -----------------------------------------------------------------------

/**
 * Normalise a name for comparison: lowercase, collapse whitespace,
 * strip diacritics, remove non-alpha characters except spaces.
 *
 * @param {string} name
 * @returns {string}
 */
function normaliseName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate a simple token-based similarity score between two names.
 * Returns a value between 0.0 and 1.0.
 *
 * @param {string} a - Normalised name
 * @param {string} b - Normalised name
 * @returns {number}
 */
function nameSimilarity(a, b) {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const tokensA = a.split(' ').filter(Boolean);
  const tokensB = b.split(' ').filter(Boolean);

  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  let matchCount = 0;
  const usedB = new Set();

  for (const ta of tokensA) {
    for (let i = 0; i < tokensB.length; i++) {
      if (usedB.has(i)) continue;
      if (ta === tokensB[i]) {
        matchCount++;
        usedB.add(i);
        break;
      }
    }
  }

  const maxTokens = Math.max(tokensA.length, tokensB.length);
  return matchCount / maxTokens;
}

// -----------------------------------------------------------------------
//  Type definitions
// -----------------------------------------------------------------------

/**
 * @typedef {object} FamilyMember
 * @property {string} id - Unique identifier
 * @property {string} name - Full name
 * @property {string} relationship - One of FAMILY_TYPES
 * @property {string} [country] - Country code
 * @property {string} [notes] - Additional notes
 */

/**
 * @typedef {object} CloseAssociate
 * @property {string} id - Unique identifier
 * @property {string} name - Full name
 * @property {string} relationship - One of ASSOCIATE_TYPES
 * @property {string} [country] - Country code
 * @property {string} [organisation] - Associated organisation
 * @property {string} [notes] - Additional notes
 */

/**
 * @typedef {object} PEPRecord
 * @property {string} id - Unique PEP identifier
 * @property {string} name - Full name
 * @property {string} position - Official position/title
 * @property {string} country - Country code
 * @property {string} start_date - Date entered office (YYYY-MM-DD)
 * @property {string|null} end_date - Date left office (YYYY-MM-DD), null if still in office
 * @property {Array<FamilyMember>} family_members
 * @property {Array<CloseAssociate>} close_associates
 * @property {string} [category] - domestic, foreign, international_org
 * @property {string} [notes]
 * @property {string} addedAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * @typedef {object} ScreeningHit
 * @property {string} matchedName - Name that matched
 * @property {string} pepId - PEP record ID
 * @property {string} pepName - PEP's name
 * @property {string} pepPosition - PEP's position
 * @property {string} pepCountry - PEP's country
 * @property {string} connectionType - 'direct_pep' | 'family_member' | 'close_associate'
 * @property {string|null} relationshipType - Specific relationship (e.g. 'spouse')
 * @property {number} similarityScore - 0.0 to 1.0
 * @property {string} pepStatus - 'active' | 'former' | 'deceased'
 * @property {boolean} requiresEDD - Whether Enhanced Due Diligence is required
 * @property {string|null} eddReason - Reason EDD is required
 * @property {number} degree - Degree of separation (0 = PEP, 1 = family/associate)
 * @property {string} screenedAt - ISO timestamp
 */

// -----------------------------------------------------------------------
//  PEPFamilyDatabase
// -----------------------------------------------------------------------

/**
 * PEP Family and Associate Database. Stores PEP records with their
 * family networks and close associates, and provides screening
 * capabilities against the full relationship graph.
 */
export class PEPFamilyDatabase {
  /**
   * @param {string} dbPath - Absolute path to the JSON persistence file
   */
  constructor(dbPath) {
    if (!dbPath || typeof dbPath !== 'string') {
      throw new Error('dbPath is required and must be a string');
    }

    /** @type {string} */
    this.dbPath = dbPath;

    /** @type {Map<string, PEPRecord>} */
    this.records = new Map();

    /** @type {Array<object>} */
    this.auditLog = [];

    /** @private */
    this._loaded = false;
  }

  // ---- Persistence ----------------------------------------------------

  /**
   * Load the database from disk.
   *
   * @returns {Promise<void>}
   */
  async load() {
    if (this._loaded) return;
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    if (existsSync(this.dbPath)) {
      try {
        const raw = JSON.parse(await readFile(this.dbPath, 'utf8'));
        for (const rec of raw.records || []) {
          this.records.set(rec.id, rec);
        }
        this.auditLog = raw.auditLog || [];
      } catch (err) {
        throw new Error(`Failed to load PEP database: ${err.message}`);
      }
    }
    this._loaded = true;
  }

  /**
   * Persist the database to disk.
   *
   * @returns {Promise<void>}
   */
  async save() {
    const data = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      recordCount: this.records.size,
      records: [...this.records.values()],
      auditLog: this.auditLog,
    };
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.dbPath, JSON.stringify(data, null, 2), 'utf8');
  }

  // ---- PEP record management ------------------------------------------

  /**
   * Add a PEP record to the database.
   *
   * @param {object} params
   * @param {string} params.name - Full name
   * @param {string} params.position - Official position
   * @param {string} params.country - Country code
   * @param {string} params.start_date - YYYY-MM-DD
   * @param {string|null} [params.end_date] - YYYY-MM-DD or null
   * @param {Array<FamilyMember>} [params.family_members]
   * @param {Array<CloseAssociate>} [params.close_associates]
   * @param {string} [params.category] - domestic | foreign | international_org
   * @param {string} [params.notes]
   * @param {string} [params.id] - Explicit ID (auto-generated if omitted)
   * @returns {Promise<PEPRecord>}
   */
  async addPEP(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.name || typeof params.name !== 'string') {
      throw new Error('params.name is required');
    }
    if (!params.position || typeof params.position !== 'string') {
      throw new Error('params.position is required');
    }
    if (!params.country || typeof params.country !== 'string') {
      throw new Error('params.country is required');
    }
    if (!params.start_date || typeof params.start_date !== 'string') {
      throw new Error('params.start_date is required (YYYY-MM-DD)');
    }

    parseDate(params.start_date);
    if (params.end_date) {
      parseDate(params.end_date);
    }

    // Validate family members
    const familyMembers = (params.family_members || []).map(fm => {
      if (!fm.name || typeof fm.name !== 'string') {
        throw new Error('Each family member must have a name');
      }
      if (!FAMILY_TYPES.includes(fm.relationship)) {
        throw new Error(`Invalid family relationship: ${fm.relationship}. Valid: ${FAMILY_TYPES.join(', ')}`);
      }
      return {
        id: fm.id || `FM-${randomUUID().slice(0, 12)}`,
        name: fm.name,
        relationship: fm.relationship,
        country: fm.country || params.country,
        notes: fm.notes || '',
      };
    });

    // Validate close associates
    const closeAssociates = (params.close_associates || []).map(ca => {
      if (!ca.name || typeof ca.name !== 'string') {
        throw new Error('Each close associate must have a name');
      }
      if (!ASSOCIATE_TYPES.includes(ca.relationship)) {
        throw new Error(`Invalid associate relationship: ${ca.relationship}. Valid: ${ASSOCIATE_TYPES.join(', ')}`);
      }
      return {
        id: ca.id || `CA-${randomUUID().slice(0, 12)}`,
        name: ca.name,
        relationship: ca.relationship,
        country: ca.country || '',
        organisation: ca.organisation || '',
        notes: ca.notes || '',
      };
    });

    const id = params.id || `PEP-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    /** @type {PEPRecord} */
    const record = {
      id,
      name: params.name,
      position: params.position,
      country: params.country,
      start_date: params.start_date,
      end_date: params.end_date || null,
      family_members: familyMembers,
      close_associates: closeAssociates,
      category: params.category || 'foreign',
      notes: params.notes || '',
      addedAt: now,
      updatedAt: now,
    };

    this.records.set(id, record);

    this.auditLog.push({
      action: 'pep_added',
      pepId: id,
      pepName: record.name,
      timestamp: now,
    });

    await this.save();
    return record;
  }

  /**
   * Update an existing PEP record.
   *
   * @param {string} pepId
   * @param {object} updates - Fields to update
   * @returns {Promise<PEPRecord>}
   */
  async updatePEP(pepId, updates) {
    await this.load();

    const record = this.records.get(pepId);
    if (!record) {
      throw new Error(`PEP record not found: ${pepId}`);
    }

    const allowed = [
      'name', 'position', 'country', 'start_date', 'end_date',
      'category', 'notes',
    ];

    for (const key of Object.keys(updates)) {
      if (allowed.includes(key)) {
        if ((key === 'start_date' || key === 'end_date') && updates[key] !== null) {
          parseDate(updates[key]);
        }
        record[key] = updates[key];
      }
    }

    record.updatedAt = new Date().toISOString();

    this.auditLog.push({
      action: 'pep_updated',
      pepId,
      fields: Object.keys(updates).filter(k => allowed.includes(k)),
      timestamp: record.updatedAt,
    });

    await this.save();
    return record;
  }

  /**
   * Add a family member to a PEP record.
   *
   * @param {string} pepId
   * @param {FamilyMember} familyMember
   * @returns {Promise<FamilyMember>}
   */
  async addFamilyMember(pepId, familyMember) {
    await this.load();

    const record = this.records.get(pepId);
    if (!record) {
      throw new Error(`PEP record not found: ${pepId}`);
    }
    if (!familyMember.name || typeof familyMember.name !== 'string') {
      throw new Error('Family member must have a name');
    }
    if (!FAMILY_TYPES.includes(familyMember.relationship)) {
      throw new Error(`Invalid family relationship: ${familyMember.relationship}`);
    }

    const fm = {
      id: familyMember.id || `FM-${randomUUID().slice(0, 12)}`,
      name: familyMember.name,
      relationship: familyMember.relationship,
      country: familyMember.country || record.country,
      notes: familyMember.notes || '',
    };

    record.family_members.push(fm);
    record.updatedAt = new Date().toISOString();

    this.auditLog.push({
      action: 'family_member_added',
      pepId,
      memberId: fm.id,
      memberName: fm.name,
      relationship: fm.relationship,
      timestamp: record.updatedAt,
    });

    await this.save();
    return fm;
  }

  /**
   * Add a close associate to a PEP record.
   *
   * @param {string} pepId
   * @param {CloseAssociate} associate
   * @returns {Promise<CloseAssociate>}
   */
  async addCloseAssociate(pepId, associate) {
    await this.load();

    const record = this.records.get(pepId);
    if (!record) {
      throw new Error(`PEP record not found: ${pepId}`);
    }
    if (!associate.name || typeof associate.name !== 'string') {
      throw new Error('Close associate must have a name');
    }
    if (!ASSOCIATE_TYPES.includes(associate.relationship)) {
      throw new Error(`Invalid associate relationship: ${associate.relationship}`);
    }

    const ca = {
      id: associate.id || `CA-${randomUUID().slice(0, 12)}`,
      name: associate.name,
      relationship: associate.relationship,
      country: associate.country || '',
      organisation: associate.organisation || '',
      notes: associate.notes || '',
    };

    record.close_associates.push(ca);
    record.updatedAt = new Date().toISOString();

    this.auditLog.push({
      action: 'associate_added',
      pepId,
      associateId: ca.id,
      associateName: ca.name,
      relationship: ca.relationship,
      timestamp: record.updatedAt,
    });

    await this.save();
    return ca;
  }

  /**
   * Retrieve a PEP record by ID.
   *
   * @param {string} pepId
   * @returns {PEPRecord|null}
   */
  getPEP(pepId) {
    return this.records.get(pepId) || null;
  }

  /**
   * List all PEP records, optionally filtered.
   *
   * @param {object} [filters]
   * @param {string} [filters.country] - Filter by country code
   * @param {string} [filters.status] - Filter by PEP status (active, former, deceased)
   * @param {string} [filters.category] - Filter by category
   * @param {Date} [filters.asOf] - Reference date for status calculation
   * @returns {Promise<Array<PEPRecord & { computedStatus: string }>>}
   */
  async listPEPs(filters = {}) {
    await this.load();

    const asOf = filters.asOf || new Date();
    let results = [...this.records.values()];

    if (filters.country) {
      const cc = filters.country.toUpperCase();
      results = results.filter(r => r.country.toUpperCase() === cc);
    }

    if (filters.category) {
      results = results.filter(r => r.category === filters.category);
    }

    const enriched = results.map(r => ({
      ...r,
      computedStatus: this._computeStatus(r, asOf),
    }));

    if (filters.status) {
      return enriched.filter(r => r.computedStatus === filters.status);
    }

    return enriched;
  }

  // ---- PEP status decay -----------------------------------------------

  /**
   * Compute the current PEP status based on end_date and decay rules.
   * If the person left office more than PEP_DECAY_MONTHS ago, they
   * are classified as a former PEP. Former PEPs still require EDD
   * for up to FORMER_PEP_EDD_MONTHS after leaving office per FATF.
   *
   * @param {PEPRecord} record
   * @param {Date} [asOf] - Reference date
   * @returns {string} - 'active' | 'former' | 'deceased'
   */
  _computeStatus(record, asOf = new Date()) {
    if (record.end_date === 'deceased') return PEP_STATUS.DECEASED;
    if (record.end_date === null) return PEP_STATUS.ACTIVE;

    const endDate = parseDate(record.end_date);
    const decayThreshold = addMonths(endDate, PEP_DECAY_MONTHS);

    if (asOf.getTime() > decayThreshold.getTime()) {
      return PEP_STATUS.FORMER;
    }

    return PEP_STATUS.ACTIVE;
  }

  /**
   * Determine whether a PEP still requires Enhanced Due Diligence.
   * Active PEPs always require EDD. Former PEPs require EDD for
   * up to FORMER_PEP_EDD_MONTHS (24 months) after leaving office,
   * per FATF Recommendation 12.
   *
   * @param {PEPRecord} record
   * @param {Date} [asOf] - Reference date
   * @returns {{ required: boolean, reason: string|null, expiresAt: string|null }}
   */
  _eddRequirement(record, asOf = new Date()) {
    const status = this._computeStatus(record, asOf);

    if (status === PEP_STATUS.ACTIVE) {
      return {
        required: true,
        reason: 'Active PEP: EDD mandatory under FATF Rec.12 and Cabinet Resolution 134/2025 Art.14',
        expiresAt: null,
      };
    }

    if (status === PEP_STATUS.FORMER && record.end_date !== null && record.end_date !== 'deceased') {
      const endDate = parseDate(record.end_date);
      const eddExpiry = addMonths(endDate, FORMER_PEP_EDD_MONTHS);

      if (asOf.getTime() <= eddExpiry.getTime()) {
        return {
          required: true,
          reason: `Former PEP (left office ${record.end_date}): EDD required for ${FORMER_PEP_EDD_MONTHS} months post-office per FATF`,
          expiresAt: fmtDate(eddExpiry),
        };
      }
    }

    return {
      required: false,
      reason: null,
      expiresAt: null,
    };
  }

  // ---- Relationship graph traversal -----------------------------------

  /**
   * Get the full relationship graph for a PEP, including family members
   * and close associates up to 2 degrees of separation.
   *
   * Degree 0: the PEP
   * Degree 1: family members and close associates of the PEP
   * Degree 2: other PEPs linked through shared family or associates
   *
   * @param {string} pepId
   * @param {Date} [asOf] - Reference date for status calculation
   * @returns {Promise<object>}
   */
  async getRelationshipGraph(pepId, asOf = new Date()) {
    await this.load();

    const record = this.records.get(pepId);
    if (!record) {
      throw new Error(`PEP record not found: ${pepId}`);
    }

    const status = this._computeStatus(record, asOf);
    const edd = this._eddRequirement(record, asOf);

    const nodes = [];
    const edges = [];

    // Degree 0: the PEP
    nodes.push({
      id: record.id,
      name: record.name,
      type: 'pep',
      degree: 0,
      status,
      position: record.position,
      country: record.country,
      requiresEDD: edd.required,
    });

    // Degree 1: family members
    for (const fm of record.family_members) {
      nodes.push({
        id: fm.id,
        name: fm.name,
        type: 'family_member',
        degree: 1,
        relationship: fm.relationship,
        country: fm.country,
        linkedPepId: record.id,
        requiresEDD: edd.required,
      });
      edges.push({
        from: record.id,
        to: fm.id,
        relationship: fm.relationship,
        type: 'family',
      });
    }

    // Degree 1: close associates
    for (const ca of record.close_associates) {
      nodes.push({
        id: ca.id,
        name: ca.name,
        type: 'close_associate',
        degree: 1,
        relationship: ca.relationship,
        country: ca.country,
        organisation: ca.organisation,
        linkedPepId: record.id,
        requiresEDD: edd.required,
      });
      edges.push({
        from: record.id,
        to: ca.id,
        relationship: ca.relationship,
        type: 'associate',
      });
    }

    // Degree 2: other PEPs that share family members or associates by name
    const degree1Names = new Set();
    for (const fm of record.family_members) {
      degree1Names.add(normaliseName(fm.name));
    }
    for (const ca of record.close_associates) {
      degree1Names.add(normaliseName(ca.name));
    }

    for (const [otherId, otherPep] of this.records) {
      if (otherId === pepId) continue;

      let linked = false;
      let linkReason = '';

      for (const fm of otherPep.family_members) {
        if (degree1Names.has(normaliseName(fm.name))) {
          linked = true;
          linkReason = `Shared family member: ${fm.name}`;
          break;
        }
      }

      if (!linked) {
        for (const ca of otherPep.close_associates) {
          if (degree1Names.has(normaliseName(ca.name))) {
            linked = true;
            linkReason = `Shared close associate: ${ca.name}`;
            break;
          }
        }
      }

      if (linked) {
        const otherStatus = this._computeStatus(otherPep, asOf);
        nodes.push({
          id: otherPep.id,
          name: otherPep.name,
          type: 'pep',
          degree: 2,
          status: otherStatus,
          position: otherPep.position,
          country: otherPep.country,
          linkReason,
        });
        edges.push({
          from: record.id,
          to: otherPep.id,
          relationship: linkReason,
          type: 'degree_2_pep',
        });
      }
    }

    return {
      pepId: record.id,
      pepName: record.name,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodes,
      edges,
      generatedAt: new Date().toISOString(),
    };
  }

  // ---- Screening ------------------------------------------------------

  /**
   * Screen a customer name against the entire PEP network: PEPs,
   * family members, and close associates. Returns all hits above
   * the given similarity threshold.
   *
   * @param {string} name - Customer name to screen
   * @param {object} [opts]
   * @param {number} [opts.threshold] - Minimum similarity score (default 0.75)
   * @param {Date} [opts.asOf] - Reference date for PEP status
   * @returns {Promise<Array<ScreeningHit>>}
   */
  async screen(name, opts = {}) {
    await this.load();

    const threshold = opts.threshold !== undefined ? opts.threshold : 0.75;
    const asOf = opts.asOf || new Date();
    const normalised = normaliseName(name);

    if (normalised.length === 0) {
      return [];
    }

    /** @type {Array<ScreeningHit>} */
    const hits = [];
    const now = new Date().toISOString();

    for (const [, record] of this.records) {
      const status = this._computeStatus(record, asOf);
      const edd = this._eddRequirement(record, asOf);

      // Check against PEP name
      const pepScore = nameSimilarity(normalised, normaliseName(record.name));
      if (pepScore >= threshold) {
        hits.push({
          matchedName: record.name,
          pepId: record.id,
          pepName: record.name,
          pepPosition: record.position,
          pepCountry: record.country,
          connectionType: 'direct_pep',
          relationshipType: null,
          similarityScore: Math.round(pepScore * 10000) / 10000,
          pepStatus: status,
          requiresEDD: edd.required,
          eddReason: edd.reason,
          degree: 0,
          screenedAt: now,
        });
      }

      // Check against family members
      for (const fm of record.family_members) {
        const fmScore = nameSimilarity(normalised, normaliseName(fm.name));
        if (fmScore >= threshold) {
          hits.push({
            matchedName: fm.name,
            pepId: record.id,
            pepName: record.name,
            pepPosition: record.position,
            pepCountry: record.country,
            connectionType: 'family_member',
            relationshipType: fm.relationship,
            similarityScore: Math.round(fmScore * 10000) / 10000,
            pepStatus: status,
            requiresEDD: edd.required,
            eddReason: edd.required
              ? `PEP-connected (${fm.relationship} of ${record.name}): EDD required`
              : null,
            degree: 1,
            screenedAt: now,
          });
        }
      }

      // Check against close associates
      for (const ca of record.close_associates) {
        const caScore = nameSimilarity(normalised, normaliseName(ca.name));
        if (caScore >= threshold) {
          hits.push({
            matchedName: ca.name,
            pepId: record.id,
            pepName: record.name,
            pepPosition: record.position,
            pepCountry: record.country,
            connectionType: 'close_associate',
            relationshipType: ca.relationship,
            similarityScore: Math.round(caScore * 10000) / 10000,
            pepStatus: status,
            requiresEDD: edd.required,
            eddReason: edd.required
              ? `PEP-connected (${ca.relationship} of ${record.name}): EDD required`
              : null,
            degree: 1,
            screenedAt: now,
          });
        }
      }
    }

    // Sort by similarity score descending
    hits.sort((a, b) => b.similarityScore - a.similarityScore);

    return hits;
  }

  /**
   * Batch-screen multiple names. Returns a map of name to hits.
   *
   * @param {Array<string>} names
   * @param {object} [opts] - Same options as screen()
   * @returns {Promise<Map<string, Array<ScreeningHit>>>}
   */
  async batchScreen(names, opts = {}) {
    const results = new Map();
    for (const name of names) {
      const hits = await this.screen(name, opts);
      results.set(name, hits);
    }
    return results;
  }

  // ---- CSV import -----------------------------------------------------

  /**
   * Import PEP records from a CSV string.
   *
   * Expected columns: name, position, country, start_date, end_date,
   * category, family_names, family_relationships,
   * associate_names, associate_relationships
   *
   * Family and associate columns are pipe-delimited within each cell.
   *
   * @param {string} csvString
   * @returns {Promise<{ imported: number, errors: Array<{ row: number, error: string }> }>}
   */
  async importFromCSV(csvString) {
    const lines = csvString.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return { imported: 0, errors: [{ row: 0, error: 'CSV must have a header row and at least one data row' }] };
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

    const colIdx = {
      name: headers.indexOf('name'),
      position: headers.indexOf('position'),
      country: headers.indexOf('country'),
      start_date: headers.indexOf('start_date'),
      end_date: headers.indexOf('end_date'),
      category: headers.indexOf('category'),
      family_names: headers.indexOf('family_names'),
      family_relationships: headers.indexOf('family_relationships'),
      associate_names: headers.indexOf('associate_names'),
      associate_relationships: headers.indexOf('associate_relationships'),
    };

    if (colIdx.name < 0) {
      return { imported: 0, errors: [{ row: 0, error: 'CSV must have a "name" column' }] };
    }
    if (colIdx.position < 0) {
      return { imported: 0, errors: [{ row: 0, error: 'CSV must have a "position" column' }] };
    }
    if (colIdx.country < 0) {
      return { imported: 0, errors: [{ row: 0, error: 'CSV must have a "country" column' }] };
    }

    let imported = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = _parseCSVLine(lines[i]);
      const row = i + 1;

      try {
        const name = (cols[colIdx.name] || '').trim();
        const position = (cols[colIdx.position] || '').trim();
        const country = (cols[colIdx.country] || '').trim();
        const start_date = colIdx.start_date >= 0 ? (cols[colIdx.start_date] || '').trim() : '';
        const end_date = colIdx.end_date >= 0 ? (cols[colIdx.end_date] || '').trim() || null : null;
        const category = colIdx.category >= 0 ? (cols[colIdx.category] || 'foreign').trim() : 'foreign';

        if (!name || !position || !country || !start_date) {
          errors.push({ row, error: 'Missing required field (name, position, country, or start_date)' });
          continue;
        }

        // Parse pipe-delimited family members
        const familyNames = colIdx.family_names >= 0
          ? (cols[colIdx.family_names] || '').split('|').map(s => s.trim()).filter(Boolean)
          : [];
        const familyRels = colIdx.family_relationships >= 0
          ? (cols[colIdx.family_relationships] || '').split('|').map(s => s.trim()).filter(Boolean)
          : [];

        const family_members = [];
        for (let f = 0; f < familyNames.length; f++) {
          const rel = familyRels[f] || 'spouse';
          if (FAMILY_TYPES.includes(rel)) {
            family_members.push({ name: familyNames[f], relationship: rel });
          } else {
            errors.push({ row, error: `Invalid family relationship "${rel}" for ${familyNames[f]}` });
          }
        }

        // Parse pipe-delimited associates
        const assocNames = colIdx.associate_names >= 0
          ? (cols[colIdx.associate_names] || '').split('|').map(s => s.trim()).filter(Boolean)
          : [];
        const assocRels = colIdx.associate_relationships >= 0
          ? (cols[colIdx.associate_relationships] || '').split('|').map(s => s.trim()).filter(Boolean)
          : [];

        const close_associates = [];
        for (let a = 0; a < assocNames.length; a++) {
          const rel = assocRels[a] || 'business_partner';
          if (ASSOCIATE_TYPES.includes(rel)) {
            close_associates.push({ name: assocNames[a], relationship: rel });
          } else {
            errors.push({ row, error: `Invalid associate relationship "${rel}" for ${assocNames[a]}` });
          }
        }

        await this.addPEP({
          name,
          position,
          country,
          start_date,
          end_date,
          category,
          family_members,
          close_associates,
        });

        imported++;
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    }

    return { imported, errors };
  }

  // ---- Statistics -----------------------------------------------------

  /**
   * Compute database statistics.
   *
   * @param {Date} [asOf] - Reference date
   * @returns {Promise<object>}
   */
  async statistics(asOf = new Date()) {
    await this.load();

    const records = [...this.records.values()];
    let activePEPs = 0;
    let formerPEPs = 0;
    let deceasedPEPs = 0;
    let totalFamilyMembers = 0;
    let totalAssociates = 0;
    const countryCounts = {};

    for (const rec of records) {
      const status = this._computeStatus(rec, asOf);
      if (status === PEP_STATUS.ACTIVE) activePEPs++;
      else if (status === PEP_STATUS.FORMER) formerPEPs++;
      else if (status === PEP_STATUS.DECEASED) deceasedPEPs++;

      totalFamilyMembers += rec.family_members.length;
      totalAssociates += rec.close_associates.length;

      const cc = rec.country.toUpperCase();
      countryCounts[cc] = (countryCounts[cc] || 0) + 1;
    }

    return {
      totalPEPs: records.length,
      activePEPs,
      formerPEPs,
      deceasedPEPs,
      totalFamilyMembers,
      totalAssociates,
      totalNetworkSize: records.length + totalFamilyMembers + totalAssociates,
      countryCounts,
      auditLogEntries: this.auditLog.length,
      asOf: fmtDate(asOf),
    };
  }
}

// -----------------------------------------------------------------------
//  CSV line parser (handles quoted fields)
// -----------------------------------------------------------------------

/**
 * Parse a single CSV line, respecting quoted fields.
 *
 * @param {string} line
 * @returns {Array<string>}
 */
function _parseCSVLine(line) {
  const cols = [];
  let current = '';
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cols.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}
