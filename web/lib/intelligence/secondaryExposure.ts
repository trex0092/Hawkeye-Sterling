// Hawkeye Sterling — secondary-sanctions exposure scorer.
//
// The subject isn't on a list, but their counterparties / co-mentioned
// entities ARE. OFAC's secondary-sanctions framework + UAE FDL Art.21
// require institutions to assess this.
//
// Inputs: list of sanctioned-entity names found in adverse media (from
// coOccurrence module) + list of declared counterparties from the
// subject's KYC profile.
// Output: exposure score + the specific edges that triggered it.

export interface CounterpartyEdge {
  counterparty: string;
  matchedSanctionedEntity: string;
  matchListId?: string;
  evidence: "co-mention" | "declared-counterparty" | "ownership-chain";
  weight: number;          // 0..1 — strength of the link
}

export interface SecondaryExposureResult {
  exposureScore: number;            // 0..100
  band: "none" | "low" | "moderate" | "high" | "critical";
  edges: CounterpartyEdge[];
  uniqueSanctionedEntities: number;
  signal: string;
}

export function scoreSecondaryExposure(opts: {
  sanctionedAssociates: Array<{ name: string; matchedListId?: string }>;
  declaredCounterparties: string[];
  knownSanctioned: Array<{ name: string; listId: string }>;
}): SecondaryExposureResult {
  const edges: CounterpartyEdge[] = [];
  const sanctionedSet = new Map(
    opts.knownSanctioned.map((s) => [s.name.toLowerCase(), s.listId]),
  );

  // 1. Co-mention links from adverse-media analysis
  for (const a of opts.sanctionedAssociates) {
    edges.push({
      counterparty: a.name,
      matchedSanctionedEntity: a.name,
      matchListId: a.matchedListId,
      evidence: "co-mention",
      weight: 0.6,
    });
  }

  // 2. Declared counterparties cross-checked against sanctioned set
  for (const cp of opts.declaredCounterparties) {
    const listId = sanctionedSet.get(cp.toLowerCase());
    if (listId) {
      edges.push({
        counterparty: cp,
        matchedSanctionedEntity: cp,
        matchListId: listId,
        evidence: "declared-counterparty",
        weight: 1.0,        // declared counterparty + sanctioned = highest weight
      });
    }
  }

  // Score = max-weight contribution per edge, capped at 100
  let raw = 0;
  for (const e of edges) raw += e.weight * 35;
  const exposureScore = Math.min(100, Math.round(raw));

  let band: SecondaryExposureResult["band"];
  if (exposureScore >= 80) band = "critical";
  else if (exposureScore >= 60) band = "high";
  else if (exposureScore >= 30) band = "moderate";
  else if (exposureScore >= 10) band = "low";
  else band = "none";

  const uniqueSanctionedEntities = new Set(edges.map((e) => e.matchedSanctionedEntity.toLowerCase())).size;

  let signal: string;
  if (edges.length === 0) {
    signal = "No secondary-sanctions exposure detected via counterparties or co-mentions.";
  } else if (band === "critical" || band === "high") {
    signal = `${edges.length} link(s) to ${uniqueSanctionedEntities} sanctioned entity/entities. ESCALATE — secondary-sanctions exposure under OFAC + FDL Art.21 likely applies.`;
  } else {
    signal = `${edges.length} weak link(s) to sanctioned entities — document the diligence rationale and assess whether constructive knowledge applies.`;
  }

  return {
    exposureScore, band, edges,
    uniqueSanctionedEntities,
    signal,
  };
}
