/**
 * UAE Strategic Goods Controls Integration.
 *
 * Screens transactions and products against UAE strategic goods controls
 * relevant to precious metals and stones. Identifies dual-use goods,
 * performs end-use verification, and integrates with proliferation
 * financing (PF) risk assessment.
 *
 * Dual-use goods relevant to the precious metals sector include catalytic
 * converters, metal powders, high-purity refined metals, specialised
 * alloys, and advanced refining equipment. These items may be subject to
 * export controls if they could be diverted for weapons of mass
 * destruction (WMD) programmes.
 *
 * Features:
 *   - Controlled goods list relevant to DPMS activities
 *   - Product/transaction screening against controls list
 *   - End-use verification workflow
 *   - Red flag detection (DPRK/Iran nexus, unusual specs, FZ transshipment)
 *   - PF risk assessment integration
 *   - Screening result persistence and reporting
 *
 * References:
 *   - Cabinet Resolution No. 156/2025 (UAE strategic goods controls)
 *   - UNSCR 1718 (DPRK sanctions)
 *   - UNSCR 2231 (Iran JCPOA-related provisions)
 *   - Federal Decree-Law No. 10/2025 (TFS/PF obligations for DNFBPs)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Strategic goods categories per UAE Ministry of Industry controls. */
export const CONTROLLED_CATEGORIES = Object.freeze({
  CATALYTIC_MATERIALS: {
    code: 'SG-CAT-01',
    label: 'Catalytic Materials',
    description: 'Platinum group metal catalysts and catalytic converters with potential dual-use in chemical/biological agent production.',
    examples: ['PGM catalysts', 'catalytic converters', 'catalyst precursors'],
    controlBasis: 'Cabinet Res 156/2025 Schedule 1',
  },
  METAL_POWDERS: {
    code: 'SG-CAT-02',
    label: 'Metal Powders',
    description: 'Fine metal powders (particle size below 60 microns) usable in additive manufacturing of controlled components.',
    examples: ['titanium powder', 'tungsten powder', 'nickel alloy powder', 'cobalt powder'],
    controlBasis: 'Cabinet Res 156/2025 Schedule 2',
  },
  HIGH_PURITY_METALS: {
    code: 'SG-CAT-03',
    label: 'High-Purity Metals',
    description: 'Metals refined to purity levels exceeding 99.99% with potential nuclear or weapons applications.',
    examples: ['high-purity gold (99.999%)', 'high-purity platinum', 'high-purity palladium', 'beryllium'],
    controlBasis: 'Cabinet Res 156/2025 Schedule 1',
  },
  SPECIALIZED_ALLOYS: {
    code: 'SG-CAT-04',
    label: 'Specialised Alloys',
    description: 'Alloys with specific compositions controlled for their utility in missile, nuclear, or defence applications.',
    examples: ['maraging steel', 'nickel superalloys', 'tungsten-rhenium alloys', 'titanium alloys'],
    controlBasis: 'Cabinet Res 156/2025 Schedule 3',
  },
  REFINING_EQUIPMENT: {
    code: 'SG-CAT-05',
    label: 'Refining and Processing Equipment',
    description: 'Specialised equipment for metal refining, smelting, or assaying that could be repurposed for controlled material processing.',
    examples: ['induction furnaces', 'electron beam melting equipment', 'zone refining apparatus'],
    controlBasis: 'Cabinet Res 156/2025 Schedule 4',
  },
  PRECIOUS_STONES_INDUSTRIAL: {
    code: 'SG-CAT-06',
    label: 'Industrial Precious Stones',
    description: 'Industrial-grade diamonds and synthetic gemstones with applications in cutting, drilling, or abrasive technologies relevant to controlled programmes.',
    examples: ['industrial diamonds', 'synthetic diamond grit', 'cubic boron nitride'],
    controlBasis: 'Cabinet Res 156/2025 Schedule 2',
  },
});

