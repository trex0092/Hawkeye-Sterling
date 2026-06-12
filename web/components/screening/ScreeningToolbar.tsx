"use client";

import { forwardRef } from "react";
import type { SortKey, TableColumnKey } from "@/lib/types";
import { ColumnChooser } from "@/components/screening/ColumnChooser";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "riskScore", label: "Risk score" },
  { key: "name", label: "Name" },
  { key: "slaNotify", label: "SLA" },
  { key: "status", label: "Status" },
  { key: "cddPosture", label: "CDD" },
];

interface ScreeningToolbarProps {
  query: string;
  onQueryChange: (_value: string) => void;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSortChange: (_key: SortKey) => void;
  columns: Record<TableColumnKey, boolean>;
  onColumnsChange: (_next: Record<TableColumnKey, boolean>) => void;
}

export const ScreeningToolbar = forwardRef<HTMLInputElement, ScreeningToolbarProps>(function ScreeningToolbar({
  query,
  onQueryChange,
  sortKey,
  sortDir,
  onSortChange,
  columns,
  onColumnsChange,
}: ScreeningToolbarProps, ref) {
  const activeSortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? "Risk score";

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 px-4 py-3 bg-bg-panel border border-hair-2 rounded-lg">
      {/* Search input */}
      <div className="flex-1 min-w-[180px] relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 text-[14px] pointer-events-none">
          ⌕
        </span>
        <input
          ref={ref}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search subjects — name, ID, country (press / to focus)…"
          className="w-full pl-8 pr-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:bg-bg-panel focus:border-brand"
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
                className={`w-full text-left px-2.5 py-1.5 text-11 flex justify-between items-center hover:bg-bg-1 first:rounded-t-lg last:rounded-b-lg ${
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

        <ColumnChooser visible={columns} onChange={onColumnsChange} />
      </div>
    </div>
  );
});

function ToolbarButton({
  children,
  small,
  primary,
  onClick,
  title,
}: {
  children: React.ReactNode;
  small?: boolean;
  primary?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded font-sans border transition-colors cursor-pointer";
  const size = small ? "px-2.5 py-[5px] text-11.5 font-medium" : "px-3.5 py-[7px] text-12.5 font-medium";
  const variant = primary
    ? "bg-brand text-white border-brand font-semibold hover:bg-brand-hover hover:border-brand-hover"
    : "bg-bg-panel text-ink-0 border-hair-2 hover:border-hair-3 hover:bg-bg-2";
  return (
    <button type="button" onClick={onClick} title={title} className={`${base} ${size} ${variant}`}>
      {children}
    </button>
  );
}
