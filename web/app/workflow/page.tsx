"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { caughtErrorMessage } from "@/lib/client/error-utils";
import type {
  WorkflowRule,
  WorkflowCondition,
  WorkflowAction,
  WorkflowConditionField,
  WorkflowConditionOperator,
} from "@/lib/server/workflow-engine";

// ── Type stubs for API responses ─────────────────────────────────────────────

interface RulesListResponse {
  ok: boolean;
  rules: WorkflowRule[];
  total: number;
}

interface ConditionTestResult {
  condition: WorkflowCondition;
  result: boolean;
}

interface TestRuleResponse {
  ok: boolean;
  ruleId: string;
  ruleName: string;
  subjectId: string;
  matched: boolean;
  conditionResults: ConditionTestResult[];
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<WorkflowRule["trigger"], string> = {
  screening_completed: "Screening completed",
  subject_created: "Subject created",
  risk_score_changed: "Risk score changed",
  manual: "Manual",
};

const CONDITION_FIELDS: { value: WorkflowConditionField; label: string }[] = [
  { value: "riskScore", label: "Risk score" },
  { value: "cddPosture", label: "CDD posture" },
  { value: "status", label: "Status" },
  { value: "pep.tier", label: "PEP tier" },
  { value: "adverseMedia.score", label: "Adverse media score" },
  { value: "entityType", label: "Entity type" },
  { value: "jurisdiction", label: "Jurisdiction" },
  { value: "listCoverage", label: "List coverage" },
];

const OPERATORS: { value: WorkflowConditionOperator; label: string }[] = [
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "eq", label: "=" },
  { value: "contains", label: "contains" },
  { value: "in", label: "in (comma-separated)" },
];

const ACTION_TYPES: { value: WorkflowAction["type"]; label: string }[] = [
  { value: "set_cdd", label: "Set CDD posture" },
  { value: "assign_to", label: "Assign to analyst" },
  { value: "add_note", label: "Add note" },
  { value: "set_status", label: "Set status" },
  { value: "notify_mlro", label: "Notify MLRO" },
  { value: "trigger_four_eyes", label: "Trigger four-eyes" },
];

// ── Empty form defaults ───────────────────────────────────────────────────────

interface RuleForm {
  name: string;
  description: string;
  trigger: WorkflowRule["trigger"];
  active: boolean;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
}

function emptyForm(): RuleForm {
  return {
    name: "",
    description: "",
    trigger: "screening_completed",
    active: true,
    conditions: [],
    actions: [],
  };
}

function emptyCondition(): WorkflowCondition {
  return { field: "riskScore", operator: "gt", value: "" };
}

