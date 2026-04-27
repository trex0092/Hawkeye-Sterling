"use client";

import type { AutoReportState } from "@/lib/hooks/useAutoReport";

// Tiny green-pill indicator that surfaces the Asana auto-report
// state on a case-detail header. Identical to the inline badge that
// has lived in SubjectDetailPanel since the screening module's
// first cut, lifted here so every module's detail panel can render
// the same persistent indicator next to the case ID / metadata.
//
// Pass the state from `useAutoReport()` directly:
//
//   const reportState = useAutoReport({ subjectId, qsSubject, result, ... });
//   return <AsanaStatus state={reportState} />;
//
// Renders nothing in the "idle" / "disabled" states so the badge only
// appears when there is something to show — posting, sent (with the
// view-task link when Asana returned a permalink), or failed.

export function AsanaStatus({
  state,
  className,
}: {
  state: AutoReportState;
  className?: string;
}) {
  if (state.status === "idle" || state.status === "disabled") return null;
  const base =
    "inline-flex items-center gap-1.5 mt-2 text-10.5 font-medium rounded px-2 py-0.5";
  const wrapper = className ?? "";

  if (state.status === "posting") {
    return (
      <span className={`${base} bg-bg-2 text-ink-2 ${wrapper}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-pulse" />
        Reporting to Asana…
      </span>
    );
  }
  if (state.status === "sent") {
    return (
      <span className={`${base} bg-green-dim text-green ${wrapper}`}>
        <span>✓</span>
        Reported to Asana
        {state.taskUrl && /^https?:\/\//i.test(state.taskUrl) && (
          <a
            href={state.taskUrl}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-green/80 ml-1"
          >
            view task
          </a>
        )}
      </span>
    );
  }
  return (
    <span
      className={`${base} bg-red-dim text-red ${wrapper}`}
      title={state.error}
    >
      <span>!</span>
      Asana report failed
    </span>
  );
}
