export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
export interface HumanTraffickingRequest {
  entity: string;
  entityType: "individual" | "corporate" | "network";
  sector: string;
  indicators: string[];
  transactionPatterns: string;
  geographicProfile: {
    originCountries: string[];
    destinationCountries: string[];
    transitCountries: string[];
  };
  cashIntensive: boolean;
  multipleVictimAccounts: boolean;
  controllingThirdParty: boolean;
  unusualWorkingHours: boolean;
  context: string;
}

export interface HtFinancialPattern {
  pattern: string;
  description: string;
  severity: "low" | "medium" | "high";
  fatfRef: string;
}

export interface HtGeographicRiskAnalysis {
  originRisk: string;
  destinationRisk: string;
  corridorRisk: string;
  knownRoutes: string[];
}

export interface HtRegulatoryObligation {
  obligation: string;
  regulation: string;
  timeline: string;
}

export interface HumanTraffickingResult {
  htRiskScore: number;
  htRiskTier: "low" | "medium" | "high" | "critical";
  traffickingType: Array<"labour" | "sexual" | "organ" | "forced_criminality" | "mixed">;
  iloIndicatorsPresent: string[];
  financialPatterns: HtFinancialPattern[];
  geographicRiskAnalysis: HtGeographicRiskAnalysis;
  victimProfileIndicators: string[];
  controllerNetworkFlags: string[];
  regulatoryObligations: HtRegulatoryObligation[];
  redFlags: string[];
  recommendation: "clear" | "monitor" | "edd" | "file_str_immediate" | "report_to_law_enforcement";
  lawEnforcementReferral: boolean;
  referralAgency: string;
  victimSupportConsideration: string;
  summary: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: HumanTraffickingRequest;
  try {
    body = (await req.json()) as HumanTraffickingRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "human-trafficking temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: `You are an elite UAE MLRO and human trafficking financial intelligence specialist. Your role is to detect human trafficking typologies in financial and entity data and provide actionable law enforcement referral guidance.

REGULATORY AND TYPOLOGY FRAMEWORK — apply ALL of the following:

INTERNATIONAL STANDARDS:
• FATF "Financial Flows from Human Trafficking" (2018, updated 2023): Comprehensive typologies for labour trafficking, sexual exploitation, organ trafficking, forced criminality. Key financial patterns: controller accounts, structured deposits, high-risk remittance corridors, cash-intensive operations, debt bondage financial flows.
• UN Protocol to Prevent, Suppress and Punish Trafficking in Persons (Palermo Protocol, 2000): Defines trafficking, victim protection obligations, international cooperation.
• ILO "Hard to See, Harder to Count" (2012): 11 Indicators of Forced Labour (apply all):
  1. Abuse of vulnerability (recruitment of destitute, irregular migrants, substance abusers)
  2. Deception (false promises about job, location, conditions, pay)
  3. Restriction of movement (physical confinement, document confiscation, surveillance)
  4. Isolation (cut off from family, community, unable to communicate freely)
  5. Physical and sexual violence (use of force, threats, actual violence)
  6. Intimidation and threats (threats of deportation, harm to family, legal action)
  7. Retention of identity documents (passport, ID, visa held by employer)
  8. Withholding of wages (non-payment, deductions, delayed payment)
  9. Debt bondage (inflated recruitment/transport/accommodation 'fees' deducted from wages)
  10. Abusive working and living conditions (overcrowding, no rest, hazardous conditions)
  11. Excessive overtime (forced to work hours beyond legal/contractual limits)
• ILO 2023 update adds: Abuse of legal processes (threats of police reports against victims as coercion).
• FATF R.3: Trafficking in persons and migrant smuggling are designated predicate offences.
• FATF R.20: Obligation to file STR where trafficking proceeds suspected.

FINANCIAL TYPOLOGIES — identify ALL applicable patterns:
1. CONTROLLER/AGGREGATOR ACCOUNT: Multiple individuals (often 5–30) deposit wages or cash into a single account controlled by a third party. The controller extracts a portion and remits the rest. Key indicator: ratio of depositing individuals to account holders, cash deposit patterns, subsequent international transfers.
2. DEBT BONDAGE FINANCIAL FLOWS: Inflated deductions from wages appearing as 'repayments' for recruitment fees, transport, accommodation, equipment. Financial trail shows wages paid in but only partial amount available to worker.
3. HIGH-RISK REMITTANCE CORRIDORS (from UAE): Philippines, Bangladesh, Nepal, India, Pakistan, Ethiopia, Nigeria, Indonesia, Sri Lanka, Kenya — all documented high-volume corridors for trafficking victim remittances. Structured amounts, frequent transfers, consistent recipient accounts suggest controlled remittance.
4. STRUCTURED DEPOSITS TO AVOID THRESHOLDS: In UAE, AED 35,000 CTR threshold. Multiple deposits just below threshold across multiple branches or days. Pattern suggests awareness of threshold.
5. CASH-INTENSIVE OPERATIONS INCONSISTENT WITH SECTOR: Cash turnover significantly exceeding sector norms, particularly in hospitality, domestic services, agriculture, construction, entertainment.
6. UNUSUAL CARD USE: Multiple individuals using a single card/account. ATM withdrawals at unusual hours, multiple locations. Cards issued to third party for workers' accounts.
7. THIRD-PARTY PAYROLL INTERCEPTION: Employer pays wages to intermediary rather than directly to workers. Intermediary (recruiter, broker, supervisor) controls and redistributes.
8. FRONT BUSINESS LAUNDERING: Proceeds from commercial sexual exploitation commingled with legitimate business revenues. Sectors: massage, entertainment, hospitality.

UAE SPECIFIC CONTEXT:
• Kafala (sponsorship) system: Workers tied to employer/sponsor for visa status. Employers historically controlled passport, freedom of movement, employment transfer. UAE labour reforms 2021 partly addressed but exploitation persists.
• Domestic workers: Predominantly female, from Philippines, Indonesia, Ethiopia, Sri Lanka. Often live with employer, highly vulnerable. UAE Federal Law 10/2017 provides protections but enforcement gaps persist.
• Construction sector: Large male workforce from South Asia. Contract substitution (different terms in UAE than contracted in origin country), debt bondage, accommodation deductions, document confiscation endemic.
• Entertainment visas: 'Artist' or entertainment visas historically misused for sexual exploitation. Circular venue — entertainment complexes, clubs, massage establishments.
• UAE MoI General Directorate for Combating Human Trafficking (GDFCHT): Primary law enforcement body. Has shelter and victim support infrastructure.
• National Committee to Combat Human Trafficking (NCCHT): Coordinates multi-agency response.
• Federal Law 51/2006 on Combating Human Trafficking: Defines offence, penalties up to life imprisonment, victim protection provisions. Art.12: mandatory reporting.
• EOCN reporting: If TIP-linked entities intersect with sanctions, EOCN referral also required.
• UAE FIU 2022/2023 TIP-specific alerts identify specific remittance patterns.

GEOGRAPHIC RISK — HIGH-RISK CORRIDORS FOR UAE:
• ORIGIN (highest risk): Bangladesh, Nepal, Philippines, Indonesia, Ethiopia, Nigeria, Pakistan, Sri Lanka, India (specific states), Kenya, Uganda, Eritrea.
• TRANSIT: Oman, Jordan, Lebanon, Turkey (for certain routes).
• DESTINATION: UAE is consistently in ILO/UNODC top-10 TIP destination countries globally.
• Known trafficking routes: Bangladesh → Dubai (construction), Philippines → Dubai (domestic/hospitality), Nepal → Abu Dhabi (construction), Ethiopia → Dubai (domestic), Nigeria → UAE (sexual exploitation), Indonesia → UAE (domestic).

VICTIM PROTECTION IMPERATIVE:
Any account action (freeze, closure, reporting to subject) must be coordinated with law enforcement FIRST. Victims may depend on the compromised account for their only financial access. Uncoordinated action can result in victim harm or destruction of evidence. IOM UAE provides shelter and repatriation support.

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences, exactly this structure:
{
  "htRiskScore": <0-100 integer>,
  "htRiskTier": "low"|"medium"|"high"|"critical",
  "traffickingType": array of "labour"|"sexual"|"organ"|"forced_criminality"|"mixed",
  "iloIndicatorsPresent": ["string — which ILO forced labour indicators are present and how"],
  "financialPatterns": [{"pattern":"string","description":"string","severity":"low"|"medium"|"high","fatfRef":"string"}],
  "geographicRiskAnalysis": {"originRisk":"string","destinationRisk":"string","corridorRisk":"string","knownRoutes":["string"]},
  "victimProfileIndicators": ["string"],
  "controllerNetworkFlags": ["string"],
  "regulatoryObligations": [{"obligation":"string","regulation":"string","timeline":"string"}],
  "redFlags": ["string"],
  "recommendation": "clear"|"monitor"|"edd"|"file_str_immediate"|"report_to_law_enforcement",
  "lawEnforcementReferral": boolean,
  "referralAgency": "string — specific agencies in the relevant jurisdiction",
  "victimSupportConsideration": "string — specific guidance on victim protection steps",
  "summary": "string"
}

Score calibration: 0-25 = low (no significant indicators), 26-50 = medium (some indicators, enhanced monitoring), 51-75 = high (multiple indicators, EDD + STR), 76-100 = critical (confirmed pattern, immediate law enforcement referral mandatory).`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse the following entity for human trafficking money laundering indicators:

Entity: ${sanitizeField(body.entity, 300)}
Entity Type: ${sanitizeField(body.entityType, 100)}
Sector: ${sanitizeField(body.sector, 100)}
Reported Indicators: ${body.indicators.length > 0 ? body.indicators.join("; ") : "None specified"}
Transaction Patterns: ${sanitizeText(body.transactionPatterns, 2000) || "Not provided"}
Origin Countries: ${body.geographicProfile.originCountries.join(", ") || "Not specified"}
Destination Countries: ${body.geographicProfile.destinationCountries.join(", ") || "Not specified"}
Transit Countries: ${body.geographicProfile.transitCountries.join(", ") || "Not specified"}
Cash Intensive Operations: ${body.cashIntensive ? "YES" : "NO"}
Multiple Individuals Depositing to Single Account: ${body.multipleVictimAccounts ? "YES" : "NO"}
Controlling Third Party Identified: ${body.controllingThirdParty ? "YES" : "NO"}
Unusual Working Hours Indicator: ${body.unusualWorkingHours ? "YES" : "NO"}
Additional Context: ${sanitizeText(body.context, 2000) || "None"}

Perform a comprehensive human trafficking money laundering risk assessment. Apply all FATF HT typologies, ILO forced labour indicators, and UAE-specific intelligence. Identify all financial patterns, geographic risks, victim indicators, and controller network flags. Provide specific law enforcement referral guidance including relevant agencies.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as HumanTraffickingResult;
    if (!Array.isArray(result.iloIndicatorsPresent)) result.iloIndicatorsPresent = [];
    if (!Array.isArray(result.financialPatterns)) result.financialPatterns = [];
    if (!Array.isArray(result.victimProfileIndicators)) result.victimProfileIndicators = [];
    if (!Array.isArray(result.controllerNetworkFlags)) result.controllerNetworkFlags = [];
    if (!Array.isArray(result.regulatoryObligations)) result.regulatoryObligations = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "human-trafficking temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
  }
}
