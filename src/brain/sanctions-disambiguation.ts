// Hawkeye Sterling — sanctions screening disambiguation engine.
//
// Multi-factor disambiguation scoring to reduce false positives in
// sanctions screening. Computes a `disambiguationScore` (0–100) based
// on confirming and contradicting factors between a screened subject
// and a sanctions-list candidate.
//
// Design goals
// ─────────────
// 1. Multi-factor scoring: each corroborating/contradicting signal
//    contributes an explicit point value so the score is transparent
//    and auditable (not a black-box ML weight).
//
// 2. Confidence tiers map the score to four actionable outcomes:
//    85-100 → "confirmed"  — definitive match, recommend freeze
//    65-84  → "probable"   — MLRO manual review, 48h hold
//    45-64  → "possible"   — enhanced due diligence
//    0-44   → "unlikely"   — log and clear, no adverse action
//
// 3. Automatic false-positive detection: when name similarity is high
//    (baseScore > 0.85) but the contradiction score exceeds 50 (e.g.
//    different DOB + different nationality), the hit is auto-classified
//    as "likely_false_positive" with a structured explanation.
//
// 4. Watchlist program context: for OFAC hits the SDN programme names
//    (e.g. "UKRAINE", "IRAN", "DPRK") are surfaced so analysts can
//    assess relevance to their customer's risk profile.
//
// 5. Look-alike name clustering: hits whose candidateNames are more
//    than 95% similar to each other are grouped into a cluster so the
//    analyst sees "N variants of the same listing" rather than N
//    confusing duplicates.
//
// Name similarity (for clustering and FP detection) uses a compact
// trigram Jaccard implementation that matches the brain matching.ts
// approach — no external dependency.

import type { QuickScreenHit, QuickScreenSubject, QuickScreenCandidate } from './quick-screen.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConfidenceTier = 'confirmed' | 'probable' | 'possible' | 'unlikely';

export interface DisambiguationFactors {
  /** +25 (exact nationality match) / +10 (regional) / -30 (conflict) */
  nationalityPoints: number;
  /** +30 (exact year+month DOB) / +15 (year only) / -25 (conflict) */
  dobPoints: number;
  /** +20 per matching alias (capped at +40 total) */
  aliasPoints: number;
  /** +10 (gender match) */
  genderPoints: number;
  /** +20 (same entity type: individual vs company) */
  entityTypePoints: number;
  /** Sum of all negative-signal points (always ≤ 0) */
  contradictionPoints: number;
}

export interface DisambiguationResult {
  /** 0-100 composite disambiguation score. */
  disambiguationScore: number;
  /** Actionable confidence tier derived from the score. */
  confidenceTier: ConfidenceTier;
  /** Structured factor breakdown for audit trail transparency. */
  factors: DisambiguationFactors;
  /** Set to "likely_false_positive" when name similarity > 0.85 but
   *  contradiction evidence is strong (contradictionScore > 50). */
  falsePositiveFlag?: 'likely_false_positive';
  /** Human-readable explanation of the false-positive determination.
   *  Present only when falsePositiveFlag is set. */
  falsePositiveExplanation?: string;
  /** SDN programme names from OFAC hits (e.g. "UKRAINE-EO13685", "IRAN").
   *  Helps analysts assess whether the hit is relevant to their customer.
   *  Present only for hits that carry `programs` from the OFAC SDN list. */
  sdnPrograms?: string[];
}

export interface LookalikeClusters {
  /** Original hits array, reordered so cluster members are adjacent.
   *  Each hit gains a `clusterLabel` and `clusterSize` annotation. */
  hits: AnnotatedHit[];
  /** Summary of clusters where size > 1 — shown in the UI as
   *  "N variants of the same listing". */
  clusters: ClusterSummary[];
}

export interface AnnotatedHit extends QuickScreenHit {
  /** Cluster identifier — hits with the same label are look-alikes.
   *  Absent for hits that form a singleton (no near-duplicate). */
  clusterLabel?: string;
  /** Total members in this cluster (including self).
   *  1 = singleton. Only present when clusterLabel is set. */
  clusterSize?: number;
}

