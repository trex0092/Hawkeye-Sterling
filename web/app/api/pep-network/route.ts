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
// relationship classification with risk multipliers, shell company
// detection, financial institution conflict-of-interest flagging,
// cross-jurisdiction spread analysis, government contract nexus
// detection, and a full EDD requirements checklist.

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Relationship classifier types and risk multipliers
// ---------------------------------------------------------------------------

type RelationshipType =
  | "spouse"
  | "child"
  | "parent"
  | "sibling"
  | "business_partner"
  | "close_associate"
  | "intermediary"
  | "unknown";

const RELATIONSHIP_RISK_MULTIPLIERS: Record<RelationshipType, number> = {
  spouse: 10,
  child: 8,
  parent: 5,
  sibling: 5,
  business_partner: 15,
  close_associate: 12,
  intermediary: 20,
  unknown: 0,
};

// Keywords used to classify a relationship string into a RelationshipType
const RELATIONSHIP_KEYWORDS: Array<{ type: RelationshipType; patterns: RegExp }> = [
  { type: "spouse", patterns: /\b(spouse|wife|husband|partner|consort|married)\b/i },
  { type: "child", patterns: /\b(child|son|daughter|offspring)\b/i },
  { type: "parent", patterns: /\b(parent|father|mother|dad|mom|mum)\b/i },
  { type: "sibling", patterns: /\b(sibling|brother|sister)\b/i },
  { type: "business_partner", patterns: /\b(business partner|co-founder|co-director|shareholder|co-owner|joint venture)\b/i },
  { type: "close_associate", patterns: /\b(close associate|advisor|aide|chief of staff|confidant|friend|ally)\b/i },
  { type: "intermediary", patterns: /\b(intermediary|nominee|proxy|trustee|agent|facilitator|straw man|front)\b/i },
];

function classifyRelationship(relationship: string): RelationshipType {
  const lower = relationship.toLowerCase();
  for (const { type, patterns } of RELATIONSHIP_KEYWORDS) {
    if (patterns.test(lower)) return type;
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Shell company detection heuristics
// ---------------------------------------------------------------------------

const SHELL_GENERIC_TERMS = /\b(holdings?|investments?|group|partners?|ltd|limited|corp|inc|llc|gmbh|bv|sarl)\b/i;

function isLikelyShellCompany(name: string, nodeType: string): boolean {
  if (nodeType !== "entity") return false;
  const matchesGeneric = SHELL_GENERIC_TERMS.test(name);
  // Treat as shell if the name is short (≤ 4 words) and contains generic terms
  const wordCount = name.trim().split(/\s+/).length;
  return matchesGeneric && wordCount <= 4;
}

// ---------------------------------------------------------------------------
// Financial institution detection heuristics
// ---------------------------------------------------------------------------

const FI_KEYWORDS = /\b(bank|banque|bancorp|financial|finance|credit union|savings|mortgage|insurance|capital markets|asset management|wealth management|brokerage|securities|exchange)\b/i;

function isFinancialInstitution(name: string, nodeType: string, relationship: string): boolean {
  if (nodeType !== "entity") return false;
  return FI_KEYWORDS.test(name) || /\b(director|owner|chairman|president)\b/i.test(relationship);
}

function hasOwnershipOrDirectorship(relationship: string): boolean {
  return /\b(owner|director|chairman|president|beneficial owner|controlling|shareholder|equity)\b/i.test(relationship);
}

// ---------------------------------------------------------------------------
// Government contract / procurement heuristics
// ---------------------------------------------------------------------------

const GOV_CONTRACT_KEYWORDS = /\b(government contract|procurement|public tender|state contract|ministry contract|concession|license awarded|awarded by|public procurement|beneficiary of)\b/i;

function hasGovernmentContractNexus(riskIndicators: string[], relationship: string, name: string): boolean {
  const haystack = [...riskIndicators, relationship, name].join(" ").toLowerCase();
  return GOV_CONTRACT_KEYWORDS.test(haystack);
}

// ---------------------------------------------------------------------------
// Country extraction from nodes
// ---------------------------------------------------------------------------

const COUNTRY_PATTERNS = [
  // Offshore / jurisdictional terms commonly found in node names or risk indicators
  /\b(cayman islands?|british virgin islands?|bvi|isle of man|jersey|guernsey|panama|seychelles|mauritius|liechtenstein|andorra|monaco|bermuda|bahamas|vanuatu|samoa|nauru|marshall islands?)\b/i,
  // ISO-like country names that appear in jurisdiction or risk indicator fields
  /\b(uae|united arab emirates|saudi arabia|qatar|kuwait|bahrain|oman|jordan|egypt|iran|iraq|syria|russia|china|cyprus|malta|singapore|hong kong|switzerland|luxembourg|netherlands|delaware|wyoming|nevada)\b/i,
];

function extractCountriesFromNode(node: NetworkNode): string[] {
  const text = [node.name, node.relationship, ...(node.riskIndicators ?? []), ...(node.mlTypologies ?? [])].join(" ");
  const found = new Set<string>();
  for (const pattern of COUNTRY_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, "gi"));
    if (matches) matches.forEach((m) => found.add(m.toLowerCase().trim()));
  }
  return Array.from(found);
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

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
  // Enhanced fields added by post-processing
  relationshipType?: RelationshipType;
  relationshipRiskMultiplier?: number;
  isShellCompany?: boolean;
  isFinancialInstitution?: boolean;
  hasGovernmentContractNexus?: boolean;
  networkFlags?: string[];
}

