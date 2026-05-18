export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

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


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.vaspName?.trim()) return NextResponse.json({ ok: false, error: "vaspName required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "vasp-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
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
          content: `VASP Name: ${sanitizeField(body.vaspName, 500)}
VASP Jurisdiction: ${sanitizeField(body.vaspJurisdiction, 100) || "not specified"}
Exchange Type: ${sanitizeField(body.exchangeType, 100) || "not specified"}
Custody Model: ${sanitizeField(body.custodyModel, 100) || "not specified"}
Supported Assets: ${sanitizeField(body.supportedAssets, 200) || "not specified"}
Travel Rule Protocol: ${sanitizeField(body.travelRuleProtocol, 100) || "not specified"}
Licence Number: ${sanitizeField(body.licenceNumber, 100) || "not provided"}
Geographic Reach: ${sanitizeField(body.geographicReach, 200) || "not specified"}
AML Policy Available: ${sanitizeField(body.amlPolicyAvailable, 100) || "not specified"}
Blockchain Analytics Tool: ${sanitizeField(body.blockchainAnalyticsTool, 100) || "not specified"}
Additional Context: ${sanitizeText(body.context, 2000) || "none"}

Assess this VASP for onboarding risk.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as VaspRiskResult;
    if (!Array.isArray(result.highRiskJurisdictions)) result.highRiskJurisdictions = [];
    if (!Array.isArray(result.riskIndicators)) result.riskIndicators = [];
    if (!Array.isArray(result.requiredDocumentation)) result.requiredDocumentation = [];
    if (!Array.isArray(result.regulatoryObligations)) result.regulatoryObligations = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "vasp-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
