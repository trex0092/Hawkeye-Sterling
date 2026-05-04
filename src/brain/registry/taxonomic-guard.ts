// Hawkeye Sterling — registry taxonomic guard.
//
// Hard exclusion rules at the retrieval layer. The guard refuses to
// surface chunks whose subject tags are mutually exclusive with the
// query's detected subject — it prevents the Kimberley-on-gold
// confusion that surfaced in the demo audit.
//
// Each rule is one-directional: query signals on the LHS suppress
// chunks tagged with any tag on the RHS. Rules are deterministic and
// composable — ALL matching rules apply, not just the first.

import type { RegistryChunk, SubjectTag } from './types.js';

interface GuardRule {
  /** Stable id for audit-log breadcrumbs. */
  id: string;
  /** Patterns that, if matched against the query text, activate this
   *  rule. Case-insensitive. */
  querySignals: RegExp[];
  /** Subject tags that must NOT appear in the returned chunks when
   *  this rule is active. */
  excludeTags: SubjectTag[];
  /** Human-readable explanation surfaced in the retrieval result so
   *  the audit log records why the guard fired. */
  reason: string;
}

const GUARD_RULES: GuardRule[] = [
  {
    id: 'gold-excludes-diamond-kimberley',
    querySignals: [
      /\bgold\b/i,
      /\bbullion\b/i,
      /\bkilo[- ]?bar\b/i,
      /\bdor[eé]\b/i,
      /\bLBMA\b/i,
      /\brefiner(?:y|ies)\b/i,
      /\brefining\b/i,
      /\bjewell?er(?:y|s)?\b/i,
      /\bscrap[- ]?jewel/i,
      /\bgold\s*trader\b/i,
      /\bDPMS\b/i,
    ],
    excludeTags: ['kimberley', 'diamond', 'precious_stones'],
    reason:
      'Gold-context query — Kimberley Process Certification Scheme applies only to ' +
      'rough diamonds and other precious stones; suppressing diamond / Kimberley chunks.',
  },
  {
    id: 'diamond-excludes-lbma-gold',
    querySignals: [
      /\bdiamond(?:s)?\b/i,
      /\brough\s+stones?\b/i,
      /\bkimberley\b/i,
      /\bKPCS\b/i,
      /\bpolished\s+stones?\b/i,
    ],
    excludeTags: ['lbma', 'gold', 'precious_metals'],
    reason:
      'Diamond-context query — LBMA Responsible Gold Guidance applies only to ' +
      'gold supply chains; suppressing LBMA / gold-specific chunks.',
  },
  {
    id: 'crypto-excludes-fiat-cash-handling',
    querySignals: [
      /\bcrypto(?:currency)?\b/i,
      /\bvirtual\s+asset\b/i,
      /\bVASP\b/i,
      /\bwallet\s+address\b/i,
      /\bon[- ]chain\b/i,
      /\btravel\s+rule\b/i,
    ],
    excludeTags: ['cross_border_cash'],
    reason:
      'Crypto / VASP query — cross-border physical-cash declaration regimes are ' +
      'orthogonal; suppressing cash-courier-specific chunks.',
  },
  {
    id: 'fiat-cash-excludes-crypto-vasp',
    querySignals: [
      /\bcash\s+(?:transaction|deposit|courier|declaration)\b/i,
      /\bcurrency\s+declaration\b/i,
      /\bphysical\s+cash\b/i,
      /\bcross[- ]border\s+cash\b/i,
    ],
    excludeTags: ['crypto', 'vasp'],
    reason:
      'Fiat-cash query — VASP / on-chain instruments are out of scope; suppressing ' +
      'crypto-specific chunks.',
  },
];

export interface GuardOutcome {
  /** Tags excluded for this query (union across all matching rules). */
  excludedTags: Set<SubjectTag>;
  /** Reasons surfaced — one per matching rule. */
  reasons: string[];
  /** Audit-log breadcrumbs — one entry per matching rule, including
   *  the rule id so the audit query in Layer 5 can filter by rule. */
  trace: Array<{ ruleId: string; reason: string }>;
}

/** Inspect the query and compute which subject tags must not appear in
 *  the result set. Pure; the caller decides whether to run it. */
export function applyTaxonomicGuard(queryText: string): GuardOutcome {
  const excludedTags = new Set<SubjectTag>();
  const reasons: string[] = [];
  const trace: Array<{ ruleId: string; reason: string }> = [];
  for (const rule of GUARD_RULES) {
    const fired = rule.querySignals.some((rx) => rx.test(queryText));
    if (!fired) continue;
    for (const t of rule.excludeTags) excludedTags.add(t);
    reasons.push(rule.reason);
    trace.push({ ruleId: rule.id, reason: rule.reason });
  }
  return { excludedTags, reasons, trace };
}

/** Decide whether a chunk should be suppressed given a guard outcome.
 *  A chunk is suppressed iff at least one of its subject tags appears
 *  in the excluded set. Returns the matching tag for audit-log
 *  attribution. */
export function shouldSuppress(
  chunk: RegistryChunk,
  excludedTags: Set<SubjectTag>,
): { suppress: boolean; matchedTag?: SubjectTag } {
  for (const t of chunk.metadata.subjectTags) {
    if (excludedTags.has(t)) return { suppress: true, matchedTag: t };
  }
  return { suppress: false };
}

/** Test-only export of the rule list so the acceptance tests can
 *  iterate rules without re-deriving them. */
export const _GUARD_RULES_INTERNAL = GUARD_RULES;
