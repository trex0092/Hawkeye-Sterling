export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface TaxEvasionRequest {
  entity: string;
  entityType: "individual" | "corporate" | "trust" | "foundation";
  jurisdiction: string;
  offshoreJurisdictions: string[];
  structureType: "direct" | "holding_company" | "trust_structure" | "foundation" | "hybrid";
  declaredIncome: string;
  estimatedWealth: string;
  transactionPatterns: string;
  taxTreatyAbuse: boolean;
  transferPricingConcerns: boolean;
  shellCompanies: boolean;
  crsReporting: boolean;
  fatcaStatus: "compliant" | "non_compliant" | "unknown";
  context: string;
}

export interface IdentifiedScheme {
  scheme: string;
  description: string;
  estimatedImpact: string;
  detectabilityRisk: "low" | "medium" | "high";
  legalRef: string;
}

export interface JurisdictionAnalysisItem {
  jurisdiction: string;
  role: "tax_haven" | "conduit" | "sink" | "clean";
  bepsRisk: string;
  taxTreatyAbuse: boolean;
}

export interface WealthIncomeDiscrepancy {
  declared: string;
  estimated: string;
  plausibility: "plausible" | "questionable" | "implausible";
  explanation: string;
}

export interface TaxEvasionResult {
  taxEvasionRiskScore: number;
  riskTier: "low" | "medium" | "high" | "critical";
  identifiedSchemes: IdentifiedScheme[];
  jurisdictionAnalysis: JurisdictionAnalysisItem[];
  wealthIncomeDiscrepancy: WealthIncomeDiscrepancy;
  crsGaps: string[];
  transferPricingFlags: string[];
  roundTrippingIndicators: string[];
  regulatoryRequirements: Array<{ obligation: string; regulation: string }>;
  redFlags: string[];
  recommendation: "clear" | "monitor" | "request_tax_docs" | "file_str" | "report_to_tax_authority";
  taxAuthorityReferral: boolean;
  estimatedTaxLiability: string;
  summary: string;
}

