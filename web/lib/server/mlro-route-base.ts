// Hawkeye Sterling — shared MLRO LLM-route base.
//
// 12 routes under /api/mlro-* + /api/mlro-advisor/* each repeat the same
// ~30-line skeleton: enforce → parse body → no-api-key fallback →
// getAnthropicClient → messages.create → parse JSON envelope → response.
//
// withMlroLlm() centralises that skeleton. New routes / refactored ones
// pass three callbacks (parseBody / buildRequest / parseResult) plus a
// per-route options object. Reduces a 70-100 LOC route to ~30 LOC and
// eliminates per-route variance in error envelopes, timeout config,
// JSON-fence stripping, and degraded-mode responses.
//
// Pattern after consolidation:
//
//   export const POST = (req: Request) => withMlroLlm(req, {
//     route: "mlro-memo",
//     model: "claude-haiku-4-5-20251001",
//     maxTokens: 1500,
//     timeoutMs: 55_000,
//     parseBody: (raw) => raw as MlroMemoInput,
//     buildRequest: (body) => ({
//       system: SYSTEM_PROMPT,
//       userContent: JSON.stringify(body),
//     }),
//     parseResult: (text) => JSON.parse(stripJsonFences(text)) as MlroMemoResult,
//     offlineFallback: FALLBACK,
//   });

import { NextResponse } from "next/server";
import { enforce, type EnforcementAllow } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export interface MlroBuildRequest {
  system: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } | null }>;
  userContent: string;
  /** Optional explicit override of model / max_tokens for one call. */
  modelOverride?: string;
  maxTokensOverride?: number;
}

export interface MlroRouteOptions<TBody, TResult> {
  /** Short label used in console logs + telemetry. */
  route: string;
  /** Default model — caller can override per-request via buildRequest.modelOverride. */
  model: string;
  /** Default max tokens. */
  maxTokens: number;
  /** Anthropic client timeout in ms. Defaults to 55s. */
  timeoutMs?: number;
  /** Parse + validate the request body. Return null to short-circuit with a 400. */
  parseBody: (_raw: unknown) => TBody | null;
  /** Build the messages.create call from the parsed body. */
  buildRequest: (_body: TBody) => MlroBuildRequest;
  /** Parse the LLM text output into the structured response. Throw on parse failure. */
  parseResult: (_text: string) => TResult;
  /**
   * Offline fallback returned with ok: true + degraded: true when the API
   * key is missing. Lets the UI render something instead of a hard 503.
   * Omit to return a 503 in the no-key case.
   */
  offlineFallback?: TResult;
  /** Headers to merge into the response on success. Defaults to the gate's headers. */
  successHeaders?: Record<string, string>;
  /**
   * Fire-and-forget hook called after a successful LLM parse. Use for
   * audit-event writes that reference the parsed result + the original
   * body. Must NOT throw — exceptions are swallowed so the response
   * pipeline is never blocked by audit-log failures.
   */
  onSuccess?: (_result: TResult, _body: TBody) => void;
}

/**
 * Strip markdown code fences and re-trim — Claude occasionally wraps
 * JSON output in ```json ... ``` even when instructed not to.
 */
export function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

/**
 * Pull the first text block from an Anthropic Message. Returns "{}" when
 * the response has no text block (defensive — most parseResult callbacks
 * use JSON.parse and "{}" yields an empty object).
 */
export function firstTextBlock(content: unknown): string {
  if (!Array.isArray(content)) return "{}";
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      const t = (block as { text?: string }).text;
      if (typeof t === "string") return t;
    }
  }
  return "{}";
}

/** Per-route LLM call wrapper. See module docstring for the pattern. */
export async function withMlroLlm<TBody, TResult>(
  req: Request,
  opts: MlroRouteOptions<TBody, TResult>,
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const okGate = gate as EnforcementAllow;
  const headers = opts.successHeaders ?? okGate.headers;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400, headers },
    );
  }

  const body = opts.parseBody(rawBody);
  if (body === null) {
    return NextResponse.json(
      { ok: false, error: `${opts.route} body validation failed` },
      { status: 400, headers },
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    if (opts.offlineFallback !== undefined) {
      return NextResponse.json(
        { ok: true, degraded: true, degradedReason: "ANTHROPIC_API_KEY not configured", ...(opts.offlineFallback as Record<string, unknown>) },
        { headers },
      );
    }
    return NextResponse.json(
      { ok: false, error: `${opts.route} temporarily unavailable — please retry.` },
      { status: 503, headers },
    );
  }

  try {
    const reqShape = opts.buildRequest(body);
    const client = getAnthropicClient(apiKey, opts.timeoutMs ?? 55_000, opts.route);
    const response = await client.messages.create({
      model: reqShape.modelOverride ?? opts.model,
      max_tokens: reqShape.maxTokensOverride ?? opts.maxTokens,
      system: reqShape.system,
      messages: [{ role: "user", content: reqShape.userContent }],
    });
    const text = firstTextBlock(response.content);
    let parsed: TResult;
    try {
      parsed = opts.parseResult(text);
    } catch (parseErr) {
      const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.warn(`[${opts.route}] result parse failed: ${detail}`);
      return NextResponse.json(
        { ok: false, error: `${opts.route} returned invalid output — retry or escalate if persistent.` },
        { status: 502, headers },
      );
    }
    if (opts.onSuccess) {
      try { opts.onSuccess(parsed, body); } catch (hookErr) {
        console.warn(`[${opts.route}] onSuccess hook threw (non-blocking): ${hookErr instanceof Error ? hookErr.message : String(hookErr)}`);
      }
    }
    // Cabinet Res 134/2025 Art.19 — every MLRO advisor invocation is a
    // compliance-significant event; log centrally so no individual route
    // can be accidentally omitted from the tamper-evident chain.
    void writeAuditChainEntry(
      {
        event: "mlro.advisor_call",
        actor: okGate.keyId,
        route: opts.route,
        model: reqShape.modelOverride ?? opts.model,
      },
      tenantIdFromGate(okGate),
    ).catch((err) =>
      console.warn(`[${opts.route}] audit chain write failed:`, err instanceof Error ? err.message : String(err)),
    );
    return NextResponse.json({ ok: true, ...(parsed as Record<string, unknown>) }, { headers });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[${opts.route}] LLM call failed: ${detail}`);
    if (opts.offlineFallback !== undefined) {
      return NextResponse.json(
        { ok: true, degraded: true, degradedReason: detail, ...(opts.offlineFallback as Record<string, unknown>) },
        { headers },
      );
    }
    return NextResponse.json(
      { ok: false, error: `${opts.route} temporarily unavailable — please retry.` },
      { status: 503, headers },
    );
  }
}
