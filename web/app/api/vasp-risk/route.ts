export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export interface VaspRiskResult {
  overallRisk: "critical" | "high" | "medium" | "low";
  varaLicensed: boolean;
  travelRuleCompliant: boolean;
  travelRuleAssessment: string;
  custodyModel: "self_custody" | "custodial" | "non_custodial" | "hybrid" | "unknown";
  exchangeType: string;
  geographicExposure: "high" | "medium" | "low";
  highRiskJurisdictions: string[];
  sanctionedExposure: boolean;
  darknetExposure: "confirmed" | "possible" | "unlikely" | "none";
  mixingServiceExposure: "confirmed" | "possible" | "unlikely" | "none";
  amlProgramAssessment: string;
  cddApproach: "robust" | "adequate" | "weak" | "unknown";
  riskIndicators: Array<{ indicator: string; severity: "critical" | "high" | "medium" | "low"; detail: string }>;
  recommendedAction: "reject" | "escalate_mlro" | "enhanced_dd" | "verify_and_monitor" | "onboard_standard";
  actionRationale: string;
  requiredDocumentation: string[];
  regulatoryObligations: string[];
  regulatoryBasis: string;
}

const FALLBACK: VaspRiskResult = {
  overallRisk: "high",
  varaLicensed: false,
  travelRuleCompliant: false,
  travelRuleAssessment: "No evidence of Travel Rule compliance (FATF R.16 virtual asset equivalent). VASP does not implement originator/beneficiary information transmission for virtual asset transfers, creating a significant gap in AML/CFT transparency.",
  custodyModel: "non_custodial",
  exchangeType: "Peer-to-peer (P2P) exchange — unhosted wallet model",
  geographicExposure: "high",
  highRiskJurisdictions: ["Russia", "Iran", "Venezuela", "DPRK (indirect routing suspected)"],
  sanctionedExposure: false,
  darknetExposure: "possible",
  mixingServiceExposure: "possible",
  amlProgramAssessment: "VASP does not appear to have a documented AML/CFT programme. No published AML policy, no designated MLRO, no stated CDD procedures. Non-compliant with FATF R.15 standards.",
  cddApproach: "weak",
  riskIndicators: [
    { indicator: "VASP not licensed under VARA (Dubai) or ADGM FSRA", severity: "critical", detail: "Operating as unregulated VASP in UAE is unlawful under VARA regulations. FIs must not establish correspondent relationships with unregulated VASPs." },
    { indicator: "No Travel Rule implementation for VA transfers", severity: "high", detail: "Travel Rule (FATF R.16 VA equivalent) requires originator and beneficiary information to travel with each VA transfer above threshold. Non-compliance creates AML blind spot." },
    { indicator: "P2P model with unhosted wallet support — no KYC on counterparties", severity: "high", detail: "P2P exchanges allowing unhosted wallet transactions without KYC are primary vector for darknet marketplace withdrawals and sanctions evasion per FATF Virtual Assets Guidance 2021." },
    { indicator: "Geographic exposure to FATF high-risk jurisdictions", severity: "high", detail: "Transaction routing through Russia/Iran/Venezuela indicates potential sanctions exposure and FATF R.19 enhanced scrutiny requirement." },
  ],
  recommendedAction: "reject",
  actionRationale: "Unregulated, non-Travel-Rule-compliant P2P exchange with high-risk jurisdiction exposure. Establishing or continuing any financial relationship constitutes material AML/CFT compliance risk. VARA requires FIs to apply enhanced CDD to all VA transactions and refuse relationships with non-compliant VASPs.",
  requiredDocumentation: [
    "VARA licence certificate or ADGM FSRA licence (mandatory for UAE-based VASPs)",
    "AML/CFT programme documentation — policies, procedures, MLRO details",
    "Travel Rule implementation evidence — protocol (TRISA, OpenVASP, IVMS101)",
    "CDD procedures for exchange users",
    "Blockchain analytics tools used (Chainalysis, Elliptic, TRM Labs)",
    "Latest independent AML audit report",
  ],
  regulatoryObligations: [
    "VARA Regulations (Virtual Assets and Related Activities Regulations 2023) — Dubai",
    "ADGM FSRA — Guidance on Regulation of Digital Securities and Virtual Assets",
    "UAE FDL 10/2025 Art.4(1)(h) — VASPs included in scope of UAE AML law",
    "FATF R.15 — Virtual Assets and VASPs",
    "FATF Guidance on Virtual Assets 2021 (Travel Rule, unhosted wallets)",
    "CBUAE Circular 2023 on VASP correspondent relationships",
  ],
  regulatoryBasis: "UAE FDL 10/2025 Art.4(1)(h); VARA Regulations 2023; ADGM FSRA VASP rules; FATF R.15; FATF Guidance on Virtual Assets 2021; CBUAE Circular on VA Risks",
};

