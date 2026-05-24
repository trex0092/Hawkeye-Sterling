export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
export interface BoardPackInput {
  pendingApprovals: number;
  slaBreached: number;
  gaps: number;
  gapGrade?: string;
  kpiSnapshot?: Record<string, string | number>;
  meetingDate?: string;
  institutionName?: string;
}

export interface BoardPackResult {
  executiveSummary: string;
  compliancePosture: string;
  pendingItems: Array<{
    item: string;
    priority: "immediate" | "high" | "medium";
    recommendation: string;
  }>;
  regulatoryHorizon: string;
  recommendations: Array<{
    resolution: string;
    owner: string;
    deadline: string;
  }>;
  generatedAt: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: BoardPackInput;
  try {
    body = (await req.json()) as BoardPackInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "oversight/board-pack temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT governance specialist drafting formal board pack materials for a DPMS (Dealer in Precious Metals and Stones) institution regulated under UAE FDL 10/2025 and CBUAE AML Standards. Your output is read directly by board members and the Managing Director — it must be precise, formal, and actionable.

Generate a comprehensive board pack with the following sections:

1. executiveSummary: 2–3 paragraphs. State the overall compliance posture, key numbers, and what the board needs to know immediately. Cite regulatory obligations. No jargon.

2. compliancePosture: Detailed assessment of the current AML/CFT control environment. Reference the four-eyes approval framework, governance committee cadence, and circular disposition status. Grade the posture if data supports it.

3. pendingItems: Array of items requiring board attention. Each has:
   - item: Description of the issue
   - priority: "immediate" | "high" | "medium"
   - recommendation: What the board should direct management to do

4. regulatoryHorizon: Forward-looking paragraph on upcoming regulatory obligations, FATF/CBUAE deadlines, and supervisory risks for the next 12 months.

5. recommendations: Array of specific resolutions the board should pass or note. Each has:
   - resolution: The specific action or resolution
   - owner: Named role responsible
   - deadline: Specific or relative deadline

6. generatedAt: ISO 8601 timestamp (use current time)

Return ONLY valid JSON (no markdown fences) with exactly these keys. Be specific and cite UAE FDL 10/2025, CBUAE AML Standards, and FATF Recommendations where relevant.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Generate a board pack for the following institution and compliance snapshot:

Institution: ${sanitizeField(body.institutionName, 200) || "Hawkeye Sterling DMCC"}
Meeting Date: ${sanitizeField(body.meetingDate, 50) || new Date().toLocaleDateString("en-GB")}

Current Compliance Metrics:
- Pending four-eyes approvals: ${body.pendingApprovals}
- SLA breaches (pending approvals): ${body.slaBreached}
- Regulatory gaps (gap-identified circulars): ${body.gaps}
- Overall governance grade: ${body.gapGrade ?? "Not assessed"}

KPI Snapshot:
${body.kpiSnapshot ? JSON.stringify(body.kpiSnapshot, null, 2) : "No additional KPI data provided."}

Generate a comprehensive, formal board pack suitable for presentation to the Managing Director and Board Risk Committee. Include all required sections.`,
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim(),
    ) as BoardPackResult;
    if (!Array.isArray(result.pendingItems)) result.pendingItems = [];
    if (!Array.isArray(result.recommendations)) result.recommendations = [];
    // Ensure generatedAt is always set
    if (!result.generatedAt) result.generatedAt = new Date().toISOString();
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "oversight/board-pack temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
