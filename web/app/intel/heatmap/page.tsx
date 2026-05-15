"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { WorldTileMap } from "@/components/intel/WorldTileMap";
import {
  JURISDICTION_RISK,
  type BaselTier,
  type JurisdictionRisk,
} from "@/lib/data/jurisdictions";

interface ExposureRow extends JurisdictionRisk {
  exposureCount: number;
  exposurePct: number;
}

const TIER_COLOUR: Record<BaselTier, string> = {
  very_high: "bg-red-500",
  high:      "bg-orange-500",
  medium:    "bg-yellow-400",
  low:       "bg-emerald-400",
  very_low:  "bg-emerald-300",
};

const TIER_LABEL: Record<BaselTier, string> = {
  very_high: "Very high",
  high:      "High",
  medium:    "Medium",
  low:       "Low",
  very_low:  "Very low",
};

// Demo seed if no real cases exist yet — gives the operator a non-empty
// canvas. Replaced as soon as real cases land in localStorage["hawkeye.cases.v"].
const DEMO_EXPOSURE: Record<string, number> = {
  AE: 124, IR: 8, RU: 6, KP: 1, MM: 2, AF: 3, NG: 7,
  GB: 14, US: 22, CH: 9, SG: 11, HK: 5, IN: 18, TR: 12,
  PA: 4, PH: 6, ZA: 5, VE: 2, SD: 1, SY: 1, YE: 1,
};

function loadExposure(): Record<string, number> {
  if (typeof window === "undefined") return DEMO_EXPOSURE;
  try {
    const raw = window.localStorage.getItem("hawkeye.cases.v");
    if (!raw) return DEMO_EXPOSURE;
    const cases = JSON.parse(raw) as Array<{ jurisdiction?: string }>;
    if (!Array.isArray(cases) || cases.length === 0) return DEMO_EXPOSURE;
    const map: Record<string, number> = {};
    for (const c of cases) {
      const iso = (c.jurisdiction ?? "").toUpperCase().slice(0, 2);
      if (!iso) continue;
      map[iso] = (map[iso] ?? 0) + 1;
    }
    return Object.keys(map).length > 0 ? map : DEMO_EXPOSURE;
  } catch (err) {
    console.warn("[hawkeye] heatmap exposure parse failed — using demo seed:", err);
    return DEMO_EXPOSURE;
  }
}

