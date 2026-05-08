"use client";

import { forwardRef, useState, useRef } from "react";
import type { SortKey, Subject, TableColumnKey } from "@/lib/types";
import { ColumnChooser } from "@/components/screening/ColumnChooser";
import type { NlSearchFilter } from "@/app/api/cases/nl-search/route";
import type { QuickScreenSeverity } from "@/lib/api/quickScreen.types";

const SEVERITY_OPTIONS: { value: QuickScreenSeverity | "all"; label: string; activeClass: string }[] = [
  { value: "all",      label: "All",      activeClass: "bg-ink-0 text-bg-0" },
  { value: "critical", label: "Critical", activeClass: "bg-red-600 text-white" },
  { value: "high",     label: "High",     activeClass: "bg-orange-500 text-white" },
  { value: "medium",   label: "Medium",   activeClass: "bg-amber-400 text-ink-0" },
  { value: "low",      label: "Low",      activeClass: "bg-blue-500 text-white" },
  { value: "clear",    label: "Clear",    activeClass: "bg-green-600 text-white" },
];


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
  columns: Record<TableColumnKey, boolean>;
  onColumnsChange: (next: Record<TableColumnKey, boolean>) => void;
  onBulkImport: () => void;
  onExport: () => void;
  /** Called with parsed AI filter criteria; null to clear. */
  onAiFilter: (filter: NlSearchFilter | null, label?: string) => void;
  /** Active AI filter label, if any. */
  aiFilterLabel?: string | null;
  /** AI natural-language search callback. */
  onNLSearch?: (query: string) => void;
  /** Whether AI search mode is active (hides sort/filter, shows clear button). */
  nlSearchActive?: boolean;
  onNLSearchClear?: () => void;
  nlSearchLoading?: boolean;
  /** Severity tier filter — filters subjects by their risk score band. */
  severityFilter: QuickScreenSeverity | "all";
  onSeverityFilterChange: (v: QuickScreenSeverity | "all") => void;

}

