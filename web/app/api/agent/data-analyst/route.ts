// POST /api/agent/data-analyst
//
// Invokes the Claude Console "Data analyst" managed agent
// (agent_01KWdhXyphDqQnN6ar56nrQb) via the Anthropic beta.sessions API.
//
// Flow: create session → stream events → send user message → accumulate
// agent.message text → break on session.status_idle / session.status_terminated
// → archive session → return final text.
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
// }

import { NextResponse } from "next/server";
import type { Beta } from "@anthropic-ai/sdk/resources/index.js";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeText } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AGENT_ID = "agent_01KWdhXyphDqQnN6ar56nrQb";
const ENV_ID   = "env_01SnGQiAwuVGmipn1SynFmkx";
const DEFAULT_TIMEOUT_MS = 60_000;

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
  const beta = client.beta;

  try {
    // 1. Create a single-use session bound to the managed agent.
    const session = await beta.sessions.create({ agent: AGENT_ID, environment_id: ENV_ID });
    const sessionId: string = session.id;

    // 2. Build the user message (with optional context prepended).
    const userText = context
      ? `Context / dataset:\n${context}\n\n---\n\n${question}`
      : question;

    // 3. Stream-first: open the stream BEFORE sending so no events are missed.
    const deadline = Date.now() + timeoutMs;
    let answer = "";

    const [stream] = await Promise.all([
      beta.sessions.events.stream(sessionId),
      beta.sessions.events.send(sessionId, {
        events: [{ type: "user.message", content: [{ type: "text", text: userText }] }],
      }),
    ]);

    // 4. Consume the event stream until the agent goes idle or we time out.
    for await (const event of stream) {
      if (Date.now() > deadline) break;

      const ev = event as Beta.Sessions.BetaManagedAgentsStreamSessionEvents;

      if (ev.type === "agent.message") {
        for (const block of ev.content) {
          if (block.type === "text") answer += block.text;
        }
      }

      if (ev.type === "session.status_idle" || ev.type === "session.status_terminated") {
        break;
      }

      if (ev.type === "session.error") {
        return NextResponse.json(
          { ok: false, error: ev.error.message },
          { status: 502, headers: gate.headers },
        );
      }

      if (ev.type === "session.deleted") {
        return NextResponse.json(
          { ok: false, error: "Session was deleted unexpectedly" },
          { status: 502, headers: gate.headers },
        );
      }
    }

    // 5. Archive the ephemeral session (best-effort cleanup).
    beta.sessions.archive(sessionId).catch(() => {});

    if (!answer) {
      return NextResponse.json(
        { ok: false, error: "Agent returned no answer within timeout" },
        { status: 504, headers: gate.headers },
      );
    }

    return NextResponse.json({ ok: true, answer, sessionId }, { headers: gate.headers });
  } catch (err) {
    console.error("[agent/data-analyst]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500, headers: gate.headers },
    );
  }
}
