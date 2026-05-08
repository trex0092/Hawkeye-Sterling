"use client";

import { useState } from "react";
import { IsoDateInput } from "@/components/ui/IsoDateInput";

interface Props {
  snoozedUntil: string | null;
  snoozeReason: string | null;
  onSnooze: (untilIso: string, reason: string) => void;
  onClearSnooze: () => void;
}

// Defer a low-priority subject for N days with a captured reason. The
// reason lands in the audit chain so the regulator can see why a case
// sat dormant. Active snooze shows a green pill + clear button.
export function SnoozeButton({ snoozedUntil, snoozeReason, onSnooze, onClearSnooze }: Props) {
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");

  if (snoozedUntil) {
    const dt = new Date(snoozedUntil);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yy = String(dt.getFullYear()).slice(-2);
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-dim text-amber border border-amber/30 text-11 font-mono" title={snoozeReason ?? undefined}>
        snoozed until {dd}/{mm}/{yy}
        <button type="button" onClick={onClearSnooze} className="text-amber/70 hover:text-amber" aria-label="Clear snooze">×</button>
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2.5 py-[5px] text-11.5 font-medium border border-hair-2 rounded text-ink-0 bg-bg-panel hover:border-amber hover:text-amber"
        title="Snooze this subject from the active queue"
      >
        Snooze
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded border border-amber bg-bg-panel">
      <IsoDateInput
        value={until}
        onChange={(iso) => setUntil(iso)}
        className="px-1.5 py-0.5 text-11 border border-hair-2 rounded bg-bg-1 text-ink-0"
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="reason"
        className="px-1.5 py-0.5 text-11 border border-hair-2 rounded bg-bg-1 text-ink-0 w-32"
      />
      <button
        type="button"
        disabled={!until || !reason.trim()}
        onClick={() => {
          const iso = new Date(until + "T23:59:59").toISOString();
          onSnooze(iso, reason.trim());
          setOpen(false);
          setUntil(""); setReason("");
        }}
        className="text-11 font-semibold text-amber px-1.5 disabled:opacity-40"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setUntil(""); setReason(""); }}
        className="text-11 text-ink-3 px-1"
      >
        ×
      </button>
    </div>
  );
}
