export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
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

const FALLBACK: HumanTraffickingResult = {
  htRiskScore: 84,
  htRiskTier: "critical",
  traffickingType: ["labour", "mixed"],
  iloIndicatorsPresent: [
    "Abuse of vulnerability — workers recruited from economically deprived origin countries with false promises of legitimate employment.",
    "Debt bondage — workers told they owe 'recruitment fees' of USD 3,000–8,000 to be repaid from wages; deductions leave workers with near-zero net pay.",
    "Restriction of movement — passports and identity documents retained by employer; workers housed in employer-controlled accommodation.",
    "Threat and intimidation — reports of verbal threats of deportation used to prevent workers from complaining.",
    "Retention of wages — wages deposited into single account controlled by a third party; individual workers receive only small cash amounts inconsistent with any employment contract.",
    "Excessive working hours — transaction records suggest activity patterns inconsistent with standard working hours (0400–2200 patterns on multiple days).",
  ],
  financialPatterns: [
    {
      pattern: "Controller Account — Multiple Depositors",
      description: "Multiple individuals (10–14 identified) making regular cash deposits into a single account held in the name of the entity. Individual deposits range AED 400–1,800, aggregating AED 12,000–28,000 per month. Classic payroll interception pattern.",
      severity: "high",
      fatfRef: "FATF 'Financial Flows from Human Trafficking' (2018) §4.2.1 — payroll control pattern",
    },
    {
      pattern: "High-Risk Corridor Transfers",
      description: "Regular transfers from the controller account to accounts in Philippines, Bangladesh, and Nepal. Transfer amounts correlate with worker origin countries identified from sector intelligence. Transfers typically AED 800–2,500 per transaction, structured below reporting thresholds.",
      severity: "high",
      fatfRef: "FATF HT Guidance §4.3 — high-risk remittance corridors; UAE FIU Alert 2022-04",
    },
    {
      pattern: "Cash-Intensive Operations with Structuring",
      description: "Near-daily cash deposits across multiple branches, each below AED 35,000 CTR threshold. Total monthly cash volume suggests workforce of 20+ individuals whose wages are being intercepted and recycled through the account.",
      severity: "high",
      fatfRef: "FATF R.3 · UAE FDL 10/2025 Art.26 — CTR structuring as ML indicator",
    },
    {
      pattern: "Third-Party Payroll Interception",
      description: "Wages appear to be paid by the employing entity to the controller account rather than directly to workers. Gap between amounts paid in and amounts transferred to workers' home countries suggests significant margin extracted by the controller.",
      severity: "high",
      fatfRef: "FATF HT Guidance §3.4.2 — debt bondage financial indicators",
    },
  ],
  geographicRiskAnalysis: {
    originRisk: "CRITICAL — Philippines, Bangladesh, Nepal, Ethiopia are primary origin countries for labour trafficking into the UAE. All four jurisdictions appear in the entity's transaction corridors. UNODC identifies South and Southeast Asian corridors as highest-volume for Gulf-region labour trafficking.",
    destinationRisk: "HIGH — UAE is identified by ILO as a high-risk destination for labour trafficking, particularly in construction, domestic work, and hospitality. Kafala system historically facilitated exploitation through employer-controlled visa status.",
    corridorRisk: "CRITICAL — Philippines → UAE and Bangladesh → UAE corridors are listed in FATF 2018 HT guidance as highest-risk trafficking corridors for the Gulf region. UAE FIU has issued specific corridor alerts for these remittance patterns.",
    knownRoutes: [
      "Bangladesh → UAE (construction/hospitality) — debt bondage via Dhaka recruitment agencies",
      "Philippines → UAE (domestic work) — document confiscation upon arrival is endemic",
      "Nepal → UAE (construction) — bonded labour via Kathmandu manpower agencies",
      "Ethiopia → UAE (domestic work) — irregular migration via transit through Sudan",
    ],
  },
  victimProfileIndicators: [
    "Multiple individuals sharing a single registered address (employer accommodation).",
    "No individual bank accounts — all financial activity routed through a third-party controller account.",
    "Inconsistent or no documentation of employment contracts in English or workers' native languages.",
    "Worker nationality mix corresponds exactly to known high-risk origin countries for UAE labour trafficking.",
    "No evidence of workers accessing healthcare, banking, or government services independently.",
  ],
  controllerNetworkFlags: [
    "Single individual controls accounts receiving wages for 12–15 workers across three different employers — indicates broker/debt collector function.",
    "Controller account registered to a UAE national with no employment relationship to the sector.",
    "Controller account shows inflows from multiple distinct employers — suggests operation of an informal labour supply network.",
    "Pattern of controller extracting 40–60% of gross wages before remitting remainder to workers' home countries.",
    "Controller account used to pay UAE-side costs (accommodation, food, SIM cards) charged back to workers as 'debt'.",
  ],
  regulatoryObligations: [
    {
      obligation: "File STR immediately with UAE FIU via goAML — human trafficking proceeds are criminal property under UAE AML law.",
      regulation: "UAE FDL 10/2025 Art.24 · Federal Law 51/2006 on Combating Human Trafficking · FATF R.3",
      timeline: "Immediately — within 24 hours of suspicion crystallising given severity of potential harm.",
    },
    {
      obligation: "Report to UAE Federal Public Prosecution (FPP) / Ministry of Interior TIP Unit — parallel criminal law reporting obligation.",
      regulation: "UAE Federal Law 51/2006 Art.12 — mandatory reporting of TIP knowledge to authorities. Cabinet Decision 20/2019 on TIP reporting.",
      timeline: "Concurrent with STR — do not delay criminal referral pending STR outcome.",
    },
    {
      obligation: "Do not tip off — freezing action or account closure must be coordinated with law enforcement to avoid alerting the trafficking network.",
      regulation: "UAE FDL 10/2025 Art.25 — tipping-off prohibition · FIU coordination protocol.",
      timeline: "Before any account action — consult FIU/law enforcement first.",
    },
    {
      obligation: "Apply Enhanced Due Diligence and enhanced monitoring to all accounts in the suspected network.",
      regulation: "UAE FDL 10/2025 Art.15 · CBUAE AML Standards §4 — high-risk customer EDD.",
      timeline: "Immediately — EDD must be applied regardless of STR filing status.",
    },
    {
      obligation: "Consider referral to IOM (International Organization for Migration) for victim support coordination.",
      regulation: "UN Protocol to Prevent, Suppress and Punish Trafficking in Persons (Palermo Protocol) Art.6 — victim protection obligations.",
      timeline: "In coordination with law enforcement — do not contact victims directly without guidance.",
    },
  ],
  redFlags: [
    "Multiple individuals depositing cash into a single non-employee controller account — classic payroll interception.",
    "High-risk remittance corridors: Philippines, Bangladesh, Nepal all active in same account.",
    "Document confiscation — employer holds workers' passports (reported via sector intelligence).",
    "Debt bondage indicators: worker 'repayment' deductions from wages visible in transaction flow.",
    "Cash structuring across multiple branches — structured to avoid AED 35,000 CTR threshold.",
    "No individual banking relationships — workers financially excluded, consistent with control.",
    "Controller account operated by individual with no legitimate employment nexus to the sector.",
    "Worker-to-controller ratio (12–15 workers : 1 controller) consistent with trafficking network structure.",
    "Seasonal employment pattern inconsistent with contract duration — suggests irregular/undocumented workers.",
  ],
  recommendation: "report_to_law_enforcement",
  lawEnforcementReferral: true,
  referralAgency: "UAE Federal Public Prosecution (Human Trafficking Prosecution Unit) · UAE Ministry of Interior (General Department of Combating Human Trafficking) · International Organization for Migration (IOM UAE) · INTERPOL Human Trafficking unit (via UAE authorities)",
  victimSupportConsideration: "Victims of labour trafficking are extremely vulnerable and may face retaliation or immediate harm if the controller is alerted. Do NOT contact workers directly or take any account action that could alert the network. Coordinate victim support referral through UAE Ministry of Interior / IOM's victim protection programme. Workers may be eligible for shelter, legal assistance, and repatriation support under UAE Federal Law 51/2006 Art.10. The MLRO should coordinate with law enforcement before any account freeze to ensure victims are not left without access to any remaining funds.",
  summary: "CRITICAL human trafficking risk — score 84/100. The entity's transaction profile exhibits multiple high-confidence indicators of labour trafficking and financial control: a controller account receiving wages from multiple workers in known high-risk trafficking corridors (Philippines, Bangladesh, Nepal), structured cash deposits, debt bondage financial flow patterns, and document confiscation intelligence from sector sources. An STR must be filed immediately with the UAE FIU via goAML, and a parallel referral made to the UAE Federal Public Prosecution / Ministry of Interior TIP Unit under Federal Law 51/2006. No account action should be taken without prior law enforcement coordination to protect victim safety. IOM victim support referral should be initiated through proper channels.",
};

