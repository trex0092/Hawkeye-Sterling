/**
 * Compliance Deadline and Regulatory Calendar Tracker.
 *
 * Manages recurring and one-off compliance deadlines for a UAE-licensed
 * Dealer in Precious Metals and Stones. Tracks filing deadlines, CDD
 * review cycles, training due dates, report submissions, inspection
 * preparation windows, and regulatory change implementation dates.
 *
 * Features:
 *
 *   - Recurring events (daily, weekly, monthly, quarterly, annual) with
 *     automatic next-occurrence calculation
 *   - Business-day deadline computation (skips weekends and UAE public holidays)
 *   - Urgency classification: overdue, critical, urgent, upcoming, scheduled
 *   - Standard DPMS compliance calendar auto-population
 *   - Entity-specific CDD review cycles based on risk rating
 *   - JSON-backed register for persistent storage
 *   - Plain-text schedule export
 *
 * Reference: Federal Decree-Law No. 10/2025 (filing and record-keeping
 * obligations for DNFBPs).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Calendar event types. */
export const EVENT_TYPES = Object.freeze({
  FILING_DEADLINE:    'filing_deadline',
  CDD_REVIEW:         'cdd_review',
  TRAINING_DUE:       'training_due',
  REPORT_DUE:         'report_due',
  INSPECTION_PREP:    'inspection_prep',
  REGULATORY_CHANGE:  'regulatory_change',
});

/** Recurrence patterns. */
export const RECURRENCE = Object.freeze({
  NONE:      'none',
  DAILY:     'daily',
  WEEKLY:    'weekly',
  MONTHLY:   'monthly',
  QUARTERLY: 'quarterly',
  ANNUAL:    'annual',
});

