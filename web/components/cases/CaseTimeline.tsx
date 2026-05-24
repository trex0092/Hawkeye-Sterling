"use client";

import { useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CaseTimelineEventType =
  | "screening"
  | "escalation"
  | "note"
  | "str_filed"
  | "document"
  | "disposition"
  | "created"
  | "closed";

export type CaseTimelineSeverity = "info" | "warning" | "critical";

export interface CaseTimelineEvent {
  id: string;
  timestamp: string;           // ISO
  actor: string;               // user name or system
  eventType: CaseTimelineEventType;
  title: string;
  detail?: string;
  severity?: CaseTimelineSeverity;
}

export interface CaseTimelineProps {
  caseId: string;
  events: CaseTimelineEvent[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const EVENT_ICON: Record<CaseTimelineEventType, string> = {
  screening:   "🔍",
  escalation:  "⬆",
  note:        "📝",
  str_filed:   "📄",
  document:    "🗂",
  disposition: "⚖",
  created:     "✦",
  closed:      "✓",
};

const EVENT_LABEL: Record<CaseTimelineEventType, string> = {
  screening:   "Screening",
  escalation:  "Escalation",
  note:        "Note",
  str_filed:   "STR Filed",
  document:    "Document",
  disposition: "Disposition",
  created:     "Case Created",
  closed:      "Case Closed",
};

// Severity → border + icon colour
const SEVERITY_STYLE: Record<CaseTimelineSeverity, { dot: string; border: string; badge: string }> = {
  info:     { dot: "bg-brand",  border: "border-brand/30",  badge: "text-brand bg-brand/10 border-brand/20"  },
  warning:  { dot: "bg-amber",  border: "border-amber/30",  badge: "text-amber bg-amber/10 border-amber/20"  },
  critical: { dot: "bg-red",    border: "border-red/30",    badge: "text-red   bg-red/10   border-red/20"    },
};

// eventType → default severity when caller omits it
const EVENT_SEVERITY_DEFAULT: Record<CaseTimelineEventType, CaseTimelineSeverity> = {
  screening:   "info",
  escalation:  "warning",
  note:        "info",
  str_filed:   "critical",
  document:    "info",
  disposition: "warning",
  created:     "info",
  closed:      "info",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: iso, time: "" };
  }
}

// ── Single event node ──────────────────────────────────────────────────────────

interface EventNodeProps {
  event: CaseTimelineEvent;
  isLast: boolean;
}

function EventNode({ event, isLast }: EventNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const severity = event.severity ?? EVENT_SEVERITY_DEFAULT[event.eventType] ?? "info";
  const style = SEVERITY_STYLE[severity];
  const ts = formatTimestamp(event.timestamp);

  return (
    <div className="flex gap-3">
      {/* Left gutter: dot + line */}
      <div className="flex flex-col items-center shrink-0" style={{ width: 24 }}>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${style.border} bg-bg-panel`}>
          <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-hair-2 mt-1 mb-0" style={{ minHeight: 20 }} />
        )}
      </div>

      {/* Right: content */}
      <div className={`flex-1 pb-5 ${isLast ? "pb-0" : ""}`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-10 font-semibold border ${style.badge}`}>
              <span className="text-base leading-none" style={{ fontSize: 10 }}>{EVENT_ICON[event.eventType]}</span>
              {EVENT_LABEL[event.eventType]}
            </span>
            <span className="text-12 font-medium text-ink-0 truncate">{event.title}</span>
          </div>
          <div className="text-right shrink-0">
            <div className="text-11 font-mono text-ink-0">{ts.time}</div>
            <div className="text-10 text-ink-3">{ts.date}</div>
          </div>
        </div>

        {/* Actor */}
        <div className="flex items-center gap-1 text-11 text-ink-2 mb-1.5">
          <span className="w-3 h-3 rounded-full bg-bg-2 border border-hair-2 shrink-0 inline-flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-ink-3" />
          </span>
          {event.actor}
        </div>

        {/* Detail (expandable) */}
        {event.detail && (
          <div>
            {expanded ? (
              <div className="text-11 text-ink-1 leading-relaxed bg-bg-1 border border-hair-2 rounded p-2.5 whitespace-pre-wrap">
                {event.detail}
              </div>
            ) : (
              <p className="text-11 text-ink-2 leading-snug line-clamp-2">{event.detail}</p>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-10 text-brand hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CaseTimeline ──────────────────────────────────────────────────────────────

export function CaseTimeline({ caseId, events }: CaseTimelineProps) {
  const [page, setPage] = useState(1);

  // Sort newest → oldest
  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const visible = sorted.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < sorted.length;

  const loadMore = useCallback(() => setPage((p) => p + 1), []);

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-ink-3 text-12">
        No timeline events recorded for case {caseId}.
      </div>
    );
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-5 pb-3 border-b border-hair-2 text-11 text-ink-2 flex-wrap">
        <span className="font-mono text-ink-0 font-semibold">{caseId}</span>
        <span>{events.length} event{events.length !== 1 ? "s" : ""}</span>
        {[...new Set(events.map((e) => e.eventType))].map((t) => (
          <span
            key={t}
            className="px-2 py-0.5 rounded bg-bg-1 border border-hair-2 text-10 font-semibold text-ink-2"
          >
            {EVENT_LABEL[t as CaseTimelineEventType] ?? t}
          </span>
        ))}
      </div>

      {/* Timeline */}
      <div>
        {visible.map((event, idx) => (
          <EventNode
            key={event.id}
            event={event}
            isLast={idx === visible.length - 1 && !hasMore}
          />
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={loadMore}
            className="px-4 py-2 rounded-lg bg-bg-1 border border-hair-2 text-12 font-medium text-ink-1 hover:border-brand hover:text-ink-0 transition-colors"
          >
            Load more ({sorted.length - visible.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
