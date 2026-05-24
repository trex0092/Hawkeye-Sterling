// Relationship graph builder — maps a Subject and its peers into a
// force-layout-ready graph of nodes and edges.
//
// Nodes
//   subject  → the focal point of the graph
//   ubo      → beneficial owner (from SubjectDetail.uboEntries)
//   associate→ linked counterparty found in rca.linkedAssociates
//   entity   → alias of the subject (AKA node)
//   vessel / aircraft → when entityType matches
//
// Edges carry a human-readable label ("UBO 55%", "Associate", "AKA") and a
// weight 0-1 that drives stroke-width in the SVG renderer.

import type { Subject } from "@/lib/types";

export interface GraphNode {
  id: string;
  label: string;
  type: "subject" | "ubo" | "associate" | "entity" | "vessel" | "aircraft";
  riskScore?: number;
  pepTier?: string;
  flagged?: boolean;   // on sanctions list
  jurisdiction?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;   // "UBO 55%", "Director", "Associate", "Linked"
  weight: number;  // 0-1, controls edge thickness
}

export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerNodeId: string;
  generatedAt: string;
}

// ─── UBO entries stored alongside Subject in the network layer ──────────────
// The full UboEntry shape is defined in @/lib/types — we reference it here
// via a minimal inline type so this server module doesn't pull in every UI
// type through the barrel.
interface UboEntry {
  id: string;
  name: string;
  ownershipPct: number;
  role: string;
  jurisdiction: string;
  verified: boolean;
}

export interface SubjectWithUbos extends Subject {
  /** UBO entries from SubjectDetail — caller supplies these so the graph
   *  builder doesn't need to do its own blob reads. */
  uboEntries?: UboEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueId(prefix: string, name: string): string {
  return `${prefix}-${slugify(name)}`;
}

/** Return true when the subject has at least one sanctions list hit
 *  (non-empty listCoverage) */
function isFlagged(subject: Subject): boolean {
  return Array.isArray(subject.listCoverage) && subject.listCoverage.length > 0;
}

// ─── Core builder ────────────────────────────────────────────────────────────

/**
 * Build a relationship graph centred on `subject`.
 *
 * @param subject   Focal subject, optionally carrying `.uboEntries`.
 * @param allSubjects Full subject roster — used to resolve associate names
 *                    referenced in `subject.rca.linkedAssociates`.
 */
export function buildRelationshipGraph(
  subject: SubjectWithUbos,
  allSubjects: Subject[],
): RelationshipGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodeIds = new Set<string>();

  // ── Center node ────────────────────────────────────────────────────────────
  const centerNodeId = `subject-${subject.id}`;
  const centerNode: GraphNode = {
    id: centerNodeId,
    label: subject.name,
    type: "subject",
    riskScore: subject.riskScore,
    pepTier: subject.pep?.tier,
    flagged: isFlagged(subject),
    jurisdiction: subject.jurisdiction || subject.country,
  };
  nodes.push(centerNode);
  seenNodeIds.add(centerNodeId);

  // ── UBO entries → nodes + edges ────────────────────────────────────────────
  const uboEntries: UboEntry[] = subject.uboEntries ?? [];
  for (const ubo of uboEntries) {
    const nodeId = uniqueId("ubo", `${ubo.id}-${ubo.name}`);
    if (!seenNodeIds.has(nodeId)) {
      const uboNode: GraphNode = {
        id: nodeId,
        label: ubo.name,
        type: "ubo",
        jurisdiction: ubo.jurisdiction,
        // UBOs with very high ownership are flagged as high-risk
        flagged: ubo.ownershipPct >= 75,
      };
      nodes.push(uboNode);
      seenNodeIds.add(nodeId);
    }
    const pct = Math.min(100, Math.max(0, ubo.ownershipPct));
    edges.push({
      from: nodeId,
      to: centerNodeId,
      label: ubo.role ? `${ubo.role} ${pct}%` : `UBO ${pct}%`,
      weight: pct / 100,
    });
  }

  // ── linkedAssociates → find matching subjects → nodes + edges ─────────────
  const linkedAssociates: string[] = subject.rca?.linkedAssociates ?? [];
  for (const associateName of linkedAssociates) {
    const matched = allSubjects.find(
      (s) => s.name === associateName && s.id !== subject.id,
    );
    if (matched) {
      const nodeId = `associate-${matched.id}`;
      if (!seenNodeIds.has(nodeId)) {
        const assocNode: GraphNode = {
          id: nodeId,
          label: matched.name,
          type: "associate",
          riskScore: matched.riskScore,
          pepTier: matched.pep?.tier,
          flagged: isFlagged(matched) || matched.riskScore > 75,
          jurisdiction: matched.jurisdiction || matched.country,
        };
        nodes.push(assocNode);
        seenNodeIds.add(nodeId);
      }
      edges.push({
        from: centerNodeId,
        to: nodeId,
        label: "Associate",
        weight: 0.5,
      });
    } else {
      // Name not found among allSubjects — create a stub entity node
      const nodeId = uniqueId("assoc-stub", associateName);
      if (!seenNodeIds.has(nodeId)) {
        const stubNode: GraphNode = {
          id: nodeId,
          label: associateName,
          type: "entity",
        };
        nodes.push(stubNode);
        seenNodeIds.add(nodeId);
      }
      edges.push({
        from: centerNodeId,
        to: nodeId,
        label: "Linked",
        weight: 0.3,
      });
    }
  }

  // ── Aliases → entity nodes + AKA edges ────────────────────────────────────
  const aliases: string[] = subject.aliases ?? [];
  for (const alias of aliases) {
    const nodeId = uniqueId("alias", alias);
    if (!seenNodeIds.has(nodeId)) {
      const aliasNode: GraphNode = {
        id: nodeId,
        label: alias,
        type: "entity",
        // Alias shares the center's sanctions status
        flagged: isFlagged(subject),
      };
      nodes.push(aliasNode);
      seenNodeIds.add(nodeId);
    }
    edges.push({
      from: centerNodeId,
      to: nodeId,
      label: "AKA",
      weight: 0.2,
    });
  }

  return {
    nodes,
    edges,
    centerNodeId,
    generatedAt: new Date().toISOString(),
  };
}
