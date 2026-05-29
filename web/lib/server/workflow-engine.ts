// Hawkeye Sterling — Workflow Automation Engine.
//
// Admins define rules (conditions + actions) that fire automatically on
// screening events. Each rule is evaluated in isolation; all conditions
// within a rule use AND logic. Rules are stored under the key
// "workflow:rules" in the shared Blobs store.
//
// Trigger types:
//   screening_completed  — fired after a screening run completes
//   subject_created      — fired when a new subject is enrolled
//   risk_score_changed   — fired when a risk score update is written
//   manual               — ad-hoc evaluation via /api/workflow/run

import { getJson, setJson } from "@/lib/server/store";
import type { Subject, CDDPosture, SubjectStatus, SanctionSource } from "@/lib/types";

// ── Condition model ──────────────────────────────────────────────────────────

export type WorkflowConditionOperator =
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq"
  | "contains"
  | "in";

export type WorkflowConditionField =
  | "riskScore"
  | "cddPosture"
  | "status"
  | "pep.tier"
  | "adverseMedia.score"
  | "entityType"
  | "jurisdiction"
  | "listCoverage";

export interface WorkflowCondition {
  field: WorkflowConditionField;
  operator: WorkflowConditionOperator;
  value: string | number | string[];
}

// ── Action model ─────────────────────────────────────────────────────────────

export type WorkflowAction =
  | { type: "set_cdd"; posture: CDDPosture }
  | { type: "assign_to"; analyst: string }
  | { type: "add_note"; text: string }
  | { type: "set_status"; status: SubjectStatus }
  | { type: "notify_mlro"; message: string }
  | { type: "trigger_four_eyes"; action: "edd-uplift" | "escalate" };

// ── Rule model ───────────────────────────────────────────────────────────────

export interface WorkflowRule {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  trigger: "screening_completed" | "subject_created" | "risk_score_changed" | "manual";
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  createdAt: string;
  lastRunAt?: string;
  runCount: number;
}

// ── Result model ─────────────────────────────────────────────────────────────

export interface WorkflowRuleResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  actionsApplied: string[];
}

// ── Storage ──────────────────────────────────────────────────────────────────

const RULES_KEY = "workflow:rules";

export async function loadWorkflowRules(): Promise<WorkflowRule[]> {
  const data = await getJson<WorkflowRule[]>(RULES_KEY);
  return data ?? [];
}

export async function saveWorkflowRules(rules: WorkflowRule[]): Promise<void> {
  await setJson(RULES_KEY, rules);
}

// ── Condition evaluation ─────────────────────────────────────────────────────

/**
 * Extract a numeric PEP tier from a tier string such as "Tier 1", "1", "tier2", etc.
 * Returns null when no tier number can be parsed.
 */
function parsePepTier(tierStr: string): number | null {
  const m = tierStr.match(/\d+/);
  return m ? parseInt(m[0]!, 10) : null;
}

/**
 * Resolve the raw value of a condition field from a subject.
 * Returns undefined when the field is absent (treats as non-match).
 */
function resolveField(
  subject: Subject,
  field: WorkflowConditionField,
): string | number | string[] | undefined {
  switch (field) {
    case "riskScore":
      return subject.riskScore;
    case "cddPosture":
      return subject.cddPosture;
    case "status":
      return subject.status;
    case "pep.tier": {
      if (!subject.pep?.tier) return undefined;
      const n = parsePepTier(subject.pep.tier);
      return n !== null ? n : subject.pep.tier;
    }
    case "adverseMedia.score":
      return subject.adverseMedia?.score;
    case "entityType":
      return subject.entityType;
    case "jurisdiction":
      return subject.jurisdiction;
    case "listCoverage":
      return subject.listCoverage;
    default: {
      const _exhaustive: never = field;
      void _exhaustive;
      return undefined;
    }
  }
}

/**
 * Evaluate one condition against a subject.
 * All comparison operators are case-insensitive for string fields.
 */
