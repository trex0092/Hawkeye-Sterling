export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.entities?.trim()) return NextResponse.json({ ok: false, error: "entities required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "network-mapper temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE AML network analysis specialist with expertise in entity relationship mapping, corporate structure analysis, and ML network identification. Map entities, identify connections (director, shareholder, address, transaction, family), detect circular ownership, shell network patterns, and layering structures. Apply UAE FDL 10/2025 beneficial ownership requirements and FATF R.24/25 transparency standards. Assign unique node IDs (N1, N2, etc.) to each entity. Respond ONLY with valid JSON matching the NetworkMapResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Entities (names/roles/descriptions): ${sanitizeText(body.entities, 3000)}
Shared Addresses: ${sanitizeField(body.sharedAddresses ?? "not provided", 1000)}
Shared Directors/Officers: ${sanitizeField(body.sharedDirectors ?? "not provided", 1000)}
Shared Accounts: ${sanitizeField(body.sharedAccounts ?? "not provided", 500)}
Transaction Links: ${sanitizeField(body.transactionLinks ?? "not provided", 500)}
Additional Context: ${sanitizeText(body.context ?? "none", 2000)}

Map this entity network and identify ML risk connections. Return complete NetworkMapResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as NetworkMapResult;
    // Normalize arrays — LLM occasionally returns null/undefined instead of [].
    if (!Array.isArray(result.nodes)) result.nodes = [];
    if (!Array.isArray(result.connections)) result.connections = [];
    if (!Array.isArray(result.keyHubs)) result.keyHubs = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.error("[network-mapper] LLM call failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "network-mapper temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
