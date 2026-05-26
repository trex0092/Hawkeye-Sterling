// Hawkeye Sterling — Cross-Case Emerging Typology Miner (Wave 14 Feature 3).
// Mines MLRO feedback journal for structural patterns absent from the FATF library.
// When ≥3 confirmed STR cases share a pattern, proposes a new typology for approval.

import type { OutcomeRecord } from './outcome-feedback.js';

export interface TypologyFingerprint {
  caseId: string;
  vector: number[];  // 48-dimensional feature vector
  confirmedStr: boolean;
}

export interface TypologyCandidate {
  candidateId: string;
  patternDescription: string;
  supportingCases: string[];
  featureBands: Record<string, number>;
  centroid: number[];
  clusterSize: number;
  status: 'pending_mlro_approval' | 'approved' | 'rejected';
  proposedAt: string;
}

// Feature band indices in the 48-dim vector
const FEATURE_BANDS = {
  sanctions: [0, 7],
  pep: [8, 15],
  adverseMedia: [16, 23],
  ubo: [24, 31],
  transaction: [32, 39],
  jurisdiction: [40, 47],
} as const;

const CLUSTER_DISTANCE_THRESHOLD = 0.35;
const EXISTING_TYPOLOGY_SIMILARITY_THRESHOLD = 0.80;
const MIN_CLUSTER_SIZE = 3;

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom < 1e-9 ? 0 : dot / denom;
}

function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0]?.length ?? 0;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) sum[i] = (sum[i] ?? 0) + (v[i] ?? 0);
  }
  return sum.map((s) => s / vectors.length);
}

function extractFeatureBands(vector: number[]): Record<string, number> {
  const bands: Record<string, number> = {};
  for (const [name, [start, end]] of Object.entries(FEATURE_BANDS)) {
    const slice = vector.slice(start, end + 1);
    bands[name] = slice.reduce((s, v) => s + v, 0) / slice.length;
  }
  return bands;
}

function describePattern(featureBands: Record<string, number>): string {
  const elevated = Object.entries(featureBands)
    .filter(([, v]) => v > 0.5)
    .sort(([, a], [, b]) => b - a)
    .map(([k]) => k);
  if (elevated.length === 0) return 'Multi-factor pattern with moderate signals across all dimensions.';
  return `Pattern characterised by elevated ${elevated.join(' + ')} signals. ` +
    `Primary indicators: ${elevated[0] ?? 'unknown'} (${((featureBands[elevated[0] ?? ''] ?? 0) * 100).toFixed(0)}%). ` +
    `Potential typology: ${elevated.includes('transaction') && elevated.includes('jurisdiction') ? 'TBML/cross-border layering' : elevated.includes('pep') ? 'PEP-linked structuring' : elevated.includes('ubo') ? 'Shell-company layering' : 'Novel multi-signal pattern'}.`;
}

export function buildFingerprintFromRecord(
  record: OutcomeRecord,
  score: number,
): TypologyFingerprint {
  // Build a 48-dim vector from outcome record metadata
  // This is a heuristic approximation when full signal vectors aren't stored
  const v = new Array<number>(48).fill(0);
  if (record.modeIds) {
    const modeStr = record.modeIds.join(' ');
    if (modeStr.includes('sanction')) for (let i = 0; i < 8; i++) v[i] = 0.8;
    if (modeStr.includes('pep')) for (let i = 8; i < 16; i++) v[i] = 0.7;
    if (modeStr.includes('adverse')) for (let i = 16; i < 24; i++) v[i] = 0.6;
    if (modeStr.includes('ubo') || modeStr.includes('shell')) for (let i = 24; i < 32; i++) v[i] = 0.75;
    if (modeStr.includes('transaction') || modeStr.includes('tbml') || modeStr.includes('structuring')) for (let i = 32; i < 40; i++) v[i] = 0.7;
    if (modeStr.includes('jurisdiction') || modeStr.includes('cahra')) for (let i = 40; i < 48; i++) v[i] = 0.65;
  }
  // Normalise by score
  return {
    caseId: record.runId,
    vector: v.map((x) => x * Math.min(1, score)),
    confirmedStr: record.groundTruth === 'confirmed',
  };
}

export function mineEmergingTypologies(
  fingerprints: TypologyFingerprint[],
  existingCentroids: number[][] = [],
  threshold = MIN_CLUSTER_SIZE,
): TypologyCandidate[] {
  const strFingerprints = fingerprints.filter((f) => f.confirmedStr);
  if (strFingerprints.length < threshold) return [];

  // Single-linkage agglomeration
  const clusters: TypologyFingerprint[][] = strFingerprints.map((f) => [f]);

  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const ci = clusters[i]; const cj = clusters[j];
        if (!ci || !cj) continue;
        // Check max intra-cluster distance between any pair across the two clusters
        let maxDist = 0;
        for (const a of ci) {
          for (const b of cj) {
            const dist = 1 - cosineSimilarity(a.vector, b.vector);
            if (dist > maxDist) maxDist = dist;
          }
        }
        if (maxDist < CLUSTER_DISTANCE_THRESHOLD) {
          // Merge j into i
          clusters[i] = [...ci, ...cj];
          clusters.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  const candidates: TypologyCandidate[] = [];
  const now = new Date().toISOString();
  let n = 0;

  for (const cluster of clusters) {
    if (cluster.length < threshold) continue;

    const clusterCentroid = centroid(cluster.map((f) => f.vector));

    // Check against existing typology centroids
    const maxSimilarity = existingCentroids.reduce((maxS, existing) => {
      const sim = cosineSimilarity(clusterCentroid, existing);
      return Math.max(maxS, sim);
    }, 0);

    if (maxSimilarity >= EXISTING_TYPOLOGY_SIMILARITY_THRESHOLD) continue;

    const featureBands = extractFeatureBands(clusterCentroid);
    const month = now.slice(0, 7).replace('-', '');
    n++;

    candidates.push({
      candidateId: `CAND-${month}-${String(n).padStart(3, '0')}`,
      patternDescription: describePattern(featureBands),
      supportingCases: cluster.map((f) => f.caseId),
      featureBands,
      centroid: clusterCentroid,
      clusterSize: cluster.length,
      status: 'pending_mlro_approval',
      proposedAt: now,
    });
  }

  return candidates;
}
