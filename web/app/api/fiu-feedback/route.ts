export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

const FALLBACK: FiuFeedbackResult = {
  feedbackType: "request-for-info",
  keyPoints: [
    "FIU acknowledges receipt of STR filed 15 April 2025 (goAML ref: UAE-STR-2025-044821)",
    "FIU requests supplementary information on 3 specific transaction references",
    "FIU has opened a financial intelligence case — reference provided",
    "STR quality rated 'Good' — narrative and supporting evidence above threshold",
    "FIU notes prior STR filed on same subject in 2023 — requests cross-reference",
  ],
  requiredActions: [
    "Compile full transaction records for refs TXN-2025-001, TXN-2025-002, TXN-2025-003 within 5 business days",
    "Provide any additional adverse media or screening hits relating to subject",
    "Do NOT alert subject to FIU inquiry — tipping-off prohibition applies (FDL Art.30)",
    "Confirm whether subject is still an active customer and current account status",
    "Assign a dedicated FIU liaison point of contact for this case",
  ],
  responseDraft:
    "Ref: [FIU Case No.]\n\nDear Financial Intelligence Unit,\n\nThank you for your feedback letter dated [DATE] regarding STR reference UAE-STR-2025-044821.\n\nIn response to your specific requests:\n\n1. We enclose transaction records for refs TXN-2025-001, TXN-2025-002, TXN-2025-003 as requested.\n2. Additional adverse media findings are enclosed as Annex A.\n3. The subject remains an active customer. Account status: [ACTIVE/RESTRICTED].\n4. Cross-reference to 2023 STR (goAML ref: UAE-STR-2023-018234) is confirmed — same subject.\n\nWe remain available for any further information required. Our designated FIU liaison is [NAME], reachable at [EMAIL].\n\nYours faithfully,\n[MLRO Name]\nMLRO, Hawkeye Sterling DPMS",
  deadlineDays: 5,
  regulatoryBasis:
    "UAE FDL 10/2025 Art.17 (STR obligation), Art.30 (tipping-off prohibition), goAML Technical Guide v3.1, CBUAE FIU Cooperation Framework",
};

export async function POST(req: Request) {
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
      { status: 400 }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "fiu-feedback temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
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
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "fiu-feedback temporarily unavailable - please retry." }, { status: 503 });

    const parsed = JSON.parse(jsonMatch[0]) as FiuFeedbackResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: false, error: "fiu-feedback temporarily unavailable - please retry." }, { status: 503 });
  }
}
