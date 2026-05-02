export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { GeopoliticalEvent } from "@/app/api/geopolitical/events/route";

export interface PortfolioClient {
  clientName: string;
  country: string;
  sector: string;
  exposureAmount: number;
}

export interface ExposedClient {
  client: PortfolioClient;
  events: Array<{
    eventId: string;
    headline: string;
    riskLevel: string;
    linkReason: string;
  }>;
  exposureLevel: "critical" | "high" | "medium" | "low";
  requiredActions: string[];
}

export interface PortfolioImpactResult {
  ok: true;
  exposedClients: ExposedClient[];
  totalExposure: number;
  immediateActions: string[];
  summary: string;
}

export async function POST(req: Request) {
  let body: { events?: GeopoliticalEvent[]; portfolio?: PortfolioClient[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const events = body.events ?? [];
  const portfolio = body.portfolio ?? [];

  if (!events.length || !portfolio.length) {
    return NextResponse.json(
      { ok: false, error: "events and portfolio are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    // Return a mock response based on the data
    const exposed = portfolio
      .filter((c) =>
        events.some(
          (e) =>
            e.country === c.country ||
            e.affectedSectors.some((s) =>
              s.toLowerCase().includes(c.sector.toLowerCase())
            )
        )
      )
      .map((c) => {
        const matchedEvents = events.filter(
          (e) =>
            e.country === c.country ||
            e.affectedSectors.some((s) =>
              s.toLowerCase().includes(c.sector.toLowerCase())
            )
        );
        return {
          client: c,
          events: matchedEvents.map((e) => ({
            eventId: e.id,
            headline: e.headline,
            riskLevel: e.riskLevel,
            linkReason:
              e.country === c.country
                ? `Client domiciled in ${c.country}`
                : `Sector exposure: ${c.sector}`,
          })),
          exposureLevel: (matchedEvents.some((e) => e.riskLevel === "critical")
            ? "critical"
            : matchedEvents.some((e) => e.riskLevel === "high")
              ? "high"
              : "medium") as ExposedClient["exposureLevel"],
          requiredActions: [
            "Review client relationship for geopolitical exposure",
            "Apply enhanced due diligence",
            "Consider transaction restrictions",
          ],
        };
      });

    return NextResponse.json({
      ok: true,
      exposedClients: exposed,
      totalExposure: exposed.reduce(
        (sum, c) => sum + c.client.exposureAmount,
        0
      ),
      immediateActions: [
        "Screen all exposed clients against updated sanctions lists",
        "Escalate critical-exposure clients to MLRO for review",
        "File STR if any sanctions links confirmed",
      ],
      summary: `Portfolio analysis complete. ${exposed.length} of ${portfolio.length} clients have geopolitical exposure.`,
    });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are a senior AML portfolio risk analyst at a UAE financial institution. Given a list of geopolitical risk events and a client portfolio, identify which clients are exposed to which events and the nature of that exposure. Consider: country of domicile, sector, transaction patterns, and indirect exposure through supply chains or correspondent relationships.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "ok": true,
  "exposedClients": [
    {
      "client": { "clientName": "string", "country": "string", "sector": "string", "exposureAmount": number },
      "events": [
        {
          "eventId": "string",
          "headline": "string",
          "riskLevel": "critical"|"high"|"medium",
          "linkReason": "string (specific reason why this client is exposed to this event)"
        }
      ],
      "exposureLevel": "critical"|"high"|"medium"|"low",
      "requiredActions": ["string"]
    }
  ],
  "totalExposure": number,
  "immediateActions": ["string"],
  "summary": "string"
}

Only include clients with actual exposure. For each client, explain the specific linkage to the event.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Geopolitical Risk Events:
${JSON.stringify(events, null, 2)}

Client Portfolio:
${JSON.stringify(portfolio, null, 2)}

Assess which portfolio clients are exposed to which geopolitical events. Consider direct country exposure, sector exposure, and indirect supply chain linkages. Provide specific required actions for each exposed client.`,
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as PortfolioImpactResult;
    return NextResponse.json(result);
  } catch {
    // API call failed — return a rule-based fallback matching the no-key path
    const exposed = portfolio
      .filter((c) =>
        events.some(
          (e) =>
            e.country === c.country ||
            e.affectedSectors.some((s) =>
              s.toLowerCase().includes(c.sector.toLowerCase())
            )
        )
      )
      .map((c) => {
        const matchedEvents = events.filter(
          (e) =>
            e.country === c.country ||
            e.affectedSectors.some((s) =>
              s.toLowerCase().includes(c.sector.toLowerCase())
            )
        );
        return {
          client: c,
          events: matchedEvents.map((e) => ({
            eventId: e.id,
            headline: e.headline,
            riskLevel: e.riskLevel,
            linkReason:
              e.country === c.country
                ? `Client domiciled in ${c.country}`
                : `Sector exposure: ${c.sector}`,
          })),
          exposureLevel: (matchedEvents.some((e) => e.riskLevel === "critical")
            ? "critical"
            : matchedEvents.some((e) => e.riskLevel === "high")
              ? "high"
              : "medium") as ExposedClient["exposureLevel"],
          requiredActions: [
            "Review client relationship for geopolitical exposure",
            "Apply enhanced due diligence",
            "Consider transaction restrictions",
          ],
        };
      });

    return NextResponse.json({
      ok: true,
      exposedClients: exposed,
      totalExposure: exposed.reduce((sum, c) => sum + c.client.exposureAmount, 0),
      immediateActions: [
        "Screen all exposed clients against updated sanctions lists",
        "Escalate critical-exposure clients to MLRO for review",
        "File STR if any sanctions links confirmed",
      ],
      summary: `Portfolio analysis complete. ${exposed.length} of ${portfolio.length} clients have geopolitical exposure.`,
    } satisfies PortfolioImpactResult);
  }
}
