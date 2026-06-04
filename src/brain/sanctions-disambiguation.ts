// Hawkeye Sterling — sanctions screening disambiguation engine.
//
// Multi-factor disambiguation scoring to reduce false positives in
// sanctions screening. Computes a `disambiguationScore` (0–100) based
// on confirming and contradicting factors between a screened subject
// and a sanctions-list candidate.
//
// Scoring factors (v2 — weaponised edition):
//   Nationality:   +25 (exact) / +10 (regional) / -30 (conflict)
//   DOB:           +30 (year+month) / +15 (year only) / -25 (conflict)
//   Aliases:       +20 per match, capped at +40
//   Gender:        +10 (match) / -15 (mismatch — clears obvious FPs)
//   Entity type:   +20 (match)
//   ID number:     +40 (exact national ID / passport match)
//   Address:       +10 (country extracted from address matches nationality)

import type { QuickScreenHit, QuickScreenSubject, QuickScreenCandidate } from './quick-screen.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConfidenceTier = 'confirmed' | 'probable' | 'possible' | 'unlikely' | 'unscored';

export interface DisambiguationFactors {
  /** +25 (exact nationality match) / +10 (regional) / -30 (conflict) */
  nationalityPoints: number;
  /** +30 (exact year+month DOB) / +15 (year only) / -25 (conflict) */
  dobPoints: number;
  /** +20 per matching alias (capped at +40 total) */
  aliasPoints: number;
  /** +10 (gender match) / -15 (mismatch) */
  genderPoints: number;
  /** +20 (same entity type: individual vs company) */
  entityTypePoints: number;
  /** +40 (exact national ID / passport number match) */
  idNumberPoints: number;
  /** +10 (address country matches subject nationality) */
  addressPoints: number;
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

// ISO alpha-2 → country name map for address extraction.
const ISO2_TO_NAME: Record<string, string> = {
  AE: 'UAE', SA: 'SAUDI ARABIA', KW: 'KUWAIT', QA: 'QATAR', BH: 'BAHRAIN', OM: 'OMAN',
  EG: 'EGYPT', IQ: 'IRAQ', IR: 'IRAN', SY: 'SYRIA', LB: 'LEBANON', JO: 'JORDAN',
  YE: 'YEMEN', LY: 'LIBYA', TN: 'TUNISIA', DZ: 'ALGERIA', MA: 'MOROCCO', SD: 'SUDAN',
  RU: 'RUSSIA', UA: 'UKRAINE', BY: 'BELARUS', KZ: 'KAZAKHSTAN', UZ: 'UZBEKISTAN',
  IN: 'INDIA', PK: 'PAKISTAN', BD: 'BANGLADESH', LK: 'SRI LANKA', AF: 'AFGHANISTAN',
  CN: 'CHINA', KP: 'NORTH KOREA', KR: 'SOUTH KOREA', JP: 'JAPAN', TW: 'TAIWAN',
  NG: 'NIGERIA', GH: 'GHANA', KE: 'KENYA', ZA: 'SOUTH AFRICA', ET: 'ETHIOPIA',
  GB: 'UNITED KINGDOM', US: 'UNITED STATES', DE: 'GERMANY', FR: 'FRANCE',
  TR: 'TURKEY', PH: 'PHILIPPINES', VN: 'VIETNAM', ID: 'INDONESIA', MY: 'MALAYSIA',
};

// Arabic/transliteration equivalence pairs — normalise before comparison.
const ARABIC_EQUIV: [RegExp, string][] = [
  [/\bmoha?mme?d\b/gi, 'mohammad'],
  [/\bmuh?ammad\b/gi, 'mohammad'],
  [/\bmoha?med\b/gi, 'mohammad'],
  [/\bal[- ]?hussein\b/gi, 'alhusain'],
  [/\bal[- ]?husayn\b/gi, 'alhusain'],
  [/\bal[- ]?husain\b/gi, 'alhusain'],
  [/\bali\b/gi, 'ali'],
  [/\babd[- ]?ullah\b/gi, 'abdallah'],
  [/\bab?dallah\b/gi, 'abdallah'],
  [/\babdullahi?\b/gi, 'abdallah'],
  [/\byusuf\b/gi, 'yusuf'],
  [/\byousef\b/gi, 'yusuf'],
  [/\byousu?f\b/gi, 'yusuf'],
  [/\bomar\b/gi, 'umar'],
  [/\bumar\b/gi, 'umar'],
  [/\bohamed\b/gi, 'mohammad'],
  [/ae/gi, 'a'],  // Müller → muller
  [/oe/gi, 'o'],
  [/ue/gi, 'u'],
  [/kh/gi, 'h'], // khalid → halid (phonetic merge)
  [/gh/gi, 'g'],
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
  if (s === c) return 25;
  // Also check ISO2 → name expansion
  const sExpanded = ISO2_TO_NAME[s] ?? s;
  const cExpanded = ISO2_TO_NAME[c] ?? c;
  if (sExpanded === cExpanded) return 25;
  const sr = nationalityRegionOf(s) ?? nationalityRegionOf(sExpanded);
  const cr = nationalityRegionOf(c) ?? nationalityRegionOf(cExpanded);
  if (sr !== null && cr !== null && sr === cr) return 10;
  return -30;
}

// ── DOB parsing — expanded format support ─────────────────────────────────────

interface DobParts { y: number; m?: number; d?: number }

function parseDob(raw: string): DobParts | null {
  const s = raw.trim();
  const isVY = (y: number) => y >= 1900 && y <= 2100;
  const isVM = (m: number) => m >= 1 && m <= 12;

  // ISO 8601 / YYYY-MM-DD or YYYY/MM/DD
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const y = +(iso[1] ?? '0'), m = +(iso[2] ?? '0'), d = +(iso[3] ?? '0');
    return (isVY(y) && isVM(m)) ? { y, m, d } : null;
  }
  // DMY: DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const y = +(dmy[3] ?? '0'), m = +(dmy[2] ?? '0'), d = +(dmy[1] ?? '0');
    return (isVY(y) && isVM(m)) ? { y, m, d } : null;
  }
  // MDY: MM/DD/YYYY (US format)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const y = +(mdy[3] ?? '0'), m = +(mdy[1] ?? '0'), d = +(mdy[2] ?? '0');
    // Disambiguate MDY vs DMY: if day candidate > 12, it must be DMY; else try MDY
    if (isVY(y) && isVM(m)) return { y, m, d };
  }
  // Named month: "15 Jan 1975", "January 15 1975", "15-Jan-1975"
  const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  const named = s.match(/^(\d{1,2})[- ]([A-Za-z]+)[- ](\d{4})$/) ||
                s.match(/^([A-Za-z]+)[- ](\d{1,2})[,\s]+(\d{4})$/);
  if (named) {
    // Try both orders
    let d: number, mStr: string, y: number;
    if (/^\d/.test(named[1] ?? '')) {
      d = +(named[1] ?? '0'); mStr = (named[2] ?? '').toLowerCase(); y = +(named[3] ?? '0');
    } else {
      mStr = (named[1] ?? '').toLowerCase(); d = +(named[2] ?? '0'); y = +(named[3] ?? '0');
    }
    const m = MONTHS[mStr];
    if (m && isVY(y) && isVM(m)) return { y, m, d };
  }
  // Year only
  const yo = s.match(/^(\d{4})$/);
  if (yo) { const y = +(yo[1] ?? '0'); return isVY(y) ? { y } : null; }
  // Partial "YYYY-MM"
  const ym = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym) {
    const y = +(ym[1] ?? '0'), m = +(ym[2] ?? '0');
    return (isVY(y) && isVM(m)) ? { y, m } : null;
  }
  return null;
}

