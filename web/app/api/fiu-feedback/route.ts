export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { enforce } from "@/lib/server/enforce";
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
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
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in FIU engagement and STR/goAML feedback handling under UAE Federal Decree-Law No. 10 of 2025. Process FIU feedback communications and return a JSON object with exactly these fields: { "feedbackType": "acknowledgement"|"request-for-info"|"commendation"|"adverse", "keyPoints": string[], "requiredActions": string[], "responseDraft": string, "deadlineDays": number, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Process the following FIU feedback communication:
- FIU Reference: ${sanitizeField(body.fiuRef, 100)}
- Feedback Date: ${sanitizeField(body.feedbackDate, 50)}
- Feedback Content: ${sanitizeText(body.feedbackContent, 3000)}
- Original STR Reference: ${sanitizeField(body.originalStrRef, 100)}
- Additional Context: ${sanitizeText(body.context, 2000)}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "fiu-feedback temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as FiuFeedbackResult;
    if (!Array.isArray(parsed.keyPoints)) parsed.keyPoints = [];
    if (!Array.isArray(parsed.requiredActions)) parsed.requiredActions = [];
    void writeAuditChainEntry(
      { event: "fiu_feedback.submitted", actor: gate.keyId, meta: { fiuRef: body.fiuRef, originalStrRef: body.originalStrRef } },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "fiu-feedback temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
