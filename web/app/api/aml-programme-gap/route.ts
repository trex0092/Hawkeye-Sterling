export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface AmlProgrammeGapResult {
  overallMaturity: "advanced" | "adequate" | "developing" | "inadequate";
  cbuaeReadinessScore: number;
  gaps: Array<{
    pillar: string;
    gap: string;
    severity: "critical" | "high" | "medium" | "low";
    legalBasis: string;
    remediationAction: string;
    timeline: string;
  }>;
  strengths: string[];
  criticalFindings: string[];
  priorityRemediation: string[];
  inspectionRiskRating: "high" | "medium" | "low";
  nextSteps: string[];
  regulatoryBasis: string;
}

const FALLBACK: AmlProgrammeGapResult = {
  overallMaturity: "developing",
  cbuaeReadinessScore: 52,
  gaps: [
    {
      pillar: "Enterprise-Wide Risk Assessment (EWRA)",
      gap: "No documented EWRA has been conducted or approved by the Board within the past 12 months. Current risk assessment is an informal spreadsheet last updated 2022 with no Board sign-off.",
      severity: "critical",
      legalBasis: "UAE FDL 10/2025 Art.5; CBUAE AML/CFT Guidelines §3; FATF R.1",
      remediationAction: "Conduct formal EWRA covering all four risk dimensions (customer, product/service, geographic, channel), obtain Board approval, and establish annual review cycle with documented methodology.",
      timeline: "30 days — critical regulatory finding",
    },
    {
      pillar: "AML Training",
      gap: "Training completion rate is 61% — 39% of staff (including two frontline relationship managers and one compliance officer) have not completed mandatory annual AML/CFT training. No role-specific training for high-risk functions.",
      severity: "high",
      legalBasis: "UAE FDL 10/2025 Art.20; CBUAE AML Training Requirements",
      remediationAction: "Complete outstanding training for all staff within 30 days; implement role-specific training curriculum for relationship managers, compliance team, and senior management; implement tracking dashboard.",
      timeline: "30 days for completion; 60 days for enhanced curriculum",
    },
    {
      pillar: "Transaction Monitoring",
      gap: "TM system scenarios have not been calibrated or tuned in 18 months. Alert-to-investigation rate is 94% (expected 15-30% for well-tuned systems) indicating severe threshold miscalibration. No documented calibration methodology.",
      severity: "high",
      legalBasis: "UAE FDL 10/2025 Art.16; CBUAE AML/CFT Guidelines §7",
      remediationAction: "Commission independent TM calibration review; document methodology for threshold-setting; reduce false positive rate to target range; implement quarterly calibration review cycle.",
      timeline: "60 days for calibration; 90 days for full documentation",
    },
    {
      pillar: "CDD/KYC Refresh",
      gap: "Customer file review shows 28% of high-risk customers have expired KYC documentation (passports/IDs expired). No periodic refresh cycle implemented for medium/high-risk customers.",
      severity: "high",
      legalBasis: "UAE FDL 10/2025 Art.11; Art.15 (ongoing monitoring); FATF R.10",
      remediationAction: "Implement tiered CDD refresh schedule: high-risk annually, medium-risk every 3 years, low-risk every 5 years. Expedite refresh of 28% high-risk expired files within 60 days.",
      timeline: "60 days for expired high-risk files; 90 days for programme implementation",
    },
    {
      pillar: "STR/CTR Reporting Quality",
      gap: "Review of last 10 STRs filed via goAML shows 4 with incomplete narrative sections — missing transaction descriptions or insufficient grounds for suspicion. Two STRs filed beyond 2-business-day deadline.",
      severity: "high",
      legalBasis: "UAE FDL 10/2025 Art.17; goAML Reporting Standards; CBUAE STR Guidance",
      remediationAction: "Implement STR quality checklist; re-train MLRO and deputies on goAML narrative standards; implement STR deadline tracking log; consider post-submission quality review process.",
      timeline: "30 days",
    },
    {
      pillar: "Sanctions Screening",
      gap: "Sanctions list update frequency is weekly — UAE EOCN requirement is same-day screening against updated lists. No documented process for managing hits or false positives.",
      severity: "medium",
      legalBasis: "UAE FDL 10/2025 Art.23; Cabinet Decision 74/2020 (TF); UNSCR 1267",
      remediationAction: "Upgrade screening system to real-time or daily EOCN list updates; document hit management and false positive disposition process; implement escalation procedure for confirmed matches.",
      timeline: "45 days",
    },
  ],
  strengths: [
    "Dedicated MLRO appointed with appropriate seniority and direct Board access",
    "goAML registration current and filing credentials active",
    "Customer risk rating framework documented and applied consistently",
    "Sanctions screening system operational with EOCN, OFAC, and UN lists loaded",
    "AML policy document exists and was approved by Board (albeit 2 years ago)",
  ],
  criticalFindings: [
    "No Board-approved EWRA — this is the #1 CBUAE inspection finding and will result in adverse inspection rating if not remediated",
    "Training completion below minimum acceptable threshold (61% vs 100% required)",
    "TM alert rate of 94% indicates programme is effectively non-functional for detecting genuine ML",
  ],
  priorityRemediation: [
    "1. EWRA — complete within 30 days; Board approval required",
    "2. Training completion — all outstanding staff to complete within 30 days",
    "3. TM calibration — commission review within 30 days; implement changes within 90 days",
    "4. High-risk KYC refresh — expedite 28% expired files within 60 days",
    "5. STR quality — implement checklist and re-training within 30 days",
  ],
  inspectionRiskRating: "high",
  nextSteps: [
    "Brief Board and senior management on gap findings and remediation plan",
    "Assign ownership and deadlines for each gap item with weekly progress reporting to MLRO",
    "Engage external AML consultant to support EWRA development if internal resources insufficient",
    "Consider voluntary disclosure to CBUAE if inspection is imminent — demonstrates good faith",
    "Schedule 90-day re-assessment to verify remediation progress",
  ],
  regulatoryBasis: "UAE FDL 10/2025 (Arts. 5, 11, 15, 16, 17, 20, 23); CBUAE AML/CFT Guidelines 2021; FATF R.1 (RBA), R.10 (CDD), R.18 (internal controls), R.29 (FIU); CBUAE AML Inspection Methodology",
};

