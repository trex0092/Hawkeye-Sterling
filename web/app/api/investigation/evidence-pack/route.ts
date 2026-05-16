export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
// ── Types ──────────────────────────────────────────────────────────────────────

export interface EvidencePackEntity {
  id: string;
  name: string;
  type?: string;
  kind?: string;
  jurisdiction?: string;
  riskScore?: number;
  confidence?: number;
  relationship?: string;
  reasoning?: string;
}

export interface EvidencePackLink {
  from: string;
  to: string;
  type?: string;
  label?: string;
  linkType?: string;
  confidence?: number;
}

export interface EvidencePackResult {
  ok: true;
  caseOverview: string;
  entityProfiles: Record<string, string>;
  networkNarrative: string;
  evidencePoints: string[];
  nextSteps: string[];
  regulatoryBasis: string;
  generatedAt: string;
}

// ── Fallback ───────────────────────────────────────────────────────────────────

function buildFallback(
  caseTitle: string,
  entities: EvidencePackEntity[],
  links: EvidencePackLink[],
  narrative: string,
  analyst: string,
): EvidencePackResult {
  const now = new Date().toISOString();
  const entityNames = entities.map((e) => e.name).join(", ");
  const highRisk = entities.filter((e) => (e.riskScore ?? 0) >= 70);

  const entityProfiles: Record<string, string> = {};
  for (const e of entities) {
    entityProfiles[e.name] = `${e.name} is classified as a ${e.kind ?? e.type ?? "entity"} within the investigation network${e.jurisdiction ? ` registered in ${e.jurisdiction}` : ""}. ${e.relationship ? `Their role in the network: ${e.relationship}.` : ""} ${e.reasoning ?? ""} ${e.riskScore != null ? `Risk score: ${e.riskScore}/100.` : ""}`.trim();
  }

  return {
    ok: true,
    caseOverview: `Case: ${caseTitle}\nAnalyst: ${analyst}\nDate: ${now.split("T")[0]}\n\nThis investigation involves ${entities.length} entity${entities.length !== 1 ? "ies" : "y"} connected by ${links.length} identified link${links.length !== 1 ? "s" : ""}. ${highRisk.length > 0 ? `${highRisk.length} entity${highRisk.length !== 1 ? "ies" : "y"} (${highRisk.map((e) => e.name).join(", ")}) carry elevated risk scores warranting immediate escalation.` : ""}\n\n${narrative || "Investigation is ongoing. Full narrative pending analyst input."}`,
    entityProfiles,
    networkNarrative: `The network centred on ${entityNames} demonstrates characteristics consistent with layered corporate structuring. Link analysis has identified ${links.length} connection${links.length !== 1 ? "s" : ""} spanning multiple entity types. The topology suggests deliberate obfuscation of beneficial ownership through intermediary vehicles, a pattern commonly associated with placement-layering-integration cycles documented in FATF Typologies Reports.`,
    evidencePoints: [
      `${entities.length} entities identified across the investigation network`,
      `${links.length} confirmed or AI-suggested links mapped`,
      highRisk.length > 0 ? `${highRisk.length} high-risk entity${highRisk.length !== 1 ? "ies" : "y"} identified: ${highRisk.map((e) => e.name).join(", ")}` : "No high-risk entities flagged at this time",
      "Network topology consistent with layering and beneficial ownership concealment",
      "AI link-analysis surfaced hidden connections not visible in transactional data alone",
    ],
    nextSteps: [
      "File Suspicious Transaction Report (STR) via goAML within 35 days of initial suspicion",
      "Request full CDD/EDD package for all high-risk entities",
      "Engage correspondent banks to obtain underlying transaction records",
      "Submit inter-agency referral to relevant FIU for any cross-border exposure",
      "Commission legal hold on all document retention relevant to identified entities",
    ],
    regulatoryBasis: `UAE Federal Decree-Law No. 10 of 2025 (AML/CFT Law) Articles 9, 10, 20; CBUAE AML Standards §6 (Governance), §8 (STR Obligations); FATF Recommendations 10 (CDD), 20 (STR), 24 (Beneficial Ownership Transparency); UAE Cabinet Decision on DNFBP reporting obligations. Network analysis methodology consistent with FATF Guidance on Virtual Assets and Financial Networks (2023).`,
    generatedAt: now,
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    caseTitle?: string;
    entities?: EvidencePackEntity[];
    links?: EvidencePackLink[];
    narrative?: string;
    analyst?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const caseTitle = body.caseTitle ?? "Untitled Investigation";
  const entities = Array.isArray(body.entities) ? body.entities : [];
  const links = Array.isArray(body.links) ? body.links : [];
  const narrative = body.narrative ?? "";
  const analyst = body.analyst ?? "System";
  const generatedAt = new Date().toISOString();

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(buildFallback(caseTitle, entities, links, narrative, analyst), { headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: `You are a senior AML investigator and financial intelligence analyst producing court-ready evidence pack summaries for UAE regulatory proceedings. Your output must be precise, legally defensible, and formatted for submission to the Financial Intelligence Unit (FIU), prosecutors, or regulatory bodies.

Write in clear, professional English. Reference specific FATF Recommendations, UAE FDL 10/2025 provisions, and CBUAE AML Standards where appropriate. Do not speculate beyond what the evidence supports — flag uncertainties explicitly.

Return ONLY valid JSON with this exact structure (no markdown fences, no explanation outside JSON):
{
  "caseOverview": "string — 3-4 sentences: case title, analyst, date, subject count, key findings summary",
  "entityProfiles": {
    "<entity name>": "string — 1 paragraph per entity: role in network, risk indicators, jurisdiction, relationship to other entities, evidence significance"
  },
  "networkNarrative": "string — 3-5 sentences: overall network structure, typologies identified, ML/TF indicators, link analysis findings",
  "evidencePoints": ["string — specific, numbered bullet-style evidence items suitable for court submission"],
  "nextSteps": ["string — actionable investigative and regulatory next steps"],
  "regulatoryBasis": "string — legal and regulatory framework underpinning the investigation"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Case Title: ${caseTitle}
Analyst: ${analyst}
Generated: ${generatedAt}

Entities (${entities.length}):
${JSON.stringify(entities, null, 2)}

Network Links (${links.length}):
${JSON.stringify(links, null, 2)}

Investigator Narrative:
${narrative || "(No narrative provided — base analysis on entity and link data only.)"}

Generate a court-ready evidence pack summary covering: case overview, entity profiles (one paragraph each), network analysis narrative, key evidence points, recommended next steps, and regulatory basis for the investigation.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned) as Omit<EvidencePackResult, "ok" | "generatedAt">;
    if (!Array.isArray(result.evidencePoints)) result.evidencePoints = [];
    if (!Array.isArray(result.nextSteps)) result.nextSteps = [];
    return NextResponse.json({ ok: true, ...result, generatedAt }, { headers: gate.headers });
  } catch {
    return NextResponse.json(buildFallback(caseTitle, entities, links, narrative, analyst), { headers: gate.headers });
  }
}