export default function HeatmapPage() {
  const [exposure, setExposure] = useState<Record<string, number>>({});
  const [sourceLabel, setSourceLabel] = useState<string>("");

  useEffect(() => {
    const e = loadExposure();
    setExposure(e);
    const realCases =
      typeof window !== "undefined" &&
      window.localStorage.getItem("hawkeye.cases.v");
    setSourceLabel(realCases ? "live cases" : "demo seed");
  }, []);

  const rows = useMemo<ExposureRow[]>(() => {
    const total = Object.values(exposure).reduce((s, n) => s + n, 0) || 1;
    return JURISDICTION_RISK.map((j) => {
      const c = exposure[j.iso2] ?? 0;
      return {
        ...j,
        exposureCount: c,
        exposurePct: Math.round((c / total) * 1000) / 10,
      };
    })
      .filter((r) => r.exposureCount > 0)
      .sort((a, b) => b.exposureCount - a.exposureCount);
  }, [exposure]);

  const stats = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.exposureCount, 0) || 1;
    const fatfListed = rows.filter(
      (r) => r.fatf !== "not_listed" || r.eu !== "not_listed",
    );
    const fatfPct = Math.round(
      (fatfListed.reduce((s, r) => s + r.exposureCount, 0) / total) * 100,
    );
    const top = rows[0];
    return {
      countriesWithExposure: rows.length,
      fatfPct,
      topConcentration: top ? `${top.iso2} ${top.exposurePct}%` : "—",
      total,
    };
  }, [rows]);

  const maxCount = rows[0]?.exposureCount ?? 1;

  return (
    <ModuleLayout asanaModule="heatmap" asanaLabel="Geographic Heatmap">
      <ModuleHero

        eyebrow="Module · Geographic Heatmap"
        title="Country"
        titleEm="exposure."
        intro={
          <>
            <strong>Where is the portfolio concentrated?</strong> Customer and
            transaction exposure by jurisdiction, layered with FATF and EU
            high-risk-third-country flags + Basel AML Index tier. Use to anchor
            EWRA geographic-risk scoring and to triage onboarding rate-of-flow.
          </>
        }
        kpis={[
          { value: String(stats.countriesWithExposure), label: "countries" },
          { value: String(stats.total), label: "exposure units" },
          { value: `${stats.fatfPct}%`, label: "FATF/EU listed", tone: stats.fatfPct > 10 ? "amber" : undefined },
          { value: stats.topConcentration, label: "top country" },
        ]}
      />

      <div className="flex items-center gap-4 mb-3 text-11 font-mono text-ink-2">
        <span>Tier:</span>
        {(Object.keys(TIER_COLOUR) as BaselTier[]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded-sm ${TIER_COLOUR[t]}`} />
            {TIER_LABEL[t]}
          </span>
        ))}
        <span className="ml-auto text-ink-3">source: {sourceLabel}</span>
      </div>

      <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-4">
        <div className="font-mono text-10 uppercase tracking-wide-3 text-ink-2 mb-2">
          Choropleth · tile cartogram
        </div>
        <WorldTileMap exposure={exposure} risk={JURISDICTION_RISK} />
        <div className="text-10 text-ink-3 font-mono mt-2 leading-snug">
          Tile fill = Basel AML Index tier (red high → green low). Tile opacity
          scales with screening exposure. Border colour marks FATF status:
          maroon = call-for-action, dark-orange = increased monitoring. Hover a
          tile for the full breakdown.
        </div>
      </div>

      <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
        <table className="w-full text-12 border-collapse">
          <thead className="bg-bg-1 text-ink-2 font-mono text-10 uppercase tracking-wide-3">
            <tr>
              <th className="text-left px-3 py-2 w-16">ISO</th>
              <th className="text-left px-3 py-2">Country</th>
              <th className="text-left px-3 py-2 w-24">Tier</th>
              <th className="text-left px-3 py-2 w-32">FATF</th>
              <th className="text-left px-3 py-2 w-32">EU AMLD</th>
              <th className="text-right px-3 py-2 w-20">Count</th>
              <th className="text-right px-3 py-2 w-20">Share</th>
              <th className="text-left px-3 py-2">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const fatfFlag =
                r.fatf === "call_for_action"
                  ? "Call for action"
                  : r.fatf === "increased_monitoring"
                    ? "Monitoring"
                    : "—";
              const fatfTone =
                r.fatf === "call_for_action"
                  ? "text-red-700"
                  : r.fatf === "increased_monitoring"
                    ? "text-amber-700"
                    : "text-ink-3";
              const euFlag = r.eu === "high_risk_third_country" ? "High-risk 3rd" : "—";
              const euTone = r.eu === "high_risk_third_country" ? "text-orange-700" : "text-ink-3";
              return (
                <tr key={r.iso2} className="border-t border-hair-2 hover:bg-bg-1">
                  <td className="px-3 py-1.5 font-mono text-11 text-ink-2">{r.iso2}</td>
                  <td className="px-3 py-1.5 text-ink-0 font-medium">{r.name}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-11">
                      <span className={`inline-block w-2.5 h-2.5 rounded-sm ${TIER_COLOUR[r.baselTier]}`} />
                      {TIER_LABEL[r.baselTier]}
                    </span>
                  </td>
                  <td className={`px-3 py-1.5 text-11 ${fatfTone}`}>{fatfFlag}</td>
                  <td className={`px-3 py-1.5 text-11 ${euTone}`}>{euFlag}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {r.exposureCount}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink-2">
                    {r.exposurePct}%
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="h-2 bg-bg-2 rounded-sm overflow-hidden">
                      <div
                        className={`h-full ${TIER_COLOUR[r.baselTier]}`}
                        style={{ width: `${(r.exposureCount / maxCount) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-11 text-ink-3 font-mono">
        SVG tile-grid choropleth (cartogram) above; ranked exposure table
        below. Source: web/lib/data/jurisdictions.ts (mirror of
        src/brain/jurisdictions.ts).
      </div>
    </ModuleLayout>
  );
}
