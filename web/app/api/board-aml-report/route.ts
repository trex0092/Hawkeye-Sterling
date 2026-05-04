export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface BoardAmlReportResult {
  executiveSummary: string;
  keyMetrics: Array<{
    metric: string;
    value: string;
    trend: "improving" | "stable" | "deteriorating" | "n/a";
    commentary: string;
  }>;
  mlroUpdate: string;
  regulatoryHighlights: string[];
  openAuditFindings: Array<{
    finding: string;
    severity: "critical" | "high" | "medium" | "low";
    status: "open" | "in_progress" | "closed";
    dueDate: string;
  }>;
  upcomingObligations: string[];
  boardRecommendations: string[];
  attestationStatement: string;
  regulatoryBasis: string;
}

const FALLBACK: BoardAmlReportResult = {
  executiveSummary: "RESTRICTED — AML/CFT Board Report Q1 2026\n\nThis report is submitted to the Board of Directors pursuant to UAE FDL 10/2025 Art.5(2) and CBUAE AML/CFT Guidelines §3.2 (quarterly Board reporting obligation). During Q1 2026, the institution filed 8 STRs and 124 CTRs via the goAML portal, achieving 100% timely filing compliance. Training completion stands at 87%, below the 100% target, with 3 outstanding staff identified for completion by 30 April 2026. Two audit findings remain open (1 high, 1 medium). The overall AML/CFT risk posture is assessed as ADEQUATE with improving trajectory.",
  keyMetrics: [
    {
      metric: "STR Filing Count (Q1 2026)",
      value: "8 STRs filed",
      trend: "stable",
      commentary: "8 STRs filed in Q1 2026 vs 7 in Q4 2025. All filed within 2 business days of MLRO determination. No goAML rejections. Year-to-date total: 8. MLRO assessed 22 internal SARs of which 8 met the threshold for external STR filing.",
    },
    {
      metric: "CTR Filing Count (Q1 2026)",
      value: "124 CTRs filed",
      trend: "improving",
      commentary: "124 CTRs filed covering all cash transactions ≥AED 55,000. 100% same-day filing compliance achieved for the first time. Q4 2025 had 2 late filings — remediation actions (automated trigger in core banking) are effective.",
    },
    {
      metric: "AML Training Completion",
      value: "87% (43/50 staff)",
      trend: "improving",
      commentary: "87% completion vs 72% in Q4 2025. 7 staff still outstanding — 3 are in annual leave/medical leave (excused), 4 are active remediation targets. All 4 active cases must complete by 30 April 2026. Board to note: 100% completion is a legal requirement under FDL 10/2025 Art.20.",
    },
    {
      metric: "TM Alert Volume and Disposition",
      value: "312 alerts generated; 28 escalated to MLRO",
      trend: "improving",
      commentary: "Post-calibration Q1 2026 shows false positive rate of 91% (vs 94% pre-calibration Q4 2025). Target is 70-80%. Further calibration review scheduled Q2. 28 escalated to MLRO; 8 resulted in STR. Average alert-to-close time: 3.2 days (SLA: 5 days).",
    },
    {
      metric: "CDD Refresh Compliance",
      value: "94.2% current",
      trend: "improving",
      commentary: "94.2% of customer files have current KYC documentation (vs 88.1% Q4 2025). 18 high-risk files remain overdue — all are under active remediation with customer correspondence issued. 3 relationships are being reviewed for exit if documentation is not provided by May 2026.",
    },
    {
      metric: "Sanctions Screening Uptime",
      value: "99.7% system availability",
      trend: "stable",
      commentary: "Screening system achieved 99.7% uptime in Q1 2026. One 45-minute outage on 14 February 2026 — manual screening procedures were activated per the contingency plan. Transactions processed during the outage were retrospectively screened on system restoration. EOCN list updates: daily (compliant).",
    },
  ],
  mlroUpdate: "The MLRO reports the following key developments in Q1 2026: (1) CBUAE thematic review on trade finance AML controls was issued in February 2026 — gap assessment completed; no material findings for this institution. (2) Two new ML typologies identified from NAMLCFTC March 2026 update (crypto-enabled layering and real estate off-plan structuring) — TM rules update in progress. (3) One internal employee conduct matter escalated to HR and MLRO in March 2026 — investigation ongoing; no regulatory notification required at this stage. (4) The institution's annual AML audit by external auditors is scheduled for May 2026. (5) goAML system was updated to Version 3.2 on 1 March 2026 — staff re-training completed.",
  regulatoryHighlights: [
    "UAE FDL 10/2025 implementation — all new CDD provisions effective 1 January 2026; institution's updated CDD Policy was Board-approved on 15 December 2025 and is operational",
    "FATF Plenary (February 2026): Pakistan removed from grey-list; no change to UAE's own FATF status (non-grey-list)",
    "CBUAE Circular C/2026/02 (January 2026): Enhanced CTR reporting requirements for MSBs — not directly applicable to this institution but cross-border correspondent banking implications noted",
    "UAE Cabinet Decision updating EOCN list (March 2026): 12 new designations added; screening system updated same day",
    "NAMLCFTC National Risk Assessment update (March 2026): Real estate and gold/precious metals sectors re-rated to 'very high' inherent risk — EWRA amendment required",
  ],
  openAuditFindings: [
    {
      finding: "Transaction monitoring calibration — alert threshold miscalibration identified in Q4 2025 external audit; false positive rate above industry benchmark",
      severity: "high",
      status: "in_progress",
      dueDate: "2026-06-30",
    },
    {
      finding: "PEP file review — 2 PEP customer files missing updated senior management annual re-approval sign-off (approvals expired December 2025)",
      severity: "medium",
      status: "in_progress",
      dueDate: "2026-04-30",
    },
  ],
  upcomingObligations: [
    "Annual AML Training — all staff must complete by 31 December 2026; current completion 87%; 4 outstanding staff must complete by 30 April 2026",
    "Annual External AML Audit — scheduled May 2026; audit firm engaged; pre-audit self-assessment to be completed by 30 April 2026",
    "EWRA Annual Review — due by 30 June 2026; Board approval required; NAMLCFTC update may require revision of risk ratings",
    "goAML Registration Renewal — due 1 July 2026; MLRO to confirm renewal process initiated by 1 June 2026",
    "CBUAE Prudential Return (AML Section) — due 31 July 2026; data compilation to begin May 2026",
    "Board Risk Appetite Statement Annual Review — due Q3 2026 in conjunction with EWRA",
  ],
  boardRecommendations: [
    "Board to note the open training compliance gap (87%) and mandate MLRO to report completion at next Board meeting",
    "Board to approve MLRO's recommendation to increase TM calibration review frequency from annual to semi-annual",
    "Board to note NAMLCFTC risk assessment update and direct MLRO to revise EWRA by 30 June 2026",
    "Board to approve additional budget for enhanced TM calibration consultant engagement in Q2 2026",
    "Board to review and sign annual acknowledgement of AML responsibilities per FDL 10/2025 Art.5(2)",
  ],
  attestationStatement: "The MLRO confirms that, to the best of their knowledge, the institution's AML/CFT programme is operating in material compliance with UAE FDL 10/2025 and CBUAE AML/CFT Guidelines as at the date of this report. The two open audit findings are subject to active remediation and are expected to be resolved within the timelines stated above. The MLRO confirms that all STR and CTR filing obligations were met during the reporting period.\n\nMLRO Signature: ___________________ Date: ___________\nBoard Chairman Acknowledgement: ___________________ Date: ___________",
  regulatoryBasis: "UAE FDL 10/2025 Art.5(2) (Board accountability); Art.17 (STR/CTR obligations); Art.20 (training); CBUAE AML/CFT Guidelines §3.2 (quarterly Board reporting); FATF R.18 (internal controls and compliance management)",
};