export interface ClusterSummary {
  /** Cluster identifier (stable within a result set). */
  label: string;
  /** Count of hits in this cluster. */
  size: number;
  /** Representative (highest-scoring) candidateName in the cluster. */
  primaryName: string;
  /** All candidateNames in the cluster. */
  names: string[];
}

// ── Regional nationality groupings for partial (+10) matching ──────────────────

// ISO 3166-1 alpha-2 / country-name groups. If subject and candidate share
// a region but not the exact nationality, we award +10 rather than +25.
const NATIONALITY_REGIONS: string[][] = [
  // Gulf Cooperation Council
  ['AE', 'SA', 'KW', 'QA', 'BH', 'OM',
   'UAE', 'SAUDI ARABIA', 'KUWAIT', 'QATAR', 'BAHRAIN', 'OMAN'],
  // MENA (broader)
  ['EG', 'IQ', 'IR', 'SY', 'LB', 'JO', 'YE', 'LY', 'TN', 'DZ', 'MA', 'SD',
   'EGYPT', 'IRAQ', 'IRAN', 'SYRIA', 'LEBANON', 'JORDAN', 'YEMEN', 'LIBYA',
   'TUNISIA', 'ALGERIA', 'MOROCCO', 'SUDAN'],
  // Former Soviet states
  ['RU', 'UA', 'BY', 'KZ', 'UZ', 'TM', 'AZ', 'GE', 'AM', 'KG', 'TJ', 'MD',
   'RUSSIA', 'UKRAINE', 'BELARUS', 'KAZAKHSTAN', 'UZBEKISTAN', 'TURKMENISTAN',
   'AZERBAIJAN', 'GEORGIA', 'ARMENIA', 'KYRGYZSTAN', 'TAJIKISTAN', 'MOLDOVA'],
  // South Asia
  ['IN', 'PK', 'BD', 'LK', 'NP', 'AF',
   'INDIA', 'PAKISTAN', 'BANGLADESH', 'SRI LANKA', 'NEPAL', 'AFGHANISTAN'],
  // East Asia
  ['CN', 'KP', 'KR', 'JP', 'TW',
   'CHINA', 'NORTH KOREA', 'SOUTH KOREA', 'JAPAN', 'TAIWAN'],
  // Sub-Saharan Africa
  ['NG', 'GH', 'KE', 'ZA', 'ET', 'TZ', 'UG', 'ZW', 'ZM',
   'NIGERIA', 'GHANA', 'KENYA', 'SOUTH AFRICA', 'ETHIOPIA', 'TANZANIA', 'UGANDA'],
];

function nationalityRegionOf(nat: string): string | null {
  const n = nat.toUpperCase().trim();
  for (let i = 0; i < NATIONALITY_REGIONS.length; i++) {
    const group = NATIONALITY_REGIONS[i];
    if (group && group.some((x) => x === n)) return String(i);
  }
  return null;
}

function nationalityPoints(
  subjectNat: string | undefined,
  candidateNat: string | undefined,
): number {
  if (!subjectNat || !candidateNat) return 0;
  const s = subjectNat.toUpperCase().trim();
  const c = candidateNat.toUpperCase().trim();
  if (!s || !c) return 0;
  if (s === c) return 25;          // exact match
  const sr = nationalityRegionOf(s);
  const cr = nationalityRegionOf(c);
  if (sr !== null && cr !== null && sr === cr) return 10; // same region
  return -30;                      // confirmed different nationality
}

// ── DOB points (distinct from the existing matchDOB boost in quick-screen.ts) ──

interface DobParts { y: number; m?: number; d?: number }

function parseDob(raw: string): DobParts | null {
  const s = raw.trim();
  const isVY = (y: number) => y >= 1900 && y <= 2100;
  const isVM = (m: number) => m >= 1 && m <= 12;
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const y = +(iso[1] ?? '0'), m = +(iso[2] ?? '0'), d = +(iso[3] ?? '0');
    return (isVY(y) && isVM(m)) ? { y, m, d } : null;
  }
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) {
    const y = +(dmy[3] ?? '0'), m = +(dmy[2] ?? '0'), d = +(dmy[1] ?? '0');
    return (isVY(y) && isVM(m)) ? { y, m, d } : null;
  }
  const yo = s.match(/^(\d{4})$/);
  if (yo) { const y = +(yo[1] ?? '0'); return isVY(y) ? { y } : null; }
  return null;
}