export const ScreeningToolbar = forwardRef<HTMLInputElement, ScreeningToolbarProps>(function ScreeningToolbar({
  query,
  onQueryChange,
  onNewScreening,
  sortKey,
  sortDir,
  onSortChange,
  statusFilter,
  onStatusFilterChange,
  columns,
  onColumnsChange,
  onBulkImport,
  onExport,
  onAiFilter,
  aiFilterLabel,
  onNLSearch,
  nlSearchActive,
  onNLSearchClear,
  nlSearchLoading,
  severityFilter,
  onSeverityFilterChange,
}: ScreeningToolbarProps, ref) {
  const activeSortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? "Risk score";

  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiInterpreted, setAiInterpreted] = useState<string | null>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

  const handleAiSearch = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiInterpreted(null);
    try {
      const res = await fetch("/api/cases/nl-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: aiQuery.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; interpreted?: string; filters?: NlSearchFilter; clarification?: string; error?: string };
      if (!data.ok || !data.filters) {
        setAiError(data.error ?? "Could not interpret query");
        return;
      }
      setAiInterpreted(data.interpreted ?? null);
      onAiFilter(data.filters, aiQuery.trim());
    } catch {
      setAiError("Network error — try again");
    } finally {
      setAiLoading(false);
    }
  };

  const handleClearAi = () => {
    setAiQuery("");
    setAiInterpreted(null);
    setAiError(null);
    onAiFilter(null);
    setAiOpen(false);
  };

  return (
    <div className="mb-5 space-y-2">
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-panel border border-hair-2 rounded-lg">
        {/* Search input */}
        <div className="flex-1 relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 text-[14px] pointer-events-none">
            ⌕
          </span>
          <input
            ref={ref}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onNLSearch && query.trim().split(/\s+/).length > 2) {
                onNLSearch(query.trim());
              }
            }}
            placeholder={nlSearchActive ? "AI search active — press Esc or click ✕ to clear" : "Search subjects — name, ID, country (press / to focus)…"}
            className={`w-full pl-8 pr-3 py-2 border rounded text-13 bg-bg-1 focus:outline-none focus:bg-bg-panel ${nlSearchActive ? "border-amber/50 focus:border-amber" : "border-hair-2 focus:border-brand"}`}
          />
        </div>

        {/* AI search toggle */}
        <button
          type="button"
          onClick={() => {
            setAiOpen((v) => !v);
            if (!aiOpen) setTimeout(() => aiInputRef.current?.focus(), 50);
          }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] text-11.5 font-medium rounded border transition-colors ${
            aiOpen || aiFilterLabel
              ? "bg-brand text-white border-brand"
              : "bg-bg-panel text-ink-0 border-hair-2 hover:border-brand hover:text-brand"
          }`}
          title="Natural language AI search"
        >
          <span>✦</span>
          <span className="font-semibold">AI search</span>
          {aiFilterLabel && <span className="font-mono text-10 opacity-80">· active</span>}
        </button>

        <div className="flex gap-2 items-center">
          {nlSearchActive && onNLSearchClear && (
            <button
              type="button"
              onClick={onNLSearchClear}
              className="inline-flex items-center gap-1 px-2.5 py-[5px] text-11.5 font-medium rounded border border-amber/50 text-amber bg-amber-dim hover:opacity-80 transition-opacity whitespace-nowrap"
            >
              ✦ AI · ✕ clear
            </button>
          )}
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

          <ColumnChooser visible={columns} onChange={onColumnsChange} />

          <ToolbarButton small onClick={onExport} title="Export filtered queue as CSV"><span style={{color:"#22c55e"}}>↓</span></ToolbarButton>

          <ToolbarButton small onClick={onBulkImport} title="Import a CSV of subjects"><span style={{color:"#f59e0b"}}>↑</span></ToolbarButton>

          <ToolbarButton small primary onClick={onNewScreening}>
            <span>+</span>
            <span className="font-semibold">New screening</span>
          </ToolbarButton>
        </div>
      </div>

      {/* AI search panel */}
      {aiOpen && (
        <div className="px-4 py-3 bg-bg-0 border border-brand rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-10 font-semibold uppercase tracking-wide-3 text-brand">✦ AI Search</span>
            <span className="text-10 text-ink-3">— describe what you're looking for in plain English</span>
          </div>
          <div className="flex gap-2">
            <input
              ref={aiInputRef}
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleAiSearch(); }}
              placeholder='e.g. "high risk Turkish companies with EDD" or "frozen PEPs on sanctions lists"'
              className="flex-1 text-12 px-3 py-2 rounded border border-brand bg-bg-panel text-ink-0 focus:outline-none focus:bg-bg-1 placeholder:text-ink-3"
            />
            <button
              type="button"
              onClick={() => void handleAiSearch()}
              disabled={aiLoading || !aiQuery.trim()}
              className="px-4 py-2 text-11.5 font-semibold rounded bg-brand text-white hover:bg-brand-hover disabled:opacity-40 transition-colors"
            >
              {aiLoading ? "⌕…" : "⌕"}
            </button>
            {aiFilterLabel && (
              <button
                type="button"
                onClick={handleClearAi}
                className="px-3 py-2 text-11.5 font-medium rounded border border-hair-2 bg-bg-panel text-ink-2 hover:border-red hover:text-red transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Example chips */}
          {!aiFilterLabel && !aiLoading && (
            <div className="flex flex-wrap gap-1.5">
              {[
                "critical individuals",
                "EDD subjects in Russia",
                "frozen PEPs",
                "sanctions hits over 80",
                "SLA breach active",
                "high risk gold companies",
                "vessels with list hits",
              ].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => { setAiQuery(ex); }}
                  className="text-10 px-2 py-0.5 rounded-full border border-hair-2 bg-bg-panel text-ink-3 hover:border-brand hover:text-brand transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {/* Interpreted result */}
          {aiInterpreted && aiFilterLabel && (
            <div className="flex items-start gap-2 text-11 bg-brand-dim border border-brand rounded px-3 py-2">
              <span className="text-brand font-mono">✦</span>
              <div>
                <span className="text-brand font-semibold">Showing: </span>
                <span className="text-ink-0">{aiInterpreted}</span>
                <button
                  type="button"
                  onClick={handleClearAi}
                  className="ml-3 text-10 text-ink-3 hover:text-red underline"
                >
                  clear filter
                </button>
              </div>
            </div>
          )}

          {aiError && (
            <div className="text-11 text-red bg-red-dim border border-red rounded px-3 py-2">
              {aiError}
            </div>
          )}
        </div>
      )}

      {/* Active AI filter pill (when panel is closed) */}
      {!aiOpen && aiFilterLabel && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-11 px-2.5 py-1 rounded-full bg-brand text-white font-medium">
            <span className="font-mono">✦</span>
            <span>AI: {aiFilterLabel}</span>
          </span>
          <button
            type="button"
            onClick={handleClearAi}
            className="text-11 text-ink-3 hover:text-red underline"
          >
            clear
          </button>
        </div>
      )}

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
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

        {/* Severity filter pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-11 text-ink-3 uppercase tracking-wide-2 mr-1">Severity:</span>
          {SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSeverityFilterChange(opt.value)}
              className={`px-2.5 py-1 rounded-full text-11.5 font-medium transition-colors border ${
                severityFilter === opt.value
                  ? `${opt.activeClass} border-transparent`
                  : "bg-bg-panel text-ink-1 border-hair-2 hover:border-hair-3 hover:bg-bg-2"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>


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