export async function POST(req: Request) {
  let body: {
    institutionType: string;
    programmeDescription?: string;
    currentControls?: string;
    lastAuditDate?: string;
    staffCount?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.institutionType?.trim()) return NextResponse.json({ ok: false, error: "institutionType required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "aml-programme-gap temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a CBUAE AML inspection specialist with deep knowledge of UAE FDL 10/2025 AML/CFT programme requirements, CBUAE inspection methodology, and common regulatory findings. Assess AML programme descriptions for gaps across the key pillars: EWRA, governance, CDD/KYC, transaction monitoring, STR/CTR reporting, training, sanctions screening, and record-keeping. Score programmes against CBUAE readiness criteria (0-100). Identify critical, high, medium and low gaps with specific legal basis and remediation timelines. Respond ONLY with valid JSON matching the AmlProgrammeGapResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Institution Type: ${body.institutionType}
AML Programme Description: ${body.programmeDescription ?? "not provided"}
Current Controls in Place: ${body.currentControls ?? "not described"}
Last Audit/Review Date: ${body.lastAuditDate ?? "unknown"}
Staff Count: ${body.staffCount ?? "not provided"}
Additional Context: ${body.context ?? "none"}

Conduct a comprehensive AML programme gap analysis. Return complete AmlProgrammeGapResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as AmlProgrammeGapResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "aml-programme-gap temporarily unavailable - please retry." }, { status: 503 });
  }
}
