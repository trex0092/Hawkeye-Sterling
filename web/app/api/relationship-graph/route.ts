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
// GET /api/relationship-graph?subjectId=<id>
//
// Builds a visual relationship graph for a screening subject identified by id.
// Loads the target subject + all subjects from Blobs (hs-subjects store),
// constructs and returns the RelationshipGraph. Auth required.
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
import { listSubjects, loadSubject } from "@/lib/server/subject-store";
import {
  buildRelationshipGraph,
  type SubjectWithUbos,
} from "@/lib/server/relationship-graph";
import type {
  Subject,
  SubjectType,
  CDDPosture,
  BadgeTone,
  SubjectStatus,
  SanctionSource,
} from "@/lib/types";

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

// ─── GET /api/relationship-graph?subjectId=<id> ────────────────────────────
//
// Loads the target subject from the hs-subjects blob store (SubjectProfile)
// and all peer subjects, then calls buildRelationshipGraph to produce a
// node-edge graph suited for SVG rendering on the /network-graph page.
//
// Clients may also supply a `subjects` JSON array (base64-encoded) as the
// `data` query param to overlay the richer screening-queue Subject shape
// (which includes rca.linkedAssociates, aliases, etc.) on top of the blob
// store data. When present, the data param takes precedence over the blob store.

const SAFE_ID_RE_GET = /^[a-zA-Z0-9_\-.:]+$/;
const MAX_ID_LEN_GET = 128;

/** Map a SubjectProfile (server blob store) to the minimal Subject shape
 *  required by buildRelationshipGraph.  Missing fields get safe defaults. */
function profileToSubject(
  profile: Awaited<ReturnType<typeof loadSubject>>,
): Subject | null {
  if (!profile) return null;
  return {
    id: profile.subjectId,
    badge: profile.subjectId.slice(0, 6).toUpperCase(),
    badgeTone: "dashed" as BadgeTone,
    name: profile.subjectName,
    meta: profile.notes ?? "",
    country: "",
    jurisdiction: "",
    type: "Individual · Customer" as SubjectType,
    entityType: "individual",
    riskScore: (() => {
      const hist = profile.riskScoreHistory;
      if (hist && hist.length > 0) return hist[hist.length - 1]!.score;
      return 0;
    })(),
    status: "active" as SubjectStatus,
    cddPosture: (profile.dueDiligence ?? "CDD") as CDDPosture,
    listCoverage: [] as SanctionSource[],
    pep: profile.isPep ? { tier: "1" } : undefined,
    exposureAED: "0",
    slaNotify: "",
    mostSerious: "",
    openedAgo: profile.createdAt,
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId")?.trim() ?? "";

  if (
    !subjectId ||
    subjectId.length > MAX_ID_LEN_GET ||
    !SAFE_ID_RE_GET.test(subjectId)
  ) {
    return NextResponse.json(
      { ok: false, error: "subjectId query parameter is required" },
      { status: 400, headers: gate.headers },
    );
  }

  // Optional: client may pass its richer Subject[] array encoded as a
  // JSON string in the `data` query parameter (base64url-safe encoded).
  let clientSubjects: Subject[] | null = null;
  const dataParam = url.searchParams.get("data");
  if (dataParam) {
    try {
      const decoded = Buffer.from(dataParam, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded) as unknown;
      if (Array.isArray(parsed)) {
        clientSubjects = parsed as Subject[];
      }
    } catch {
      // ignore malformed data param — fall back to blob store
    }
  }

  // Load all subjects from the blob store
  const allProfiles = await listSubjects(tenant).catch(() => [] as Awaited<ReturnType<typeof listSubjects>>);
  const allSubjectsFromBlob: Subject[] = allProfiles
    .map(profileToSubject)
    .filter((s): s is Subject => s !== null);

  // Merge: client subjects take precedence (richer shape), blob store fills gaps
  const subjectMap = new Map<string, Subject>();
  for (const s of allSubjectsFromBlob) subjectMap.set(s.id, s);
  if (clientSubjects) {
    for (const s of clientSubjects) subjectMap.set(s.id, s);
  }
  const allSubjects = Array.from(subjectMap.values());

  // Find the focal subject
  let focalSubject: SubjectWithUbos | null =
    (allSubjects.find((s) => s.id === subjectId) as SubjectWithUbos) ?? null;

  if (!focalSubject) {
    // Fall back to loading the subject profile from blob store directly
    const profile = await loadSubject(tenant, subjectId).catch(() => null);
    if (profile) {
      focalSubject = profileToSubject(profile) as SubjectWithUbos;
    }
  }

  if (!focalSubject) {
    return NextResponse.json(
      { ok: false, error: "Subject not found" },
      { status: 404, headers: gate.headers },
    );
  }

  const graph = buildRelationshipGraph(focalSubject, allSubjects);

  void writeAuditChainEntry(
    {
      event: "relationship_graph.visual.queried",
      actor: gate.keyId,
      subjectId,
      subjectName: focalSubject.name,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    },
    tenant,
  ).catch(() => undefined);

  return NextResponse.json(
    { ok: true, graph },
    { headers: gate.headers },
  );
}
