/**
 * Correspondent Banking Risk Module.
 *
 * Assesses risk for banking relationships used in precious metals
 * transactions. Evaluates bank jurisdiction, AML/CFT framework
 * quality, FATF mutual evaluation ratings, and correspondent chain
 * length. Detects nested correspondent banking, payable-through
 * account risk, and shell bank prohibition violations.
 *
 * Capabilities:
 *   - Bank risk scoring (1-10 scale)
 *   - Jurisdiction AML framework quality assessment
 *   - FATF mutual evaluation rating integration
 *   - Correspondent chain length tracking and nested banking detection
 *   - Payable-through account risk flagging
 *   - Shell bank prohibition check
 *   - Red flag detection (high-risk jurisdiction, no physical presence,
 *     no AML licence, refusal to provide due diligence information)
 *   - Relationship register with audit trail
 *
 * References:
 *   - FATF Recommendation 13 (correspondent banking)
 *   - Federal Decree-Law No. 10/2025, Art. 15 (correspondent
 *     relationships and payment channels)
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

/** Bank relationship types. */
export const RELATIONSHIP_TYPES = Object.freeze({
  CORRESPONDENT:      'correspondent',
  RESPONDENT:         'respondent',
  PAYABLE_THROUGH:    'payable_through',
  INTERMEDIARY:       'intermediary',
  SETTLEMENT:         'settlement',
});

/** Recognised FATF mutual evaluation ratings. */
export const FATF_RATINGS = Object.freeze({
  COMPLIANT:              'compliant',
  LARGELY_COMPLIANT:      'largely_compliant',
  PARTIALLY_COMPLIANT:    'partially_compliant',
  NON_COMPLIANT:          'non_compliant',
  NOT_ASSESSED:           'not_assessed',
});

/** Risk levels for individual assessment factors. */
export const FACTOR_RISK = Object.freeze({
  LOW:    'low',
  MEDIUM: 'medium',
  HIGH:   'high',
});

/** Shell bank indicators. */
const SHELL_BANK_INDICATORS = Object.freeze([
  'no_physical_presence',
  'no_staff',
  'no_aml_licence',
  'mail_box_only',
  'nominee_management',
  'no_regulatory_supervision',
]);

/** Red flag identifiers. */
export const RED_FLAGS = Object.freeze({
  HIGH_RISK_JURISDICTION:    'high_risk_jurisdiction',
  NO_PHYSICAL_PRESENCE:      'no_physical_presence',
  NO_AML_LICENCE:            'no_aml_licence',
  REFUSED_DUE_DILIGENCE:     'refused_due_diligence',
  NESTED_CORRESPONDENT:      'nested_correspondent',
  EXCESSIVE_CHAIN_LENGTH:    'excessive_chain_length',
  SHELL_BANK_SUSPECTED:      'shell_bank_suspected',
  PAYABLE_THROUGH_HIGH_RISK: 'payable_through_high_risk',
  SANCTIONED_JURISDICTION:   'sanctioned_jurisdiction',
  NO_FATF_EVALUATION:        'no_fatf_evaluation',
  ADVERSE_MEDIA:             'adverse_media',
});

/**
 * FATF high-risk and increased-monitoring jurisdiction codes.
 * These are reference lists; the authoritative source is the FATF
 * publications, which may change between sessions.
 */
const HIGH_RISK_JURISDICTIONS = new Set(['IR', 'KP', 'MM']);

const INCREASED_MONITORING_JURISDICTIONS = new Set([
  'AL', 'BG', 'BF', 'CM', 'HR', 'CD', 'HT', 'KE', 'LA', 'LB',
  'MC', 'MZ', 'NA', 'NG', 'PH', 'ZA', 'SS', 'SY', 'TZ', 'VE', 'VN', 'YE',
]);

// -----------------------------------------------------------------------
//  Type definitions
// -----------------------------------------------------------------------