function dobPoints(subjectDob: string | undefined, candidateDob: string | undefined): number {
  if (!subjectDob || !candidateDob) return 0;
  const sp = parseDob(subjectDob);
  const cp = parseDob(candidateDob);
  if (!sp || !cp) return 0;
  if (sp.y !== cp.y) return -25;                   // year conflict — strong negative
  if (sp.m !== undefined && cp.m !== undefined && sp.m === cp.m) return 30; // year+month
  return 15;                                        // year only
}

// ── Alias match points ────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function aliasPoints(
  subjectAliases: string[] | undefined,
  candidateAliases: string[] | undefined,
): number {
  if (!subjectAliases?.length || !candidateAliases?.length) return 0;
  const sSet = new Set(subjectAliases.map(normalise));
  let matched = 0;
  for (const ca of candidateAliases) {
    if (sSet.has(normalise(ca))) matched++;
  }
  return Math.min(40, matched * 20); // +20 per match, cap at +40
}

// ── Gender points ─────────────────────────────────────────────────────────────

type Gender = 'M' | 'F' | 'male' | 'female' | 'm' | 'f';

function canonGender(g: string | undefined): 'M' | 'F' | null {
  if (!g) return null;
  const u = g.trim().toUpperCase();
  if (u === 'M' || u === 'MALE') return 'M';
  if (u === 'F' || u === 'FEMALE') return 'F';
  return null;
}

function genderPoints(
  subjectGender: Gender | string | undefined,
  candidateGender: Gender | string | undefined,
): number {
  const s = canonGender(subjectGender);
  const c = canonGender(candidateGender);
  if (!s || !c) return 0;
  return s === c ? 10 : 0; // gender match = +10; mismatch = 0 (not a hard negative for individuals)
}

// ── Entity type points ────────────────────────────────────────────────────────

function entityTypePoints(
  subjectType: string | undefined,
  candidateType: string | undefined,
): number {
  if (!subjectType || !candidateType) return 0;
  const s = subjectType.toLowerCase();
  const c = candidateType.toLowerCase();
  if (s === c) return 20;
  // individual vs organisation is a significant mismatch — already penalised in
  // quick-screen.ts via entityTypeMismatch 0.6× factor, so we don't double-count
  // the penalty here. We just don't award the +20 bonus.
  return 0;
}

// ── Trigram similarity (for false-positive detection and clustering) ───────────

function trigramSet(s: string): Set<string> {
  const n = normalise(s);
  const grams = new Set<string>();
  for (let i = 0; i < n.length - 2; i++) grams.add(n.slice(i, i + 3));
  return grams;
}

export function trigramSimilarity(a: string, b: string): number {
  const sa = trigramSet(a);
  const sb = trigramSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersect = 0;
  for (const g of sa) { if (sb.has(g)) intersect++; }
  return intersect / (sa.size + sb.size - intersect); // Jaccard
}

// ── Contradiction score (for FP auto-detection) ───────────────────────────────

/**
 * Contradiction score 0-100: how strongly do the identifiers contradict
 * a match between subject and candidate? Only uses negative signals.
 *
 * Used alongside baseScore to trigger the "likely_false_positive" flag:
 * contradictionScore > 50 AND baseScore > 0.85 → likely false positive.
 */
export function contradictionScore(
  subject: Pick<QuickScreenSubject, 'dateOfBirth' | 'nationality'>,
  candidate: Pick<QuickScreenCandidate, 'dateOfBirth' | 'nationality'>,
): number {
  let score = 0;
  const dp = dobPoints(subject.dateOfBirth, candidate.dateOfBirth);
  if (dp < 0) score += -dp;       // -25 → 25 contradiction points
  const np = nationalityPoints(subject.nationality, candidate.nationality);
  if (np === -30) score += 30;    // different nationality → 30 contradiction points
  return Math.min(100, score);
}

// ── Confidence tier ───────────────────────────────────────────────────────────

