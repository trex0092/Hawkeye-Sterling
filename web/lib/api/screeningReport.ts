import type {
  QuickScreenResult,
  QuickScreenSubject,
} from "./quickScreen.types";

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
  const res = await fetch("/api/screening-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    ...init,
  });
  try {
    return (await res.json()) as ScreeningReportResponse;
  } catch {
    return {
      ok: false,
      error: `non-JSON response (${res.status})`,
    };
  }
}
