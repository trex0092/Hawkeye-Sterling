export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface WhistleblowerResult {
  caseUrgency: "critical" | "high" | "medium" | "low";
  allegationCategories: string[];
  protectionMeasures: string[];
  investigationSteps: string[];
  regulatoryReportingRequired: boolean;
  hrEngagementPlan: string;
  timelineRequirements: string;
  regulatoryBasis: string;
}

const FALLBACK: WhistleblowerResult = {
  caseUrgency: "high",
  allegationCategories: [
    "Insider facilitation of ML — employee allegedly tipping off customer before STR filing",
    "Tipping-off violation (FDL Art.30) — potential criminal liability for employee and institution",
    "Potential AML supervisory failure — MLRO may have known of suspicious activity and delayed reporting",
  ],
  protectionMeasures: [
    "Whistleblower identity must be known ONLY to MLRO, MD, and Legal — written non-disclosure commitment from each",
    "No retaliation of any kind — UAE Whistleblower Protection Decree 2021 creates criminal liability for retaliation",
    "Whistleblower to be moved to a different reporting line immediately if they report to the accused",
    "Create secure, encrypted channel for ongoing communication with whistleblower",
    "Document all protection measures taken and timing",
  ],
  investigationSteps: [
    "Appoint independent investigator — not line management of accused employee",
    "Preserve all digital evidence immediately — email, system logs, access records",
    "Interview whistleblower under legal privilege within 24 hours",
    "Review all STR filings and goAML submissions by accused employee for past 24 months",
    "Cross-check customer accounts managed by accused for unusual patterns",
  ],
  regulatoryReportingRequired: true,
  hrEngagementPlan:
    "HR to be engaged within 24 hours for employee suspension decision. Suspension should be precautionary — not disciplinary — pending investigation outcome. Employment counsel to advise on process.",
  timelineRequirements:
    "Preliminary assessment: 48 hours. Investigation report: 20 business days. Regulatory notification (if ML facilitation confirmed): immediate upon confirmation.",
  regulatoryBasis:
    "UAE Whistleblower Protection Decree 2021, UAE FDL 10/2025 Art.21 (internal reporting), CBUAE AML Standards §6.4, UAE Labour Law Art.36",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    allegation: string;
    reportSource: string;
    accusedRole: string;
    evidenceDescribed: string;
    affectedCustomers: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "whistleblower temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in whistleblower case management and internal investigations. Assess whistleblower allegations and generate investigation/protection plans under UAE law. Return valid JSON only matching the WhistleblowerResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess this whistleblower case and generate an action plan.\n\nAllegation: ${sanitizeText(body.allegation)}\nReport Source: ${sanitizeField(body.reportSource)}\nAccused Role: ${sanitizeField(body.accusedRole)}\nEvidence Described: ${sanitizeText(body.evidenceDescribed)}\nAffected Customers: ${sanitizeField(body.affectedCustomers)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: caseUrgency, allegationCategories[], protectionMeasures[], investigationSteps[], regulatoryReportingRequired, hrEngagementPlan, timelineRequirements, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as WhistleblowerResult;
    if (!Array.isArray(result.allegationCategories)) result.allegationCategories = [];
    if (!Array.isArray(result.protectionMeasures)) result.protectionMeasures = [];
    if (!Array.isArray(result.investigationSteps)) result.investigationSteps = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "whistleblower temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
