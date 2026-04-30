// Hawkeye Sterling — DispositionButton (audit follow-up #29).
//
// MLRO confirms (or overrides) the auto-dispositioner's proposal. POSTs
// to /api/cases/[id]/disposition (shipped in PR #243 commit 2dbbcbf,
// Netlify Blobs persistence in d6c126b). Closing the calibration loop
// end-to-end: every confirmed disposition feeds the
// OutcomeFeedbackJournal which drives Brier / log-score per mode +
// bias-signal detection over time.

"use client";

import { useState } from "react";

const DISPOSITION_CODES = [
  { code: "D00_no_match", label: "D00 — No match" },
  { code: "D01_partial_match", label: "D01 — Partial match" },
  { code: "D02_cleared_proceed", label: "D02 — Cleared, proceed" },
  { code: "D03_edd_required", label: "D03 — EDD required" },
  { code: "D04_heightened_monitoring", label: "D04 — Heightened monitoring" },
  { code: "D05_frozen_ffr", label: "D05 — Frozen, FFR filed" },
  { code: "D06_partial_match_pnmr", label: "D06 — Partial match (PNMR)" },
  { code: "D07_str_filed", label: "D07 — STR filed" },
  { code: "D08_exit_relationship", label: "D08 — Exit relationship" },
  { code: "D09_do_not_onboard", label: "D09 — Do not onboard" },
  { code: "D10_refer_to_authority", label: "D10 — Refer to authority" },
] as const;

type DispositionCode = (typeof DISPOSITION_CODES)[number]["code"];

interface Props {
  caseId: string;
  runId: string;
  modeIds: string[];
  autoProposed: DispositionCode | string;
  autoConfidence: number;
  reviewerId?: string;
  onSubmit?: (result: { ok: boolean; recorded?: boolean; overridden?: boolean; persisted?: boolean; error?: string }) => void;
}

export function DispositionButton({
  caseId,
  runId,
  modeIds,
  autoProposed,
  autoConfidence,
  reviewerId,
  onSubmit,
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<DispositionCode>(
    (DISPOSITION_CODES.find((d) => d.code === autoProposed)?.code ?? "D02_cleared_proceed") as DispositionCode,
  );
  const [overrideReason, setOverrideReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [doneText, setDoneText] = useState<string | null>(null);

  const overridden = chosen !== autoProposed;

  async function submit(): Promise<void> {
    setBusy(true);
    setErrorText(null);
    setDoneText(null);
    try {
      const body: Record<string, unknown> = {
        runId,
        modeIds,
        autoProposed,
        autoConfidence,
        mlroDecided: chosen,
        overridden,
      };
      if (overridden && overrideReason.trim().length > 0) {
        body.overrideReason = overrideReason.trim();
      }
      if (reviewerId !== undefined) body.reviewerId = reviewerId;

      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/disposition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        recorded?: boolean;
        overridden?: boolean;
        persisted?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setErrorText(data.error ?? `HTTP ${res.status}`);
        onSubmit?.({ ok: false, error: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setDoneText(
        `Recorded${data.overridden ? " (override)" : ""}${data.persisted ? " · persisted" : " · in-memory only"}`,
      );
      onSubmit?.({
        ok: true,
        recorded: data.recorded,
        overridden: data.overridden,
        persisted: data.persisted,
      });
      setTimeout(() => setOpen(false), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorText(msg);
      onSubmit?.({ ok: false, error: msg });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-300 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
      >
        Confirm disposition
      </button>
    );
  }

  return (
    <div className="rounded-md border border-zinc-300 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">MLRO disposition</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:text-zinc-800"
          disabled={busy}
        >
          ✕
        </button>
      </div>

      <div className="mt-2 text-[11px] text-zinc-500">
        Auto-proposed:{" "}
        <span className="font-mono">{autoProposed}</span> · confidence{" "}
        <span className="tabular-nums">{(autoConfidence * 100).toFixed(0)}%</span>
      </div>

      <label className="mt-2 block text-xs">
        <span className="text-zinc-700">MLRO decision</span>
        <select
          value={chosen}
          onChange={(e) => setChosen(e.target.value as DispositionCode)}
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
          disabled={busy}
        >
          {DISPOSITION_CODES.map((d) => (
            <option key={d.code} value={d.code}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      {overridden && (
        <label className="mt-2 block text-xs">
          <span className="text-zinc-700">Override reason</span>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="One-line rationale (charter P9 — explicit calibration trail)"
            rows={2}
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
            disabled={busy}
          />
        </label>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Recording…" : overridden ? "Confirm override" : "Confirm"}
        </button>
        {errorText && <span className="text-xs text-red-600">{errorText}</span>}
        {doneText && <span className="text-xs text-emerald-600">{doneText}</span>}
      </div>
    </div>
  );
}

export default DispositionButton;
