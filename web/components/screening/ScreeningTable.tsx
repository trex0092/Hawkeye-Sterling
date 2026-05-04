"use client";

import { useState } from "react";
import { RowActions } from "@/components/shared/RowActions";
import { ScoreExplainPopover } from "@/components/screening/ScoreExplainPopover";
import type { CDDPosture, SanctionSource, SortKey, Subject, SubjectStatus, TableColumnKey } from "@/lib/types";

interface ScreeningTableProps {
  subjects: Subject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSortChange: (key: SortKey) => void;
  /** Subject IDs currently being screened against the watchlist API. */
  pendingIds?: ReadonlySet<string>;
  /** Subject IDs whose last quick-screen call returned an error. */
  errorIds?: ReadonlySet<string>;
  /** Column visibility map from the column chooser. Defaults to all-on. */
  columns?: Record<TableColumnKey, boolean>;
  /** When provided, render row checkboxes for bulk-action selection. */
  selectedRowIds?: ReadonlySet<string>;
  onToggleRow?: (id: string) => void;
  onToggleAllRows?: (allOn: boolean) => void;
  /** Up to 2 subject IDs pinned for side-by-side compare. */
  compareIds?: ReadonlySet<string>;
  onToggleCompare?: (id: string) => void;
}

const ALL_COLUMNS_ON: Record<TableColumnKey, boolean> = {
  risk: true,
  status: true,
  cdd: true,
  sla: true,
  lists: true,
  snooze: false,
};

function parseSlaHours(sla: string): number {
  const match = sla.match(/\+?(\d+)h\s*(\d+)?m?/);
  if (!match || match[1] === undefined) return 999;
  return Number.parseInt(match[1], 10) + (match[2] ? Number.parseInt(match[2], 10) / 60 : 0);
}

