/**
 * Custom Detection Rule Engine.
 *
 * Enables compliance officers to define and manage screening and
 * transaction monitoring rules without writing code. Rules are
 * evaluated against a context object containing transaction,
 * entity, and screening data.
 *
 * Capabilities:
 *   - JSON rule definitions with conditions, actions, and priorities
 *   - 11 operators: equals, not_equals, greater_than, less_than,
 *     contains, not_contains, in_list, matches_regex, between,
 *     is_empty, is_not_empty
 *   - 6 action types: alert, block, escalate, flag_for_review,
 *     add_to_watchlist, require_edd
 *   - Priority ordering and rule chaining
 *   - Rule versioning and change tracking
 *   - 10 pre-configured DPMS rules
 *   - Dry-run testing against sample data
 *   - Statistics: fire counts, false positive tracking
 *
 * References:
 *   - Federal Decree-Law No. 10/2025, Art. 15-16 (monitoring obligations)
 *   - Cabinet Resolution 134/2025, Art. 8 (ongoing monitoring systems)
 *   - FATF Recommendation 20 (suspicious transaction reporting)
 *
 * Zero external dependencies.
 */

// ─────────────────────────────────────────────────────────────────────
//  Rule Schema
// ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} RuleCondition
 * @property {string} field - Dot-notation path: transaction.amount, entity.country, etc.
 * @property {string} operator - One of the supported operators
 * @property {*} value - Comparison value (type depends on operator)
 */

/**
 * @typedef {object} RuleAction
 * @property {string} type - alert | block | escalate | flag_for_review | add_to_watchlist | require_edd
 * @property {object} [params] - Action-specific parameters
 */

/**
 * @typedef {object} Rule
 * @property {string} id - Unique rule identifier
 * @property {string} name - Human-readable rule name
 * @property {string} description - Detailed description
 * @property {boolean} enabled - Whether the rule is active
 * @property {number} priority - Higher = evaluated first (1-100)
 * @property {Array<RuleCondition>} conditions - All must match (AND logic)
 * @property {Array<RuleAction>} actions - Executed when all conditions match
 * @property {string} severity - low | medium | high | critical
 * @property {string} category - Rule category for grouping
 * @property {string} [chainGroup] - If set, triggers evaluation of this group when rule fires
 * @property {number} [version] - Auto-incremented on updates
 * @property {string} [createdAt] - ISO timestamp
 * @property {string} [updatedAt] - ISO timestamp
 */

/**
 * @typedef {object} RuleEvalResult
 * @property {string} ruleId
 * @property {string} ruleName
 * @property {boolean} matched
 * @property {Array<RuleAction>} actions - Actions triggered
 * @property {string} severity
 * @property {Array<{ field: string, operator: string, passed: boolean, actual: *, expected: * }>} conditionResults
 * @property {string} evaluatedAt
 */

// ─────────────────────────────────────────────────────────────────────
//  Supported Operators
// ─────────────────────────────────────────────────────────────────────

const OPERATORS = {
  /**
   * @param {*} actual
   * @param {*} expected
   * @returns {boolean}
   */
  equals(actual, expected) {
    if (actual === undefined || actual === null) return expected === null || expected === undefined;
    return String(actual).toLowerCase() === String(expected).toLowerCase();
  },

  not_equals(actual, expected) {
    return !OPERATORS.equals(actual, expected);
  },

  greater_than(actual, expected) {
    const a = Number(actual);
    const e = Number(expected);
    if (Number.isNaN(a) || Number.isNaN(e)) return false;
    return a > e;
  },

  less_than(actual, expected) {
    const a = Number(actual);
    const e = Number(expected);
    if (Number.isNaN(a) || Number.isNaN(e)) return false;
    return a < e;
  },

  contains(actual, expected) {
    if (actual === undefined || actual === null) return false;
    return String(actual).toLowerCase().includes(String(expected).toLowerCase());
  },

  not_contains(actual, expected) {
    return !OPERATORS.contains(actual, expected);
  },

  in_list(actual, expected) {
    if (!Array.isArray(expected)) return false;
    if (actual === undefined || actual === null) return false;
    const lower = String(actual).toLowerCase();
    return expected.some(item => String(item).toLowerCase() === lower);
  },

  matches_regex(actual, expected) {
    if (actual === undefined || actual === null) return false;
    try {
      const regex = new RegExp(expected, 'i');
      return regex.test(String(actual));
    } catch {
      return false;
    }
  },

  between(actual, expected) {
    if (!Array.isArray(expected) || expected.length !== 2) return false;
    const a = Number(actual);
    const lo = Number(expected[0]);
    const hi = Number(expected[1]);
    if (Number.isNaN(a) || Number.isNaN(lo) || Number.isNaN(hi)) return false;
    return a >= lo && a <= hi;
  },

  is_empty(actual) {
    if (actual === undefined || actual === null || actual === '') return true;
    if (Array.isArray(actual)) return actual.length === 0;
    return false;
  },

  is_not_empty(actual) {
    return !OPERATORS.is_empty(actual);
  },
};

