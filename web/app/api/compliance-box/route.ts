// POST /api/compliance-box
//
// Hawkeye Sterling — Upstash Box / Claude Code agent runner.
//
// Spins up an Upstash Box (sandboxed AI coding environment), runs a
// Claude Code agent inside it with Hawkeye's MCP tools wired in, and
// returns the structured compliance result. Used by the operator UI for
// long-running multi-step compliance tasks (sanctions screening, KYC
// review, transaction monitoring, STR drafting, EDD, LBMA supply chain).
//
// Why Box (vs the existing direct Anthropic SDK path used by super-brain
// / mlro-advisor):
//   - The Box gives the agent a real cloud computer — shell, filesystem,
//     code execution. Useful for parsing uploaded PDFs/CSVs/Excel and
//     running multi-step workflows where the agent needs to "work" on
//     case data, not just answer a single question.
//   - keepAlive: true → agent state persists per case_id across calls,
//     so a SAR-drafting workflow can resume a previous Box session.
//   - The Box can call the Hawkeye MCP server (already exposed at
//     /api/mcp) so the agent uses the same tools the rest of Claude
//     gets.
//
// Auth: standard enforce() gate — same as every other compliance route.
// Request body shape:
//   {
//     prompt:    string                   // free-form instruction
//     task_type: ComplianceTaskType       // one of the 6 enumerated workflows
//     case_id?:  string                   // optional, used for keepAlive routing
//     subject?:  Record<string, unknown>  // optional structured context
//   }

import { NextResponse } from "next/server";
import { Box, ClaudeCode, Agent } from "@upstash/box";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Enumerate the supported compliance workflows so the prompt builder can
// pick a task-specific instruction header. Free-form `prompt` augments
// the header with the operator's specific question / case context.
export type ComplianceTaskType =
  | "SANCTIONS_SCREENING"
  | "KYC_REVIEW"
  | "TRANSACTION_MONITORING"
  | "STR_DRAFT"
  | "EDD_REPORT"
  | "SUPPLY_CHAIN_LBMA"
  | "OTHER";

interface Body {
  prompt?: string;
  task_type?: ComplianceTaskType;
  case_id?: string;
  subject?: Record<string, unknown>;
}

const HAWKEYE_MCP_URL = "https://hawkeye-sterling.netlify.app/api/mcp";

// Task-specific output structure. Every prompt asks the agent to format
// its response with these labelled sections so downstream consumers
// (compliance report generator, MLRO UI) can parse without an extra LLM
// extraction pass.
const OUTPUT_FORMAT = `
Structure your output with these labelled sections:
  RISK LEVEL: Low | Medium | High | Critical
  FINDINGS:        [detailed findings, one per line, with citations]
  RECOMMENDED ACTION: [specific next step the MLRO should take]
  REGULATORY BASIS: [UAE FDL 10/2025, FDL 20/2018, Cabinet Decisions
                     74/2020 / 16/2021 / 134/2025, FATF Recommendations,
                     CBUAE, MoE — cite the specific articles you relied on]
`.trim();

const SYSTEM_PROMPT = `
You are a senior AML/CFT compliance officer for a UAE DPMS (precious metals dealer).

You have access to Hawkeye Sterling compliance tools via the MCP server at
${HAWKEYE_MCP_URL}. Use those tools (screen, super_brain, sanctions_status,
opensanctions_check, open_banking_check, pep, country_risk, mlro_analyze,
generate_sar_report, etc.) for the actual compliance lookups — do not invent
sanctions data or PEP roles from training-data memory.

Apply the Hawkeye Sterling charter:
  - No fabrication. Cite your tool calls and their outputs.
  - No legal conclusions — surface findings and recommended actions, not verdicts.
  - No tipping-off language in any STR / SAR draft.
  - If information is insufficient, say so and request what's needed.

Regulatory anchors: UAE FDL 10/2025, FDL 20/2018, Cabinet Decisions 10/2019 /
74/2020 / 16/2021 / 134/2025, LBMA RGG (gold), OECD DDG Annex II (DPMS).
${OUTPUT_FORMAT}
`.trim();

function buildPrompt(body: Required<Pick<Body, "task_type" | "prompt">> & Pick<Body, "case_id" | "subject">): string {
  const lines: string[] = [];
  lines.push(`TASK: ${body.task_type}`);
  if (body.case_id) lines.push(`CASE ID: ${body.case_id}`);
  if (body.subject) lines.push(`SUBJECT CONTEXT: ${JSON.stringify(body.subject)}`);
  lines.push(`INSTRUCTION: ${body.prompt}`);
  lines.push("");
  lines.push("Use the available MCP tools to complete this compliance task. Return the structured output exactly as specified in your system prompt.");
  return lines.join("\n");
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Required env vars — fail fast with a clear error rather than letting
  // the SDK throw an opaque "missing api key" deep in the call.
  const upstashKey = process.env["UPSTASH_BOX_API_KEY"];
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  if (!upstashKey) {
    return NextResponse.json(
      { ok: false, error: "service unavailable — UPSTASH_BOX_API_KEY not set" },
      { status: 503, headers: gate.headers }
    );
  }
  if (!anthropicKey) {
    return NextResponse.json(
      { ok: false, error: "service unavailable — ANTHROPIC_API_KEY not set" },
      { status: 503, headers: gate.headers }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 , headers: gate.headers });
  }
  if (!body.prompt?.trim()) {
    return NextResponse.json({ ok: false, error: "prompt is required" }, { status: 400 , headers: gate.headers });
  }
  if (!body.task_type) body.task_type = "OTHER";

  const startedAt = Date.now();
  let box: Box | null = null;
  try {
    // Create an ephemeral keep-alive Box. The keepAlive flag tells Upstash
    // to retain the container across the run so subsequent calls keyed by
    // case_id can resume agent state. We surface box.id back to the caller
    // for that follow-up routing.
    box = await Box.create({
      runtime: "node",
      keepAlive: true,
      apiKey: upstashKey,
      agent: {
        harness: Agent.ClaudeCode,
        model: ClaudeCode.Sonnet_4_5,
        apiKey: anthropicKey,
      },
    });

    const run = await box.agent.run({
      prompt: `${SYSTEM_PROMPT}\n\n${buildPrompt({
        task_type: body.task_type,
        prompt: body.prompt,
        case_id: body.case_id,
        subject: body.subject,
      })}`,
    });

    return NextResponse.json({
      ok: true,
      result: run.result,
      status: run.status,
      box_id: box.id,
      cost: run.cost,
      durationMs: Date.now() - startedAt,
    }, { headers: gate.headers });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `compliance-box run failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startedAt,
      },
      { status: 502, headers: gate.headers }
    );
  }
}
