"use client";

// Environment variable checker page.
// Shows which required and optional env vars are configured.
// Only accessible via the portal (admin session required — middleware enforces this).
// NEVER exposes actual variable values — only presence booleans and masked hints.
// Designed for operators to diagnose deployment issues without exposing secrets.

import { useEffect, useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";

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
    fetch("/api/env-check")
      .then((r) => r.json())
      .then((d) => {
        setData(d as EnvCheckResponse);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  const groups = data
    ? [...new Set(data.checks.map((c) => c.group))]
    : [];

  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow="Deployment"
        title="Environment Check"
        intro="Configuration status for all environment variables. No actual values are shown."
      />
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Environment Variable Status</h1>
        <p className="text-sm text-gray-500 mb-6">
          Shows which environment variables are configured. No actual values are shown.
          Set variables in Netlify: <strong>Site settings → Environment variables</strong>.
        </p>

        {loading && <p className="text-gray-400">Loading…</p>}
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-800 rounded p-4 mb-4">
            <strong>Error loading env check:</strong> {error}
          </div>
        )}

        {data && (
          <>
            {/* Summary bar */}
            <div className={`rounded-lg p-4 mb-6 border ${data.ok ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">{data.ok ? "✅" : "❌"}</span>
                <strong className={data.ok ? "text-green-800" : "text-red-800"}>
                  {data.ok ? "All required variables configured" : `${data.summary.requiredMissing} required variable(s) missing`}
                </strong>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Stat label="Required ✓" value={data.summary.requiredConfigured} color="green" />
                <Stat label="Required ✗" value={data.summary.requiredMissing} color={data.summary.requiredMissing > 0 ? "red" : "gray"} />
                <Stat label="Optional ✓" value={data.summary.optionalConfigured} color="blue" />
                <Stat label="Optional ✗" value={data.summary.optionalMissing} color="gray" />
              </div>
            </div>

            {/* Per-group tables */}
            {groups.map((group) => {
              const checks = data.checks.filter((c) => c.group === group);
              const missingRequired = checks.filter((c) => c.required && !c.present).length;
              return (
                <div key={group} className="mb-8">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-lg font-semibold">{group}</h2>
                    {missingRequired > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        {missingRequired} missing
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left p-2 border">Variable</th>
                          <th className="text-left p-2 border">Required</th>
                          <th className="text-left p-2 border">Status</th>
                          <th className="text-left p-2 border">Hint</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checks.map((check) => (
                          <tr
                            key={check.id}
                            className={
                              check.required && !check.present
                                ? "bg-red-50"
                                : check.present
                                  ? "bg-white"
                                  : "bg-gray-50"
                            }
                          >
                            <td className="p-2 border font-mono text-xs">{check.label}</td>
                            <td className="p-2 border text-center">
                              {check.required ? (
                                <span className="text-red-600 font-semibold">Required</span>
                              ) : (
                                <span className="text-gray-400">Optional</span>
                              )}
                            </td>
                            <td className="p-2 border text-center">
                              {check.present ? (
                                <span className="text-green-600 font-semibold">✓ Set</span>
                              ) : (
                                <span className={check.required ? "text-red-600 font-semibold" : "text-gray-400"}>
                                  {check.required ? "✗ Missing" : "— Not set"}
                                </span>
                              )}
                            </td>
                            <td className="p-2 border text-xs text-gray-600">{check.hint}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            <p className="text-xs text-gray-400 mt-4">Last checked: {data.ts}</p>
          </>
        )}
      </div>
    </ModuleLayout>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    green: "text-green-700 bg-green-50",
    red: "text-red-700 bg-red-50",
    blue: "text-blue-700 bg-blue-50",
    gray: "text-gray-500 bg-gray-100",
  };
  return (
    <div className={`rounded p-2 text-center ${colorMap[color] ?? colorMap["gray"]}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