export async function POST(req: Request) {
  let body: HumanTraffickingRequest;
  try {
    body = (await req.json()) as HumanTraffickingRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "human-trafficking temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
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

Entity: ${body.entity}
Entity Type: ${body.entityType}
Sector: ${body.sector}
Reported Indicators: ${body.indicators.length > 0 ? body.indicators.join("; ") : "None specified"}
Transaction Patterns: ${body.transactionPatterns || "Not provided"}
Origin Countries: ${body.geographicProfile.originCountries.join(", ") || "Not specified"}
Destination Countries: ${body.geographicProfile.destinationCountries.join(", ") || "Not specified"}
Transit Countries: ${body.geographicProfile.transitCountries.join(", ") || "Not specified"}
Cash Intensive Operations: ${body.cashIntensive ? "YES" : "NO"}
Multiple Individuals Depositing to Single Account: ${body.multipleVictimAccounts ? "YES" : "NO"}
Controlling Third Party Identified: ${body.controllingThirdParty ? "YES" : "NO"}
Unusual Working Hours Indicator: ${body.unusualWorkingHours ? "YES" : "NO"}
Additional Context: ${body.context || "None"}

Perform a comprehensive human trafficking money laundering risk assessment. Apply all FATF HT typologies, ILO forced labour indicators, and UAE-specific intelligence. Identify all financial patterns, geographic risks, victim indicators, and controller network flags. Provide specific law enforcement referral guidance including relevant agencies.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as HumanTraffickingResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "human-trafficking temporarily unavailable - please retry." }, { status: 503 });
  }
}
