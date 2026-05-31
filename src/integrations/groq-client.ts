// Hawkeye Sterling — Groq inference client (cost fallback for Anthropic).
//
// Groq exposes an OpenAI-compatible REST API at api.groq.com/openai/v1.
// This module provides a thin wrapper that translates Anthropic-style
// message structures to the OpenAI format so withLlmFallback can retry
// on Anthropic 503 / overload errors without changing the calling code.
//
// COMPLIANCE NOTE: Groq is ONLY used for non-regulator-facing paths
// (Haiku + Sonnet tier tasks). Opus-equivalent tasks (regulator-facing,
// SAR/STR narratives, formal MLRO sign-off) must NOT fall back to Groq —
// they should fail closed and surface an error to the MLRO.
//
// PRIVACY: All PII must be redacted before calling this function, just
// as it is before calling Anthropic. The caller is responsible for this.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TIMEOUT_MS = 30_000;

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqCompletionRequest {
  model: string;
  messages: GroqMessage[];
  max_tokens?: number;
  temperature?: number;
}

export interface GroqCompletionResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Call the Groq inference API with an OpenAI-compatible request.
 * Returns the first choice's content text, or throws on error.
 *
 * @param apiKey  - GROQ_API_KEY from environment
 * @param request - Completion request (model + messages)
 * @param timeoutMs - Optional timeout (default 30s)
 */
export async function groqComplete(
  apiKey: string,
  request: GroqCompletionRequest,
  timeoutMs = GROQ_TIMEOUT_MS,
): Promise<string> {
  if (!apiKey) {
    throw new Error("[groq-client] GROQ_API_KEY is not set");
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[groq-client] HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as GroqCompletionResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error("[groq-client] empty response from Groq API");
  }
  return content;
}

/**
 * Returns true when Groq fallback is available (GROQ_API_KEY is set).
 */
export function isGroqAvailable(): boolean {
  return !!process.env["GROQ_API_KEY"];
}
