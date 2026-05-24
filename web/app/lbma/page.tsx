"use client";

import { useState, useEffect, useCallback } from "react";

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
    try {
      const res = await fetch("/api/lbma");
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
    try {
      const res = await fetch("/api/lbma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
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

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      submitted: "bg-blue-100 text-blue-700",
      approved: "bg-green-100 text-green-700",
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">LBMA Responsible Gold Compliance</h1>
          <p className="text-sm text-gray-500 mt-1">LBMA Responsible Gold Guidance V9 — Counterparty Due Diligence Questionnaires</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          + New Questionnaire
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleSubmit(e)} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-4">
          <h2 className="font-semibold text-gray-800">New LBMA Counterparty Questionnaire</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reporting Year</label>
              <input type="number" value={form.reportingYear}
                onChange={e => setForm(f => ({ ...f, reportingYear: Number(e.target.value) }))}
                className="w-full border rounded px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Counterparty Name *</label>
              <input type="text" required value={form.counterpartyName}
                onChange={e => setForm(f => ({ ...f, counterpartyName: e.target.value }))}
                className="w-full border rounded px-3 py-1.5 text-sm" placeholder="e.g. DMCC Gold Refinery" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Country (ISO-2) *</label>
              <input type="text" required maxLength={2} value={form.counterpartyCountry}
                onChange={e => setForm(f => ({ ...f, counterpartyCountry: e.target.value.toUpperCase() }))}
                className="w-full border rounded px-3 py-1.5 text-sm" placeholder="AE" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Counterparty Type</label>
              <select value={form.counterpartyType}
                onChange={e => setForm(f => ({ ...f, counterpartyType: e.target.value }))}
                className="w-full border rounded px-3 py-1.5 text-sm">
                <option value="supplier">Supplier</option>
                <option value="refiner">Refiner</option>
                <option value="broker">Broker</option>
                <option value="customer">Customer</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Watchlist Result</label>
              <select value={form.watchlistResult}
                onChange={e => setForm(f => ({ ...f, watchlistResult: e.target.value }))}
                className="w-full border rounded px-3 py-1.5 text-sm">
                <option value="clear">Clear</option>
                <option value="match">Match</option>
                <option value="potential_match">Potential Match</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Monitoring Frequency</label>
              <select value={form.ongoingMonitoringFrequency}
                onChange={e => setForm(f => ({ ...f, ongoingMonitoringFrequency: e.target.value }))}
                className="w-full border rounded px-3 py-1.5 text-sm">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            {[
              { key: "isGdlListed", label: "GDL Listed" },
              { key: "cahraSourcing", label: "CAHRA Sourcing" },
              { key: "supplyChainVerified", label: "Supply Chain Verified" },
              { key: "declarationSubmitted", label: "Declaration Submitted" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form[key as keyof typeof form] as boolean}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                  className="rounded" />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
              {submitting ? "Creating..." : "Create Questionnaire"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg font-medium">No LBMA questionnaires yet</p>
          <p className="text-sm mt-1">Create your first counterparty due diligence questionnaire to begin LBMA compliance tracking.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-3 py-2 font-medium text-gray-600">ID</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Year</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Counterparty</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Country</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Watchlist</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">GDL</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Created</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.id}</td>
                  <td className="px-3 py-2">{r.reportingYear}</td>
                  <td className="px-3 py-2 font-medium">{r.counterpartyName}</td>
                  <td className="px-3 py-2">{r.counterpartyCountry}</td>
                  <td className="px-3 py-2">
                    <span className={r.watchlistResult === "clear" ? "text-green-600" : "text-red-600 font-medium"}>
                      {r.watchlistResult}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.isGdlListed ? "✓" : "—"}</td>
                  <td className="px-3 py-2">{statusBadge(r.status)}</td>
                  <td className="px-3 py-2 text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
