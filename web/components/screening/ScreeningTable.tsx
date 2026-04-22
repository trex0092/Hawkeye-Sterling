"use client";

import type { SanctionSource, Subject } from "@/lib/types";

interface ScreeningTableProps {
  subjects: Subject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ScreeningTable({ subjects, selectedId, onSelect }: ScreeningTableProps) {
  return (
    <div className="bg-white border border-hair-2 rounded-xl overflow-hidden">
      <table className="w-full border-collapse text-12.5">
        <thead className="bg-bg-1 border-b border-hair-2">
          <tr>
            <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2 w-[50px]">
              ID
            </th>
            <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
              Subject
            </th>
            <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
              Type
            </th>
            <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
              List coverage
            </th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, idx) => {
            const isLast = idx === subjects.length - 1;
            const isSelected = subject.id === selectedId;
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
                  <div className="font-medium text-ink-0 text-12.5">{subject.name}</div>
                  <div className="text-11 text-ink-2 mt-0.5 leading-snug">
                    {subject.country}
                    <br />
                    {subject.meta}
                  </div>
                </td>
                <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <div className="text-11 text-ink-2">{subject.type}</div>
                </td>
                <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                  <div className="flex flex-wrap gap-1">
                    {subject.listCoverage.map((source) => (
                      <SanctionTag key={source} source={source} />
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
    OFAC: "bg-violet-dim text-violet",
    UN: "bg-blue-dim text-blue",
    EU: "bg-amber-dim text-amber",
    UK: "bg-green-dim text-green",
    EOCN: "bg-red-dim text-red",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-10.5 font-medium tracking-wide-2 ${styles[source]}`}
    >
      {source}
    </span>
  );
}
