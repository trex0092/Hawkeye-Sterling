"use client";

import { useEffect, useState } from "react";

interface ReportModalProps {
  open: boolean;
  title: string;
  payload: unknown;
  onClose: () => void;
}

// Fetches the Hawkeye Sterling MLRO compliance report text for the
// supplied payload and shows it in a scrollable monospace modal. The
// caller owns the subject/result shape — it's opaque to this component.
export function ReportModal({ open, title, payload, onClose }: ReportModalProps) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; body: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    if (!open) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/compliance-report", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/plain, application/json",
          },
          body: JSON.stringify(payload),
          signal: ctl.signal,
        });
        if (!res.ok) {
          setState({
            status: "error",
            message: `Report generation failed (server ${res.status})`,
          });
          return;
        }
        const text = await res.text();
        setState({ status: "ready", body: text });
      } catch (err) {
        if (ctl.signal.aborted) return;
        setState({
          status: "error",
          message:
            err instanceof Error ? err.message : "Report generation failed",
        });
      }
    })();
    return () => ctl.abort();
  }, [open, payload]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDownload = () => {
    if (state.status !== "ready") return;
    const blob = new Blob([state.body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hawkeye-report-${title.replace(/[^A-Za-z0-9._-]/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Compliance report — ${title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/70 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[960px] max-h-[90vh] bg-white rounded-xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-hair-2">
          <div className="text-13 font-semibold text-ink-0">
            Compliance report · {title}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={state.status !== "ready"}
              className="px-3 py-1.5 text-11 font-medium rounded border border-hair-2 bg-white text-ink-0 hover:bg-bg-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Download .txt
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close report"
              className="w-8 h-8 rounded flex items-center justify-center text-ink-2 hover:bg-bg-1"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5 bg-bg-0">
          {state.status === "loading" && (
            <div className="text-12 text-ink-2">Generating report…</div>
          )}
          {state.status === "error" && (
            <div className="text-12 text-red bg-red-dim rounded px-3 py-2">
              {state.message}
            </div>
          )}
          {state.status === "ready" && (
            <pre className="font-mono text-11 leading-snug text-ink-0 whitespace-pre-wrap break-words">
              {state.body}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
