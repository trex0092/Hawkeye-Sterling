"use client";

import { useState, useEffect, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import { apiErrorMessage } from "@/lib/client/error-utils";

interface RmapSmelter {
  cid: string;
  facilityName: string;
  country: string;
  countryCode: string;
  products: string[];
  rmapStatus: "conformant" | "active_placement" | "not_assessed" | "suspended";
  lastAuditDate?: string;
  auditValidity?: string;
  source: string;
  updatedAt: string;
}

const STATUS_COLOURS: Record<RmapSmelter["rmapStatus"], string> = {
  conformant: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
  active_placement: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
  not_assessed: "bg-zinc-800/40 text-ink-2 border border-hair-2",
  suspended: "bg-red-950/30 text-red-300 border border-red-500/40",
};

const STATUS_LABELS: Record<RmapSmelter["rmapStatus"], string> = {
  conformant: "Conformant",
  active_placement: "Active Placement",
  not_assessed: "Not Assessed",
  suspended: "Suspended",
};

export default function RmapPage() {
  const [smelters, setSmelters] = useState<RmapSmelter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fetchSmelters = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = q ? `/api/rmap?q=${encodeURIComponent(q)}` : "/api/rmap";
      const res = await fetch(url);
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "RMAP data"));
      const data = await res.json() as { ok: boolean; smelters?: RmapSmelter[]; error?: string };
      if (data.ok) {
        setSmelters(data.smelters ?? []);
      } else {
        setError(data.error ?? "Failed to load RMAP data");
      }
    } catch {
      setError("Network error loading RMAP smelter database");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSmelters(); }, [fetchSmelters]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    void fetchSmelters(query.trim() || undefined);
  }

  async function downloadCmrt() {
    try {
      const res = await fetch("/api/rmap/export-cmrt");
      if (!res.ok) { setError("CMRT export failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CMRT-v6.01-${new Date().getFullYear()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("CMRT download failed");
    }
  }

  return (
    <ModuleLayout>
      <ModuleFamilyBar
        suiteName="Supply Chain & Responsible Sourcing"
        modules={[
          { label: "Supply Chain Risk", href: "/supply-chain", icon: "🔗" },
          { label: "RMI / RMAP", href: "/rmi", icon: "🏭" },
          { label: "Responsible Sourcing", href: "/responsible-sourcing", icon: "⛏️" },
          { label: "OECD DDG", href: "/oecd-ddg", icon: "📋" },
          { label: "RMAP Database", href: "/rmap", icon: "🗄️" },
          { label: "LBMA Gold", href: "/lbma", icon: "🥇" },
        ]}
      />
      <ModuleHero
        eyebrow=""
        title="RMAP Smelter"
        titleEm="database."
        intro="Conformant smelter lookup · CMRT v6.01 export · OECD DDG Step 2 · UAE FDL 10/2025 Art.21 annual certification"
      />

      <div className="mx-auto max-w-6xl px-4 pb-16 space-y-5">

        {/* Regulatory callout */}
        <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 text-xs text-amber-300 font-mono">
          RMI RMAP · OECD DDG Step 2 · UAE FDL 10/2025 Art.21 — Smelter/refiner certification must
          be verified annually. Non-conformant or suspended smelters require enhanced due diligence.
        </div>

        {/* Search + export bar */}
        <div className="flex gap-2 items-center flex-wrap">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, country, or CID…"
              className="flex-1 bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2 focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <button
              type="submit"
              className="bg-bg-base border border-hair-2 text-ink-1 px-4 py-2 rounded-md text-sm font-medium hover:bg-bg-panel"
            >
              Search
            </button>
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); void fetchSmelters(); }}
                className="text-sm text-ink-2 hover:text-ink-1 px-2"
              >
                Clear
              </button>
            )}
          </form>
          <button
            onClick={() => void downloadCmrt()}
            className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 shrink-0"
          >
            Download CMRT CSV
          </button>
        </div>

        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-12 text-ink-2 text-sm">Loading smelter database…</div>
        ) : smelters.length === 0 ? (
          <div className="text-center py-12 text-ink-2 text-sm border border-dashed border-hair-2 rounded-lg">
            No smelters found.
          </div>
        ) : (
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-bg-base border-b border-hair-2">
                  {["CID", "Facility Name", "Country", "Products", "RMAP Status", "Last Audit"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-2 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-2">
                {smelters.map((s) => (
                  <tr key={s.cid} className="hover:bg-bg-base/40">
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">{s.cid}</td>
                    <td className="px-4 py-3 font-medium text-ink-0">{s.facilityName}</td>
                    <td className="px-4 py-3 text-ink-1">{s.country}</td>
                    <td className="px-4 py-3 text-ink-2 text-xs">{s.products.join(", ")}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOURS[s.rmapStatus] ?? "bg-zinc-800/40 text-ink-2 border-hair-2"}`}>
                        {STATUS_LABELS[s.rmapStatus] ?? s.rmapStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">
                      {s.lastAuditDate ? new Date(s.lastAuditDate).toLocaleDateString("en-GB") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-ink-2 font-mono">
          Source: RMI public conformant smelter list · {smelters.length} smelters loaded
        </p>
      </div>
    </ModuleLayout>
  );
}
