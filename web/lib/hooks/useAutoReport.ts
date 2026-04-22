"use client";

import { useEffect, useRef, useState } from "react";
import {
  postScreeningReport,
  type ScreeningReportPayload,
} from "@/lib/api/screeningReport";
import type { QuickScreenResult, QuickScreenSubject } from "@/lib/api/quickScreen.types";

export type AutoReportState =
  | { status: "idle" }
  | { status: "posting" }
  | { status: "sent"; taskUrl?: string }
  | { status: "error"; error: string };

interface Args {
  subjectId: string;
  qsSubject: QuickScreenSubject | null;
  result: QuickScreenResult | null;
  trigger?: "screen" | "ongoing" | "save";
  enabled: boolean;
}

// Posts a screening report to Asana the first time a subject's brain result
// lands. Deduped per subjectId (so switching away and back doesn't re-fire).
export function useAutoReport({
  subjectId,
  qsSubject,
  result,
  trigger = "screen",
  enabled,
}: Args): AutoReportState {
  const [state, setState] = useState<AutoReportState>({ status: "idle" });
  const postedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    if (!qsSubject || !result) return;
    if (postedRef.current.has(subjectId)) return;
    postedRef.current.add(subjectId);
    setState({ status: "posting" });
    const payload: ScreeningReportPayload = {
      subject: { ...qsSubject, id: subjectId },
      result,
      trigger,
    };
    let cancelled = false;
    postScreeningReport(payload)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setState({ status: "sent", ...(r.taskUrl ? { taskUrl: r.taskUrl } : {}) });
        } else {
          setState({ status: "error", error: r.detail ?? r.error ?? "unknown" });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, subjectId, qsSubject, result, trigger]);

  return state;
}