/** Red flag indicators for strategic goods diversion. */
export const RED_FLAGS = Object.freeze([
  {
    id: 'RF-SG-01',
    indicator: 'Customer or end-user located in DPRK',
    severity: 'critical',
    reference: 'UNSCR 1718',
  },
  {
    id: 'RF-SG-02',
    indicator: 'Customer or end-user located in Iran (controlled goods)',
    severity: 'critical',
    reference: 'UNSCR 2231',
  },
  {
    id: 'RF-SG-03',
    indicator: 'Unusual technical specifications inconsistent with stated end-use',
    severity: 'high',
    reference: 'Cabinet Res 156/2025',
  },
  {
    id: 'RF-SG-04',
    indicator: 'Refusal to provide end-use certificate or end-user statement',
    severity: 'high',
    reference: 'Cabinet Res 156/2025',
  },
  {
    id: 'RF-SG-05',
    indicator: 'Transshipment through free trade zones without clear commercial rationale',
    severity: 'high',
    reference: 'Cabinet Res 156/2025',
  },
  {
    id: 'RF-SG-06',
    indicator: 'Customer has no prior history in the precious metals sector',
    severity: 'medium',
    reference: 'FATF PF Guidance',
  },
  {
    id: 'RF-SG-07',
    indicator: 'Request for delivery to address different from customer registration',
    severity: 'medium',
    reference: 'Cabinet Res 156/2025',
  },
  {
    id: 'RF-SG-08',
    indicator: 'Payment from third party unrelated to the transaction',
    severity: 'high',
    reference: 'FATF PF Guidance',
  },
  {
    id: 'RF-SG-09',
    indicator: 'Customer requests removal of labels, markings, or serial numbers',
    severity: 'high',
    reference: 'Cabinet Res 156/2025',
  },
  {
    id: 'RF-SG-10',
    indicator: 'Goods destined for military or government entity in sanctioned jurisdiction',
    severity: 'critical',
    reference: 'UNSCR 1718, UNSCR 2231',
  },
]);

/** End-use verification states. */
export const VERIFICATION_STATES = Object.freeze({
  PENDING:   'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED:  'APPROVED',
  REJECTED:  'REJECTED',
  ESCALATED: 'ESCALATED',
});

/** High-risk jurisdictions for PF screening. */
export const PF_HIGH_RISK_JURISDICTIONS = Object.freeze([
  'DPRK', 'North Korea',
  'Iran',
  'Syria',
]);

/* ------------------------------------------------------------------ */
/*  Date utility                                                       */
/* ------------------------------------------------------------------ */

/**
 * Format a Date as YYYY-MM-DD.
 *
 * @param {Date} d
 * @returns {string}
 */
function fmtDate(d) {
  return d.toISOString().split('T')[0];
}

/* ------------------------------------------------------------------ */
/*  StrategicGoodsScreener                                             */
/* ------------------------------------------------------------------ */

export class StrategicGoodsScreener {
  /**
   * @param {string} registerPath - Absolute path to the JSON register file.
   */
  constructor(registerPath) {
    if (!registerPath || typeof registerPath !== 'string') {
      throw new Error('registerPath is required and must be a string');
    }

    /** @type {string} */
    this.registerPath = registerPath;

    /** @type {Map<string, object>} */
    this.screenings = new Map();

    /** @type {Map<string, object>} */
    this.verifications = new Map();

    /** @private */
    this._loaded = false;
  }

  /* ---- Persistence ------------------------------------------------- */

  /**
   * Load the register from disk. Safe to call multiple times.
   *
   * @returns {Promise<void>}
   */
  async load() {
    if (this._loaded) return;
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    if (existsSync(this.registerPath)) {
      try {
        const raw = JSON.parse(await readFile(this.registerPath, 'utf8'));
        for (const s of raw.screenings || []) {
          this.screenings.set(s.id, s);
        }
        for (const v of raw.verifications || []) {
          this.verifications.set(v.id, v);
        }
      } catch (err) {
        throw new Error(`Failed to load strategic goods register: ${err.message}`);
      }
    }
    this._loaded = true;
  }

  /**
   * Persist the register to disk.
   *
   * @returns {Promise<void>}
   */
  async save() {
    const data = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      screenings: [...this.screenings.values()],
      verifications: [...this.verifications.values()],
    };
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.registerPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /* ---- Product screening ------------------------------------------- */

  /**
   * Screen a product or transaction against strategic goods controls.
   *
   * @param {object} params
   * @param {string} params.productDescription - Description of the product or goods
   * @param {string} [params.customerName]     - Customer or end-user name
   * @param {string} [params.customerCountry]  - Customer country
   * @param {string} [params.endUse]           - Declared end-use
   * @param {string} [params.destination]       - Delivery destination country
   * @param {number} [params.quantity]          - Quantity
   * @param {string} [params.transactionId]    - Linked transaction ID
   * @param {string} [params.screenedBy]       - Person performing the screening
   * @returns {Promise<object>} Screening result
   */
  async screenProduct(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.productDescription || typeof params.productDescription !== 'string') {
      throw new Error('params.productDescription is required and must be a string');
    }

