// POST /api/agent/data-analyst
//
// Invokes the Claude Console "Data analyst" managed agent
// (agent_01KWdhXyphDqQnN6ar56nrQb) via the Anthropic beta.sessions API.
//
// Flow: create ephemeral session → send user message → stream events until
// agent.end_turn → archive session → return final text + usage.
//
// Body: {
//   question: string,          // what to ask the data analyst
//   context?:  string,         // optional dataset description / context
//   timeoutMs?: number,        // default 60000, max 60000
// }
//
// Response: {
//   ok: true,
//   answer: string,
//   sessionId: string,
//   usage?: { input_tokens: number; output_tokens: number }
// }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeText } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AGENT_ID = "agent_01KWdhXyphDqQnN6ar56nrQb";
const ENV_ID   = "env_01SnGQiAwuVGmipn1SynFmkx";
const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_500;

export async function POST(req: Request) {
  const gate = await enforce(req, { requireAuth: false });
  if (!gate.ok) return gate.response;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY not configured" },
      { status: 503, headers: gate.headers },
    );
  }

  let body: { question?: unknown; context?: unknown; timeoutMs?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const question = sanitizeText(String(body.question ?? ""), 4000).trim();
  if (!question) {
    return NextResponse.json({ ok: false, error: "question is required" }, { status: 400, headers: gate.headers });
  }
  const context = body.context ? sanitizeText(String(body.context), 8000) : null;
  const timeoutMs = typeof body.timeoutMs === "number" ? Math.min(body.timeoutMs, DEFAULT_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;

  const client = getAnthropicClient(apiKey, 55_000, "agent/data-analyst");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beta = (client as any).beta;

  try {
    // 1. Create a single-use session bound to the managed agent.
    const session = await beta.sessions.create({ agent: AGENT_ID, environment_id: ENV_ID });
    const sessionId: string = session.id;

    // 2. Send the user message (with optional context prepended).
    const userText = context
      ? `Context / dataset:\n${context}\n\n---\n\n${question}`
      : question;

    await beta.sessions.events.send(sessionId, {
      events: [{ type: "user.message", content: [{ type: "text", text: userText }] }],
    });

    // 3. Poll the event stream until the agent ends its turn or we time out.
    const deadline = Date.now() + timeoutMs;
    let answer = "";
    let usage: { input_tokens: number; output_tokens: number } | undefined;

    while (Date.now() < deadline) {
      const stream = await beta.sessions.events.stream(sessionId);
      let turnDone = false;

      for await (const event of stream) {
        const type: string = event.type ?? "";

        if (type === "agent.message") {
          const content = Array.isArray(event.content) ? event.content : [];
          for (const block of content) {
            if (block.type === "text") answer += block.text;
          }
        }

        if (type === "agent.end_turn" || type === "session.idle") {
          if (event.usage) {
            usage = {
              input_tokens: event.usage.input_tokens ?? 0,
              output_tokens: event.usage.output_tokens ?? 0,
            };
          }
          turnDone = true;
          break;
        }

        if (type === "session.error" || type === "session.deleted") {
          return NextResponse.json(
            { ok: false, error: `Agent session error: ${event.error?.message ?? type}` },
            { status: 502, headers: gate.headers },
          );
        }
      }

      if (turnDone) break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // 4. Archive the ephemeral session (best-effort cleanup).
    beta.sessions.archive(sessionId).catch(() => {});

    if (!answer) {
      return NextResponse.json(
        { ok: false, error: "Agent returned no answer within timeout" },
        { status: 504, headers: gate.headers },
      );
    }

    return NextResponse.json({ ok: true, answer, sessionId, usage }, { headers: gate.headers });
  } catch (err) {
    console.error("[agent/data-analyst]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500, headers: gate.headers },
    );
  }
}
