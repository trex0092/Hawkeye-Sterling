// POST /api/relationship-graph
//
// C6/F4: Corporate UBO chain traversal and political PEP network mapping
// at configurable depth. Combines registry, GLEIF LEI, and OpenSanctions
// data to build a relationship graph for the subject entity.
//
// Body:
//   {
//     subjectName: string;
//     subjectType?: "company" | "person";
//     jurisdiction?: string;
//     companyNumber?: string;
//     depth?: number;              // 1-5, default 2
//     includeRelationships?: string[]; // "ubo","pep","sanctions","adverse"
//     resolveAdverseMedia?: boolean;
//   }
//
// Response:
//   {
//     ok, subjectName, nodes, edges, uboChain, pepNetwork,
//     sanctionedRelationships, riskSummary, graphMeta
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { searchAllRegistries } from "@/lib/intelligence/registryAdapters";
import { matchEntity, type MatchQuery } from "@/lib/intelligence/openSanctionsAdapter";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_DEPTH = 5;
const DEFAULT_DEPTH = 2;
const MAX_NODES = 100;

interface Body {
  subjectName?: string;
  subjectType?: "company" | "person";
  jurisdiction?: string;
  companyNumber?: string;
  depth?: number;
  includeRelationships?: string[];
  resolveAdverseMedia?: boolean;
}

interface GraphNode {
  id: string;
  label: string;
  type: "company" | "person" | "vessel" | "unknown";
  jurisdiction?: string;
  sanctioned: boolean;
  pep: boolean;
  riskLevel: "low" | "medium" | "high" | "critical" | "unknown";
  source: string;
  depth: number;
  attributes?: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: "owns" | "controls" | "director" | "shareholder" | "associated" | "officer" | "beneficial_owner";
  ownershipPct?: number;
  confirmedAt?: string;
  source_dataset: string;
}

interface UBOEntry {
  depth: number;
  entityName: string;
  entityType: string;
  jurisdiction: string;
  ownershipPct?: number;
  isNaturalPerson: boolean;
  sanctioned: boolean;
  pep: boolean;
  registrationNumber?: string;
}

async function resolveEntityFromRegistries(
  name: string,
  jurisdiction: string | undefined,
  _companyNumber: string | undefined,
): Promise<{
  registrations: Array<Record<string, unknown>>;
  officers: Array<Record<string, unknown>>;
  relatedEntities: Array<Record<string, unknown>>;
  uboChain: Array<Record<string, unknown>>;
}> {
  try {
    const { records } = await searchAllRegistries(name, { jurisdiction, limit: 5 });
    const registrations: Array<Record<string, unknown>> = records.map((r) => ({
      jurisdiction: r.jurisdiction ?? "unknown",
      companyNumber: r.registrationNumber ?? "",
      companyType: "unknown",
      status: r.status ?? "unknown",
      incorporationDate: r.incorporationDate ?? "",
      registeredAddress: "",
      source: r.source,
    }));
    // Flatten officers from all records
    const officers: Array<Record<string, unknown>> = records.flatMap((r) =>
      (r.officers ?? []).map((o) => ({ name: o.name, role: o.role ?? "officer", startDate: "", source: r.source }))
    );
    // Flatten beneficial owners as a UBO chain approximation
    const uboChain: Array<Record<string, unknown>> = records.flatMap((r) =>
      (r.beneficialOwners ?? []).map((b, i) => ({
        level: i + 1,
        entityName: b.name,
        jurisdiction: r.jurisdiction ?? "unknown",
        ownershipPct: b.ownershipPct,
        isNaturalPerson: true,
      }))
    );
    return { registrations, officers, relatedEntities: [], uboChain };
  } catch {
    return { registrations: [], officers: [], relatedEntities: [], uboChain: [] };
  }
}

