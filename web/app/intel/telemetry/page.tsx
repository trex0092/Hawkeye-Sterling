"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { MODES } from "@/lib/data/modes";
import { TAXONOMY } from "@/lib/data/taxonomy";
import {
  clearModeFires,
  loadModeFires,
  type ModeFireMap,
} from "@/lib/telemetry";

type SortKey = "id" | "name" | "faculty" | "footprint" | "fires" | "lastAt";

const DRIFT_DAYS = 30;

function relativeAt(lastAt: number | undefined): string {
  if (!lastAt) return "never";
  const ms = Date.now() - lastAt;
  if (ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default function ModeTelemetryPage() {
  const [fires, setFires] = useState<ModeFireMap>({});
  const [sortBy, setSortBy] = useState<SortKey>("fires");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterFaculty, setFilterFaculty] = useState<string>("all");

  useEffect(() => {
    setFires(loadModeFires());
  }, []);

  const refresh = () => setFires(loadModeFires());
  const reset = () => {
    if (!confirm("Clear all mode-firing telemetry? This cannot be undone.")) return;
    clearModeFires();
    setFires({});
  };

  const faculties = useMemo(() => {
    const set = new Set<string>();
    for (const m of MODES) set.add(m.faculty);
    return ["all", ...Array.from(set).sort()];
  }, []);

  const rows = useMemo(() => {
    const filtered =
      filterFaculty === "all"
        ? MODES
        : MODES.filter((m) => m.faculty === filterFaculty);
    return filtered.map((m) => {
      const f = fires[m.id];
      return {
        id: m.id,
        name: m.name,
        faculty: m.faculty,
        footprint: m.taxonomyIds.length,
        fires: f?.count ?? 0,
        lastAt: f?.lastAt ?? 0,
      };
    });
  }, [fires, filterFaculty]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortBy, sortDir]);

  const stats = useMemo(() => {
    const totalModes = MODES.length;
    const everFired = Object.keys(fires).length;
    const neverFired = totalModes - everFired;
    const cutoff = Date.now() - DRIFT_DAYS * 86_400_000;
    const drifted = Object.values(fires).filter((f) => f.lastAt < cutoff).length;
    const activatedTaxIds = new Set<string>();
    for (const m of MODES) {
      if (fires[m.id]) for (const t of m.taxonomyIds) activatedTaxIds.add(t);
    }
    return {
      totalModes,
      everFired,
      neverFired,
      drifted,
      activatedTaxIds: activatedTaxIds.size,
      taxonomyTotal: TAXONOMY.length,
    };
  }, [fires]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(key);
      setSortDir(key === "id" || key === "name" || key === "faculty" ? "asc" : "desc");
    }
  };

  const sortMark = (key: SortKey) => (sortBy === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <ModuleLayout asanaModule="telemetry" asanaLabel="Mode Telemetry">
      <ModuleHero
        eyebrow="Module · Mode Telemetry"
        title="Brain"
        titleEm="telemetry."
        intro={
          <>
            <strong>Which modes are doing the work?</strong> Tracked locally
            from every Workbench Run. Surfaces drift (modes not fired in {DRIFT_DAYS} days)
            and never-fired modes — the canary for whether your selection is
            actually weaponizing the catalogue.
          </>
        }
        kpis={[
          { value: String(stats.totalModes), label: "modes total" },
          { value: String(stats.everFired), label: "ever fired" },
          { value: String(stats.neverFired), label: "never fired", tone: stats.neverFired > 0 ? "amber" : undefined },
          { value: String(stats.drifted), label: `drifted ≥${DRIFT_DAYS}d`, tone: stats.drifted > 0 ? "orange" : undefined },
          { value: `${stats.activatedTaxIds}/${stats.taxonomyTotal}`, label: "tax IDs activated" },
        ]}
      />

      <div className="flex items-center gap-3 mb-4">
        <label className="text-11 font-mono uppercase text-ink-2">Faculty</label>
        <select
          value={filterFaculty}
          onChange={(e) => setFilterFaculty(e.target.value)}
          className="text-12 border border-hair-2 bg-bg-panel text-ink-0 rounded px-2 py-1.5"
        >
          {faculties.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={refresh}
          className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-hair-2 rounded text-ink-2 hover:text-brand hover:border-brand"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={reset}
          className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-hair-2 rounded text-ink-2 hover:text-red-700 hover:border-red-300 ml-auto"
        >
          Reset telemetry
        </button>
      </div>

      <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
        <table className="w-full text-12 border-collapse">
          <thead className="bg-bg-1 text-ink-2 font-mono text-10 uppercase tracking-wide-3">
            <tr>
              <th className="text-left px-3 py-2 cursor-pointer hover:text-brand" onClick={() => toggleSort("id")}>
                ID{sortMark("id")}
              </th>
              <th className="text-left px-3 py-2 cursor-pointer hover:text-brand" onClick={() => toggleSort("name")}>
                Name{sortMark("name")}
              </th>
              <th className="text-left px-3 py-2 cursor-pointer hover:text-brand" onClick={() => toggleSort("faculty")}>
                Faculty{sortMark("faculty")}
              </th>
              <th className="text-right px-3 py-2 cursor-pointer hover:text-brand" onClick={() => toggleSort("footprint")}>
                Tax IDs{sortMark("footprint")}
              </th>
              <th className="text-right px-3 py-2 cursor-pointer hover:text-brand" onClick={() => toggleSort("fires")}>
                Fires{sortMark("fires")}
              </th>
              <th className="text-left px-3 py-2 cursor-pointer hover:text-brand" onClick={() => toggleSort("lastAt")}>
                Last fired{sortMark("lastAt")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const driftFlag = r.lastAt > 0 && r.lastAt < Date.now() - DRIFT_DAYS * 86_400_000;
              return (
                <tr key={r.id} className="border-t border-hair-2 hover:bg-bg-1">
                  <td className="px-3 py-1.5 font-mono text-11 text-ink-2">{r.id}</td>
                  <td className="px-3 py-1.5 text-ink-0">{r.name}</td>
                  <td className="px-3 py-1.5 font-mono text-10 text-ink-2 uppercase tracking-wide-3">{r.faculty}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.footprint}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {r.fires === 0 ? <span className="text-ink-3">—</span> : r.fires}
                  </td>
                  <td className="px-3 py-1.5 text-ink-2">
                    {r.lastAt === 0 ? (
                      <span className="text-ink-3">never</span>
                    ) : driftFlag ? (
                      <span className="text-amber-700">{relativeAt(r.lastAt)} · drift</span>
                    ) : (
                      relativeAt(r.lastAt)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-11 text-ink-3 font-mono">
        Source: localStorage["hawkeye.mode-telemetry.v1"] · written by Workbench
        on every Run · {sorted.length} modes shown
      </div>
    </ModuleLayout>
  );
}