function dobPoints(subjectDob: string | undefined, candidateDob: string | undefined): number {
  if (!subjectDob || !candidateDob) return 0;
  const sp = parseDob(subjectDob);
  const cp = parseDob(candidateDob);
  if (!sp || !cp) return 0;
  if (sp.y !== cp.y) return -25;
  // Partial DOB conflict: year matches but month differs — mild negative
  if (sp.m !== undefined && cp.m !== undefined && sp.m !== cp.m) return -5;
  if (sp.m !== undefined && cp.m !== undefined && sp.m === cp.m) return 30;
  return 15; // year only
}

// ── ID number exact match ─────────────────────────────────────────────────────

function normaliseId(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function idNumberPoints(
  subjectId: string | undefined,
  candidateId: string | undefined,
): number {
  if (!subjectId || !candidateId) return 0;
  const s = normaliseId(subjectId);
  const c = normaliseId(candidateId);
  if (!s || !c || s.length < 4) return 0; // too short to be meaningful
  return s === c ? 40 : 0;
}

// ── Address → country extraction ──────────────────────────────────────────────

function extractCountryFromAddress(address: string | undefined): string | null {
  if (!address) return null;
  const upper = address.toUpperCase();
  // Check ISO alpha-2 codes appearing as whole words
  for (const [iso, name] of Object.entries(ISO2_TO_NAME)) {
    const re = new RegExp(`\\b${iso}\\b`);
    if (re.test(upper)) return name;
    if (upper.includes(name)) return name;
  }
  // Check full country names from regions
  for (const group of NATIONALITY_REGIONS) {
    for (const entry of group) {
      if (entry.length > 2 && upper.includes(entry)) return entry;
    }
  }
  return null;
}

function addressPoints(
  subjectAddress: string | undefined,
  subjectNationality: string | undefined,
): number {
  if (!subjectAddress || !subjectNationality) return 0;
  const addrCountry = extractCountryFromAddress(subjectAddress);
  if (!addrCountry) return 0;
  const nat = subjectNationality.toUpperCase().trim();
  const natExpanded = ISO2_TO_NAME[nat] ?? nat;
  return (addrCountry === nat || addrCountry === natExpanded) ? 10 : 0;
}

// ── Alias match points ────────────────────────────────────────────────────────

export function normalise(s: string): string {
  let n = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // Apply Arabic/transliteration equivalences
  for (const [pattern, replacement] of ARABIC_EQUIV) {
    n = n.replace(pattern, replacement);
  }
  return n;
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
  return Math.min(40, matched * 20);
}

// ── Gender points — mismatch now penalises (-15) to clear obvious FPs ─────────

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
  // Mismatch = -15 (was 0). A male hit for a female client is an obvious FP.
  return s === c ? 10 : -15;
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
  return intersect / (sa.size + sb.size - intersect);
}

