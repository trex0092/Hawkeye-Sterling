// Shared client-side fetch wrapper used by every /api/* caller in the
// web app. Encodes the reference spec the compliance team standardised on
// after the repeated Netlify cold-start 502s on the screening panel:
//
//   - retry 5xx up to 3 times on a 750ms flat delay
//   - 15s per-request timeout via AbortController chained with the caller
//   - accept: application/json + user-agent: hawkeye-screening-client/1.0
//     (the UA is a forbidden header in the browser fetch spec and is
//     silently dropped there — we keep it so server-side callers, tests,
//     and any future Node/SSR consumer see the same identifier)
//   - response body is read with res.text() then JSON.parse inside a
//     try/catch so a non-JSON 502 HTML page does not crash the caller
//   - every surfaced error message is colon-free so it reads cleanly
//     when it lands in a regulator-facing MLRO case file

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 750;
const REQUEST_TIMEOUT_MS = 15_000;

export interface FetchJsonResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  detail?: string;
}

export interface FetchJsonOptions extends Omit<RequestInit, "signal"> {
  signal?: AbortSignal;
  /** Override the number of retries for the 5xx branch. Default 3. */
  retries?: number;
  /** Override the flat retry delay. Default 750ms. */
  retryDelayMs?: number;
  /** Override the per-attempt timeout. Default 15s. */
  timeoutMs?: number;
  /** Prefix used in error messages — e.g. "Filing failed" / "Screening failed". */
  label?: string;
}

function clean(msg: string): string {
  // Colons are stripped per the compliance-side spec. Collapse the
  // resulting double-spaces so "Filing failed  server 502" doesn't slip
  // through. Trim the trailing whitespace for the same reason.
  return msg.replace(/:/g, "").replace(/\s+/g, " ").trim();
}

function buildError(label: string, tail: string, detail?: string): string {
  return clean(detail ? `${label} ${tail} ${detail}` : `${label} ${tail}`);
}

export async function fetchJson<T = unknown>(
  input: string,
  opts: FetchJsonOptions = {},
): Promise<FetchJsonResult<T>> {
  const {
    signal: externalSignal,
    retries = MAX_RETRIES,
    retryDelayMs = RETRY_DELAY_MS,
    timeoutMs = REQUEST_TIMEOUT_MS,
    label = "Request failed",
    headers: callerHeaders,
    ...rest
  } = opts;

  let lastResult: FetchJsonResult<T> = {
    ok: false,
    status: 0,
    error: clean(label),
  };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutCtl = new AbortController();
    const timer = setTimeout(() => timeoutCtl.abort(), timeoutMs);
    const onExternalAbort = (): void => timeoutCtl.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timer);
        return { ok: false, status: 0, error: clean(`${label} aborted`) };
      }
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      // Auto-attach the portal admin token so every internal route
      // (/api/ongoing, /api/analytics, /api/sar-report, etc.) receives
      // auth without each call-site managing headers. The value is inlined
      // at Next.js build time from NEXT_PUBLIC_ADMIN_TOKEN. Caller-supplied
      // headers always win and can override this default.
      const portalToken =
        typeof process !== "undefined"
          ? (process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "")
          : "";

      const res = await fetch(input, {
        ...rest,
        headers: {
          accept: "application/json",
          "user-agent": "hawkeye-screening-client/1.0",
          ...(portalToken ? { authorization: `Bearer ${portalToken}` } : {}),
          ...(callerHeaders ?? {}),
        },
        signal: timeoutCtl.signal,
      });

      const raw = await res.text().catch(() => "");
      let parsed: unknown = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          /* non-JSON body — handled below via raw snippet */
        }
      }
      const envelope =
        parsed && typeof parsed === "object"
          ? (parsed as { ok?: boolean; error?: string; detail?: string })
          : null;

      if (res.status >= 500 && res.status <= 599) {
        lastResult = {
          ok: false,
          status: res.status,
          error: buildError(label, `server ${res.status}`),
          detail: envelope?.detail ?? envelope?.error ?? raw.slice(0, 200),
        };
      } else if (res.status < 200 || res.status > 299) {
        return {
          ok: false,
          status: res.status,
          error: buildError(label, `server ${res.status}`, envelope?.error),
          detail: envelope?.detail ?? raw.slice(0, 200),
        };
      } else if (envelope && envelope.ok === false) {
        const out: FetchJsonResult<T> = {
          ok: false,
          status: res.status,
          error: clean(envelope.error ?? `${label} malformed response`),
        };
        if (envelope.detail !== undefined) out.detail = envelope.detail;
        return out;
      } else {
        return { ok: true, status: res.status, data: parsed as T };
      }
    } catch (err) {
      if (externalSignal?.aborted) {
        return { ok: false, status: 0, error: clean(`${label} aborted`) };
      }
      if (err instanceof Error && err.name === "AbortError") {
        lastResult = {
          ok: false,
          status: 0,
          error: clean(`${label} request timed out`),
        };
      } else {
        lastResult = {
          ok: false,
          status: 0,
          error: clean(err instanceof Error ? err.message : label),
        };
      }
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    }

    if (attempt >= retries) break;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    if (externalSignal?.aborted) {
      return { ok: false, status: 0, error: clean(`${label} aborted`) };
    }
  }

  return lastResult;
}