export function evaluateCondition(
  subject: Subject,
  condition: WorkflowCondition,
): boolean {
  const raw = resolveField(subject, condition.field);
  if (raw === undefined || raw === null) return false;

  const { operator, value } = condition;

  // "in" / "contains" operators handle array subjects and values separately.
  if (operator === "in") {
    // value must be an array; raw may be a scalar — check if raw is in value
    if (!Array.isArray(value)) return false;
    const strValue = value.map((v) => String(v).toLowerCase());
    if (Array.isArray(raw)) {
      return (raw as string[]).some((r) => strValue.includes(String(r).toLowerCase()));
    }
    return strValue.includes(String(raw).toLowerCase());
  }

  if (operator === "contains") {
    // For array fields (listCoverage): check if field array contains the value.
    // For string fields: substring match.
    if (Array.isArray(raw)) {
      const needle = String(value).toLowerCase();
      return (raw as string[]).some((r) => String(r).toLowerCase() === needle);
    }
    return String(raw).toLowerCase().includes(String(value).toLowerCase());
  }

  // Numeric comparison operators
  if (operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte") {
    const numRaw = typeof raw === "number" ? raw : parseFloat(String(raw));
    const numVal = typeof value === "number" ? value : parseFloat(String(value as string));
    if (isNaN(numRaw) || isNaN(numVal)) return false;
    if (operator === "gt") return numRaw > numVal;
    if (operator === "gte") return numRaw >= numVal;
    if (operator === "lt") return numRaw < numVal;
    if (operator === "lte") return numRaw <= numVal;
  }

  // Equality — coerce both to string for uniform comparison
  if (operator === "eq") {
    if (Array.isArray(raw)) {
      return (raw as string[]).some(
        (r) => String(r).toLowerCase() === String(value).toLowerCase(),
      );
    }
    return String(raw).toLowerCase() === String(value).toLowerCase();
  }

  return false;
}

// ── Action description helpers ───────────────────────────────────────────────

function describeAction(action: WorkflowAction): string {
  switch (action.type) {
    case "set_cdd":
      return `set_cdd(${action.posture})`;
    case "assign_to":
      return `assign_to(${action.analyst})`;
    case "add_note":
      return `add_note("${action.text.slice(0, 40)}${action.text.length > 40 ? "…" : ""}")`;
    case "set_status":
      return `set_status(${action.status})`;
    case "notify_mlro":
      return `notify_mlro("${action.message.slice(0, 40)}${action.message.length > 40 ? "…" : ""}")`;
    case "trigger_four_eyes":
      return `trigger_four_eyes(${action.action})`;
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return "unknown_action";
    }
  }
}

// ── Action application ───────────────────────────────────────────────────────
// Actions are currently logged (audit-friendly). Side-effecting mutations
// (e.g. writing back to Blobs) are left as integration points for callers
// that own the subject record and can apply changes transactionally.

async function applyAction(
  subject: Subject,
  action: WorkflowAction,
  ruleId: string,
): Promise<string> {
  const desc = describeAction(action);
  // Structured log — integration point for downstream automation.
  console.info(
    `[workflow] rule=${ruleId} subject=${subject.id} action=${desc}`,
  );
  return desc;
}

// ── Rule evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate all active rules against a subject for a given trigger.
 * Matching rules have their actions applied and runCount / lastRunAt updated.
 */
export async function evaluateWorkflowRules(
  subject: Subject,
  trigger: WorkflowRule["trigger"],
): Promise<WorkflowRuleResult[]> {
  const rules = await loadWorkflowRules();
  const results: WorkflowRuleResult[] = [];
  const now = new Date().toISOString();

  let dirty = false;

  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.trigger !== trigger) continue;

    // All conditions must pass (AND logic)
    const matched = rule.conditions.every((c) => evaluateCondition(subject, c));

    rule.runCount = (rule.runCount ?? 0) + 1;
    rule.lastRunAt = now;
    dirty = true;

    const actionsApplied: string[] = [];
    if (matched) {
      for (const action of rule.actions) {
        const desc = await applyAction(subject, action, rule.id);
        actionsApplied.push(desc);
      }
    }

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      matched,
      actionsApplied,
    });
  }

  // Persist updated run stats
  if (dirty) {
    await saveWorkflowRules(rules).catch((err) => {
      console.warn("[workflow] failed to persist run stats:", err instanceof Error ? err.message : err);
    });
  }

  return results;
}

// ── Dry-run helpers ──────────────────────────────────────────────────────────

export interface ConditionTestResult {
  condition: WorkflowCondition;
  result: boolean;
}

export interface DryRunResult {
  matched: boolean;
  conditionResults: ConditionTestResult[];
}

/**
 * Dry-run: evaluate one rule against a subject without applying actions
 * or updating run stats. Returns per-condition results for UI feedback.
 */
export function dryRunRule(
  subject: Subject,
  rule: WorkflowRule,
): DryRunResult {
  const conditionResults: ConditionTestResult[] = rule.conditions.map((condition) => ({
    condition,
    result: evaluateCondition(subject, condition),
  }));
  const matched = conditionResults.every((r) => r.result);
  return { matched, conditionResults };
}