export function ScreeningTable({
  subjects,
  selectedId,
  onSelect,
  onDelete,
  sortKey,
  sortDir,
  onSortChange,
  pendingIds,
  errorIds,
  columns = ALL_COLUMNS_ON,
  selectedRowIds,
  onToggleRow,
  onToggleAllRows,
  compareIds,
  onToggleCompare,
}: ScreeningTableProps) {
  const [explainFor, setExplainFor] = useState<{ subject: Subject; anchor: { x: number; y: number } } | null>(null);
  const showCheckboxes = !!onToggleRow;
  const allRowIds = subjects.map((s) => s.id);
  const allSelected = showCheckboxes && allRowIds.length > 0 && allRowIds.every((id) => selectedRowIds?.has(id));
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-x-auto">
      <table className="w-full border-collapse text-12.5 min-w-[640px]">
        <thead className="bg-bg-1 border-b border-hair-2">
          <tr>
            {showCheckboxes && (
              <th className="text-left px-3 py-2.5 w-[36px]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && (selectedRowIds?.size ?? 0) > 0; }}
                  onChange={(e) => onToggleAllRows?.(e.target.checked)}
                  className="accent-brand"
                  aria-label="Select all rows"
                />
              </th>
            )}
            <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2 w-[50px]">
              ID
            </th>
            <SortableTh
              label="Subject"
              colKey="name"
              activeKey={sortKey}
              dir={sortDir}
              onSort={onSortChange}
            />
            {columns.risk && (
              <SortableTh
                label="Risk"
                colKey="riskScore"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSortChange}
                className="w-[90px]"
              />
            )}
            {columns.status && (
              <SortableTh
                label="Status"
                colKey="status"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSortChange}
                className="w-[80px]"
              />
            )}
            {columns.cdd && (
              <SortableTh
                label="CDD"
                colKey="cddPosture"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSortChange}
                className="w-[60px]"
              />
            )}
            {columns.sla && (
              <SortableTh
                label="SLA"
                colKey="slaNotify"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSortChange}
                className="w-[70px]"
              />
            )}
            {columns.lists && (
              <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
                Lists
              </th>
            )}
            {columns.snooze && (
              <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2 w-[100px]">
                Snooze
              </th>
            )}
            <th className="w-[60px]" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, idx) => {
            const isLast = idx === subjects.length - 1;
            const isSelected = subject.id === selectedId;
            const slh = parseSlaHours(subject.slaNotify);
            const isScreening = pendingIds?.has(subject.id) ?? false;
            const hasError = !isScreening && (errorIds?.has(subject.id) ?? false);
            const cellBorder = isLast ? "" : "border-b border-hair";
            const isChecked = selectedRowIds?.has(subject.id) ?? false;
            return (
              <tr
                key={subject.id}
                onClick={() => onSelect(subject.id)}
                className={`group cursor-pointer ${isSelected ? "bg-bg-1" : "hover:bg-bg-1"}`}
              >
                {showCheckboxes && (
                  <td className={`px-3 py-3 ${cellBorder}`} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleRow?.(subject.id)}
                      className="accent-brand"
                      aria-label={`Select ${subject.name}`}
                    />
                  </td>
                )}
                <td className={`px-4 py-3 ${cellBorder}`}>
                  <Badge tone={subject.badgeTone} label={subject.badge} />
                </td>
                <td className={`px-4 py-3 ${cellBorder}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-ink-0 text-12.5">{subject.name}</span>
                    {onToggleCompare && (
                      <button
                        type="button"
                        title={compareIds?.has(subject.id) ? "Remove from compare" : "Add to compare (max 2)"}
                        onClick={(e) => { e.stopPropagation(); onToggleCompare(subject.id); }}
                        className={`inline-flex items-center px-1 py-px rounded text-10 font-mono border transition-colors ${
                          compareIds?.has(subject.id)
                            ? "bg-brand text-white border-brand"
                            : "bg-transparent text-ink-3 border-hair-2 opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        ⇔
                      </button>
                    )}
                    {subject.pep && (
                      <span
                        className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold tracking-wide-2 bg-brand text-white uppercase"
                        title={subject.pep.rationale ?? undefined}
                      >
                        PEP
                      </span>
                    )}
                    {subject.snoozedUntil && (
                      <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold tracking-wide-2 bg-amber-dim text-amber uppercase" title={subject.snoozeReason ?? undefined}>
                        Snoozed
                      </span>
                    )}
                    {isScreening && (
                      <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold tracking-wide-2 bg-amber-dim text-amber uppercase animate-pulse">
                        Screening…
                      </span>
                    )}
                    {hasError && (
                      <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold tracking-wide-2 bg-red-dim text-red uppercase" title="Screening API call failed — retry by re-adding the subject">
                        Screen failed
                      </span>
                    )}
                  </div>
                  <div className="text-11 text-ink-2 mt-0.5 leading-snug">
                    {subject.country}
                    {subject.meta && subject.meta !== "new subject" && (
                      <> · {subject.meta.slice(0, 40)}{subject.meta.length > 40 ? "…" : ""}</>
                    )}
                  </div>
                </td>
                {columns.risk && (
                  <td
                    className={`px-4 py-3 ${cellBorder}`}
                    onClick={(e) => {
                      // Clicking the risk cell pops the explainer instead of
                      // routing to the detail panel — cheaper for the analyst
                      // who only wants to know "why this score?"
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setExplainFor({ subject, anchor: { x: rect.right, y: rect.bottom } });
                    }}
                  >
                    <RiskCell score={subject.riskScore} pending={isScreening} error={hasError} />
                  </td>
                )}
                {columns.status && (
                  <td className={`px-4 py-3 ${cellBorder}`}>
                    <StatusBadge status={subject.status} />
                  </td>
                )}
                {columns.cdd && (
                  <td className={`px-4 py-3 ${cellBorder}`}>
                    <CddBadge posture={subject.cddPosture} />
                  </td>
                )}
                {columns.sla && (
                  <td className={`px-4 py-3 ${cellBorder}`}>
                    <SlaBadge hours={slh} raw={subject.slaNotify} />
                  </td>
                )}
                {columns.lists && (
                  <td className={`px-4 py-3 ${cellBorder}`}>
                    <div className="flex flex-wrap gap-1">
                      {subject.listCoverage.map((source) => (
                        <SanctionTag key={source} source={source} />
                      ))}
                    </div>
                  </td>
                )}
                {columns.snooze && (
                  <td className={`px-4 py-3 ${cellBorder}`}>
                    {subject.snoozedUntil ? (
                      <span className="text-10 font-mono text-amber">
                        until {subject.snoozedUntil.slice(0, 10)}
                      </span>
                    ) : (
                      <span className="text-10 text-ink-3">—</span>
                    )}
                  </td>
                )}
                <td className={`px-2 py-3 ${cellBorder}`}>
                  <RowActions
                    label={subject.name}
                    onEdit={() => onSelect(subject.id)}
                    onDelete={() => onDelete(subject.id)}
                    confirmDelete={false}
                  />
                </td>
              </tr>
            );
          })}
          {subjects.length === 0 && (
            <tr>
              <td colSpan={12} className="px-6 py-10 text-center text-12 text-ink-2">
                No screenings yet — click{" "}
                <span className="font-semibold text-ink-0">+ New screening</span> to add a
                subject.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {explainFor && (
        <ScoreExplainPopover
          subject={explainFor.subject}
          anchor={explainFor.anchor}
          onClose={() => setExplainFor(null)}
        />
      )}
    </div>
  );
}

