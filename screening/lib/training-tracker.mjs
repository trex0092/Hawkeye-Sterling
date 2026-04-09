/**
 * Staff AML/CFT Training Compliance Tracker.
 *
 * Tracks mandatory AML/CFT training obligations for all staff members,
 * including initial onboarding training, annual refreshers, sanctions
 * updates, typology workshops, MLRO-specialised courses, and regulatory
 * change briefings.
 *
 * Features:
 *
 *   - Staff register with hire dates and training records
 *   - Training type definitions with regulatory requirement mapping
 *   - Completion tracking with scores, certificates, and expiry dates
 *   - Compliance checking: is each staff member current on required training?
 *   - Gap analysis: which staff need which training, by when?
 *   - Training matrix: staff x required courses cross-reference
 *   - Auto-deadline calculation for annual refresher cycles
 *   - Report generation for board and supervisor review
 *   - Statistics: completion rate, overdue count, average score, training hours
 *
 * Reference: Federal Decree-Law No. 10/2025 (staff training obligations
 * for DNFBPs).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Training types. */
export const TRAINING_TYPES = Object.freeze({
  INITIAL_AML:        'initial_aml',
  ANNUAL_REFRESHER:   'annual_refresher',
  SANCTIONS_UPDATE:   'sanctions_update',
  TYPOLOGY_WORKSHOP:  'typology_workshop',
  MLRO_SPECIALIZED:   'mlro_specialized',
  REGULATORY_CHANGE:  'regulatory_change',
});

/** Training type metadata including regulatory basis and deadlines. */
export const TRAINING_DEFINITIONS = Object.freeze({
  [TRAINING_TYPES.INITIAL_AML]: {
    label: 'Initial AML/CFT Training',
    description: 'Foundational AML/CFT awareness training for new staff.',
    requiredFor: ['all'],
    deadlineDays: 30,
    deadlineBasis: 'hire_date',
    renewalMonths: null,
    regulatoryBasis: 'Federal Decree-Law No. 10/2025 requires that all staff of DNFBPs receive AML/CFT training.',
    minimumScore: 70,
    durationHours: 8,
  },
  [TRAINING_TYPES.ANNUAL_REFRESHER]: {
    label: 'Annual AML/CFT Refresher',
    description: 'Annual refresher training covering current AML/CFT obligations, recent regulatory developments, and emerging typologies.',
    requiredFor: ['all'],
    deadlineDays: null,
    deadlineBasis: 'last_completion',
    renewalMonths: 12,
    regulatoryBasis: 'Federal Decree-Law No. 10/2025 requires ongoing training for compliance personnel.',
    minimumScore: 70,
    durationHours: 4,
  },
  [TRAINING_TYPES.SANCTIONS_UPDATE]: {
    label: 'Sanctions Screening Update',
    description: 'Briefing on recent sanctions list changes, screening procedures, and targeted financial sanctions obligations.',
    requiredFor: ['compliance', 'operations', 'mlro'],
    deadlineDays: null,
    deadlineBasis: 'last_completion',
    renewalMonths: 6,
    regulatoryBasis: 'The applicable targeted financial sanctions framework requires that staff responsible for screening are trained on current obligations.',
    minimumScore: null,
    durationHours: 2,
  },
  [TRAINING_TYPES.TYPOLOGY_WORKSHOP]: {
    label: 'ML/TF Typology Workshop',
    description: 'Workshop covering money laundering and terrorist financing typologies relevant to the precious metals and stones sector.',
    requiredFor: ['compliance', 'operations', 'mlro', 'sales'],
    deadlineDays: null,
    deadlineBasis: 'last_completion',
    renewalMonths: 12,
    regulatoryBasis: 'Federal Decree-Law No. 10/2025 requires awareness of methods used to launder proceeds through DNFBPs.',
    minimumScore: null,
    durationHours: 3,
  },
  [TRAINING_TYPES.MLRO_SPECIALIZED]: {
    label: 'MLRO Specialised Training',
    description: 'Advanced training for the Money Laundering Reporting Officer on filing obligations, supervisory engagement, and programme management.',
    requiredFor: ['mlro'],
    deadlineDays: null,
    deadlineBasis: 'last_completion',
    renewalMonths: 12,
    regulatoryBasis: 'Federal Decree-Law No. 10/2025 requires that the MLRO maintain competence through ongoing specialised training.',
    minimumScore: 80,
    durationHours: 8,
  },
  [TRAINING_TYPES.REGULATORY_CHANGE]: {
    label: 'Regulatory Change Briefing',
    description: 'Ad-hoc briefing on new or amended regulations, circulars, or supervisory guidance affecting AML/CFT obligations.',
    requiredFor: ['all'],
    deadlineDays: null,
    deadlineBasis: 'event_date',
    renewalMonths: null,
    regulatoryBasis: 'Federal Decree-Law No. 10/2025 requires that staff are informed of regulatory changes affecting their duties.',
    minimumScore: null,
    durationHours: 1,
  },
});