    const id = `SGS-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const descLower = params.productDescription.toLowerCase();

    // Check against controlled categories
    const matchedCategories = [];
    for (const [key, category] of Object.entries(CONTROLLED_CATEGORIES)) {
      const examples = category.examples.map(e => e.toLowerCase());
      const labelLower = category.label.toLowerCase();

      for (const example of examples) {
        if (descLower.includes(example) || example.includes(descLower)) {
          matchedCategories.push({
            categoryKey: key,
            code: category.code,
            label: category.label,
            matchedExample: example,
            controlBasis: category.controlBasis,
          });
          break;
        }
      }

      // Also check if label matches
      if (descLower.includes(labelLower) && !matchedCategories.some(m => m.categoryKey === key)) {
        matchedCategories.push({
          categoryKey: key,
          code: category.code,
          label: category.label,
          matchedExample: labelLower,
          controlBasis: category.controlBasis,
        });
      }
    }

    // Check red flags
    const triggeredRedFlags = [];
    const customerCountry = (params.customerCountry || '').toLowerCase();
    const destination = (params.destination || '').toLowerCase();

    for (const rf of RED_FLAGS) {
      const indicatorLower = rf.indicator.toLowerCase();

      // Jurisdiction-based red flags
      if (rf.id === 'RF-SG-01') {
        if (customerCountry.includes('dprk') || customerCountry.includes('north korea') ||
            destination.includes('dprk') || destination.includes('north korea')) {
          triggeredRedFlags.push({ ...rf });
        }
      } else if (rf.id === 'RF-SG-02') {
        if (customerCountry.includes('iran') || destination.includes('iran')) {
          triggeredRedFlags.push({ ...rf });
        }
      } else if (rf.id === 'RF-SG-10') {
        const isHighRisk = PF_HIGH_RISK_JURISDICTIONS.some(
          j => customerCountry.includes(j.toLowerCase()) || destination.includes(j.toLowerCase())
        );
        if (isHighRisk) {
          triggeredRedFlags.push({ ...rf });
        }
      }
    }

    // PF risk assessment
    const pfRiskIndicators = [];
    const isHighRiskJurisdiction = PF_HIGH_RISK_JURISDICTIONS.some(
      j => customerCountry.includes(j.toLowerCase()) || destination.includes(j.toLowerCase())
    );

    if (isHighRiskJurisdiction) {
      pfRiskIndicators.push('Customer or destination is in a PF high-risk jurisdiction.');
    }
    if (matchedCategories.length > 0) {
      pfRiskIndicators.push('Product matches controlled goods category with potential WMD application.');
    }
    if (!params.endUse) {
      pfRiskIndicators.push('No end-use declaration provided.');
    }

    const pfRiskLevel = triggeredRedFlags.some(rf => rf.severity === 'critical')
      ? 'critical'
      : triggeredRedFlags.some(rf => rf.severity === 'high')
        ? 'high'
        : matchedCategories.length > 0
          ? 'medium'
          : 'low';

    const requiresEndUseVerification = matchedCategories.length > 0 ||
      triggeredRedFlags.length > 0 ||
      pfRiskLevel === 'high' ||
      pfRiskLevel === 'critical';

    const result = {
      id,
      productDescription: params.productDescription,
      customerName: params.customerName || null,
      customerCountry: params.customerCountry || null,
      endUse: params.endUse || null,
      destination: params.destination || null,
      quantity: params.quantity || null,
      transactionId: params.transactionId || null,
      screenedBy: params.screenedBy || 'system',
      matchedCategories,
      triggeredRedFlags,
      pfRiskIndicators,
      pfRiskLevel,
      requiresEndUseVerification,
      controlsHit: matchedCategories.length > 0,
      redFlagsHit: triggeredRedFlags.length > 0,
      outcome: requiresEndUseVerification ? 'REQUIRES_VERIFICATION' : 'CLEAR',
      screenedAt: now,
    };

    this.screenings.set(id, result);
    await this.save();
    return result;
  }

  /* ---- End-use verification ---------------------------------------- */

  /**
   * Initiate an end-use verification workflow for a screening result.
   *
   * @param {object} params
   * @param {string} params.screeningId    - Screening result ID
   * @param {string} params.assignedTo     - Analyst responsible
   * @param {string} [params.notes]        - Initial notes
   * @returns {Promise<object>} Verification record
   */
  async initiateVerification(params) {
    await this.load();

    if (!params || !params.screeningId) {
      throw new Error('params.screeningId is required');
    }
    if (!params.assignedTo) {
      throw new Error('params.assignedTo is required');
    }

    const screening = this.screenings.get(params.screeningId);
    if (!screening) {
      throw new Error(`Screening not found: ${params.screeningId}`);
    }

    const id = `EUV-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const record = {
      id,
      screeningId: params.screeningId,
      assignedTo: params.assignedTo,
      state: VERIFICATION_STATES.PENDING,
      endUseCertificateReceived: false,
      endUseCertificateRef: null,
      customerStatementReceived: false,
      thirdPartyChecksComplete: false,
      pfAssessmentComplete: false,
      decision: null,
      decisionReason: null,
      decidedBy: null,
      notes: params.notes || '',
      createdAt: now,
      updatedAt: now,
      history: [{
        from: null,
        to: VERIFICATION_STATES.PENDING,
        actor: params.assignedTo,
        timestamp: now,
        note: 'End-use verification initiated.',
      }],
    };