function SortableTh({
  label,
  colKey,
  activeKey,
  dir,
  onSort,
  className = "",
}: {
  label: string;
  colKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = colKey === activeKey;
  return (
    <th
      className={`text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2 cursor-pointer select-none hover:text-ink-0 ${className}`}
      onClick={() => onSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-10 ${active ? "text-brand" : "text-ink-3"}`}>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}

function RiskCell({ score, pending, error }: { score: number; pending?: boolean; error?: boolean }) {
  if (error) {
    return (
      <div>
        <div className="flex items-baseline gap-1 mb-0.5">
          <span className="font-mono text-12 font-semibold text-red">!</span>
        </div>
        <div className="h-1 w-14 bg-bg-2 rounded-sm overflow-hidden">
          <div className="h-full bg-red rounded-sm" style={{ width: "100%" }} />
        </div>
      </div>
    );
  }
  if (pending) {
    return (
      <div>
        <div className="flex items-baseline gap-1 mb-0.5">
          <span className="font-mono text-12 font-semibold text-ink-3">—</span>
        </div>
        <div className="h-1 w-14 bg-bg-2 rounded-sm overflow-hidden">
          <div className="h-full bg-amber rounded-sm animate-pulse" style={{ width: "40%" }} />
        </div>
      </div>
    );
  }
  const color =
    score >= 85
      ? "bg-red"
      : score >= 60
        ? "bg-orange"
        : score >= 35
          ? "bg-amber"
          : "bg-green";
  return (
    <div>
      <div className="flex items-baseline gap-1 mb-0.5">
        <span className="font-mono text-12 font-semibold text-ink-0">{score}</span>
        <span className="text-10 text-ink-3">/100</span>
      </div>
      <div className="h-1 w-14 bg-bg-2 rounded-sm overflow-hidden">
        <div
          className={`h-full ${color} rounded-sm`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SubjectStatus }) {
  const styles: Record<SubjectStatus, string> = {
    active: "bg-green-dim text-green",
    frozen: "bg-amber-dim text-amber",
    cleared: "bg-blue-dim text-blue",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm font-mono text-10 font-medium tracking-wide-1 ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function CddBadge({ posture }: { posture: CDDPosture }) {
  const styles: Record<CDDPosture, string> = {
    CDD: "bg-bg-2 text-ink-2",
    EDD: "bg-orange-dim text-orange",
    SDD: "bg-violet-dim text-violet",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm font-mono text-10 font-semibold ${styles[posture]}`}
    >
      {posture}
    </span>
  );
}

function SlaBadge({ hours, raw }: { hours: number; raw: string }) {
  if (hours <= 0) {
    return (
      <span className="font-mono text-10 font-semibold text-red">BREACH</span>
    );
  }
  if (hours <= 24) {
    return (
      <span className="font-mono text-10 font-semibold text-orange">{raw}</span>
    );
  }
  return <span className="font-mono text-10 text-ink-2">{raw}</span>;
}

function Badge({ tone, label }: { tone: "violet" | "orange" | "dashed"; label: string }) {
  const base =
    "w-8 h-8 rounded flex items-center justify-center font-mono text-11 font-semibold flex-shrink-0";
  if (tone === "dashed") {
    return (
      <div className={`${base} text-ink-2 border border-dashed border-hair-2`}>•</div>
    );
  }
  const tones: Record<"violet" | "orange", string> = {
    violet: "bg-violet-dim text-violet",
    orange: "bg-orange-dim text-orange",
  };
  return <div className={`${base} ${tones[tone]}`}>{label}</div>;
}

function SanctionTag({ source }: { source: SanctionSource }) {
  const styles: Record<SanctionSource, string> = {
    OFAC:     "bg-violet-dim text-violet",
    UN:       "bg-blue-dim text-blue",
    EU:       "bg-amber-dim text-amber",
    UK:       "bg-green-dim text-green",
    EOCN:     "bg-red-dim text-red",
    AU:       "bg-orange-dim text-orange",
    CA:       "bg-red-dim text-red",
    CH:       "bg-brand-dim text-brand-deep",
    JP:       "bg-violet-dim text-violet",
    FATF:     "bg-orange-dim text-orange",
    INTERPOL: "bg-blue-dim text-blue",
    WB:       "bg-amber-dim text-amber",
    ADB:      "bg-green-dim text-green",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-10.5 font-medium tracking-wide-2 ${styles[source] ?? "bg-bg-2 text-ink-2"}`}
    >
      {source}
    </span>
  );
}
