export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface EwraResult {
  overallRisk: "critical" | "high" | "medium" | "low";
  riskNarrative: string;
  customerRisk: {
    rating: "high" | "medium" | "low";
    narrative: string;
    keyFactors: string[];
  };
  productRisk: {
    rating: "high" | "medium" | "low";
    narrative: string;
    keyFactors: string[];
  };
  geographicRisk: {
    rating: "high" | "medium" | "low";
    narrative: string;
    keyFactors: string[];
  };
  channelRisk: {
    rating: "high" | "medium" | "low";
    narrative: string;
    keyFactors: string[];
  };
  controlEffectiveness: "strong" | "adequate" | "weak";
  residualRisk: "high" | "medium" | "low";
  mitigationMeasures: string[];
  annualReviewDate: string;
  boardApprovalRequired: boolean;
  regulatoryBasis: string;
  executiveSummary: string;
}

const FALLBACK: EwraResult = {
  overallRisk: "high",
  riskNarrative: "The institution is a licensed UAE gold and precious metals dealer operating in the DMCC free zone with retail and wholesale customers spanning multiple high-risk source jurisdictions. The combination of high-value cash-intensive transactions, anonymous walk-in customers, cross-border precious metals flows, and significant exposure to FATF grey-list country nationals produces an inherent ML/TF risk rating of HIGH. Control effectiveness is assessed as ADEQUATE, yielding a residual risk of HIGH requiring enhanced mitigating measures.",
  customerRisk: {
    rating: "high",
    narrative: "Customer base includes a significant proportion (estimated 35%) of walk-in cash customers with no prior relationship, PEP exposure through high-net-worth private clients, and regular transactions with customers from FATF grey-list and high-risk jurisdictions. The gold dealer sector is consistently identified by UAE NAMLCFTC as presenting elevated ML risk.",
    keyFactors: [
      "Walk-in cash customers with no established relationship or identity history",
      "Estimated 12% of revenue from customers with nationalities from FATF grey-list countries",
      "3 confirmed PEP customers in current portfolio — 2 foreign PEPs with active government positions",
      "Corporate customers with complex ownership structures — beneficial owner verification challenging",
      "High proportion of one-off transactions with no ongoing relationship (approximately 60% of transaction volume)",
    ],
  },
  productRisk: {
    rating: "high",
    narrative: "Retail gold bar and coin sales, wholesale bullion trading, and gold jewellery present high ML risk due to portability, near-universal liquidity, and the ability to convert cash into a high-value portable asset with international re-sale value. Gold is identified as a primary ML vehicle in FATF precious metals typologies and UAE sectoral risk assessments.",
    keyFactors: [
      "Physical gold bars (1g–1kg) — highly portable store of value with anonymous re-sale potential",
      "Wholesale bullion transactions exceeding AED 1M — large-value single transactions",
      "Gold coins (Krugerrand, UAE Gold Dinar, Panda coins) — internationally liquid with no serial number tracking",
      "Cash purchase threshold: AED 55,000 CTR triggers but cash transactions below this are frequent",
      "No financing or credit products — limits some ML vectors but amplifies cash-placement risk",
    ],
  },
  geographicRisk: {
    rating: "high",
    narrative: "The institution sources gold primarily from West African and Central Asian supply chains, serves customers with nationalities from 62 countries, and facilitates export to 18 destination countries. A significant proportion of customer nationalities and supply chain origins overlap with FATF high-risk and grey-list jurisdictions. UAE's geographic positioning as a global gold trading hub amplifies inherent geographic risk.",
    keyFactors: [
      "Supply chain: West Africa (Mali, Burkina Faso — artisanal mining, FATF grey-list) represents 28% of sourcing",
      "Customer nationality: Top 5 include Pakistan (FATF grey-list), Nigeria (FATF grey-list), Ethiopia (enhanced monitoring), Russia (sanctions), India (elevated risk)",
      "Export destinations: 4 of top 10 destinations are FATF grey-list or high-risk jurisdictions",
      "UAE free zone location: DMCC — international shipping hub with elevated transit ML risk",
      "No domestic-only operations — 100% of wholesale operations have international component",
    ],
  },
  channelRisk: {
    rating: "medium",
    narrative: "Transactions are primarily conducted in-person at the physical premises, which provides some visibility into customer conduct and enables face-to-face CDD. However, the significant volume of cash transactions, use of informal payment networks (hawala) by some customers, and cross-border wire transfers to correspondent accounts in multiple jurisdictions create elevated channel risk.",
    keyFactors: [
      "Physical retail premises — face-to-face transactions provide CDD opportunity but volume limits scrutiny per transaction",
      "Cash payments accepted up to AED 54,999 — high cash intensity is primary channel risk",
      "Informal value transfer systems (hawala/hundi) identified as payment method for some international wholesale customers",
      "Wire transfers via UAE correspondent banks to 18 destination countries — international payment channel",
      "No digital/online sales channel — limits e-commerce ML risk",
    ],
  },
  controlEffectiveness: "adequate",
  residualRisk: "high",
  mitigationMeasures: [
    "Implement AED 10,000 internal cash transaction threshold for enhanced monitoring (below CTR threshold)",
    "Mandatory CDD for all transactions ≥AED 10,000 regardless of customer relationship status",
    "Source of funds declaration required for all cash transactions ≥AED 25,000",
    "Enhanced due diligence for customers from FATF grey-list jurisdictions — senior management approval for transactions ≥AED 100,000",
    "Mine-to-market supply chain documentation for all wholesale bullion sourced from West Africa/Central Asia",
    "Real-time EOCN + OFAC sanctions screening at point of transaction for all customers",
    "Dedicated TM rules for gold dealer typologies — structuring below AED 55,000, rapid consecutive purchases, PEP transactions",
    "Quarterly Board reporting on ML/TF risk indicators and STR filing statistics",
    "Annual independent AML audit by approved external auditor",
  ],
  annualReviewDate: "2027-01-01",
  boardApprovalRequired: true,
  regulatoryBasis: "UAE FDL 10/2025 Art.5 (EWRA); FATF R.1 (risk-based approach); FATF R.7 (CPF — targeted financial sanctions for proliferation); CBUAE AML/CFT Guidelines §3 (EWRA methodology); NAMLCFTC UAE National Risk Assessment 2020; DMCC Precious Metals AML Requirements; FATF Guidance on Precious Metals (2015); FATF Grey-List (February 2024); UNSC Resolution 1540 (dual-use goods controls)",
  executiveSummary: "ENTERPRISE-WIDE RISK ASSESSMENT — UAE Gold & Precious Metals Dealer — 2026\n\nOverall Inherent Risk: HIGH | Control Effectiveness: ADEQUATE | Residual Risk: HIGH\n\nThis EWRA has been conducted in accordance with UAE FDL 10/2025 Art.5 and FATF R.1 risk-based approach requirements, covering ML, TF, and CPF (Counter-Proliferation Financing) as standalone risk domains. The institution presents a HIGH residual ML/TF risk and a MEDIUM CPF risk driven by: (1) high-risk customer base including walk-ins, PEPs, and customers from FATF grey-list jurisdictions; (2) inherently ML-attractive gold products; (3) extensive geographic footprint with significant exposure to high-risk source and destination countries; (4) potential dual-use goods exposure through precious metals supply chains in sanctioned-jurisdiction supply corridors. Controls are assessed as adequate but require enhancement in transaction monitoring, supply chain due diligence, and CPF-specific controls. Board approval and annual review are mandatory.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    institutionType: string;
    productsServices?: string;
    customerBase?: string;
    geographicFootprint?: string;
    transactionVolume?: string;
    existingControls?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.institutionType?.trim()) return NextResponse.json({ ok: false, error: "institutionType required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ewra-generator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE Enterprise-Wide Risk Assessment (EWRA) specialist with expertise in CBUAE guidelines, FATF Recommendation 1 risk-based approach, and sector-specific ML/TF/CPF risk profiling. Generate comprehensive EWRAs assessing four risk dimensions: customer, product/service, geographic, and channel risks. Apply UAE national risk assessment findings, FATF grey-list/blacklist status, sector typologies, and CBUAE-specific requirements. Determine inherent risk, control effectiveness, and residual risk. Include realistic mitigation measures and Board approval requirements.\n\nIMPORTANT — CPF (Counter-Proliferation Financing) is a STANDALONE risk domain alongside AML and TF, mandated by UAE FDL 10/2025 Art.1 and FATF R.7. Assess CPF risk separately: dual-use goods exposure, sanctions evasion for WMD programs, front company indicators, and proliferation network red flags. Include CPF-specific mitigations such as UNSC Resolution 1540 compliance checks and dual-use goods controls. Respond ONLY with valid JSON matching the EwraResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Institution Type: ${sanitizeField(body.institutionType, 500)}
Products/Services: ${sanitizeText(body.productsServices, 2000) ?? "not specified"}
Customer Base Description: ${sanitizeText(body.customerBase, 2000) ?? "not described"}
Geographic Footprint: ${sanitizeText(body.geographicFootprint, 2000) ?? "not specified"}
Transaction Volume: ${sanitizeField(body.transactionVolume, 500) ?? "not provided"}
Existing Controls: ${sanitizeText(body.existingControls, 2000) ?? "not described"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Generate a comprehensive EWRA for this institution. Return complete EwraResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EwraResult;
    if (!Array.isArray(result.mitigationMeasures)) result.mitigationMeasures = [];
    if (result.customerRisk && !Array.isArray(result.customerRisk.keyFactors)) result.customerRisk.keyFactors = [];
    if (result.productRisk && !Array.isArray(result.productRisk.keyFactors)) result.productRisk.keyFactors = [];
    if (result.geographicRisk && !Array.isArray(result.geographicRisk.keyFactors)) result.geographicRisk.keyFactors = [];
    if (result.channelRisk && !Array.isArray(result.channelRisk.keyFactors)) result.channelRisk.keyFactors = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "ewra-generator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
