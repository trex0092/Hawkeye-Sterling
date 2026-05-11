/**
 * PII-guarded Anthropic client.
 *
 * Drop-in replacement for `new Anthropic({ apiKey })`.
 * All text fields in messages/system are redacted before leaving this process;
 * all text blocks in the response are rehydrated before returning to the caller.
 *
 * Usage:
 *   import { getAnthropicClient } from "@/lib/server/llm";
 *   const client = getAnthropicClient(apiKey);
 *   const response = await client.messages.create({ ... }); // unchanged API
 */

import Anthropic from "@anthropic-ai/sdk";
import { redact, rehydrate, type RedactionMap } from "./redact";
import { recordCall } from "./llm-telemetry";

// ── Types (forward SDK types so callers don't need to import both) ─────────────

export type { RedactionMap };
export type AnthropicMessage = Anthropic.Message;

// ── Internal helpers ──────────────────────────────────────────────────────────

function redactStr(s: string, map: RedactionMap): string {
  return redact(s, map);
}

type ContentBlock = Anthropic.Messages.ContentBlockParam;
type SystemBlock = Anthropic.Messages.TextBlockParam & { cache_control?: unknown };

function redactContent(
  content: string | ContentBlock[],
  map: RedactionMap
): string | ContentBlock[] {
  if (typeof content === "string") {
    return redactStr(content, map);
  }
  return content.map((block) => {
    if (block.type === "text") {
      return { ...block, text: redactStr(block.text, map) };
    }
    return block;
  });
}

function redactSystem(
  system: string | SystemBlock[] | undefined,
  map: RedactionMap
): string | SystemBlock[] | undefined {
  if (!system) return system;
  if (typeof system === "string") return redactStr(system, map);
  return system.map((block) => {
    if (block.type === "text") {
      return { ...block, text: redactStr(block.text, map) };
    }
    return block;
  });
}

// ── Guarded client ────────────────────────────────────────────────────────────

// Default for routes on Netlify's standard Lambda budget (~26 s ceiling on
// Pro). Routes that opt into `export const maxDuration = 60` can pass a
// larger `timeoutMs` to getAnthropicClient and get up to ~55 s of budget.
const DEFAULT_ANTHROPIC_TIMEOUT_MS = 22_000;

export class AnthropicGuard {
  private inner: Anthropic;
  private route: string;

  constructor(apiKey: string, timeoutMs: number = DEFAULT_ANTHROPIC_TIMEOUT_MS, route = "unknown") {
    this.inner = new Anthropic({
      apiKey,
      timeout: timeoutMs,
      // No automatic retries: a slow first attempt + a retry can blow even
      // a 60 s Lambda budget. Routes that need retries should implement
      // their own logic with explicit per-call timeouts.
      maxRetries: 0,
    });
    this.route = route;
  }

  /** Proxy `messages` namespace with PII redaction on the way in, rehydration on the way out. */
  get messages() {
    const inner = this.inner;
    const route = this.route;
    return {
      create: async (opts: any, requestOptions?: any): Promise<Anthropic.Message> => {
        const map: RedactionMap = {};
        const t0 = Date.now();

        // Redact all outbound text
        const safe = {
          ...opts,
          system: redactSystem(opts.system, map),
          messages: (opts.messages as Anthropic.Messages.MessageParam[]).map((msg) => ({
            ...msg,
            content: redactContent(
              msg.content as string | ContentBlock[],
              map
            ),
          })),
        };

        const response = await inner.messages.create(safe, requestOptions);

        // Rehydrate response text blocks
        const rehydratedContent = (response.content as any[]).map((block: any) => {
          if (block.type === "text" && typeof block.text === "string") {
            return { ...block, text: rehydrate(block.text, map) };
          }
          return block;
        });

        // Fire-and-forget telemetry
        const u = response.usage as any;
        void recordCall({
          route,
          model: response.model,
          inputTokens: u?.input_tokens ?? 0,
          outputTokens: u?.output_tokens ?? 0,
          cacheReadTokens: u?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
          latencyMs: Date.now() - t0,
        });

        return { ...response, content: rehydratedContent } as Anthropic.Message;
      },
    };
  }
}

/**
 * Returns a PII-guarded Anthropic client with the same interface as `new Anthropic({ apiKey })`.
 * Swap every `new Anthropic({ apiKey })` call for `getAnthropicClient(apiKey)`.
 *
 * @param apiKey   - Anthropic API key.
 * @param timeoutMs - Optional per-client request timeout. Defaults to 22 s for
 *                   routes on the standard Netlify Lambda budget. Routes that
 *                   set `export const maxDuration = 60` should pass ~55_000.
 */
export function getAnthropicClient(apiKey: string, timeoutMs?: number, route?: string): AnthropicGuard {
  return new AnthropicGuard(apiKey, timeoutMs, route);
}
