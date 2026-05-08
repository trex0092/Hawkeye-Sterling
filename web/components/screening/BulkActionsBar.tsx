"use client";

import { useState } from "react";
import type { CDDPosture, Subject } from "@/lib/types";
import { IsoDateInput } from "@/components/ui/IsoDateInput";

interface Props {
  selectedIds: string[];
  onClear: () => void;
  onApplyCdd: (posture: CDDPosture) => void;
  onMarkCleared: () => void;
  onAssign: (operator: string) => void;
  onSnoozeUntil: (iso: string, reason: string) => void;
  onDelete: () => void;
}

// Floating bar that materialises when ≥1 row is checked. Replaces the
// per-row clicking grind with batch operations the MLRO actually does
// (bulk EDD uplift, queue-clearance, Friday triage assignment).
export function BulkActionsBar({
  selectedIds,
  onClear,
  onApplyCdd,
  onMarkCleared,
  onAssign,
  onSnoozeUntil,
  onDelete,
}: Props) {
  const [assignDraft, setAssignDraft] = useState("");
  const [snoozeDraft, setSnoozeDraft] = useState({ until: "", reason: "" });
  const [showAssign, setShowAssign] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);

  if (selectedIds.length === 0) return null;

  return (
    <div className="sticky top-0 z-20 -mx-10 px-10 py-2 bg-bg-panel border-b border-hair-2 shadow-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-12 font-semibold text-ink-0">
          {selectedIds.length} selected
        </span>

        <span className="text-ink-3">·</span>

        <div className="inline-flex gap-1">
          {(["CDD", "EDD", "SDD"] as CDDPosture[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onApplyCdd(p)}
              className="px-2 py-1 text-11 font-mono font-semibold border border-hair-2 rounded text-ink-0 hover:border-brand hover:text-brand"
              title={`Set CDD posture to ${p}`}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onMarkCleared}
          className="px-2.5 py-1 text-11 font-medium border border-hair-2 rounded text-ink-0 hover:border-green hover:text-green"
        >
          Mark cleared
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowAssign((v) => !v); setShowSnooze(false); }}
            className="px-2.5 py-1 text-11 font-medium border border-hair-2 rounded text-ink-0 hover:border-brand hover:text-brand"
          >
            Assign…
          </button>
          {showAssign && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-bg-panel border border-hair-2 rounded-lg shadow-lg p-2 z-30">
              <input
                autoFocus
                value={assignDraft}
                onChange={(e) => setAssignDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && assignDraft.trim()) { onAssign(assignDraft.trim()); setShowAssign(false); setAssignDraft(""); } }}
                placeholder="operator name or email"
                className="w-full px-2 py-1 text-12 border border-hair-2 rounded bg-bg-1 text-ink-0"
              />
              <div className="flex justify-end gap-1 mt-1.5">
                <button type="button" onClick={() => setShowAssign(false)} className="text-11 text-red px-2 py-1">✕</button>
                <button
                  type="button"
                  disabled={!assignDraft.trim()}
                  onClick={() => { onAssign(assignDraft.trim()); setShowAssign(false); setAssignDraft(""); }}
                  className="text-11 font-semibold text-brand px-2 py-1 disabled:opacity-40"
                >
                  Assign
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowSnooze((v) => !v); setShowAssign(false); }}
            className="px-2.5 py-1 text-11 font-medium border border-hair-2 rounded text-ink-0 hover:border-amber hover:text-amber"
          >
            Snooze…
          </button>
          {showSnooze && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-bg-panel border border-hair-2 rounded-lg shadow-lg p-2 z-30">
              <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Until</label>
              <IsoDateInput
                value={snoozeDraft.until}
                onChange={(iso) => setSnoozeDraft({ ...snoozeDraft, until: iso })}
                className="w-full px-2 py-1 text-12 border border-hair-2 rounded bg-bg-1 text-ink-0 mb-2"
              />
              <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Reason</label>
              <input
                value={snoozeDraft.reason}
                onChange={(e) => setSnoozeDraft({ ...snoozeDraft, reason: e.target.value })}
                placeholder="awaiting docs / SoW"
                className="w-full px-2 py-1 text-12 border border-hair-2 rounded bg-bg-1 text-ink-0"
              />
              <div className="flex justify-end gap-1 mt-1.5">
                <button type="button" onClick={() => setShowSnooze(false)} className="text-11 text-red px-2 py-1">✕</button>
                <button
                  type="button"
                  disabled={!snoozeDraft.until || !snoozeDraft.reason.trim()}
                  onClick={() => {
                    const iso = new Date(snoozeDraft.until + "T23:59:59").toISOString();
                    onSnoozeUntil(iso, snoozeDraft.reason.trim());
                    setShowSnooze(false);
                    setSnoozeDraft({ until: "", reason: "" });
                  }}
                  className="text-11 font-semibold text-amber px-2 py-1 disabled:opacity-40"
                >
                  Snooze
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="px-2.5 py-1 text-11 font-medium border border-red/30 rounded text-red bg-red-dim hover:bg-red hover:text-white"
        >
          Delete
        </button>

        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-11 text-ink-3 hover:text-ink-0"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}

// Tiny helper used by the page to compute the union of selected subjects'
// fields when surfacing summary stats in the bar (e.g. "3 PEPs · 1 EDD").
export function summariseSelection(subjects: Subject[], selectedIds: string[]) {
  const set = new Set(selectedIds);
  const sel = subjects.filter((s) => set.has(s.id));
  return {
    count: sel.length,
    pepCount: sel.filter((s) => s.pep != null).length,
    eddCount: sel.filter((s) => s.cddPosture === "EDD").length,
    criticalCount: sel.filter((s) => s.riskScore >= 85).length,
  };
}
