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

export class AnthropicGuard {
  private inner: Anthropic;

  constructor(apiKey: string) {
    this.inner = new Anthropic({ apiKey });
  }

  /** Proxy `messages` namespace with PII redaction on the way in, rehydration on the way out. */
  get messages() {
    const inner = this.inner;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async (opts: any, requestOptions?: any): Promise<Anthropic.Message> => {
        const map: RedactionMap = {};

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rehydratedContent = (response.content as any[]).map((block: any) => {
          if (block.type === "text" && typeof block.text === "string") {
            return { ...block, text: rehydrate(block.text, map) };
          }
          return block;
        });

        return { ...response, content: rehydratedContent } as Anthropic.Message;
      },
    };
  }
}

/**
 * Returns a PII-guarded Anthropic client with the same interface as `new Anthropic({ apiKey })`.
 * Swap every `new Anthropic({ apiKey })` call for `getAnthropicClient(apiKey)`.
 */
export function getAnthropicClient(apiKey: string): AnthropicGuard {
  return new AnthropicGuard(apiKey);
}
