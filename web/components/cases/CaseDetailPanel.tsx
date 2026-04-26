"use client";

import type { CaseRecord, CaseStatus, EvidenceEntry, TimelineEvent } from "@/lib/types";

const STATUS_COLORS: Record<CaseStatus, string> = {
  reported: "text-red",
  review: "text-amber",
  active: "text-brand",
  closed: "text-green",
};

interface CaseDetailPanelProps {
  record: CaseRecord;
  onExport?: (() => void) | undefined;
  onViewTimeline?: (() => void) | undefined;
}

export function CaseDetailPanel({
  record,
  onExport,
  onViewTimeline,
}: CaseDetailPanelProps) {
  const subtitleBits = [
    record.subject,
    `Opened ${record.opened}`,
    record.reported ? `Reported ${record.reported}` : null,
  ].filter(Boolean);

  return (
    <aside className="bg-bg-panel border-l border-[#ec4899] p-6 overflow-y-auto">
      <div className="mb-5 pb-4 border-b border-hair">
        <div className="flex justify-between items-center mb-2">
          <p className="text-16 font-semibold text-ink-0 m-0">Case {record.id}</p>
          <div className="flex gap-1.5">
            <PanelBtn onClick={onExport} title="View or download compliance report">
              Export
            </PanelBtn>
            <PanelBtn
              brand
              onClick={onViewTimeline}
              title="Open audit-trail timeline"
            >
              View timeline
            </PanelBtn>
          </div>
        </div>
        <p className="text-12 text-ink-2 m-0">{subtitleBits.join(" · ")}</p>
      </div>

      <Section title="Case summary">
        <Field label="Status">
          <span className={`text-13 font-semibold ${STATUS_COLORS[record.status]}`}>
            {record.statusDetail}
          </span>
        </Field>
        {record.goAMLReference && (
          <Field label="goAML reference">
            <span className="font-mono text-12 text-ink-0">{record.goAMLReference}</span>
          </Field>
        )}
        {record.mlroDisposition && (
          <Field label="MLRO disposition">
            <span className="text-13 text-ink-0">{record.mlroDisposition}</span>
          </Field>
        )}
      </Section>

      <Section title="Evidence vault">
        <div className="grid gap-2">
          {record.evidence.map((entry, idx) => (
            <EvidenceRow key={`${entry.category}-${idx}`} entry={entry} />
          ))}
        </div>
      </Section>

      <Section title="Audit trail">
        <div className="text-11 text-ink-2 leading-[1.6]">
          {record.timeline.map((event, idx) => (
            <TimelineRow
              key={`${event.timestamp}-${idx}`}
              event={event}
              isLast={idx === record.timeline.length - 1}
            />
          ))}
        </div>
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-11 font-medium uppercase tracking-wide-3 text-ink-2 mb-1">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function PanelBtn({
  children,
  brand,
  onClick,
  title,
}: {
  children: React.ReactNode;
  brand?: boolean | undefined;
  onClick?: (() => void) | undefined;
  title?: string | undefined;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded border px-2.5 py-[5px] text-11.5 font-medium cursor-pointer transition-colors";
  const variant = brand
    ? "bg-brand border-brand text-white font-semibold hover:bg-brand-hover"
    : "bg-bg-panel border-hair-2 text-ink-0 hover:border-hair-3 hover:bg-bg-2";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`${base} ${variant}`}
    >
      {children}
    </button>
  );
}

function EvidenceRow({ entry }: { entry: EvidenceEntry }) {
  return (
    <div className="px-3 py-2.5 bg-bg-1 rounded">
      <div className="flex justify-between mb-1">
        <span className="text-12 font-medium text-ink-0">{entry.title}</span>
        <span className="font-mono text-10.5 text-ink-2">{entry.meta}</span>
      </div>
      <div className="text-11 text-ink-2">{entry.detail}</div>
    </div>
  );
}

function TimelineRow({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  return (
    <div className={isLast ? "" : "mb-2"}>
      <strong className="text-ink-0">{event.timestamp}</strong> — {event.event}
    </div>
  );
}
