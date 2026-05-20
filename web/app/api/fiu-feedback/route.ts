export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { enforce } from "@/lib/server/enforce";
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface FiuFeedbackResult {
  feedbackType:
    | "acknowledgement"
    | "request-for-info"
    | "commendation"
    | "adverse";
  keyPoints: string[];
  requiredActions: string[];
  responseDraft: string;
  deadlineDays: number;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    fiuRef: string;
    feedbackDate: string;
    feedbackContent: string;
    originalStrRef: string;
    context: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "fiu-feedback temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in FIU engagement and STR/goAML feedback handling under UAE FDL 10/2025. Process FIU feedback communications and return a JSON object with exactly these fields: { "feedbackType": "acknowledgement"|"request-for-info"|"commendation"|"adverse", "keyPoints": string[], "requiredActions": string[], "responseDraft": string, "deadlineDays": number, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Process the following FIU feedback communication:
- FIU Reference: ${body.fiuRef}
- Feedback Date: ${body.feedbackDate}
- Feedback Content: ${body.feedbackContent}
- Original STR Reference: ${body.originalStrRef}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "fiu-feedback temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as FiuFeedbackResult;
    if (!Array.isArray(parsed.keyPoints)) parsed.keyPoints = [];
    if (!Array.isArray(parsed.requiredActions)) parsed.requiredActions = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "fiu-feedback temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
