/**
 * Free Zone Interaction Risk Tracker.
 *
 * Maintains risk profiles for UAE free zones, tracks counterparty
 * free zone registrations, and detects red flags related to
 * free zone transshipment, multiple registrations by the same UBO,
 * and gaps in regulatory oversight.
 *
 * Capabilities:
 *   - Pre-configured risk profiles for major UAE free zones (DMCC, DIFC,
 *     JAFZA, RAK FTZ, SAIF Zone, and others)
 *   - Free zone risk factors: regulatory framework quality, AML supervision
 *     level, beneficial ownership transparency, sanctions screening requirements
 *   - Counterparty free zone registration tracking
 *   - Cross-border transshipment risk detection
 *   - Red flags: multiple free zone registrations by same UBO, rapid
 *     registration and trading, no physical office
 *   - Free zone compliance requirement matrix
 *   - Risk scoring per free zone (1-10)
 *
 * References:
 *   - Federal Decree-Law No. 10/2025 (AML/CFT obligations for DNFBPs)
 *   - MoE DPMS Guidance (regulatory expectations for DPMS free zone operations)
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

/** Free zone risk factor categories. */
export const RISK_FACTOR_CATEGORIES = Object.freeze({
  REGULATORY_FRAMEWORK:        'regulatory_framework',
  AML_SUPERVISION:             'aml_supervision',
  BO_TRANSPARENCY:             'beneficial_ownership_transparency',
  SANCTIONS_SCREENING:         'sanctions_screening_requirements',
  PHYSICAL_PRESENCE:           'physical_presence_requirements',
  CUSTOMS_CONTROLS:            'customs_controls',
});

/** Red flag identifiers for free zone interactions. */
export const FREE_ZONE_RED_FLAGS = Object.freeze({
  MULTIPLE_REGISTRATIONS_SAME_UBO:  'multiple_fz_registrations_same_ubo',
  RAPID_REGISTRATION_AND_TRADING:   'rapid_registration_and_trading',
  NO_PHYSICAL_OFFICE:               'no_physical_office',
  CROSS_BORDER_TRANSSHIPMENT:       'cross_border_transshipment',
  SHELL_COMPANY_INDICATORS:         'shell_company_indicators',
  OPAQUE_OWNERSHIP:                 'opaque_ownership_structure',
  MINIMAL_OPERATIONS:               'minimal_operational_activity',
  HIGH_VALUE_IMMEDIATE_TRADING:     'high_value_immediate_trading',
  FREQUENT_JURISDICTION_CHANGES:    'frequent_jurisdiction_changes',
});

