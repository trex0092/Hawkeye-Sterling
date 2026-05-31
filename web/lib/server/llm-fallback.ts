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
//
// Groq fallback: if Anthropic returns a 529 (overloaded), 503, or
// rate-limit (429) error AND a `groqFallback` function is provided,
// we retry with Groq before falling back to the template. This avoids
// unnecessary degradation under Anthropic load spikes.

export interface FallbackResult<T> {
  ok: true;
  result: T;
  degraded: boolean;
  /** When degraded, this carries a human-readable reason. */
  degradedReason?: string;
  /** Source of truth: 'llm' = real Anthropic, 'groq' = Groq fallback, 'template' = deterministic. */
  source: "llm" | "groq" | "template";
}

/** Returns true for Anthropic errors that indicate temporary overload/capacity issues. */
function isRetryableAnthropicError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Anthropic SDK surfaces status codes in the error message
  return /\b(429|503|529|overload|rate.?limit|capacity|unavailable)\b/i.test(msg);
}

export async function withLlmFallback<T>(opts: {
  label: string;
  aiCall: () => Promise<T>;
  templateFallback: () => T;
  /** Optional Groq retry — called when Anthropic fails with a retryable error. */
  groqFallback?: () => Promise<T>;
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

  // Key present — race the AI call against the timeout. On retryable errors,
  // try Groq before giving up on templates.
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

    // Try Groq if the error is retryable and a groqFallback was provided.
    if (opts.groqFallback && isRetryableAnthropicError(err)) {
      console.warn(`[${opts.label}] Anthropic retryable error (${detail}) — trying Groq fallback.`);
      try {
        const groqResult = await Promise.race([
          opts.groqFallback(),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${opts.label} Groq exceeded ${timeoutMs}ms`)), timeoutMs),
          ),
        ]);
        console.info(`[${opts.label}] Groq fallback succeeded.`);
        return { ok: true, result: groqResult, degraded: true, degradedReason: `Groq fallback (Anthropic: ${detail})`, source: "groq" };
      } catch (groqErr) {
        const groqDetail = groqErr instanceof Error ? groqErr.message : String(groqErr);
        console.warn(`[${opts.label}] Groq fallback also failed (${groqDetail}) — falling back to template.`);
      }
    } else {
      console.warn(`[${opts.label}] LLM call failed (${detail}) — falling back to template.`);
    }

    return {
      ok: true,
      result: opts.templateFallback(),
      degraded: true,
      degradedReason: `LLM call failed: ${detail}`,
      source: "template",
    };
  }
}