interface NetworkSummary {
  totalNodes: number;
  totalEdges: number;
  countries: string[];
  shellCompanyCount: number;
  financialInstitutionCount: number;
  maxHopDistance: number;
  networkRiskScore: number;
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
  networkFlags: string[];
  networkSummary: NetworkSummary;
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

// ---------------------------------------------------------------------------
// Network enrichment — post-processes LLM nodes to add enhanced intelligence
// ---------------------------------------------------------------------------

function enrichNetworkNodes(nodes: NetworkNode[]): {
  enrichedNodes: NetworkNode[];
  networkFlags: string[];
  networkSummary: NetworkSummary;
} {
  const networkFlags: string[] = [];
  let relationshipRiskAddition = 0;
  let shellCount = 0;
  let fiCount = 0;
  const allCountries = new Set<string>();

  const enrichedNodes: NetworkNode[] = nodes.map((node) => {
    const nodeFlags: string[] = [];

    // 1. Relationship classifier
    const relType = classifyRelationship(node.relationship);
    const relMultiplier = RELATIONSHIP_RISK_MULTIPLIERS[relType];
    relationshipRiskAddition += relMultiplier;

    // 2. Shell company detection
    const shell = isLikelyShellCompany(node.name, node.nodeType);
    if (shell) {
      shellCount++;
      nodeFlags.push("potential_shell_company");
    }

    // 3. Financial institution conflict of interest
    const isFI = isFinancialInstitution(node.name, node.nodeType, node.relationship);
    const hasOwnership = hasOwnershipOrDirectorship(node.relationship);
    if (isFI && hasOwnership) {
      fiCount++;
      nodeFlags.push("conflict_of_interest_fi");
    }

    // 4. Government contract nexus
    const govContract = hasGovernmentContractNexus(node.riskIndicators ?? [], node.relationship, node.name);
    if (govContract) {
      nodeFlags.push("government_contract_nexus");
    }

    // 5. Extract countries
    const nodeCountries = extractCountriesFromNode(node);
    nodeCountries.forEach((c) => allCountries.add(c));

    return {
      ...node,
      relationshipType: relType,
      relationshipRiskMultiplier: relMultiplier,
      isShellCompany: shell,
      isFinancialInstitution: isFI && hasOwnership,
      hasGovernmentContractNexus: govContract,
      networkFlags: nodeFlags,
    };
  });

  // Global flags

  // Shell company flags (+15 per shell)
  const shellRiskAddition = shellCount * 15;
  if (shellCount > 0) {
    networkFlags.push(`shell_company_detected:${shellCount}`);
  }

  // Financial institution conflict of interest (+25 per FI ownership/directorship)
  const fiRiskAddition = fiCount * 25;
  if (fiCount > 0) {
    networkFlags.push("conflict_of_interest_fi");
  }

  // Cross-jurisdiction network spread (+20 if > 4 countries)
  let multiJurisdictionAddition = 0;
  const countriesArray = Array.from(allCountries);
  if (countriesArray.length > 4) {
    multiJurisdictionAddition = 20;
    networkFlags.push("multi_jurisdiction_network");
  }

  // Government contract nexus — check if any node has the flag (+15 if any)
  let govContractAddition = 0;
  const hasAnyGovContract = enrichedNodes.some((n) => n.hasGovernmentContractNexus);
  if (hasAnyGovContract) {
    govContractAddition = 15;
    networkFlags.push("government_contract_nexus");
  }

  // Compute network risk score (0-100)
  // Base score: 30 (inherent PEP network risk)
  // + relationship risk additions (capped at 30)
  // + shell risk additions (capped at 20)
  // + FI risk additions (capped at 20)
  // + multi-jurisdiction addition (capped at 20)
  // + gov contract addition (capped at 15)
  const baseScore = 30;
  const relContrib = Math.min(relationshipRiskAddition, 30);
  const shellContrib = Math.min(shellRiskAddition, 20);
  const fiContrib = Math.min(fiRiskAddition, 20);
  const jurisdictionContrib = Math.min(multiJurisdictionAddition, 20);
  const govContrib = Math.min(govContractAddition, 15);
  const rawScore = baseScore + relContrib + shellContrib + fiContrib + jurisdictionContrib + govContrib;
  const networkRiskScore = Math.min(rawScore, 100);

  // Max hop distance
  const maxHopDistance = nodes.length > 0
    ? Math.max(...nodes.map((n) => n.hopDistance))
    : 0;

  const networkSummary: NetworkSummary = {
    totalNodes: enrichedNodes.length,
    // Edges approximation: each node has an edge back to its parent (or subject)
    totalEdges: enrichedNodes.length,
    countries: countriesArray,
    shellCompanyCount: shellCount,
    financialInstitutionCount: fiCount,
    maxHopDistance,
    networkRiskScore,
  };

  return { enrichedNodes, networkFlags, networkSummary };
}

export async function POST(req: Request): Promise<NextResponse> {
  const _handlerStart = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      simulationWarning: "ANTHROPIC_API_KEY not configured — this is a simulated template, NOT a real PEP network analysis. All nodes, relationships, and risk indicators are illustrative examples only. Obtain a real AI-generated assessment before making any compliance decisions.",
      pepName: "",
      pepCategory: "PEP",
      pepRiskRating: "high",
      networkDepth: 4,
      totalNodesDiscovered: 0,
      networkNodes: [],
      mandatoryScreeningCount: 0,
      typicalMlRisks: ["grand_corruption", "bribery", "asset_flight"],
      jurisdictionalRisks: ["Requires real subject data to assess"],
      eddRequirements: ["Provide ANTHROPIC_API_KEY to enable AI-powered PEP network analysis"],
      eddChecklist: [],
      seniorManagementApprovalRequired: true,
      ongoingMonitoringFrequency: "monthly",
      exitTriggers: [],
      networkRiskNarrative: "PEP network analysis unavailable — ANTHROPIC_API_KEY not configured.",
      regulatoryBasis: "FATF R.12; FDL 10/2025 Art.12; CBUAE AML Standards §6",
      graphSummary: { hop1Count: 0, hop2Count: 0, hop3Count: 0, hop4Count: 0 },
      networkFlags: [],
      networkSummary: {
        totalNodes: 0,
        totalEdges: 0,
        countries: [],
        shellCompanyCount: 0,
        financialInstitutionCount: 0,
        maxHopDistance: 0,
        networkRiskScore: 0,
      },
    }, { status: 200, headers: gate.headers });
  }

  let body: Body;
  try { body = await req.json() as Body; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const pepName = sanitizeField(body.pepName ?? body.subject, 300);
  if (!pepName) {
    return NextResponse.json({ ok: false, error: "pepName is required" }, { status: 400, headers: gate.headers });
  }

  const networkDepth = Math.min(body.networkDepth ?? 4, 4) as 1 | 2 | 3 | 4;

  try {
    const client = getAnthropicClient(apiKey, 55_000, "pep-network");

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
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
- Relationship type: use precise terms such as spouse, child, parent, sibling, business_partner, close_associate, intermediary, nominee director, beneficial owner, etc.
- For entity nodes: indicate if the entity is a financial institution (bank, finance company, insurance, asset management) and whether the PEP holds ownership or a directorship
- Include jurisdiction/country information in riskIndicators where applicable

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
          `Role/Position: ${sanitizeField(body.role, 200) || "unknown"}`,
          `Country/Jurisdiction: ${sanitizeField(body.country, 100) || "unknown"}`,
          body.party?.trim() ? `Party/Affiliation: ${sanitizeField(body.party, 200)}` : "",
          body.tenure?.trim() ? `Tenure/Period: ${sanitizeField(body.tenure, 100)}` : "",
          body.focusTypologies?.length ? `Focus Typologies: ${body.focusTypologies.slice(0, 20).map((t: string) => sanitizeField(t, 100)).join(", ")}` : "",
          "",
          `Build the full PEP network graph to ${networkDepth} hops. Enumerate ALL persons and entities requiring screening with specific risk indicators for each. Be comprehensive — include both generic node types (e.g., 'Spouse of senior official') and specific entities where known. For each entity node, specify whether it is a financial institution and whether the PEP holds a directorship or ownership stake. Include country/jurisdiction context in riskIndicators.`,
        ].filter(Boolean).join("\n"),
      }],
    });

    const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const result = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Omit<PepNetworkDeepResult, "pepName" | "networkDepth" | "totalNodesDiscovered" | "mandatoryScreeningCount" | "graphSummary" | "networkFlags" | "networkSummary">;

    // Cap at 20 nodes to prevent result explosion from deep traversal (2+ hops).
    // Prioritise mandatory screening nodes, then sort by hop distance ascending.
    const allNodes: NetworkNode[] = Array.isArray(result.networkNodes) ? result.networkNodes : [];
    const sortedNodes: NetworkNode[] = allNodes
      .sort((a, b) => {
        const priorityOrder = { mandatory: 0, high: 1, recommended: 2, optional: 3 };
        const pa = priorityOrder[a.screeningPriority] ?? 3;
        const pb = priorityOrder[b.screeningPriority] ?? 3;
        if (pa !== pb) return pa - pb;
        return a.hopDistance - b.hopDistance;
      })
      .slice(0, 20);

    // Enrich nodes with relationship classification, shell detection, FI flags, etc.
    const { enrichedNodes: nodes, networkFlags, networkSummary } = enrichNetworkNodes(sortedNodes);

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
      typicalMlRisks: Array.isArray(result.typicalMlRisks) ? result.typicalMlRisks : [],
      jurisdictionalRisks: Array.isArray(result.jurisdictionalRisks) ? result.jurisdictionalRisks : [],
      eddRequirements: Array.isArray(result.eddRequirements) ? result.eddRequirements : [],
      eddChecklist: Array.isArray(result.eddChecklist) ? result.eddChecklist : [],
      seniorManagementApprovalRequired: result.seniorManagementApprovalRequired ?? true,
      ongoingMonitoringFrequency: result.ongoingMonitoringFrequency ?? "quarterly",
      exitTriggers: Array.isArray(result.exitTriggers) ? result.exitTriggers : [],
      networkRiskNarrative: result.networkRiskNarrative ?? "",
      regulatoryBasis: result.regulatoryBasis ?? "FATF R.12; FDL 10/2025 Art.12; CBUAE AML Standards §6",
      graphSummary: hopCounts,
      networkFlags,
      networkSummary,
    };

    try {
      writeAuditEvent("mlro", "pep.deep-network-intelligence", pepName);
    } catch (err) {
      console.warn("[hawkeye] pep-network: audit write failed", err instanceof Error ? err.message : String(err));
    }

    void writeAuditChainEntry(
      {
        event: "pep.network_intelligence_generated",
        actor: gate.keyId,
        pepName,
        pepRiskRating: output.pepRiskRating,
        totalNodesDiscovered: output.totalNodesDiscovered,
        networkFlags,
        networkRiskScore: networkSummary.networkRiskScore,
        shellCompanyCount: networkSummary.shellCompanyCount,
        financialInstitutionCount: networkSummary.financialInstitutionCount,
        multiJurisdiction: networkFlags.includes("multi_jurisdiction_network"),
      },
      tenantIdFromGate(gate),
    ).catch((err) =>
      console.warn("[pep-network] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );

    // Write pep.rca_identified audit chain entries for every RCA node discovered.
    // FATF R.12 requires each identified relative or close associate to be
    // individually recorded so the screening can be traced to a specific
    // relationship hop and relationship type in the audit trail.
    const tenantId = tenantIdFromGate(gate);
    for (const node of nodes) {
      // Hop 1 = immediate family (mandatory FATF R.12 screening);
      // Hop 2+ = extended network — still record per FATF R.12 best practice.
      void writeAuditChainEntry(
        {
          event: "pep.rca_identified",
          actor: gate.keyId,
          subjectId: pepName,
          pepId: pepName,
          relationship: node.relationship,
          relationshipType: node.relationshipType,
          relationshipRiskMultiplier: node.relationshipRiskMultiplier,
          rcaName: node.name,
          hopDistance: node.hopDistance,
          screeningPriority: node.screeningPriority,
          nodeType: node.nodeType,
          eddRequired: node.eddRequired,
          isShellCompany: node.isShellCompany,
          isFinancialInstitution: node.isFinancialInstitution,
          hasGovernmentContractNexus: node.hasGovernmentContractNexus,
          nodeFlags: node.networkFlags,
        },
        tenantId,
      ).catch((err: unknown) =>
        console.warn("[pep-network] pep.rca_identified audit chain write failed:", err instanceof Error ? err.message : String(err)),
      );
    }

    const latencyMs = Date.now() - _handlerStart;
    if (latencyMs > 5000) console.warn(`[pep-network] latencyMs=${latencyMs} exceeds 5000ms`);
    return NextResponse.json({ ok: true, ...output, latencyMs }, { headers: gate.headers });
  } catch (err) {
    console.error("[pep-network] unhandled exception:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({
      ok: false,
      errorCode: "HANDLER_EXCEPTION",
      errorType: "internal",
      tool: "pep_network",
      message: "PEP network service unavailable",
      retryAfterSeconds: null,
      requestId: randomBytes(5).toString("hex"),
      latencyMs: Date.now() - _handlerStart,
    }, { status: 503, headers: gate.headers });
  }
}
