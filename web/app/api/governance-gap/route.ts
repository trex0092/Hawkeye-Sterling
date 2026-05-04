export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface GapFinding {
  area: string;
  finding: string;
  severity: "critical" | "high" | "medium" | "low";
  regulatoryRef: string;
}

export interface GapRecommendation {
  priority: "immediate" | "short-term" | "medium-term";
  action: string;
  owner: string;
  deadline: string;
}

export interface RegulatoryRisk {
  risk: string;
  likelihood: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigant: string;
}

export interface GovernanceGapResult {
  ok: true;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  gradeRationale: string;
  criticalGaps: string[];
  findings: GapFinding[];
  recommendations: GapRecommendation[];
  regulatoryRisks: RegulatoryRisk[];
  summary: string;
}

const FALLBACK: GovernanceGapResult = {
  ok: true,
  overallGrade: "B",
  gradeRationale:
    "The governance framework demonstrates adequate four-eyes approval controls and a functioning board committee meeting cadence. However, three open action items from Q2 committee are approaching overdue, one regulatory circular has an identified gap (EOCN declaration), and the LBMA RGG Step-4 audit has not yet commenced. These reduce the grade from A to B.",
  criticalGaps: [
    "EOCN Annual Mineral Supply-Chain Declaration not filed — deadline breached 31/03/2025. Potential regulatory sanction exposure.",
    "3 open action items from Q2 AML/CFT Governance Committee without confirmed closure, including CDD refresh overdue for 3 high-risk customers.",
    "LBMA Step-4 auditor not yet commissioned despite 30 Apr 2025 target deadline.",
  ],
  findings: [
    {
      area: "Regulatory Circular Disposition",
      finding:
        "EOCN Dec-2024 circular disposition is 'gap-identified' and the filing deadline of 31/03/2025 has passed without completion. This is a direct compliance breach.",
      severity: "critical",
      regulatoryRef: "EOCN 2024; UAE Cabinet Decision on DNFBP reporting",
    },
    {
      area: "Four-Eyes Approval — SLA",
      finding:
        "APV-2025-0081 (diplomatic account cash exemption) has elapsed 36h against a 24h SLA and is in 'escalated' status without confirmed second sign-off. SLA breach increases regulatory exposure.",
      severity: "high",
      regulatoryRef: "UAE FDL 10/2025 Art.20; CBUAE AML Standards §6.4",
    },
    {
      area: "Action Item Closure",
      finding:
        "3 of 7 action items from Q2 committee remain open, including the critical high-risk CDD refresh (AI-002, due 30/04/2025) and the Q1 AML report submission to MoE (AI-003, due 15/05/2025).",
      severity: "high",
      regulatoryRef: "CBUAE AML Standards §6.2 (governance accountability)",
    },
    {
      area: "LBMA RGG Compliance",
      finding:
        "LBMA RGG v9 Step-4 audit commissioning was due by 30 April 2025 per AI-001. Although AI-001 is marked closed, the LBMA circular remains 'in-progress'. Auditor engagement letter should be on file.",
      severity: "medium",
      regulatoryRef: "LBMA Responsible Gold Guidance v9 §4.3",
    },
    {
      area: "Staff Training Gap",
      finding:
        "Q2 committee noted 6% training gap (AI-004). Training is a legal requirement under FDL 10/2025 Art.20. Although a remediation action exists, the due date of 31/05/2025 is approaching.",
      severity: "medium",
      regulatoryRef: "UAE FDL 10/2025 Art.20; CBUAE AML Standards §7",
    },
    {
      area: "Board Approval Coverage",
      finding:
        "Two approvals remain in 'pending' status (APV-2025-0089, APV-2025-0088). APV-2025-0088 has first sign-off but awaits MD second sign-off. Prolonged pending status for STR filings is a regulatory concern.",
      severity: "medium",
      regulatoryRef: "UAE FDL 10/2025 Art.9 (STR filing timeline — 35 days from suspicion)",
    },
    {
      area: "Governance Committee Frequency",
      finding:
        "Two meetings documented (Q1 and Q2 2025). Quarterly cadence is recommended under CBUAE AML Standards §6. Q3 and Q4 meetings should be pre-scheduled.",
      severity: "low",
      regulatoryRef: "CBUAE AML Standards §6.1",
    },
  ],
  recommendations: [
    {
      priority: "immediate",
      action:
        "File EOCN Annual Mineral Supply-Chain Declaration immediately and notify MLRO of the breach. Document root cause. Consider voluntary disclosure to EOCN.",
      owner: "T. Ibrahim / MLRO",
      deadline: "Within 5 business days",
    },
    {
      priority: "immediate",
      action:
        "Close AI-002: Complete the 3 overdue high-risk CDD refreshes. If customers are unresponsive, initiate exit procedures and document rationale.",
      owner: "N. Patel",
      deadline: "30/04/2025",
    },
    {
      priority: "short-term",
      action:
        "Obtain and file LBMA Step-4 auditor engagement letter. Confirm audit date and scope in writing.",
      owner: "S. Okafor",
      deadline: "15/05/2025",
    },
    {
      priority: "short-term",
      action:
        "Submit Q1 AML report to MoE (AI-003). Confirm submission receipt and retain acknowledgement.",
      owner: "H. Al-Mansoori",
      deadline: "15/05/2025",
    },
    {
      priority: "short-term",
      action:
        "Second sign-off on APV-2025-0088 (EDD waiver). Managing Director to review and approve or reject within 24 hours.",
      owner: "Managing Director",
      deadline: "Immediate",
    },
    {
      priority: "medium-term",
      action:
        "Pre-schedule Q3 and Q4 2025 Governance Committee meetings. Distribute calendar invites to all standing attendees.",
      owner: "Luisa Fernanda (Compliance Officer)",
      deadline: "31/05/2025",
    },
    {
      priority: "medium-term",
      action:
        "Complete remaining 6% staff AML training (AI-004). Use e-learning records as evidence. Report completion to MLRO.",
      owner: "Training Coordinator",
      deadline: "31/05/2025",
    },
  ],
  regulatoryRisks: [
    {
      risk: "EOCN regulatory sanction for late filing of annual mineral supply-chain declaration",
      likelihood: "high",
      impact: "high",
      mitigant:
        "File immediately; consider proactive voluntary disclosure to EOCN with an explanation of delay and remediation plan.",
    },
    {
      risk: "CBUAE regulatory finding during thematic or onsite review — open action items and SLA breaches may be cited",
      likelihood: "medium",
      impact: "high",
      mitigant:
        "Close all overdue action items before end of month. Strengthen SLA monitoring — introduce automated escalation alerts.",
    },
    {
      risk: "LBMA Good Delivery status — Step-4 audit delay may affect certification renewal",
      likelihood: "medium",
      impact: "high",
      mitigant: "Commission auditor immediately. LBMA requires Step-4 audit within defined periods; delay risks suspension.",
    },
    {
      risk: "STR filing delay risk — APV-2025-0089 pending without first sign-off; FDL 10/2025 requires STR filing within 35 days of suspicion",
      likelihood: "medium",
      impact: "high",
      mitigant:
        "First reviewer (Luisa Fernanda) to review and sign APV-2025-0089 today. Clock is running from analyst's initial suspicion date.",
    },
    {
      risk: "Staff training non-compliance — FDL 10/2025 Art.20 makes 100% annual training completion a legal requirement",
      likelihood: "low",
      impact: "medium",
      mitigant:
        "Enforce mandatory completion. Consider disciplinary note for non-completing staff. Automate training completion tracking.",
    },
  ],
  summary:
    "The governance framework is broadly functional with adequate four-eyes controls and documented board committee minutes. However, three issues require immediate action: the EOCN declaration breach, overdue CDD refreshes for high-risk customers, and the pending STR approval (APV-2025-0089). The LBMA Step-4 audit timeline is tight. Addressing these gaps will move the overall grade from B to A. The action tracker should be reviewed weekly by the Compliance Officer.",
};

