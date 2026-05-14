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

// Audit ENH-01: automatic prompt caching for long system prompts.
//
// Anthropic's cache_control: ephemeral marker saves 90% on input tokens
// for repeated prompts (5-minute TTL, but the cache is shared across all
// requests within the lifetime). 183 routes in this codebase hardcode
// long system prompts averaging ~1500 tokens; without cache_control every
// invocation pays full input cost.
//
// This helper auto-promotes a string system prompt to a 1-element array
// with cache_control marker IFF the prompt is long enough to be worth
// caching (Anthropic charges a 25% cache-write premium, so very short
// prompts come out negative).
const CACHE_MIN_CHARS = 1024; // ~256 tokens; cache write cost amortises at ~2 hits
function autoCacheSystem(
  system: string | SystemBlock[] | undefined,
): string | SystemBlock[] | undefined {
  if (typeof system !== "string") return system; // caller has explicit blocks; respect their cache_control choices
  if (system.length < CACHE_MIN_CHARS) return system; // too short to benefit
  return [
    {
      type: "text" as const,
      text: system,
      cache_control: { type: "ephemeral" },
    } as SystemBlock,
  ];
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

        // Redact all outbound text. system is also auto-cached when it's a
        // long string — saves 90% on input tokens for the 183 routes with
        // hardcoded multi-paragraph compliance-analyst prompts (audit ENH-01).
        const safe = {
          ...opts,
          system: autoCacheSystem(redactSystem(opts.system, map)),
          messages: ((opts.messages as Anthropic.Messages.MessageParam[]) ?? []).map((msg) => ({
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

      // ── Batches API ───────────────────────────────────────────────────────
      // The Anthropic Messages Batches API submits many requests in one
      // call and returns results asynchronously hours later. Synchronous
      // redact-then-rehydrate doesn't fit: the redaction map must outlive
      // the submission and survive cold starts so the caller can rehydrate
      // results when they're retrieved.
      //
      // Contract: `create()` redacts each request's system + content with a
      // fresh per-request RedactionMap, submits the redacted batch, and
      // returns the Anthropic response augmented with `_redactionMaps`
      // (custom_id → map). The caller is responsible for persisting the
      // maps under the batch ID and applying `rehydrate()` from
      // `@/lib/server/redact` to result text when retrieving results.
      //
      // `retrieve()` and `results()` are simple passthroughs — they don't
      // own the redaction maps. Callers that retrieve raw result text must
      // rehydrate it before exposing it anywhere a human reads.
      batches: {
        create: async (
          opts: { requests: Array<{ custom_id: string; params: any }> },
          requestOptions?: any,
        ): Promise<any & { _redactionMaps: Record<string, RedactionMap> }> => {
          const maps: Record<string, RedactionMap> = {};
          const safeRequests = opts.requests.map((r) => {
            const map: RedactionMap = {};
            maps[r.custom_id] = map;
            return {
              custom_id: r.custom_id,
              params: {
                ...r.params,
                system: redactSystem(r.params.system, map),
                messages: ((r.params.messages as Anthropic.Messages.MessageParam[]) ?? []).map((msg) => ({
                  ...msg,
                  content: redactContent(msg.content as string | ContentBlock[], map),
                })),
              },
            };
          });

          const innerBatches = (inner.messages as any).batches;
          if (!innerBatches?.create) {
            throw new Error("Anthropic SDK does not expose messages.batches.create on this client. Upgrade @anthropic-ai/sdk.");
          }
          const response = await innerBatches.create({ requests: safeRequests }, requestOptions);
          return { ...response, _redactionMaps: maps };
        },
        retrieve: async (batchId: string, requestOptions?: any): Promise<any> => {
          const innerBatches = (inner.messages as any).batches;
          return innerBatches.retrieve(batchId, requestOptions);
        },
        results: async (batchId: string, requestOptions?: any): Promise<any> => {
          const innerBatches = (inner.messages as any).batches;
          return innerBatches.results(batchId, requestOptions);
        },
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