export function confidenceTierFromScore(score: number): ConfidenceTier {
  if (score >= 85) return 'confirmed';
  if (score >= 65) return 'probable';
  if (score >= 45) return 'possible';
  return 'unlikely';
}

// ── Main disambiguation scorer ────────────────────────────────────────────────

export interface DisambiguationInput {
  subject: QuickScreenSubject & { gender?: string };
  candidate: QuickScreenCandidate & { gender?: string };
  /** Raw name-matching base score (0..1) from the matching engine. */
  baseScore: number;
}

/**
 * Compute the multi-factor disambiguation score (0-100) for a single
 * subject → candidate pair.
 *
 * The score is additive:
 *   Nationality:  +25 (exact) / +10 (regional) / -30 (different)
 *   DOB:          +30 (year+month) / +15 (year only) / -25 (conflict)
 *   Aliases:      +20 per match, capped at +40
 *   Gender:       +10 (match)
 *   Entity type:  +20 (match)
 *
 * The raw sum is offset from a neutral baseline of 50 and clamped to
 * [0, 100]. The baseline means "no corroborating or contradicting
 * evidence" → score 50 → "possible" tier.
 *
 * Name similarity is already captured in the base score from the
 * matching engine. We intentionally do not re-score names here to
 * avoid double-counting.
 */
export function computeDisambiguation(input: DisambiguationInput): DisambiguationResult {
  const { subject, candidate, baseScore } = input;

  const nat = nationalityPoints(subject.nationality, candidate.nationality);
  const dob = dobPoints(subject.dateOfBirth, candidate.dateOfBirth);
  const alias = aliasPoints(subject.aliases, candidate.aliases);
  const gender = genderPoints(subject.gender, candidate.gender);
  const entityType = entityTypePoints(subject.entityType, candidate.entityType);

  // Contradiction points = sum of all negative contributions (kept ≤ 0)
  const contradictionTotal = Math.min(0, nat) + Math.min(0, dob);

  const factors: DisambiguationFactors = {
    nationalityPoints: nat,
    dobPoints: dob,
    aliasPoints: alias,
    genderPoints: gender,
    entityTypePoints: entityType,
    contradictionPoints: contradictionTotal,
  };

  // Raw additive score centred on 50 (neutral).
  const raw = 50 + nat + dob + alias + gender + entityType;
  const disambiguationScore = Math.min(100, Math.max(0, raw));
  const confidenceTier = confidenceTierFromScore(disambiguationScore);

  // SDN programme context — surface OFAC programme codes so analysts can
  // assess whether the hit's programme (e.g. "IRAN", "DPRK") is relevant
  // to their customer. Only populated for hits that carry programs[].
  const sdnPrograms = candidate.programs?.length ? candidate.programs : undefined;

  // Automatic false-positive detection:
  // High name similarity (> 0.85 base score) PLUS strong contradiction
  // (DOB conflict + nationality conflict together > 50) → likely FP.
  const cs = contradictionScore(subject, candidate);
  const result: DisambiguationResult = {
    disambiguationScore,
    confidenceTier,
    factors,
    ...(sdnPrograms ? { sdnPrograms } : {}),
  };

  if (baseScore > 0.85 && cs > 50) {
    const parts: string[] = [];
    if (dob < 0) parts.push(
      `DOB conflict (subject: ${subject.dateOfBirth ?? 'unknown'}, candidate: ${candidate.dateOfBirth ?? 'unknown'})`,
    );
    if (nat === -30) parts.push(
      `nationality conflict (subject: ${subject.nationality ?? 'unknown'}, candidate: ${candidate.nationality ?? 'unknown'})`,
    );
    result.falsePositiveFlag = 'likely_false_positive';
    result.falsePositiveExplanation =
      `High name similarity (${Math.round(baseScore * 100)}%) with contradicting identifiers: ` +
      parts.join('; ') +
      '. Recommend auto-clearing subject to false positive pending MLRO confirmation.';
  }

  return result;
}

// ── Look-alike name clustering ────────────────────────────────────────────────

