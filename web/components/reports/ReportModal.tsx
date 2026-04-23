"use client";

import { useEffect, useState } from "react";

interface AsanaFile {
  endpoint: string;
  body: unknown;
}

interface ReportModalProps {
  open: boolean;
  title: string;
  payload: unknown;
  onClose: () => void;
  // Optional — when provided, the modal POSTs the body to the endpoint
  // in parallel with fetching the report text and renders a
  // "Filed to Asana" status badge in the toolbar.
  asanaFile?: AsanaFile | null | undefined;
}

type ReportState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; body: string }
  | { status: "error"; message: string };

type AsanaState =
  | { status: "idle" }
  | { status: "posting" }
  | { status: "filed"; taskUrl?: string }
  | { status: "disabled" }
  | { status: "error"; message: string };

// Fetches the Hawkeye Sterling MLRO compliance report text for the
// supplied payload and shows it in a scrollable monospace modal. The
// caller owns the subject/result shape — it's opaque to this component.
export function ReportModal({
  open,
  title,
  payload,
  onClose,
  asanaFile,
}: ReportModalProps) {
  const [state, setState] = useState<ReportState>({ status: "idle" });
  const [asana, setAsana] = useState<AsanaState>({ status: "idle" });

  useEffect(() => {
    if (!open) {
      setState({ status: "idle" });
      setAsana({ status: "idle" });
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

  // Parallel Asana filing — only runs when the caller asked for it.
  useEffect(() => {
    if (!open || !asanaFile) {
      setAsana({ status: "idle" });
      return;
    }
    setAsana({ status: "posting" });
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(asanaFile.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(asanaFile.body),
          signal: ctl.signal,
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; taskUrl?: string; error?: string; detail?: string }
          | null;
        if (!res.ok || !json?.ok) {
          // Predictable misconfig — Asana token missing or upstream auth
          // failure. Surface as "disabled" (non-alarming) rather than a
          // red error the operator can't act on.
          const err = (json?.error ?? "") + " " + (json?.detail ?? "");
          if (/not_configured|asana_token|401|403|unauthorized|forbidden/i.test(err)) {
            setAsana({ status: "disabled" });
            return;
          }
          setAsana({
            status: "error",
            message: json?.error ?? `Asana filing failed (server ${res.status})`,
          });
          return;
        }
        setAsana({
          status: "filed",
          ...(json.taskUrl ? { taskUrl: json.taskUrl } : {}),
        });
      } catch (err) {
        if (ctl.signal.aborted) return;
        setAsana({
          status: "error",
          message: err instanceof Error ? err.message : "Asana filing failed",
        });
      }
    })();
    return () => ctl.abort();
  }, [open, asanaFile]);

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
          <div className="flex items-center gap-3">
            <div className="text-13 font-semibold text-ink-0">
              Compliance report · {title}
            </div>
            <AsanaBadge state={asana} />
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

function AsanaBadge({ state }: { state: AsanaState }) {
  if (state.status === "idle" || state.status === "disabled") return null;
  const base =
    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-10 font-semibold";
  if (state.status === "posting") {
    return (
      <span className={`${base} bg-bg-2 text-ink-2`} title="Filing to Asana…">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-pulse" />
        Filing…
      </span>
    );
  }
  if (state.status === "filed") {
    return state.taskUrl && /^https?:\/\//i.test(state.taskUrl) ? (
      <a
        href={state.taskUrl}
        target="_blank"
        rel="noreferrer"
        className={`${base} bg-green-dim text-green hover:opacity-80 no-underline`}
        title="Open Asana task"
      >
        ✓ Filed to Asana
      </a>
    ) : (
      <span className={`${base} bg-green-dim text-green`}>✓ Filed to Asana</span>
    );
  }
  // error — shown muted, not red, since Asana failure doesn't invalidate
  // the report the operator is reading.
  return (
    <span
      className={`${base} bg-amber-dim text-amber`}
      title={state.message}
    >
      ⚠ Asana filing failed
    </span>
  );
}
