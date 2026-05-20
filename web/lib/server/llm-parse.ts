// Pure helpers for LLM-output parsing. Extracted from mlro-route-base.ts so
// they can be unit-tested in isolation without dragging the Next.js runtime
// (enforce / audit-chain / Anthropic SDK) into the test graph.
//
// Every function in this module:
//   · has no I/O, no async dependencies, no global state
//   · never throws
//   · is exhaustively covered by web/lib/server/__tests__/llm-parse.test.ts

/**
 * Strip markdown code fences and re-trim — Claude occasionally wraps
 * JSON output in ```json ... ``` even when instructed not to.
 */
export function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

/**
 * Best-effort LLM-output JSON parser. Tries, in order:
 *   1. Direct JSON.parse after stripping code fences (the happy path —
 *      well-behaved models return only the JSON object).
 *   2. Extract the largest balanced `{...}` block in the text and parse
 *      it (handles "Here is the decision:\n{...}\nThis means..." prose
 *      around the JSON — observed in production with Haiku 4.5 on the
 *      mlro-advisor escalation route, where the parser had previously
 *      collapsed straight to a Parse-error fallback even when the JSON
 *      itself was present and valid).
 *   3. Return null so the caller can apply its route-specific fallback
 *      instead of a thrown SyntaxError.
 *
 * This consolidates the parse-and-fallback dance that previously lived
 * inline in every mlro route. Routes call it from parseResult and apply
 * their own FALLBACK constant on null.
 */
export function parseLlmJson<T>(text: string): T | null {
  const cleaned = stripJsonFences(text);
  // Strategy 1 — direct parse.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through
  }
  // Strategy 2 — extract the outermost balanced { ... } substring. We use
  // a single greedy match from the first `{` to the last `}`; on
  // malformed JSON this still recovers the most likely intended object.
  const open = cleaned.indexOf("{");
  const close = cleaned.lastIndexOf("}");
  if (open >= 0 && close > open) {
    const candidate = cleaned.slice(open, close + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // fall through to null
    }
  }
  return null;
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