/**
 * Cluster hits whose candidateNames are >= 95% similar (trigram Jaccard)
 * so the analyst sees "N variants of the same listing" rather than N
 * confusing near-duplicate rows.
 *
 * Algorithm: greedy single-linkage clustering.
 *   1. Process hits in score order (highest first — already sorted by caller).
 *   2. For each hit, check if its name is >= CLUSTER_THRESHOLD similar to any
 *      existing cluster centroid (the first hit in the cluster).
 *   3. If similar, add to that cluster; otherwise start a new cluster.
 *
 * This is O(n²) — acceptable for our max hit count of 200 (common names).
 */
const CLUSTER_THRESHOLD = 0.95;

export function clusterLookalikes(hits: QuickScreenHit[]): LookalikeClusters {
  // centroid[i] = candidateName of the first hit in cluster i
  const centroids: string[] = [];
  const assignments: number[] = new Array(hits.length).fill(-1);

  for (let i = 0; i < hits.length; i++) {
    const name = hits[i]?.candidateName ?? '';
    let assigned = false;
    for (let ci = 0; ci < centroids.length; ci++) {
      const sim = trigramSimilarity(name, centroids[ci] ?? '');
      if (sim >= CLUSTER_THRESHOLD) {
        assignments[i] = ci;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      assignments[i] = centroids.length;
      centroids.push(name);
    }
  }

  // Build per-cluster membership
  const clusterMap = new Map<number, number[]>(); // clusterIdx → [hitIdx, ...]
  for (let i = 0; i < assignments.length; i++) {
    const ci = assignments[i] ?? -1;
    if (!clusterMap.has(ci)) clusterMap.set(ci, []);
    clusterMap.get(ci)?.push(i);
  }

  // Build cluster summaries and annotate hits
  const annotated: AnnotatedHit[] = hits.map((h) => ({ ...h }));
  const clusters: ClusterSummary[] = [];

  for (const [ci, members] of clusterMap.entries()) {
    if (members.length <= 1) continue; // singleton — no annotation needed
    const label = `cluster-${ci}`;
    const firstIdx = members[0] ?? 0;
    const primaryName = centroids[ci] ?? hits[firstIdx]?.candidateName ?? '';
    const names = members.map((idx) => hits[idx]?.candidateName ?? '');
    clusters.push({ label, size: members.length, primaryName, names });
    for (const idx of members) {
      const a = annotated[idx];
      if (a) {
        a.clusterLabel = label;
        a.clusterSize = members.length;
      }
    }
  }

  // Reorder: non-clustered first, then by cluster so members are adjacent
  annotated.sort((a, b) => {
    const ac = a.clusterLabel ?? '';
    const bc = b.clusterLabel ?? '';
    if (ac === bc) return b.score - a.score;
    if (!ac) return -1; // singletons first
    if (!bc) return 1;
    return ac.localeCompare(bc);
  });

  return { hits: annotated, clusters };
}

// ── Convenience: annotate a QuickScreenHit with disambiguation ────────────────

/**
 * Enrich a single hit with the full multi-factor disambiguation result.
 * Returns a new hit object — does not mutate the input.
 *
 * The hit must already have `baseScore` and the candidate reference
 * for discriminator fields. Subject and candidate are passed separately
 * so the caller (quick-screen.ts) can thread them through.
 */
export function enrichHitWithDisambiguation(
  hit: QuickScreenHit,
  subject: QuickScreenSubject & { gender?: string },
  candidate: QuickScreenCandidate & { gender?: string },
): QuickScreenHit & {
  disambiguationScore: number;
  confidenceTier: ConfidenceTier;
  disambiguationFactors: DisambiguationFactors;
  falsePositiveFlag?: 'likely_false_positive';
  falsePositiveExplanation?: string;
  sdnPrograms?: string[];
} {
  const dis = computeDisambiguation({ subject, candidate, baseScore: hit.baseScore });
  return {
    ...hit,
    disambiguationScore: dis.disambiguationScore,
    confidenceTier: dis.confidenceTier,
    disambiguationFactors: dis.factors,
    ...(dis.falsePositiveFlag ? { falsePositiveFlag: dis.falsePositiveFlag } : {}),
    ...(dis.falsePositiveExplanation ? { falsePositiveExplanation: dis.falsePositiveExplanation } : {}),
    ...(dis.sdnPrograms ? { sdnPrograms: dis.sdnPrograms } : {}),
  };
}
