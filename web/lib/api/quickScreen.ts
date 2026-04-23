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

// Client contract (matches the reference CLI spec):
//   - retry 5xx up to 3 times on a 750ms flat delay
//   - 15s per-request timeout
//   - Accept + User-Agent headers (User-Agent is a forbidden header in
//     browser fetch — silently dropped — but kept for parity with the
//     server-side variant of this call)
//   - non-JSON response body is caught and surfaced with the raw snippet
//   - error copy is colon-free so it reads cleanly in the MLRO case file
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 750;
const REQUEST_TIMEOUT_MS = 15_000;

interface ParsedBody {
  payload: QuickScreenResponse | null;
  rawText: string;
}

async function readBodySafely(res: Response): Promise<ParsedBody> {
  const rawText = await res.text().catch(() => "");
  if (!rawText) return { payload: null, rawText: "" };
  try {
    return {
      payload: JSON.parse(rawText) as QuickScreenResponse,
      rawText,
    };
  } catch {
    return { payload: null, rawText };
  }
}

function envelopeError(payload: QuickScreenResponse | null): string | undefined {
  if (!payload || !("ok" in payload)) return undefined;
  if (payload.ok) return undefined;
  return payload.error;
}

function envelopeDetail(payload: QuickScreenResponse | null): string | undefined {
  if (!payload || !("ok" in payload)) return undefined;
  if (payload.ok) return undefined;
  return payload.detail;
}

export async function quickScreen(
  input: QuickScreenInput,
  init: RequestInit = {},
): Promise<QuickScreenResult> {
  const externalSignal = init.signal ?? null;
  let lastError: QuickScreenError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const timeoutCtl = new AbortController();
    const timer = setTimeout(() => timeoutCtl.abort(), REQUEST_TIMEOUT_MS);
    const onExternalAbort = (): void => timeoutCtl.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timer);
        throw new QuickScreenError("aborted");
      }
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      const res = await fetch("/api/quick-screen", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "user-agent": "hawkeye-screening-client/1.0",
        },
        body: JSON.stringify(input),
        ...init,
        signal: timeoutCtl.signal,
      });

      const { payload, rawText } = await readBodySafely(res);

      if (res.status >= 500 && res.status <= 599) {
        // Transient infra failure — retry.
        const detail =
          envelopeDetail(payload) ??
          envelopeError(payload) ??
          (rawText ? rawText.slice(0, 200) : undefined);
        lastError = new QuickScreenError(
          `Screening failed server ${res.status}`,
          detail,
        );
      } else if (res.status < 200 || res.status > 299) {
        // Deterministic non-2xx — surface immediately with body context.
        throw new QuickScreenError(
          envelopeError(payload) ?? `Screening failed server ${res.status}`,
          envelopeDetail(payload) ??
            (rawText ? rawText.slice(0, 200) : undefined),
        );
      } else if (!payload || !("ok" in payload) || !payload.ok) {
        // 2xx but envelope is missing or negative — not retry-able.
        throw new QuickScreenError(
          envelopeError(payload) ?? "Screening failed malformed response",
          envelopeDetail(payload),
        );
      } else {
        return payload;
      }
    } catch (err) {
      if (externalSignal?.aborted) throw err;
      if (err instanceof QuickScreenError) {
        if (!lastError) throw err;
      } else if (err instanceof Error && err.name === "AbortError") {
        lastError = new QuickScreenError("Screening failed request timed out");
      } else {
        lastError = new QuickScreenError(
          err instanceof Error ? err.message : "Screening failed",
        );
      }
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
    }

    if (attempt >= MAX_RETRIES) break;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    if (externalSignal?.aborted) throw new QuickScreenError("aborted");
  }

  throw lastError ?? new QuickScreenError("Screening failed");
}
