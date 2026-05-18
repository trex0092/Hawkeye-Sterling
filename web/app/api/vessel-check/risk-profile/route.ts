export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";

// Audit M-05: GET requests previously got the Next.js default bare 405 with no
// body, leaving operators to guess the correct method. Return a friendly
// 405 that names the right method + endpoint.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: "Method Not Allowed",
      message: "POST /api/vessel-check/risk-profile with body { vesselName?, imo?, flag?, owner?, operator?, lastPorts?, cargoTypes?, sanctionedConnections? }. See /api/routes for the public endpoint index.",
    },
    { status: 405, headers: { allow: "POST" } },
  );
}
export type RiskTier = "Low" | "Medium" | "High" | "Critical";

export interface VesselRiskProfileResult {
  ok: true;
  riskScore: number;
  riskTier: RiskTier;
  flagRisk: number;
  ownershipRisk: number;
  portRisk: number;
  cargoRisk: number;
  anomalies: string[];
  recommendation: string;
  regulatoryBasis: string;
  summary: string;
}

const FALLBACK: VesselRiskProfileResult = {
  ok: true,
  riskScore: 45,
  riskTier: "Medium",
  flagRisk: 50,
  ownershipRisk: 55,
  portRisk: 40,
  cargoRisk: 35,
  anomalies: [
    "Vessel flag state has limited AIS monitoring capacity",
    "Beneficial ownership chain not fully transparent",
    "Port call history includes one jurisdiction subject to enhanced monitoring",
  ],
  recommendation: "Enhanced Monitoring",
  regulatoryBasis:
    "FATF Recommendation 14 (Wire Transfers); UAE Cabinet Resolution 74/2020; OFAC SDN guidance on maritime; IMO Resolution A.1159(32) on AIS; BIMCO due diligence guidelines",
  summary:
    "The vessel presents a medium risk profile based on flag state risk, ownership opacity, and port call history. No direct sanction connections identified, however the ownership structure warrants enhanced due diligence. Continued AIS monitoring is recommended. No cargo concerns identified at this stage.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    vesselName?: string;
    imo?: string;
    flag?: string;
    owner?: string;
    operator?: string;
    lastPorts?: string[];
    cargoTypes?: string[];
    sanctionedConnections?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  if (!body.vesselName && !body.imo) {
    return NextResponse.json(
      { ok: false, error: "vesselName or imo is required" },
      { status: 400, headers: gate.headers }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "vessel-check/risk-profile temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a maritime AML and sanctions risk expert specialising in vessel due diligence, AIS pattern analysis, and trade-based money laundering (TBML) detection. Your role is to generate structured vessel risk profiles for compliance purposes under FATF, UAE, and international maritime frameworks.

Return ONLY valid JSON with this exact structure (no markdown fences, no commentary):
{
  "ok": true,
  "riskScore": 0-100,
  "riskTier": "Low"|"Medium"|"High"|"Critical",
  "flagRisk": 0-100,
  "ownershipRisk": 0-100,
  "portRisk": 0-100,
  "cargoRisk": 0-100,
  "anomalies": ["AIS or behavioural anomaly description", "..."],
  "recommendation": "Clear"|"Enhanced Monitoring"|"Block"|"File STR",
  "regulatoryBasis": "Comma-separated list of applicable regulations and frameworks",
  "summary": "2-4 sentence narrative summarising overall risk assessment"
}

Scoring guidance:
- riskScore 0-25 = Low, 26-50 = Medium, 51-75 = High, 76-100 = Critical
- flagRisk: assess FATF grey/blacklist status, open registry risks, monitoring capacity
- ownershipRisk: assess beneficial ownership transparency, shell company indicators, sanctioned owner/operator
- portRisk: assess sanctioned port calls, high-risk jurisdiction stops, dark period indicators (gaps in AIS suggesting signal loss)
- cargoRisk: assess dual-use goods, sanctioned commodities, TBML-typical cargo types
- anomalies: include AIS dark periods, high-risk port calls, route deviations, STS transfers, rapid flag/name changes
- recommendation: Clear = no action; Enhanced Monitoring = ongoing AIS and transaction monitoring; Block = refuse to deal; File STR = suspicious transaction report required
- regulatoryBasis: cite FATF R.14, UAE Cabinet Resolution 74/2020, OFAC maritime guidance, IMO conventions as applicable`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Vessel Details:
- Name: ${body.vesselName ?? "Unknown"}
- IMO: ${body.imo ?? "Not provided"}
- Flag State: ${body.flag ?? "Unknown"}
- Registered Owner: ${body.owner ?? "Unknown"}
- Operator: ${body.operator ?? "Unknown"}
- Last Known Ports: ${body.lastPorts?.join(", ") || "No port history provided"}
- Cargo Types: ${body.cargoTypes?.join(", ") || "Unknown"}
- Sanctioned Connections: ${body.sanctionedConnections ? "Yes — direct sanctioned connection identified" : "No direct sanction connections identified"}

Generate a comprehensive vessel risk profile including AIS pattern anomaly analysis, risk scoring across all four dimensions, and a compliance recommendation with regulatory basis.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as VesselRiskProfileResult;
    if (!Array.isArray(result.anomalies)) result.anomalies = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "vessel-check/risk-profile temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
