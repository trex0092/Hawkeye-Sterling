"use client";

import { RowActions } from "@/components/shared/RowActions";
import type { CaseBadgeTone, CaseRecord, CaseStatus } from "@/lib/types";

interface CasesTableProps {
  cases: CaseRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenReport: (record: CaseRecord) => void;
}

export function CasesTable({
  cases,
  selectedId,
  onSelect,
  onDelete,
  onOpenReport,
}: CasesTableProps) {
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
      <table className="w-full border-collapse text-12.5">
        <thead className="bg-bg-1 border-b border-hair-2">
          <tr>
            <Th width="100px">Case ID</Th>
            <Th>Subject</Th>
            <Th>Status</Th>
            <Th>Evidence</Th>
            <Th>Last activity</Th>
            <th className="w-[60px]" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {cases.map((record, idx) => {
            const isLast = idx === cases.length - 1;
            const isSelected = record.id === selectedId;
            return (
              <tr
                key={record.id}
                onClick={() => {
                  onSelect(record.id);
                  onOpenReport(record);
                }}
                className={`cursor-pointer ${isSelected ? "bg-bg-1" : "hover:bg-bg-1"}`}
              >
                <Td isLast={isLast}>
                  <CaseBadge tone={record.badgeTone} label={record.badge} />
                </Td>
                <Td isLast={isLast}>
                  <div className="font-medium text-ink-0 text-12.5">{record.subject}</div>
                  <div className="text-11 text-ink-2 mt-0.5 leading-snug">{record.meta}</div>
                </Td>
                <Td isLast={isLast}>
                  <StatusTag status={record.status} label={record.statusLabel} />
                </Td>
                <Td isLast={isLast}>
                  <span className="font-mono text-11.5 text-ink-0">
                    {record.evidenceCount}
                  </span>
                </Td>
                <Td isLast={isLast}>
                  <span className="text-11.5 text-ink-2">{record.lastActivity}</span>
                </Td>
                <td className={`px-2 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <RowActions
                    label={`case ${record.id}`}
                    onEdit={() => onOpenReport(record)}
                    onDelete={() => onDelete(record.id)}
                    deleteConfirmMessage={`Delete case ${record.id} (${record.subject})? The audit-trail entries will remain but the case row will be removed from the register.`}
                  />
                </td>
              </tr>
            );
          })}
          {cases.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-6 py-10 text-center text-12 text-ink-2"
              >
                No cases yet — cases appear here when you escalate a subject
                or file an STR from the screening panel.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th
      className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2"
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  );
}

function Td({ children, isLast }: { children: React.ReactNode; isLast: boolean }) {
  return (
    <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>{children}</td>
  );
}

function CaseBadge({ tone, label }: { tone: CaseBadgeTone; label: string }) {
  const styles: Record<CaseBadgeTone, string> = {
    violet: "bg-violet-dim text-violet",
    orange: "bg-orange-dim text-orange",
    green: "bg-green-dim text-green",
  };
  return (
    <div
      className={`inline-flex items-center justify-center h-8 px-2.5 rounded font-mono text-11 font-semibold ${styles[tone]}`}
    >
      {label}
    </div>
  );
}

function StatusTag({ status, label }: { status: CaseStatus; label: string }) {
  const styles: Record<CaseStatus, string> = {
    reported: "bg-red-dim text-red",
    review: "bg-amber-dim text-amber",
    active: "bg-brand-dim text-brand",
    closed: "bg-green-dim text-green",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-10.5 font-medium tracking-wide-2 ${styles[status]}`}
    >
      {label}
    </span>
  );
}