/**
 * @typedef {object} BankRecord
 * @property {string} id - Unique bank identifier
 * @property {string} name - Bank name
 * @property {string} swift - SWIFT/BIC code
 * @property {string} jurisdiction - Country code (ISO 3166-1 alpha-2)
 * @property {string} relationshipType - One of RELATIONSHIP_TYPES
 * @property {boolean} hasPhysicalPresence - Does the bank have a physical office?
 * @property {boolean} hasAMLLicence - Does the bank hold an AML licence?
 * @property {boolean} providedDueDiligence - Has the bank provided DD information?
 * @property {string|null} fatfRating - FATF mutual evaluation rating
 * @property {Array<string>} correspondentChain - Ordered list of bank IDs in the chain
 * @property {boolean} isPayableThroughAccount - PTA flag
 * @property {number} riskScore - Computed risk score (1-10)
 * @property {string} riskLevel - low | medium | high
 * @property {Array<string>} redFlags - Active red flags
 * @property {Array<string>} shellBankIndicators - Shell bank indicators present
 * @property {boolean} shellBankSuspected - Whether shell bank is suspected
 * @property {boolean} active - Whether the relationship is active
 * @property {string} [notes]
 * @property {string} addedAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * @typedef {object} BankAssessment
 * @property {string} bankId - Assessed bank ID
 * @property {string} bankName - Bank name
 * @property {number} riskScore - Overall risk score (1-10)
 * @property {string} riskLevel - low | medium | high
 * @property {object} factorScores - Individual factor scores
 * @property {Array<string>} redFlags - Detected red flags
 * @property {boolean} shellBankSuspected - Shell bank determination
 * @property {boolean} prohibited - Whether the relationship is prohibited
 * @property {string} prohibitionReason - Reason for prohibition
 * @property {string} recommendation - Recommended action
 * @property {string} assessedAt - ISO timestamp
 */

// -----------------------------------------------------------------------
//  CorrespondentBankingModule
// -----------------------------------------------------------------------

/**
 * Correspondent banking risk assessment module. Manages bank
 * relationships, assesses risk, and detects red flags including
 * nested correspondent banking and shell bank indicators.
 */
