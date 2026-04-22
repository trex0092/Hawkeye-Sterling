"use client";

import { useEffect, useState } from "react";
import { quickScreen, QuickScreenError } from "@/lib/api/quickScreen";
import { CANDIDATES } from "@/lib/data/candidates";
import type {
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";

export type QuickScreenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: QuickScreenResult }
  | { status: "error"; error: string };

function keyOf(subject: QuickScreenSubject | null): string {
  if (!subject) return "";
  return [subject.name, subject.jurisdiction ?? "", subject.entityType ?? ""].join("|");
}

export function useQuickScreen(subject: QuickScreenSubject | null): QuickScreenState {
  const [state, setState] = useState<QuickScreenState>({ status: "idle" });
  const key = keyOf(subject);

  useEffect(() => {
    if (!subject) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });

    quickScreen(
      { subject, candidates: CANDIDATES },
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setState({ status: "success", result });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof QuickScreenError
            ? err.message
            : err instanceof Error
              ? err.message
              : "screening failed";
        setState({ status: "error", error: message });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