/** Compliance requirement types. */
export const COMPLIANCE_REQUIREMENTS = Object.freeze({
  CDD_ON_REGISTRATION:     'cdd_on_registration',
  UBO_DISCLOSURE:          'ubo_disclosure',
  ANNUAL_AUDIT:            'annual_audit',
  AML_PROGRAMME:           'aml_programme',
  SANCTIONS_SCREENING:     'sanctions_screening',
  STR_FILING:              'str_filing',
  RECORD_KEEPING:          'record_keeping',
  PHYSICAL_OFFICE:         'physical_office',
  LOCAL_AGENT:             'local_agent',
  SUBSTANCE_REQUIREMENTS:  'substance_requirements',
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------
//  Type definitions
// -----------------------------------------------------------------------

/**
 * @typedef {object} FreeZoneProfile
 * @property {string} id - Unique free zone identifier
 * @property {string} code - Short code (e.g. DMCC, DIFC)
 * @property {string} name - Full name
 * @property {string} emirate - Emirate where the free zone is located
 * @property {string} regulator - Regulatory authority
 * @property {object} riskFactors - Risk factor scores (1-5 each)
 * @property {number} overallRiskScore - Computed overall score (1-10)
 * @property {string} riskLevel - low | medium | high
 * @property {Array<string>} complianceRequirements - Required compliance items
 * @property {string} [notes]
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * @typedef {object} CounterpartyRegistration
 * @property {string} id - Registration record identifier
 * @property {string} entityId - Counterparty entity identifier
 * @property {string} entityName - Counterparty name
 * @property {string} freeZoneId - Free zone ID
 * @property {string} freeZoneCode - Free zone code
 * @property {string} licenceNumber - Free zone licence number
 * @property {string} registrationDate - YYYY-MM-DD
 * @property {string|null} uboName - Ultimate Beneficial Owner name
 * @property {string|null} uboId - UBO identifier
 * @property {boolean} hasPhysicalOffice - Whether the entity has a physical office
 * @property {string} [activityDescription] - Business activity
 * @property {boolean} active - Whether the registration is active
 * @property {Array<string>} redFlags - Detected red flags
 * @property {string} addedAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * @typedef {object} TransshipmentRecord
 * @property {string} id - Record identifier
 * @property {string} entityId - Counterparty
 * @property {string} originFreeZoneId - Origin free zone
 * @property {string} destinationFreeZoneId - Destination free zone
 * @property {string} goodsDescription - Description of goods
 * @property {number} valueAED - Value in AED
 * @property {string} date - YYYY-MM-DD
 * @property {boolean} enteredMainlandCustoms - Did goods enter mainland?
 * @property {Array<string>} redFlags
 * @property {string} recordedAt - ISO timestamp
 */

// -----------------------------------------------------------------------
//  Pre-configured free zone profiles
// -----------------------------------------------------------------------

/**
 * Built-in UAE free zone profiles with risk assessments. These are
 * baseline profiles that should be reviewed and updated by the MLRO.
 *
 * Risk factor scores are on a 1-5 scale:
 *   1 = strong controls, low risk
 *   5 = weak controls, high risk
 */
const DEFAULT_FREE_ZONE_PROFILES = [
  {
    code: 'DMCC',
    name: 'Dubai Multi Commodities Centre',
    emirate: 'Dubai',
    regulator: 'DMCC Authority',
    riskFactors: {
      regulatory_framework: 2,
      aml_supervision: 2,
      beneficial_ownership_transparency: 2,
      sanctions_screening_requirements: 2,
      physical_presence_requirements: 2,
      customs_controls: 2,
    },
    complianceRequirements: [
      'cdd_on_registration', 'ubo_disclosure', 'annual_audit',
      'aml_programme', 'sanctions_screening', 'str_filing',
      'record_keeping', 'physical_office', 'substance_requirements',
    ],
    notes: 'Primary free zone for precious metals and commodities trading. Subject to DMCC-specific AML rules. DPMS entities registered with DMCC are subject to additional regulatory oversight.',
  },
  {
    code: 'DIFC',
    name: 'Dubai International Financial Centre',
    emirate: 'Dubai',
    regulator: 'DFSA (Dubai Financial Services Authority)',
    riskFactors: {
      regulatory_framework: 1,
      aml_supervision: 1,
      beneficial_ownership_transparency: 1,
      sanctions_screening_requirements: 1,
      physical_presence_requirements: 2,
      customs_controls: 1,
    },
    complianceRequirements: [
      'cdd_on_registration', 'ubo_disclosure', 'annual_audit',
      'aml_programme', 'sanctions_screening', 'str_filing',
      'record_keeping', 'physical_office', 'substance_requirements',
    ],
    notes: 'Financial free zone with strong DFSA supervision. Highest regulatory standards among UAE free zones.',
  },
  {
    code: 'JAFZA',
    name: 'Jebel Ali Free Zone',
    emirate: 'Dubai',
    regulator: 'JAFZA Authority',
    riskFactors: {
      regulatory_framework: 2,
      aml_supervision: 3,
      beneficial_ownership_transparency: 3,
      sanctions_screening_requirements: 2,
      physical_presence_requirements: 3,
      customs_controls: 2,
    },
    complianceRequirements: [
      'cdd_on_registration', 'ubo_disclosure', 'annual_audit',
      'aml_programme', 'sanctions_screening', 'record_keeping',
      'physical_office',
    ],
    notes: 'Large industrial and trading free zone. High volume of precious metals transshipment.',
  },
  {
    code: 'RAK_FTZ',
    name: 'Ras Al Khaimah Free Trade Zone',
    emirate: 'Ras Al Khaimah',
    regulator: 'RAK FTZ Authority',
    riskFactors: {
      regulatory_framework: 3,
      aml_supervision: 3,
      beneficial_ownership_transparency: 4,
      sanctions_screening_requirements: 3,
      physical_presence_requirements: 4,
      customs_controls: 3,
    },
    complianceRequirements: [
      'cdd_on_registration', 'ubo_disclosure', 'annual_audit',
      'aml_programme', 'record_keeping',
    ],
    notes: 'Cost-effective registration. Lower physical presence requirements warrant additional scrutiny.',
  },
  {
    code: 'SAIF',
    name: 'Sharjah Airport International Free Zone',
    emirate: 'Sharjah',
    regulator: 'SAIF Zone Authority',
    riskFactors: {
      regulatory_framework: 3,
      aml_supervision: 3,
      beneficial_ownership_transparency: 3,
      sanctions_screening_requirements: 3,
      physical_presence_requirements: 3,
      customs_controls: 3,
    },
    complianceRequirements: [
      'cdd_on_registration', 'ubo_disclosure', 'annual_audit',
      'aml_programme', 'record_keeping', 'physical_office',
    ],
    notes: 'Mid-tier free zone with standard regulatory framework.',
  },
  {
    code: 'AFZA',
    name: 'Ajman Free Zone',
    emirate: 'Ajman',
    regulator: 'Ajman Free Zone Authority',
    riskFactors: {
      regulatory_framework: 3,
      aml_supervision: 4,
      beneficial_ownership_transparency: 4,
      sanctions_screening_requirements: 3,
      physical_presence_requirements: 4,
      customs_controls: 3,
    },
    complianceRequirements: [
      'cdd_on_registration', 'ubo_disclosure', 'annual_audit',
      'record_keeping',
    ],
    notes: 'Smaller free zone. Lower physical presence and BO transparency requirements increase risk.',
  },
  {
    code: 'IFZA',
    name: 'International Free Zone Authority',
    emirate: 'Dubai',
    regulator: 'IFZA',
    riskFactors: {
      regulatory_framework: 3,
      aml_supervision: 3,
      beneficial_ownership_transparency: 3,
      sanctions_screening_requirements: 3,
      physical_presence_requirements: 4,
      customs_controls: 3,
    },
    complianceRequirements: [
      'cdd_on_registration', 'ubo_disclosure', 'annual_audit',
      'aml_programme', 'record_keeping',
    ],
    notes: 'Newer free zone. Physical presence requirements may be less stringent.',
  },
  {
    code: 'ADGM',
    name: 'Abu Dhabi Global Market',
    emirate: 'Abu Dhabi',
    regulator: 'FSRA (Financial Services Regulatory Authority)',
    riskFactors: {
      regulatory_framework: 1,
      aml_supervision: 1,
      beneficial_ownership_transparency: 1,
      sanctions_screening_requirements: 1,
      physical_presence_requirements: 2,
      customs_controls: 1,
    },
    complianceRequirements: [
      'cdd_on_registration', 'ubo_disclosure', 'annual_audit',
      'aml_programme', 'sanctions_screening', 'str_filing',
      'record_keeping', 'physical_office', 'substance_requirements',
    ],
    notes: 'Financial free zone with strong FSRA supervision. Comparable to DIFC in regulatory quality.',
  },
];

// -----------------------------------------------------------------------
//  FreeZoneRiskTracker
// -----------------------------------------------------------------------

/**
 * Free zone interaction risk tracker. Manages free zone profiles,
 * counterparty registrations, and transshipment records while
 * detecting red flags and generating compliance assessments.
 */
export class FreeZoneRiskTracker {
  /**
   * @param {string} storePath - Absolute path to the JSON persistence file
   */
  constructor(storePath) {
    if (!storePath || typeof storePath !== 'string') {
      throw new Error('storePath is required and must be a string');
    }

    /** @type {string} */
    this.storePath = storePath;

    /** @type {Map<string, FreeZoneProfile>} */
    this.freeZones = new Map();

    /** @type {Map<string, CounterpartyRegistration>} */
    this.registrations = new Map();

    /** @type {Array<TransshipmentRecord>} */
    this.transshipments = [];

    /** @private */
    this._loaded = false;
  }

  // ---- Persistence ----------------------------------------------------

  /**
   * Load state from disk.
   *
   * @returns {Promise<void>}
   */
  async load() {
    if (this._loaded) return;
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    if (existsSync(this.storePath)) {
      try {
        const raw = JSON.parse(await readFile(this.storePath, 'utf8'));
        for (const fz of raw.freeZones || []) {
          this.freeZones.set(fz.id, fz);
        }
        for (const reg of raw.registrations || []) {
          this.registrations.set(reg.id, reg);
        }
        this.transshipments = raw.transshipments || [];
      } catch (err) {
        throw new Error(`Failed to load free zone risk state: ${err.message}`);
      }
    }
    this._loaded = true;
  }

  /**
   * Persist state to disk.
   *
   * @returns {Promise<void>}
   */
  async save() {
    const data = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      freeZoneCount: this.freeZones.size,
      registrationCount: this.registrations.size,
      transshipmentCount: this.transshipments.length,
      freeZones: [...this.freeZones.values()],
      registrations: [...this.registrations.values()],
      transshipments: this.transshipments,
    };
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.storePath, JSON.stringify(data, null, 2), 'utf8');
  }

  // ---- Free zone profile management -----------------------------------

  /**
   * Load the default free zone profiles. Existing profiles with the
   * same code are not overwritten.
   *
   * @returns {Promise<number>} Number of profiles loaded
   */
  async loadDefaults() {
    await this.load();

    let loaded = 0;
    const now = new Date().toISOString();

    for (const def of DEFAULT_FREE_ZONE_PROFILES) {
      // Check if already exists by code
      const existing = [...this.freeZones.values()].find(fz => fz.code === def.code);
      if (existing) continue;

      const id = `FZ-${def.code}`;
      const overallScore = this._computeFreeZoneScore(def.riskFactors);

      /** @type {FreeZoneProfile} */
      const profile = {
        id,
        code: def.code,
        name: def.name,
        emirate: def.emirate,
        regulator: def.regulator,
        riskFactors: def.riskFactors,
        overallRiskScore: overallScore.score,
        riskLevel: overallScore.level,
        complianceRequirements: def.complianceRequirements,
        notes: def.notes,
        updatedAt: now,
      };

      this.freeZones.set(id, profile);
      loaded++;
    }

    if (loaded > 0) await this.save();
    return loaded;
  }

  /**
   * Add or update a custom free zone profile.
   *
   * @param {object} params
   * @param {string} params.code - Short code
   * @param {string} params.name - Full name
   * @param {string} params.emirate - Emirate
   * @param {string} params.regulator - Regulatory authority
   * @param {object} params.riskFactors - Risk factor scores (1-5 each)
   * @param {Array<string>} [params.complianceRequirements]
   * @param {string} [params.notes]
   * @returns {Promise<FreeZoneProfile>}
   */
  async addFreeZone(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.code || typeof params.code !== 'string') {
      throw new Error('params.code is required');
    }
    if (!params.name || typeof params.name !== 'string') {
      throw new Error('params.name is required');
    }
    if (!params.emirate || typeof params.emirate !== 'string') {
      throw new Error('params.emirate is required');
    }
    if (!params.regulator || typeof params.regulator !== 'string') {
      throw new Error('params.regulator is required');
    }
    if (!params.riskFactors || typeof params.riskFactors !== 'object') {
      throw new Error('params.riskFactors is required');
    }

    // Validate risk factor values
    const validFactors = Object.values(RISK_FACTOR_CATEGORIES);
    for (const [key, value] of Object.entries(params.riskFactors)) {
      if (!validFactors.includes(key)) {
        throw new Error(`Invalid risk factor: ${key}. Valid: ${validFactors.join(', ')}`);
      }
      if (typeof value !== 'number' || value < 1 || value > 5) {
        throw new Error(`Risk factor "${key}" must be a number between 1 and 5`);
      }
    }

    const id = `FZ-${params.code}`;
    const overallScore = this._computeFreeZoneScore(params.riskFactors);
    const now = new Date().toISOString();

    /** @type {FreeZoneProfile} */
    const profile = {
      id,
      code: params.code,
      name: params.name,
      emirate: params.emirate,
      regulator: params.regulator,
      riskFactors: params.riskFactors,
      overallRiskScore: overallScore.score,
      riskLevel: overallScore.level,
      complianceRequirements: params.complianceRequirements || [],
      notes: params.notes || '',
      updatedAt: now,
    };

    this.freeZones.set(id, profile);
    await this.save();
    return profile;
  }

  /**
   * Get a free zone profile by ID or code.
   *
   * @param {string} idOrCode
   * @returns {FreeZoneProfile|null}
   */
  getFreeZone(idOrCode) {
    if (this.freeZones.has(idOrCode)) {
      return this.freeZones.get(idOrCode);
    }
    // Search by code
    for (const fz of this.freeZones.values()) {
      if (fz.code === idOrCode) return fz;
    }
    return null;
  }

  /**
   * List all free zone profiles.
   *
   * @param {object} [filters]
   * @param {string} [filters.emirate]
   * @param {string} [filters.riskLevel]
   * @returns {Promise<Array<FreeZoneProfile>>}
   */
  async listFreeZones(filters = {}) {
    await this.load();

    let results = [...this.freeZones.values()];

    if (filters.emirate) {
      const em = filters.emirate.toLowerCase();
      results = results.filter(fz => fz.emirate.toLowerCase() === em);
    }
    if (filters.riskLevel) {
      results = results.filter(fz => fz.riskLevel === filters.riskLevel);
    }

    results.sort((a, b) => b.overallRiskScore - a.overallRiskScore);
    return results;
  }

  // ---- Counterparty registration tracking -----------------------------

  /**
   * Register a counterparty's free zone licence.
   *
   * @param {object} params
   * @param {string} params.entityId - Counterparty entity identifier
   * @param {string} params.entityName - Counterparty name
   * @param {string} params.freeZoneId - Free zone ID or code
   * @param {string} params.licenceNumber - Licence/registration number
   * @param {string} params.registrationDate - YYYY-MM-DD
   * @param {string|null} [params.uboName] - UBO name
   * @param {string|null} [params.uboId] - UBO identifier
   * @param {boolean} [params.hasPhysicalOffice] - Default: true
   * @param {string} [params.activityDescription]
   * @returns {Promise<CounterpartyRegistration>}
   */
  async addRegistration(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.entityId || typeof params.entityId !== 'string') {
      throw new Error('params.entityId is required');
    }
    if (!params.entityName || typeof params.entityName !== 'string') {
      throw new Error('params.entityName is required');
    }
    if (!params.freeZoneId || typeof params.freeZoneId !== 'string') {
      throw new Error('params.freeZoneId is required');
    }
    if (!params.licenceNumber || typeof params.licenceNumber !== 'string') {
      throw new Error('params.licenceNumber is required');
    }
    if (!params.registrationDate || typeof params.registrationDate !== 'string') {
      throw new Error('params.registrationDate is required (YYYY-MM-DD)');
    }

    // Resolve free zone
    const freeZone = this.getFreeZone(params.freeZoneId);
    if (!freeZone) {
      throw new Error(`Free zone not found: ${params.freeZoneId}`);
    }

    const id = `REG-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const hasPhysical = params.hasPhysicalOffice !== false;

    // Detect red flags
    const redFlags = await this._detectRegistrationRedFlags({
      entityId: params.entityId,
      freeZoneId: freeZone.id,
      registrationDate: params.registrationDate,
      uboId: params.uboId || null,
      hasPhysicalOffice: hasPhysical,
    });

    /** @type {CounterpartyRegistration} */
    const registration = {
      id,
      entityId: params.entityId,
      entityName: params.entityName,
      freeZoneId: freeZone.id,
      freeZoneCode: freeZone.code,
      licenceNumber: params.licenceNumber,
      registrationDate: params.registrationDate,
      uboName: params.uboName || null,
      uboId: params.uboId || null,
      hasPhysicalOffice: hasPhysical,
      activityDescription: params.activityDescription || '',
      active: true,
      redFlags,
      addedAt: now,
      updatedAt: now,
    };

    this.registrations.set(id, registration);
    await this.save();
    return registration;
  }

  /**
   * Get all registrations for a counterparty.
   *
   * @param {string} entityId
   * @returns {Promise<Array<CounterpartyRegistration>>}
   */
  async getEntityRegistrations(entityId) {
    await this.load();
    return [...this.registrations.values()]
      .filter(r => r.entityId === entityId)
      .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate));
  }

  /**
   * Get all registrations for a free zone.
   *
   * @param {string} freeZoneIdOrCode
   * @returns {Promise<Array<CounterpartyRegistration>>}
   */
  async getFreeZoneRegistrations(freeZoneIdOrCode) {
    await this.load();
    const fz = this.getFreeZone(freeZoneIdOrCode);
    if (!fz) return [];
    return [...this.registrations.values()]
      .filter(r => r.freeZoneId === fz.id)
      .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate));
  }

  // ---- Transshipment tracking -----------------------------------------

  /**
   * Record a cross-border free zone transshipment.
   *
   * @param {object} params
   * @param {string} params.entityId - Counterparty
   * @param {string} params.originFreeZoneId - Origin free zone ID or code
   * @param {string} params.destinationFreeZoneId - Destination free zone ID or code
   * @param {string} params.goodsDescription - Description of goods
   * @param {number} params.valueAED - Value in AED
   * @param {string} params.date - YYYY-MM-DD
   * @param {boolean} [params.enteredMainlandCustoms] - Default: false
   * @returns {Promise<TransshipmentRecord>}
   */
  async recordTransshipment(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.entityId || typeof params.entityId !== 'string') {
      throw new Error('params.entityId is required');
    }
    if (!params.originFreeZoneId || typeof params.originFreeZoneId !== 'string') {
      throw new Error('params.originFreeZoneId is required');
    }
    if (!params.destinationFreeZoneId || typeof params.destinationFreeZoneId !== 'string') {
      throw new Error('params.destinationFreeZoneId is required');
    }
    if (!params.goodsDescription || typeof params.goodsDescription !== 'string') {
      throw new Error('params.goodsDescription is required');
    }
    if (typeof params.valueAED !== 'number' || params.valueAED < 0) {
      throw new Error('params.valueAED is required and must be a non-negative number');
    }

    const origin = this.getFreeZone(params.originFreeZoneId);
    const destination = this.getFreeZone(params.destinationFreeZoneId);

    if (!origin) {
      throw new Error(`Origin free zone not found: ${params.originFreeZoneId}`);
    }
    if (!destination) {
      throw new Error(`Destination free zone not found: ${params.destinationFreeZoneId}`);
    }

    const enteredMainland = params.enteredMainlandCustoms === true;

    // Detect red flags
    const redFlags = [];
    if (!enteredMainland) {
      redFlags.push(FREE_ZONE_RED_FLAGS.CROSS_BORDER_TRANSSHIPMENT);
    }
    if (params.valueAED > 200000) {
      redFlags.push(FREE_ZONE_RED_FLAGS.HIGH_VALUE_IMMEDIATE_TRADING);
    }

    const id = `TSH-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

    /** @type {TransshipmentRecord} */
    const record = {
      id,
      entityId: params.entityId,
      originFreeZoneId: origin.id,
      destinationFreeZoneId: destination.id,
      goodsDescription: params.goodsDescription,
      valueAED: params.valueAED,
      date: params.date,
      enteredMainlandCustoms: enteredMainland,
      redFlags,
      recordedAt: new Date().toISOString(),
    };

    this.transshipments.push(record);
    await this.save();
    return record;
  }

  /**
   * Get transshipment records for an entity.
   *
   * @param {string} entityId
   * @param {object} [filters]
   * @param {string} [filters.since] - ISO date
   * @param {number} [filters.limit]
   * @returns {Promise<Array<TransshipmentRecord>>}
   */
  async getEntityTransshipments(entityId, filters = {}) {
    await this.load();

    let results = this.transshipments.filter(t => t.entityId === entityId);

    if (filters.since) {
      results = results.filter(t => t.date >= filters.since);
    }

    results.sort((a, b) => b.date.localeCompare(a.date));

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  // ---- Red flag detection ---------------------------------------------

  /**
   * Detect red flags for a counterparty registration.
   *
   * @param {object} attrs
   * @returns {Promise<Array<string>>}
   */
  async _detectRegistrationRedFlags(attrs) {
    const flags = [];

    // Check for multiple registrations by the same UBO
    if (attrs.uboId) {
      const sameUboRegs = [...this.registrations.values()].filter(
        r => r.uboId === attrs.uboId && r.active && r.freeZoneId !== attrs.freeZoneId
      );
      if (sameUboRegs.length >= 1) {
        flags.push(FREE_ZONE_RED_FLAGS.MULTIPLE_REGISTRATIONS_SAME_UBO);
      }
    }

    // Check for rapid registration and trading
    if (attrs.registrationDate) {
      const regDate = new Date(attrs.registrationDate + 'T00:00:00Z');
      const now = new Date();
      const daysSinceReg = (now.getTime() - regDate.getTime()) / MS_PER_DAY;
      if (daysSinceReg < 90) {
        flags.push(FREE_ZONE_RED_FLAGS.RAPID_REGISTRATION_AND_TRADING);
      }
    }

    // No physical office
    if (attrs.hasPhysicalOffice === false) {
      flags.push(FREE_ZONE_RED_FLAGS.NO_PHYSICAL_OFFICE);
    }

    return flags;
  }

  /**
   * Run a comprehensive red flag scan across all active registrations
   * for a given entity.
   *
   * @param {string} entityId
   * @returns {Promise<{ entityId: string, registrations: number, redFlags: Array<{ registrationId: string, freeZone: string, flags: Array<string> }>, totalFlags: number }>}
   */
  async scanEntityRedFlags(entityId) {
    await this.load();

    const regs = [...this.registrations.values()].filter(
      r => r.entityId === entityId && r.active
    );

    const flagResults = [];
    let totalFlags = 0;

    for (const reg of regs) {
      // Re-detect flags with current data
      const freshFlags = await this._detectRegistrationRedFlags({
        entityId: reg.entityId,
        freeZoneId: reg.freeZoneId,
        registrationDate: reg.registrationDate,
        uboId: reg.uboId,
        hasPhysicalOffice: reg.hasPhysicalOffice,
      });

      // Check for frequent jurisdiction changes
      if (regs.length >= 3) {
        if (!freshFlags.includes(FREE_ZONE_RED_FLAGS.FREQUENT_JURISDICTION_CHANGES)) {
          freshFlags.push(FREE_ZONE_RED_FLAGS.FREQUENT_JURISDICTION_CHANGES);
        }
      }

      // Update stored flags
      reg.redFlags = freshFlags;
      reg.updatedAt = new Date().toISOString();

      if (freshFlags.length > 0) {
        flagResults.push({
          registrationId: reg.id,
          freeZone: reg.freeZoneCode,
          flags: freshFlags,
        });
        totalFlags += freshFlags.length;
      }
    }

    await this.save();

    return {
      entityId,
      registrations: regs.length,
      redFlags: flagResults,
      totalFlags,
    };
  }

  // ---- Compliance requirement matrix ----------------------------------

  /**
   * Generate the free zone compliance requirement matrix. Shows which
   * compliance requirements apply to each free zone.
   *
   * @returns {Promise<Array<{ freeZone: string, code: string, riskLevel: string, requirements: object }>>}
   */
  async complianceMatrix() {
    await this.load();

    const matrix = [];
    const allRequirements = Object.values(COMPLIANCE_REQUIREMENTS);

    for (const fz of this.freeZones.values()) {
      const requirements = {};
      for (const req of allRequirements) {
        requirements[req] = fz.complianceRequirements.includes(req);
      }

      matrix.push({
        freeZone: fz.name,
        code: fz.code,
        riskLevel: fz.riskLevel,
        overallRiskScore: fz.overallRiskScore,
        requirements,
      });
    }

    matrix.sort((a, b) => b.overallRiskScore - a.overallRiskScore);
    return matrix;
  }

  // ---- Internal scoring -----------------------------------------------

  /**
   * Compute overall risk score for a free zone from individual factor
   * scores (each 1-5). Result is on a 1-10 scale.
   *
   * @param {object} factors
   * @returns {{ score: number, level: string }}
   */
  _computeFreeZoneScore(factors) {
    const weights = {
      regulatory_framework: 3,
      aml_supervision: 3,
      beneficial_ownership_transparency: 2,
      sanctions_screening_requirements: 2,
      physical_presence_requirements: 1,
      customs_controls: 1,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [factor, weight] of Object.entries(weights)) {
      const value = factors[factor];
      if (typeof value === 'number') {
        weightedSum += value * weight;
        totalWeight += weight;
      }
    }

    // Normalise to 1-10 scale (factors are 1-5)
    const normalised = totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 2)
      : 1;

    const score = Math.max(1, Math.min(10, normalised));

    let level;
    if (score <= 3) {
      level = 'low';
    } else if (score <= 6) {
      level = 'medium';
    } else {
      level = 'high';
    }

    return { score, level };
  }

  // ---- Statistics -----------------------------------------------------

  /**
   * Compute comprehensive statistics.
   *
   * @returns {Promise<object>}
   */
  async statistics() {
    await this.load();

    const freeZones = [...this.freeZones.values()];
    const regs = [...this.registrations.values()];
    const activeRegs = regs.filter(r => r.active);

    const fzByRisk = {
      low: freeZones.filter(fz => fz.riskLevel === 'low').length,
      medium: freeZones.filter(fz => fz.riskLevel === 'medium').length,
      high: freeZones.filter(fz => fz.riskLevel === 'high').length,
    };

    const regsByFreeZone = {};
    for (const fz of freeZones) {
      regsByFreeZone[fz.code] = activeRegs.filter(r => r.freeZoneId === fz.id).length;
    }

    const regsWithRedFlags = activeRegs.filter(r => r.redFlags.length > 0).length;

    // Count unique entities
    const uniqueEntities = new Set(activeRegs.map(r => r.entityId)).size;

    // Entities with multiple registrations
    const entityRegCounts = {};
    for (const reg of activeRegs) {
      entityRegCounts[reg.entityId] = (entityRegCounts[reg.entityId] || 0) + 1;
    }
    const entitiesWithMultipleRegs = Object.values(entityRegCounts)
      .filter(count => count > 1).length;

    // Transshipment stats
    const totalTransshipmentValue = this.transshipments.reduce(
      (sum, t) => sum + t.valueAED, 0
    );
    const transshipmentsWithRedFlags = this.transshipments
      .filter(t => t.redFlags.length > 0).length;

    return {
      totalFreeZones: freeZones.length,
      freeZonesByRiskLevel: fzByRisk,
      totalRegistrations: regs.length,
      activeRegistrations: activeRegs.length,
      registrationsByFreeZone: regsByFreeZone,
      registrationsWithRedFlags: regsWithRedFlags,
      uniqueEntities,
      entitiesWithMultipleRegistrations: entitiesWithMultipleRegs,
      totalTransshipments: this.transshipments.length,
      totalTransshipmentValueAED: totalTransshipmentValue,
      transshipmentsWithRedFlags,
    };
  }
}

export { DEFAULT_FREE_ZONE_PROFILES };