export class CorrespondentBankingModule {
  /**
   * @param {string} storePath - Absolute path to the JSON persistence file
   */
  constructor(storePath) {
    if (!storePath || typeof storePath !== 'string') {
      throw new Error('storePath is required and must be a string');
    }

    /** @type {string} */
    this.storePath = storePath;

    /** @type {Map<string, BankRecord>} */
    this.banks = new Map();

    /** @type {Array<object>} */
    this.assessmentLog = [];

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
        for (const bank of raw.banks || []) {
          this.banks.set(bank.id, bank);
        }
        this.assessmentLog = raw.assessmentLog || [];
      } catch (err) {
        throw new Error(`Failed to load correspondent banking state: ${err.message}`);
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
      bankCount: this.banks.size,
      banks: [...this.banks.values()],
      assessmentLog: this.assessmentLog,
    };
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.storePath, JSON.stringify(data, null, 2), 'utf8');
  }

  // ---- Bank relationship management -----------------------------------

  /**
   * Register a bank relationship.
   *
   * @param {object} params
   * @param {string} params.name - Bank name
   * @param {string} params.swift - SWIFT/BIC code
   * @param {string} params.jurisdiction - Country code
   * @param {string} [params.relationshipType] - Default: correspondent
   * @param {boolean} [params.hasPhysicalPresence] - Default: true
   * @param {boolean} [params.hasAMLLicence] - Default: true
   * @param {boolean} [params.providedDueDiligence] - Default: true
   * @param {string|null} [params.fatfRating] - FATF mutual evaluation rating
   * @param {Array<string>} [params.correspondentChain] - Chain of bank IDs
   * @param {boolean} [params.isPayableThroughAccount] - Default: false
   * @param {string} [params.notes]
   * @param {string} [params.id] - Explicit ID
   * @returns {Promise<BankRecord>}
   */
  async addBank(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.name || typeof params.name !== 'string') {
      throw new Error('params.name is required');
    }
    if (!params.swift || typeof params.swift !== 'string') {
      throw new Error('params.swift is required');
    }
    if (!params.jurisdiction || typeof params.jurisdiction !== 'string') {
      throw new Error('params.jurisdiction is required');
    }

    if (params.relationshipType !== undefined) {
      const validTypes = Object.values(RELATIONSHIP_TYPES);
      if (!validTypes.includes(params.relationshipType)) {
        throw new Error(`params.relationshipType must be one of: ${validTypes.join(', ')}`);
      }
    }

    if (params.fatfRating !== undefined && params.fatfRating !== null) {
      const validRatings = Object.values(FATF_RATINGS);
      if (!validRatings.includes(params.fatfRating)) {
        throw new Error(`params.fatfRating must be one of: ${validRatings.join(', ')}`);
      }
    }

    const id = params.id || `BNK-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const hasPhysical = params.hasPhysicalPresence !== false;
    const hasAML = params.hasAMLLicence !== false;
    const providedDD = params.providedDueDiligence !== false;
    const chain = params.correspondentChain || [];
    const isPTA = params.isPayableThroughAccount === true;

    // Detect red flags
    const redFlags = this._detectRedFlags({
      jurisdiction: params.jurisdiction,
      hasPhysicalPresence: hasPhysical,
      hasAMLLicence: hasAML,
      providedDueDiligence: providedDD,
      correspondentChain: chain,
      isPayableThroughAccount: isPTA,
      fatfRating: params.fatfRating || null,
    });

    // Check shell bank indicators
    const shellIndicators = this._checkShellBankIndicators({
      hasPhysicalPresence: hasPhysical,
      hasAMLLicence: hasAML,
    });

    // Compute risk score
    const { score, level } = this._computeBankRiskScore({
      jurisdiction: params.jurisdiction,
      hasPhysicalPresence: hasPhysical,
      hasAMLLicence: hasAML,
      providedDueDiligence: providedDD,
      fatfRating: params.fatfRating || null,
      correspondentChain: chain,
      isPayableThroughAccount: isPTA,
      redFlags,
      shellIndicators,
    });

    /** @type {BankRecord} */
    const bank = {
      id,
      name: params.name,
      swift: params.swift.toUpperCase(),
      jurisdiction: params.jurisdiction.toUpperCase(),
      relationshipType: params.relationshipType || RELATIONSHIP_TYPES.CORRESPONDENT,
      hasPhysicalPresence: hasPhysical,
      hasAMLLicence: hasAML,
      providedDueDiligence: providedDD,
      fatfRating: params.fatfRating || null,
      correspondentChain: chain,
      isPayableThroughAccount: isPTA,
      riskScore: score,
      riskLevel: level,
      redFlags,
      shellBankIndicators: shellIndicators,
      shellBankSuspected: shellIndicators.length >= 2,
      active: true,
      notes: params.notes || '',
      addedAt: now,
      updatedAt: now,
    };

    this.banks.set(id, bank);
    await this.save();
    return bank;
  }

  /**
   * Update a bank record. Re-computes risk score and red flags.
   *
   * @param {string} bankId
   * @param {object} updates
   * @returns {Promise<BankRecord>}
   */
  async updateBank(bankId, updates) {
    await this.load();

    const bank = this.banks.get(bankId);
    if (!bank) {
      throw new Error(`Bank not found: ${bankId}`);
    }

    const allowed = [
      'name', 'swift', 'jurisdiction', 'relationshipType',
      'hasPhysicalPresence', 'hasAMLLicence', 'providedDueDiligence',
      'fatfRating', 'correspondentChain', 'isPayableThroughAccount',
      'active', 'notes',
    ];

    for (const key of Object.keys(updates)) {
      if (allowed.includes(key)) {
        bank[key] = updates[key];
      }
    }

    // Re-detect red flags
    bank.redFlags = this._detectRedFlags({
      jurisdiction: bank.jurisdiction,
      hasPhysicalPresence: bank.hasPhysicalPresence,
      hasAMLLicence: bank.hasAMLLicence,
      providedDueDiligence: bank.providedDueDiligence,
      correspondentChain: bank.correspondentChain,
      isPayableThroughAccount: bank.isPayableThroughAccount,
      fatfRating: bank.fatfRating,
    });

    bank.shellBankIndicators = this._checkShellBankIndicators({
      hasPhysicalPresence: bank.hasPhysicalPresence,
      hasAMLLicence: bank.hasAMLLicence,
    });

    bank.shellBankSuspected = bank.shellBankIndicators.length >= 2;

    const { score, level } = this._computeBankRiskScore({
      jurisdiction: bank.jurisdiction,
      hasPhysicalPresence: bank.hasPhysicalPresence,
      hasAMLLicence: bank.hasAMLLicence,
      providedDueDiligence: bank.providedDueDiligence,
      fatfRating: bank.fatfRating,
      correspondentChain: bank.correspondentChain,
      isPayableThroughAccount: bank.isPayableThroughAccount,
      redFlags: bank.redFlags,
      shellIndicators: bank.shellBankIndicators,
    });

    bank.riskScore = score;
    bank.riskLevel = level;
    bank.updatedAt = new Date().toISOString();

    await this.save();
    return bank;
  }

  /**
   * Retrieve a bank by ID.
   *
   * @param {string} bankId
   * @returns {BankRecord|null}
   */
  getBank(bankId) {
    return this.banks.get(bankId) || null;
  }

  /**
   * List all banks, optionally filtered.
   *
   * @param {object} [filters]
   * @param {string} [filters.jurisdiction]
   * @param {string} [filters.riskLevel]
   * @param {string} [filters.relationshipType]
   * @param {boolean} [filters.activeOnly]
   * @param {boolean} [filters.withRedFlagsOnly]
   * @returns {Promise<Array<BankRecord>>}
   */
  async listBanks(filters = {}) {
    await this.load();

    let results = [...this.banks.values()];

    if (filters.jurisdiction) {
      const jur = filters.jurisdiction.toUpperCase();
      results = results.filter(b => b.jurisdiction === jur);
    }
    if (filters.riskLevel) {
      results = results.filter(b => b.riskLevel === filters.riskLevel);
    }
    if (filters.relationshipType) {
      results = results.filter(b => b.relationshipType === filters.relationshipType);
    }
    if (filters.activeOnly) {
      results = results.filter(b => b.active);
    }
    if (filters.withRedFlagsOnly) {
      results = results.filter(b => b.redFlags.length > 0);
    }

    results.sort((a, b) => b.riskScore - a.riskScore);
    return results;
  }

  // ---- Risk assessment ------------------------------------------------

  /**
   * Perform a full risk assessment for a bank. Returns a detailed
   * assessment report with factor scores, red flags, and recommendation.
   *
   * @param {string} bankId
   * @returns {Promise<BankAssessment>}
   */
  async assess(bankId) {
    await this.load();

    const bank = this.banks.get(bankId);
    if (!bank) {
      throw new Error(`Bank not found: ${bankId}`);
    }

    const factorScores = this._computeFactorScores(bank);
    const prohibited = bank.shellBankSuspected;
    const prohibitionReason = prohibited
      ? 'Shell bank indicators detected. Relationships with shell banks are prohibited under FATF Recommendation 13 and Federal Decree-Law No. 10/2025.'
      : '';

    let recommendation;
    if (prohibited) {
      recommendation = 'Terminate the relationship immediately. Shell bank relationships are prohibited.';
    } else if (bank.riskScore >= 8) {
      recommendation = 'Escalate to MLRO and Senior Management. Apply enhanced due diligence to all transactions through this banking channel.';
    } else if (bank.riskScore >= 5) {
      recommendation = 'Apply enhanced monitoring. Review the relationship at the next quarterly review.';
    } else {
      recommendation = 'Maintain standard monitoring. Review at annual relationship review.';
    }

    /** @type {BankAssessment} */
    const assessment = {
      bankId: bank.id,
      bankName: bank.name,
      riskScore: bank.riskScore,
      riskLevel: bank.riskLevel,
      factorScores,
      redFlags: bank.redFlags,
      shellBankSuspected: bank.shellBankSuspected,
      prohibited,
      prohibitionReason,
      recommendation,
      assessedAt: new Date().toISOString(),
    };

    this.assessmentLog.push({
      bankId: bank.id,
      bankName: bank.name,
      riskScore: bank.riskScore,
      riskLevel: bank.riskLevel,
      redFlagCount: bank.redFlags.length,
      prohibited,
      timestamp: assessment.assessedAt,
    });

    await this.save();
    return assessment;
  }

  // ---- Nested correspondent banking detection -------------------------

  /**
   * Detect nested correspondent banking arrangements. A nested
   * arrangement exists when a respondent bank uses the correspondent
   * account to process transactions on behalf of its own downstream
   * respondent banks.
   *
   * @param {string} bankId
   * @returns {Promise<{ nested: boolean, chainLength: number, chain: Array<object>, risk: string }>}
   */
  async detectNestedCorrespondent(bankId) {
    await this.load();

    const bank = this.banks.get(bankId);
    if (!bank) {
      throw new Error(`Bank not found: ${bankId}`);
    }

    const chain = [];
    const visited = new Set();

    /**
     * Traverse the correspondent chain recursively.
     * @param {string} currentId
     * @param {number} depth
     */
    const traverse = (currentId, depth) => {
      if (visited.has(currentId) || depth > 10) return;
      visited.add(currentId);

      const current = this.banks.get(currentId);
      if (!current) return;

      chain.push({
        bankId: current.id,
        bankName: current.name,
        jurisdiction: current.jurisdiction,
        depth,
      });

      for (const nextId of current.correspondentChain) {
        traverse(nextId, depth + 1);
      }
    };

    traverse(bankId, 0);

    const chainLength = chain.length;
    const nested = chainLength > 2;

    let risk;
    if (chainLength <= 1) {
      risk = 'low';
    } else if (chainLength === 2) {
      risk = 'medium';
    } else if (chainLength === 3) {
      risk = 'high';
    } else {
      risk = 'high';
    }

    return {
      nested,
      chainLength,
      chain,
      risk,
    };
  }

  // ---- Shell bank prohibition check -----------------------------------

  /**
   * Check whether a bank meets the definition of a shell bank.
   * Shell banks are prohibited under FATF Recommendation 13.
   *
   * A shell bank is defined as a bank with no physical presence in
   * any country (no meaningful mind and management) and which is not
   * affiliated with a regulated financial group.
   *
   * @param {string} bankId
   * @returns {Promise<{ isShellBank: boolean, indicators: Array<string>, determination: string }>}
   */
  async checkShellBank(bankId) {
    await this.load();

    const bank = this.banks.get(bankId);
    if (!bank) {
      throw new Error(`Bank not found: ${bankId}`);
    }

    const indicators = bank.shellBankIndicators;
    const isShellBank = indicators.length >= 2;

    let determination;
    if (isShellBank) {
      determination = 'The bank meets the indicators for a shell bank. Establishing or maintaining a correspondent relationship is prohibited under FATF Recommendation 13 and Federal Decree-Law No. 10/2025, Art. 15. Terminate the relationship immediately.';
    } else if (indicators.length === 1) {
      determination = 'The bank exhibits one shell bank indicator. Enhanced due diligence is required. Request further documentation to confirm the bank has genuine operations and regulatory oversight.';
    } else {
      determination = 'No shell bank indicators detected. Standard due diligence applies.';
    }

    return {
      isShellBank,
      indicators,
      determination,
    };
  }

  // ---- Internal scoring methods ---------------------------------------

  /**
   * Detect red flags for a bank based on its attributes.
   *
   * @param {object} attrs
   * @returns {Array<string>}
   */
  _detectRedFlags(attrs) {
    const flags = [];

    const jur = (attrs.jurisdiction || '').toUpperCase();

    if (HIGH_RISK_JURISDICTIONS.has(jur)) {
      flags.push(RED_FLAGS.SANCTIONED_JURISDICTION);
    }
    if (HIGH_RISK_JURISDICTIONS.has(jur) || INCREASED_MONITORING_JURISDICTIONS.has(jur)) {
      flags.push(RED_FLAGS.HIGH_RISK_JURISDICTION);
    }
    if (attrs.hasPhysicalPresence === false) {
      flags.push(RED_FLAGS.NO_PHYSICAL_PRESENCE);
    }
    if (attrs.hasAMLLicence === false) {
      flags.push(RED_FLAGS.NO_AML_LICENCE);
    }
    if (attrs.providedDueDiligence === false) {
      flags.push(RED_FLAGS.REFUSED_DUE_DILIGENCE);
    }
    if (attrs.correspondentChain && attrs.correspondentChain.length > 2) {
      flags.push(RED_FLAGS.NESTED_CORRESPONDENT);
      flags.push(RED_FLAGS.EXCESSIVE_CHAIN_LENGTH);
    }
    if (attrs.fatfRating === null || attrs.fatfRating === FATF_RATINGS.NOT_ASSESSED) {
      flags.push(RED_FLAGS.NO_FATF_EVALUATION);
    }
    if (attrs.isPayableThroughAccount && (
      HIGH_RISK_JURISDICTIONS.has(jur) || INCREASED_MONITORING_JURISDICTIONS.has(jur)
    )) {
      flags.push(RED_FLAGS.PAYABLE_THROUGH_HIGH_RISK);
    }

    return flags;
  }

  /**
   * Check shell bank indicators.
   *
   * @param {object} attrs
   * @returns {Array<string>}
   */
  _checkShellBankIndicators(attrs) {
    const indicators = [];
    if (attrs.hasPhysicalPresence === false) {
      indicators.push('no_physical_presence');
    }
    if (attrs.hasAMLLicence === false) {
      indicators.push('no_aml_licence');
    }
    return indicators;
  }

  /**
   * Compute the overall bank risk score (1-10).
   *
   * @param {object} attrs
   * @returns {{ score: number, level: string }}
   */
  _computeBankRiskScore(attrs) {
    let score = 1;

    // Jurisdiction risk (0-3 points)
    const jur = (attrs.jurisdiction || '').toUpperCase();
    if (HIGH_RISK_JURISDICTIONS.has(jur)) {
      score += 3;
    } else if (INCREASED_MONITORING_JURISDICTIONS.has(jur)) {
      score += 2;
    }

    // FATF rating (0-2 points)
    if (attrs.fatfRating === FATF_RATINGS.NON_COMPLIANT) {
      score += 2;
    } else if (attrs.fatfRating === FATF_RATINGS.PARTIALLY_COMPLIANT) {
      score += 1;
    } else if (attrs.fatfRating === null || attrs.fatfRating === FATF_RATINGS.NOT_ASSESSED) {
      score += 1;
    }

    // Physical presence (0-1 point)
    if (attrs.hasPhysicalPresence === false) {
      score += 1;
    }

    // AML licence (0-1 point)
    if (attrs.hasAMLLicence === false) {
      score += 1;
    }

    // Due diligence refusal (0-1 point)
    if (attrs.providedDueDiligence === false) {
      score += 1;
    }

    // Correspondent chain length (0-1 point)
    if (attrs.correspondentChain && attrs.correspondentChain.length > 2) {
      score += 1;
    }

    // Payable-through account (0-1 point for high-risk jurisdictions)
    if (attrs.isPayableThroughAccount && (
      HIGH_RISK_JURISDICTIONS.has(jur) || INCREASED_MONITORING_JURISDICTIONS.has(jur)
    )) {
      score += 1;
    }

    // Shell bank indicators add extra risk
    if (attrs.shellIndicators && attrs.shellIndicators.length >= 2) {
      score += 2;
    }

    // Clamp to 1-10
    score = Math.max(1, Math.min(10, score));

    let level;
    if (score <= 3) {
      level = FACTOR_RISK.LOW;
    } else if (score <= 6) {
      level = FACTOR_RISK.MEDIUM;
    } else {
      level = FACTOR_RISK.HIGH;
    }

    return { score, level };
  }

  /**
   * Compute individual factor scores for detailed assessment.
   *
   * @param {BankRecord} bank
   * @returns {object}
   */
  _computeFactorScores(bank) {
    const jur = bank.jurisdiction.toUpperCase();

    let jurisdictionRisk;
    if (HIGH_RISK_JURISDICTIONS.has(jur)) {
      jurisdictionRisk = { score: 5, level: 'high', detail: 'FATF high-risk jurisdiction (blacklist)' };
    } else if (INCREASED_MONITORING_JURISDICTIONS.has(jur)) {
      jurisdictionRisk = { score: 3, level: 'medium', detail: 'FATF increased monitoring jurisdiction (greylist)' };
    } else {
      jurisdictionRisk = { score: 1, level: 'low', detail: 'Standard jurisdiction' };
    }

    let amlFramework;
    if (bank.fatfRating === FATF_RATINGS.NON_COMPLIANT) {
      amlFramework = { score: 5, level: 'high', detail: 'Non-compliant with FATF standards' };
    } else if (bank.fatfRating === FATF_RATINGS.PARTIALLY_COMPLIANT) {
      amlFramework = { score: 3, level: 'medium', detail: 'Partially compliant with FATF standards' };
    } else if (bank.fatfRating === FATF_RATINGS.LARGELY_COMPLIANT) {
      amlFramework = { score: 2, level: 'low', detail: 'Largely compliant with FATF standards' };
    } else if (bank.fatfRating === FATF_RATINGS.COMPLIANT) {
      amlFramework = { score: 1, level: 'low', detail: 'Compliant with FATF standards' };
    } else {
      amlFramework = { score: 3, level: 'medium', detail: 'No FATF assessment available' };
    }

    const chainLength = {
      score: Math.min(5, bank.correspondentChain.length + 1),
      level: bank.correspondentChain.length > 2 ? 'high' : bank.correspondentChain.length > 0 ? 'medium' : 'low',
      detail: `Correspondent chain length: ${bank.correspondentChain.length + 1}`,
    };

    const physicalPresence = {
      score: bank.hasPhysicalPresence ? 1 : 5,
      level: bank.hasPhysicalPresence ? 'low' : 'high',
      detail: bank.hasPhysicalPresence ? 'Physical presence confirmed' : 'No physical presence',
    };

    const dueDiligence = {
      score: bank.providedDueDiligence ? 1 : 5,
      level: bank.providedDueDiligence ? 'low' : 'high',
      detail: bank.providedDueDiligence ? 'Due diligence information provided' : 'Refused to provide due diligence information',
    };

    return {
      jurisdictionRisk,
      amlFramework,
      chainLength,
      physicalPresence,
      dueDiligence,
    };
  }

  // ---- Statistics -----------------------------------------------------

  /**
   * Compute module statistics.
   *
   * @returns {Promise<object>}
   */
  async statistics() {
    await this.load();

    const banks = [...this.banks.values()];
    const active = banks.filter(b => b.active);

    const byRiskLevel = {
      low: active.filter(b => b.riskLevel === 'low').length,
      medium: active.filter(b => b.riskLevel === 'medium').length,
      high: active.filter(b => b.riskLevel === 'high').length,
    };

    const byRelType = {};
    for (const type of Object.values(RELATIONSHIP_TYPES)) {
      byRelType[type] = active.filter(b => b.relationshipType === type).length;
    }

    const withRedFlags = active.filter(b => b.redFlags.length > 0).length;
    const shellBankSuspected = active.filter(b => b.shellBankSuspected).length;

    const avgRiskScore = active.length > 0
      ? Math.round((active.reduce((sum, b) => sum + b.riskScore, 0) / active.length) * 100) / 100
      : 0;

    const jurisdictionCounts = {};
    for (const b of active) {
      const j = b.jurisdiction;
      jurisdictionCounts[j] = (jurisdictionCounts[j] || 0) + 1;
    }

    return {
      totalBanks: banks.length,
      activeBanks: active.length,
      byRiskLevel,
      byRelationshipType: byRelType,
      withRedFlags,
      shellBankSuspected,
      averageRiskScore: avgRiskScore,
      jurisdictionCounts,
      assessmentsPerformed: this.assessmentLog.length,
    };
  }
}

export { HIGH_RISK_JURISDICTIONS, INCREASED_MONITORING_JURISDICTIONS, SHELL_BANK_INDICATORS };