const FALLBACK: TaxEvasionResult = {
  taxEvasionRiskScore: 78,
  riskTier: "high",
  identifiedSchemes: [
    {
      scheme: "Round-Tripping via UAE Free Zone",
      description: "Funds appear to originate from the home jurisdiction, routed through a UAE Free Zone entity, and returned as purported 'foreign direct investment' — artificially inflating the FDI appearance while evading domestic tax obligations.",
      estimatedImpact: "Potential tax loss of 15–30% of routed amounts depending on home jurisdiction tax rate.",
      detectabilityRisk: "medium",
      legalRef: "OECD BEPS Action 6 · UAE CIT Federal Decree-Law 47/2022 Art.34 (anti-avoidance) · FATF R.3 (tax crime as ML predicate)",
    },
    {
      scheme: "Transfer Mispricing — Intra-Group Services",
      description: "Intra-group royalties and management fees paid to an offshore entity appear to exceed arm's-length pricing, artificially reducing taxable profits in the home jurisdiction and shifting income to a low-tax jurisdiction.",
      estimatedImpact: "High — depending on volume of intra-group transactions. Potential penalties up to 200% of underpaid tax in many jurisdictions.",
      detectabilityRisk: "high",
      legalRef: "OECD BEPS Action 8–10 (Transfer Pricing) · UAE MoF Transfer Pricing Rules under CIT Law",
    },
  ],
  jurisdictionAnalysis: [
    {
      jurisdiction: "British Virgin Islands",
      role: "tax_haven",
      bepsRisk: "High — listed as secretive jurisdiction in Global Shell Companies dataset. Minimal economic substance requirements historically. Post-2023 Economic Substance Act partially mitigates but bearer shares remain a concern.",
      taxTreatyAbuse: true,
    },
    {
      jurisdiction: "UAE (Free Zone)",
      role: "conduit",
      bepsRisk: "Medium — UAE CIT 2023 introduced qualifying free zone person (QFZP) status. Abuse occurs when transactions with mainland UAE entities are mischaracterised as qualifying income. OECD Pillar Two compliance under review.",
      taxTreatyAbuse: false,
    },
  ],
  wealthIncomeDiscrepancy: {
    declared: "AED 2.4M annual income",
    estimated: "AED 45M+ in offshore assets",
    plausibility: "implausible",
    explanation: "Estimated offshore wealth is approximately 18.75x declared annual income. Even accounting for 10 years of accumulation, the declared income would need to yield a 100% annual savings rate to explain asset accumulation. This discrepancy is a strong indicator of undeclared income or illicit proceeds.",
  },
  crsGaps: [
    "Offshore accounts in non-CRS jurisdiction (BVI pre-2017) may have historic undisclosed balances.",
    "Trust structure — beneficial ownership may not be reported under CRS if trustee jurisdiction is non-participating.",
    "Multiple account jurisdictions: cross-matching CRS data across all jurisdictions not confirmed.",
  ],
  transferPricingFlags: [
    "Management fees to BVI entity exceed 25% of group revenue — no benchmarking study on file.",
    "Royalty payments for IP held offshore with no evidence of DEMPE (Development, Enhancement, Maintenance, Protection, Exploitation) functions performed by the offshore entity.",
    "Cost-plus arrangements with margin below OECD arm's-length range for comparable transactions.",
  ],
  roundTrippingIndicators: [
    "Offshore funds returned as 'FDI loans' with near-zero interest — does not reflect commercial terms.",
    "Beneficial owner of the investing offshore entity appears identical to the domestic entity's ultimate beneficial owner.",
    "No genuine economic activity, physical presence, or employees in the offshore jurisdiction.",
  ],
  regulatoryRequirements: [
    { obligation: "File STR with UAE FIU via goAML — tax evasion is a predicate offence under UAE FDL 10/2025", regulation: "UAE FDL 10/2025 Art.24 · FATF R.3 · Cabinet Resolution 10/2019" },
    { obligation: "Notify UAE Federal Tax Authority (FTA) if suspicious of domestic CIT/VAT fraud", regulation: "UAE FTA enforcement procedures · CIT Decree-Law 47/2022" },
    { obligation: "Apply Enhanced Due Diligence — high-risk jurisdiction exposure", regulation: "UAE FDL 10/2025 Art.15 · CBUAE AML Standards §4" },
    { obligation: "Consider Voluntary Disclosure to FTA to mitigate penalty exposure for entity itself", regulation: "UAE FTA Voluntary Disclosure provisions" },
  ],
  redFlags: [
    "Wealth-to-income ratio exceeds 18:1 — implausible accumulation from declared sources.",
    "Multiple offshore jurisdictions with no declared business rationale.",
    "Shell company indicators: nominee directors, no employees, no physical premises.",
    "CRS non-participation in at least one account jurisdiction.",
    "FATCA status unknown despite U.S. dollar-denominated transactions.",
    "Transfer pricing arrangements not supported by contemporaneous documentation.",
    "Round-tripping pattern identified: offshore funds returned as FDI.",
  ],
  recommendation: "file_str",
  taxAuthorityReferral: true,
  estimatedTaxLiability: "Cannot be precisely calculated without full financial disclosure; indicative exposure AED 8–15M based on offshore asset base and applicable home jurisdiction corporate/income tax rates.",
  summary: "The entity presents a HIGH tax evasion risk profile with a score of 78/100. Three primary schemes are identified: round-tripping via UAE free zone, transfer mispricing through intra-group royalties, and possible CRS reporting gaps via trust structures. The wealth-income discrepancy is implausible on declared sources alone. An STR should be filed with the UAE FIU, and a parallel referral to the UAE Federal Tax Authority is warranted. Enhanced due diligence must be applied immediately and the relationship should not be expanded pending outcome.",
};

