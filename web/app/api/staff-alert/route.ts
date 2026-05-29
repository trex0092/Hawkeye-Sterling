export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { enforce } from "@/lib/server/enforce";
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
export interface StaffAlertResult {
  credibilityScore: number;
  urgencyLevel: "critical" | "high" | "medium" | "low";
  verificationSteps: string[];
  mlroActions: string[];
  hrCoordinationRequired: boolean;
  regulatoryReportingRequired: boolean;
  confidentialityProtocol: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    alertSource: string;
    employeeName: string;
    employeeRole: string;
    allegation: string;
    evidenceDescribed: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "staff-alert temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in insider threat assessment and staff whistleblower alert handling under UAE FDL 10/2025 Art.21 and CBUAE AML Standards §6.4. Assess staff alerts and whistleblower reports and return a JSON object with exactly these fields: { "credibilityScore": number (0-100), "urgencyLevel": "critical"|"high"|"medium"|"low", "verificationSteps": string[], "mlroActions": string[], "hrCoordinationRequired": boolean, "regulatoryReportingRequired": boolean, "confidentialityProtocol": string, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Assess the following staff alert/whistleblower report:
- Alert Source: ${sanitizeField(body.alertSource, 200)}
- Employee Name: ${sanitizeField(body.employeeName, 200)}
- Employee Role: ${sanitizeField(body.employeeRole, 200)}
- Allegation: ${sanitizeText(body.allegation, 2000)}
- Evidence Described: ${sanitizeText(body.evidenceDescribed, 2000)}
- Additional Context: ${sanitizeText(body.context, 2000)}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "staff-alert temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as StaffAlertResult;
    if (!Array.isArray(parsed.verificationSteps)) parsed.verificationSteps = [];
    if (!Array.isArray(parsed.mlroActions)) parsed.mlroActions = [];
    void writeAuditChainEntry(
      { event: "staff_alert.sent", actor: gate.keyId, meta: { alertType: sanitizeField(body.alertSource, 200), urgencyLevel: parsed.urgencyLevel } },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "staff-alert temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