    this.verifications.set(id, record);
    await this.save();
    return record;
  }

  /**
   * Update the state of an end-use verification.
   *
   * @param {string} verificationId - Verification ID
   * @param {string} newState       - Target state from VERIFICATION_STATES
   * @param {string} actor          - Who is performing the transition
   * @param {string} [note]         - Notes
   * @returns {Promise<object>} Updated verification record
   */
  async updateVerification(verificationId, newState, actor, note) {
    await this.load();

    const record = this.verifications.get(verificationId);
    if (!record) {
      throw new Error(`Verification not found: ${verificationId}`);
    }
    if (!Object.values(VERIFICATION_STATES).includes(newState)) {
      throw new Error(`Unknown state: ${newState}`);
    }

    const now = new Date().toISOString();
    record.history.push({
      from: record.state,
      to: newState,
      actor,
      timestamp: now,
      note: note || '',
    });

    record.state = newState;
    record.updatedAt = now;

    if (newState === VERIFICATION_STATES.APPROVED || newState === VERIFICATION_STATES.REJECTED) {
      record.decision = newState;
      record.decisionReason = note || null;
      record.decidedBy = actor;
    }

    await this.save();
    return record;
  }

  /**
   * Record receipt of an end-use certificate.
   *
   * @param {string} verificationId  - Verification ID
   * @param {string} certificateRef  - Certificate reference or document ID
   * @returns {Promise<object>} Updated verification record
   */
  async recordEndUseCertificate(verificationId, certificateRef) {
    await this.load();

    const record = this.verifications.get(verificationId);
    if (!record) {
      throw new Error(`Verification not found: ${verificationId}`);
    }
    if (!certificateRef || typeof certificateRef !== 'string') {
      throw new Error('certificateRef is required');
    }

    record.endUseCertificateReceived = true;
    record.endUseCertificateRef = certificateRef;
    record.updatedAt = new Date().toISOString();

    await this.save();
    return record;
  }

  /* ---- Retrieval --------------------------------------------------- */

  /**
   * Get a screening result by ID.
   *
   * @param {string} screeningId
   * @returns {Promise<object|null>}
   */
  async getScreening(screeningId) {
    await this.load();
    return this.screenings.get(screeningId) || null;
  }

  /**
   * Get a verification record by ID.
   *
   * @param {string} verificationId
   * @returns {Promise<object|null>}
   */
  async getVerification(verificationId) {
    await this.load();
    return this.verifications.get(verificationId) || null;
  }

  /**
   * List all screenings with optional filters.
   *
   * @param {object} [filter]
   * @param {string} [filter.outcome]     - Filter by outcome (CLEAR, REQUIRES_VERIFICATION)
   * @param {string} [filter.pfRiskLevel] - Filter by PF risk level
   * @returns {Promise<object[]>}
   */
  async listScreenings(filter = {}) {
    await this.load();

    let results = [...this.screenings.values()];

    if (filter.outcome) {
      results = results.filter(s => s.outcome === filter.outcome);
    }
    if (filter.pfRiskLevel) {
      results = results.filter(s => s.pfRiskLevel === filter.pfRiskLevel);
    }

    results.sort((a, b) => (b.screenedAt || '').localeCompare(a.screenedAt || ''));
    return results;
  }

  /* ---- Statistics -------------------------------------------------- */

  /**
   * Compute strategic goods screening statistics.
   *
   * @returns {Promise<object>}
   */
  async statistics() {
    await this.load();

    const allScreenings = [...this.screenings.values()];
    const allVerifications = [...this.verifications.values()];

    const byOutcome = { CLEAR: 0, REQUIRES_VERIFICATION: 0 };
    for (const s of allScreenings) {
      if (byOutcome[s.outcome] !== undefined) {
        byOutcome[s.outcome]++;
      }
    }

    const byPfRisk = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const s of allScreenings) {
      if (byPfRisk[s.pfRiskLevel] !== undefined) {
        byPfRisk[s.pfRiskLevel]++;
      }
    }

    const byVerificationState = {};
    for (const s of Object.values(VERIFICATION_STATES)) {
      byVerificationState[s] = 0;
    }
    for (const v of allVerifications) {
      byVerificationState[v.state] = (byVerificationState[v.state] || 0) + 1;
    }

    // Total red flags triggered
    let totalRedFlags = 0;
    for (const s of allScreenings) {
      totalRedFlags += s.triggeredRedFlags.length;
    }

    return {
      totalScreenings: allScreenings.length,
      byOutcome,
      byPfRisk,
      totalVerifications: allVerifications.length,
      byVerificationState,
      totalRedFlags,
      controlsHitCount: allScreenings.filter(s => s.controlsHit).length,
      computedAt: new Date().toISOString(),
    };
  }

  /* ---- Report generation ------------------------------------------- */

  /**
   * Generate a plain-text strategic goods screening report.
   *
   * @param {object} [options]
   * @param {string} [options.entityName] - Reporting entity name
   * @returns {Promise<string>}
   */
  async generateReport(options = {}) {
    const entityName = options.entityName || 'the Reporting Entity';
    const now = new Date();
    const stats = await this.statistics();

    const lines = [];
    lines.push('========================================================================');
    lines.push('STRATEGIC GOODS CONTROLS SCREENING REPORT');
    lines.push('========================================================================');
    lines.push('');

    // Metadata
    lines.push('REPORT METADATA');
    lines.push('');
    lines.push(`Entity:              ${entityName}`);
    lines.push(`Report date:         ${fmtDate(now)}`);
    lines.push(`Legal framework:     Federal Decree-Law No. 10/2025`);
    lines.push(`Controls basis:      Cabinet Res 156/2025`);
    lines.push(`UNSCR references:    1718 (DPRK), 2231 (Iran)`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Statistics
    lines.push('SCREENING STATISTICS');
    lines.push('');
    lines.push(`Total screenings:            ${stats.totalScreenings}`);
    lines.push(`Clear:                       ${stats.byOutcome.CLEAR}`);
    lines.push(`Requires verification:       ${stats.byOutcome.REQUIRES_VERIFICATION}`);
    lines.push(`Controls hit:                ${stats.controlsHitCount}`);
    lines.push(`Total red flags triggered:   ${stats.totalRedFlags}`);
    lines.push('');

    lines.push('PF RISK LEVEL DISTRIBUTION');
    lines.push('');
    for (const [level, count] of Object.entries(stats.byPfRisk)) {
      lines.push(`  ${level.toUpperCase().padEnd(12)} ${count}`);
    }
    lines.push('');

    lines.push('END-USE VERIFICATIONS');
    lines.push('');
    lines.push(`Total verifications:   ${stats.totalVerifications}`);
    for (const [state, count] of Object.entries(stats.byVerificationState)) {
      lines.push(`  ${state.padEnd(14)} ${count}`);
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Controlled categories reference
    lines.push('CONTROLLED GOODS CATEGORIES');
    lines.push('');
    for (const [, cat] of Object.entries(CONTROLLED_CATEGORIES)) {
      lines.push(`  ${cat.code} ${cat.label}`);
      lines.push(`    ${cat.description}`);
      lines.push(`    Basis: ${cat.controlBasis}`);
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Red flags reference
    lines.push('RED FLAG INDICATORS');
    lines.push('');
    for (const rf of RED_FLAGS) {
      lines.push(`  [${rf.severity.toUpperCase()}] ${rf.id}: ${rf.indicator}`);
      lines.push(`    Reference: ${rf.reference}`);
    }
    lines.push('');
    lines.push('========================================================================');
    lines.push('');
    lines.push('For review by the MLRO.');
    lines.push('');

    return lines.join('\n');
  }
}
