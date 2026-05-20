/**
 * Minimal scaffold: talk to Managed Agent agent_01KWdhXyphDqQnN6ar56nrQb
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... tsx scripts/agent-client.ts "Your question here"
 */

import Anthropic from "@anthropic-ai/sdk";

const AGENT_ID = "agent_01KWdhXyphDqQnN6ar56nrQb";
const ENV_ID   = "env_01SnGQiAwuVGmipniSynFmkx";

async function main() {
  const userMessage = process.argv.slice(2).join(" ") || "Hello — what can you help me with?";

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beta = (client as any).beta;

  console.log("Creating session…");
  const session = await beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENV_ID,
  });
  console.log(`Session: ${session.id}  status: ${session.status}\n`);

  // Stream-first: open the event stream BEFORE sending the user message
  // so no events are missed.
  const [, stream] = await Promise.all([
    beta.sessions.events.send(session.id, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: userMessage }],
        },
      ],
    }),
    beta.sessions.events.stream(session.id),
  ]);

  console.log(`User: ${userMessage}\n`);
  process.stdout.write("Agent: ");

  for await (const event of stream) {
    const type: string = event.type ?? "";

    if (type === "agent.message") {
      const blocks = Array.isArray(event.content) ? event.content : [];
      for (const block of blocks) {
        if (block.type === "text") {
          process.stdout.write(block.text);
        }
      }
    }

    if (type === "session.status_idle" || type === "session.status_terminated") {
      break;
    }

    if (type === "session.error") {
      console.error(`\nAgent session error: ${event.error?.message ?? type}`);
      process.exitCode = 1;
      break;
    }
  }

  console.log("\n\nDone.");

  // Best-effort cleanup
  beta.sessions.archive(session.id).catch(() => {});
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
