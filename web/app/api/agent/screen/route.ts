// POST /api/agent/screen
//
// Hawkeye-Sterling weaponized agent — LLM tool-use endpoint. Loads the
// canonical weaponized system prompt (Charter P1-P10 + 200 reasoning
// modes + 10 faculties + adverse-media taxonomy + doctrines + red flags
// + typologies + regimes + redlines + FATF + meta-cognition + amplifier
// + citation enforcement + integrity hashes) and exposes the brain's
// deterministic functions as Anthropic tool-use schemas. The model can
// recurse: call `match_entity`, get the result, call `classify_pep` on
// a role it spotted, call `corroborate_evidence` on a doubtful citation,
// etc., until it has enough verified evidence to produce a regulator-
// facing verdict.
//
// This is the foundational unlock missing from /api/mlro-advisor (which
// gives the model a static preamble; here it can chase down threads).
//
// Body: {
//   subject: { name, type, jurisdiction?, aliases?, identifiers?, ... },
//   evidence?: { ... },
//   question?: string,         // default = "Screen the subject"
//   maxIterations?: number,    // default 8, cap 20
//   model?: string,            // default claude-opus-4-7
// }
//
// Response: {
//   ok: true,
//   finalText: string,
//   stopReason: string,
//   model: string,
//   usage: { input_tokens, output_tokens, cache_read_input_tokens },
//   transcript: ToolCallRecord[],
//   iterations: number
// }
//
// Charter compliance:
//   - System prompt enforces the no-fabrication / no-tipping-off /
//     no-allegation-upgrade / training-data-stale rules.
//   - Tools call deterministic brain functions; model cannot synthesise
//     screen results, only request them.
//   - Integrity hashes (charterHash / catalogueHash / compositeHash)
//     are emitted in the system prompt; the model is required to echo
//     them in AUDIT_LINE per the charter.
//   - Per-call iteration cap + edge-timeout-aware budget so a runaway
//     loop cannot blow the Lambda.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { weaponizedSystemPrompt } from "../../../../../dist/src/brain/weaponized.js";
import { evaluateRedlines } from "../../../../../dist/src/brain/redlines.js";
import { classifyPepRole } from "../../../../../dist/src/brain/pep-classifier.js";
import { resolveEntities } from "../../../../../dist/src/brain/entity-resolution.js";
import { corroborate } from "../../../../../dist/src/brain/evidence-corroboration.js";
import { detectCrossRegimeConflict } from "../../../../../dist/src/brain/cross-regime-conflict.js";
import { computeSanctionDelta } from "../../../../../dist/src/brain/sanction-delta.js";
import { analyseAdverseMediaItems } from "../../../../../dist/src/brain/adverse-media-analyser.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MODEL = "claude-opus-4-7";
const DEFAULT_MAX_ITERATIONS = 8;
const MAX_ITERATIONS_CAP = 20;
const DEFAULT_BUDGET_MS = 22_000;          // Netlify edge ceiling is 26s.
const MAX_OUTPUT_TOKENS = 8192;
const MAX_TOOL_RESULT_BYTES = 50_000;       // truncate huge tool outputs to keep token budget sane.

// ─── Tool catalogue ─────────────────────────────────────────────────────────
// Every tool wraps a deterministic brain function. The agent cannot fabricate
// a screen result — it must request one and the deterministic layer answers.

