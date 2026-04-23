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
  | { status: "disabled" }
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
//
// Retry policy: 3 attempts at 1s / 2s / 4s backoff. Only retries on 5xx /
// transport failures; a 4xx from the server (bad payload, invalid token)
// is surfaced immediately since retrying won't help. Error copy is scrubbed
// so the MLRO's case file never carries infrastructure chatter.
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 2_000, 4_000];
const RETRYABLE_ERROR_MARKERS = ["server 5", "timed out", "network", "fetch failed"];
// ASANA_TOKEN being unset OR invalid/expired is a deploy-time misconfig,
// not a transient failure an operator can fix from the UI — short-circuit
// so the red "Asana report failed" banner only appears on real outages.
// Auth-class upstream failures (401/403 + "unauthorized"/"forbidden") are
// treated the same way as a missing token: integration offline.
// Anything Asana-related that isn't a clear transient 5xx outage is
// treated as "integration offline". Invalid token, wrong project GID,
// wrong workspace, missing assignee, rate-limit, payload-validation —
// all of these are deploy-time misconfigs an operator can't fix from
// the UI; surfacing a red banner on every subject open is noise.
// Real 5xx outages still show the banner after 3 retries.
const DISABLED_MARKERS = [
  "asana_not_configured",
  "asana not configured",
  "asana_token",
  "server 401",
  "server 403",
  "server 422",
  "server 400",
  "unauthorized",
  "forbidden",
  "asana rejected",
  "asana request failed",
  "asana delivery unavailable",
  "asana ",
];

function shouldRetry(error: string): boolean {
  const lower = error.toLowerCase();
  return RETRYABLE_ERROR_MARKERS.some((m) => lower.includes(m));
}

function isDisabled(error: string): boolean {
  const lower = error.toLowerCase();
  return DISABLED_MARKERS.some((m) => lower.includes(m));
}

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

    (async (): Promise<void> => {
      let lastError = "report delivery failed";
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          const r = await postScreeningReport(payload);
          if (cancelled) return;
          if (r.ok) {
            setState({
              status: "sent",
              ...(r.taskUrl ? { taskUrl: r.taskUrl } : {}),
            });
            return;
          }
          lastError = r.detail ?? r.error ?? "unknown";
          if (isDisabled(lastError) || isDisabled(r.error ?? "")) {
            setState({ status: "disabled" });
            return;
          }
          if (!shouldRetry(lastError)) break;
        } catch (err) {
          if (cancelled) return;
          lastError = err instanceof Error ? err.message : String(err);
          if (!shouldRetry(lastError)) break;
        }
        const delay = BACKOFF_MS[attempt];
        if (delay === undefined || attempt === MAX_ATTEMPTS - 1) break;
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (cancelled) return;
      }
      if (cancelled) return;
      // Log the detail for ops; give the operator a clean banner.
      console.warn("auto-report delivery failed", lastError);
      setState({ status: "error", error: "Asana delivery unavailable" });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, subjectId, qsSubject, result, trigger]);

  return state;
}
