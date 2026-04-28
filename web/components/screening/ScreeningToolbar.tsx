"use client";

import type { SortKey, Subject } from "@/lib/types";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "riskScore", label: "Risk score" },
  { key: "name", label: "Name" },
  { key: "slaNotify", label: "SLA" },
  { key: "status", label: "Status" },
  { key: "cddPosture", label: "CDD" },
];

const STATUS_OPTIONS: { value: Subject["status"] | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "frozen", label: "Frozen" },
  { value: "cleared", label: "Cleared" },
];

interface ScreeningToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onNewScreening: () => void;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSortChange: (key: SortKey) => void;
  statusFilter: Subject["status"] | "all";
  onStatusFilterChange: (v: Subject["status"] | "all") => void;
}

export function ScreeningToolbar({
  query,
  onQueryChange,
  onNewScreening,
  sortKey,
  sortDir,
  onSortChange,
  statusFilter,
  onStatusFilterChange,
}: ScreeningToolbarProps) {
  const activeSortLabel =
    SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? "Risk score";

  return (
    <div className="mb-5 space-y-2">
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-panel border border-hair-2 rounded-lg">
        <div className="flex-1 relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 text-[14px] pointer-events-none">
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search subjects — name, ID, country…"
            className="w-full pl-8 pr-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand focus:bg-bg-panel"
          />
        </div>

        <div className="flex gap-2 items-center">
          {/* Sort dropdown */}
          <div className="relative group">
            <ToolbarButton small>
              <span>Sort:</span>
              <span className="font-semibold">{activeSortLabel}</span>
              <span className="text-ink-3 font-mono text-10">{sortDir === "asc" ? "↑" : "↓"}</span>
            </ToolbarButton>
            <div className="absolute top-full left-0 mt-1 bg-bg-panel border border-hair-2 rounded-lg shadow-lg z-20 w-40 hidden group-hover:block">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onSortChange(opt.key)}
                  className={`w-full text-left px-3 py-2 text-12 flex justify-between items-center hover:bg-bg-1 first:rounded-t-lg last:rounded-b-lg ${
                    opt.key === sortKey ? "text-brand font-semibold" : "text-ink-0"
                  }`}
                >
                  {opt.label}
                  {opt.key === sortKey && (
                    <span className="font-mono text-10 text-brand">
                      {sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <ToolbarButton small primary onClick={onNewScreening}>
            <span>+</span>
            <span className="font-semibold">New screening</span>
          </ToolbarButton>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-1.5">
        <span className="text-11 text-ink-3 uppercase tracking-wide-2 mr-1">Status:</span>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onStatusFilterChange(opt.value)}
            className={`px-2.5 py-1 rounded-full text-11.5 font-medium transition-colors border ${
              statusFilter === opt.value
                ? "bg-ink-0 text-bg-0 border-ink-0"
                : "bg-bg-panel text-ink-1 border-hair-2 hover:border-hair-3 hover:bg-bg-2"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  small,
  primary,
  onClick,
}: {
  children: React.ReactNode;
  small?: boolean;
  primary?: boolean;
  onClick?: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded font-sans border transition-colors cursor-pointer";
  const size = small ? "px-2.5 py-[5px] text-11.5 font-medium" : "px-3.5 py-[7px] text-12.5 font-medium";
  const variant = primary
    ? "bg-brand text-white border-brand font-semibold hover:bg-brand-hover hover:border-brand-hover"
    : "bg-bg-panel text-ink-0 border-hair-2 hover:border-hair-3 hover:bg-bg-2";
  return (
    <button type="button" onClick={onClick} className={`${base} ${size} ${variant}`}>
      {children}
    </button>
  );
}
