// Hawkeye Sterling — Ultimate Beneficial Owner resolver.
// Walks an ownership graph to identify natural persons holding:
//   (a) ≥ 25% beneficial ownership (FATF R.24 threshold), and/or
//   (b) effective control (board, nominee-agreement, or voting-majority rights).
// Detects and flags nominee arrangements and bearer-share opacity.
//
// Pure-function resolver: takes a snapshot of edges, returns resolved UBOs +
// caveats. No I/O, deterministic.

export interface OwnershipEdge {
  from: string;          // owner id (person or entity)
  to: string;            // owned entity id
  sharePercent: number;  // 0..100
  votingPercent?: number;
  controlRight?: 'board_majority' | 'veto' | 'nominee_agreement' | 'voting_trust' | 'shareholder_agreement';
  bearerShares?: boolean;
  nominee?: boolean;
}

export interface PartyNode {
  id: string;
  kind: 'person' | 'entity';
  name: string;
  jurisdiction?: string;
}

export interface UboCandidate {
  personId: string;
  name: string;
  effectivePercent: number;    // cumulative effective share up to this person
  controlReasons: string[];
  paths: Array<{ chain: string[]; multiplier: number }>;
}

export interface UboResolution {
  subjectId: string;
  candidates: UboCandidate[];
  caveats: string[];
  opacityScore: number; // 0..1 — higher = more opaque (nominees, bearer, unknowns)
}

const THRESHOLD = 0.25;

export function resolveUbo(
  subjectId: string,
  parties: PartyNode[],
  edges: OwnershipEdge[],
): UboResolution {
  const partyById = new Map(parties.map((p) => [p.id, p]));
  const edgesByTo = new Map<string, OwnershipEdge[]>();
  for (const e of edges) {
    if (!edgesByTo.has(e.to)) edgesByTo.set(e.to, []);
    (edgesByTo.get(e.to) ?? []).push(e);
  }

  const caveats: string[] = [];
  if (!partyById.has(subjectId)) {
    return {
      subjectId,
      candidates: [],
      caveats: ['subject not in party registry'],
      opacityScore: 1,
    };
  }

  let nomineeCount = 0;
  let bearerCount = 0;
  let unknownUpwardCount = 0;

  const results = new Map<string, UboCandidate>();

  // Depth-limited DFS climbing the ownership chain.
  const visit = (entityId: string, chain: string[], multiplier: number, controlReasons: string[]) => {
    if (chain.includes(entityId)) {
      caveats.push(`cycle detected at ${entityId}; truncated`);
      return;
    }
    if (chain.length > 10) {
      caveats.push(`depth > 10 at ${entityId}; truncated`);
      return;
    }
    const upEdges = edgesByTo.get(entityId);
    if (!upEdges || upEdges.length === 0) {
      unknownUpwardCount += 1;
      caveats.push(`no upward edges from ${entityId}; UBO chain incomplete`);
      return;
    }
    for (const e of upEdges) {
      if (e.bearerShares) bearerCount++;
      if (e.nominee) nomineeCount++;

      const reasons = [...controlReasons];
      if (e.nominee) reasons.push(`nominee edge ${e.from}→${e.to}`);
      if (e.bearerShares) reasons.push(`bearer shares on edge ${e.from}→${e.to}`);
      if (e.controlRight) reasons.push(`control right ${e.controlRight} on edge ${e.from}→${e.to}`);

      const frac = Math.min(1, Math.max(0, e.sharePercent / 100));
      const nextMultiplier = multiplier * frac;
      const nextChain = [...chain, entityId];

      const fromParty = partyById.get(e.from);
      if (!fromParty) {
        caveats.push(`unknown party ${e.from} referenced as owner of ${e.to}`);
        continue;
      }

      if (fromParty.kind === 'person') {
        const cur = results.get(fromParty.id) ?? {
          personId: fromParty.id,
          name: fromParty.name,
          effectivePercent: 0,
          controlReasons: [],
          paths: [],
        };
        cur.effectivePercent = Math.min(1, cur.effectivePercent + nextMultiplier);
        cur.paths.push({ chain: [...nextChain, fromParty.id], multiplier: nextMultiplier });
        for (const r of reasons) if (!cur.controlReasons.includes(r)) cur.controlReasons.push(r);
        results.set(fromParty.id, cur);
      } else {
        visit(fromParty.id, nextChain, nextMultiplier, reasons);
      }
    }
  };

  visit(subjectId, [], 1, []);

  const candidates = [...results.values()].filter(
    (c) => c.effectivePercent >= THRESHOLD || c.controlReasons.length > 0,
  );

  const edgesTotal = edges.length || 1;
  const opacityScore = Math.min(
    1,
    (nomineeCount / edgesTotal) * 0.4 +
      (bearerCount / edgesTotal) * 0.4 +
      (unknownUpwardCount / Math.max(1, parties.length)) * 0.3,
  );

  if (candidates.length === 0) {
    caveats.push('no UBO candidate met the 25% threshold or effective-control test');
  }

  return {
    subjectId,
    candidates: candidates.sort((a, b) => b.effectivePercent - a.effectivePercent),
    caveats,
    opacityScore,
  };
}