// ── Contradiction score ───────────────────────────────────────────────────────

export function contradictionScore(
  subject: Pick<QuickScreenSubject, 'dateOfBirth' | 'nationality'> & { gender?: string; idNumber?: string },
  candidate: Pick<QuickScreenCandidate, 'dateOfBirth' | 'nationality'> & { gender?: string; idNumber?: string },
): number {
  let score = 0;
  const dp = dobPoints(subject.dateOfBirth, candidate.dateOfBirth);
  if (dp < 0) score += Math.abs(dp);
  const np = nationalityPoints(subject.nationality, candidate.nationality);
  if (np === -30) score += 30;
  const gp = genderPoints(subject.gender, candidate.gender);
  if (gp < 0) score += Math.abs(gp); // -15 gender mismatch contributes
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
  subject: QuickScreenSubject & { gender?: string; idNumber?: string; address?: string };
  candidate: QuickScreenCandidate & { gender?: string; idNumber?: string };
  baseScore: number;
}

export function computeDisambiguation(input: DisambiguationInput): DisambiguationResult {
  const { subject, candidate, baseScore } = input;

  const nat = nationalityPoints(subject.nationality, candidate.nationality);
  const dob = dobPoints(subject.dateOfBirth, candidate.dateOfBirth);
  const alias = aliasPoints(subject.aliases, candidate.aliases);
  const gender = genderPoints(subject.gender, candidate.gender);
  const entityType = entityTypePoints(subject.entityType, candidate.entityType);
  const idNum = idNumberPoints(subject.idNumber, candidate.idNumber);
  const addr = addressPoints(subject.address, subject.nationality);

  const contradictionTotal = Math.min(0, nat) + Math.min(0, dob) + Math.min(0, gender);

  const factors: DisambiguationFactors = {
    nationalityPoints: nat,
    dobPoints: dob,
    aliasPoints: alias,
    genderPoints: gender,
    entityTypePoints: entityType,
    idNumberPoints: idNum,
    addressPoints: addr,
    contradictionPoints: contradictionTotal,
  };

  const raw = 50 + nat + dob + alias + gender + entityType + idNum + addr;
  const disambiguationScore = Math.min(100, Math.max(0, raw));
  const confidenceTier = confidenceTierFromScore(disambiguationScore);

  const sdnPrograms = candidate.programs?.length ? candidate.programs : undefined;

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
    if (gender === -15) parts.push(
      `gender conflict (subject: ${subject.gender ?? 'unknown'}, candidate: ${candidate.gender ?? 'unknown'})`,
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

const CLUSTER_THRESHOLD = 0.95;

export function clusterLookalikes(hits: QuickScreenHit[]): LookalikeClusters {
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

  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < assignments.length; i++) {
    const ci = assignments[i] ?? -1;
    if (!clusterMap.has(ci)) clusterMap.set(ci, []);
    clusterMap.get(ci)?.push(i);
  }

  const annotated: AnnotatedHit[] = hits.map((h) => ({ ...h }));
  const clusters: ClusterSummary[] = [];

  for (const [ci, members] of clusterMap.entries()) {
    if (members.length <= 1) continue;
    const label = `cluster-${ci}`;
    const firstIdx = members[0] ?? 0;
    const primaryName = centroids[ci] ?? hits[firstIdx]?.candidateName ?? '';
    const names = members.map((idx) => hits[idx]?.candidateName ?? '');
    clusters.push({ label, size: members.length, primaryName, names });
    for (const idx of members) {
      const a = annotated[idx];
      if (a) { a.clusterLabel = label; a.clusterSize = members.length; }
    }
  }

  annotated.sort((a, b) => {
    const ac = a.clusterLabel ?? '';
    const bc = b.clusterLabel ?? '';
    if (ac === bc) return b.score - a.score;
    if (!ac) return -1;
    if (!bc) return 1;
    return ac.localeCompare(bc);
  });

  return { hits: annotated, clusters };
}

// ── Convenience: annotate a QuickScreenHit with disambiguation ────────────────

export function enrichHitWithDisambiguation(
  hit: QuickScreenHit,
  subject: QuickScreenSubject & { gender?: string; idNumber?: string; address?: string },
  candidate: QuickScreenCandidate & { gender?: string; idNumber?: string },
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
