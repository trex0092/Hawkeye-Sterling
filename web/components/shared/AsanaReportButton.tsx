"use client";

import { useState } from "react";

type AsanaState =
  | { status: "idle" }
  | { status: "posting" }
  | { status: "sent"; taskUrl?: string }
  | { status: "disabled" }
  | { status: "error" };

export interface AsanaReportPayload {
  module: string;
  label: string;
  summary: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

interface Props {
  payload: AsanaReportPayload;
  disabled?: boolean;
}

const DISABLED_MARKERS = [
  "asana not configured",
  "asana_not_configured",
  "server 401",
  "server 403",
  "server 422",
  "server 503",
  "unauthorized",
  "forbidden",
  "asana rejected",
];

function isDisabled(msg: string): boolean {
  const lower = msg.toLowerCase();
  return DISABLED_MARKERS.some((m) => lower.includes(m));
}

export function AsanaReportButton({ payload, disabled = false }: Props) {
  const [state, setState] = useState<AsanaState>({ status: "idle" });

  const report = async () => {
    if (state.status !== "idle") return;
    setState({ status: "posting" });
    try {
      const res = await fetch("/api/module-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; taskUrl?: string; error?: string; detail?: string }
        | null;
      if (!res.ok || !json?.ok) {
        const msg = (json?.error ?? "") + " " + (json?.detail ?? "");
        if (isDisabled(msg)) {
          setState({ status: "disabled" });
          return;
        }
        setState({ status: "error" });
        return;
      }
      setState({ status: "sent", ...(json.taskUrl ? { taskUrl: json.taskUrl } : {}) });
    } catch {
      setState({ status: "disabled" });
    }
  };

  if (state.status === "disabled") return null;

  if (state.status === "sent") {
    const base = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-11 font-semibold bg-green-dim text-green border border-green/30";
    return state.taskUrl && /^https?:\/\//i.test(state.taskUrl) ? (
      <a
        href={state.taskUrl}
        target="_blank"
        rel="noreferrer"
        className={`${base} hover:opacity-80 no-underline`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green" />
        Reported to Asana · <span className="underline">view task</span>
      </a>
    ) : (
      <span className={base}>
        <span className="w-1.5 h-1.5 rounded-full bg-green" />
        Reported to Asana
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <button
        type="button"
        onClick={() => setState({ status: "idle" })}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-11 font-semibold bg-amber-dim text-amber border border-amber/30 hover:opacity-80"
        title="Asana report failed — click to retry"
      >
        ⚠ Report failed · retry
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={report}
      disabled={disabled || state.status === "posting"}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-11 font-semibold bg-bg-2 border border-hair-2 text-ink-1 hover:bg-bg-1 hover:text-ink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {state.status === "posting" ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-pulse" />
          Reporting…
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-ink-3" />
          Report to Asana
        </>
      )}
    </button>
  );
}
