// POST /api/pep-network
//
// Deep PEP Network Builder — graph traversal up to 4 hops.
//
// Given a PEP subject, builds the full relationship network:
//   Hop 1 — Immediate family (FATF R.12 mandatory screening)
//   Hop 2 — Extended family + known business associates
//   Hop 3 — Corporate entities + beneficial ownership interests
//   Hop 4 — Shell/nominee structures + known associates-of-associates
//
// For each discovered node, generates: role, screening priority,
// ML risk indicators, source of wealth red flags, and regulatory basis.
//
// Also performs: FATF typology matching, jurisdiction risk overlay,
// and produces a full EDD requirements checklist.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface NetworkNode {
  id: string;
  name: string;
  nodeType: "person" | "entity" | "account" | "jurisdiction";
  hopDistance: 1 | 2 | 3 | 4;
  relationship: string;
  screeningPriority: "mandatory" | "high" | "recommended" | "optional";
  riskIndicators: string[];
  mlTypologies: string[];
  fatfBasis: string;
  eddRequired: boolean;
}

interface PepNetworkDeepResult {
  pepName: string;
  pepCategory: string;
  pepRiskRating: "critical" | "high" | "medium";
  networkDepth: number;
  totalNodesDiscovered: number;
  networkNodes: NetworkNode[];
  mandatoryScreeningCount: number;
  typicalMlRisks: string[];
  jurisdictionalRisks: string[];
  eddRequirements: string[];
  eddChecklist: Array<{ item: string; legalBasis: string; priority: "critical" | "high" | "medium" }>;
  seniorManagementApprovalRequired: boolean;
  ongoingMonitoringFrequency: "monthly" | "quarterly" | "annually";
  exitTriggers: string[];
  networkRiskNarrative: string;
  regulatoryBasis: string;
  graphSummary: { hop1Count: number; hop2Count: number; hop3Count: number; hop4Count: number };
}

