import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Case {
  id: string;
  subject: string;
  meta: string;
  status: string;
  openedAt: string;
}

interface Body {
  cases: Case[];
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      contextBlock: "Case context unavailable — API key not configured",
      caseCount: 0,
      priorityIds: [],
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const cases = body?.cases ?? [];

  if (cases.length === 0) {
    return NextResponse.json({
      ok: true,
      contextBlock: "No open cases.",
      caseCount: 0,
      priorityIds: [],
    });
  }

  const casesSummary = cases
    .map((c) =>
      [
        `Case ID: ${c.id}`,
        `Subject: ${c.subject}`,
        `Meta: ${c.meta}`,
        `Status: ${c.status}`,
        `Opened: ${c.openedAt}`,
      ].join(" | "),
    )
    .join("\n");

  const userContent = `Summarize these ${cases.length} open compliance case(s) for MLRO advisor context injection:\n\n${casesSummary}`;

  let contextBlock: string;
  let priorityIds: string[];

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          'You are summarizing open compliance cases for an MLRO advisor context injection. Create a compact, structured summary (under 200 words) highlighting: total cases, any with critical risk indicators, subjects from high-risk jurisdictions, cases approaching regulatory deadlines, patterns across cases. Format as clean prose, not JSON. This will be injected as context for the MLRO AI advisor. After your prose summary, on a new line output: PRIORITY_IDS: followed by a comma-separated list of case IDs that are highest priority (empty if none).',
        messages: [{ role: "user", content: userContent }],
      });

    const text = res.content[0]?.type === "text" ? res.content[0].text : "";

    // Extract priority IDs line and clean the context block
    const priorityMatch = /PRIORITY_IDS:\s*([^\n]*)/i.exec(text);
    const rawPriorityIds = priorityMatch?.[1]?.trim() ?? "";
    priorityIds = rawPriorityIds
      ? rawPriorityIds.split(",").map((id) => id.trim()).filter((id) => id.length > 0)
      : [];

    contextBlock = text.replace(/PRIORITY_IDS:[^\n]*/i, "").trim();
  } catch {
    contextBlock = `AI case context temporarily unavailable. ${cases.length} case(s) require manual review.`;
    priorityIds = [];
  }

  try {
    writeAuditEvent(
      "mlro",
      "advisor.case-context-injected",
      `${cases.length} case(s) summarized; priority: ${priorityIds.join(", ") || "none"}`,
    );
  } catch { /* non-blocking */ }

  return NextResponse.json({
    ok: true,
    contextBlock,
    caseCount: cases.length,
    priorityIds,
  });
}
