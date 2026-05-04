export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface MiceQuadrant {
  score: number;
  indicators: string[];
}

export interface InsiderThreatMiceAnalysis {
  money: MiceQuadrant;
  ideology: MiceQuadrant;
  coercion: MiceQuadrant;
  ego: MiceQuadrant;
}

export interface InsiderThreatBehaviouralProfile {
  stressors: string[];
  warningBehaviours: string[];
  escalationRisk: "stable" | "increasing" | "imminent";
}

export interface InsiderThreatSystemicRisk {
  accessRisk: string;
  dataExfiltrationRisk: string;
  fraudRisk: string;
  mlFacilitationRisk: string;
}

export interface InsiderThreatControl {
  control: string;
  urgency: "immediate" | "within_24h" | "within_week";
  owner: string;
}

export interface InsiderThreatResult {
  ok: true;
  insiderThreatScore: number;
  riskTier: "low" | "medium" | "high" | "critical";
  threatCategory: Array<"financial_crime_facilitation" | "data_theft" | "fraud" | "sabotage" | "regulatory_breach">;
  miceAnalysis: InsiderThreatMiceAnalysis;
  behaviouralRiskProfile: InsiderThreatBehaviouralProfile;
  systemicRisk: InsiderThreatSystemicRisk;
  financialProfile: string;
  complianceRiskHistory: string;
  recommendedControls: InsiderThreatControl[];
  hrActions: string[];
  investigativeSteps: string[];
  redFlags: string[];
  recommendation: "no_action" | "enhanced_monitoring" | "restrict_access" | "hr_investigation" | "suspend_pending_investigation" | "report_to_regulators";
  escalationPath: string[];
  summary: string;
}

