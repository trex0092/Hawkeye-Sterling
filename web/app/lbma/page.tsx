"use client";

import { useState, useEffect, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { apiErrorMessage } from "@/lib/client/error-utils";

interface LbmaRecord {
  id: string;
  status: string;
  reportingYear: number;
  counterpartyName: string;
  counterpartyCountry: string;
  counterpartyType: string;
  isGdlListed: boolean;
  watchlistResult: string;
  cahraSourcing: boolean;
  supplyChainVerified: boolean;
  ongoingMonitoringFrequency: string;
  declarationSubmitted: boolean;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLOURS: Record<string, string> = {
  draft: "bg-zinc-800/40 text-ink-2 border border-hair-2",
  submitted: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
  approved: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
};

export default function LbmaPage() {
  const [records, setRecords] = useState<LbmaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    reportingYear: new Date().getFullYear(),
    counterpartyName: "",
    counterpartyCountry: "",
    counterpartyType: "supplier",
    isGdlListed: false,
    watchlistResult: "clear",
    cahraSourcing: false,
    supplyChainVerified: false,
    ongoingMonitoringFrequency: "quarterly",
    declarationSubmitted: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lbma");
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "LBMA data"));
      const data = await res.json() as { ok: boolean; records?: LbmaRecord[]; error?: string };
      if (data.ok) setRecords(data.records ?? []);
      else setError(data.error ?? "Failed to load");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/lbma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "LBMA submission"));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        void load();
      } else {
        setError(data.error ?? "Failed to create");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow=""
        title="LBMA Responsible Gold"
        titleEm="compliance."
        intro="Counterparty due diligence questionnaires · GDL verification · CAHRA sourcing · supply chain traceability · LBMA RGG V9"
      />

      <div className="w-full pb-16 space-y-5">


        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {showForm && (
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6 space-y-4">
            <h2 className="text-base font-semibold text-ink-0">New LBMA Counterparty Questionnaire</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Reporting Year</label>
                <input
                  type="number"
                  value={form.reportingYear}
                  onChange={e => setForm(f => ({ ...f, reportingYear: Number(e.target.value) }))}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-1.5 text-sm text-ink-0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Counterparty Name *</label>
                <input
                  type="text"
                  required
                  value={form.counterpartyName}
                  onChange={e => setForm(f => ({ ...f, counterpartyName: e.target.value }))}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-1.5 text-sm text-ink-0 placeholder:text-ink-2"
                  placeholder="e.g. DMCC Gold Refinery"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Country (ISO-2) *</label>
                <input
                  type="text"
                  required
                  maxLength={2}
                  value={form.counterpartyCountry}
                  onChange={e => setForm(f => ({ ...f, counterpartyCountry: e.target.value.toUpperCase() }))}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-1.5 text-sm text-ink-0 placeholder:text-ink-2"
                  placeholder="AE"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Counterparty Type</label>
                <select
                  value={form.counterpartyType}
                  onChange={e => setForm(f => ({ ...f, counterpartyType: e.target.value }))}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-1.5 text-sm text-ink-0"
                >
                  <option value="supplier">Supplier</option>
                  <option value="refiner">Refiner</option>
                  <option value="broker">Broker</option>
                  <option value="customer">Customer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Watchlist Result</label>
                <select
                  value={form.watchlistResult}
                  onChange={e => setForm(f => ({ ...f, watchlistResult: e.target.value }))}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-1.5 text-sm text-ink-0"
                >
                  <option value="clear">Clear</option>
                  <option value="match">Match</option>
                  <option value="potential_match">Potential Match</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Monitoring Frequency</label>
                <select
                  value={form.ongoingMonitoringFrequency}
                  onChange={e => setForm(f => ({ ...f, ongoingMonitoringFrequency: e.target.value }))}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-1.5 text-sm text-ink-0"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                </select>
              </div>
            </div>
            <div className="flex gap-5 flex-wrap text-sm">
              {[
                { key: "isGdlListed", label: "GDL Listed" },
                { key: "cahraSourcing", label: "CAHRA Sourcing" },
                { key: "supplyChainVerified", label: "Supply Chain Verified" },
                { key: "declarationSubmitted", label: "Declaration Submitted" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1.5 text-ink-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[key as keyof typeof form] as boolean}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-hair-2 text-ink-1 rounded-md hover:bg-bg-base"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm bg-brand text-white rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create Questionnaire"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center text-ink-2 py-12 text-sm">Loading...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-ink-2 border border-dashed border-hair-2 rounded-lg">
            <p className="text-base font-medium text-ink-1">No LBMA questionnaires yet</p>
            <p className="text-sm mt-1">Create your first counterparty due diligence questionnaire to begin LBMA compliance tracking.</p>
          </div>
        ) : (
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-base border-b border-hair-2">
                  {["ID", "Year", "Counterparty", "Country", "Watchlist", "GDL", "Status", "Created"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-ink-2 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-2">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-bg-base/40">
                    <td className="px-3 py-2 font-mono text-xs text-ink-2">{r.id}</td>
                    <td className="px-3 py-2 text-ink-1">{r.reportingYear}</td>
                    <td className="px-3 py-2 font-medium text-ink-0">{r.counterpartyName}</td>
                    <td className="px-3 py-2 text-ink-1">{r.counterpartyCountry}</td>
                    <td className="px-3 py-2">
                      <span className={r.watchlistResult === "clear" ? "text-emerald-400" : "text-red font-medium"}>
                        {r.watchlistResult}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-1">{r.isGdlListed ? "✓" : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLOURS[r.status] ?? "bg-zinc-800/40 text-ink-2 border-hair-2"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