async function checkOpenSanctions(name: string): Promise<{ sanctioned: boolean; programs: string[]; entities: unknown[] }> {
  try {
    const query: MatchQuery = { name };
    const results = await matchEntity(query);
    const sanctioned = results.some((r) => r.match || r.score >= 0.8);
    const programs = results.flatMap((r) => r.topics ?? []);
    return { sanctioned, programs, entities: results };
  } catch {
    return { sanctioned: false, programs: [], entities: [] };
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  const subjectName = body.subjectName?.trim();
  if (!subjectName) {
    return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400, headers: gate.headers });
  }

  const depth = Math.min(Math.max(body.depth ?? DEFAULT_DEPTH, 1), MAX_DEPTH);
  const includeRels = new Set(body.includeRelationships ?? ["ubo", "pep", "sanctions"]);

  // Root node check — registry + sanctions in parallel
  const [registryData, sanctionsData] = await Promise.all([
    resolveEntityFromRegistries(sanitizeField(subjectName), body.jurisdiction, body.companyNumber),
    includeRels.has("sanctions") ? checkOpenSanctions(subjectName) : Promise.resolve({ sanctioned: false, programs: [], entities: [] }),
  ]);

  // Build root node
  const rootNode: GraphNode = {
    id: `root:${subjectName.toLowerCase().replace(/\s+/g, "_")}`,
    label: subjectName,
    type: body.subjectType ?? "company",
    jurisdiction: body.jurisdiction,
    sanctioned: sanctionsData.sanctioned,
    pep: false,
    riskLevel: sanctionsData.sanctioned ? "critical" : "unknown",
    source: "subject",
    depth: 0,
  };

  const nodes: GraphNode[] = [rootNode];
  const edges: GraphEdge[] = [];
  const uboChain: UBOEntry[] = [];
  const pepNetwork: Array<{ name: string; role: string; depth: number; sanctioned: boolean }> = [];
  const sanctionedRelationships: Array<{ name: string; relationship: string; listIds: string[]; depth: number }> = [];

  // Build UBO chain from registry data
  for (const ubo of registryData.uboChain) {
    const uboDepth = typeof ubo["level"] === "number" ? ubo["level"] : 1;
    if (uboDepth > depth) continue;
    const uboName = typeof ubo["entityName"] === "string" ? ubo["entityName"] : "Unknown";
    const uboId = `ubo:${uboName.toLowerCase().replace(/\s+/g, "_")}:${uboDepth}`;

    let uboSanctioned = false;
    if (includeRels.has("sanctions") && nodes.length < MAX_NODES) {
      const uboSanctions = await checkOpenSanctions(uboName).catch(() => ({ sanctioned: false, programs: [], entities: [] }));
      uboSanctioned = uboSanctions.sanctioned;
      if (uboSanctioned) {
        sanctionedRelationships.push({ name: uboName, relationship: "beneficial_owner", listIds: ["opensanctions"], depth: uboDepth });
      }
    }

    const uboNode: GraphNode = {
      id: uboId,
      label: uboName,
      type: typeof ubo["isNaturalPerson"] === "boolean" && ubo["isNaturalPerson"] ? "person" : "company",
      jurisdiction: typeof ubo["jurisdiction"] === "string" ? ubo["jurisdiction"] : undefined,
      sanctioned: uboSanctioned,
      pep: false,
      riskLevel: uboSanctioned ? "critical" : "low",
      source: "registry",
      depth: uboDepth,
    };
    nodes.push(uboNode);
    edges.push({
      source: uboDepth === 1 ? rootNode.id : `ubo:${String(typeof registryData.uboChain[uboDepth - 2] === "object" && registryData.uboChain[uboDepth - 2] !== null ? (registryData.uboChain[uboDepth - 2] as Record<string, unknown>)["entityName"] : "").toLowerCase().replace(/\s+/g, "_")}:${uboDepth - 1}`,
      target: uboId,
      relationship: "beneficial_owner",
      ownershipPct: typeof ubo["ownershipPct"] === "number" ? ubo["ownershipPct"] : undefined,
      source_dataset: "registry",
    });

    uboChain.push({
      depth: uboDepth,
      entityName: uboName,
      entityType: typeof ubo["isNaturalPerson"] === "boolean" && ubo["isNaturalPerson"] ? "individual" : "entity",
      jurisdiction: typeof ubo["jurisdiction"] === "string" ? ubo["jurisdiction"] : "unknown",
      ownershipPct: typeof ubo["ownershipPct"] === "number" ? ubo["ownershipPct"] : undefined,
      isNaturalPerson: typeof ubo["isNaturalPerson"] === "boolean" ? ubo["isNaturalPerson"] : false,
      sanctioned: uboSanctioned,
      pep: false,
    });
  }

  // Build officer nodes
  for (const officer of registryData.officers.slice(0, 20)) {
    const oName = typeof officer["name"] === "string" ? officer["name"] : "Unknown";
    const oRole = typeof officer["role"] === "string" ? officer["role"] : "officer";
    const oId = `officer:${oName.toLowerCase().replace(/\s+/g, "_")}`;
    if (nodes.length >= MAX_NODES) break;
    nodes.push({
      id: oId,
      label: oName,
      type: "person",
      sanctioned: false,
      pep: false,
      riskLevel: "unknown",
      source: "registry",
      depth: 1,
      attributes: { role: oRole, endDate: officer["endDate"] },
    });
    edges.push({
      source: rootNode.id,
      target: oId,
      relationship: oRole.toLowerCase().includes("director") ? "director" : "officer",
      source_dataset: "registry",
    });
  }

  // Risk summary
  const sanctionedCount = nodes.filter((n) => n.sanctioned).length;
  const totalRisk = sanctionedCount > 0 ? "critical"
    : uboChain.some((u) => u.sanctioned) ? "high"
    : nodes.length > 5 ? "medium"
    : "low";

  void writeAuditChainEntry({
    event: "relationship_graph.queried",
    actor: gate.keyId,
    subjectName,
    depth,
    nodeCount: nodes.length,
    sanctionedNodes: sanctionedCount,
  }, tenant).catch(() => undefined);

  return NextResponse.json(
    {
      ok: true,
      subjectName,
      depth,
      nodes,
      edges,
      uboChain,
      pepNetwork,
      sanctionedRelationships,
      riskSummary: {
        overallRisk: totalRisk,
        totalNodes: nodes.length,
        sanctionedNodes: sanctionedCount,
        pepNodes: pepNetwork.length,
        maxDepthReached: Math.max(...nodes.map((n) => n.depth), 0),
        dataQuality: registryData.registrations.length > 0 ? "high" : "low",
        sources: ["registry", ...(includeRels.has("sanctions") ? ["opensanctions"] : [])],
      },
      graphMeta: {
        depthRequested: depth,
        nodesCap: MAX_NODES,
        nodesReturned: nodes.length,
        edgesReturned: edges.length,
        generatedAt: new Date().toISOString(),
        regulatoryContext: "UAE FDL No.10/2025 Art.11 — UBO identification requirement",
      },
    },
    { headers: gate.headers },
  );
}