export async function POST(req: Request) {
  let body: TaxEvasionRequest;
  try {
    body = (await req.json()) as TaxEvasionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "tax-evasion temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are an elite UAE MLRO and tax crime specialist with deep expertise in international tax evasion typologies, FATF guidance, and UAE regulatory obligations. Your role is to analyse entity profiles for tax evasion risk as a money laundering predicate offence.

REGULATORY FRAMEWORK — you must apply ALL of the following:

FATF & INTERNATIONAL:
• FATF R.3: Tax crimes are predicate offences to money laundering. FATF "Tax Crime and Money Laundering" guidance (2012, updated 2023).
• OECD BEPS 15 Action Points — particularly: Action 1 (digital economy), Action 2 (hybrid mismatch), Action 3 (CFC rules), Action 4 (interest deductions), Action 5 (harmful tax practices), Action 6 (treaty abuse/shopping), Action 7 (PE avoidance), Actions 8-10 (transfer pricing), Action 11 (BEPS data), Action 12 (disclosure rules), Action 13 (country-by-country reporting), Action 14 (dispute resolution), Action 15 (MLI).
• OECD Model Tax Convention — treaty shopping via conduit entities.
• OECD Tax Haven criteria: no/low tax, lack of transparency, no effective exchange of information, no substantial activities requirement.
• EU DAC6 (mandatory disclosure of cross-border arrangements) and EU tax haven blacklist/greylist.
• Common Reporting Standard (CRS) — 100+ jurisdictions. Account information automatically exchanged. Key gaps: non-CRS jurisdictions, trust structures, nominee arrangements.
• FATCA (US Foreign Account Tax Compliance Act) — requires foreign financial institutions to report US person accounts. Non-compliance = 30% withholding tax.
• Panama Papers / Pandora Papers typologies: offshore secrecy vehicles, nominee directors, bearer shares, multi-layered holding structures.

SPECIFIC SCHEMES TO IDENTIFY:
1. ROUND-TRIPPING: Domestic money sent offshore → returned as purported foreign investment. Indicators: near-zero interest loans from offshore entities, beneficial owner identical to domestic entity, no genuine offshore economic activity, timing correlation between outflow and inflow.
2. TREATY SHOPPING: Using conduit jurisdictions to access favourable treaty rates not available to the actual beneficial owner. Indicators: limited treaty network, lack of economic substance in treaty jurisdiction, principal purpose test (PPT) failures.
3. TRANSFER MISPRICING: Intra-group transactions at non-arm's-length prices to shift profits. Categories: over-invoicing costs, under-invoicing income, inflated royalties/management fees, interest rate manipulation. OECD arm's-length standard.
4. CONTROLLED FOREIGN CORPORATION (CFC) ABUSE: Passive income accumulated in low-tax CFC jurisdiction to defer home-country tax. Indicators: no employees, no substance, passive income streams.
5. DIVIDEND STRIPPING: Pre-sale dividend payment to reduce capital gains — often involves cross-border structures exploiting participation exemptions.
6. ROYALTY ROUTING: IP held in low-tax jurisdiction with royalties paid by operating entities. Key test: DEMPE functions (Development, Enhancement, Maintenance, Protection, Exploitation) must follow substance.
7. HYBRID MISMATCH: Entity or instrument classified differently across jurisdictions — exploiting deduction/non-inclusion outcomes.
8. DEBT PUSH-DOWN: Excessive intra-group debt to create tax-deductible interest in high-tax jurisdictions.

UAE SPECIFIC:
• UAE Corporate Income Tax (CIT) — Federal Decree-Law 47/2022, effective June 2023. 9% on taxable income above AED 375,000. Qualifying Free Zone Persons (QFZP): 0% on qualifying income, subject to substance requirements.
• UAE CIT anti-avoidance: General Anti-Avoidance Rule (GAAR) Art.34, Transfer Pricing (Arts.34-36), Principal Purpose Test for treaty benefits.
• OECD Pillar Two (Global Minimum Tax 15%): UAE Domestic Minimum Top-up Tax (DMTT) — large MNE groups (EUR 750M+ revenue) subject from 2025.
• UAE VAT Fraud: 5% VAT. Carousel fraud, phantom transactions, false input tax credit claims.
• UAE Free Zone abuse: transactions with mainland UAE misclassified as qualifying activities; substance requirements not met; using QFZP status without genuine free zone operations.
• UAE FDL 10/2025 Art.24: obligation to file STR where tax crime suspected as predicate to ML.
• UAE FTA (Federal Tax Authority): enforcement powers, voluntary disclosure, penalties up to 300% of unpaid tax.

JURISDICTION CLASSIFICATION:
• Tax havens / secrecy jurisdictions: BVI, Cayman Islands, Bermuda, Panama, Bahamas, Seychelles, Vanuatu, Samoa, Cook Islands, Liechtenstein, Isle of Man, Jersey, Guernsey.
• EU blacklisted: American Samoa, Anguilla, Antigua and Barbuda (periodically), Bahamas, Belize, Fiji, Guam, Palau, Panama, Russian Federation, Samoa, Trinidad and Tobago, US Virgin Islands, Vanuatu.
• Conduit jurisdictions: Netherlands, Luxembourg, Ireland, Singapore, Mauritius, Cyprus (treaty networks, low WHT on dividends/royalties).
• Sink jurisdictions: ultimate low-tax destination where profits accumulate: Cayman, BVI, Bermuda, Jersey.
• CRS non-participants: USA (uses FATCA instead, but no reciprocal exchange), certain Pacific islands.

WEALTH-INCOME DISCREPANCY ANALYSIS:
Apply the Net Worth Method: compare declared income/wealth accumulation capacity against estimated actual wealth. Flag discrepancy ratios above 3:1 as questionable, above 10:1 as implausible. Consider legitimate sources: inheritance, gifts, prior business exits, investment returns.

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences, exactly this structure:
{
  "taxEvasionRiskScore": <0-100 integer>,
  "riskTier": "low"|"medium"|"high"|"critical",
  "identifiedSchemes": [{"scheme":"string","description":"string","estimatedImpact":"string","detectabilityRisk":"low"|"medium"|"high","legalRef":"string"}],
  "jurisdictionAnalysis": [{"jurisdiction":"string","role":"tax_haven"|"conduit"|"sink"|"clean","bepsRisk":"string","taxTreatyAbuse":boolean}],
  "wealthIncomeDiscrepancy": {"declared":"string","estimated":"string","plausibility":"plausible"|"questionable"|"implausible","explanation":"string"},
  "crsGaps": ["string"],
  "transferPricingFlags": ["string"],
  "roundTrippingIndicators": ["string"],
  "regulatoryRequirements": [{"obligation":"string","regulation":"string"}],
  "redFlags": ["string"],
  "recommendation": "clear"|"monitor"|"request_tax_docs"|"file_str"|"report_to_tax_authority",
  "taxAuthorityReferral": boolean,
  "estimatedTaxLiability": "string",
  "summary": "string"
}

Score calibration: 0-25 = low (clean, minor issues), 26-50 = medium (some exposure, monitor), 51-75 = high (strong indicators, EDD + STR consideration), 76-100 = critical (multiple schemes confirmed, STR + tax authority referral mandatory).`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse the following entity for tax evasion risk as a money laundering predicate offence:

Entity: ${body.entity}
Entity Type: ${body.entityType}
Home Jurisdiction: ${body.jurisdiction}
Offshore Jurisdictions: ${body.offshoreJurisdictions.join(", ") || "None specified"}
Structure Type: ${body.structureType}
Declared Annual Income: ${body.declaredIncome || "Not provided"}
Estimated Total Wealth: ${body.estimatedWealth || "Not provided"}
Transaction Patterns: ${body.transactionPatterns || "Not provided"}
Tax Treaty Abuse Indicators: ${body.taxTreatyAbuse ? "YES" : "NO"}
Transfer Pricing Concerns: ${body.transferPricingConcerns ? "YES" : "NO"}
Shell Company Involvement: ${body.shellCompanies ? "YES" : "NO"}
CRS Reporting Compliant: ${body.crsReporting ? "YES" : "NO"}
FATCA Status: ${body.fatcaStatus}
Additional Context: ${body.context || "None"}

Perform a comprehensive tax evasion ML risk assessment. Identify all schemes, classify each offshore jurisdiction, assess the wealth-income discrepancy, flag CRS/FATCA gaps, and provide a risk-calibrated recommendation.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as TaxEvasionResult;
    if (!Array.isArray(result.identifiedSchemes)) result.identifiedSchemes = [];
    if (!Array.isArray(result.jurisdictionAnalysis)) result.jurisdictionAnalysis = [];
    if (!Array.isArray(result.crsGaps)) result.crsGaps = [];
    if (!Array.isArray(result.transferPricingFlags)) result.transferPricingFlags = [];
    if (!Array.isArray(result.roundTrippingIndicators)) result.roundTrippingIndicators = [];
    if (!Array.isArray(result.regulatoryRequirements)) result.regulatoryRequirements = [];
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "tax-evasion temporarily unavailable - please retry." }, { status: 503 });
  }
}
