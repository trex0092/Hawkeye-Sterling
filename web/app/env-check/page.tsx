"use client";

// Environment variable checker page.
// Shows which required and optional env vars are configured.
// Only accessible via the portal (admin session required — middleware enforces this).
// NEVER exposes actual variable values — only presence booleans and masked hints.
// Designed for operators to diagnose deployment issues without exposing secrets.

import { useEffect, useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { caughtErrorMessage } from "@/lib/client/error-utils";

interface EnvCheck {
  id: string;
  label: string;
  group: string;
  required: boolean;
  present: boolean;
  hint: string;
}

interface EnvCheckResponse {
  ok: boolean;
  ts: string;
  summary: {
    requiredConfigured: number;
    requiredMissing: number;
    optionalConfigured: number;
    optionalMissing: number;
  };
  checks: EnvCheck[];
}

export default function EnvCheckPage() {
  const [data, setData] = useState<EnvCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/env-check")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => {
        if (cancelled) return;
        setData(d as EnvCheckResponse);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(caughtErrorMessage(e, "Failed to load environment status"));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const groups = data
    ? [...new Set(data.checks.map((c) => c.group))]
    : [];

  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow=""
        title="Environment Check"
        intro="Configuration status for all environment variables. No actual values are shown."
      />
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Environment Variable Status</h1>
        <p className="text-sm text-ink-2 mb-6">
          Shows which environment variables are configured. No actual values are shown.
          Set variables in Netlify: <strong>Site settings → Environment variables</strong>.
        </p>

        {loading && <p className="text-ink-2">Loading…</p>}
        {error && (
          <div className="bg-red-950/30 border border-red-500/40 text-red-300 rounded p-4 mb-4">
            <strong>Error loading env check:</strong> {error}
          </div>
        )}

        {data && (
          <>
            {/* Summary bar */}
            <div className={`rounded-lg p-4 mb-6 border ${data.ok ? "bg-emerald-950/30 border-emerald-500/40" : "bg-red-950/30 border-red-500/40"}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">{data.ok ? "✅" : "❌"}</span>
                <strong className={data.ok ? "text-emerald-300" : "text-red-300"}>
                  {data.ok ? "All required variables configured" : `${data.summary.requiredMissing} required variable(s) missing`}
                </strong>
              </div>
            </div>

            {/* Per-group tables */}
            {groups.map((group) => {
              const checks = data.checks.filter((c) => c.group === group);
              const missingRequired = checks.filter((c) => c.required && !c.present).length;
              return (
                <div key={group} className="mb-8">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-lg font-semibold text-ink-0">{group}</h2>
                    {missingRequired > 0 && (
                      <span className="text-xs bg-red-950/30 text-red-300 border border-red-500/40 px-2 py-0.5 rounded-full">
                        {missingRequired} missing
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-bg-base border-b border-hair-2">
                          <th className="text-left p-2 border border-hair-2 text-ink-1">Variable</th>
                          <th className="text-left p-2 border border-hair-2 text-ink-1">Required</th>
                          <th className="text-left p-2 border border-hair-2 text-ink-1">Status</th>
                          <th className="text-left p-2 border border-hair-2 text-ink-1">Hint</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checks.map((check) => (
                          <tr
                            key={check.id}
                            className={
                              check.required && !check.present
                                ? "bg-red-950/20"
                                : check.present
                                  ? "bg-bg-panel"
                                  : "bg-bg-base"
                            }
                          >
                            <td className="p-2 border border-hair-2 font-mono text-xs text-ink-0">{check.label}</td>
                            <td className="p-2 border border-hair-2 text-center">
                              {check.required ? (
                                <span className="text-red-400 font-semibold">Required</span>
                              ) : (
                                <span className="text-ink-2">Optional</span>
                              )}
                            </td>
                            <td className="p-2 border border-hair-2 text-center">
                              {check.present ? (
                                <span className="text-emerald-400 font-semibold">✓ Set</span>
                              ) : (
                                <span className={check.required ? "text-red-400 font-semibold" : "text-ink-2"}>
                                  {check.required ? "✗ Missing" : "— Not set"}
                                </span>
                              )}
                            </td>
                            <td className="p-2 border border-hair-2 text-xs text-ink-2">{check.hint}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            <p className="text-xs text-ink-2 mt-4">Last checked: {data.ts}</p>
          </>
        )}
      </div>
    </ModuleLayout>
  );
}
