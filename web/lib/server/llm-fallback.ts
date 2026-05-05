// Hawkeye Sterling — graceful AI-endpoint fallback.
//
// Every AI route on the platform should go through this helper. When
// ANTHROPIC_API_KEY is set the request runs against Claude; when it's
// missing we return a deterministic regulator-grade template response
// with `degraded: true` instead of 503-ing the route. This stops the
// "X temporarily unavailable - please retry" UI errors flaring across
// the platform every time a deploy lands without the key.
//
// Each caller supplies:
//   - a function `aiCall()` that performs the real Anthropic request
//   - a function `templateFallback()` that builds a deterministic
//     reply from the same input
//   - a label for logs

export interface FallbackResult<T> {
  ok: true;
  result: T;
  degraded: boolean;
  /** When degraded, this carries a human-readable reason. */
  degradedReason?: string;
  /** Source of truth: 'llm' = real Anthropic, 'template' = deterministic. */
  source: "llm" | "template";
}

export async function withLlmFallback<T>(opts: {
  label: string;
  aiCall: () => Promise<T>;
  templateFallback: () => T;
  /** Timeout in ms — defaults to 45s. */
  timeoutMs?: number;
}): Promise<FallbackResult<T>> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  const timeoutMs = opts.timeoutMs ?? 45_000;

  // No key? Skip the LLM, return the template immediately.
  if (!apiKey) {
    console.warn(`[${opts.label}] ANTHROPIC_API_KEY missing — using deterministic template fallback.`);
    return {
      ok: true,
      result: opts.templateFallback(),
      degraded: true,
      degradedReason: "ANTHROPIC_API_KEY not configured — deterministic template used.",
      source: "template",
    };
  }

  // Key present — race the AI call against the timeout. On any failure,
  // fall back to the template rather than 503.
  try {
    const result = await Promise.race([
      opts.aiCall(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${opts.label} exceeded ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    return { ok: true, result, degraded: false, source: "llm" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[${opts.label}] LLM call failed (${detail}) — falling back to template.`);
    return {
      ok: true,
      result: opts.templateFallback(),
      degraded: true,
      degradedReason: `LLM call failed: ${detail}`,
      source: "template",
    };
  }
}
