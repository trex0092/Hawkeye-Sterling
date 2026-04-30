"use client";

import { useMemo } from "react";
import type { Subject } from "@/lib/types";

interface Props {
  subject: Subject;
  /** Full queue — used to derive cross-subject edges. */
  allSubjects: Subject[];
  onSelect?: (subjectId: string) => void;
}

interface Edge {
  toId: string;
  toName: string;
  reasons: string[];
}

// Pure-client analysis: surfaces edges between this subject and others
// in the queue based on identifiers that should not coincidentally match
// — shared crypto wallet, shared IMO/MMSI, shared aircraft tail, alias
// overlap on a multi-token name, or shared (non-empty) jurisdiction +
// alias-token overlap.
//
// Deliberately conservative — we don't want to surface "two organisations
// happen to be in the UAE" as an edge.
function deriveEdges(subject: Subject, all: Subject[]): Edge[] {
  const edges: Edge[] = [];
  const subjAliases = new Set(
    [subject.name, ...(subject.aliases ?? [])]
      .flatMap((n) => n.toLowerCase().split(/\s+/))
      .filter((t) => t.length >= 4),
  );
  const subjWallets = new Set((subject.walletAddresses ?? []).map((w) => w.toLowerCase()));
  const subjImo = subject.vesselImo;
  const subjMmsi = subject.vesselMmsi;
  const subjTail = subject.aircraftTail;

  for (const other of all) {
    if (other.id === subject.id) continue;
    const reasons: string[] = [];

    if (subjWallets.size > 0 && other.walletAddresses) {
      for (const w of other.walletAddresses) {
        if (subjWallets.has(w.toLowerCase())) {
          reasons.push(`wallet ${w.slice(0, 8)}…`);
        }
      }
    }

    if (subjImo && other.vesselImo === subjImo) reasons.push(`IMO ${subjImo}`);
    if (subjMmsi && other.vesselMmsi === subjMmsi) reasons.push(`MMSI ${subjMmsi}`);
    if (subjTail && other.aircraftTail === subjTail) reasons.push(`tail ${subjTail}`);

    const otherTokens = new Set(
      [other.name, ...(other.aliases ?? [])]
        .flatMap((n) => n.toLowerCase().split(/\s+/))
        .filter((t) => t.length >= 4),
    );
    const overlap = [...subjAliases].filter((t) => otherTokens.has(t));
    if (overlap.length >= 2) {
      reasons.push(`alias overlap (${overlap.slice(0, 3).join(", ")})`);
    } else if (
      overlap.length === 1 &&
      subject.jurisdiction &&
      other.jurisdiction &&
      subject.jurisdiction === other.jurisdiction
    ) {
      reasons.push(`shared "${overlap[0]}" in ${subject.jurisdiction}`);
    }

    if (reasons.length > 0) {
      edges.push({ toId: other.id, toName: other.name, reasons });
    }
  }
  // Strongest first — wallet/IMO/tail beats alias overlap.
  edges.sort((a, b) => b.reasons.length - a.reasons.length);
  return edges.slice(0, 8);
}

export function CrossSubjectLinks({ subject, allSubjects, onSelect }: Props) {
  const edges = useMemo(() => deriveEdges(subject, allSubjects), [subject, allSubjects]);

  if (edges.length === 0) return null;

  return (
    <div className="bg-bg-1 border border-hair-2 rounded-lg p-3 mb-3">
      <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">
        Cross-subject links ({edges.length})
      </div>
      <ul className="space-y-1.5">
        {edges.map((e) => (
          <li key={e.toId} className="flex items-start gap-2 text-11">
            <button
              type="button"
              onClick={() => onSelect?.(e.toId)}
              className="text-ink-0 font-medium hover:text-brand text-left flex-1 min-w-0 truncate"
              title={`Open ${e.toName}`}
            >
              {e.toName}
            </button>
            <div className="flex flex-wrap gap-1 shrink-0">
              {e.reasons.map((r, i) => (
                <span key={i} className="inline-flex items-center px-1.5 py-px rounded font-mono text-10 bg-violet-dim text-violet">
                  {r}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
