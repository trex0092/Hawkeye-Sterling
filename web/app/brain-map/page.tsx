"use client";

import { useEffect, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { caughtErrorMessage } from "@/lib/client/error-utils";
import type { BrainFaculty, BrainMapResponse } from "@/app/api/brain-map/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<BrainFaculty["category"], string> = {
  screening:   "Screening",
  intelligence: "Intelligence",
  governance:  "Governance",
  analysis:    "Analysis",
  audit:       "Audit",
  media:       "Media",
  crypto:      "Crypto",
  modes:       "Typology Modes",
};

const CATEGORY_ORDER: BrainFaculty["category"][] = [
  "screening", "intelligence", "analysis", "media", "crypto",
  "modes", "governance", "audit",
];

// ── Faculty Card ─────────────────────────────────────────────────────────────

function FacultyCard({
  faculty,
  selected,
  onSelect,
}: {
  faculty: BrainFaculty;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left border rounded-xl p-4 flex flex-col gap-2 transition-all hover:scale-[1.01] ${
        selected
          ? "border-brand bg-brand/10 shadow-[0_0_12px_var(--brand)/20]"
          : "border-hair-2 bg-bg-panel hover:bg-bg-1"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="w-3 h-3 rounded-full shrink-0 mt-0.5"
          style={{ backgroundColor: faculty.color, boxShadow: selected ? `0 0 8px ${faculty.color}` : "none" }}
        />
        <span className="text-9 font-semibold uppercase tracking-wide-2 text-ink-4 bg-bg-2 px-1.5 py-px rounded shrink-0">
          {faculty.fileCount} files
        </span>
      </div>
      <div className="text-12 font-semibold text-ink-0 leading-snug">{faculty.name}</div>
      <div className="text-10 text-ink-3 leading-snug line-clamp-2">{faculty.purpose}</div>
      <div className="text-9 font-semibold uppercase tracking-wide-2 text-ink-4">
        {CATEGORY_LABELS[faculty.category]}
      </div>
    </button>
  );
}

// ── Faculty Detail Panel ─────────────────────────────────────────────────────

function FacultyDetail({ faculty }: { faculty: BrainFaculty }) {
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 space-y-4 sticky top-4">
      <div className="flex items-center gap-3">
        <div
          className="w-5 h-5 rounded-full shrink-0"
          style={{ backgroundColor: faculty.color, boxShadow: `0 0 12px ${faculty.color}` }}
        />
        <div>
          <div className="text-16 font-semibold text-ink-0">{faculty.name}</div>
          <div className="text-10 font-semibold uppercase tracking-wide-2 text-ink-4">
            {CATEGORY_LABELS[faculty.category]} · {faculty.fileCount} files
          </div>
        </div>
      </div>

      <p className="text-12 text-ink-2 leading-relaxed">{faculty.purpose}</p>

      <div>
        <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Key Components</div>
        <div className="flex flex-wrap gap-1.5">
          {faculty.keyComponents.map((c) => (
            <span key={c} className="font-mono text-10 bg-bg-2 border border-hair-2 text-ink-2 px-2 py-0.5 rounded">
              {c}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Regulatory Anchors</div>
        <div className="space-y-1">
          {faculty.regulatoryAnchors.map((a, i) => (
            <div key={i} className="flex items-start gap-1.5 text-11 text-ink-2">
              <span className="text-brand mt-0.5 shrink-0">⚖</span>
              <span>{a}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Connection Lines (SVG overlay) ────────────────────────────────────────────

function ConnectionBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-9 font-semibold text-brand bg-brand/10 border border-brand/20 px-1.5 py-px rounded">
      → {label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BrainMapPage() {
  const [data, setData] = useState<BrainMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<BrainFaculty["category"] | "all">("all");

  useEffect(() => {
    fetch("/api/brain-map")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<BrainMapResponse>; })
      .then((d) => {
        setData(d);
        setSelectedId(d.faculties?.[0]?.id ?? null);
      })
      .catch((e) => setError(caughtErrorMessage(e, "Failed to load brain map")))
      .finally(() => setLoading(false));
  }, []);

  const selected = data?.faculties.find((f) => f.id === selectedId) ?? null;
  const filtered = data?.faculties.filter(
    (f) => filterCategory === "all" || f.category === filterCategory
  ) ?? [];

  const grouped = CATEGORY_ORDER.reduce<Record<string, BrainFaculty[]>>((acc, cat) => {
    const items = filtered.filter((f) => f.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  return (
    <ModuleLayout asanaModule="brain-map" asanaLabel="Brain Map">
      <div className="mb-6 border-b-2 border-ink-0 pb-4">
        <div className="flex items-center gap-1.5 text-10.5 font-semibold uppercase tracking-wide-4 text-brand mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
          Auditor Knowledge Graph
        </div>
        <h1 className="font-display text-28 md:text-48 text-ink-0 m-0 leading-tight">
          Brain <em className="italic text-brand">map.</em>
        </h1>
        <p className="text-13 text-ink-2 mt-1 max-w-[70ch]">
          Interactive map of all {data?.faculties.length ?? "…"} brain faculties and their{" "}
          {data?.totalFiles ?? "…"} TypeScript files — for auditor onboarding and Federal Decree-Law No. 10 of 2025
          demonstrable oversight evidence.
        </p>
      </div>

      {error && (
        <div className="text-red-400 text-13 p-4 border border-red-500/30 rounded-xl bg-red-950/20 mb-6">{error}</div>
      )}

      {loading && (
        <div className="grid grid-cols-3 gap-3 animate-pulse">
          {[...Array(9)].map((_, i) => <div key={i} className="h-36 bg-bg-1 rounded-xl" />)}
        </div>
      )}

      {data && (
        <div className="flex gap-6">
          {/* Left: faculty grid */}
          <div className="flex-1 min-w-0">
            {/* Category filter */}
            <div className="flex gap-1.5 mb-5 flex-wrap">
              <button
                type="button"
                onClick={() => setFilterCategory("all")}
                className={`px-2.5 py-1 rounded-lg text-11 font-semibold border transition-colors ${
                  filterCategory === "all"
                    ? "bg-brand text-white border-brand"
                    : "border-hair-2 bg-bg-panel text-ink-2 hover:bg-bg-1"
                }`}
              >
                All ({data.faculties.length})
              </button>
              {CATEGORY_ORDER.map((cat) => {
                const count = data.faculties.filter((f) => f.category === cat).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilterCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-11 font-semibold border transition-colors ${
                      filterCategory === cat
                        ? "bg-brand text-white border-brand"
                        : "border-hair-2 bg-bg-panel text-ink-2 hover:bg-bg-1"
                    }`}
                  >
                    {CATEGORY_LABELS[cat]} ({count})
                  </button>
                );
              })}
            </div>

            {/* Faculty cards by category */}
            <div className="space-y-6">
              {Object.entries(grouped).map(([cat, faculties]) => (
                <div key={cat}>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">
                    {CATEGORY_LABELS[cat as BrainFaculty["category"]]}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {faculties.map((f) => (
                      <FacultyCard
                        key={f.id}
                        faculty={f}
                        selected={selectedId === f.id}
                        onSelect={() => setSelectedId(f.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Connections */}
            {selected && (
              <div className="mt-6 bg-bg-panel border border-hair-2 rounded-xl p-4">
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">
                  Data Flows from {selected.name}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.connections
                    .filter((c) => c.from === selectedId)
                    .map((c, i) => {
                      const target = data.faculties.find((f) => f.id === c.to);
                      return target ? (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedId(c.to)}
                          className="text-left"
                        >
                          <ConnectionBadge label={`${c.label} → ${target.name}`} />
                        </button>
                      ) : null;
                    })}
                  {data.connections.filter((c) => c.from === selectedId).length === 0 && (
                    <span className="text-11 text-ink-4">No outbound data flows recorded</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: detail panel */}
          <div className="w-72 shrink-0 hidden md:block">
            {selected ? (
              <FacultyDetail faculty={selected} />
            ) : (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 text-12 text-ink-3">
                Select a faculty to see details
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 text-10 text-ink-4">
        {data && `${data.totalFiles} files across ${data.faculties.length} faculties · Generated ${new Date(data.generatedAt).toLocaleString()}`}
      </div>
    </ModuleLayout>
  );
}
