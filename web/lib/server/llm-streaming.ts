// Hawkeye Sterling — streaming LLM wrapper.
//
// The standard `client.messages.create()` call buffers the entire response
// before returning — on a 1 200-token MLRO advisory that means the caller
// waits 1.5–4 s before seeing any content, even though the first token
// arrives within ~300 ms.
//
// This module wraps the Anthropic streaming API and exposes two surfaces:
//
//   1. `streamToNextResponse()` — converts an Anthropic stream into a
//      Next.js `NextResponse` with Content-Type: text/event-stream (SSE).
//      Routes that can stream to the browser should use this.
//
//   2. `streamToString()` — collects all streamed chunks into a single
//      string with a hard timeout. Routes that need the full response but
//      want to avoid large buffer allocations should use this over the
//      non-streaming API when the expected output is large (>500 tokens).
//
// Audit / PII invariants from `llm.ts` are preserved: system prompts are
// auto-cached; input text is redacted before transmission; response text is
// rehydrated before being returned to the caller.

import Anthropic from "@anthropic-ai/sdk";
import { redact, rehydrate, type RedactionMap } from "./redact";
import { startSpan, SpanStatus } from "./tracer";
import { incrementCounter } from "./metrics-store";

// Re-export type so callers don't need to import both.
export type { RedactionMap };

type SystemBlock = Anthropic.Messages.TextBlockParam & { cache_control?: unknown };
const CACHE_MIN_CHARS = 1024;

function autoCacheSystem(
  system: string | SystemBlock[] | undefined,
): string | SystemBlock[] | undefined {
  if (typeof system !== "string") return system;
  if (system.length < CACHE_MIN_CHARS) return system;
  return [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" } } as SystemBlock];
}

type ContentBlock = Anthropic.Messages.ContentBlockParam;

function redactContent(
  content: string | ContentBlock[],
  map: RedactionMap,
): string | ContentBlock[] {
  if (typeof content === "string") return redact(content, map);
  return content.map((b) =>
    b.type === "text" ? { ...b, text: redact(b.text, map) } : b,
  );
}

// ── streamToString ─────────────────────────────────────────────────────────

export interface StreamResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
  model: string;
}

/**
 * Call the Anthropic streaming API and accumulate the full response text.
 * Applies PII redaction on the way in and rehydration on the way out,
 * identical to `AnthropicGuard.messages.create()`.
 *
 * Hard timeout: if the stream does not COMPLETE within `timeoutMs` the
 * accumulated partial text is returned with `partial: true` rather than
 * throwing, so the caller can still return a degraded-but-useful response.
 */
export async function streamToString(opts: {
  apiKey: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
  timeoutMs?: number;
  route?: string;
}): Promise<StreamResult & { partial?: boolean }> {
  const { apiKey, timeoutMs = 12_000, route = "unknown" } = opts;
  const map: RedactionMap = {};
  const t0 = Date.now();

  const safe: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    ...opts.params,
    system: autoCacheSystem(
      opts.params.system
        ? (typeof opts.params.system === "string"
          ? redact(opts.params.system, map)
          : opts.params.system)
        : undefined,
    ),
    messages: ((opts.params.messages as Anthropic.Messages.MessageParam[]) ?? []).map((m) => ({
      ...m,
      content: redactContent(m.content as string | ContentBlock[], map),
    })),
  };

  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  const span = startSpan("llm.stream", { "llm.model": safe.model, "llm.route": route });

  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let modelId = safe.model;
  let partial = false;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        partial = true;
        resolve(); // return accumulated text rather than throwing
      }, timeoutMs);

      client.messages
        .stream(safe as Anthropic.Messages.MessageStreamParams)
        .on("text", (chunk) => { text += chunk; })
        .on("message", (msg) => {
          modelId = msg.model;
          inputTokens = msg.usage?.input_tokens ?? 0;
          outputTokens = msg.usage?.output_tokens ?? 0;
          cacheReadTokens = (msg.usage as Record<string, number>)?.cache_read_input_tokens ?? 0;
          cacheWriteTokens = (msg.usage as Record<string, number>)?.cache_creation_input_tokens ?? 0;
        })
        .on("finalMessage", () => {
          clearTimeout(timer);
          resolve();
        })
        .on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  } catch (err) {
    span.setStatus({ code: SpanStatus.ERROR });
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    span.end();
    throw err;
  }

  const latencyMs = Date.now() - t0;
  span.setAttribute("llm.input_tokens", inputTokens);
  span.setAttribute("llm.output_tokens", outputTokens);
  span.setAttribute("llm.latency_ms", latencyMs);
  span.setAttribute("llm.partial", partial);
  span.end();

  incrementCounter("hawkeye_llm_tokens_total", inputTokens + outputTokens, {
    model: modelId,
    route,
    type: "total",
  });

  return {
    text: rehydrate(text, map),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    latencyMs,
    model: modelId,
    ...(partial ? { partial: true } : {}),
  };
}

// ── streamToSSE ────────────────────────────────────────────────────────────

/**
 * Stream an Anthropic response as Server-Sent Events to the client.
 *
 * Each text delta is emitted as:
 *   data: {"type":"delta","text":"...chunk..."}\n\n
 *
 * A final done event is emitted once the stream is complete:
 *   data: {"type":"done","inputTokens":N,"outputTokens":N}\n\n
 *
 * Routes should return the resulting `Response` directly.
 *
 * Usage:
 *   return streamToSSE({ apiKey, params, route: "mlro-advisor" });
 */
export function streamToSSE(opts: {
  apiKey: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
  timeoutMs?: number;
  route?: string;
}): Response {
  const { apiKey, timeoutMs = 25_000, route = "unknown" } = opts;
  const map: RedactionMap = {};

  const safe: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    ...opts.params,
    system: autoCacheSystem(
      opts.params.system
        ? (typeof opts.params.system === "string"
          ? redact(opts.params.system, map)
          : opts.params.system)
        : undefined,
    ),
    messages: ((opts.params.messages as Anthropic.Messages.MessageParam[]) ?? []).map((m) => ({
      ...m,
      content: redactContent(m.content as string | ContentBlock[], map),
    })),
  };

  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      function emit(obj: Record<string, unknown>): void {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      try {
        const timer = setTimeout(() => {
          emit({ type: "timeout", elapsedMs: Date.now() - t0 });
          controller.close();
        }, timeoutMs);

        const anthropicStream = client.messages.stream(
          safe as Anthropic.Messages.MessageStreamParams,
        );

        anthropicStream
          .on("text", (chunk) => {
            emit({ type: "delta", text: rehydrate(chunk, map) });
          })
          .on("finalMessage", (msg) => {
            clearTimeout(timer);
            const u = msg.usage as Anthropic.Messages.Usage;
            incrementCounter("hawkeye_llm_tokens_total", (u?.input_tokens ?? 0) + (u?.output_tokens ?? 0), {
              model: msg.model,
              route,
              type: "total",
            });
            emit({
              type: "done",
              model: msg.model,
              inputTokens: u?.input_tokens ?? 0,
              outputTokens: u?.output_tokens ?? 0,
              latencyMs: Date.now() - t0,
            });
            controller.close();
          })
          .on("error", (err) => {
            clearTimeout(timer);
            emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
            controller.close();
          });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? (err as Error).message : String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
