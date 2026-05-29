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
import { createHash } from "node:crypto";
import { redact, rehydrate, type RedactionMap } from "./redact";
import { recordCall } from "./llm-telemetry";
import { startSpan, SpanStatus } from "./tracer";
import { incrementCounter } from "./metrics-store";

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
const CACHE_MIN_CHARS = 256; // ~64 tokens; lower threshold caches more prompts, reducing TTFB on repeat calls
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

// Hard SLA: all LLM calls must return (or time out to fallback) within 5s.
// Timeout is set to 4_500ms leaving 500ms for HTTP overhead and JSON parsing.
const DEFAULT_ANTHROPIC_TIMEOUT_MS = 4_500;

type InnerBatchesShape = {
  create: (..._args: unknown[]) => Promise<Anthropic.Messages.MessageBatch>;
  retrieve: (_id: string, _opts?: Anthropic.RequestOptions) => Promise<Anthropic.Messages.MessageBatch>;
  results: (_id: string, _opts?: Anthropic.RequestOptions) => Promise<AsyncIterable<Anthropic.Messages.MessageBatchIndividualResponse>>;
};

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

  /** Pass-through to the SDK beta namespace (managed agents, sessions, etc.).
   *  Input must be sanitized by the caller before reaching this surface. */
  get beta() {
    return this.inner.beta;
  }

  /** Proxy `messages` namespace with PII redaction on the way in, rehydration on the way out. */
  get messages() {
    const inner = this.inner;
    const route = this.route;
    return {
      create: async (opts: Anthropic.Messages.MessageCreateParamsNonStreaming, requestOptions?: Anthropic.RequestOptions): Promise<Anthropic.Message> => {
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

        const span = startSpan('llm.messages.create', {
          'llm.model': opts.model,
          'llm.route': route,
          'llm.max_tokens': opts.max_tokens,
        });
        let response: Anthropic.Message;
        try {
          response = await inner.messages.create(safe, requestOptions);
        } catch (err) {
          span.setStatus({ code: SpanStatus.ERROR });
          span.recordException(err instanceof Error ? err : new Error(String(err)));
          span.end();
          throw err;
        }

        // Rehydrate response text blocks
        const rehydratedContent = (response.content as Anthropic.Messages.ContentBlock[]).map((block) => {
          if (block.type === "text" && typeof block.text === "string") {
            return { ...block, text: rehydrate(block.text, map) };
          }
          return block;
        });

        // Fire-and-forget telemetry
        const u = response.usage as Anthropic.Messages.Usage;
        const latencyMs = Date.now() - t0;
        span.setAttribute('llm.input_tokens', u?.input_tokens ?? 0);
        span.setAttribute('llm.output_tokens', u?.output_tokens ?? 0);
        span.setAttribute('llm.latency_ms', latencyMs);
        span.end();
        void recordCall({
          route,
          model: response.model,
          inputTokens: u?.input_tokens ?? 0,
          outputTokens: u?.output_tokens ?? 0,
          cacheReadTokens: u?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
          latencyMs,
        });
        // Prometheus counter: aggregate token volume per model/route pair for cost estimation.
        incrementCounter('hawkeye_llm_tokens_total', (u?.input_tokens ?? 0) + (u?.output_tokens ?? 0), {
          model: response.model,
          route,
          type: 'total',
        });
        const inputPricePerMTok = response.model.includes('haiku') ? 0.80 : 3.00;
        const outputPricePerMTok = response.model.includes('haiku') ? 4.00 : 15.00;
        const inputTokens = response.usage?.input_tokens ?? 0;
        const outputTokens = response.usage?.output_tokens ?? 0;
        const costUsd = (inputTokens * inputPricePerMTok + outputTokens * outputPricePerMTok) / 1_000_000;
        incrementCounter('hawkeye_llm_cost_usd_total', costUsd, { model: response.model, route });

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
          opts: { requests: Array<{ custom_id: string; params: Anthropic.Messages.MessageCreateParamsNonStreaming }> },
          requestOptions?: Anthropic.RequestOptions,
        ): Promise<Anthropic.Messages.MessageBatch & { _redactionMaps: Record<string, RedactionMap> }> => {
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

          const innerBatches = (inner.messages as unknown as { batches?: InnerBatchesShape }).batches;
          if (!innerBatches?.create) {
            throw new Error("Anthropic SDK does not expose messages.batches.create on this client. Upgrade @anthropic-ai/sdk.");
          }
          const response = await innerBatches.create({ requests: safeRequests }, requestOptions);
          return { ...response, _redactionMaps: maps };
        },
        retrieve: async (batchId: string, requestOptions?: Anthropic.RequestOptions): Promise<Anthropic.Messages.MessageBatch> => {
          const innerBatches = (inner.messages as unknown as { batches: InnerBatchesShape }).batches;
          return innerBatches.retrieve(batchId, requestOptions);
        },
        results: async (batchId: string, requestOptions?: Anthropic.RequestOptions): Promise<AsyncIterable<Anthropic.Messages.MessageBatchIndividualResponse>> => {
          const innerBatches = (inner.messages as unknown as { batches: InnerBatchesShape }).batches;
          return innerBatches.results(batchId, requestOptions);
        },
      },
    };
  }
}

// ── Singleton client pool ─────────────────────────────────────────────────────
// Creating `new Anthropic()` on every request throws away the underlying
// Node.js HTTP keep-alive connection, adding 30-80 ms of TCP/TLS setup per
// call. We maintain a module-level Map keyed on "keyPrefix:timeoutMs" so the
// connection is reused across requests on the same Lambda warm instance.
//
// globalThis anchoring survives Next.js HMR in development — the same pattern
// used by `store.ts` for the Blobs client and `quick-screen/route.ts` for the
// result cache.
declare global {
  // eslint-disable-next-line no-var
  var __hs_anthropic_pool: Map<string, AnthropicGuard> | undefined;
}
const _pool: Map<string, AnthropicGuard> =
  globalThis.__hs_anthropic_pool ??
  (globalThis.__hs_anthropic_pool = new Map());

/**
 * Returns a PII-guarded Anthropic client with the same interface as `new Anthropic({ apiKey })`.
 * Swap every `new Anthropic({ apiKey })` call for `getAnthropicClient(apiKey)`.
 *
 * Clients are pooled per (key-prefix, timeoutMs) pair so the underlying HTTP
 * keep-alive connection is reused across calls on the same Lambda warm
 * instance — saves 30-80 ms of TCP/TLS setup on every invocation.
 *
 * @param apiKey   - Anthropic API key.
 * @param timeoutMs - Optional per-client request timeout. Defaults to the
 *                   hard SLA value of 4 500 ms. Routes with `maxDuration = 60`
 *                   should pass a higher value (e.g. 55_000).
 * @param route    - Caller route label for telemetry. Reused across pool hits.
 */
export function getAnthropicClient(apiKey: string, timeoutMs?: number, route?: string): AnthropicGuard {
  const tms = timeoutMs ?? DEFAULT_ANTHROPIC_TIMEOUT_MS;
  // Key on SHA-256(key) + timeout. All Anthropic API keys share the prefix
  // "sk-ant-a" so an 8-char prefix produces a collision-universal pool key.
  // SHA-256 is safe to store as a pool key — it cannot be reversed to the
  // original key via brute force (256-bit preimage resistance).
  const poolKey = `${createHash("sha256").update(apiKey).digest("hex").slice(0, 32)}:${tms}`;
  let guard = _pool.get(poolKey);
  if (!guard) {
    guard = new AnthropicGuard(apiKey, tms, route ?? "unknown");
    _pool.set(poolKey, guard);
  }
  return guard;
}
