export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export interface NetworkMapResult {
  networkRisk: "critical" | "high" | "medium" | "low" | "clear";
  entityCount: number;
  clusterCount: number;
  nodes: Array<{
    id: string;
    name: string;
    type: "individual" | "corporate" | "account" | "address";
    riskLevel: "high" | "medium" | "low";
    flags: string[];
  }>;
  connections: Array<{
    from: string;
    to: string;
    linkType: "director" | "shareholder" | "address" | "transaction" | "family" | "other";
    strength: "confirmed" | "suspected";
    detail: string;
  }>;
  keyHubs: string[];
  circularOwnership: boolean;
  layeringLikelihood: "high" | "medium" | "low" | "none";
  shellNetworkRisk: boolean;
  recommendedAction: "escalate_mlro" | "enhanced_dd" | "file_str" | "monitor" | "clear";
  actionRationale: string;
  regulatoryBasis: string;
}

const FALLBACK: NetworkMapResult = {
  networkRisk: "high",
  entityCount: 6,
  clusterCount: 3,
  nodes: [
    {
      id: "N1",
      name: "Ahmed Al-Rashidi (Individual)",
      type: "individual",
      riskLevel: "high",
      flags: ["PEP — former government official", "Adverse media — corruption allegation 2022", "Director of 4 UAE companies"],
    },
    {
      id: "N2",
      name: "Rashidi Trading LLC (UAE)",
      type: "corporate",
      riskLevel: "high",
      flags: ["Sole director: N1", "Registered address shared with N4 and N5", "High-volume cash transactions"],
    },
    {
      id: "N3",
      name: "Al-Noor Investments Ltd (BVI)",
      type: "corporate",
      riskLevel: "high",
      flags: ["Bearer shares — beneficial owner unconfirmed", "Registered agent only — no physical presence", "Recipient of AED 4.2M from N2"],
    },
    {
      id: "N4",
      name: "Horizon General Trading LLC (UAE)",
      type: "corporate",
      riskLevel: "medium",
      flags: ["Director: spouse of N1 (family link)", "Shared registered address with N2", "AED 1.8M received from N3"],
    },
    {
      id: "N5",
      name: "Gulf Property Holdings LLC (UAE)",
      type: "corporate",
      riskLevel: "high",
      flags: ["Shareholder: N3 (80%)", "Purchased 3 Dubai properties in 12 months", "All-cash transactions"],
    },
    {
      id: "N6",
      name: "Shared Registered Address — Business Centre, DMCC",
      type: "address",
      riskLevel: "medium",
      flags: ["Used by N2, N4, and two other entities not yet profiled", "Virtual office only"],
    },
  ],
  connections: [
    {
      from: "N1",
      to: "N2",
      linkType: "director",
      strength: "confirmed",
      detail: "N1 is sole director and 100% shareholder of Rashidi Trading LLC per UAE MoE company extract",
    },
    {
      from: "N2",
      to: "N3",
      linkType: "transaction",
      strength: "confirmed",
      detail: "AED 4,200,000 wire transferred from N2 to N3 BVI account over 8 months with reference 'consulting fees' — no supporting contracts identified",
    },
    {
      from: "N3",
      to: "N4",
      linkType: "transaction",
      strength: "confirmed",
      detail: "AED 1,800,000 returned from N3 (BVI) to N4 (UAE) within 45 days — round-trip transaction pattern",
    },
    {
      from: "N1",
      to: "N4",
      linkType: "family",
      strength: "confirmed",
      detail: "N4 director is spouse of N1 per Emirates ID records — family connection creates related-party risk",
    },
    {
      from: "N3",
      to: "N5",
      linkType: "shareholder",
      strength: "confirmed",
      detail: "N3 (BVI) holds 80% of N5 (UAE property company) — BVI vehicle controls UAE real estate assets, obscuring beneficial ownership",
    },
    {
      from: "N2",
      to: "N6",
      linkType: "address",
      strength: "confirmed",
      detail: "N2 and N4 share virtual office address at DMCC Business Centre — address clustering indicates coordinated corporate structure",
    },
  ],
  keyHubs: ["N1 (Ahmed Al-Rashidi) — controls N2 directly and N4 via family link, creating two-branch network", "N3 (BVI entity) — intermediate pass-through connecting UAE trading operations to property holdings"],
  circularOwnership: true,
  layeringLikelihood: "high",
  shellNetworkRisk: true,
  recommendedAction: "escalate_mlro",
  actionRationale: "Network exhibits circular ownership (UAE → BVI → UAE), PEP hub individual, round-trip fund flows, and property integration consistent with a structured ML network. MLRO must assess STR obligation and consider whether enhanced group-level due diligence is required.",
  regulatoryBasis: "UAE FDL 10/2025 Art.11 (beneficial ownership), Art.14 (EDD), Art.17 (STR); Cabinet Decision 58/2020 (UBO Register); FATF R.24/25 (transparency of legal persons); FATF Guidance on Beneficial Ownership (2023)",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    entities: string;
    sharedAddresses?: string;
    sharedDirectors?: string;
    sharedAccounts?: string;
    transactionLinks?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  if (!body.entities?.trim()) return NextResponse.json({ ok: false, error: "entities required" }, { status: 400 , headers: gate.headers});

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "network-mapper temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `You are a UAE AML network analysis specialist with expertise in entity relationship mapping, corporate structure analysis, and ML network identification. Map entities, identify connections (director, shareholder, address, transaction, family), detect circular ownership, shell network patterns, and layering structures. Apply UAE FDL 10/2025 beneficial ownership requirements and FATF R.24/25 transparency standards. Assign unique node IDs (N1, N2, etc.) to each entity. Respond ONLY with valid JSON matching the NetworkMapResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Entities (names/roles/descriptions): ${body.entities}
Shared Addresses: ${body.sharedAddresses ?? "not provided"}
Shared Directors/Officers: ${body.sharedDirectors ?? "not provided"}
Shared Accounts: ${body.sharedAccounts ?? "not provided"}
Transaction Links: ${body.transactionLinks ?? "not provided"}
Additional Context: ${body.context ?? "none"}

Map this entity network and identify ML risk connections. Return complete NetworkMapResult JSON.`,
        }],
      });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as NetworkMapResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "network-mapper temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