const FALLBACK: InsiderThreatResult = {
  ok: true,
  insiderThreatScore: 82,
  riskTier: "critical",
  threatCategory: ["financial_crime_facilitation", "fraud", "regulatory_breach"],
  miceAnalysis: {
    money: {
      score: 90,
      indicators: [
        "Unexplained lifestyle inflation — luxury vehicle purchased on reported salary of AED 18,000/month",
        "Offshore account activity detected via SWIFT message monitoring",
        "Gambling debt of approximately AED 340,000 identified via personal credit inquiry",
        "Pattern of large cash withdrawals inconsistent with reported income",
      ],
    },
    ideology: {
      score: 20,
      indicators: [
        "No ideological indicators identified",
        "No known affiliations with sanctioned groups or extremist organisations",
      ],
    },
    coercion: {
      score: 35,
      indicators: [
        "Divorce proceedings creating financial vulnerability and potential external leverage point",
        "Financial stress may create susceptibility to social engineering or blackmail",
      ],
    },
    ego: {
      score: 55,
      indicators: [
        "Passed over for promotion in favour of external hire — documented grievance in HR file",
        "Statements to colleagues expressing resentment toward management",
        "Sense of entitlement relative to perceived contribution",
      ],
    },
  },
  behaviouralRiskProfile: {
    stressors: [
      "Active divorce proceedings with contested financial settlement",
      "Significant gambling debt (approx. AED 340,000)",
      "Passed over for promotion — promotion awarded to external candidate",
      "Financial stress compounded by lifestyle inflation pattern",
    ],
    warningBehaviours: [
      "Working unusual hours (0200-0400) with bulk system access on weekends",
      "Bulk data export of customer KYC files (12,400 records) flagged by DLP",
      "Accessing systems outside normal role scope — customer PII database not required for stated duties",
      "Deleting audit logs following access sessions (attempted — system backup preserved)",
      "VPN connection from non-registered location (Ras Al Khaimah when resident in Dubai)",
      "Increased access frequency to high-value customer accounts beyond workflow requirement",
    ],
    escalationRisk: "imminent",
  },
  systemicRisk: {
    accessRisk: "CRITICAL — Admin-level access to core banking system, customer PII database, and SWIFT infrastructure. Unauthorised access sessions confirmed outside role scope. Privilege escalation attempt blocked but logged.",
    dataExfiltrationRisk: "CRITICAL — 12,400 customer KYC records bulk exported to personal USB drive (DLP alert triggered). Records include UBO information, source of wealth documentation, and account numbers — commercially valuable to competitors and criminal networks.",
    fraudRisk: "HIGH — Finance department access combined with financial stress indicators creates significant fraud facilitation risk. Review all transactions approved or processed by subject over prior 24 months.",
    mlFacilitationRisk: "HIGH — Access to customer CDD files and transaction monitoring system creates ML facilitation risk consistent with Mossack Fonseca-pattern (internal leakage of beneficial ownership data to criminal clients).",
  },
  financialProfile: "Subject displays multiple unexplained wealth indicators: luxury vehicle (estimated AED 280,000) purchased 4 months ago; gambling debt of AED 340,000 at two licenced establishments; offshore account referenced in intercepted email; lifestyle inflation inconsistent with AED 18,000/month salary. Total unexplained wealth differential estimated AED 650,000–900,000. UAE CBUAE AML Standards §8.2 requires institutions to monitor employees for unexplained wealth as an insider threat indicator.",
  complianceRiskHistory: "Subject has 2 prior disciplinary actions on file: (1) unauthorised data access 14 months ago — written warning issued; (2) failure to complete mandatory AML training (3 consecutive cycles). No SARs filed by or about subject. Compliance history demonstrates pattern of boundary-testing and disengagement from compliance obligations.",
  recommendedControls: [
    { control: "Immediately revoke admin-level system access and reset all credentials. Enforce principle of least privilege.", urgency: "immediate", owner: "IT Security / CISO" },
    { control: "Preserve and forensically image all system logs, USB activity, DLP alerts, and email records before subject is aware of investigation.", urgency: "immediate", owner: "IT Security / Legal" },
    { control: "Deploy enhanced UEBA monitoring on all remaining access. Real-time alerts for any data movement.", urgency: "immediate", owner: "IT Security" },
    { control: "Restrict physical access to server rooms and compliance areas.", urgency: "within_24h", owner: "Physical Security / HR" },
    { control: "Conduct full audit of all transactions processed or approved by subject for prior 24 months.", urgency: "within_24h", owner: "Internal Audit / Compliance" },
    { control: "Review all customer accounts accessed by subject — assess for potential ML facilitation or data leakage to third parties.", urgency: "within_24h", owner: "Compliance / MLRO" },
    { control: "Implement legal hold on all subject communications, devices, and digital assets.", urgency: "within_24h", owner: "Legal / IT Security" },
    { control: "Brief MLRO and consider SAR/STR obligation if evidence of ML facilitation confirmed.", urgency: "within_week", owner: "MLRO" },
  ],
  hrActions: [
    "Suspend subject on full pay pending investigation — do not pre-announce; coordinate with IT to execute access revocation simultaneously with HR notification",
    "Do not conduct investigative interview until all digital evidence is preserved and forensically secured",
    "Engage employment law counsel before any disciplinary meeting",
    "Review employment contract for confidentiality, data protection, and post-termination obligations",
    "Assess whistleblower notification obligations under UAE FDL 10/2025 Art.26 — staff making good-faith reports are protected",
    "Prepare documentation for potential referral to Dubai Police Financial Crimes Unit if criminal fraud or ML facilitation confirmed",
  ],
  investigativeSteps: [
    "Forensic imaging of all workstations, laptops, and removable media used by subject (immediately — before any device access)",
    "Extract and analyse all DLP alerts, access logs, and UEBA anomaly reports for past 24 months",
    "Review SWIFT message access and any unusual correspondent banking queries by subject",
    "Identify all customers whose KYC data was included in the bulk export — assess re-KYC requirement",
    "Trace USB drive destination — request network traffic analysis for any cloud upload activity",
    "Interview colleagues (cautiously, maintaining confidentiality) — assess whether misconduct is isolated or part of a group",
    "Commission independent forensic accountant to review subject's personal finances against salary",
    "Check CBUAE and UAE FIU for any existing alerts or SARs naming subject",
    "Assess whether any counterparties may have received leaked customer data — consider external notification obligations",
    "Report findings to MLRO within 14 days; MLRO to determine SAR/STR filing obligation",
  ],
  redFlags: [
    "Bulk export of 12,400 KYC records to personal USB — DLP confirmed",
    "Unauthorised system access outside role scope",
    "Attempted deletion of audit logs",
    "Unexplained wealth differential of AED 650,000-900,000 vs. reported income",
    "Active gambling debt AED 340,000",
    "VPN from unregistered location",
    "Unusual hours access (0200-0400) with high data volume",
    "Prior disciplinary action for unauthorised data access (pattern behaviour)",
    "Repeated failure to complete mandatory AML training",
    "Grievance over promotion — documented resentment",
    "Divorce proceedings creating financial vulnerability",
    "Offshore account activity detected",
  ],
  recommendation: "suspend_pending_investigation",
  escalationPath: [
    "CISO — immediate (access revocation and forensic preservation)",
    "MLRO — within 2 hours (ML facilitation risk assessment, SAR obligation review)",
    "Legal Counsel — within 2 hours (evidence preservation, employment law, criminal referral assessment)",
    "CEO / Managing Director — within 4 hours (board notification if material)",
    "HR Director — within 4 hours (suspension decision and employment process)",
    "UAE FIU (goAML) — within 35 days if ML facilitation confirmed (STR filing)",
    "Dubai Police Financial Crimes Unit — if criminal fraud or ML confirmed and UAE AML law triggers mandatory report",
    "CBUAE — if regulatory breach confirmed (FDL 10/2025 Art.15 — mandatory reporting of AML failures)",
  ],
  summary: "This employee presents a critical insider threat profile with an imminent escalation risk. The convergence of extreme financial stress (gambling debt, unexplained wealth, divorce proceedings), confirmed malicious technical behaviour (bulk data exfiltration, log deletion, unauthorised access), and a documented grievance history creates a threat profile consistent with the Mossack Fonseca pattern of insider ML facilitation. The MICE analysis is dominated by Money (90/100) with secondary Ego motivation (55/100). Immediate suspension and forensic investigation are required. MLRO must assess STR filing obligation within 35 days.",
};

