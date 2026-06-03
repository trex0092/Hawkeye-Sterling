"use client";

// /intel-status — operator dashboard showing every intelligence vendor
// with its configured/missing status + sign-up URL. No secrets are
// surfaced here, only the boolean availability of each adapter.

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { caughtErrorMessage } from "@/lib/client/error-utils";

interface Provider {
  id: string;
  configured: boolean;
  envVars: string[];
  signupUrl?: string;
  tier: "free" | "free-toggle" | "commercial";
  category: string;
}

interface IntelStatus {
  ok: true;
  totalConfigured: number;
  totalAvailable: number;
  coveragePct: number;
  categories: Array<{ category: string; total: number; configured: number; missing: number }>;
  providers: Provider[];
  recommendations: Provider[];
}

const TIER_STYLE: Record<Provider["tier"], string> = {
  "free-toggle": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  free: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  commercial: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const TIER_LABEL: Record<Provider["tier"], string> = {
  "free-toggle": "FREE TOGGLE",
  free: "FREE KEY",
  commercial: "COMMERCIAL",
};

export default function IntelStatusPage(): React.ReactElement {
  const [data, setData] = useState<IntelStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "configured" | "missing">("all");
  const [tierFilter, setTierFilter] = useState<"all" | Provider["tier"]>("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/intel-status", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) console.error(`[hawkeye] intel-status HTTP ${r.status}`);
        return r.json();
      })
      .then((j: IntelStatus | { ok: false; error?: string }) => {
        if (cancelled) return;
        if (j.ok) setData(j);
        else setError("error" in j ? j.error ?? "load failed" : "load failed");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("[hawkeye] intel-status threw:", e);
        setError(caughtErrorMessage(e, "Failed to load intelligence provider status"));
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = data?.providers.filter((p) => {
    if (filter === "configured" && !p.configured) return false;
    if (filter === "missing" && p.configured) return false;
    if (tierFilter !== "all" && p.tier !== tierFilter) return false;
    return true;
  }) ?? [];

  return (
    <ModuleLayout asanaModule="intel-status" asanaLabel="Intelligence Sources">
      <ModuleHero
        eyebrow=""
        title="Intelligence sources"
        titleEm="status."
        intro="Live view of every vendor adapter — configured vs missing — with sign-up URL for each free tier."
        kpis={data ? [
          { value: `${data.totalConfigured}/${data.totalAvailable}`, label: "configured" },
          { value: `${data.coveragePct}%`, label: "coverage" },
          { value: String(data.providers.filter((p) => p.tier === "free-toggle" && !p.configured).length), label: "free toggles unconfigured", tone: "amber" },
        ] : []}
      />

      {error && (
        <div className="rounded-md bg-red-950/30 border border-red-500/40 text-red-300 p-3 mb-4 text-12">
          {error}
        </div>
      )}

      {!data && !error && <div className="text-ink-3 text-13">Loading…</div>}

      {data && (
        <>
          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="mb-6 rounded-lg bg-bg-panel border border-amber-500/20 p-4">
              <div className="text-10 uppercase tracking-wide text-amber-300 mb-2">Top {data.recommendations.length} unconfigured (high-impact next)</div>
              <ul className="space-y-1.5">
                {data.recommendations.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-12">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`text-10 px-1.5 py-0.5 rounded border ${TIER_STYLE[p.tier]}`}>{TIER_LABEL[p.tier]}</span>
                      <span className="font-mono text-ink-2 truncate">{p.id}</span>
                      <span className="text-ink-3 text-11 truncate hidden sm:inline">env: {p.envVars.join(" + ")}</span>
                    </div>
                    {p.signupUrl && (
                      <a href={p.signupUrl} target="_blank" rel="noopener noreferrer" className="text-11 text-sky-300 hover:underline whitespace-nowrap">
                        Sign up ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {(["all", "configured", "missing"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-11 px-3 py-1 rounded border ${
                  filter === f ? "bg-brand text-white border-brand" : "bg-bg-panel text-ink-2 border-hair-2 hover:border-hair-1"
                }`}
              >
                {f}
              </button>
            ))}
            <span className="text-ink-3 mx-2">·</span>
            {(["all", "free-toggle", "free", "commercial"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`text-11 px-3 py-1 rounded border ${
                  tierFilter === t ? "bg-brand text-white border-brand" : "bg-bg-panel text-ink-2 border-hair-2 hover:border-hair-1"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Provider table */}
          <div className="rounded-lg bg-bg-panel border border-hair-2 overflow-hidden">
            <table className="w-full text-12">
              <thead className="text-10 uppercase text-ink-3 bg-bg-base">
                <tr>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Provider</th>
                  <th className="text-left px-3 py-2 hidden sm:table-cell">Tier</th>
                  <th className="text-left px-3 py-2 hidden md:table-cell">Category</th>
                  <th className="text-left px-3 py-2">Env vars</th>
                  <th className="text-right px-3 py-2">Sign up</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-hair-2">
                    <td className="px-3 py-2">
                      {p.configured ? (
                        <span className="text-emerald-300 font-bold">●</span>
                      ) : (
                        <span className="text-ink-3">○</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-ink-2">{p.id}</td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <span className={`text-10 px-1.5 py-0.5 rounded border ${TIER_STYLE[p.tier]}`}>{TIER_LABEL[p.tier]}</span>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-ink-3 capitalize">{p.category.replace(/-/g, " ")}</td>
                    <td className="px-3 py-2 font-mono text-11 text-ink-3">{p.envVars.join(", ")}</td>
                    <td className="px-3 py-2 text-right">
                      {p.signupUrl ? (
                        <a href={p.signupUrl} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline text-11">
                          Open ↗
                        </a>
                      ) : (
                        <span className="text-ink-3 text-11">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-11 text-ink-3 mt-4">
            After adding env vars in Netlify, trigger a redeploy for changes to take effect.
            This page reflects what the running deployment currently sees.
          </p>
        </>
      )}
    </ModuleLayout>
  );
}
