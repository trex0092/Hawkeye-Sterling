"use client";

import { useState, useEffect, useCallback } from "react";

interface RmapSmelter {
  cid: string;
  name: string;
  country: string;
  products: string[];
  rmapStatus: "conformant" | "active" | "active_cross_recognized" | "not_assessed" | "non_conformant";
  lastAuditDate?: string;
  auditValidity?: string;
  source: string;
  updatedAt: string;
}

const STATUS_COLOURS: Record<RmapSmelter["rmapStatus"], string> = {
  conformant: "bg-green-100 text-green-800 border-green-200",
  active: "bg-blue-100 text-blue-800 border-blue-200",
  active_cross_recognized: "bg-teal-100 text-teal-800 border-teal-200",
  not_assessed: "bg-gray-100 text-gray-700 border-gray-200",
  non_conformant: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABELS: Record<RmapSmelter["rmapStatus"], string> = {
  conformant: "Conformant",
  active: "Active",
  active_cross_recognized: "Cross-Recognized",
  not_assessed: "Not Assessed",
  non_conformant: "Non-Conformant",
};

export default function RmapPage() {
  const [smelters, setSmelters] = useState<RmapSmelter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<RmapSmelter[]>([]);

  const fetchSmelters = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = q ? `/api/rmap?q=${encodeURIComponent(q)}` : "/api/rmap";
      const res = await fetch(url);
      const data = await res.json() as { ok: boolean; smelters?: RmapSmelter[]; error?: string };
      if (data.ok) {
        setSmelters(data.smelters ?? []);
        setFiltered(data.smelters ?? []);
      } else {
        setError(data.error ?? "Failed to load RMAP data");
      }
    } catch {
      setError("Network error loading RMAP smelter database");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSmelters();
  }, [fetchSmelters]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      void fetchSmelters(query.trim());
    } else {
      setFiltered(smelters);
    }
  }

  async function downloadCmrt() {
    const res = await fetch("/api/rmap/export-cmrt");
    if (!res.ok) { setError("CMRT export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CMRT-v6.01-${new Date().getFullYear()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RMAP Smelter Database</h1>
          <p className="text-sm text-gray-500 mt-1">
            RMI Responsible Minerals Assurance Process — CMRT v6.01
          </p>
        </div>
        <button
          onClick={() => void downloadCmrt()}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Download CMRT CSV
        </button>
      </div>

      {/* Regulatory note */}
      <div className="mb-5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 font-mono">
        RMI RMAP · OECD DDG Step 2 · UAE FDL 10/2025 Art.21 — Supply chain smelter/refiner
        certification status must be verified annually. Non-conformant smelters trigger enhanced DD.
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or country…"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800"
        >
          Search
        </button>
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); void fetchSmelters(); }}
            className="text-sm text-gray-500 hover:text-gray-700 px-2"
          >
            Clear
          </button>
        )}
      </form>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading smelter database…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No smelters found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["CID", "Name", "Country", "Products", "RMAP Status", "Last Audit"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((s) => (
                <tr key={s.cid} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.cid}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-gray-700">{s.country}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.products.join(", ")}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOURS[s.rmapStatus]}`}>
                      {STATUS_LABELS[s.rmapStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {s.lastAuditDate
                      ? new Date(s.lastAuditDate).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400 font-mono">
        Source: RMI public conformant smelter list · {filtered.length} smelters
      </p>
    </div>
  );
}
