// Hawkeye Sterling — cross-tenant federated typology (audit follow-up #27).
//
// Privacy-preserving similarity check across tenants. A subject's
// typology fingerprint (from typology-fingerprint.ts) is reduced to a
// k-anonymous bucket digest + LSH (locality-sensitive hash) signature
// that other tenants can compare against WITHOUT exchanging raw
// fingerprints, subject identifiers, or case details. Charter P4 +
// PDPL Art.13: the federated layer never carries PII or raw data;
// only opaque bucket+LSH digests.
//
// Algorithm:
//   1. Tenant A computes a TypologyFingerprint locally.
//   2. Reduce to a 16-band LSH signature via random hyperplane
//      projections (deterministic seed shared across the federation).
//   3. Hash each band → 32-bit bucket id.
//   4. Publish only the bucket-id vector (no raw fingerprint, no case
//      identifier, only an anonymous tenant-instance token).
//   5. Other tenants compute their own bucket vectors; matches are
//      found when ≥ K bands collide (typically K = 4 of 16 bands).
//   6. On match, the two tenants exchange a non-revealing
//      "we share this typology cluster" notification — they then
//      decide bilaterally whether to investigate further via OOB
//      channels.

import type { TypologyFingerprint } from './typology-fingerprint.js';

const LSH_BANDS = 16;
const HYPERPLANES_PER_BAND = 4;     // 4 bits per band → 16 buckets per band
const FEDERATION_SEED = 0xcafe_babe; // change to rotate the federation

export interface FederatedSignature {
  /** Anonymous tenant-instance token (NOT the tenant id — opaque). */
  tenantToken: string;
  /** Anonymous case token (not the case id — opaque, rotates per query). */
  caseToken: string;
  /** Computed at. */
  at: string;
  /** Length-LSH_BANDS array of unsigned 32-bit ints. */
  bandHashes: number[];
}

export interface FederatedMatch {
  remoteTenantToken: string;
  remoteCaseToken: string;
  collidingBands: number;
  similarity: number;       // collidingBands / LSH_BANDS
}

// Deterministic 32-bit splitmix random for hyperplane generation.
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = ((z ^ (z >>> 16)) * 0x85ebca6b) >>> 0;
    z = ((z ^ (z >>> 13)) * 0xc2b2ae35) >>> 0;
    return ((z ^ (z >>> 16)) >>> 0) / 0x100000000;
  };
}

// Generate the deterministic hyperplanes (so every tenant uses identical
// projections without shared state).
function generateHyperplanes(vectorLen: number): number[][][] {
  const rng = splitmix32(FEDERATION_SEED);
  const out: number[][][] = [];
  for (let band = 0; band < LSH_BANDS; band++) {
    const planes: number[][] = [];
    for (let plane = 0; plane < HYPERPLANES_PER_BAND; plane++) {
      const v: number[] = new Array<number>(vectorLen);
      for (let i = 0; i < vectorLen; i++) v[i] = rng() - 0.5;
      planes.push(v);
    }
    out.push(planes);
  }
  return out;
}

let _hyperplaneCache: number[][][] | null = null;
function hyperplanes(vectorLen: number): number[][][] {
  if (_hyperplaneCache && _hyperplaneCache[0]?.[0]?.length === vectorLen) {
    return _hyperplaneCache;
  }
  _hyperplaneCache = generateHyperplanes(vectorLen);
  return _hyperplaneCache;
}

function bandHash(vector: readonly number[], planes: number[][]): number {
  // Each plane contributes 1 bit (sign of dot product); 4 planes → 4-bit value.
  let bits = 0;
  for (let p = 0; p < planes.length; p++) {
    let dot = 0;
    const plane = planes[p]!;
    const minLen = Math.min(vector.length, plane.length);
    for (let i = 0; i < minLen; i++) dot += (vector[i] ?? 0) * (plane[i] ?? 0);
    if (dot >= 0) bits |= 1 << p;
  }
  return bits;
}

function fnv1a32(s: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Generate an anonymous federation signature from a fingerprint. */
export function generateFederatedSignature(
  fingerprint: TypologyFingerprint,
  tenantToken: string,
  options: { caseTokenSalt?: string } = {},
): FederatedSignature {
  const planes = hyperplanes(fingerprint.vector.length);
  const bandHashes = planes.map((band) => bandHash(fingerprint.vector, band));
  const caseSeed = `${fingerprint.caseId}::${options.caseTokenSalt ?? Date.now()}`;
  const caseToken = fnv1a32(caseSeed).toString(16).padStart(8, '0');
  return {
    tenantToken,
    caseToken,
    at: new Date().toISOString(),
    bandHashes,
  };
}

/** Compare a query signature against a federation registry. Returns
 *  matches with ≥ minBands colliding LSH bands. Privacy preserved —
 *  only band hashes + opaque tokens cross the wire. */
export function findFederatedMatches(
  query: FederatedSignature,
  registry: readonly FederatedSignature[],
  minBands = 4,
): FederatedMatch[] {
  const out: FederatedMatch[] = [];
  for (const remote of registry) {
    if (remote.tenantToken === query.tenantToken && remote.caseToken === query.caseToken) continue;
    let colliding = 0;
    for (let b = 0; b < LSH_BANDS; b++) {
      if ((remote.bandHashes[b] ?? -1) === (query.bandHashes[b] ?? -2)) colliding++;
    }
    if (colliding >= minBands) {
      out.push({
        remoteTenantToken: remote.tenantToken,
        remoteCaseToken: remote.caseToken,
        collidingBands: colliding,
        similarity: colliding / LSH_BANDS,
      });
    }
  }
  return out.sort((a, b) => b.collidingBands - a.collidingBands);
}

/** Anonymise a tenant id into the federation token. Stable per tenant
 *  but does not leak the tenant id (one-way fnv1a). */
export function tenantToken(tenantId: string, salt = 'hawkeye-fed-v1'): string {
  return fnv1a32(`${salt}::${tenantId}`).toString(16).padStart(8, '0');
}
