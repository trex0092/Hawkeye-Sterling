"use client";

// Multi-tenant admin page — Hawkeye Sterling platform admin
//
// Shows all tenants with plan, created date, and per-tenant API key stats.
// Create new tenants and edit plan inline.
// Auth: admin Bearer token (ADMIN_TOKEN env var).

import { useState, useEffect, useCallback, useRef } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type TenantPlan = "free" | "starter" | "pro" | "enterprise";

interface TenantRecord {
  id: string;
  name: string;
  plan: TenantPlan;
  createdAt: string;
}

interface TenantStats {
  apiKeyCount?: number;
  subjectCount?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<TenantPlan, string> = {
  free: "bg-bg-2 text-ink-2",
  starter: "bg-blue-dim text-blue",
  pro: "bg-brand/15 text-brand",
  enterprise: "bg-amber-dim text-amber",
};

const PLANS: TenantPlan[] = ["free", "starter", "pro", "enterprise"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function PlanBadge({ plan }: { plan: TenantPlan }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-mono font-semibold uppercase tracking-wide ${PLAN_COLORS[plan]}`}
    >
      {plan}
    </span>
  );
}

// ─── Create Tenant Form ───────────────────────────────────────────────────────

interface CreateFormState {
  id: string;
  name: string;
  plan: TenantPlan;
}

interface CreateFormProps {
  onCreated: (_t: TenantRecord) => void;
  onCancel: () => void;
}

function CreateTenantForm({ onCreated, onCancel }: CreateFormProps) {
  const [form, setForm] = useState<CreateFormState>({ id: "", name: "", plan: "free" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.id.trim() || !form.name.trim()) {
      setError("ID and name are required.");
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await resp.json().catch(() => ({ ok: false, error: apiErrorMessage(resp.status) }))) as {
        ok: boolean;
        tenant?: TenantRecord;
        error?: string;
      };
      if (!mountedRef.current) return;
      if (!resp.ok || !data.ok) {
        setError(data.error ?? apiErrorMessage(resp.status));
      } else if (data.tenant) {
        onCreated(data.tenant);
      }
    } catch (err) {
      if (mountedRef.current) setError(caughtErrorMessage(err, "Network error."));
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { void handleSubmit(e); }}
      className="mb-5 border border-hair-2 rounded-md p-4 bg-bg-1"
    >
      <h3 className="text-13 font-semibold text-ink-0 mb-3">Create tenant</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">
            Tenant ID <span className="text-red">*</span>
          </label>
          <input
            type="text"
            required
            value={form.id}
            onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
            placeholder="e.g. acme-corp"
            className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-1.5 text-12 text-ink-0 font-mono placeholder:text-ink-3 focus:outline-none focus:border-brand"
          />
          <p className="text-10 text-ink-3 mt-0.5">Lowercase, hyphens only</p>
        </div>
        <div>
          <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">
            Name <span className="text-red">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Acme Corporation"
            className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-1.5 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Plan</label>
          <select
            value={form.plan}
            onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value as TenantPlan }))}
            className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-11 text-red mb-2">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-1.5 bg-brand text-white text-12 font-semibold rounded hover:bg-brand/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "Creating…" : "Create tenant"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 border border-hair-2 text-ink-2 text-12 rounded hover:text-ink-0 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Inline Plan Editor ───────────────────────────────────────────────────────

interface InlinePlanEditorProps {
  tenant: TenantRecord;
  onUpdated: (_t: TenantRecord) => void;
}

function InlinePlanEditor({ tenant, onUpdated }: InlinePlanEditorProps) {
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState<TenantPlan>(tenant.plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  if (!editing) {
    return (
      <button
        onClick={() => { setEditing(true); setPlan(tenant.plan); setError(null); }}
        className="group flex items-center gap-1.5"
        title="Click to edit plan"
      >
        <PlanBadge plan={tenant.plan} />
        <span className="text-10 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
      </button>
    );
  }

  const handleSave = async () => {
    if (plan === tenant.plan) { setEditing(false); return; }
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/tenants/${encodeURIComponent(tenant.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await resp.json().catch(() => ({ ok: false, error: apiErrorMessage(resp.status) }))) as {
        ok: boolean;
        tenant?: TenantRecord;
        error?: string;
      };
      if (!mountedRef.current) return;
      if (!resp.ok || !data.ok) {
        setError(data.error ?? apiErrorMessage(resp.status));
      } else if (data.tenant) {
        onUpdated(data.tenant);
        setEditing(false);
      }
    } catch (err) {
      if (mountedRef.current) setError(caughtErrorMessage(err, "Network error."));
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={plan}
        onChange={(e) => setPlan(e.target.value as TenantPlan)}
        className="bg-bg-panel border border-hair-2 rounded px-2 py-0.5 text-11 text-ink-0 focus:outline-none focus:border-brand"
        autoFocus
      >
        {PLANS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <button
        onClick={() => { void handleSave(); }}
        disabled={saving}
        className="px-2 py-0.5 rounded bg-brand text-white text-10 font-semibold disabled:opacity-50"
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="px-2 py-0.5 rounded border border-hair-2 text-ink-2 text-10"
      >
        ✕
      </button>
      {error && <span className="text-10 text-red">{error}</span>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [stats, setStats] = useState<Record<string, TenantStats>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/tenants");
      const data = (await resp.json().catch(() => ({ ok: false, error: apiErrorMessage(resp.status) }))) as {
        ok: boolean;
        tenants?: TenantRecord[];
        count?: number;
        error?: string;
      };
      if (!mountedRef.current) return;
      if (!resp.ok || !data.ok) {
        setError(data.error ?? apiErrorMessage(resp.status));
      } else {
        setTenants(data.tenants ?? []);
      }
    } catch (err) {
      if (mountedRef.current) setError(caughtErrorMessage(err, "Network error."));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Fetch per-tenant stats (API key count) from /api/keys
  const fetchStats = useCallback(async (tenantList: TenantRecord[]) => {
    const newStats: Record<string, TenantStats> = {};
    // Best-effort: fetch key list to count per-tenant
    try {
      const resp = await fetch("/api/keys");
      if (resp.ok) {
        const data = (await resp.json().catch(() => ({ ok: false }))) as {
          ok: boolean;
          keys?: Array<{ id: string; tenant?: string }>;
        };
        if (data.ok && Array.isArray(data.keys)) {
          for (const t of tenantList) {
            newStats[t.id] = {
              apiKeyCount: data.keys.filter((k) => k.tenant === t.id || k.id?.startsWith(t.id)).length,
            };
          }
        }
      }
    } catch {
      // stats are best-effort
    }
    if (mountedRef.current) setStats(newStats);
  }, []);

  useEffect(() => {
    void fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    if (tenants.length > 0) {
      void fetchStats(tenants);
    }
  }, [tenants, fetchStats]);

  const handleTenantCreated = (t: TenantRecord) => {
    setTenants((prev) => [t, ...prev]);
    setShowCreateForm(false);
  };

  const handleTenantUpdated = (updated: TenantRecord) => {
    setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const planCounts = PLANS.reduce<Record<TenantPlan, number>>(
    (acc, p) => ({ ...acc, [p]: tenants.filter((t) => t.plan === p).length }),
    { free: 0, starter: 0, pro: 0, enterprise: 0 },
  );

  return (
    <ModuleLayout engineLabel="Multi-Tenant Admin" asanaModule="admin-tenants" asanaLabel="Tenant Management" onSync={() => void fetchTenants()}>
      <ModuleHero
        eyebrow=""
        title="Tenant"
        titleEm="Management."
        kpis={[
          { value: String(tenants.length), label: "Total tenants" },
          { value: String(planCounts.enterprise + planCounts.pro), label: "Paid tenants" },
          { value: String(planCounts.free), label: "Free tier" },
          { value: String(planCounts.enterprise), label: "Enterprise" },
        ]}
        intro="Manage platform tenants, subscription plans, and access isolation. Each tenant is stored with a unique ID and plan tier. API key assignment and per-tenant usage tracking ensure strict multi-tenant isolation."
      />

      {/* Warning: admin section */}
      <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-md border border-red/20 bg-red-dim">
        <span className="text-red text-16 mt-0.5 shrink-0">⚠</span>
        <p className="text-12 text-ink-2">
          <span className="font-semibold text-red">Admin area</span> — requires ADMIN_TOKEN authentication.
          Changes take effect immediately and affect tenant isolation for all API keys assigned to each tenant.
        </p>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-14 font-semibold text-ink-0">
          {loading ? "Loading tenants…" : `${tenants.length} tenant${tenants.length !== 1 ? "s" : ""}`}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => { void fetchTenants(); }}
            disabled={loading}
            className="px-3 py-1.5 border border-hair-2 text-ink-2 text-12 rounded hover:text-ink-0 transition-colors disabled:opacity-40"
          >
            {loading ? "…" : "Refresh"}
          </button>
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white text-12 font-semibold rounded hover:bg-brand/90 transition-colors"
          >
            <span className="text-14 leading-none">+</span> Create tenant
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded border border-red/30 bg-red-dim text-red text-12">
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <CreateTenantForm
          onCreated={handleTenantCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Plan summary bar */}
      {tenants.length > 0 && (
        <div className="flex gap-3 mb-4 flex-wrap">
          {PLANS.map((p) => (
            <div key={p} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-hair bg-bg-1">
              <PlanBadge plan={p} />
              <span className="text-12 font-semibold text-ink-0">{planCounts[p]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tenants table */}
      <div className="border border-hair-2 rounded-md overflow-hidden">
        <table className="w-full text-12">
          <thead>
            <tr className="border-b border-hair bg-bg-2">
              <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">ID</th>
              <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Name</th>
              <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Plan</th>
              <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Created</th>
              <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">API keys</th>
              <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Subjects</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t, i) => {
              const tenantStats = stats[t.id];
              return (
                <tr
                  key={t.id}
                  className={`border-b border-hair last:border-0 ${i % 2 === 0 ? "" : "bg-bg-1/30"}`}
                >
                  <td className="px-4 py-3 font-mono text-11 text-ink-2">{t.id}</td>
                  <td className="px-4 py-3 font-medium text-ink-0">{t.name}</td>
                  <td className="px-4 py-3">
                    <InlinePlanEditor tenant={t} onUpdated={handleTenantUpdated} />
                  </td>
                  <td className="px-4 py-3 text-ink-2">{fmtDate(t.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-2">
                    {tenantStats?.apiKeyCount != null ? (
                      <span className="font-mono">{tenantStats.apiKeyCount}</span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {tenantStats?.subjectCount != null ? (
                      <span className="font-mono">{tenantStats.subjectCount}</span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {tenants.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-2 text-12">
                  No tenants found. Create the first tenant using the button above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-11 text-ink-3 mt-3">
        Tenant records are stored in Netlify Blobs under the key prefix <code className="font-mono">tenants:</code>.
        Click the plan badge on any row to edit it inline.
      </p>
    </ModuleLayout>
  );
}
