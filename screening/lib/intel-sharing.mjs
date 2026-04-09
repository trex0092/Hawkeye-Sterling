/**
 * Cross-Institution Intelligence Sharing Framework.
 *
 * Enables privacy-preserving exchange of compliance indicators between
 * DNFBPs participating in coordinated AML/CFT intelligence sharing.
 * Entity names are hashed (SHA-256) before sharing so that no personally
 * identifiable information leaves the originating institution unless a
 * confirmed match triggers bilateral disclosure.
 *
 * Message authenticity is verified with HMAC-SHA256 signatures. Replay
 * protection uses nonce tracking combined with timestamp freshness checks.
 *
 * All sharing activity is recorded in an append-only audit trail.
 *
 * References: Federal Decree-Law No. 10/2025 (information sharing provisions).
 */

import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Supported indicator types. */
export const INDICATOR_TYPES = Object.freeze({
  SUSPICIOUS_ENTITY:   'SUSPICIOUS_ENTITY',
  SUSPICIOUS_PATTERN:  'SUSPICIOUS_PATTERN',
  JURISDICTION_ALERT:  'JURISDICTION_ALERT',
  SANCTIONS_UPDATE:    'SANCTIONS_UPDATE',
});

/** Sharing event types for the audit trail. */
export const AUDIT_EVENTS = Object.freeze({
  SHARED:              'shared',
  RECEIVED:            'received',
  DEDUPLICATED:        'deduplicated',
  ACTED_UPON:          'acted_upon',
  SIGNATURE_FAILED:    'signature_failed',
  REPLAY_REJECTED:     'replay_rejected',
  IMPORTED:            'imported',
  EXPORTED:            'exported',
});

/** Maximum age of a received message before it is rejected as stale (ms). */
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000; // 5 minutes

/** Default minimum severity for sharing (1-10 scale). */
const DEFAULT_MIN_SEVERITY = 5;

/* ------------------------------------------------------------------ */
/*  IntelSharingHub                                                    */
/* ------------------------------------------------------------------ */

export class IntelSharingHub {
  /**
   * @param {object} config
   * @param {string} config.institutionId   - This institution's identifier
   * @param {string} config.hmacSecret      - Shared HMAC-SHA256 secret key
   * @param {string} [config.registerPath]  - Path to persistent audit register
   * @param {number} [config.minSeverity]   - Minimum severity to share (1-10, default 5)
   * @param {string[]} [config.allowedCategories] - Indicator types allowed for sharing
   * @param {number} [config.maxMessageAgeMs]     - Max accepted message age in ms
   */
  constructor(config) {
    if (!config || !config.institutionId) {
      throw new Error('config.institutionId is required');
    }
    if (!config.hmacSecret) {
      throw new Error('config.hmacSecret is required');
    }

    /** @type {string} */
    this.institutionId = config.institutionId;

    /** @type {string} */
    this._hmacSecret = config.hmacSecret;

    /** @type {string|null} */
    this.registerPath = config.registerPath || null;

    /** @type {number} */
    this.minSeverity = config.minSeverity ?? DEFAULT_MIN_SEVERITY;

    /** @type {Set<string>} */
    this.allowedCategories = config.allowedCategories
      ? new Set(config.allowedCategories)
      : new Set(Object.values(INDICATOR_TYPES));

    /** @type {number} */
    this.maxMessageAgeMs = config.maxMessageAgeMs ?? MAX_MESSAGE_AGE_MS;

    /* ---- Internal state ---- */

    /** @type {Map<string, object>} Indicators indexed by hash */
    this._indicators = new Map();

    /** @type {Set<string>} Seen indicator hashes for dedup */
    this._seenHashes = new Set();

    /** @type {Set<string>} Seen nonces for replay protection */
    this._seenNonces = new Set();

    /** @type {object[]} Audit trail entries */
    this._auditTrail = [];

    /** @type {object} Counters */
    this._stats = {
      shared: 0,
      received: 0,
      deduplicated: 0,
      actedUpon: 0,
      signatureFailed: 0,
      replayRejected: 0,
    };

    /** @private */
    this._loaded = false;
  }