export async function POST(req: Request) {
  let body: {
    employee?: string;
    role?: string;
    department?: string;
    accessLevel?: string;
    yearsAtFirm?: number;
    recentLifeEvents?: string[];
    behaviouralIndicators?: string[];
    systemAccessAnomalies?: {
      unusualHours: boolean;
      bulkDataExport: boolean;
      unauthorisedSystemAccess: boolean;
      deletedLogs: boolean;
      vpnFromUnusualLocations: boolean;
    };
    financialIndicators?: {
      lifestyleInflation: boolean;
      unexplainedWealth: boolean;
      largePersonalTransactions: boolean;
      offshoreAccounts: boolean;
      gamblingDebt: boolean;
    };
    complianceHistory?: {
      previousSARs: number;
      disciplinaryActions: number;
      trainingNonCompletion: boolean;
      breachedPolicies: string[];
    };
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "insider-threat temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3500,
      system: [
        {
          type: "text",
          text: `You are a UAE financial crime and insider threat specialist with expertise in detecting, assessing, and responding to insider threats within regulated financial institutions. Your knowledge covers:

REGULATORY FRAMEWORKS:
- FATF Guidance on Insider Facilitation of Money Laundering and Terrorist Financing
- Basel Committee on Banking Supervision — Sound Practices for the Management of Operational Risk (2021)
- ACAMS Insider Threat Framework — financial institution specific
- UAE FDL 10/2025 (Updated AML Law) — Art.26 whistleblower protections; staff screening obligations
- UAE FDL 20/2018 — employee obligations and institutional liability for ML facilitation
- CBUAE AML Standards — §8 (HR screening), §6.4 (escalation procedures), internal controls
- UAE Cabinet Decision on Implementing Regulations — employee fitness and propriety standards
- Dubai Financial Services Authority (DFSA) — conduct of business rules, insider threat programme requirements
- ADGM Financial Services Regulatory Authority — similar requirements

FRAMEWORKS & MODELS:
1. MICE Model (Money, Ideology, Coercion, Ego) — primary motivation assessment for insider threats
   - Money: financial stress, unexplained wealth, lifestyle inflation, gambling, debt
   - Ideology: disillusionment, extremist links, competitor loyalty, ethical objection to firm practices
   - Coercion: blackmail, family threats, external criminal pressure, organised crime targeting
   - Ego: entitlement, narcissism, revenge motivation, passed-over promotion, perceived unfair treatment

2. CERT Insider Threat Center MERIT Model — trajectory analysis
   - Motivation: personal stressors, grievances, financial pressure
   - Enablers: technical access, trusted position, opportunity
   - Risk Indicators: behavioural signals, access anomalies, financial signals
   - Tactics: data theft methods, fraud schemes, ML facilitation patterns

3. UEBA (User Entity Behaviour Analytics) indicators:
   - Off-hours access patterns
   - Bulk data export events
   - Privilege escalation attempts
   - Lateral movement through systems
   - Log deletion or tampering
   - VPN from anomalous geolocation

4. DLP (Data Loss Prevention) triggers:
   - Large file transfers to personal email or cloud storage
   - USB drive activity
   - Printing of sensitive documents outside normal hours
   - Screen capture activity
   - Unusual API calls to customer databases

INDUSTRY CASE TYPOLOGIES:
- Rogue trader pattern (Barings/Nick Leeson, Société Générale/Jérôme Kerviel, UBS/Kweku Adoboli): unauthorised position-taking, P&L manipulation, log falsification
- ML facilitation pattern (Mossack Fonseca-style): insider leaking beneficial ownership data, client KYC files, or creating shell structure documentation for criminal clients
- Data theft for competitor: bulk export of customer lists, pricing data, IP — often preceding resignation
- Expense fraud at scale: systematic manipulation of expense claims, fictitious vendors, supplier kickbacks
- Account takeover facilitation: employee providing account credentials or bypassing authentication controls for criminal third parties
- Sanctions circumvention facilitation: deliberately misprocessing sanctions alerts, bypassing screening, accepting payments from SDN parties

BEHAVIOURAL INDICATORS (WEIGHTED):
High-weight: bulk data export, log deletion, privilege escalation, unexplained wealth, gambling debt, coercive contact
Medium-weight: unusual hours, VPN anomalies, lifestyle inflation, disciplinary history, grievances
Lower-weight: training non-completion, minor policy breaches, job dissatisfaction statements

UAE-SPECIFIC CONTEXT:
- UAE FDL 10/2025 Art.26 — mandatory whistleblower protection; institutions must have reporting channels
- CBUAE staff screening requirements — fitness and propriety for all roles with AML responsibilities
- UAE labour law constraints on suspension — must follow procedures to avoid wrongful termination claims
- Dubai Police Financial Crimes Unit — route for criminal referrals
- UAE FIU (goAML) — STR filing if ML facilitation confirmed
- CBUAE breach reporting obligations if institutional AML failure confirmed

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "ok": true,
  "insiderThreatScore": <0-100 integer>,
  "riskTier": "low"|"medium"|"high"|"critical",
  "threatCategory": ["financial_crime_facilitation"|"data_theft"|"fraud"|"sabotage"|"regulatory_breach"],
  "miceAnalysis": {
    "money": {"score":<0-100>,"indicators":["string"]},
    "ideology": {"score":<0-100>,"indicators":["string"]},
    "coercion": {"score":<0-100>,"indicators":["string"]},
    "ego": {"score":<0-100>,"indicators":["string"]}
  },
  "behaviouralRiskProfile": {
    "stressors": ["string"],
    "warningBehaviours": ["string"],
    "escalationRisk": "stable"|"increasing"|"imminent"
  },
  "systemicRisk": {
    "accessRisk": "string",
    "dataExfiltrationRisk": "string",
    "fraudRisk": "string",
    "mlFacilitationRisk": "string"
  },
  "financialProfile": "string",
  "complianceRiskHistory": "string",
  "recommendedControls": [{"control":"string","urgency":"immediate"|"within_24h"|"within_week","owner":"string"}],
  "hrActions": ["string"],
  "investigativeSteps": ["string"],
  "redFlags": ["string"],
  "recommendation": "no_action"|"enhanced_monitoring"|"restrict_access"|"hr_investigation"|"suspend_pending_investigation"|"report_to_regulators",
  "escalationPath": ["string"],
  "summary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Assess this insider threat profile:

Employee: ${body.employee ?? "not specified"}
Role: ${body.role ?? "not specified"}
Department: ${body.department ?? "not specified"}
Access Level: ${body.accessLevel ?? "not specified"}
Years at Firm: ${body.yearsAtFirm ?? "not specified"}
Recent Life Events: ${JSON.stringify(body.recentLifeEvents ?? [])}
Behavioural Indicators: ${JSON.stringify(body.behaviouralIndicators ?? [])}
System Access Anomalies: ${JSON.stringify(body.systemAccessAnomalies ?? {})}
Financial Indicators: ${JSON.stringify(body.financialIndicators ?? {})}
Compliance History: ${JSON.stringify(body.complianceHistory ?? {})}
Additional Context: ${body.context ?? "none"}

Perform a comprehensive insider threat assessment using the MICE model and CERT MERIT framework. Evaluate all risk dimensions, assign scores, and provide a prioritised response plan including HR actions, technical controls, and regulatory obligations.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as InsiderThreatResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "insider-threat temporarily unavailable - please retry." }, { status: 503 });
  }
}
