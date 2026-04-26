"use client";

import type { CDDPosture, SanctionSource, SortKey, Subject, SubjectStatus } from "@/lib/types";

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
}

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
}: ScreeningTableProps) {
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
      <table className="w-full border-collapse text-12.5">
        <thead className="bg-bg-1 border-b border-hair-2">
          <tr>
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
            <SortableTh
              label="Risk"
              colKey="riskScore"
              activeKey={sortKey}
              dir={sortDir}
              onSort={onSortChange}
              className="w-[90px]"
            />
            <SortableTh
              label="Status"
              colKey="status"
              activeKey={sortKey}
              dir={sortDir}
              onSort={onSortChange}
              className="w-[80px]"
            />
            <SortableTh
              label="CDD"
              colKey="cddPosture"
              activeKey={sortKey}
              dir={sortDir}
              onSort={onSortChange}
              className="w-[60px]"
            />
            <SortableTh
              label="SLA"
              colKey="slaNotify"
              activeKey={sortKey}
              dir={sortDir}
              onSort={onSortChange}
              className="w-[70px]"
            />
            <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
              Lists
            </th>
            <th className="w-[40px]" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, idx) => {
            const isLast = idx === subjects.length - 1;
            const isSelected = subject.id === selectedId;
            const slh = parseSlaHours(subject.slaNotify);
            const isScreening = pendingIds?.has(subject.id) ?? false;
            return (
              <tr
                key={subject.id}
                onClick={() => onSelect(subject.id)}
                className={`cursor-pointer ${isSelected ? "bg-bg-1" : "hover:bg-bg-1"}`}
              >
                <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <Badge tone={subject.badgeTone} label={subject.badge} />
                </td>
                <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-ink-0 text-12.5">{subject.name}</span>
                    {subject.pep && (
                      <span
                        className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold tracking-wide-2 bg-brand text-white uppercase"
                        title={subject.pep.rationale ?? undefined}
                      >
                        PEP
                      </span>
                    )}
                    {isScreening && (
                      <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold tracking-wide-2 bg-amber-dim text-amber uppercase animate-pulse">
                        Screening…
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
                <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <RiskCell score={subject.riskScore} pending={isScreening} />
                </td>
                <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <StatusBadge status={subject.status} />
                </td>
                <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <CddBadge posture={subject.cddPosture} />
                </td>
                <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <SlaBadge hours={slh} raw={subject.slaNotify} />
                </td>
                <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <div className="flex flex-wrap gap-1">
                    {subject.listCoverage.map((source) => (
                      <SanctionTag key={source} source={source} />
                    ))}
                  </div>
                </td>
                <td className={`px-2 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <button
                    type="button"
                    aria-label={`Delete ${subject.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(subject.id);
                    }}
                    className="w-7 h-7 rounded flex items-center justify-center text-ink-3 hover:bg-red-dim hover:text-red transition-colors"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
          {subjects.length === 0 && (
            <tr>
              <td colSpan={8} className="px-6 py-10 text-center text-12 text-ink-2">
                No screenings yet — click{" "}
                <span className="font-semibold text-ink-0">+ New screening</span> to add a
                subject.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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

function RiskCell({ score, pending }: { score: number; pending?: boolean }) {
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