function defaultActionForType(type: WorkflowAction["type"]): WorkflowAction {
  switch (type) {
    case "set_cdd":
      return { type: "set_cdd", posture: "EDD" };
    case "assign_to":
      return { type: "assign_to", analyst: "" };
    case "add_note":
      return { type: "add_note", text: "" };
    case "set_status":
      return { type: "set_status", status: "active" };
    case "notify_mlro":
      return { type: "notify_mlro", message: "" };
    case "trigger_four_eyes":
      return { type: "trigger_four_eyes", action: "edd-uplift" };
  }
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "amber" | "red" | "blue";
}) {
  const colors: Record<string, string> = {
    default: "bg-zinc-800/40 text-zinc-300",
    green: "bg-emerald-950/30 text-emerald-300",
    amber: "bg-amber-950/30 text-amber-300",
    red: "bg-red-950/30 text-red-300",
    blue: "bg-sky-950/30 text-sky-300",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${colors[tone] ?? colors["default"]}`}>
      {children}
    </span>
  );
}

// ── Action field editor ───────────────────────────────────────────────────────

function ActionEditor({
  action,
  onChange,
  onRemove,
}: {
  action: WorkflowAction;
  onChange: (_a: WorkflowAction) => void;
  onRemove: () => void;
}) {
  const inputCls =
    "border border-hair-2 rounded px-2 py-1 text-sm bg-bg-panel text-ink-0";

  const renderParams = () => {
    switch (action.type) {
      case "set_cdd":
        return (
          <select
            className={inputCls}
            value={action.posture}
            onChange={(e) =>
              onChange({ type: "set_cdd", posture: e.target.value as "EDD" | "CDD" | "SDD" })
            }
          >
            <option value="EDD">EDD</option>
            <option value="CDD">CDD</option>
            <option value="SDD">SDD</option>
          </select>
        );
      case "assign_to":
        return (
          <input
            className={inputCls}
            placeholder="analyst@example.com"
            value={action.analyst}
            onChange={(e) => onChange({ type: "assign_to", analyst: e.target.value })}
          />
        );
      case "add_note":
        return (
          <input
            className={`${inputCls} w-64`}
            placeholder="Note text..."
            value={action.text}
            onChange={(e) => onChange({ type: "add_note", text: e.target.value })}
          />
        );
      case "set_status":
        return (
          <select
            className={inputCls}
            value={action.status}
            onChange={(e) =>
              onChange({ type: "set_status", status: e.target.value as "active" | "frozen" | "cleared" })
            }
          >
            <option value="active">active</option>
            <option value="frozen">frozen</option>
            <option value="cleared">cleared</option>
          </select>
        );
      case "notify_mlro":
        return (
          <input
            className={`${inputCls} w-64`}
            placeholder="MLRO message..."
            value={action.message}
            onChange={(e) => onChange({ type: "notify_mlro", message: e.target.value })}
          />
        );
      case "trigger_four_eyes":
        return (
          <select
            className={inputCls}
            value={action.action}
            onChange={(e) =>
              onChange({
                type: "trigger_four_eyes",
                action: e.target.value as "edd-uplift" | "escalate",
              })
            }
          >
            <option value="edd-uplift">EDD uplift</option>
            <option value="escalate">Escalate</option>
          </select>
        );
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        className="border border-hair-2 rounded px-2 py-1 text-sm bg-bg-panel text-ink-0"
        value={action.type}
        onChange={(e) => onChange(defaultActionForType(e.target.value as WorkflowAction["type"]))}
      >
        {ACTION_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      {renderParams()}
      <button
        type="button"
        onClick={onRemove}
        className="text-red-500 hover:text-red-400 text-xs px-1"
      >
        Remove
      </button>
    </div>
  );
}

// ── Condition field editor ────────────────────────────────────────────────────

function ConditionEditor({
  condition,
  onChange,
  onRemove,
}: {
  condition: WorkflowCondition;
  onChange: (_c: WorkflowCondition) => void;
  onRemove: () => void;
}) {
  const inputCls =
    "border border-hair-2 rounded px-2 py-1 text-sm bg-bg-panel text-ink-0";

  const handleValueChange = (raw: string) => {
    // For "in" operator parse comma-separated list; otherwise keep as string.
    const val =
      condition.operator === "in"
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : raw;
    onChange({ ...condition, value: val });
  };

  const displayValue = Array.isArray(condition.value)
    ? condition.value.join(", ")
    : String(condition.value);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        className={inputCls}
        value={condition.field}
        onChange={(e) =>
          onChange({ ...condition, field: e.target.value as WorkflowConditionField })
        }
      >
        {CONDITION_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        className={inputCls}
        value={condition.operator}
        onChange={(e) =>
          onChange({ ...condition, operator: e.target.value as WorkflowConditionOperator })
        }
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
      <input
        className={`${inputCls} w-40`}
        placeholder={condition.operator === "in" ? "a, b, c" : "value"}
        value={displayValue}
        onChange={(e) => handleValueChange(e.target.value)}
      />
      <button
        type="button"
        onClick={onRemove}
        className="text-red-500 hover:text-red-400 text-xs px-1"
      >
        Remove
      </button>
    </div>
  );
}

// ── Rule form modal ───────────────────────────────────────────────────────────

function RuleFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: WorkflowRule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RuleForm>(
    initial
      ? {
          name: initial.name,
          description: initial.description ?? "",
          trigger: initial.trigger,
          active: initial.active,
          conditions: initial.conditions,
          actions: initial.actions,
        }
      : emptyForm(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const url = initial
        ? `/api/workflow/rules/${initial.id}`
        : "/api/workflow/rules";
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok: boolean; errors?: { field: string; message: string }[]; error?: string };
      if (!data.ok) {
        const msg =
          data.errors?.map((e) => `${e.field}: ${e.message}`).join("; ") ??
          data.error ??
          "Save failed";
        setError(msg);
        return;
      }
      onSaved();
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full border border-hair-2 rounded px-3 py-2 text-sm bg-bg-panel text-ink-0 focus:outline-none focus:ring-2 focus:ring-brand/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-panel rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-hair-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-0">
            {initial ? "Edit rule" : "New workflow rule"}
          </h2>
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-ink-1 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-ink-3 mb-1">
              Rule name *
            </label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. High-risk PEP → EDD"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-ink-3 mb-1">
              Description
            </label>
            <input
              className={inputCls}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional: explain when this rule fires"
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-xs font-medium text-ink-3 mb-1">
              Trigger *
            </label>
            <select
              className={inputCls}
              value={form.trigger}
              onChange={(e) =>
                setForm({ ...form, trigger: e.target.value as WorkflowRule["trigger"] })
              }
            >
              {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-ink-3">
              Active
            </label>
            <button
              type="button"
              onClick={() => setForm({ ...form, active: !form.active })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.active ? "bg-brand" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 translate-x-1 transform rounded-full bg-bg-panel transition-transform ${
                  form.active ? "translate-x-6" : ""
                }`}
              />
            </button>
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-ink-3">
                Conditions (ALL must match)
              </label>
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, conditions: [...form.conditions, emptyCondition()] })
                }
                className="text-xs text-brand hover:underline"
              >
                + Add condition
              </button>
            </div>
            {form.conditions.length === 0 && (
              <p className="text-xs text-neutral-400 italic">
                No conditions — rule matches every subject on trigger.
              </p>
            )}
            <div className="space-y-2">
              {form.conditions.map((cond, i) => (
                <ConditionEditor
                  key={i}
                  condition={cond}
                  onChange={(updated) =>
                    setForm({
                      ...form,
                      conditions: form.conditions.map((c, j) => (j === i ? updated : c)),
                    })
                  }
                  onRemove={() =>
                    setForm({
                      ...form,
                      conditions: form.conditions.filter((_, j) => j !== i),
                    })
                  }
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-ink-3">
                Actions (applied when all conditions match)
              </label>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    actions: [...form.actions, defaultActionForType("set_cdd")],
                  })
                }
                className="text-xs text-brand hover:underline"
              >
                + Add action
              </button>
            </div>
            {form.actions.length === 0 && (
              <p className="text-xs text-neutral-400 italic">No actions defined.</p>
            )}
            <div className="space-y-2">
              {form.actions.map((action, i) => (
                <ActionEditor
                  key={i}
                  action={action}
                  onChange={(updated) =>
                    setForm({
                      ...form,
                      actions: form.actions.map((a, j) => (j === i ? updated : a)),
                    })
                  }
                  onRemove={() =>
                    setForm({
                      ...form,
                      actions: form.actions.filter((_, j) => j !== i),
                    })
                  }
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded bg-red-950/30 border border-red-500/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-hair-2 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-hair-2 hover:bg-bg-1"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Create rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Test rule modal ───────────────────────────────────────────────────────────

function TestRuleModal({
  rule,
  onClose,
}: {
  rule: WorkflowRule;
  onClose: () => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestRuleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!subjectId.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/workflow/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId: rule.id, subjectId: subjectId.trim() }),
      });
      const data = (await res.json()) as TestRuleResponse;
      if (!data.ok) {
        setError(data.error ?? "Test failed");
        return;
      }
      setResult(data);
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-panel rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="p-6 border-b border-hair-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-0">
            Test: {rule.name}
          </h2>
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-ink-1 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-3 mb-1">
              Subject ID
            </label>
            <input
              className="w-full border border-hair-2 rounded px-3 py-2 text-sm bg-bg-panel text-ink-0"
              placeholder="subject-001"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleTest(); }}
            />
          </div>

          {error && (
            <div className="rounded bg-red-950/30 border border-red-500/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Result:</span>
                <Badge tone={result.matched ? "green" : "red"}>
                  {result.matched ? "Matched" : "No match"}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-ink-3">
                  Per-condition results:
                </p>
                {result.conditionResults.map((cr, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs text-ink-2"
                  >
                    <Badge tone={cr.result ? "green" : "red"}>
                      {cr.result ? "pass" : "fail"}
                    </Badge>
                    <span>
                      {cr.condition.field} {cr.condition.operator}{" "}
                      {Array.isArray(cr.condition.value)
                        ? cr.condition.value.join(", ")
                        : String(cr.condition.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-hair-2 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-hair-2 hover:bg-bg-1"
          >
            Close
          </button>
          <button
            onClick={() => void handleTest()}
            disabled={running || !subjectId.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {running ? "Testing…" : "Run test"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkflowPage() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal state
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkflowRule | null>(null);
  const [testingRule, setTestingRule] = useState<WorkflowRule | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/workflow/rules");
      const data = (await res.json()) as RulesListResponse;
      if (data.ok) setRules(data.rules);
      else setFetchError("Failed to load rules");
    } catch (err) {
      setFetchError(caughtErrorMessage(err, "Network error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  const handleToggleActive = async (rule: WorkflowRule) => {
    try {
      await fetch(`/api/workflow/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !rule.active }),
      });
      await fetchRules();
    } catch {
      // non-fatal
    }
  };

  const handleDelete = async (rule: WorkflowRule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await fetch(`/api/workflow/rules/${rule.id}`, { method: "DELETE" });
      await fetchRules();
    } catch {
      // non-fatal
    }
  };

  return (
    <ModuleLayout asanaModule="workflow" asanaLabel="Workflow" onSync={() => void fetchRules()}>
      {/* Modals */}
      {showNewForm && (
        <RuleFormModal
          onClose={() => setShowNewForm(false)}
          onSaved={() => {
            setShowNewForm(false);
            void fetchRules();
          }}
        />
      )}
      {editingRule && (
        <RuleFormModal
          initial={editingRule}
          onClose={() => setEditingRule(null)}
          onSaved={() => {
            setEditingRule(null);
            void fetchRules();
          }}
        />
      )}
      {testingRule && (
        <TestRuleModal
          rule={testingRule}
          onClose={() => setTestingRule(null)}
        />
      )}

      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-28 md:text-48 font-bold">Workflow Rules</h1>
            <p className="text-sm text-ink-3 mt-1">
              Automate MLRO decisions: define conditions + actions that fire on screening events.
            </p>
          </div>
          <button
            onClick={() => setShowNewForm(true)}
            className="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand/90"
          >
            + New rule
          </button>
        </div>

        {/* Content */}
        {loading && (
          <div className="text-sm text-ink-3 py-12 text-center">
            Loading rules…
          </div>
        )}

        {fetchError && (
          <div className="rounded-lg bg-red-950/30 border border-red-500/40 px-4 py-3 text-sm text-red-300">
            {fetchError}
          </div>
        )}

        {!loading && !fetchError && rules.length === 0 && (
          <div className="rounded-xl border border-dashed border-hair-2 py-16 text-center">
            <p className="text-ink-3 text-sm">
              No workflow rules yet. Click &quot;New rule&quot; to get started.
            </p>
          </div>
        )}

        {!loading && rules.length > 0 && (
          <div className="rounded-xl border border-hair-2 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-base border-b border-hair-2">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Rule
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Trigger
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Conditions
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Actions
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Active
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Last run
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Runs
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-2">
                {rules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="bg-bg-panel hover:bg-bg-base transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{rule.name}</div>
                      {rule.description && (
                        <div className="text-xs text-neutral-400 mt-0.5 truncate max-w-xs">
                          {rule.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="blue">{TRIGGER_LABELS[rule.trigger]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge>{rule.conditions.length}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge>{rule.actions.length}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(rule)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          rule.active ? "bg-brand" : "bg-zinc-700"
                        }`}
                        aria-label={rule.active ? "Deactivate rule" : "Activate rule"}
                      >
                        <span
                          className={`inline-block h-3 w-3 translate-x-1 transform rounded-full bg-bg-panel transition-transform ${
                            rule.active ? "translate-x-5" : ""
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-ink-3 text-xs">
                      {rule.lastRunAt
                        ? new Date(rule.lastRunAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-3 text-xs">
                      {rule.runCount ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setTestingRule(rule)}
                          className="text-xs px-2 py-1 rounded border border-hair-2 hover:bg-bg-1"
                        >
                          Test
                        </button>
                        <button
                          onClick={() => setEditingRule(rule)}
                          className="text-xs px-2 py-1 rounded border border-hair-2 hover:bg-bg-1"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDelete(rule)}
                          className="text-xs px-2 py-1 rounded border border-red-500/40 text-red-400 hover:bg-red-950/20"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 rounded-xl border border-hair-2 bg-bg-base p-4">
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-2">
            Available triggers
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-ink-2">
            {Object.entries(TRIGGER_LABELS).map(([key, label]) => (
              <div key={key}>
                <span className="font-mono text-brand">{key}</span>
                <span className="ml-2">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide mt-3 mb-2">
            Available action types
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-ink-2">
            {ACTION_TYPES.map((a) => (
              <div key={a.value}>
                <span className="font-mono text-brand">{a.value}</span>
                <span className="ml-2">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModuleLayout>
  );
}