// ─────────────────────────────────────────────────────────────────────
//  Supported Actions
// ─────────────────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set([
  'alert',
  'block',
  'escalate',
  'flag_for_review',
  'add_to_watchlist',
  'require_edd',
]);

// ─────────────────────────────────────────────────────────────────────
//  Supported Fields (for validation)
// ─────────────────────────────────────────────────────────────────────

const VALID_FIELDS = new Set([
  'transaction.amount',
  'transaction.method',
  'transaction.country',
  'transaction.currency',
  'transaction.type',
  'transaction.counterparty',
  'transaction.date',
  'entity.risk_score',
  'entity.country',
  'entity.is_pep',
  'entity.type',
  'entity.name',
  'entity.relationship_months',
  'screening.band',
  'screening.score',
  'screening.source',
  'screening.topics',
]);

// ─────────────────────────────────────────────────────────────────────
//  Utility: resolve a dot-notation path on an object
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve a dot-notation field path on a context object.
 * e.g. resolveField({ transaction: { amount: 50000 } }, 'transaction.amount') => 50000
 *
 * @param {object} ctx - Context object
 * @param {string} field - Dot-notation path
 * @returns {*}
 */
function resolveField(ctx, field) {
  if (!ctx || !field) return undefined;
  const parts = field.split('.');
  let current = ctx;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

// ─────────────────────────────────────────────────────────────────────
//  Rule Validation
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate a rule definition. Returns an array of error strings
 * (empty if the rule is valid).
 *
 * @param {Rule} rule
 * @returns {Array<string>}
 */
export function validateRule(rule) {
  const errors = [];

  if (!rule) {
    errors.push('Rule is null or undefined');
    return errors;
  }
  if (!rule.id || typeof rule.id !== 'string') {
    errors.push('Rule must have a string "id"');
  }
  if (!rule.name || typeof rule.name !== 'string') {
    errors.push('Rule must have a string "name"');
  }
  if (typeof rule.enabled !== 'boolean') {
    errors.push('Rule "enabled" must be a boolean');
  }
  if (typeof rule.priority !== 'number' || rule.priority < 1 || rule.priority > 100) {
    errors.push('Rule "priority" must be a number between 1 and 100');
  }
  if (!['low', 'medium', 'high', 'critical'].includes(rule.severity)) {
    errors.push('Rule "severity" must be one of: low, medium, high, critical');
  }
  if (!rule.category || typeof rule.category !== 'string') {
    errors.push('Rule must have a string "category"');
  }

  // Validate conditions
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    errors.push('Rule must have at least one condition');
  } else {
    for (let i = 0; i < rule.conditions.length; i++) {
      const c = rule.conditions[i];
      if (!c.field || typeof c.field !== 'string') {
        errors.push(`Condition ${i}: must have a string "field"`);
      }
      if (!c.operator || !OPERATORS[c.operator]) {
        errors.push(`Condition ${i}: unknown operator "${c.operator}". Valid: ${Object.keys(OPERATORS).join(', ')}`);
      }
      // value is optional for is_empty / is_not_empty
      if (c.operator !== 'is_empty' && c.operator !== 'is_not_empty' && c.value === undefined) {
        errors.push(`Condition ${i}: "value" is required for operator "${c.operator}"`);
      }
    }
  }

  // Validate actions
  if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
    errors.push('Rule must have at least one action');
  } else {
    for (let i = 0; i < rule.actions.length; i++) {
      const a = rule.actions[i];
      if (!a.type || !VALID_ACTIONS.has(a.type)) {
        errors.push(`Action ${i}: unknown type "${a.type}". Valid: ${[...VALID_ACTIONS].join(', ')}`);
      }
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────
//  Rule Engine
// ─────────────────────────────────────────────────────────────────────

/**
 * Custom detection rule engine. Stores rules, evaluates them against
 * context objects, and tracks statistics.
 */
export class RuleEngine {
  constructor() {
    /** @type {Map<string, Rule>} */
    this.rules = new Map();
    /** @type {Map<string, Array<Rule>>} version history: ruleId -> versions */
    this.versionHistory = new Map();
    /** @type {Map<string, { fired: number, falsePositives: number, truePositives: number }>} */
    this.ruleStats = new Map();
    /** @type {Array<object>} evaluation history for auditing */
    this.evaluationLog = [];
  }

  /**
   * Add or update a rule. Validates the rule and maintains version history.
   *
   * @param {Rule} rule
   * @returns {{ success: boolean, errors: Array<string> }}
   */
  addRule(rule) {
    const errors = validateRule(rule);
    if (errors.length > 0) {
      return { success: false, errors };
    }

    const existing = this.rules.get(rule.id);
    const version = existing ? (existing.version || 1) + 1 : 1;

    const stored = {
      ...rule,
      version,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Archive previous version
    if (existing) {
      if (!this.versionHistory.has(rule.id)) {
        this.versionHistory.set(rule.id, []);
      }
      this.versionHistory.get(rule.id).push({ ...existing });
    }

    this.rules.set(rule.id, stored);

    // Initialize stats if new
    if (!this.ruleStats.has(rule.id)) {
      this.ruleStats.set(rule.id, { fired: 0, falsePositives: 0, truePositives: 0 });
    }

    return { success: true, errors: [] };
  }

  /**
   * Remove a rule by ID.
   * @param {string} ruleId
   * @returns {boolean}
   */
  removeRule(ruleId) {
    return this.rules.delete(ruleId);
  }

  /**
   * Enable or disable a rule.
   * @param {string} ruleId
   * @param {boolean} enabled
   * @returns {boolean}
   */
  setEnabled(ruleId, enabled) {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    rule.enabled = enabled;
    rule.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Get a rule by ID.
   * @param {string} ruleId
   * @returns {Rule|undefined}
   */
  getRule(ruleId) {
    return this.rules.get(ruleId);
  }

  /**
   * Get all rules, optionally filtered.
   * @param {object} [filter]
   * @param {boolean} [filter.enabledOnly]
   * @param {string} [filter.category]
   * @param {string} [filter.severity]
   * @returns {Array<Rule>}
   */
  getRules(filter = {}) {
    let rules = [...this.rules.values()];
    if (filter.enabledOnly) {
      rules = rules.filter(r => r.enabled);
    }
    if (filter.category) {
      rules = rules.filter(r => r.category === filter.category);
    }
    if (filter.severity) {
      rules = rules.filter(r => r.severity === filter.severity);
    }
    return rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get version history for a rule.
   * @param {string} ruleId
   * @returns {Array<Rule>}
   */
  getVersionHistory(ruleId) {
    return this.versionHistory.get(ruleId) || [];
  }

  /**
   * Evaluate all enabled rules against a context object.
   * Rules are evaluated in priority order (highest first).
   * When a rule fires and has a chainGroup, the engine also evaluates
   * all rules in that group.
   *
   * @param {object} context - The screening/transaction context
   * @param {object} [opts]
   * @param {boolean} [opts.dryRun] - If true, do not update stats or log
   * @param {boolean} [opts.stopOnBlock] - If true, stop after first block action
   * @returns {{ results: Array<RuleEvalResult>, triggered: Array<RuleEvalResult>, actions: Array<RuleAction>, summary: object }}
   */
  evaluate(context, opts = {}) {
    if (!context || typeof context !== 'object') {
      throw new Error('RuleEngine.evaluate: context object is required');
    }

    const dryRun = opts.dryRun === true;
    const stopOnBlock = opts.stopOnBlock === true;

    // Get enabled rules sorted by priority descending
    const rules = this.getRules({ enabledOnly: true });

    const results = [];
    const triggered = [];
    const allActions = [];
    const evaluatedGroups = new Set();
    let blocked = false;

    /**
     * Evaluate a single rule.
     * @param {Rule} rule
     * @returns {RuleEvalResult}
     */
    const evalRule = (rule) => {
      const conditionResults = [];
      let allMatch = true;

      for (const condition of rule.conditions) {
        const actual = resolveField(context, condition.field);
        const opFn = OPERATORS[condition.operator];
        let passed = false;

        if (opFn) {
          passed = opFn(actual, condition.value);
        }

        conditionResults.push({
          field: condition.field,
          operator: condition.operator,
          passed,
          actual: actual !== undefined ? actual : null,
          expected: condition.value !== undefined ? condition.value : null,
        });

        if (!passed) {
          allMatch = false;
        }
      }

      /** @type {RuleEvalResult} */
      const result = {
        ruleId: rule.id,
        ruleName: rule.name,
        matched: allMatch,
        actions: allMatch ? rule.actions : [],
        severity: rule.severity,
        conditionResults,
        evaluatedAt: new Date().toISOString(),
      };

      return result;
    };

    // Evaluate all rules
    for (const rule of rules) {
      if (blocked && stopOnBlock) break;

      const result = evalRule(rule);
      results.push(result);

      if (result.matched) {
        triggered.push(result);
        allActions.push(...result.actions);

        // Update stats (unless dry run)
        if (!dryRun) {
          const stats = this.ruleStats.get(rule.id);
          if (stats) {
            stats.fired++;
          }
        }

        // Check for block action
        if (result.actions.some(a => a.type === 'block')) {
          blocked = true;
        }

        // Rule chaining: evaluate chain group
        if (rule.chainGroup && !evaluatedGroups.has(rule.chainGroup)) {
          evaluatedGroups.add(rule.chainGroup);
          const chainRules = rules.filter(
            r => r.category === rule.chainGroup && r.id !== rule.id
          );
          for (const chainRule of chainRules) {
            if (blocked && stopOnBlock) break;
            const chainResult = evalRule(chainRule);
            results.push(chainResult);
            if (chainResult.matched) {
              triggered.push(chainResult);
              allActions.push(...chainResult.actions);
              if (!dryRun) {
                const cs = this.ruleStats.get(chainRule.id);
                if (cs) cs.fired++;
              }
              if (chainResult.actions.some(a => a.type === 'block')) {
                blocked = true;
              }
            }
          }
        }
      }
    }

    // Deduplicate actions by type
    const uniqueActions = [];
    const actionSet = new Set();
    for (const action of allActions) {
      const key = `${action.type}:${JSON.stringify(action.params || {})}`;
      if (!actionSet.has(key)) {
        actionSet.add(key);
        uniqueActions.push(action);
      }
    }

    const summary = {
      totalRulesEvaluated: results.length,
      rulesTriggered: triggered.length,
      actionsGenerated: uniqueActions.length,
      blocked,
      highestSeverity: _highestSeverity(triggered),
      evaluatedAt: new Date().toISOString(),
    };

    // Log the evaluation (unless dry run)
    if (!dryRun) {
      this.evaluationLog.push({
        contextSummary: _summarizeContext(context),
        summary,
        triggeredRuleIds: triggered.map(t => t.ruleId),
        timestamp: new Date().toISOString(),
      });
    }

    return { results, triggered, actions: uniqueActions, summary };
  }

  /**
   * Dry-run a rule against sample data without affecting statistics.
   *
   * @param {string} ruleId
   * @param {object} sampleContext
   * @returns {RuleEvalResult}
   */
  testRule(ruleId, sampleContext) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`RuleEngine.testRule: rule "${ruleId}" not found`);
    }

    // Temporarily enable the rule for testing
    const wasEnabled = rule.enabled;
    rule.enabled = true;

    const result = this.evaluate(sampleContext, { dryRun: true });

    rule.enabled = wasEnabled;

    const ruleResult = result.results.find(r => r.ruleId === ruleId);
    return ruleResult || { ruleId, ruleName: rule.name, matched: false, actions: [], severity: rule.severity, conditionResults: [], evaluatedAt: new Date().toISOString() };
  }

  /**
   * Record a false positive for a rule (for tracking accuracy).
   * @param {string} ruleId
   */
  recordFalsePositive(ruleId) {
    const stats = this.ruleStats.get(ruleId);
    if (!stats) {
      throw new Error(`RuleEngine.recordFalsePositive: rule "${ruleId}" not found`);
    }
    stats.falsePositives++;
  }

  /**
   * Record a true positive for a rule.
   * @param {string} ruleId
   */
  recordTruePositive(ruleId) {
    const stats = this.ruleStats.get(ruleId);
    if (!stats) {
      throw new Error(`RuleEngine.recordTruePositive: rule "${ruleId}" not found`);
    }
    stats.truePositives++;
  }

  /**
   * Get statistics for all rules or a specific rule.
   * @param {string} [ruleId]
   * @returns {object}
   */
  getStats(ruleId) {
    if (ruleId) {
      const stats = this.ruleStats.get(ruleId);
      if (!stats) {
        throw new Error(`RuleEngine.getStats: rule "${ruleId}" not found`);
      }
      const total = stats.truePositives + stats.falsePositives;
      return {
        ruleId,
        fired: stats.fired,
        truePositives: stats.truePositives,
        falsePositives: stats.falsePositives,
        falsePositiveRate: total > 0 ? Math.round((stats.falsePositives / total) * 10000) / 10000 : null,
        precision: total > 0 ? Math.round((stats.truePositives / total) * 10000) / 10000 : null,
      };
    }

    // Aggregate stats across all rules
    const allStats = [];
    let totalFired = 0;
    let totalFP = 0;
    let totalTP = 0;
    for (const [id, stats] of this.ruleStats) {
      const total = stats.truePositives + stats.falsePositives;
      allStats.push({
        ruleId: id,
        ruleName: this.rules.get(id)?.name || id,
        fired: stats.fired,
        truePositives: stats.truePositives,
        falsePositives: stats.falsePositives,
        falsePositiveRate: total > 0 ? Math.round((stats.falsePositives / total) * 10000) / 10000 : null,
      });
      totalFired += stats.fired;
      totalFP += stats.falsePositives;
      totalTP += stats.truePositives;
    }

    const overallTotal = totalTP + totalFP;
    return {
      totalRules: this.rules.size,
      enabledRules: [...this.rules.values()].filter(r => r.enabled).length,
      totalFired,
      totalTruePositives: totalTP,
      totalFalsePositives: totalFP,
      overallFalsePositiveRate: overallTotal > 0 ? Math.round((totalFP / overallTotal) * 10000) / 10000 : null,
      evaluationCount: this.evaluationLog.length,
      ruleBreakdown: allStats,
    };
  }

  /**
   * Get the evaluation log.
   * @param {object} [filter]
   * @param {number} [filter.limit]
   * @param {string} [filter.since] - ISO timestamp
   * @returns {Array<object>}
   */
  getEvaluationLog(filter = {}) {
    let log = [...this.evaluationLog];
    if (filter.since) {
      log = log.filter(e => e.timestamp >= filter.since);
    }
    if (filter.limit) {
      log = log.slice(-filter.limit);
    }
    return log;
  }

  /**
   * Load the 10 built-in DPMS rules.
   */
  loadBuiltInRules() {
    for (const rule of BUILT_IN_RULES) {
      this.addRule(rule);
    }
  }

  /**
   * Export all rules as a JSON-serializable array.
   * @returns {Array<Rule>}
   */
  exportRules() {
    return [...this.rules.values()];
  }

  /**
   * Import rules from an array, replacing existing rules with the same ID.
   * @param {Array<Rule>} rules
   * @returns {{ imported: number, errors: Array<{ ruleId: string, errors: Array<string> }> }}
   */
  importRules(rules) {
    if (!Array.isArray(rules)) {
      throw new Error('RuleEngine.importRules: rules must be an array');
    }

    let imported = 0;
    const importErrors = [];

    for (const rule of rules) {
      const result = this.addRule(rule);
      if (result.success) {
        imported++;
      } else {
        importErrors.push({ ruleId: rule.id || 'unknown', errors: result.errors });
      }
    }

    return { imported, errors: importErrors };
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Determine the highest severity among triggered rules.
 * @param {Array<RuleEvalResult>} triggered
 * @returns {string|null}
 */
function _highestSeverity(triggered) {
  const order = { critical: 4, high: 3, medium: 2, low: 1 };
  let highest = null;
  let highestVal = 0;
  for (const t of triggered) {
    const val = order[t.severity] || 0;
    if (val > highestVal) {
      highestVal = val;
      highest = t.severity;
    }
  }
  return highest;
}

/**
 * Create a minimal summary of a context object for audit logging.
 * @param {object} ctx
 * @returns {object}
 */
function _summarizeContext(ctx) {
  const summary = {};
  if (ctx.transaction) {
    summary.transactionAmount = ctx.transaction.amount;
    summary.transactionMethod = ctx.transaction.method;
    summary.transactionCountry = ctx.transaction.country;
  }
  if (ctx.entity) {
    summary.entityName = ctx.entity.name;
    summary.entityCountry = ctx.entity.country;
    summary.entityRiskScore = ctx.entity.risk_score;
  }
  if (ctx.screening) {
    summary.screeningBand = ctx.screening.band;
    summary.screeningScore = ctx.screening.score;
  }
  return summary;
}

// ─────────────────────────────────────────────────────────────────────
//  Built-in DPMS Rules (10 pre-configured rules)
// ─────────────────────────────────────────────────────────────────────

/**
 * Pre-configured rules for Dealers in Precious Metals and Stones.
 * These cover the most common AML/CFT scenarios per UAE regulatory
 * guidance and FATF typologies for the DPMS sector.
 * @type {Array<Rule>}
 */
const BUILT_IN_RULES = [
  {
    id: 'dpms-001',
    name: 'Cash Transaction Above AED 55,000 Threshold',
    description: 'Flag any cash transaction at or above AED 55,000, the statutory CDD threshold for DPMS under Cabinet Resolution 134/2025.',
    enabled: true,
    priority: 95,
    conditions: [
      { field: 'transaction.amount', operator: 'greater_than', value: 54999 },
      { field: 'transaction.method', operator: 'equals', value: 'cash' },
    ],
    actions: [
      { type: 'flag_for_review', params: { reason: 'Cash transaction at or above AED 55,000 threshold' } },
      { type: 'require_edd', params: { reason: 'Mandatory CDD for cash DPMS transactions >= AED 55,000' } },
    ],
    severity: 'high',
    category: 'threshold',
  },
  {
    id: 'dpms-002',
    name: 'Sanctions Screening High Match',
    description: 'Block transactions where entity has a high or exact sanctions screening match.',
    enabled: true,
    priority: 100,
    conditions: [
      { field: 'screening.band', operator: 'in_list', value: ['high', 'exact'] },
    ],
    actions: [
      { type: 'block', params: { reason: 'Sanctions screening: high or exact match' } },
      { type: 'escalate', params: { to: 'MLRO', reason: 'Potential sanctions match requires immediate review' } },
    ],
    severity: 'critical',
    category: 'sanctions',
  },
  {
    id: 'dpms-003',
    name: 'PEP Entity Transaction',
    description: 'Escalate all transactions involving Politically Exposed Persons to senior management.',
    enabled: true,
    priority: 90,
    conditions: [
      { field: 'entity.is_pep', operator: 'equals', value: true },
    ],
    actions: [
      { type: 'escalate', params: { to: 'Senior Management', reason: 'PEP involvement requires senior approval per FDL 10/2025 Art. 14' } },
      { type: 'require_edd', params: { reason: 'EDD mandatory for PEPs' } },
    ],
    severity: 'high',
    category: 'pep',
  },
  {
    id: 'dpms-004',
    name: 'FATF Blacklist Jurisdiction',
    description: 'Block transactions from or to FATF high-risk jurisdictions (Iran, DPRK, Myanmar).',
    enabled: true,
    priority: 98,
    conditions: [
      { field: 'transaction.country', operator: 'in_list', value: ['IR', 'KP', 'MM'] },
    ],
    actions: [
      { type: 'block', params: { reason: 'FATF high-risk jurisdiction (blacklist)' } },
      { type: 'alert', params: { message: 'Transaction involves FATF blacklisted jurisdiction' } },
      { type: 'escalate', params: { to: 'MLRO', reason: 'FATF blacklist jurisdiction' } },
    ],
    severity: 'critical',
    category: 'jurisdiction',
  },
  {
    id: 'dpms-005',
    name: 'FATF Greylist Jurisdiction Enhanced Monitoring',
    description: 'Flag transactions from FATF increased monitoring jurisdictions for enhanced review.',
    enabled: true,
    priority: 75,
    conditions: [
      { field: 'transaction.country', operator: 'in_list', value: ['AL', 'BG', 'BF', 'CM', 'HR', 'CD', 'HT', 'KE', 'LA', 'LB', 'MC', 'MZ', 'NA', 'NG', 'PH', 'ZA', 'SS', 'SY', 'TZ', 'VE', 'VN', 'YE'] },
    ],
    actions: [
      { type: 'flag_for_review', params: { reason: 'FATF increased monitoring jurisdiction' } },
      { type: 'require_edd', params: { reason: 'Enhanced due diligence for greylist jurisdiction' } },
    ],
    severity: 'medium',
    category: 'jurisdiction',
  },
  {
    id: 'dpms-006',
    name: 'High-Value Gold Transaction',
    description: 'Flag gold transactions exceeding AED 200,000 for enhanced monitoring. Gold is the highest-risk product for DPMS money laundering typologies.',
    enabled: true,
    priority: 80,
    conditions: [
      { field: 'transaction.amount', operator: 'greater_than', value: 200000 },
      { field: 'transaction.type', operator: 'contains', value: 'gold' },
    ],
    actions: [
      { type: 'flag_for_review', params: { reason: 'High-value gold transaction' } },
      { type: 'alert', params: { message: 'Gold transaction exceeds AED 200,000' } },
    ],
    severity: 'medium',
    category: 'product_risk',
  },
  {
    id: 'dpms-007',
    name: 'Structuring Detection (Just-Below Threshold)',
    description: 'Detect potential structuring: cash transactions between AED 45,000 and AED 54,999 that may be structured to avoid the AED 55,000 reporting threshold.',
    enabled: true,
    priority: 85,
    conditions: [
      { field: 'transaction.amount', operator: 'between', value: [45000, 54999] },
      { field: 'transaction.method', operator: 'equals', value: 'cash' },
    ],
    actions: [
      { type: 'flag_for_review', params: { reason: 'Potential structuring: just below AED 55,000 threshold' } },
      { type: 'alert', params: { message: 'Possible threshold avoidance behaviour' } },
    ],
    severity: 'medium',
    category: 'structuring',
  },
  {
    id: 'dpms-008',
    name: 'High Risk Score Entity',
    description: 'Escalate entities with a risk score of 16 or above (CRITICAL band) for senior management review.',
    enabled: true,
    priority: 88,
    conditions: [
      { field: 'entity.risk_score', operator: 'greater_than', value: 15 },
    ],
    actions: [
      { type: 'escalate', params: { to: 'Senior Management', reason: 'Entity risk score in CRITICAL band (>= 16)' } },
      { type: 'require_edd', params: { reason: 'Critical risk score mandates enhanced due diligence' } },
    ],
    severity: 'high',
    category: 'risk_score',
  },
  {
    id: 'dpms-009',
    name: 'New Relationship High-Value Transaction',
    description: 'Flag high-value transactions from entities with less than 6 months relationship. New customers transacting in large amounts are a known DPMS ML typology.',
    enabled: true,
    priority: 70,
    conditions: [
      { field: 'entity.relationship_months', operator: 'less_than', value: 6 },
      { field: 'transaction.amount', operator: 'greater_than', value: 100000 },
    ],
    actions: [
      { type: 'flag_for_review', params: { reason: 'New relationship (<6 months) with high-value transaction' } },
      { type: 'alert', params: { message: 'New customer high-value transaction pattern' } },
    ],
    severity: 'medium',
    category: 'customer_profile',
  },
  {
    id: 'dpms-010',
    name: 'Screening Match Requires Review',
    description: 'Flag any entity with a medium-band screening match for compliance officer review.',
    enabled: true,
    priority: 65,
    conditions: [
      { field: 'screening.band', operator: 'equals', value: 'medium' },
    ],
    actions: [
      { type: 'flag_for_review', params: { reason: 'Medium-band screening match requires manual review' } },
      { type: 'add_to_watchlist', params: { reason: 'Screening match pending resolution' } },
    ],
    severity: 'medium',
    category: 'sanctions',
  },
];

export { OPERATORS, VALID_ACTIONS, VALID_FIELDS, BUILT_IN_RULES };
