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
        // Transient infra failure — retry. Upstream detail (stack
        // traces, module-not-found errors, …) is logged for ops but
        // never surfaced to the operator — the MLRO only sees a clean
        // "Screening temporarily unavailable" when retries run out.
        const opsDetail =
          envelopeDetail(payload) ??
          envelopeError(payload) ??
          (rawText ? rawText.slice(0, 300) : undefined);
        if (opsDetail) {
          console.warn("quick-screen 5xx", res.status, opsDetail);
        }
        lastError = new QuickScreenError("Screening temporarily unavailable");
      } else if (res.status < 200 || res.status > 299) {
        // 4xx — the caller sent something bad. The server's own
        // error field is safe to show (we write it). Never include
        // `detail` (which may be upstream chatter).
        throw new QuickScreenError(
          envelopeError(payload) ?? "Screening request rejected",
        );
      } else if (!payload || !("ok" in payload) || !payload.ok) {
        // 2xx but envelope is missing or negative — not retry-able.
        throw new QuickScreenError(
          envelopeError(payload) ?? "Screening returned no result",
        );
      } else {
        return payload;
      }
    } catch (err) {
      if (externalSignal?.aborted) throw err;
      if (err instanceof QuickScreenError) {
        if (!lastError) throw err;
      } else if (err instanceof Error && err.name === "AbortError") {
        lastError = new QuickScreenError("Screening request timed out");
      } else {
        // Network-level failure. Log the raw error for ops; show the
        // operator a neutral message so an MLRO case file never
        // carries a transport-layer stack trace.
        console.warn("quick-screen fetch failed", err);
        lastError = new QuickScreenError("Screening temporarily unavailable");
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
