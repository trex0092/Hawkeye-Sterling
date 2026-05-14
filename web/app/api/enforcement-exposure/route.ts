export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface EnforcementExposureResult {
  violationCategory: string;
  penaltyRange: {
    min: string;
    max: string;
    currency: string;
  };
  likelyPenalty: string;
  mitigatingFactors: string[];
  aggravatingFactors: string[];
  precedentCases: Array<{
    jurisdiction: string;
    description: string;
    penalty: string;
    year: string;
  }>;
  criminalExposure: boolean;
  criminalBasis?: string;
  mlroPersonalLiability: boolean;
  mlroLiabilityBasis?: string;
  selfReportingBenefit: string;
  remedialActions: string[];
  regulatoryBasis: string;
}

const FALLBACK: EnforcementExposureResult = {
  violationCategory: "Failure to file Cash Transaction Reports (CTRs) — systematic non-filing over 6-month period",
  penaltyRange: {
    min: "100,000",
    max: "1,000,000",
    currency: "AED",
  },
  likelyPenalty: "AED 350,000–600,000 for systematic CTR non-filing over 6 months, absent significant mitigating factors. If CBUAE determines the non-filing was deliberate or part of a pattern of non-compliance, the penalty could reach the maximum. The MLRO may face personal administrative penalty of AED 50,000–200,000 and potential disqualification from the MLRO role.",
  mitigatingFactors: [
    "Voluntary self-disclosure to CBUAE before inspection — typically reduces penalty by 20-40% under CBUAE enforcement guidelines",
    "No prior enforcement history — first-time violation reduces aggravation",
    "Immediate remedial action upon discovery — demonstrates compliance culture",
    "Systemic failure attributable to technical system error rather than deliberate non-compliance — reduces culpability assessment",
    "Cooperation with CBUAE investigation — full document production without legal challenge",
    "Retrospective CTR filing for all missed transactions — demonstrates no attempt to conceal",
  ],
  aggravatingFactors: [
    "Systematic non-filing over extended period (6 months) — suggests inadequate oversight and monitoring",
    "High volume of missed CTRs — each filing is a separate violation, creating aggregated exposure",
    "Senior management awareness not demonstrated — absence of evidence that the issue was escalated",
    "No documented contingency procedure for system failures — indicates programme gap",
    "CTR non-filing may have impaired UAE FIU's ability to conduct financial intelligence analysis",
  ],
  precedentCases: [
    {
      jurisdiction: "UAE (CBUAE)",
      description: "UAE bank — systematic failure to file CTRs for cash transactions above threshold over 8-month period due to core banking system misconfiguration",
      penalty: "AED 450,000 institutional penalty + AED 75,000 personal penalty on MLRO",
      year: "2023",
    },
    {
      jurisdiction: "UAE (CBUAE)",
      description: "Exchange house — failure to file STRs for 12 suspicious transactions identified by TM system but not escalated to MLRO",
      penalty: "AED 800,000 + MLRO disqualification for 2 years",
      year: "2022",
    },
    {
      jurisdiction: "UK (FCA)",
      description: "Bank — systemic failures in transaction monitoring and STR filing, including failure to file for known high-risk customers",
      penalty: "GBP 7,671,800",
      year: "2023",
    },
    {
      jurisdiction: "US (FinCEN)",
      description: "Exchange company — wilful failure to file CTRs and SARs over multi-year period",
      penalty: "USD 29,000,000 + deferred prosecution agreement",
      year: "2022",
    },
  ],
  criminalExposure: true,
  criminalBasis: "UAE FDL 10/2025 Art.27 — criminal penalties apply where the violation is wilful or reckless. If CBUAE determines CTR non-filing was deliberate (e.g., to assist customers in avoiding detection), criminal prosecution under Art.27 could result in imprisonment of 1-10 years and/or fines of AED 100,000–5,000,000. Individual directors and officers may be personally prosecuted under Art.28 if they authorised or permitted the violation.",
  mlroPersonalLiability: true,
  mlroLiabilityBasis: "UAE FDL 10/2025 Art.21 — the MLRO bears personal responsibility for ensuring all required CTR and STR filings are made accurately and timely. Personal penalties applicable: administrative fines of AED 50,000–200,000; disqualification from MLRO role; prohibition from working in regulated financial sector for up to 10 years in serious cases. MLRO may have a defence if the failure was attributable entirely to a technical system error and the MLRO took reasonable steps to implement a compliant system — legal advice recommended.",
  selfReportingBenefit: "Voluntary self-disclosure to CBUAE before any inspection announcement or regulator-initiated inquiry typically results in: (1) penalty reduction of 20-40% under CBUAE's published enforcement framework; (2) reduced likelihood of criminal referral; (3) MLRO personal penalty may be reduced or waived where disclosure is proactive and the MLRO demonstrates personal accountability. Self-disclosure must be accompanied by a detailed breach report, remedial action plan, and retrospective filing of all missed CTRs. Legal counsel should be engaged before self-disclosure to ensure the disclosure is structured appropriately.",
  remedialActions: [
    "Immediately file all missed CTRs retrospectively via goAML — include explanatory note on each filing",
    "Commission an independent review of CTR filing process and system configuration",
    "Implement automated CTR trigger with dual-verification (system + manual confirmation) to prevent recurrence",
    "Brief MLRO and Board on exposure — obtain Board mandate for immediate CBUAE disclosure",
    "Engage external UAE AML counsel to structure self-disclosure and manage CBUAE interaction",
    "Prepare and submit self-disclosure report to CBUAE including: breach scope, root cause analysis, remedial actions, timeline",
    "Implement enhanced CTR compliance monitoring — daily reconciliation of cash transactions vs CTR filings",
    "Review and update AML policy to explicitly address CTR contingency procedures for system failures",
    "Document all remedial actions for CBUAE inspection file",
  ],
  regulatoryBasis: "UAE FDL 10/2025 Art.17 (CTR filing obligation), Art.21 (MLRO personal obligations), Art.27 (criminal penalties), Art.28 (liability of legal persons); CR 134/2025 Art.14 (AED 55,000 CTR threshold); CBUAE Administrative Sanctions Framework; FATF R.29 (FIU reporting obligations)",
};

export async function POST(req: Request) {
  let body: {
    violation: string;
    institutionType?: string;
    violationPeriod?: string;
    selfReported?: string;
    priorHistory?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.violation?.trim()) return NextResponse.json({ ok: false, error: "violation required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "enforcement-exposure temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1450,
      system: [
        {
          type: "text",
          text: `You are a UAE AML enforcement specialist with expertise in CBUAE penalty framework, UAE FDL 10/2025 sanctions provisions, personal MLRO liability, criminal exposure thresholds, and self-reporting benefits. Assess AML compliance violations for penalty exposure (range in AED), mitigating and aggravating factors, precedent cases from UAE and comparable jurisdictions, criminal and personal liability exposure, and remedial action recommendations. Reference UAE FDL 10/2025 criminal penalty articles and CBUAE administrative sanctions framework. Respond ONLY with valid JSON matching the EnforcementExposureResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Violation Description: ${body.violation}
Institution Type: ${body.institutionType ?? "UAE licensed financial institution"}
Violation Period: ${body.violationPeriod ?? "not specified"}
Self-Reported: ${body.selfReported ?? "not yet"}
Prior Enforcement History: ${body.priorHistory ?? "none known"}
Additional Context: ${body.context ?? "none"}

Assess regulatory enforcement exposure for this AML violation. Return complete EnforcementExposureResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EnforcementExposureResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "enforcement-exposure temporarily unavailable - please retry." }, { status: 503 });
  }
}
