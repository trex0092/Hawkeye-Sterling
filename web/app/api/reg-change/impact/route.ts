export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
export interface ImpactAssessmentResult {
  ok: true;
  regulation: string;
  overallImpact: "low" | "medium" | "high" | "critical";
  impactScore: number; // 0–100
  businessImpact: {
    operationalChanges: string[];
    systemChanges: string[];
    staffingNeeds: string[];
    estimatedCost: string;
    implementationMonths: number;
  };
  legalRisk: {
    penaltyExposure: string;
    reputationalRisk: string;
    licenceRisk: boolean;
    details: string;
  };
  keyObligations: Array<{
    obligation: string;
    deadline: string;
    owner: string;
    complexity: "low" | "medium" | "high";
  }>;
  implementationRoadmap: Array<{
    phase: string;
    duration: string;
    actions: string[];
    dependencies: string[];
  }>;
  gaps: string[];
  quickWins: string[];
  executiveSummary: string;
}

const FALLBACK: ImpactAssessmentResult = {
  ok: true,
  regulation: "EU Digital Operational Resilience Act (DORA)",
  overallImpact: "high",
  impactScore: 78,
  businessImpact: {
    operationalChanges: [
      "ICT risk management framework must be documented and board-approved",
      "ICT-related incident classification and reporting procedures required within 4 hours / 24 hours / 1 month",
      "Business continuity plans must specifically address ICT scenarios",
      "All critical ICT third-party providers must be registered and contractually compliant",
    ],
    systemChanges: [
      "Implement automated ICT incident detection and classification system",
      "Deploy TLPT (Threat-Led Penetration Testing) capability for significant firms",
      "Upgrade third-party ICT vendor management platform to capture DORA-required contractual provisions",
      "Establish resilience testing dashboard for board reporting",
    ],
    staffingNeeds: [
      "Appoint dedicated DORA compliance lead (internal or contracted)",
      "Train ICT risk management team on DORA framework requirements",
      "Brief board on DORA accountability requirements — minimum one board member with ICT risk expertise",
    ],
    estimatedCost: "€150,000–€500,000 depending on firm size and existing ICT maturity",
    implementationMonths: 6,
  },
  legalRisk: {
    penaltyExposure: "Up to 1% of average daily global turnover for breaches; 2% for systematic breaches",
    reputationalRisk: "Failure to implement DORA could result in regulatory censure, public sanctions notice, and loss of operating licence in severe cases",
    licenceRisk: true,
    details: "DORA is directly applicable EU law. Non-compliance by the January 2025 deadline could trigger supervisory action by national competent authority. Significant firms face additional TLPT requirements.",
  },
  keyObligations: [
    {
      obligation: "ICT Risk Management Framework (Art. 5–16)",
      deadline: "2025-01-17",
      owner: "CRO / IT Director",
      complexity: "high",
    },
    {
      obligation: "ICT-related Incident Reporting — Major Incidents to NCA within 4 hours initial / 24h interim / 1 month final",
      deadline: "2025-01-17",
      owner: "CRO / CISO",
      complexity: "high",
    },
    {
      obligation: "Digital Operational Resilience Testing Programme",
      deadline: "2025-01-17",
      owner: "IT Director",
      complexity: "medium",
    },
    {
      obligation: "ICT Third-Party Risk Management — register all ICT providers, update contracts",
      deadline: "2025-01-17",
      owner: "Procurement / Legal",
      complexity: "high",
    },
    {
      obligation: "Board Information and Reporting — minimum annual DORA report to management body",
      deadline: "Ongoing from 2025",
      owner: "Board / Senior Management",
      complexity: "low",
    },
  ],
  implementationRoadmap: [
    {
      phase: "Phase 1: Gap Analysis & Foundation (Months 1–2)",
      duration: "8 weeks",
      actions: [
        "Commission DORA gap analysis against current ICT risk framework",
        "Map all critical ICT third-party providers",
        "Draft ICT Risk Management Policy",
        "Appoint DORA programme lead",
      ],
      dependencies: ["Board mandate and budget approval"],
    },
    {
      phase: "Phase 2: Framework Build (Months 2–4)",
      duration: "8 weeks",
      actions: [
        "Implement ICT incident classification taxonomy",
        "Develop incident reporting runbook (4h/24h/1 month templates)",
        "Update ICT third-party contracts with DORA-required provisions",
        "Complete digital operational resilience testing baseline",
      ],
      dependencies: ["Gap analysis completion", "Legal review of contracts"],
    },
    {
      phase: "Phase 3: Testing & Board Sign-Off (Months 4–6)",
      duration: "8 weeks",
      actions: [
        "Conduct tabletop ICT resilience exercise",
        "Submit ICT Risk Management Framework to board for approval",
        "Register all ICT providers in vendor management system",
        "Complete staff training on DORA obligations",
      ],
      dependencies: ["Framework build completion", "Board meeting scheduled"],
    },
  ],
  gaps: [
    "No documented ICT risk management framework aligned to DORA taxonomy",
    "ICT incident reporting procedures do not meet DORA's 4-hour initial notification requirement",
    "Third-party ICT vendor contracts lack mandatory DORA clauses (Art. 30)",
    "No formal digital operational resilience testing programme in place",
  ],
  quickWins: [
    "Identify and document the register of critical ICT third-party providers (1 week)",
    "Adapt existing BCP templates to add ICT-specific scenarios (2 weeks)",
    "Draft board mandate and appoint DORA programme lead (1 week)",
  ],
  executiveSummary: "DORA represents a significant compliance obligation for all EU-regulated financial entities with a non-extendable January 2025 deadline. The institution faces a high impact assessment given the current maturity gaps in ICT risk management framework documentation, incident reporting, and third-party oversight. An estimated 6-month implementation programme is required at a cost of €150,000–€500,000. Board approval of the implementation budget and appointment of a dedicated DORA lead are the critical first steps. Non-compliance could result in supervisory action and penalties of up to 1% of global daily turnover.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    regulation?: string;
    institution?: {
      type?: string;
      jurisdictions?: string[];
      products?: string[];
      clientTypes?: string[];
    };
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "reg-change/impact temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: `You are a financial services regulatory implementation expert. Produce a deep-dive impact assessment for a specific regulation as it applies to the given institution. Be precise, practical and actionable. Today's date is 2025-05-01.

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "regulation": "string",
  "overallImpact": "low"|"medium"|"high"|"critical",
  "impactScore": number (0-100),
  "businessImpact": {
    "operationalChanges": ["string"],
    "systemChanges": ["string"],
    "staffingNeeds": ["string"],
    "estimatedCost": "string",
    "implementationMonths": number
  },
  "legalRisk": {
    "penaltyExposure": "string",
    "reputationalRisk": "string",
    "licenceRisk": boolean,
    "details": "string"
  },
  "keyObligations": [{"obligation":"string","deadline":"string","owner":"string","complexity":"low"|"medium"|"high"}],
  "implementationRoadmap": [{"phase":"string","duration":"string","actions":["string"],"dependencies":["string"]}],
  "gaps": ["string"],
  "quickWins": ["string"],
  "executiveSummary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Regulation: ${sanitizeField(body.regulation ?? "Unknown regulation", 500)}

Institution profile:
Type: ${sanitizeField(body.institution?.type ?? "Financial institution", 200)}
Jurisdictions: ${sanitizeField(JSON.stringify(body.institution?.jurisdictions ?? []), 500)}
Products: ${sanitizeField(JSON.stringify(body.institution?.products ?? []), 500)}
Client Types: ${sanitizeField(JSON.stringify(body.institution?.clientTypes ?? []), 500)}

Produce a comprehensive impact assessment for how this regulation affects this specific institution. Include all material obligations, implementation roadmap, cost/resource estimates, legal risk exposure, gaps to remediate, and quick wins.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as ImpactAssessmentResult;
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "reg-change/impact temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
