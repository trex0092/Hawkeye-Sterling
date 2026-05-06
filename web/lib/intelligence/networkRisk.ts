// Hawkeye Sterling — network / RCA risk helpers.
//
// Score the contagion risk from related parties — Relatives & Close
// Associates (RCAs), group companies, common directors / signatories.
// FATF R.12 explicitly extends PEP-tier scrutiny to family members and
// close associates; CBUAE extends correspondent / group-level risk to
// affiliates.

export type RelationKind =
  | "spouse"
  | "child"
  | "parent"
  | "sibling"
  | "in_law"
  | "business_partner"
  | "co_director"
  | "common_signatory"
  | "ubo_overlap"
  | "group_company"
  | "agent"
  | "other";

export interface RelatedParty {
  name: string;
  kind: RelationKind;
  /** Whether the related party is a sanctioned / PEP / adversely-reported subject. */
  flags?: {
    sanctioned?: boolean;
    pep?: boolean;
    adverseMedia?: boolean;
    /** Self-reported risk score 0..100. */
    riskScore?: number;
  };
}

const KIND_BASE_RISK: Record<RelationKind, number> = {
  spouse: 1.0,
  child: 0.85,
  parent: 0.85,
  sibling: 0.7,
  in_law: 0.55,
  business_partner: 0.9,
  co_director: 0.85,
  common_signatory: 0.85,
  ubo_overlap: 1.0,
  group_company: 0.95,
  agent: 0.65,
  other: 0.5,
};

/**
 * Compute network contagion: how much does the related-party graph add
 * to the subject's inherent risk? Returns 0..100. Only direct (1-hop)
 * relationships are scored here; second-hop (RCA-of-RCA) needs a graph
 * traversal which lives separately.
 */
export function networkContagion(parties: RelatedParty[]): {
  score: number;
  topContributors: Array<{ party: RelatedParty; contribution: number; reason: string }>;
  flaggedCount: number;
} {
  const contributors: Array<{ party: RelatedParty; contribution: number; reason: string }> = [];
  let total = 0;
  let flagged = 0;
  for (const p of parties) {
    const base = KIND_BASE_RISK[p.kind] ?? 0.5;
    let signal = 0;
    const reasons: string[] = [];
    if (p.flags?.sanctioned) {
      signal += 60;
      reasons.push("sanctioned");
    }
    if (p.flags?.pep) {
      signal += 30;
      reasons.push("PEP");
    }
    if (p.flags?.adverseMedia) {
      signal += 25;
      reasons.push("adverse media");
    }
    if (typeof p.flags?.riskScore === "number") {
      signal = Math.max(signal, p.flags.riskScore * 0.6);
      reasons.push(`risk score ${p.flags.riskScore}`);
    }
    if (signal > 0) flagged += 1;
    const contribution = Math.round(signal * base);
    if (contribution > 0) {
      total += contribution;
      contributors.push({ party: p, contribution, reason: reasons.join(", ") });
    }
  }
  contributors.sort((a, b) => b.contribution - a.contribution);
  return {
    score: Math.min(100, total),
    topContributors: contributors.slice(0, 5),
    flaggedCount: flagged,
  };
}

/**
 * Returns true when ≥1 related party is sanctioned — drives the OFAC 50%
 * rule check at the dispositionEngine level.
 */
export function hasSanctionedRelative(parties: RelatedParty[]): boolean {
  return parties.some((p) => p.flags?.sanctioned === true);
}
