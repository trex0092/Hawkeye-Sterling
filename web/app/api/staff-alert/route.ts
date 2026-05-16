export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { enforce } from "@/lib/server/enforce";
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
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

const FALLBACK: StaffAlertResult = {
  credibilityScore: 72,
  urgencyLevel: "high",
  verificationSteps: [
    "Pull all transactions processed by the employee in the past 90 days — flag anomalies",
    "Review badge access logs and after-hours system access for the employee",
    "Check whether employee has unreported external business interests (gift/conflict register)",
    "Obtain IT logs for data downloads or printing of customer records",
    "Cross-reference alert with any recent lifestyle changes (car, jewellery) inconsistent with salary",
  ],
  mlroActions: [
    "Convene immediate MLRO/HR/Legal meeting — within 2 hours of receipt",
    "Do NOT confront employee until investigation baseline is established",
    "Preserve all digital evidence — IT forensic hold on employee device and email",
    "Review whether any customers associated with employee require enhanced monitoring",
    "Consider whether STR is required if insider ML/TF facilitation is suspected",
  ],
  hrCoordinationRequired: true,
  regulatoryReportingRequired: true,
  confidentialityProtocol:
    "Alert restricted to MLRO, Managing Director, HR Director, and Legal Counsel only. Do not discuss via email — use encrypted channel. Whistleblower identity must be protected absolutely under UAE Labour Law Art.36 and Whistleblower Protection Decree 2021.",
  regulatoryBasis:
    "UAE FDL 10/2025 Art.21 (internal reporting), CBUAE AML Standards §6.4 (insider risk), UAE Whistleblower Protection Decree 2021, FATF R.18 (internal controls)",
};

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
    const client = getAnthropicClient(apiKey, 55_000);
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
- Alert Source: ${body.alertSource}
- Employee Name: ${body.employeeName}
- Employee Role: ${body.employeeRole}
- Allegation: ${body.allegation}
- Evidence Described: ${body.evidenceDescribed}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "staff-alert temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as StaffAlertResult;
    if (!Array.isArray(parsed.verificationSteps)) parsed.verificationSteps = [];
    if (!Array.isArray(parsed.mlroActions)) parsed.mlroActions = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "staff-alert temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
