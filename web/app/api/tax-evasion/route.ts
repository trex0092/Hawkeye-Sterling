export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
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


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

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
      max_tokens: 800,
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

Entity: ${sanitizeField(body.entity, 300)}
Entity Type: ${sanitizeField(body.entityType, 100)}
Home Jurisdiction: ${sanitizeField(body.jurisdiction, 100)}
Offshore Jurisdictions: ${body.offshoreJurisdictions.slice(0, 20).map((j: string) => sanitizeField(j, 100)).join(", ") || "None specified"}
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
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "tax-evasion temporarily unavailable - please retry." }, { status: 503 });
  }
}
