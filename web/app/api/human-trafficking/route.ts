export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "human-trafficking temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are an elite UAE MLRO and human trafficking financial intelligence specialist. Detect human trafficking typologies in financial and entity data. Return ONLY valid JSON matching HumanTraffickingResult — no markdown fences.`,
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

Perform a comprehensive human trafficking money laundering risk assessment.`,
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
