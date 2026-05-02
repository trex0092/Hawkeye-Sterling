/**
 * Thin wrapper around the Anthropic Messages API.
 *
 * Centralises key-presence check and maps failure modes to distinct error
 * codes so callers can show the user a meaningful message rather than the
 * generic "API key not configured" text for every failure type.
 *
 * PII redaction (UAE PDPL Art.22 / GDPR Art.5(1)(c)) is applied at this
 * chokepoint: outbound text is scrubbed before hitting the API; the response
 * is rehydrated before being returned to the caller.
 */

import { redact, rehydrate } from "./redact";

export type AnthropicResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no_key" | "api_error" | "parse_error"; status?: number };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
  messages: AnthropicMessage[];
}

export async function callAnthropic(opts: AnthropicOptions): Promise<AnthropicResult> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return { ok: false, reason: "no_key" };

  // Redact PII from outbound payload
  const piiMap: Record<string, string> = {};
  const safeSystem = opts.system ? redact(opts.system, piiMap) : undefined;
  const safeMessages = opts.messages.map((m) => ({
    ...m,
    content: redact(m.content, piiMap),
  }));

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model ?? "claude-haiku-4-5-20251001",
        max_tokens: opts.maxTokens ?? 800,
        ...(safeSystem ? { system: safeSystem } : {}),
        messages: safeMessages,
      }),
    });
  } catch {
    return { ok: false, reason: "api_error" };
  }

  if (!res.ok) return { ok: false, reason: "api_error", status: res.status };

  try {
    const data = (await res.json()) as { content?: { type: string; text: string }[] };
    const raw = data?.content?.[0]?.text ?? "";
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    // Rehydrate PII tokens back into the response
    const text = rehydrate(stripped, piiMap);
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "parse_error" };
  }
}

/** Human-readable fallback narrative for a given failure reason. */
export function aiFallbackText(reason: "no_key" | "api_error" | "parse_error"): string {
  switch (reason) {
    case "no_key":      return "AI analysis unavailable — ANTHROPIC_API_KEY not configured.";
    case "api_error":   return "AI analysis unavailable — API call failed (check key validity and quota).";
    case "parse_error": return "AI analysis unavailable — response parse error.";
    default:            return "AI analysis unavailable.";
  }
}