export async function POST(req: Request) {
  let body: {
    institutionName?: string;
    reportingPeriod?: string;
    strCount?: string;
    ctrCount?: string;
    trainingCompletion?: string;
    openFindings?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.reportingPeriod?.trim() && !body.institutionName?.trim()) {
    return NextResponse.json({ ok: false, error: "reportingPeriod or institutionName required" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "board-aml-report temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE AML governance specialist with expertise in Board-level MIS reporting, CBUAE quarterly reporting requirements, and AML programme performance metrics. Generate comprehensive quarterly Board AML/CFT reports including executive summaries, KPI commentary, MLRO updates, regulatory highlights, open findings, upcoming obligations, and board recommendations. Reports must comply with UAE FDL 10/2025 Art.5(2) Board accountability requirements and CBUAE AML/CFT Guidelines quarterly reporting expectations. Use professional, regulator-facing language. Respond ONLY with valid JSON matching the BoardAmlReportResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Institution Name: ${body.institutionName ?? "not specified"}
Reporting Period: ${body.reportingPeriod ?? "current quarter"}
STR Count: ${body.strCount ?? "not provided"}
CTR Count: ${body.ctrCount ?? "not provided"}
Training Completion: ${body.trainingCompletion ?? "not provided"}
Open Audit Findings: ${body.openFindings ?? "not provided"}
Additional Context: ${body.context ?? "none"}

Generate a comprehensive quarterly Board AML/CFT report. Return complete BoardAmlReportResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as BoardAmlReportResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "board-aml-report temporarily unavailable - please retry." }, { status: 503 });
  }
}
