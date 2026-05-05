"use client";

// /intel-status — operator dashboard showing every intelligence vendor
// with its configured/missing status + sign-up URL. No secrets are
// surfaced here, only the boolean availability of each adapter.

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";

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
    fetch("/api/intel-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: IntelStatus | { ok: false; error?: string }) => {
        if (j.ok) setData(j);
        else setError("error" in j ? j.error ?? "load failed" : "load failed");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const filtered = data?.providers.filter((p) => {
    if (filter === "configured" && !p.configured) return false;
    if (filter === "missing" && p.configured) return false;
    if (tierFilter !== "all" && p.tier !== tierFilter) return false;
    return true;
  }) ?? [];

  return (
    <div className="min-h-screen bg-bg-1 text-ink-1">
      <Header />
      <div className="flex">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <header className="mb-6">
            <h1 className="text-2xl font-bold mb-1">Intelligence sources · status</h1>
            <p className="text-13 text-ink-3">Live view of every vendor adapter — configured vs missing — with sign-up URL for each free tier.</p>
          </header>

          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 text-red-300 p-3 mb-4 text-12">
              {error}
            </div>
          )}

          {!data && !error && <div className="text-ink-3 text-13">Loading…</div>}

          {data && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <div className="rounded-lg bg-bg-2 border border-white/5 p-4">
                  <div className="text-10 uppercase text-ink-3">Coverage</div>
                  <div className="text-3xl font-bold text-ink-1">
                    {data.totalConfigured}<span className="text-ink-3 text-base">/{data.totalAvailable}</span>
                  </div>
                  <div className="text-11 text-ink-3 mt-1">{data.coveragePct}% active</div>
                </div>
                <div className="rounded-lg bg-bg-2 border border-white/5 p-4">
                  <div className="text-10 uppercase text-ink-3">Free toggles</div>
                  <div className="text-3xl font-bold text-emerald-300">
                    {data.providers.filter((p) => p.tier === "free-toggle" && p.configured).length}
                    <span className="text-ink-3 text-base">/{data.providers.filter((p) => p.tier === "free-toggle").length}</span>
                  </div>
                  <div className="text-11 text-ink-3 mt-1">no key needed</div>
                </div>
                <div className="rounded-lg bg-bg-2 border border-white/5 p-4">
                  <div className="text-10 uppercase text-ink-3">Free keys</div>
                  <div className="text-3xl font-bold text-sky-300">
                    {data.providers.filter((p) => p.tier === "free" && p.configured).length}
                    <span className="text-ink-3 text-base">/{data.providers.filter((p) => p.tier === "free").length}</span>
                  </div>
                  <div className="text-11 text-ink-3 mt-1">sign up + add</div>
                </div>
              </div>

              {/* Categories */}
              <div className="mb-6">
                <div className="text-10 uppercase tracking-wide text-ink-3 mb-2">By category</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {data.categories.map((c) => (
                    <div key={c.category} className="rounded-md bg-bg-2 border border-white/5 px-3 py-2">
                      <div className="text-11 text-ink-3 capitalize">{c.category.replace(/-/g, " ")}</div>
                      <div className="text-13 font-mono">
                        <span className="text-emerald-300">{c.configured}</span>
                        <span className="text-ink-3"> / {c.total}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              {data.recommendations.length > 0 && (
                <div className="mb-6 rounded-lg bg-bg-2 border border-amber-500/20 p-4">
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
                      filter === f ? "bg-ink-1 text-bg-1 border-ink-1" : "bg-bg-2 text-ink-2 border-white/10 hover:border-white/30"
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
                      tierFilter === t ? "bg-ink-1 text-bg-1 border-ink-1" : "bg-bg-2 text-ink-2 border-white/10 hover:border-white/30"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Provider table */}
              <div className="rounded-lg bg-bg-2 border border-white/5 overflow-hidden">
                <table className="w-full text-12">
                  <thead className="text-10 uppercase text-ink-3 bg-bg-1/40">
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
                      <tr key={p.id} className="border-t border-white/5">
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
        </main>
      </div>
    </div>
  );
}