export async function POST(req: Request) {
  let body: {
    approvals?: unknown[];
    minutes?: unknown[];
    circulars?: unknown[];
    institutionName?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "governance-gap temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: `You are a UAE AML governance expert specialising in CBUAE AML Standards, UAE FDL 10/2025, LBMA RGG, and FATF Recommendations. Analyse governance data (approvals, meeting minutes, regulatory circulars) and produce a comprehensive gap analysis. Identify critical gaps, assign severity ratings, and provide prioritised recommendations. Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "overallGrade": "A"|"B"|"C"|"D"|"F",
  "gradeRationale": "string",
  "criticalGaps": ["string"],
  "findings": [{"area":"string","finding":"string","severity":"critical"|"high"|"medium"|"low","regulatoryRef":"string"}],
  "recommendations": [{"priority":"immediate"|"short-term"|"medium-term","action":"string","owner":"string","deadline":"string"}],
  "regulatoryRisks": [{"risk":"string","likelihood":"high"|"medium"|"low","impact":"high"|"medium"|"low","mitigant":"string"}],
  "summary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Institution: ${body.institutionName ?? "Hawkeye Sterling"}
Approvals: ${JSON.stringify(body.approvals ?? [], null, 2)}
Meeting Minutes: ${JSON.stringify(body.minutes ?? [], null, 2)}
Regulatory Circulars: ${JSON.stringify(body.circulars ?? [], null, 2)}

Perform a comprehensive AML governance gap analysis. Identify all gaps, risks, and remediation actions.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as GovernanceGapResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "governance-gap temporarily unavailable - please retry." }, { status: 503 });
  }
}
