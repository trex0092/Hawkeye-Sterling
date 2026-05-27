"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

// ── Types ──────────────────────────────────────────────────────────────────────

type RiskScore = "low" | "medium" | "high";

interface ApprovalRecord {
  id: string;
  entityName: string;
  country: string;
  approvalDate: string | null;
  underProcess: boolean;
  riskScore: RiskScore;
  countryDestinations: string[];
  createdAt: string;
  updatedAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DESTINATION_OPTIONS = ["UAE", "India", "Turkey"];

const RISK_COLORS: Record<RiskScore, string> = {
  low:    "bg-green/15 text-green border border-green/30",
  medium: "bg-amber/15 text-amber border border-amber/30",
  high:   "bg-red/15 text-red border border-red/30",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB"); // dd/mm/yyyy
}

function isoToInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10); // yyyy-mm-dd for <input type="date">
}

// ── Empty form state ───────────────────────────────────────────────────────────

function emptyForm() {
  return {
    entityName: "",
    country: "",
    approvalDate: "",
    underProcess: false,
    riskScore: "medium" as RiskScore,
    countryDestinations: [] as string[],
  };
}

// ── Form component ─────────────────────────────────────────────────────────────

function ApprovalForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ReturnType<typeof emptyForm>;
  onSave: (_data: ReturnType<typeof emptyForm>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);

  const toggle = (dest: string) => {
    setForm((f) => ({
      ...f,
      countryDestinations: f.countryDestinations.includes(dest)
        ? f.countryDestinations.filter((d) => d !== dest)
        : [...f.countryDestinations, dest],
    }));
  };

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-4">
      {/* Entity Name + Country */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-10 text-ink-3 mb-1 uppercase tracking-wide">Entity Name *</label>
          <input
            className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
            placeholder="e.g. Al Fardan Exchange"
            value={form.entityName}
            onChange={(e) => setForm((f) => ({ ...f, entityName: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-10 text-ink-3 mb-1 uppercase tracking-wide">Country *</label>
          <input
            className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
            placeholder="e.g. UAE"
            value={form.country}
            onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
          />
        </div>
      </div>

      {/* Approval Date / Under Process */}
      <div>
        <label className="block text-10 text-ink-3 mb-1 uppercase tracking-wide">Approval Date</label>
        <div className="flex items-center gap-3">
          <input
            type="date"
            className="bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-12 text-ink-0 focus:outline-none focus:border-brand disabled:opacity-40"
            value={form.approvalDate}
            disabled={form.underProcess}
            onChange={(e) => setForm((f) => ({ ...f, approvalDate: e.target.value }))}
          />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-brand"
              checked={form.underProcess}
              onChange={(e) =>
                setForm((f) => ({ ...f, underProcess: e.target.checked, approvalDate: e.target.checked ? "" : f.approvalDate }))
              }
            />
            <span className="text-11 text-ink-2">Under Process</span>
          </label>
        </div>
      </div>

      {/* Risk Score */}
      <div>
        <label className="block text-10 text-ink-3 mb-1.5 uppercase tracking-wide">Risk Score *</label>
        <div className="flex gap-2">
          {(["low", "medium", "high"] as RiskScore[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setForm((f) => ({ ...f, riskScore: r }))}
              className={`px-3 py-1 rounded-lg text-11 font-semibold capitalize border transition-all ${
                form.riskScore === r
                  ? RISK_COLORS[r]
                  : "bg-bg-1 text-ink-3 border-hair-2 hover:border-hair-1"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Country Destinations */}
      <div>
        <label className="block text-10 text-ink-3 mb-1.5 uppercase tracking-wide">Country Destinations</label>
        <div className="flex flex-wrap gap-2">
          {DESTINATION_OPTIONS.map((dest) => {
            const selected = form.countryDestinations.includes(dest);
            return (
              <button
                key={dest}
                type="button"
                onClick={() => toggle(dest)}
                className={`px-2.5 py-1 rounded-lg text-11 border transition-all ${
                  selected
                    ? "bg-brand/15 text-brand border-brand/40 font-semibold"
                    : "bg-bg-1 text-ink-3 border-hair-2 hover:border-hair-1"
                }`}
              >
                {dest}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.entityName.trim() || !form.country.trim()}
          className="px-4 py-1.5 rounded-lg bg-brand text-white text-12 font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg border border-hair-2 text-12 text-ink-2 hover:bg-bg-1 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Row component ──────────────────────────────────────────────────────────────

function ApprovalRow({
  record,
  onEdit,
  onDelete,
}: {
  record: ApprovalRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-hair-2 last:border-b-0 hover:bg-bg-1 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-12 font-semibold text-ink-0">{record.entityName}</span>
            <span className="text-10 text-ink-3">{record.country}</span>
            <span className={`text-9 font-semibold px-1.5 py-px rounded capitalize ${RISK_COLORS[record.riskScore]}`}>
              {record.riskScore}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {record.underProcess ? (
              <span className="text-10 text-amber font-medium">⏳ Under Process</span>
            ) : (
              <span className="text-10 text-ink-2">
                ✓ Approved {formatDate(record.approvalDate)}
              </span>
            )}
            {record.countryDestinations.length > 0 && (
              <span className="text-10 text-ink-3">
                → {record.countryDestinations.join(", ")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="text-10 text-ink-3 hover:text-ink-0 px-2 py-0.5 rounded border border-hair-2 hover:bg-bg-1 transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-10 text-ink-3 hover:text-red px-2 py-0.5 rounded border border-hair-2 hover:bg-bg-1 transition-colors"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok: boolean; records?: ApprovalRecord[] };
      if (data.ok && data.records) setRecords(data.records);
    } catch {
      setError("Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (form: ReturnType<typeof emptyForm>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          approvalDate: form.underProcess ? null : form.approvalDate || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? "Save failed"); return; }
      setShowForm(false);
      await load();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, form: ReturnType<typeof emptyForm>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          approvalDate: form.underProcess ? null : form.approvalDate || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? "Update failed"); return; }
      setEditingId(null);
      await load();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this approval record?")) return;
    try {
      await fetch(`/api/approvals/${id}`, { method: "DELETE" });
      await load();
    } catch {
      setError("Delete failed");
    }
  };

  // Stats
  const total = records.length;
  const pending = records.filter((r) => r.underProcess).length;
  const approved = records.filter((r) => !r.underProcess).length;
  const highRisk = records.filter((r) => r.riskScore === "high").length;

  return (
    <ModuleLayout asanaModule="approvals" asanaLabel="Approvals">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-10 font-semibold text-brand uppercase tracking-widest mb-0.5">
              Hawkeye Sterling · Approvals
            </p>
            <h1 className="text-24 font-bold text-ink-0 leading-tight">Approvals</h1>
          </div>
          {!showForm && editingId === null && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="px-3 py-1.5 rounded-lg border border-brand text-brand text-12 font-semibold hover:bg-brand/10 transition-colors"
            >
              + Add
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: total, cls: "text-ink-0" },
            { label: "Under Process", value: pending, cls: "text-amber" },
            { label: "Approved", value: approved, cls: "text-green" },
            { label: "High Risk", value: highRisk, cls: "text-red" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-bg-panel border border-hair-2 rounded-xl px-3 py-2.5 text-center">
              <div className={`text-20 font-bold ${cls}`}>{value}</div>
              <div className="text-10 text-ink-3 uppercase tracking-wide">{label}</div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 rounded-lg bg-red/10 border border-red/30 text-12 text-red">
            {error}
          </div>
        )}

        {/* Add form */}
        {showForm && (
          <ApprovalForm
            initial={emptyForm()}
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
            saving={saving}
          />
        )}

        {/* Records list */}
        <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-hair-2 flex items-center justify-between">
            <span className="text-11 font-semibold text-ink-0">Approval Records</span>
            <span className="text-10 text-ink-3">{total} total</span>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-12 text-ink-3">Loading…</div>
          ) : records.length === 0 ? (
            <div className="px-4 py-8 text-center text-12 text-ink-3">
              No approval records yet. Click + Add to create one.
            </div>
          ) : (
            records.map((record) =>
              editingId === record.id ? (
                <div key={record.id} className="px-4 py-3 border-b border-hair-2">
                  <ApprovalForm
                    initial={{
                      entityName: record.entityName,
                      country: record.country,
                      approvalDate: isoToInput(record.approvalDate),
                      underProcess: record.underProcess,
                      riskScore: record.riskScore,
                      countryDestinations: record.countryDestinations,
                    }}
                    onSave={(form) => handleUpdate(record.id, form)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                </div>
              ) : (
                <ApprovalRow
                  key={record.id}
                  record={record}
                  onEdit={() => setEditingId(record.id)}
                  onDelete={() => handleDelete(record.id)}
                />
              )
            )
          )}
        </div>
      </div>
    </ModuleLayout>
  );
}
