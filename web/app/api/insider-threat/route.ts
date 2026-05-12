// POST /api/insider-threat
//
// Insider Threat Sentinel — full pattern monitoring upgrade.
//
// Two modes:
//   assess   — Single assessment using MICE + CERT MERIT framework
//   monitor  — Compare current snapshot against stored baseline;
//               return delta signals and escalation triggers
//
// Persistent profiles are stored in Netlify Blobs under
// "insider-threat/profile/<employeeId>" so threat trajectory
// can be tracked over time.
//
// Monitors for: MICE score drift, new warning behaviours,
// financial indicator changes, access anomaly escalation,
// and behavioural escalation risk transitions.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { getJson, setJson } from "@/lib/server/store";

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

interface ThreatProfile {
  employeeId: string;
  firstAssessedAt: string;
  lastAssessedAt: string;
  assessmentCount: number;
  scoreHistory: Array<{ assessedAt: string; score: number; riskTier: string; escalationRisk: string }>;
  latestResult: InsiderThreatResult;
  deltaSignals?: string[];
  escalationTriggered?: boolean;
}

async function loadProfile(employeeId: string): Promise<ThreatProfile | null> {
  try {
    return await getJson<ThreatProfile>(`insider-threat/profile/${employeeId}`);
  } catch { return null; }
}

async function saveProfile(profile: ThreatProfile): Promise<void> {
  try {
    await setJson(`insider-threat/profile/${profile.employeeId}`, profile);
  } catch { /* best effort — profile persistence is non-blocking */ }
}