/** Urgency levels and their thresholds in milliseconds. */
export const URGENCY = Object.freeze({
  OVERDUE:   'overdue',
  CRITICAL:  'critical',   // within 24 hours
  URGENT:    'urgent',     // within 3 days
  UPCOMING:  'upcoming',   // within 7 days
  SCHEDULED: 'scheduled',  // more than 7 days away
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const URGENCY_THRESHOLDS = Object.freeze({
  critical: 1 * MS_PER_DAY,
  urgent:   3 * MS_PER_DAY,
  upcoming: 7 * MS_PER_DAY,
});

/** CDD review cycle in months based on customer risk rating. */
export const CDD_REVIEW_CYCLES = Object.freeze({
  high:   6,
  medium: 12,
  low:    24,
});

/**
 * UAE public holidays for 2026.
 * Dates are in YYYY-MM-DD format.
 */
export const UAE_HOLIDAYS_2026 = Object.freeze([
  '2026-01-01', // New Year's Day
  '2026-03-20', // Isra'a and Mi'raj (estimated)
  '2026-04-12', // Start of Ramadan (estimated)
  '2026-05-12', // Eid Al Fitr (estimated, day 1)
  '2026-05-13', // Eid Al Fitr (estimated, day 2)
  '2026-05-14', // Eid Al Fitr (estimated, day 3)
  '2026-06-28', // Arafat Day (estimated)
  '2026-06-29', // Eid Al Adha (estimated, day 1)
  '2026-06-30', // Eid Al Adha (estimated, day 2)
  '2026-07-01', // Eid Al Adha (estimated, day 3)
  '2026-07-20', // Islamic New Year (estimated)
  '2026-09-28', // Prophet's Birthday (estimated)
  '2026-12-01', // Commemoration Day
  '2026-12-02', // UAE National Day
  '2026-12-03', // UAE National Day (extended)
]);

/* ------------------------------------------------------------------ */
/*  Date utility functions                                             */
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
 * Check whether a date falls on a weekend (Saturday or Sunday).
 *
 * @param {Date} d
 * @returns {boolean}
 */
function isWeekend(d) {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Check whether a date string is a UAE public holiday.
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string[]} holidays - Array of YYYY-MM-DD strings
 * @returns {boolean}
 */
function isHoliday(dateStr, holidays) {
  return holidays.includes(dateStr);
}

/**
 * Advance a date by the given number of business days, skipping weekends
 * and optionally UAE public holidays.
 *
 * @param {Date} start
 * @param {number} businessDays - Number of business days to advance
 * @param {boolean} [skipHolidays] - Whether to skip UAE public holidays
 * @param {string[]} [holidays] - Holiday dates to skip
 * @returns {Date}
 */
export function addBusinessDays(start, businessDays, skipHolidays = true, holidays = UAE_HOLIDAYS_2026) {
  if (typeof businessDays !== 'number' || businessDays < 0) {
    throw new Error('businessDays must be a non-negative number');
  }

  let current = new Date(start.getTime());
  let remaining = businessDays;

  while (remaining > 0) {
    current = new Date(current.getTime() + MS_PER_DAY);
    const dateStr = fmtDate(current);
    if (!isWeekend(current) && !(skipHolidays && isHoliday(dateStr, holidays))) {
      remaining--;
    }
  }

  return current;
}

/**
 * Count business days between two dates (exclusive of end).
 *
 * @param {Date} from
 * @param {Date} to
 * @param {boolean} [skipHolidays]
 * @param {string[]} [holidays]
 * @returns {number} Positive if to > from, negative if to < from
 */
export function businessDaysBetween(from, to, skipHolidays = true, holidays = UAE_HOLIDAYS_2026) {
  const sign = to.getTime() >= from.getTime() ? 1 : -1;
  const start = sign === 1 ? from : to;
  const end = sign === 1 ? to : from;
  let count = 0;
  let current = new Date(start.getTime());

  while (current.getTime() < end.getTime()) {
    current = new Date(current.getTime() + MS_PER_DAY);
    const dateStr = fmtDate(current);
    if (!isWeekend(current) && !(skipHolidays && isHoliday(dateStr, holidays))) {
      count++;
    }
  }

  return count * sign;
}

/**
 * Calculate the next occurrence of a recurring event after a given anchor date.
 *
 * @param {string} anchorDateStr - The last occurrence or start date (YYYY-MM-DD)
 * @param {string} recurrence    - One of RECURRENCE values
 * @returns {string} Next occurrence as YYYY-MM-DD
 */
export function nextOccurrence(anchorDateStr, recurrence) {
  const anchor = parseDate(anchorDateStr);

  switch (recurrence) {
    case RECURRENCE.DAILY: {
      const next = new Date(anchor.getTime() + MS_PER_DAY);
      return fmtDate(next);
    }
    case RECURRENCE.WEEKLY: {
      const next = new Date(anchor.getTime() + 7 * MS_PER_DAY);
      return fmtDate(next);
    }
    case RECURRENCE.MONTHLY: {
      const next = new Date(anchor);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return fmtDate(next);
    }
    case RECURRENCE.QUARTERLY: {
      const next = new Date(anchor);
      next.setUTCMonth(next.getUTCMonth() + 3);
      return fmtDate(next);
    }
    case RECURRENCE.ANNUAL: {
      const next = new Date(anchor);
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      return fmtDate(next);
    }
    case RECURRENCE.NONE:
      return anchorDateStr;
    default:
      throw new Error(`Unknown recurrence: ${recurrence}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Urgency classification                                             */
/* ------------------------------------------------------------------ */

/**
 * Classify the urgency of a deadline relative to the current date.
 *
 * @param {string} deadlineDateStr - YYYY-MM-DD
 * @param {Date} [now] - Reference date (default: current time)
 * @returns {string} One of URGENCY values
 */
export function classifyUrgency(deadlineDateStr, now = new Date()) {
  const deadline = parseDate(deadlineDateStr);
  const diff = deadline.getTime() - now.getTime();

  if (diff < 0) {
    return URGENCY.OVERDUE;
  }
  if (diff <= URGENCY_THRESHOLDS.critical) {
    return URGENCY.CRITICAL;
  }
  if (diff <= URGENCY_THRESHOLDS.urgent) {
    return URGENCY.URGENT;
  }
  if (diff <= URGENCY_THRESHOLDS.upcoming) {
    return URGENCY.UPCOMING;
  }
  return URGENCY.SCHEDULED;
}

/* ------------------------------------------------------------------ */
/*  ComplianceCalendar                                                 */
/* ------------------------------------------------------------------ */

export class ComplianceCalendar {
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
    this.events = new Map();

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
        for (const evt of raw.events || []) {
          this.events.set(evt.id, evt);
        }
      } catch (err) {
        throw new Error(`Failed to load calendar register: ${err.message}`);
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
      events: [...this.events.values()],
    };
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.registerPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /* ---- Event management -------------------------------------------- */

  /**
   * Add a calendar event.
   *
   * @param {object} params
   * @param {string} params.title       - Short description
   * @param {string} params.type        - One of EVENT_TYPES values
   * @param {string} params.dueDate     - YYYY-MM-DD
   * @param {string} [params.recurrence]  - One of RECURRENCE values (default: none)
   * @param {string} [params.entityName]  - Related entity name
   * @param {string} [params.entityId]    - Related entity identifier
   * @param {string} [params.description] - Extended detail
   * @param {string} [params.assignee]    - Responsible person
   * @returns {Promise<object>} The created event
   */
  async addEvent(params) {
    await this.load();

    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.title || typeof params.title !== 'string') {
      throw new Error('params.title is required and must be a string');
    }
    if (!params.type || !Object.values(EVENT_TYPES).includes(params.type)) {
      throw new Error(`params.type must be one of: ${Object.values(EVENT_TYPES).join(', ')}`);
    }
    if (!params.dueDate || typeof params.dueDate !== 'string') {
      throw new Error('params.dueDate is required (YYYY-MM-DD)');
    }

    // Validate the date parses
    parseDate(params.dueDate);

    const recurrence = params.recurrence || RECURRENCE.NONE;
    if (!Object.values(RECURRENCE).includes(recurrence)) {
      throw new Error(`params.recurrence must be one of: ${Object.values(RECURRENCE).join(', ')}`);
    }

    const id = `CAL-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const event = {
      id,
      title: params.title,
      type: params.type,
      dueDate: params.dueDate,
      recurrence,
      entityName: params.entityName || null,
      entityId: params.entityId || null,
      description: params.description || '',
      assignee: params.assignee || null,
      completed: false,
      completedDate: null,
      createdAt: now,
      updatedAt: now,
    };

    this.events.set(id, event);
    return event;
  }

  /**
   * Mark an event as completed. If the event is recurring, automatically
   * generate the next occurrence.
   *
   * @param {string} eventId
   * @param {string} [completedDate] - YYYY-MM-DD (defaults to today)
   * @returns {Promise<{completed: object, next: object|null}>}
   */
  async completeEvent(eventId, completedDate) {
    await this.load();

    const event = this.events.get(eventId);
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }
    if (event.completed) {
      throw new Error(`Event already completed: ${eventId}`);
    }

    const now = new Date().toISOString();
    const dateStr = completedDate || fmtDate(new Date());

    event.completed = true;
    event.completedDate = dateStr;
    event.updatedAt = now;

    let nextEvent = null;
    if (event.recurrence !== RECURRENCE.NONE) {
      const nextDue = nextOccurrence(event.dueDate, event.recurrence);
      nextEvent = await this.addEvent({
        title: event.title,
        type: event.type,
        dueDate: nextDue,
        recurrence: event.recurrence,
        entityName: event.entityName,
        entityId: event.entityId,
        description: event.description,
        assignee: event.assignee,
      });
    }

    return { completed: event, next: nextEvent };
  }

  /**
   * Remove an event from the calendar.
   *
   * @param {string} eventId
   * @returns {boolean}
   */
  removeEvent(eventId) {
    return this.events.delete(eventId);
  }

  /**
   * Retrieve a single event by ID.
   *
   * @param {string} eventId
   * @returns {object|null}
   */
  getEvent(eventId) {
    return this.events.get(eventId) || null;
  }

  /* ---- Querying and filtering -------------------------------------- */

  /**
   * List all events, optionally filtered by criteria.
   *
   * @param {object} [filters]
   * @param {string} [filters.type]       - Filter by event type
   * @param {string} [filters.fromDate]   - Include events on or after (YYYY-MM-DD)
   * @param {string} [filters.toDate]     - Include events on or before (YYYY-MM-DD)
   * @param {string} [filters.entityId]   - Filter by entity identifier
   * @param {string} [filters.entityName] - Filter by entity name (case-insensitive substring)
   * @param {string} [filters.urgency]    - Filter by urgency level
   * @param {boolean} [filters.pendingOnly] - Exclude completed events (default: false)
   * @returns {Promise<object[]>} Sorted by dueDate ascending
   */
  async listEvents(filters = {}) {
    await this.load();

    let results = [...this.events.values()];

    if (filters.pendingOnly === true) {
      results = results.filter(e => !e.completed);
    }

    if (filters.type) {
      results = results.filter(e => e.type === filters.type);
    }

    if (filters.fromDate) {
      results = results.filter(e => e.dueDate >= filters.fromDate);
    }

    if (filters.toDate) {
      results = results.filter(e => e.dueDate <= filters.toDate);
    }

    if (filters.entityId) {
      results = results.filter(e => e.entityId === filters.entityId);
    }

    if (filters.entityName) {
      const needle = filters.entityName.toLowerCase();
      results = results.filter(
        e => e.entityName !== null && e.entityName.toLowerCase().includes(needle)
      );
    }

    if (filters.urgency) {
      results = results.filter(e => classifyUrgency(e.dueDate) === filters.urgency);
    }

    results.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return results;
  }

  /**
   * Generate a reminder list of upcoming deadlines.
   *
   * @param {Date} [now] - Reference date (default: current time)
   * @returns {Promise<Array<{event: object, urgency: string, daysRemaining: number}>>}
   */
  async getReminders(now = new Date()) {
    await this.load();

    const pending = [...this.events.values()].filter(e => !e.completed);
    const reminders = [];

    for (const event of pending) {
      const urgency = classifyUrgency(event.dueDate, now);
      if (urgency === URGENCY.SCHEDULED) continue;

      const deadline = parseDate(event.dueDate);
      const diffMs = deadline.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / MS_PER_DAY);

      reminders.push({
        event,
        urgency,
        daysRemaining,
      });
    }

    // Sort: overdue first, then by days remaining ascending
    const urgencyOrder = { overdue: 0, critical: 1, urgent: 2, upcoming: 3 };
    reminders.sort((a, b) => {
      const ao = urgencyOrder[a.urgency] ?? 99;
      const bo = urgencyOrder[b.urgency] ?? 99;
      if (ao !== bo) return ao - bo;
      return a.daysRemaining - b.daysRemaining;
    });

    return reminders;
  }

  /* ---- Statistics -------------------------------------------------- */

  /**
   * Compute compliance calendar statistics.
   *
   * @param {Date} [now] - Reference date
   * @returns {Promise<object>}
   */
  async getStatistics(now = new Date()) {
    await this.load();

    const all = [...this.events.values()];
    const pending = all.filter(e => !e.completed);
    const completed = all.filter(e => e.completed);

    let overdueCount = 0;
    let criticalCount = 0;
    let urgentCount = 0;
    let upcomingThisWeek = 0;

    const weekEnd = new Date(now.getTime() + 7 * MS_PER_DAY);
    const weekEndStr = fmtDate(weekEnd);
    const nowStr = fmtDate(now);

    for (const event of pending) {
      const urgency = classifyUrgency(event.dueDate, now);
      if (urgency === URGENCY.OVERDUE) overdueCount++;
      if (urgency === URGENCY.CRITICAL) criticalCount++;
      if (urgency === URGENCY.URGENT) urgentCount++;
      if (event.dueDate >= nowStr && event.dueDate <= weekEndStr) {
        upcomingThisWeek++;
      }
    }

    const completionRate = all.length > 0
      ? (completed.length / all.length * 100).toFixed(1)
      : '0.0';

    // Breakdown by type
    const byType = {};
    for (const type of Object.values(EVENT_TYPES)) {
      byType[type] = {
        total: all.filter(e => e.type === type).length,
        pending: pending.filter(e => e.type === type).length,
        completed: completed.filter(e => e.type === type).length,
      };
    }

    return {
      totalEvents: all.length,
      pendingEvents: pending.length,
      completedEvents: completed.length,
      overdueCount,
      criticalCount,
      urgentCount,
      upcomingThisWeek,
      completionRate: `${completionRate}%`,
      byType,
    };
  }

  /* ---- Entity-specific CDD deadlines ------------------------------- */

  /**
   * Add a CDD review deadline for an entity based on its risk rating.
   * The review is due N months from the last review date, where N
   * depends on the risk level.
   *
   * @param {object} params
   * @param {string} params.entityName - Entity legal name
   * @param {string} params.entityId   - Entity identifier
   * @param {string} params.riskRating - high, medium, or low
   * @param {string} params.lastReviewDate - YYYY-MM-DD
   * @param {string} [params.assignee]
   * @returns {Promise<object>} The created calendar event
   */
  async addCddReviewDeadline(params) {
    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.entityName || typeof params.entityName !== 'string') {
      throw new Error('params.entityName is required');
    }
    if (!params.entityId || typeof params.entityId !== 'string') {
      throw new Error('params.entityId is required');
    }
    if (!params.riskRating || !CDD_REVIEW_CYCLES[params.riskRating]) {
      throw new Error(`params.riskRating must be one of: ${Object.keys(CDD_REVIEW_CYCLES).join(', ')}`);
    }
    if (!params.lastReviewDate || typeof params.lastReviewDate !== 'string') {
      throw new Error('params.lastReviewDate is required (YYYY-MM-DD)');
    }

    const monthsUntilReview = CDD_REVIEW_CYCLES[params.riskRating];
    const lastReview = parseDate(params.lastReviewDate);
    const dueDate = new Date(lastReview);
    dueDate.setUTCMonth(dueDate.getUTCMonth() + monthsUntilReview);

    return this.addEvent({
      title: `CDD review due: ${params.entityName} (${params.riskRating} risk)`,
      type: EVENT_TYPES.CDD_REVIEW,
      dueDate: fmtDate(dueDate),
      recurrence: RECURRENCE.NONE,
      entityName: params.entityName,
      entityId: params.entityId,
      description: `CDD review cycle: ${monthsUntilReview} months (${params.riskRating} risk). Last review: ${params.lastReviewDate}.`,
      assignee: params.assignee || null,
    });
  }

  /* ---- Auto-populate standard DPMS calendar ------------------------ */

  /**
   * Populate the calendar with the standard compliance obligations for
   * a UAE-licensed Dealer in Precious Metals and Stones. This covers
   * all recurring filing, reporting, training, and review deadlines
   * required under Federal Decree-Law No. 10/2025.
   *
   * @param {object} params
   * @param {string} params.entityName - Legal name of the reporting entity
   * @param {string} params.mlroName   - MLRO full name
   * @param {number} params.year       - Calendar year to populate
   * @returns {Promise<object[]>} Array of created events
   */
  async populateStandardCalendar(params) {
    if (!params || typeof params !== 'object') {
      throw new Error('params object is required');
    }
    if (!params.entityName || typeof params.entityName !== 'string') {
      throw new Error('params.entityName is required');
    }
    if (!params.mlroName || typeof params.mlroName !== 'string') {
      throw new Error('params.mlroName is required');
    }
    if (typeof params.year !== 'number' || params.year < 2020) {
      throw new Error('params.year must be a valid year (2020+)');
    }

    const y = params.year;
    const created = [];

    // Monthly MLRO report to senior management
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      created.push(await this.addEvent({
        title: `Monthly MLRO report to senior management (${y}-${monthStr})`,
        type: EVENT_TYPES.REPORT_DUE,
        dueDate: `${y}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
        recurrence: RECURRENCE.NONE,
        entityName: params.entityName,
        description: 'Monthly report summarising AML/CFT compliance activity, screening results, filing activity, and risk indicators.',
        assignee: params.mlroName,
      }));
    }

    // Quarterly risk assessment review
    const quarterEnds = [`${y}-03-31`, `${y}-06-30`, `${y}-09-30`, `${y}-12-31`];
    for (let q = 0; q < 4; q++) {
      created.push(await this.addEvent({
        title: `Quarterly risk assessment review (Q${q + 1} ${y})`,
        type: EVENT_TYPES.FILING_DEADLINE,
        dueDate: quarterEnds[q],
        recurrence: RECURRENCE.NONE,
        entityName: params.entityName,
        description: 'Quarterly review of the enterprise-wide AML/CFT risk assessment, including jurisdiction risk, product risk, and customer risk.',
        assignee: params.mlroName,
      }));
    }

    // Annual enterprise-wide risk assessment
    created.push(await this.addEvent({
      title: `Annual enterprise-wide AML/CFT risk assessment (${y})`,
      type: EVENT_TYPES.FILING_DEADLINE,
      dueDate: `${y}-03-31`,
      recurrence: RECURRENCE.NONE,
      entityName: params.entityName,
      description: 'Full annual AML/CFT risk assessment as required under Federal Decree-Law No. 10/2025.',
      assignee: params.mlroName,
    }));

    // Annual AML/CFT training for all staff
    created.push(await this.addEvent({
      title: `Annual AML/CFT staff training (${y})`,
      type: EVENT_TYPES.TRAINING_DUE,
      dueDate: `${y}-06-30`,
      recurrence: RECURRENCE.NONE,
      entityName: params.entityName,
      description: 'Annual refresher AML/CFT training for all staff, including sanctions awareness and typology updates.',
      assignee: params.mlroName,
    }));

    // DNFBP Self-Assessment Questionnaire
    created.push(await this.addEvent({
      title: `DNFBP Self-Assessment Questionnaire submission (${y})`,
      type: EVENT_TYPES.FILING_DEADLINE,
      dueDate: `${y}-04-30`,
      recurrence: RECURRENCE.NONE,
      entityName: params.entityName,
      description: 'Annual self-assessment questionnaire for the Ministry of Economy.',
      assignee: params.mlroName,
    }));

    // Annual compliance programme review
    created.push(await this.addEvent({
      title: `Annual compliance programme review (${y})`,
      type: EVENT_TYPES.REPORT_DUE,
      dueDate: `${y}-12-15`,
      recurrence: RECURRENCE.NONE,
      entityName: params.entityName,
      description: 'Comprehensive annual review of policies, procedures, and controls.',
      assignee: params.mlroName,
    }));

    // Annual independent audit of AML/CFT programme
    created.push(await this.addEvent({
      title: `Annual independent AML/CFT audit (${y})`,
      type: EVENT_TYPES.REPORT_DUE,
      dueDate: `${y}-09-30`,
      recurrence: RECURRENCE.NONE,
      entityName: params.entityName,
      description: 'Independent audit or review of the AML/CFT compliance programme.',
      assignee: params.mlroName,
    }));

    // Sanctions list update check (weekly recurring)
    created.push(await this.addEvent({
      title: 'Sanctions list update verification',
      type: EVENT_TYPES.FILING_DEADLINE,
      dueDate: `${y}-01-05`,
      recurrence: RECURRENCE.WEEKLY,
      entityName: params.entityName,
      description: 'Verify that all sanctions screening lists are current. The applicable targeted financial sanctions framework requires screening without delay.',
      assignee: params.mlroName,
    }));

    // Daily screening confirmation
    created.push(await this.addEvent({
      title: 'Daily sanctions screening confirmation',
      type: EVENT_TYPES.FILING_DEADLINE,
      dueDate: `${y}-01-01`,
      recurrence: RECURRENCE.DAILY,
      entityName: params.entityName,
      description: 'Confirm that all active customers and counterparties have been screened against current sanctions lists.',
    }));

    // Inspection preparedness review (quarterly)
    for (let q = 0; q < 4; q++) {
      created.push(await this.addEvent({
        title: `Inspection preparedness review (Q${q + 1} ${y})`,
        type: EVENT_TYPES.INSPECTION_PREP,
        dueDate: quarterEnds[q],
        recurrence: RECURRENCE.NONE,
        entityName: params.entityName,
        description: 'Review readiness for potential supervisory inspection: evidence packs, CDD files, training records, policy documents.',
        assignee: params.mlroName,
      }));
    }

    return created;
  }

  /* ---- Plain-text export ------------------------------------------- */

  /**
   * Export the calendar as a plain-text schedule.
   *
   * @param {object} [options]
   * @param {boolean} [options.pendingOnly] - Only show pending events
   * @param {string}  [options.fromDate]    - Start date filter
   * @param {string}  [options.toDate]      - End date filter
   * @param {Date}    [options.now]         - Reference date for urgency
   * @returns {Promise<string>}
   */
  async exportAsText(options = {}) {
    const now = options.now || new Date();
    const events = await this.listEvents({
      pendingOnly: options.pendingOnly,
      fromDate: options.fromDate,
      toDate: options.toDate,
    });

    const stats = await this.getStatistics(now);

    const lines = [];
    lines.push('========================================================================');
    lines.push('COMPLIANCE CALENDAR');
    lines.push('========================================================================');
    lines.push('');

    // Statistics summary
    lines.push('SUMMARY');
    lines.push('');
    lines.push(`Total events:         ${stats.totalEvents}`);
    lines.push(`Pending:              ${stats.pendingEvents}`);
    lines.push(`Completed:            ${stats.completedEvents}`);
    lines.push(`Overdue:              ${stats.overdueCount}`);
    lines.push(`Critical (24h):       ${stats.criticalCount}`);
    lines.push(`Urgent (3 days):      ${stats.urgentCount}`);
    lines.push(`Upcoming this week:   ${stats.upcomingThisWeek}`);
    lines.push(`Completion rate:      ${stats.completionRate}`);
    lines.push('');
    lines.push('------------------------------------------------------------------------');
    lines.push('');

    // Events
    if (events.length === 0) {
      lines.push('No events match the specified criteria.');
    } else {
      for (const event of events) {
        const urgency = event.completed
          ? 'DONE'
          : classifyUrgency(event.dueDate, now).toUpperCase();

        lines.push(`[${urgency}]  ${event.dueDate}  ${event.title}`);
        lines.push(`  Type: ${event.type}    Recurrence: ${event.recurrence}`);
        if (event.assignee) {
          lines.push(`  Assignee: ${event.assignee}`);
        }
        if (event.entityName) {
          lines.push(`  Entity: ${event.entityName}`);
        }
        if (event.description) {
          lines.push(`  ${event.description}`);
        }
        if (event.completed && event.completedDate) {
          lines.push(`  Completed: ${event.completedDate}`);
        }
        lines.push('');
      }
    }

    lines.push('========================================================================');
    lines.push('');
    lines.push('For review by the MLRO.');
    lines.push('');

    return lines.join('\n');
  }
}