const TOOLS = [
  {
    name: "evaluate_redlines",
    description:
      "Given a list of fired redline IDs, return the consolidated overriding action " +
      "(freeze / block / escalate_immediately / exit_relationship / do_not_onboard). " +
      "Use after gathering evidence to check whether any hard-stop rule applies.",
    input_schema: {
      type: "object",
      properties: {
        firedIds: { type: "array", items: { type: "string" } },
      },
      required: ["firedIds"],
    },
  },
  {
    name: "classify_pep",
    description:
      "Classify a role description into PEP tier + type + salience. Charter P8: " +
      "the role string MUST come from a verifiable primary source already attached " +
      "to the case. Never invent a role.",
    input_schema: {
      type: "object",
      properties: { role: { type: "string" } },
      required: ["role"],
    },
  },
  {
    name: "match_entity",
    description:
      "Pairwise entity resolver. Decides whether two records refer to the same " +
      "real-world entity using name ensemble (Levenshtein/Jaro-Winkler/Soundex/" +
      "Double Metaphone) + alias expansion + identifier overlap + DOB/incorporation-" +
      "date proximity + nationality match + charter caps. Returns confidence band + " +
      "score + agreements + disagreements + caps.",
    input_schema: {
      type: "object",
      properties: {
        a: { type: "object" },
        b: { type: "object" },
      },
      required: ["a", "b"],
    },
  },
  {
    name: "corroborate_evidence",
    description:
      "Score multi-source corroboration of an evidence set ∈ [0,1]. Penalises shared " +
      "publishers / stale dates / low credibility / training-data citations; rewards " +
      "kind+publisher diversity, recency, primary sources. Conservative by design (P2/P8).",
    input_schema: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "object" } },
      },
      required: ["items"],
    },
  },
  {
    name: "detect_cross_regime_conflict",
    description:
      "Given per-regime designation statuses (UN / OFAC / EU / UK / UAE EOCN / UAE LTL), " +
      "return the conflict report with recommendedAction. Surfaces split-regime cases " +
      "(one regime designates, another doesn't) and applies the most-restrictive-regime rule.",
    input_schema: {
      type: "object",
      properties: {
        statuses: { type: "array", items: { type: "object" } },
      },
      required: ["statuses"],
    },
  },
  {
    name: "compute_sanction_delta",
    description:
      "Diff two NormalisedListEntry snapshots of the same sanctions list. Returns " +
      "additions / removals / amendments. Use to surface what changed since the last screen.",
    input_schema: {
      type: "object",
      properties: {
        previous: { type: "array", items: { type: "object" } },
        current: { type: "array", items: { type: "object" } },
      },
      required: ["previous", "current"],
    },
  },
  {
    name: "analyse_adverse_media",
    description:
      "Run the FATF-mapped adverse-media analyser over a list of articles (Taranis " +
      "shape: { id, url, title, content, publishedAt, language? }). Returns severity " +
      "tiers, SAR triggers (R.20), counterfactuals, and an investigation narrative.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        items: { type: "array", items: { type: "object" } },
      },
      required: ["subject", "items"],
    },
  },
];

// ─── Tool dispatch ─────────────────────────────────────────────────────────

async function dispatch(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "evaluate_redlines":
      return evaluateRedlines((args["firedIds"] as string[]) ?? []);
    case "classify_pep":
      return classifyPepRole(String(args["role"] ?? ""));
    case "match_entity":
      return resolveEntities(
        args["a"] as Parameters<typeof resolveEntities>[0],
        args["b"] as Parameters<typeof resolveEntities>[1],
      );
    case "corroborate_evidence":
      return corroborate(
        (args["items"] as Parameters<typeof corroborate>[0]) ?? [],
      );
    case "detect_cross_regime_conflict":
      return detectCrossRegimeConflict(
        (args["statuses"] as Parameters<typeof detectCrossRegimeConflict>[0]) ?? [],
      );
    case "compute_sanction_delta":
      return computeSanctionDelta(
        (args["previous"] as Parameters<typeof computeSanctionDelta>[0]) ?? [],
        (args["current"] as Parameters<typeof computeSanctionDelta>[1]) ?? [],
      );
    case "analyse_adverse_media":
      return analyseAdverseMediaItems(
        String(args["subject"] ?? ""),
        (args["items"] as Parameters<typeof analyseAdverseMediaItems>[1]) ?? [],
      );
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

// ─── Anthropic API call (PII-guarded via AnthropicGuard) ────────────────────
// Uses getAnthropicClient() which redacts UAE IDs, IBANs, card numbers,
// passport numbers, email addresses, and crypto addresses from all message
// text before they reach Anthropic's API, satisfying UAE PDPL Art.22 and
// GDPR Art.5(1)(c). The same redaction map is used to rehydrate the response.

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "thinking";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  model: string;
  stop_reason: string;
  content: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown }>,
  abortSignal: AbortSignal,
): Promise<AnthropicResponse> {
  // 55 s client-level timeout — the route has maxDuration: 60.
  const client = getAnthropicClient(apiKey, 55_000);
  const response = await client.messages.create(
    {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      // System prompt is wrapped in a cache_control block — the weaponized
      // prompt is ~12k tokens; caching cuts cost by ~90% on subsequent calls
      // within the 5-minute TTL window.
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TOOLS,
      messages: messages as Parameters<typeof client.messages.create>[0]["messages"],
    },
    { signal: abortSignal },
  );
  return response as unknown as AnthropicResponse;
}

// ─── Body shape & route handler ─────────────────────────────────────────────

