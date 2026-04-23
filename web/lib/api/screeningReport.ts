import type {
  QuickScreenResult,
  QuickScreenSubject,
} from "./quickScreen.types";
import { fetchJson } from "./fetchWithRetry";

export interface ScreeningReportPayload {
  subject: QuickScreenSubject & {
    id: string;
    group?: string;
    caseId?: string;
    ongoingScreening?: boolean;
  };
  result: QuickScreenResult;
  trigger: "screen" | "ongoing" | "save";
}

export interface ScreeningReportResponse {
  ok: boolean;
  taskGid?: string;
  taskUrl?: string;
  error?: string;
  detail?: string;
}

export async function postScreeningReport(
  payload: ScreeningReportPayload,
  init: RequestInit = {},
): Promise<ScreeningReportResponse> {
  const res = await fetchJson<ScreeningReportResponse>("/api/screening-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    label: "Screening report failed",
    ...(init.signal ? { signal: init.signal } : {}),
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.error ?? `Screening report failed`,
      ...(res.detail ? { detail: res.detail } : {}),
    };
  }
  return res.data ?? { ok: false, error: "Screening report failed empty body" };
}