// ── Validation ───────────────────────────────────────────────────────────────

const VALID_OPERATORS: WorkflowConditionOperator[] = ["gt", "gte", "lt", "lte", "eq", "contains", "in"];
const VALID_FIELDS: WorkflowConditionField[] = [
  "riskScore", "cddPosture", "status", "pep.tier",
  "adverseMedia.score", "entityType", "jurisdiction", "listCoverage",
];
const VALID_TRIGGERS: WorkflowRule["trigger"][] = [
  "screening_completed", "subject_created", "risk_score_changed", "manual",
];
const VALID_ACTION_TYPES = ["set_cdd", "assign_to", "add_note", "set_status", "notify_mlro", "trigger_four_eyes"];

export interface ValidationError {
  field: string;
  message: string;
}

export function validateRule(raw: unknown): { ok: true; rule: Omit<WorkflowRule, "id" | "createdAt" | "runCount"> } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: [{ field: "body", message: "Must be a JSON object" }] };
  }
  const b = raw as Record<string, unknown>;

  if (typeof b["name"] !== "string" || !b["name"].trim()) {
    errors.push({ field: "name", message: "name is required (non-empty string)" });
  }
  if (b["trigger"] === undefined || !VALID_TRIGGERS.includes(b["trigger"] as WorkflowRule["trigger"])) {
    errors.push({ field: "trigger", message: `trigger must be one of: ${VALID_TRIGGERS.join(", ")}` });
  }
  if (!Array.isArray(b["conditions"])) {
    errors.push({ field: "conditions", message: "conditions must be an array" });
  } else {
    (b["conditions"] as unknown[]).forEach((c, i) => {
      if (typeof c !== "object" || c === null) {
        errors.push({ field: `conditions[${i}]`, message: "must be an object" });
        return;
      }
      const cond = c as Record<string, unknown>;
      if (!VALID_FIELDS.includes(cond["field"] as WorkflowConditionField)) {
        errors.push({ field: `conditions[${i}].field`, message: `must be one of: ${VALID_FIELDS.join(", ")}` });
      }
      if (!VALID_OPERATORS.includes(cond["operator"] as WorkflowConditionOperator)) {
        errors.push({ field: `conditions[${i}].operator`, message: `must be one of: ${VALID_OPERATORS.join(", ")}` });
      }
      if (cond["value"] === undefined) {
        errors.push({ field: `conditions[${i}].value`, message: "value is required" });
      }
    });
  }
  if (!Array.isArray(b["actions"])) {
    errors.push({ field: "actions", message: "actions must be an array" });
  } else {
    (b["actions"] as unknown[]).forEach((a, i) => {
      if (typeof a !== "object" || a === null) {
        errors.push({ field: `actions[${i}]`, message: "must be an object" });
        return;
      }
      const act = a as Record<string, unknown>;
      if (!VALID_ACTION_TYPES.includes(act["type"] as string)) {
        errors.push({ field: `actions[${i}].type`, message: `must be one of: ${VALID_ACTION_TYPES.join(", ")}` });
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    rule: {
      name: (b["name"] as string).trim(),
      description: typeof b["description"] === "string" ? b["description"] : undefined,
      active: b["active"] !== false,
      trigger: b["trigger"] as WorkflowRule["trigger"],
      conditions: b["conditions"] as WorkflowCondition[],
      actions: b["actions"] as WorkflowAction[],
    },
  };
}

// ── Subject loading helper ───────────────────────────────────────────────────
// Subjects are stored as screening snapshots keyed by tenant + subjectId.
// We try both the canonical cdd-vault key and a simple "screening/subject/<id>"
// key so callers can test with lightweight mock subjects.

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
}

export async function loadSubjectForWorkflow(
  subjectId: string,
  tenant: string,
): Promise<Subject | null> {
  const st = safeSegment(tenant);
  const si = safeSegment(subjectId);

  // Primary: cdd-vault snapshot
  const fromCdd = await getJson<Subject>(`cdd/${st}/${si}`);
  if (fromCdd) return fromCdd;

  // Fallback: raw screening subject key
  const fromScreen = await getJson<Subject>(`screening/subject/${st}/${si}`);
  if (fromScreen) return fromScreen;

  // Last resort: subject-profile (subset of Subject shape)
  const fromProfile = await getJson<Subject>(`hs-subjects/${st}/${si}.json`);
  return fromProfile ?? null;
}

// Re-export SanctionSource for convenience in action handlers
export type { SanctionSource };