function computeDeltaSignals(previous: InsiderThreatResult, current: InsiderThreatResult): string[] {
  const signals: string[] = [];
  const scoreDelta = current.insiderThreatScore - previous.insiderThreatScore;
  if (scoreDelta >= 15) signals.push(`Threat score escalated +${scoreDelta} points (${previous.insiderThreatScore} → ${current.insiderThreatScore})`);
  if (scoreDelta <= -15) signals.push(`Threat score decreased ${scoreDelta} points — possible de-escalation`);

  const tierOrder = ["low", "medium", "high", "critical"];
  const prevTierIdx = tierOrder.indexOf(previous.riskTier);
  const currTierIdx = tierOrder.indexOf(current.riskTier);
  if (currTierIdx > prevTierIdx) signals.push(`Risk tier escalated: ${previous.riskTier} → ${current.riskTier}`);

  const escalationOrder = ["stable", "increasing", "imminent"];
  const prevEsc = escalationOrder.indexOf(previous.behaviouralRiskProfile.escalationRisk);
  const currEsc = escalationOrder.indexOf(current.behaviouralRiskProfile.escalationRisk);
  if (currEsc > prevEsc) signals.push(`Escalation risk worsened: ${previous.behaviouralRiskProfile.escalationRisk} → ${current.behaviouralRiskProfile.escalationRisk}`);

  const prevMiceMax = Math.max(previous.miceAnalysis.money.score, previous.miceAnalysis.ideology.score, previous.miceAnalysis.coercion.score, previous.miceAnalysis.ego.score);
  const currMiceMax = Math.max(current.miceAnalysis.money.score, current.miceAnalysis.ideology.score, current.miceAnalysis.coercion.score, current.miceAnalysis.ego.score);
  if (currMiceMax - prevMiceMax >= 20) signals.push(`MICE peak score increased +${currMiceMax - prevMiceMax} points`);

  const newBehaviours = current.behaviouralRiskProfile.warningBehaviours.filter(
    (b) => !previous.behaviouralRiskProfile.warningBehaviours.some((pb) => pb.slice(0, 30) === b.slice(0, 30))
  );
  if (newBehaviours.length > 0) signals.push(`${newBehaviours.length} new warning behaviour(s) detected`);

  const newFlags = current.redFlags.filter(
    (f) => !previous.redFlags.some((pf) => pf.slice(0, 30) === f.slice(0, 30))
  );
  if (newFlags.length > 0) signals.push(`${newFlags.length} new red flag(s) since last assessment`);

  const recEscalated = ["suspend_pending_investigation", "report_to_regulators"].includes(current.recommendation) &&
    !["suspend_pending_investigation", "report_to_regulators"].includes(previous.recommendation);
  if (recEscalated) signals.push(`Recommendation escalated to: ${current.recommendation}`);

  return signals;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: {
    mode?: "assess" | "monitor";
    employeeId?: string;
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "insider-threat temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
  }

  const mode = body.mode ?? "assess";
  const employeeId = body.employeeId ?? body.employee ?? `emp-${Date.now()}`;

  // Load previous profile for monitor mode
  const previousProfile = mode === "monitor" ? await loadProfile(employeeId) : null;

  try {
    const client = getAnthropicClient(apiKey, 55_000, "insider-threat");
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

FRAMEWORKS & MODELS:
1. MICE Model (Money, Ideology, Coercion, Ego) — primary motivation assessment
2. CERT Insider Threat Center MERIT Model — trajectory analysis
3. UEBA indicators: off-hours access, bulk data export, privilege escalation, log deletion, VPN anomaly
4. DLP triggers: large file transfers, USB activity, unusual API calls

UAE-SPECIFIC CONTEXT:
- UAE FDL 10/2025 Art.26 — mandatory whistleblower protection
- CBUAE staff screening requirements — fitness and propriety
- Dubai Police Financial Crimes Unit — criminal referral route
- UAE FIU (goAML) — STR filing if ML facilitation confirmed

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
          content: `Assess this insider threat profile${mode === "monitor" && previousProfile ? " (MONITORING — compare against baseline)" : ""}:

Employee ID: ${employeeId}
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
${mode === "monitor" && previousProfile ? `\nPREVIOUS ASSESSMENT (${previousProfile.lastAssessedAt}):\nPrevious Score: ${previousProfile.latestResult.insiderThreatScore}\nPrevious Risk Tier: ${previousProfile.latestResult.riskTier}\nPrevious Escalation Risk: ${previousProfile.latestResult.behaviouralRiskProfile.escalationRisk}` : ""}

Perform a comprehensive insider threat assessment using the MICE model and CERT MERIT framework.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as InsiderThreatResult;

    // Update persistent profile
    const now = new Date().toISOString();
    const deltaSignals = previousProfile ? computeDeltaSignals(previousProfile.latestResult, result) : [];
    const escalationTriggered = deltaSignals.some((s) => s.includes("escalated") || s.includes("imminent") || s.includes("critical"));

    const updatedProfile: ThreatProfile = {
      employeeId,
      firstAssessedAt: previousProfile?.firstAssessedAt ?? now,
      lastAssessedAt: now,
      assessmentCount: (previousProfile?.assessmentCount ?? 0) + 1,
      scoreHistory: [
        ...(previousProfile?.scoreHistory ?? []).slice(-19), // keep last 20
        { assessedAt: now, score: result.insiderThreatScore, riskTier: result.riskTier, escalationRisk: result.behaviouralRiskProfile.escalationRisk },
      ],
      latestResult: result,
      deltaSignals,
      escalationTriggered,
    };

    void saveProfile(updatedProfile).catch(() => {});

    return NextResponse.json({
      ...result,
      mode,
      employeeId,
      assessmentCount: updatedProfile.assessmentCount,
      ...(mode === "monitor" && previousProfile ? {
        deltaSignals,
        escalationTriggered,
        previousScore: previousProfile.latestResult.insiderThreatScore,
        scoreDelta: result.insiderThreatScore - previousProfile.latestResult.insiderThreatScore,
        scoreHistory: updatedProfile.scoreHistory,
      } : {}),
    }, { headers: gate.headers });

  } catch {
    return NextResponse.json({ ok: false, error: "insider-threat temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
  }
}