  /* ================================================================ */
  /*  Persistence                                                      */
  /* ================================================================ */

  /**
   * Load the audit register from disk (if registerPath is configured).
   * @returns {Promise<void>}
   */
  async load() {
    if (this._loaded) return;
    if (!this.registerPath) {
      this._loaded = true;
      return;
    }

    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    if (existsSync(this.registerPath)) {
      try {
        const raw = JSON.parse(await readFile(this.registerPath, 'utf8'));
        this._auditTrail = raw.auditTrail || [];
        for (const hash of raw.seenHashes || []) {
          this._seenHashes.add(hash);
        }
        for (const nonce of raw.seenNonces || []) {
          this._seenNonces.add(nonce);
        }
        for (const ind of raw.indicators || []) {
          this._indicators.set(ind.hash, ind);
        }
        if (raw.stats) {
          Object.assign(this._stats, raw.stats);
        }
      } catch (err) {
        throw new Error(`Failed to load intel-sharing register: ${err.message}`);
      }
    }
    this._loaded = true;
  }

  /**
   * Persist state to disk.
   * @returns {Promise<void>}
   */
  async save() {
    if (!this.registerPath) return;
    const data = {
      version: '1.0.0',
      institutionId: this.institutionId,
      updatedAt: new Date().toISOString(),
      indicators: [...this._indicators.values()],
      seenHashes: [...this._seenHashes],
      seenNonces: [...this._seenNonces],
      auditTrail: this._auditTrail,
      stats: { ...this._stats },
    };
    await writeFile(this.registerPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /* ================================================================ */
  /*  Hashing and Signing                                              */
  /* ================================================================ */

  /**
   * Hash an entity name for privacy-preserving sharing.
   * Uses SHA-256 with the institution ID as a salt.
   *
   * @param {string} entityName - Plain text entity name
   * @returns {string} Hex-encoded SHA-256 hash
   */
  hashEntityName(entityName) {
    if (!entityName || typeof entityName !== 'string') {
      throw new Error('entityName must be a non-empty string');
    }
    return createHash('sha256')
      .update(`${this.institutionId}:${entityName.trim().toLowerCase()}`)
      .digest('hex');
  }

  /**
   * Compute the HMAC-SHA256 signature of a message payload.
   *
   * @param {string} payload - JSON string to sign
   * @returns {string} Hex-encoded HMAC
   */
  sign(payload) {
    return createHmac('sha256', this._hmacSecret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify the HMAC-SHA256 signature of a received message.
   *
   * @param {string} payload   - JSON string
   * @param {string} signature - Hex-encoded HMAC to verify
   * @returns {boolean}
   */
  verify(payload, signature) {
    const expected = this.sign(payload);
    if (expected.length !== signature.length) return false;

    /* Constant-time comparison */
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
  }

  /* ================================================================ */
  /*  Indicator Creation                                               */
  /* ================================================================ */

  /**
   * Create a SUSPICIOUS_ENTITY indicator.
   *
   * @param {object} params
   * @param {string} params.entityName   - Entity name (will be hashed)
   * @param {number} params.riskScore    - Risk score (0-100)
   * @param {string} params.jurisdiction - Country code
   * @param {number} [params.severity]   - Severity 1-10 (default 5)
   * @param {string} [params.details]    - Anonymized details
   * @returns {object} The created indicator
   */
  createSuspiciousEntityIndicator(params) {
    if (!params || !params.entityName) {
      throw new Error('params.entityName is required');
    }
    if (params.riskScore === undefined || params.riskScore < 0 || params.riskScore > 100) {
      throw new Error('params.riskScore must be between 0 and 100');
    }
    if (!params.jurisdiction) {
      throw new Error('params.jurisdiction is required');
    }

    return this._createIndicator({
      type: INDICATOR_TYPES.SUSPICIOUS_ENTITY,
      severity: params.severity ?? 5,
      data: {
        entityHash: this.hashEntityName(params.entityName),
        riskScore: params.riskScore,
        jurisdiction: params.jurisdiction,
        details: params.details || '',
      },
    });
  }

  /**
   * Create a SUSPICIOUS_PATTERN indicator.
   *
   * @param {object} params
   * @param {string} params.typologyId   - Typology identifier
   * @param {number} params.confidence   - Confidence score 0-1
   * @param {string} [params.details]    - Anonymized pattern details
   * @param {number} [params.severity]   - Severity 1-10
   * @returns {object} The created indicator
   */
  createSuspiciousPatternIndicator(params) {
    if (!params || !params.typologyId) {
      throw new Error('params.typologyId is required');
    }
    if (params.confidence === undefined || params.confidence < 0 || params.confidence > 1) {
      throw new Error('params.confidence must be between 0 and 1');
    }

    return this._createIndicator({
      type: INDICATOR_TYPES.SUSPICIOUS_PATTERN,
      severity: params.severity ?? 5,
      data: {
        typologyId: params.typologyId,
        confidence: params.confidence,
        details: params.details || '',
      },
    });
  }

  /**
   * Create a JURISDICTION_ALERT indicator.
   *
   * @param {object} params
   * @param {string} params.country    - Country code (ISO 3166 alpha-2)
   * @param {string} params.riskLevel  - LOW | MEDIUM | HIGH | CRITICAL
   * @param {number} params.signalCount - Number of signals observed
   * @param {string} [params.details]  - Summary
   * @param {number} [params.severity] - Severity 1-10
   * @returns {object} The created indicator
   */
  createJurisdictionAlertIndicator(params) {
    if (!params || !params.country) {
      throw new Error('params.country is required');
    }
    if (!params.riskLevel) {
      throw new Error('params.riskLevel is required');
    }
    if (params.signalCount === undefined || params.signalCount < 0) {
      throw new Error('params.signalCount must be a non-negative number');
    }

    return this._createIndicator({
      type: INDICATOR_TYPES.JURISDICTION_ALERT,
      severity: params.severity ?? 5,
      data: {
        country: params.country,
        riskLevel: params.riskLevel,
        signalCount: params.signalCount,
        details: params.details || '',
      },
    });
  }

  /**
   * Create a SANCTIONS_UPDATE indicator.
   *
   * @param {object} params
   * @param {string} params.source       - Sanctions list source identifier
   * @param {number} params.addedCount   - Number of entries added
   * @param {number} params.removedCount - Number of entries removed
   * @param {string} [params.details]    - Summary of changes
   * @param {number} [params.severity]   - Severity 1-10
   * @returns {object} The created indicator
   */
  createSanctionsUpdateIndicator(params) {
    if (!params || !params.source) {
      throw new Error('params.source is required');
    }
    if (params.addedCount === undefined || params.addedCount < 0) {
      throw new Error('params.addedCount must be a non-negative number');
    }
    if (params.removedCount === undefined || params.removedCount < 0) {
      throw new Error('params.removedCount must be a non-negative number');
    }

    return this._createIndicator({
      type: INDICATOR_TYPES.SANCTIONS_UPDATE,
      severity: params.severity ?? 5,
      data: {
        source: params.source,
        addedCount: params.addedCount,
        removedCount: params.removedCount,
        details: params.details || '',
      },
    });
  }

  /**
   * Internal indicator factory.
   * @private
   */
  _createIndicator({ type, severity, data }) {
    const id = `IND-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const contentForHash = JSON.stringify({ type, data });
    const hash = createHash('sha256').update(contentForHash).digest('hex');

    const indicator = {
      id,
      type,
      severity,
      data,
      hash,
      sourceInstitution: this.institutionId,
      createdAt: now,
    };

    this._indicators.set(hash, indicator);
    this._seenHashes.add(hash);

    return indicator;
  }

  /* ================================================================ */
  /*  Export / Import (File-Based)                                     */
  /* ================================================================ */

  /**
   * Export indicators as a signed JSON bundle for file-based sharing.
   *
   * @param {object} [filter]
   * @param {string[]} [filter.types]       - Include only these indicator types
   * @param {number}   [filter.minSeverity] - Minimum severity to include
   * @param {string}   [filter.since]       - Only indicators created after this ISO timestamp
   * @returns {Promise<string>} Signed JSON string ready for file export
   */
  async exportIndicators(filter = {}) {
    await this.load();
    const minSev = filter.minSeverity ?? this.minSeverity;

    let indicators = [...this._indicators.values()];

    /* Apply category filter */
    if (filter.types && Array.isArray(filter.types)) {
      const allowed = new Set(filter.types);
      indicators = indicators.filter(ind => allowed.has(ind.type));
    } else {
      indicators = indicators.filter(ind => this.allowedCategories.has(ind.type));
    }

    /* Apply severity filter */
    indicators = indicators.filter(ind => ind.severity >= minSev);

    /* Apply time filter */
    if (filter.since) {
      indicators = indicators.filter(ind => ind.createdAt >= filter.since);
    }

    const bundle = {
      version: '1.0.0',
      sourceInstitution: this.institutionId,
      exportedAt: new Date().toISOString(),
      nonce: randomUUID(),
      indicatorCount: indicators.length,
      indicators,
    };

    const payload = JSON.stringify(bundle);
    const signature = this.sign(payload);

    const signedBundle = {
      payload,
      signature,
    };

    /* Audit */
    for (const ind of indicators) {
      this._recordAudit(AUDIT_EVENTS.SHARED, ind.id, {
        type: ind.type,
        hash: ind.hash,
        destination: 'file_export',
      });
    }
    this._stats.shared += indicators.length;

    await this.save();

    this._recordAudit(AUDIT_EVENTS.EXPORTED, null, {
      indicatorCount: indicators.length,
    });

    return JSON.stringify(signedBundle, null, 2);
  }

  /**
   * Import indicators from a signed JSON bundle.
   * Verifies signature, checks for replays, and deduplicates.
   *
   * @param {string} signedBundleJson - The signed bundle as a JSON string
   * @returns {Promise<object>} Import result with counts
   * @throws {Error} On signature failure or invalid format
   */
  async importIndicators(signedBundleJson) {
    await this.load();

    let signedBundle;
    try {
      signedBundle = JSON.parse(signedBundleJson);
    } catch (err) {
      throw new Error(`Invalid JSON in signed bundle: ${err.message}`);
    }

    if (!signedBundle.payload || !signedBundle.signature) {
      throw new Error('Signed bundle must contain payload and signature fields');
    }

    /* Verify HMAC signature */
    if (!this.verify(signedBundle.payload, signedBundle.signature)) {
      this._stats.signatureFailed++;
      this._recordAudit(AUDIT_EVENTS.SIGNATURE_FAILED, null, {
        payloadLength: signedBundle.payload.length,
      });
      await this.save();
      throw new Error('HMAC signature verification failed. Message may have been tampered with.');
    }

    let bundle;
    try {
      bundle = JSON.parse(signedBundle.payload);
    } catch (err) {
      throw new Error(`Invalid payload JSON: ${err.message}`);
    }

    /* Replay protection: check nonce */
    if (!bundle.nonce) {
      throw new Error('Bundle is missing nonce field');
    }
    if (this._seenNonces.has(bundle.nonce)) {
      this._stats.replayRejected++;
      this._recordAudit(AUDIT_EVENTS.REPLAY_REJECTED, null, {
        nonce: bundle.nonce,
        source: bundle.sourceInstitution,
      });
      await this.save();
      throw new Error('Replay detected: this bundle nonce has already been processed');
    }

    /* Replay protection: check timestamp freshness */
    if (bundle.exportedAt) {
      const age = Date.now() - new Date(bundle.exportedAt).getTime();
      if (age > this.maxMessageAgeMs) {
        this._stats.replayRejected++;
        this._recordAudit(AUDIT_EVENTS.REPLAY_REJECTED, null, {
          nonce: bundle.nonce,
          source: bundle.sourceInstitution,
          ageMs: age,
        });
        await this.save();
        throw new Error(
          `Message too old: exported ${Math.round(age / 1000)}s ago, ` +
          `max allowed ${Math.round(this.maxMessageAgeMs / 1000)}s`
        );
      }
    }

    /* Record nonce */
    this._seenNonces.add(bundle.nonce);

    /* Process indicators */
    const indicators = bundle.indicators || [];
    let imported = 0;
    let deduplicated = 0;

    for (const ind of indicators) {
      if (!ind.hash || !ind.type) continue;

      if (this._seenHashes.has(ind.hash)) {
        deduplicated++;
        this._stats.deduplicated++;
        this._recordAudit(AUDIT_EVENTS.DEDUPLICATED, ind.id, {
          hash: ind.hash,
          type: ind.type,
          source: bundle.sourceInstitution,
        });
        continue;
      }

      /* Store the indicator */
      this._indicators.set(ind.hash, {
        ...ind,
        receivedAt: new Date().toISOString(),
        receivedFrom: bundle.sourceInstitution,
      });
      this._seenHashes.add(ind.hash);
      imported++;
      this._stats.received++;

      this._recordAudit(AUDIT_EVENTS.RECEIVED, ind.id, {
        hash: ind.hash,
        type: ind.type,
        severity: ind.severity,
        source: bundle.sourceInstitution,
      });
    }

    this._recordAudit(AUDIT_EVENTS.IMPORTED, null, {
      source: bundle.sourceInstitution,
      total: indicators.length,
      imported,
      deduplicated,
    });

    await this.save();

    return {
      source: bundle.sourceInstitution,
      total: indicators.length,
      imported,
      deduplicated,
      importedAt: new Date().toISOString(),
    };
  }

  /* ================================================================ */
  /*  HTTP Push / Pull                                                 */
  /* ================================================================ */

  /**
   * Prepare a signed HTTP request payload for pushing indicators to a partner.
   * The caller is responsible for performing the actual HTTP request.
   *
   * @param {string} partnerEndpoint - URL of the partner's intake endpoint
   * @param {object} [filter]        - Same filter options as exportIndicators
   * @returns {Promise<object>} { url, method, headers, body } ready for fetch()
   */
  async preparePush(partnerEndpoint, filter = {}) {
    if (!partnerEndpoint || typeof partnerEndpoint !== 'string') {
      throw new Error('partnerEndpoint is required');
    }

    const signedBundle = await this.exportIndicators(filter);

    return {
      url: partnerEndpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Source-Institution': this.institutionId,
        'X-Signature': JSON.parse(signedBundle).signature,
        'X-Timestamp': new Date().toISOString(),
      },
      body: signedBundle,
    };
  }

  /**
   * Process a received HTTP push payload from a partner.
   * Validates and imports the indicators.
   *
   * @param {string} body           - Raw request body (JSON string)
   * @param {object} [headers]      - Request headers for additional validation
   * @returns {Promise<object>} Import result
   */
  async receivePush(body, headers = {}) {
    if (!body || typeof body !== 'string') {
      throw new Error('Request body is required');
    }
    return this.importIndicators(body);
  }

  /**
   * Prepare a pull request configuration for fetching indicators from a partner.
   * The caller is responsible for performing the actual HTTP request.
   *
   * @param {string} partnerFeedUrl - URL of the partner's feed endpoint
   * @param {string} [since]        - Only fetch indicators since this timestamp
   * @returns {object} { url, method, headers } ready for fetch()
   */
  preparePull(partnerFeedUrl, since) {
    if (!partnerFeedUrl || typeof partnerFeedUrl !== 'string') {
      throw new Error('partnerFeedUrl is required');
    }

    const nonce = randomUUID();
    const timestamp = new Date().toISOString();
    const challenge = `${this.institutionId}:${nonce}:${timestamp}`;
    const signature = this.sign(challenge);

    let url = partnerFeedUrl;
    if (since) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}since=${encodeURIComponent(since)}`;
    }

    return {
      url,
      method: 'GET',
      headers: {
        'X-Source-Institution': this.institutionId,
        'X-Nonce': nonce,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
    };
  }

  /* ================================================================ */
  /*  Indicator Management                                             */
  /* ================================================================ */

  /**
   * Mark an indicator as acted upon (e.g., used to generate an alert or case).
   *
   * @param {string} indicatorHash - Hash of the indicator
   * @param {string} action        - Description of the action taken
   * @returns {boolean} true if the indicator was found and marked
   */
  async markActedUpon(indicatorHash, action) {
    await this.load();
    const ind = this._indicators.get(indicatorHash);
    if (!ind) return false;

    ind.actedUpon = true;
    ind.actedAt = new Date().toISOString();
    ind.actionTaken = action;

    this._stats.actedUpon++;
    this._recordAudit(AUDIT_EVENTS.ACTED_UPON, ind.id, {
      hash: indicatorHash,
      type: ind.type,
      action,
    });

    await this.save();
    return true;
  }

  /**
   * Get all indicators, optionally filtered.
   *
   * @param {object} [filter]
   * @param {string} [filter.type]     - Filter by indicator type
   * @param {string} [filter.source]   - Filter by source institution
   * @param {boolean} [filter.actedUpon] - Filter by action status
   * @returns {Promise<object[]>}
   */
  async getIndicators(filter = {}) {
    await this.load();
    let results = [...this._indicators.values()];

    if (filter.type) {
      results = results.filter(ind => ind.type === filter.type);
    }
    if (filter.source) {
      results = results.filter(ind =>
        ind.sourceInstitution === filter.source ||
        ind.receivedFrom === filter.source
      );
    }
    if (filter.actedUpon !== undefined) {
      results = results.filter(ind => (ind.actedUpon === true) === filter.actedUpon);
    }

    return results.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  /* ================================================================ */
  /*  Statistics and Audit                                             */
  /* ================================================================ */

  /**
   * Get sharing statistics.
   *
   * @returns {object}
   */
  getStatistics() {
    return {
      totalIndicators: this._indicators.size,
      shared: this._stats.shared,
      received: this._stats.received,
      deduplicated: this._stats.deduplicated,
      actedUpon: this._stats.actedUpon,
      signatureFailed: this._stats.signatureFailed,
      replayRejected: this._stats.replayRejected,
      uniqueHashes: this._seenHashes.size,
      trackedNonces: this._seenNonces.size,
      auditTrailEntries: this._auditTrail.length,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Get the full audit trail.
   *
   * @param {number} [limit] - Maximum number of entries to return (most recent first)
   * @returns {object[]}
   */
  getAuditTrail(limit) {
    const trail = [...this._auditTrail].reverse();
    if (limit !== undefined && limit > 0) {
      return trail.slice(0, limit);
    }
    return trail;
  }

  /**
   * Record an event in the audit trail.
   * @private
   * @param {string} event       - Event type from AUDIT_EVENTS
   * @param {string|null} refId  - Related indicator or bundle ID
   * @param {object} details     - Additional event data
   */
  _recordAudit(event, refId, details) {
    this._auditTrail.push({
      event,
      refId: refId || null,
      institution: this.institutionId,
      timestamp: new Date().toISOString(),
      details: details || {},
    });
  }

  /* ================================================================ */
  /*  Privacy Controls                                                 */
  /* ================================================================ */

  /**
   * Update the allowed categories for sharing.
   *
   * @param {string[]} categories - Array of INDICATOR_TYPES values
   */
  setAllowedCategories(categories) {
    if (!Array.isArray(categories)) {
      throw new Error('categories must be an array');
    }
    const valid = Object.values(INDICATOR_TYPES);
    for (const cat of categories) {
      if (!valid.includes(cat)) {
        throw new Error(`Unknown indicator type: ${cat}. Valid: ${valid.join(', ')}`);
      }
    }
    this.allowedCategories = new Set(categories);
  }

  /**
   * Update the minimum severity threshold for sharing.
   *
   * @param {number} severity - Minimum severity (1-10)
   */
  setMinSeverity(severity) {
    if (typeof severity !== 'number' || severity < 1 || severity > 10) {
      throw new Error('severity must be a number between 1 and 10');
    }
    this.minSeverity = severity;
  }
}
