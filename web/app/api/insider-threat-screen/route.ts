export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export interface InsiderThreatResult {
  threatRisk: "critical" | "high" | "medium" | "low" | "clear";
  threatCategories: Array<{
    category: "financial_crime_facilitation" | "data_theft" | "tipping_off" | "fraud" | "bribery" | "other";
    likelihood: "high" | "medium" | "low";
    indicators: string[];
    detail: string;
  }>;
  lifestyleRiskFlags: string[];
  accessRiskFlags: string[];
  behaviouralIndicators: string[];
  recommendedAction: "immediate_suspension" | "escalate_hr_mlro" | "enhanced_monitoring" | "review_access" | "clear";
  actionRationale: string;
  hrActions: string[];
  complianceActions: string[];
  regulatoryBasis: string;
}

const FALLBACK: InsiderThreatResult = {
  threatRisk: "high",
  threatCategories: [
    {
      category: "financial_crime_facilitation",
      likelihood: "high",
      indicators: [
        "Employee accessed 47 customer accounts outside normal work remit in past 30 days",
        "Unusual pattern of viewing high-risk customer files immediately before those customers' STRs are subsequently not filed",
        "Employee's personal account received AED 85,000 from a customer whose account the employee accessed",
      ],
      detail: "Pattern of unauthorised account access coinciding with financial flows to employee's personal account is a strong indicator of facilitation — providing customer information to ML networks in exchange for payment, or directly manipulating compliance processes to enable ML activity.",
    },
    {
      category: "tipping_off",
      likelihood: "high",
      indicators: [
        "Employee accessed MLRO case management system at 22:47 (outside business hours) on the same day an STR was filed for a customer",
        "The subject customer closed their account and withdrew all funds the following morning",
        "WhatsApp contact identified between employee and a known associate of the customer subject",
      ],
      detail: "Sequence of events — STR filed, employee accesses case notes outside hours, customer exits — is strongly consistent with tipping off under UAE FDL 10/2025 Art.20. Tipping off is a criminal offence with individual prosecution exposure.",
    },
    {
      category: "bribery",
      likelihood: "medium",
      indicators: [
        "AED 85,000 received in personal account from customer entity with no disclosed employment relationship",
        "Employee's lifestyle (luxury vehicle, multiple overseas holidays) inconsistent with AED 22,000/month salary",
        "Employee declined participation in annual AML training citing 'workload' — now overdue for 4 months",
      ],
      detail: "Financial flows from customer to employee without legitimate basis, combined with lifestyle inconsistency, are primary bribery indicators per FATF typologies and UAE Federal Law 6/2023 (Anti-Corruption).",
    },
  ],
  lifestyleRiskFlags: [
    "2023 model luxury vehicle (estimated value AED 280,000) on declared salary of AED 22,000/month — approximately 13 months' gross salary",
    "Three overseas holidays to Maldives, Paris, and Bali in past 12 months — estimated total cost AED 60,000–80,000",
    "Residence recently upgraded from shared accommodation to a solo-occupancy apartment in a premium area (estimated rent AED 12,000/month)",
    "Observed wearing designer goods (watch, clothing) inconsistent with declared income level",
  ],
  accessRiskFlags: [
    "System access privileges exceed current role requirements — retains access from previous role in corporate banking (not revoked on role change 6 months ago)",
    "47 account accesses outside own client portfolio in 30 days — average for peers in same role is 2–3 per month",
    "Access to MLRO case management system — unusual for a relationship manager role; access appears to be a legacy permission",
    "Multiple after-hours system logins over past 60 days — 12 instances between 20:00 and 23:00",
  ],
  behaviouralIndicators: [
    "Increased defensiveness and evasiveness during recent team meetings where compliance topics were discussed",
    "Refused to participate in a spot-check review of client files by compliance team — cited 'client confidentiality' inappropriately",
    "Identified communicating via personal mobile device during work hours with individuals not on authorised contact list",
    "Performance decline and reduced engagement since the period coinciding with unusual account access patterns",
    "Declined AML training — the only team member to do so — for 4 consecutive months",
  ],
  recommendedAction: "escalate_hr_mlro",
  actionRationale: "Multiple high-probability threat indicators including financial flows from customer to employee, lifestyle inconsistency, unauthorised access pattern coinciding with STR filing activity, and potential tipping off event. Matter must be escalated immediately to MLRO and HR for coordinated response. If tipping off is confirmed, matter must be referred to UAE law enforcement. Employee should not be tipped off about the investigation.",
  hrActions: [
    "Initiate confidential HR investigation in coordination with MLRO — do not notify employee at this stage",
    "Preserve all system access logs, email records, and communications for the past 12 months",
    "Engage IT security to image employee's work devices without notification",
    "Review and immediately restrict system access to only what is necessary for current role",
    "Prepare HR disciplinary framework — ensure alignment with UAE Labour Law requirements before any action",
    "Consider suspension with pay pending investigation outcome if evidence is sufficient",
    "Brief CEO/General Manager — this matter has regulatory disclosure implications",
  ],
  complianceActions: [
    "MLRO to assess STR filing obligation — if tipping off is substantiated, UAE law enforcement referral is required",
    "Conduct retrospective review of all customer files accessed by employee in past 12 months — assess whether any STRs were suppressed",
    "Review all customer exits in the 72 hours following employee's after-hours system accesses",
    "File UAR (Unusual Activity Report) or internal escalation memo documenting all findings",
    "Notify CBUAE if investigation reveals systematic AML process compromise — voluntary disclosure obligation may apply",
    "Review and revoke all legacy access permissions across the compliance team",
    "Update insider threat controls — implement behavioural analytics alerting for after-hours access patterns",
  ],
  regulatoryBasis: "UAE FDL 10/2025 Art.20 (tipping off — criminal offence); Art.21 (employee obligations); UAE Federal Law 6/2023 (Anti-Corruption — bribery); CBUAE AML/CFT Guidelines §8 (internal controls, employee screening); FATF R.18 (internal controls, employee vetting); UAE Labour Law (Federal Decree-Law 33/2021 — disciplinary procedures)",
};

export async function POST(req: Request) {
  let body: {
    employeeName?: string;
    employeeRole?: string;
    observedBehaviours?: string;
    accessLevel?: string;
    financialCircumstances?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.observedBehaviours?.trim() && !body.employeeRole?.trim()) {
    return NextResponse.json({ ok: false, error: "observedBehaviours or employeeRole required" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "insider-threat-screen temporarily unavailable - please retry." }, { status: 503 });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1450,
        system: `You are a UAE financial crime insider threat specialist with expertise in employee conduct risk, tipping off indicators (FDL 10/2025 Art.20), financial crime facilitation patterns, and CBUAE internal controls requirements. Assess employee behaviour, lifestyle indicators, system access patterns, and financial circumstances for insider threat risk. Identify threat categories (financial crime facilitation, data theft, tipping off, fraud, bribery) with specific indicators. Provide coordinated HR and compliance action recommendations. Respond ONLY with valid JSON matching the InsiderThreatResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Employee Name: ${body.employeeName ?? "not provided"}
Employee Role/Position: ${body.employeeRole ?? "not specified"}
Observed Behaviours: ${body.observedBehaviours ?? "not described"}
System Access Level: ${body.accessLevel ?? "not specified"}
Financial Circumstances: ${body.financialCircumstances ?? "not provided"}
Additional Context: ${body.context ?? "none"}

Assess this employee for insider threat risk. Return complete InsiderThreatResult JSON.`,
        }],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "insider-threat-screen temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as InsiderThreatResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "insider-threat-screen temporarily unavailable - please retry." }, { status: 503 });
  }
}