interface ToolCallRecord {
  iteration: number;
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  isError: boolean;
}

interface Body {
  subject: { name: string; [k: string]: unknown };
  evidence?: Record<string, unknown>;
  question?: string;
  maxIterations?: number;
  model?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: true,
        finalText: "AI analysis unavailable — manual review required",
        stopReason: "api_key_missing",
        model: null,
        usage: null,
        transcript: [],
        iterations: 0,
        budgetMs: DEFAULT_BUDGET_MS,
        maxIterations: DEFAULT_MAX_ITERATIONS,
      },
      { headers: gateHeaders },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (!body?.subject?.name || body.subject.name.length > 500) {
    return NextResponse.json(
      { ok: false, error: "subject.name required (max 500 chars)" },
      { status: 400, headers: gateHeaders },
    );
  }

  const maxIterations = Math.min(
    MAX_ITERATIONS_CAP,
    Math.max(1, body.maxIterations ?? DEFAULT_MAX_ITERATIONS),
  );
  const model = typeof body.model === "string" ? body.model : DEFAULT_MODEL;

  const question =
    body.question ??
    "Screen the subject and produce a regulator-facing verdict. Use the available tools to gather and verify evidence; cite mode_id, doctrine, and regulatory anchor in every claim per the charter.";

  const systemPrompt = weaponizedSystemPrompt({
    taskRole:
      "Screen subjects via the Hawkeye-Sterling brain. Use the supplied tools to gather and verify evidence; do not fabricate findings. Echo the integrity hashes in your AUDIT_LINE.",
    audience: "MLRO",
  });

  const subjectBlock = JSON.stringify(
    { subject: body.subject, evidence: body.evidence ?? {} },
    null,
    2,
  );
  const initialUserMessage =
    `Subject + evidence pack:\n\`\`\`json\n${subjectBlock}\n\`\`\`\n\n${question}`;

  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: initialUserMessage },
  ];
  const transcript: ToolCallRecord[] = [];

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), DEFAULT_BUDGET_MS);

  let final: AnthropicResponse | null = null;

  try {
    for (let i = 0; i < maxIterations; i++) {
      const resp = await callAnthropic(
        apiKey,
        model,
        systemPrompt,
        messages,
        ctrl.signal,
      );

      // No tool calls → done.
      if (resp.stop_reason !== "tool_use") {
        final = resp;
        break;
      }
      const toolUses = resp.content.filter(
        (c): c is AnthropicContentBlock & { id: string; name: string; input: Record<string, unknown> } =>
          c.type === "tool_use" && typeof c.id === "string" && typeof c.name === "string",
      );
      if (toolUses.length === 0) {
        final = resp;
        break;
      }

      // Append the assistant's response to the conversation so the model
      // sees its own tool_use block in the next turn.
      messages.push({ role: "assistant", content: resp.content });

      // Execute each requested tool and gather results.
      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      }> = [];

      for (const tu of toolUses) {
        const startedAt = Date.now();
        try {
          const out = await dispatch(tu.name, tu.input ?? {});
          const serialised = JSON.stringify(out).slice(0, MAX_TOOL_RESULT_BYTES);
          transcript.push({
            iteration: i + 1,
            toolName: tu.name,
            input: tu.input,
            output: out,
            durationMs: Date.now() - startedAt,
            isError: false,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: serialised,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          transcript.push({
            iteration: i + 1,
            toolName: tu.name,
            input: tu.input,
            output: { error: msg },
            durationMs: Date.now() - startedAt,
            isError: true,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Tool error: ${msg}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }

    clearTimeout(timeout);

    const finalText = (final?.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n\n");

    return NextResponse.json(
      {
        ok: true,
        finalText,
        stopReason: final?.stop_reason ?? "max_iterations",
        model: final?.model ?? model,
        usage: final?.usage ?? null,
        transcript,
        iterations: transcript.length,
        budgetMs: DEFAULT_BUDGET_MS,
        maxIterations,
      },
      { headers: gateHeaders },
    );
  } catch (err) {
    clearTimeout(timeout);
    console.error("[agent/screen]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      {
        ok: true,
        finalText: "Analysis unavailable",
        stopReason: "error",
        model: null,
        usage: null,
        transcript,
        iterations: transcript.length,
        budgetMs: DEFAULT_BUDGET_MS,
        maxIterations,
        degraded: true,
      },
      { headers: gateHeaders },
    );
  }
}
