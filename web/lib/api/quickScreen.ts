import type {
  QuickScreenCandidate,
  QuickScreenOptions,
  QuickScreenResponse,
  QuickScreenResult,
  QuickScreenSubject,
} from "./quickScreen.types";

export class QuickScreenError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = "QuickScreenError";
  }
}

interface QuickScreenInput {
  subject: QuickScreenSubject;
  candidates: QuickScreenCandidate[];
  options?: QuickScreenOptions;
}

export async function quickScreen(
  input: QuickScreenInput,
  init: RequestInit = {},
): Promise<QuickScreenResult> {
  const res = await fetch("/api/quick-screen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    ...init,
  });

  let payload: QuickScreenResponse;
  try {
    payload = (await res.json()) as QuickScreenResponse;
  } catch {
    throw new QuickScreenError(`quick-screen returned non-JSON (${res.status})`);
  }

  if (!payload.ok) {
    throw new QuickScreenError(payload.error, payload.detail);
  }
  return payload;
}