export async function POST(req: Request) {
  let body: {
    vaspName: string;
    vaspJurisdiction?: string;
    exchangeType?: string;
    custodyModel?: string;
    supportedAssets?: string;
    travelRuleProtocol?: string;
    licenceNumber?: string;
    geographicReach?: string;
    amlPolicyAvailable?: string;
    blockchainAnalyticsTool?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.vaspName?.trim()) return NextResponse.json({ ok: false, error: "vaspName required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "vasp-risk temporarily unavailable - please retry." }, { status: 503 });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1300,
        system: `You are a UAE VASP (Virtual Asset Service Provider) AML/CFT risk specialist. Assess VASPs for onboarding/relationship risk under VARA, UAE FDL 10/2025, and FATF R.15.

Key assessment criteria:
1. LICENSING: VARA (Dubai), ADGM FSRA, or equivalent — mandatory for UAE operations
2. TRAVEL RULE: FATF R.16 VA equivalent — IVMS101 standard, TRISA/OpenVASP/Notabene protocol
3. CUSTODY MODEL: Self-custody risk, unhosted wallet exposure
4. GEOGRAPHIC EXPOSURE: FATF high-risk jurisdictions (DPRK, Iran, Russia, Venezuela)
5. SANCTIONS: OFAC, EU, UN virtual asset designations (Lazarus Group, etc.)
6. DARKNET/MIXING: Blockchain analytics exposure to darknet markets, mixers, tumblers
7. AML PROGRAMME: Documented policies, MLRO, CDD procedures, blockchain analytics tools
8. EXCHANGE TYPE: CEX (centralised), DEX (decentralised), P2P — different risk profiles

Red flags: unregulated, no Travel Rule, P2P with unhosted wallets, high-risk jurisdiction routing, Monero/privacy coins, no blockchain analytics, no MLRO, incorporated in low-regulation jurisdiction.

Respond ONLY with valid JSON — no markdown fences matching the VaspRiskResult interface.`,
        messages: [{
          role: "user",
          content: `VASP Name: ${body.vaspName}
VASP Jurisdiction: ${body.vaspJurisdiction ?? "not specified"}
Exchange Type: ${body.exchangeType ?? "not specified"}
Custody Model: ${body.custodyModel ?? "not specified"}
Supported Assets: ${body.supportedAssets ?? "not specified"}
Travel Rule Protocol: ${body.travelRuleProtocol ?? "not specified"}
Licence Number: ${body.licenceNumber ?? "not provided"}
Geographic Reach: ${body.geographicReach ?? "not specified"}
AML Policy Available: ${body.amlPolicyAvailable ?? "not specified"}
Blockchain Analytics Tool: ${body.blockchainAnalyticsTool ?? "not specified"}
Additional Context: ${body.context ?? "none"}

Assess this VASP for onboarding risk.`,
        }],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "vasp-risk temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as VaspRiskResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "vasp-risk temporarily unavailable - please retry." }, { status: 503 });
  }
}
