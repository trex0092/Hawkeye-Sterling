export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export interface AmlKpiDashboardResult {
  overallHealth: "excellent" | "good" | "needs-attention" | "critical";
  healthScore: number;
  kpis: Array<{
    name: string;
    value: string;
    target: string;
    status: "green" | "amber" | "red";
    trend: "improving" | "stable" | "deteriorating";
  }>;
  topRisks: string[];
  recommendations: string[];
  regulatoryBasis: string;
}

const FALLBACK: AmlKpiDashboardResult = {
  overallHealth: "good",
  healthScore: 77,
  kpis: [
    {
      name: "STR Filing Rate",
      value: "14 STRs / year",
      target: ">0 (quality over quantity)",
      status: "green",
      trend: "stable",
    },
    {
      name: "False Positive Rate",
      value: "0.8%",
      target: "≤1%",
      status: "green",
      trend: "improving",
    },
    {
      name: "CDD Completion Rate",
      value: "94%",
      target: "100%",
      status: "amber",
      trend: "stable",
    },
    {
      name: "Training Completion",
      value: "86%",
      target: "100%",
      status: "amber",
      trend: "improving",
    },
    {
      name: "SLA Compliance (Approvals)",
      value: "78%",
      target: "≥95%",
      status: "red",
      trend: "deteriorating",
    },
    {
      name: "Sanctions Screening Latency",
      value: "< 2min",
      target: "< 5min",
      status: "green",
      trend: "improving",
    },
    {
      name: "Open Action Items",
      value: "3 open",
      target: "0 overdue",
      status: "amber",
      trend: "stable",
    },
    {
      name: "Audit Finding Closure Rate",
      value: "67%",
      target: "100% within 90 days",
      status: "amber",
      trend: "stable",
    },
  ],
  topRisks: [
    "SLA compliance at 78% — three approvals breached 24-hour SLA in past 30 days",
    "Training gap: 14% staff have overdue modules including 2 high-risk role staff",
    "Audit finding closure: 2 findings from Q1 audit remain open beyond 90-day target",
  ],
  recommendations: [
    "Implement automated SLA alerts at 18 hours (6 hours before breach) to responsible reviewers",
    "Launch mandatory training blitz for 14% overdue staff — target 100% by end of May",
    "Assign dedicated owner to 2 open audit findings with weekly progress check-in",
  ],
  regulatoryBasis:
    "FATF R.26-28 (effectiveness), UAE FDL 10/2025 Art.20 (governance), CBUAE AML Standards §8 (audit), FATF Immediate Outcome 6 (financial intelligence)",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    institutionType: string;
    strCount: string;
    falsePositiveRate: string;
    trainingCompletion: string;
    openFindings: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "aml-kpi-dashboard temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in AML programme KPI measurement and dashboard reporting. Assess AML programme health and generate KPI dashboards under UAE FDL and FATF effectiveness standards. Return valid JSON only matching the AmlKpiDashboardResult interface.",
        messages: [
          {
            role: "user",
            content: `Generate an AML KPI dashboard assessment.\n\nInstitution Type: ${body.institutionType}\nSTR Count: ${body.strCount}\nFalse Positive Rate: ${body.falsePositiveRate}\nTraining Completion: ${body.trainingCompletion}\nOpen Findings: ${body.openFindings}\nContext: ${body.context}\n\nReturn JSON with fields: overallHealth, healthScore (0-100), kpis[] (each with name, value, target, status, trend), topRisks[], recommendations[], regulatoryBasis.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "aml-kpi-dashboard temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as AmlKpiDashboardResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "aml-kpi-dashboard temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