/** Staff roles recognised by the system. */
export const STAFF_ROLES = Object.freeze({
  MLRO:        'mlro',
  COMPLIANCE:  'compliance',
  OPERATIONS:  'operations',
  SALES:       'sales',
  MANAGEMENT:  'management',
  ADMIN:       'admin',
});

/** Legacy alias kept for backward compatibility. */
export const ROLES = Object.values(STAFF_ROLES);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/*  Date utilities                                                     */
/* ------------------------------------------------------------------ */

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

/**
 * Add calendar days to a date.
 *
 * @param {Date} d
 * @param {number} days
 * @returns {Date}
 */
function addDays(d, days) {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

/* ------------------------------------------------------------------ */
/*  TrainingTracker                                                    */
/* ------------------------------------------------------------------ */

export class TrainingTracker {
  /**
   * @param {string} registerPath - Absolute path to the JSON register file
   */
  constructor(registerPath) {
    if (!registerPath || typeof registerPath !== 'string') {
      throw new Error('registerPath is required and must be a string');
    }

    /** @type {string} */
    this.registerPath = registerPath;

    /** @type {Map<string, object>} */
    this.staff = new Map();

    /** @private */
    this._loaded = false;
  }

  /* ---- Persistence ------------------------------------------------- */

  /**
   * Load the register from disk.
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
        for (const member of raw.staff || []) {
          this.staff.set(member.id, member);
        }
      } catch (err) {
        throw new Error(`Failed to load training register: ${err.message}`);
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
      version: '2.0.0',
      updatedAt: new Date().toISOString(),
      staff: [...this.staff.values()],
    };
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.registerPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /* ---- Staff management -------------------------------------------- */

  /**
   * Add a staff member to the register.
   *
   * @param {object} params
   * @param {string} params.name       - Full name
   * @param {string} [params.role]     - One of STAFF_ROLES values (default: operations)
   * @param {string} [params.department] - Department name
   * @param {string} params.hireDate   - YYYY-MM-DD
   * @param {string} [params.email]    - Contact email
   * @param {string} [params.id]       - Optional explicit ID
   * @returns {Promise<object>} The created staff record
   */
  async addStaff(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.name || typeof params.name !== 'string') {
      throw new Error('params.name is required and must be a string');
    }
    if (!params.hireDate || typeof params.hireDate !== 'string') {
      throw new Error('params.hireDate is required (YYYY-MM-DD)');
    }

    // Validate the date
    parseDate(params.hireDate);

    const role = params.role || STAFF_ROLES.OPERATIONS;
    const id = params.id || `STAFF-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const record = {
      id,
      name: params.name,
      role,
      department: params.department || '',
      hireDate: params.hireDate,
      email: params.email || null,
      active: true,
      trainingRecords: [],
      addedAt: now,
      updatedAt: now,
    };

    this.staff.set(id, record);
    await this.save();
    return record;
  }

  /**
   * Update a staff member's details.
   *
   * @param {string} staffId
   * @param {object} updates - Fields to update (name, role, department, email, active)
   * @returns {Promise<object>} Updated staff record
   */
  async updateStaff(staffId, updates) {
    await this.load();

    const member = this.staff.get(staffId);
    if (!member) {
      throw new Error(`Staff member not found: ${staffId}`);
    }

    const allowed = ['name', 'role', 'department', 'email', 'active'];
    for (const key of Object.keys(updates)) {
      if (allowed.includes(key)) {
        member[key] = updates[key];
      }
    }

    member.updatedAt = new Date().toISOString();
    await this.save();
    return member;
  }

  /**
   * Retrieve a staff member by ID.
   *
   * @param {string} staffId
   * @returns {object|null}
   */
  getStaff(staffId) {
    return this.staff.get(staffId) || null;
  }

  /**
   * List all staff members, optionally filtered.
   *
   * @param {object} [filters]
   * @param {string} [filters.role]       - Filter by role
   * @param {string} [filters.department] - Filter by department (case-insensitive)
   * @param {boolean} [filters.activeOnly] - Only active staff (default: true)
   * @returns {Promise<object[]>}
   */
  async listStaff(filters = {}) {
    await this.load();

    let results = [...this.staff.values()];

    const activeOnly = filters.activeOnly !== false;
    if (activeOnly) {
      results = results.filter(s => s.active);
    }

    if (filters.role) {
      results = results.filter(s => s.role === filters.role);
    }

    if (filters.department) {
      const needle = filters.department.toLowerCase();
      results = results.filter(s => s.department.toLowerCase().includes(needle));
    }

    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }

  /* ---- Training record management ---------------------------------- */

  /**
   * Record a completed training course for a staff member.
   * This is the primary method for adding training records. The legacy
   * method recordTraining() is preserved below for backward compatibility.
   *
   * @param {object} params
   * @param {string} params.staffId        - Staff member ID
   * @param {string} params.trainingType   - One of TRAINING_TYPES values
   * @param {string} params.courseId        - Course identifier
   * @param {string} params.completedDate  - YYYY-MM-DD
   * @param {number} [params.score]        - Assessment score (0-100)
   * @param {string} [params.certificateId] - Certificate reference
   * @param {string} [params.expiryDate]   - Certificate expiry (YYYY-MM-DD)
   * @param {number} [params.durationHours] - Actual training hours
   * @param {string} [params.provider]     - Training provider name
   * @param {string} [params.notes]        - Additional notes
   * @returns {Promise<object>} The training record
   */
  async recordCompletion(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.staffId || typeof params.staffId !== 'string') {
      throw new Error('params.staffId is required');
    }
    if (!params.trainingType || !Object.values(TRAINING_TYPES).includes(params.trainingType)) {
      throw new Error(`params.trainingType must be one of: ${Object.values(TRAINING_TYPES).join(', ')}`);
    }
    if (!params.courseId || typeof params.courseId !== 'string') {
      throw new Error('params.courseId is required');
    }
    if (!params.completedDate || typeof params.completedDate !== 'string') {
      throw new Error('params.completedDate is required (YYYY-MM-DD)');
    }

    const member = this.staff.get(params.staffId);
    if (!member) {
      throw new Error(`Staff member not found: ${params.staffId}`);
    }

    // Validate date
    parseDate(params.completedDate);

    // Validate score if provided
    if (params.score !== undefined && params.score !== null) {
      if (typeof params.score !== 'number' || params.score < 0 || params.score > 100) {
        throw new Error('params.score must be a number between 0 and 100');
      }
    }

    const def = TRAINING_DEFINITIONS[params.trainingType];

    // Calculate expiry date if not provided
    let expiryDate = params.expiryDate || null;
    if (expiryDate === null && def.renewalMonths !== null) {
      const completedDt = parseDate(params.completedDate);
      expiryDate = fmtDate(addMonths(completedDt, def.renewalMonths));
    }

    const recordId = `TR-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

    const trainingRecord = {
      id: recordId,
      type: params.trainingType,
      trainingType: params.trainingType,
      courseId: params.courseId,
      completedDate: params.completedDate,
      score: params.score ?? null,
      meetsMinimum: def.minimumScore !== null && params.score !== undefined && params.score !== null
        ? params.score >= def.minimumScore
        : null,
      certificateId: params.certificateId || null,
      expiryDate,
      hours: params.durationHours ?? def.durationHours,
      durationHours: params.durationHours ?? def.durationHours,
      provider: params.provider || 'Internal',
      notes: params.notes || '',
      recordedAt: new Date().toISOString(),
    };

    member.trainingRecords.push(trainingRecord);
    member.updatedAt = new Date().toISOString();
    await this.save();

    return trainingRecord;
  }

  /**
   * Legacy method: record training using the original API shape.
   * Delegates to recordCompletion().
   *
   * @param {string} staffId
   * @param {object} training
   * @param {string} training.type - Training type key
   * @param {string} [training.courseId]
   * @param {string} [training.completedDate]
   * @param {number} [training.score]
   * @param {string} [training.certificateId]
   * @param {string} [training.provider]
   * @param {number} [training.hours]
   * @returns {Promise<object>}
   */
  async recordTraining(staffId, training) {
    return this.recordCompletion({
      staffId,
      trainingType: training.type,
      courseId: training.courseId || training.type,
      completedDate: training.completedDate || new Date().toISOString().split('T')[0],
      score: training.score || null,
      certificateId: training.certificateId || null,
      provider: training.provider || 'Internal',
      durationHours: training.hours || 0,
    });
  }

  /* ---- Compliance checking ----------------------------------------- */

  /**
   * Determine which training types a staff member requires based on
   * their role.
   *
   * @param {string} role - Staff role
   * @returns {string[]} Array of TRAINING_TYPES values
   */
  getRequiredTraining(role) {
    const required = [];
    for (const [type, def] of Object.entries(TRAINING_DEFINITIONS)) {
      if (def.requiredFor.includes('all') || def.requiredFor.includes(role)) {
        // Skip regulatory_change as it is event-driven, not scheduled
        if (type !== TRAINING_TYPES.REGULATORY_CHANGE) {
          required.push(type);
        }
      }
    }
    return required;
  }

  /**
   * Check compliance status for a single staff member.
   *
   * @param {string} staffId
   * @param {Date} [now] - Reference date
   * @returns {Promise<object>} Compliance status with per-type detail
   */
  async checkCompliance(staffId, now = new Date()) {
    await this.load();

    const member = this.staff.get(staffId);
    if (!member) {
      throw new Error(`Staff not found: ${staffId}`);
    }

    const requiredTypes = this.getRequiredTraining(member.role);
    const results = [];
    let fullyCompliant = true;

    for (const type of requiredTypes) {
      const def = TRAINING_DEFINITIONS[type];
      const records = member.trainingRecords
        .filter(r => (r.trainingType === type) || (r.type === type))
        .sort((a, b) => b.completedDate.localeCompare(a.completedDate));

      const latest = records.length > 0 ? records[0] : null;
      let status = 'not_completed';
      let dueDate = null;
      let overdue = false;

      if (type === TRAINING_TYPES.INITIAL_AML) {
        // Due within 30 days of hire
        dueDate = fmtDate(addDays(parseDate(member.hireDate), def.deadlineDays));
        if (latest !== null) {
          status = 'current';
          // Check if completed on time
          if (latest.completedDate > dueDate) {
            status = 'completed_late';
          }
          // Check minimum score
          if (def.minimumScore !== null && latest.score !== null && latest.score !== undefined) {
            if (latest.score < def.minimumScore) {
              status = 'below_minimum_score';
              fullyCompliant = false;
            }
          }
        } else {
          if (fmtDate(now) > dueDate) {
            status = 'overdue';
            overdue = true;
            fullyCompliant = false;
          } else {
            status = 'pending';
          }
        }
      } else if (def.renewalMonths !== null) {
        // Recurring training
        if (latest !== null) {
          const expiryDate = latest.expiryDate || fmtDate(addMonths(parseDate(latest.completedDate), def.renewalMonths));
          dueDate = expiryDate;
          if (fmtDate(now) > expiryDate) {
            status = 'expired';
            overdue = true;
            fullyCompliant = false;
          } else {
            const daysUntil = (parseDate(expiryDate).getTime() - now.getTime()) / MS_PER_DAY;
            status = daysUntil < 30 ? 'expiring_soon' : 'current';
            // Check minimum score
            if (def.minimumScore !== null && latest.score !== null && latest.score !== undefined) {
              if (latest.score < def.minimumScore) {
                status = 'below_minimum_score';
                fullyCompliant = false;
              }
            }
          }
        } else {
          // Never completed a required recurring course
          const hireDate = parseDate(member.hireDate);
          const gracePeriod = addDays(hireDate, 90);
          dueDate = fmtDate(gracePeriod);
          if (now.getTime() > gracePeriod.getTime()) {
            status = 'overdue';
            overdue = true;
            fullyCompliant = false;
          } else {
            status = 'pending';
          }
        }
      } else {
        // Non-recurring, non-initial training
        if (latest !== null) {
          status = 'current';
        } else {
          status = 'not_required';
        }
      }

      results.push({
        type,
        trainingType: type,
        name: def.label,
        label: def.label,
        mandatory: def.requiredFor.includes('all') || def.requiredFor.includes(member.role),
        regulation: def.regulatoryBasis,
        status,
        dueDate,
        overdue,
        lastCompleted: latest ? latest.completedDate : null,
        latestCompletion: latest ? latest.completedDate : null,
        lastScore: latest ? latest.score : null,
        latestScore: latest ? latest.score : null,
        meetsMinimum: latest ? (latest.meetsMinimum ?? null) : null,
      });
    }

    return {
      staffId: member.id,
      name: member.name,
      staffName: member.name,
      role: member.role,
      compliant: fullyCompliant,
      isFullyCompliant: fullyCompliant,
      compliance: results,
      training: results,
    };
  }

  /* ---- Gap analysis ------------------------------------------------ */

  /**
   * Perform gap analysis across all active staff. Identifies which
   * staff need which training and by when.
   *
   * @param {Date} [now] - Reference date
   * @returns {Promise<Array<{staffId: string, name: string, staffName: string, role: string, gaps: Array<object>}>>}
   */
  async gapAnalysis(now = new Date()) {
    await this.load();

    const activeStaff = [...this.staff.values()].filter(s => s.active);
    const results = [];

    for (const member of activeStaff) {
      const compliance = await this.checkCompliance(member.id, now);
      const gaps = compliance.compliance
        .filter(t =>
          t.status === 'overdue' ||
          t.status === 'expired' ||
          t.status === 'pending' ||
          t.status === 'below_minimum_score'
        )
        .map(t => ({
          trainingType: t.trainingType,
          type: t.type,
          label: t.label,
          name: t.name,
          dueDate: t.dueDate,
          overdue: t.overdue,
          status: t.status,
          regulation: t.regulation,
        }));

      if (gaps.length > 0) {
        results.push({
          staffId: member.id,
          name: member.name,
          staffName: member.name,
          role: member.role,
          gaps,
        });
      }
    }

    // Sort: those with the most gaps first, then by overdue status
    results.sort((a, b) => {
      const aOverdue = a.gaps.some(g => g.overdue);
      const bOverdue = b.gaps.some(g => g.overdue);
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return b.gaps.length - a.gaps.length;
    });

    return results;
  }

  /* ---- Training matrix --------------------------------------------- */

  /**
   * Generate a training matrix: cross-reference of staff members
   * against required training courses.
   *
   * @param {Date} [now] - Reference date
   * @returns {Promise<object[]>} Array with staffId, name, role, per-type status, fullyCompliant
   */
  async trainingMatrix(now = new Date()) {
    await this.load();

    const matrix = [];

    for (const [id] of this.staff) {
      const member = this.staff.get(id);
      if (!member.active) continue;

      const compliance = await this.checkCompliance(id, now);
      const row = { staffId: id, name: compliance.name, role: compliance.role };

      for (const c of compliance.compliance) {
        row[c.type] = c.status;
      }
      row.fullyCompliant = compliance.isFullyCompliant;
      matrix.push(row);
    }

    return matrix;
  }

  /* ---- Auto-deadline calculation ----------------------------------- */

  /**
   * Calculate all upcoming training deadlines for a staff member.
   *
   * @param {string} staffId
   * @param {Date} [now] - Reference date
   * @returns {Promise<Array<{trainingType: string, label: string, dueDate: string, daysRemaining: number, status: string}>>}
   */
  async getDeadlines(staffId, now = new Date()) {
    await this.load();

    const member = this.staff.get(staffId);
    if (!member) {
      throw new Error(`Staff member not found: ${staffId}`);
    }

    const compliance = await this.checkCompliance(staffId, now);
    const deadlines = [];

    for (const entry of compliance.compliance) {
      if (entry.dueDate !== null) {
        const dueDt = parseDate(entry.dueDate);
        const diffMs = dueDt.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / MS_PER_DAY);

        deadlines.push({
          trainingType: entry.trainingType,
          label: entry.label,
          dueDate: entry.dueDate,
          daysRemaining,
          status: entry.status,
        });
      }
    }

    deadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return deadlines;
  }

  /* ---- Statistics -------------------------------------------------- */

  /**
   * Compute training programme statistics.
   *
   * @param {Date} [now] - Reference date
   * @returns {Promise<object>}
   */
  async statistics(now = new Date()) {
    await this.load();

    const activeStaff = [...this.staff.values()].filter(s => s.active);
    const allRecords = activeStaff.flatMap(s => s.trainingRecords);

    // Compliance counts
    let compliant = 0;
    let nonCompliant = 0;
    let totalRequired = 0;
    let totalCompliantReqs = 0;
    let overdueCount = 0;

    for (const member of activeStaff) {
      const check = await this.checkCompliance(member.id, now);
      if (check.isFullyCompliant) {
        compliant++;
      } else {
        nonCompliant++;
      }

      for (const entry of check.compliance) {
        totalRequired++;
        if (entry.status === 'current' || entry.status === 'completed_late' || entry.status === 'expiring_soon') {
          totalCompliantReqs++;
        }
        if (entry.overdue) {
          overdueCount++;
        }
      }
    }

    const complianceRate = activeStaff.length > 0
      ? Math.round((compliant / activeStaff.length) * 100)
      : 100;

    const completionRate = totalRequired > 0
      ? (totalCompliantReqs / totalRequired * 100).toFixed(1)
      : '0.0';

    // Average score
    const allScores = allRecords
      .map(r => r.score)
      .filter(s => s !== null && s !== undefined);
    const averageScore = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : null;

    // Total training hours
    const totalTrainingHours = allRecords.reduce(
      (sum, r) => sum + (r.hours || r.durationHours || 0), 0
    );

    // Certificate count
    const totalCertificates = allRecords.filter(r => r.certificateId).length;

    // Below-minimum count
    const belowMinimumCount = allRecords.filter(r => r.meetsMinimum === false).length;

    // Breakdown by type
    const byType = {};
    for (const [type, def] of Object.entries(TRAINING_DEFINITIONS)) {
      const typeRecords = allRecords.filter(
        r => (r.trainingType === type) || (r.type === type)
      );
      const typeScores = typeRecords.map(r => r.score).filter(s => s !== null && s !== undefined);
      byType[type] = {
        label: def.label,
        completions: typeRecords.length,
        averageScore: typeScores.length > 0
          ? (typeScores.reduce((a, b) => a + b, 0) / typeScores.length).toFixed(1)
          : 'N/A',
      };
    }

    return {
      totalStaff: activeStaff.length,
      activeStaffCount: activeStaff.length,
      compliant,
      nonCompliant,
      complianceRate,
      completionRate: `${completionRate}%`,
      overdueCount,
      totalTrainingHours,
      averageScore,
      totalCertificates,
      belowMinimumCount,
      totalRequired,
      totalCompliant: totalCompliantReqs,
      byType,
    };
  }

  /* ---- Report generation ------------------------------------------- */

  /**
   * Generate a plain-text training completion report suitable for
   * board or supervisor review.
   *
   * @param {object} [options]
   * @param {string} [options.entityName] - Reporting entity name
   * @param {string} [options.mlroName]   - MLRO name
   * @param {Date}   [options.now]        - Reference date
   * @returns {Promise<string>}
   */
  async generateReport(options = {}) {
    const now = options.now || new Date();
    const entityName = options.entityName || 'the Reporting Entity';
    const mlroName = options.mlroName || 'the MLRO';

    const stats = await this.statistics(now);
    const gaps = await this.gapAnalysis(now);
    const matrix = await this.trainingMatrix(now);

    const lines = [];
    lines.push('========================================================================');
    lines.push('AML/CFT TRAINING COMPLIANCE REPORT');
    lines.push('========================================================================');
    lines.push('');

    // Metadata
    lines.push('REPORT METADATA');
    lines.push('');
    lines.push(`Entity:              ${entityName}`);
    lines.push(`Report date:         ${fmtDate(now)}`);
    lines.push(`Legal framework:     Federal Decree-Law No. 10/2025`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Statistics
    lines.push('TRAINING STATISTICS');
    lines.push('');
    lines.push(`Total staff:             ${stats.totalStaff}`);
    lines.push(`Compliant:               ${stats.compliant} (${stats.complianceRate}%)`);
    lines.push(`Non-compliant:           ${stats.nonCompliant}`);
    lines.push(`Overdue requirements:    ${stats.overdueCount}`);
    lines.push(`Total training hours:    ${stats.totalTrainingHours}`);
    lines.push(`Average score:           ${stats.averageScore || 'N/A'}`);
    lines.push(`Completion rate:         ${stats.completionRate}`);
    lines.push(`Below minimum score:     ${stats.belowMinimumCount}`);
    lines.push(`Certificates on file:    ${stats.totalCertificates}`);
    lines.push('');

    // Breakdown by type
    lines.push('COMPLETION BY TRAINING TYPE');
    lines.push('');
    for (const [, data] of Object.entries(stats.byType)) {
      lines.push(`  ${data.label}: ${data.completions} completions, avg score ${data.averageScore}`);
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Gap analysis
    lines.push('GAP ANALYSIS');
    lines.push('');
    if (gaps.length === 0) {
      lines.push('All active staff members are current on required training.');
    } else {
      lines.push(`${gaps.length} staff member(s) have training gaps:`);
      lines.push('');
      for (const entry of gaps) {
        lines.push(`  ${entry.name} (${entry.role}):`);
        for (const gap of entry.gaps) {
          const overdueFlag = gap.overdue ? ' [OVERDUE]' : '';
          lines.push(`    [${gap.status.toUpperCase()}] ${gap.name}, due: ${gap.dueDate || 'ASAP'}${overdueFlag}`);
        }
      }
      lines.push('');
    }
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Training matrix summary
    lines.push('TRAINING MATRIX');
    lines.push('');
    if (matrix.length === 0) {
      lines.push('No active staff registered.');
    } else {
      for (const row of matrix) {
        const statusStr = row.fullyCompliant ? 'COMPLIANT' : 'GAPS';
        lines.push(`  ${row.name} (${row.role}): ${statusStr}`);
      }
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Regulatory basis
    lines.push('REGULATORY BASIS');
    lines.push('');
    for (const [, def] of Object.entries(TRAINING_DEFINITIONS)) {
      const renewal = def.renewalMonths ? ` (renew every ${def.renewalMonths} months)` : '';
      lines.push(`  ${def.label}: ${def.regulatoryBasis}${renewal}`);
    }
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Next actions
    if (stats.overdueCount > 0) {
      lines.push('REQUIRED ACTIONS');
      lines.push('');
      lines.push(`Address ${stats.overdueCount} overdue training requirement(s) immediately.`);
      lines.push('');
    }

    lines.push('For review by the MLRO.');
    lines.push('');

    return lines.join('\n');
  }
}