interface Body {
  pepName?: string;
  subject?: string;
  role?: string;
  country?: string;
  party?: string;
  tenure?: string;
  networkDepth?: 1 | 2 | 3 | 4;  // default 4
  focusTypologies?: string[];      // restrict LLM focus to specific ML typologies
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "pep-network temporarily unavailable — please retry." }, { status: 503, headers: gate.headers });
  }

  let body: Body;
  try { body = await req.json() as Body; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const pepName = (body.pepName ?? body.subject)?.trim();
  if (!pepName) {
    return NextResponse.json({ ok: false, error: "pepName is required" }, { status: 400, headers: gate.headers });
  }

  const networkDepth = Math.min(body.networkDepth ?? 4, 4) as 1 | 2 | 3 | 4;

  try {
    const client = getAnthropicClient(apiKey, 55_000, "pep-network");

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT PEP intelligence specialist with expertise in political risk, beneficial ownership, and deep network analysis under FATF R.12, FDL 10/2025 Art.12, and CBUAE AML Standards §6.

Build a comprehensive PEP network graph up to ${networkDepth} hops from the subject PEP, identifying ALL persons and entities that require screening under UAE AML law.

HOP STRUCTURE:
- Hop 1: Immediate family (spouse, children, parents, siblings) — FATF R.12 mandatory
- Hop 2: Extended family + close business associates + known corporate interests
- Hop 3: Nominee directors, beneficial ownership chains, associated entities, known associates
- Hop 4: Shell structures, trust arrangements, known associates-of-associates, related accounts

For EACH node, assess:
- ML typology risk (grand corruption, bribery, asset flight, trade-based ML, sanctions evasion)
- Source of wealth flags (government contracts, state-owned enterprise positions, concession rights)
- Jurisdictional overlay (offshore registrations, FATF grey/black list exposure)
- Historical adverse media or enforcement signals

FATF TYPOLOGIES TO ASSESS:
- Grand corruption proceeds (state-owned enterprise fraud, procurement manipulation)
- Political bribery and kickbacks (construction, defense, energy sector)
- Asset flight mechanisms (real estate, luxury goods, gold, crypto)
- Politically exposed entity abuse (PEP using corporate screen)
- Sanctions evasion via PEP networks

Return ONLY valid JSON with this exact structure:
{
  "pepCategory": "string",
  "pepRiskRating": "critical|high|medium",
  "networkNodes": [
    {
      "id": "<unique node id>",
      "name": "<person or entity name — generic descriptions acceptable>",
      "nodeType": "person|entity|account|jurisdiction",
      "hopDistance": 1|2|3|4,
      "relationship": "<specific relationship to PEP or parent node>",
      "screeningPriority": "mandatory|high|recommended|optional",
      "riskIndicators": ["<specific ML risk indicator>"],
      "mlTypologies": ["<FATF typology name>"],
      "fatfBasis": "<FATF R.X / FDL Art.Y reference>",
      "eddRequired": true|false
    }
  ],
  "typicalMlRisks": ["<ML scheme commonly used by this PEP category>"],
  "jurisdictionalRisks": ["<country-level risk>"],
  "eddRequirements": ["<EDD measure required>"],
  "eddChecklist": [
    { "item": "<EDD task>", "legalBasis": "<FDL/FATF reference>", "priority": "critical|high|medium" }
  ],
  "seniorManagementApprovalRequired": true|false,
  "ongoingMonitoringFrequency": "monthly|quarterly|annually",
  "exitTriggers": ["<circumstance triggering relationship exit>"],
  "networkRiskNarrative": "<2-3 paragraph risk assessment>",
  "regulatoryBasis": "<key articles>"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: [
          `PEP Subject: ${pepName}`,
          `Role/Position: ${body.role?.trim() ?? "unknown"}`,
          `Country/Jurisdiction: ${body.country?.trim() ?? "unknown"}`,
          body.party?.trim() ? `Party/Affiliation: ${body.party.trim()}` : "",
          body.tenure?.trim() ? `Tenure/Period: ${body.tenure.trim()}` : "",
          body.focusTypologies?.length ? `Focus Typologies: ${body.focusTypologies.join(", ")}` : "",
          "",
          `Build the full PEP network graph to ${networkDepth} hops. Enumerate ALL persons and entities requiring screening with specific risk indicators for each. Be comprehensive — include both generic node types (e.g., 'Spouse of senior official') and specific entities where known.`,
        ].filter(Boolean).join("\n"),
      }],
    });

    const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const result = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Omit<PepNetworkDeepResult, "pepName" | "networkDepth" | "totalNodesDiscovered" | "mandatoryScreeningCount" | "graphSummary">;

    const nodes: NetworkNode[] = result.networkNodes ?? [];
    const hopCounts = { hop1Count: 0, hop2Count: 0, hop3Count: 0, hop4Count: 0 };
    for (const n of nodes) {
      const key = `hop${n.hopDistance}Count` as keyof typeof hopCounts;
      hopCounts[key]++;
    }

    const output: PepNetworkDeepResult = {
      pepName,
      pepCategory: result.pepCategory ?? "PEP",
      pepRiskRating: result.pepRiskRating ?? "high",
      networkDepth,
      totalNodesDiscovered: nodes.length,
      networkNodes: nodes,
      mandatoryScreeningCount: nodes.filter((n) => n.screeningPriority === "mandatory").length,
      typicalMlRisks: result.typicalMlRisks ?? [],
      jurisdictionalRisks: result.jurisdictionalRisks ?? [],
      eddRequirements: result.eddRequirements ?? [],
      eddChecklist: result.eddChecklist ?? [],
      seniorManagementApprovalRequired: result.seniorManagementApprovalRequired ?? true,
      ongoingMonitoringFrequency: result.ongoingMonitoringFrequency ?? "quarterly",
      exitTriggers: result.exitTriggers ?? [],
      networkRiskNarrative: result.networkRiskNarrative ?? "",
      regulatoryBasis: result.regulatoryBasis ?? "FATF R.12; FDL 10/2025 Art.12; CBUAE AML Standards §6",
      graphSummary: hopCounts,
    };

    try { writeAuditEvent("mlro", "pep.deep-network-intelligence", pepName); } catch { /* non-blocking */ }

    return NextResponse.json({ ok: true, ...output }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "pep-network temporarily unavailable — please retry." }, { status: 503, headers: gate.headers });
  }
}
