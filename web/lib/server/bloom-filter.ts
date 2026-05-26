// Hawkeye Sterling — in-memory Bloom filter for candidate pre-screening.
//
// A Bloom filter lets the fuzzy-match engine answer "definitely not a
// candidate" in sub-millisecond time, avoiding the O(n·m) quickScreen()
// pass entirely for names that have zero token overlap with any sanctioned
// entity.
//
// Expected false-positive rate at m=2^18 bits, k=5 hashes, n=50 000 entries:
//   FPR ≈ (1 − e^(−k·n/m))^k ≈ 0.0001  (0.01%)
//
// When a lookup returns false (definitely not present) screening can return
// a "no_match" verdict without running quickScreen(). When it returns true
// (possibly present) the full engine runs normally.
//
// Build time is O(n·k) ≈ 250 000 ops — takes < 20 ms for 50 000 entities.
// Lookup time is O(k) ≈ 5 ops — < 0.01 ms per call.
//
// Thread-safety: the filter is written once at build time then read-only.
// No locks needed in a single-threaded Node.js Lambda.

const DEFAULT_BITS = 1 << 18; // 262 144 bits = 32 KB — fits in L2 cache
const DEFAULT_HASHES = 5;

// ── MurmurHash3 (32-bit, seed-based) ─────────────────────────────────────────
// Pure-JS, no dependencies. Fast enough at 5 calls/lookup.
function murmur32(str: string, seed: number): number {
  let h = seed >>> 0;
  const len = str.length;
  let i = 0;
  for (; i + 3 < len; i += 4) {
    let k =
      (str.charCodeAt(i) & 0xff) |
      ((str.charCodeAt(i + 1) & 0xff) << 8) |
      ((str.charCodeAt(i + 2) & 0xff) << 16) |
      ((str.charCodeAt(i + 3) & 0xff) << 24);
    k = Math.imul(k, 0xcc9e2d51);
    k = ((k << 15) | (k >>> 17));
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = ((h << 13) | (h >>> 19));
    h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
  }
  let remaining = 0;
  switch (len - i) {
    case 3: remaining |= (str.charCodeAt(i + 2) & 0xff) << 16; // fallthrough
    case 2: remaining |= (str.charCodeAt(i + 1) & 0xff) << 8;  // fallthrough
    case 1:
      remaining |= str.charCodeAt(i) & 0xff;
      remaining = Math.imul(remaining, 0xcc9e2d51);
      remaining = ((remaining << 15) | (remaining >>> 17));
      remaining = Math.imul(remaining, 0x1b873593);
      h ^= remaining;
  }
  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// ── Normalise a name for Bloom filter hashing ──────────────────────────────
// Strip punctuation, collapse whitespace, lower-case. Apply same
// normalisation at build and query time.
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Bloom filter class ─────────────────────────────────────────────────────

export class BloomFilter {
  private readonly bits: Uint8Array;
  private readonly m: number; // total bit count
  private readonly k: number; // hash count

  constructor(m = DEFAULT_BITS, k = DEFAULT_HASHES) {
    this.m = m;
    this.k = k;
    this.bits = new Uint8Array(Math.ceil(m / 8));
  }

  private setBit(pos: number): void {
    const idx = pos >>> 3;
    const bit = 1 << (pos & 7);
    this.bits[idx] |= bit;
  }

  private testBit(pos: number): boolean {
    const idx = pos >>> 3;
    const bit = 1 << (pos & 7);
    return (this.bits[idx] & bit) !== 0;
  }

  /** Add a name (and optionally its aliases) to the filter. */
  add(name: string): void {
    const norm = normalise(name);
    if (!norm) return;
    for (let i = 0; i < this.k; i++) {
      this.setBit(murmur32(norm, i * 0x9e3779b9) % this.m);
    }
    // Also add individual tokens so partial-name queries can short-circuit.
    for (const token of norm.split(" ").filter((t) => t.length >= 3)) {
      for (let i = 0; i < this.k; i++) {
        this.setBit(murmur32(token, i * 0x9e3779b9) % this.m);
      }
    }
  }

  /**
   * Returns false if the name is DEFINITELY not in the set.
   * Returns true if the name MIGHT be in the set (proceed to full match).
   */
  mightContain(name: string): boolean {
    const norm = normalise(name);
    if (!norm) return true; // conservative: empty query passes through
    for (let i = 0; i < this.k; i++) {
      if (!this.testBit(murmur32(norm, i * 0x9e3779b9) % this.m)) {
        return false; // at least one bit clear → definitely absent
      }
    }
    return true;
  }

  /**
   * Returns false only if NONE of the tokens in the query appear in the set.
   * Useful for multi-word names: "Osama Bin Laden" → check each token.
   */
  mightContainAnyToken(name: string): boolean {
    const tokens = normalise(name).split(" ").filter((t) => t.length >= 3);
    if (tokens.length === 0) return true;
    return tokens.some((t) => this.mightContain(t));
  }

  get bitCount(): number { return this.m; }
  get hashCount(): number { return this.k; }
  get byteSize(): number { return this.bits.byteLength; }
}

// ── Global filter instance (module-level singleton) ────────────────────────
//
// The filter is rebuilt whenever the candidate corpus is refreshed. It lives
// on globalThis so it persists across Next.js HMR cycles in development and
// across requests on the same warm Lambda.
declare global {
  // eslint-disable-next-line no-var
  var __hs_bloom_filter: BloomFilter | undefined;
  // eslint-disable-next-line no-var
  var __hs_bloom_built_at: number | undefined;
}

const BLOOM_MAX_AGE_MS = 6 * 60 * 1_000; // rebuild at most every 6 minutes

/** Return the current global filter (may be empty/unbuilt). */
export function getGlobalFilter(): BloomFilter {
  if (!globalThis.__hs_bloom_filter) {
    globalThis.__hs_bloom_filter = new BloomFilter();
    globalThis.__hs_bloom_built_at = 0;
  }
  return globalThis.__hs_bloom_filter;
}

/** Replace the global filter with one built from a fresh candidate set. */
export function rebuildGlobalFilter(
  candidates: ReadonlyArray<{ name: string; aliases?: string[] }>,
): void {
  const filter = new BloomFilter();
  for (const c of candidates) {
    filter.add(c.name);
    if (c.aliases) {
      for (const a of c.aliases) filter.add(a);
    }
  }
  globalThis.__hs_bloom_filter = filter;
  globalThis.__hs_bloom_built_at = Date.now();
}

/** True when the filter should be rebuilt (expired or never built). */
export function isFilterStale(): boolean {
  const builtAt = globalThis.__hs_bloom_built_at ?? 0;
  return Date.now() - builtAt > BLOOM_MAX_AGE_MS;
}

/**
 * Fast pre-screen a subject name against the global Bloom filter.
 *
 * @returns true  → proceed to full quickScreen()
 * @returns false → skip quickScreen(); return "no_match" immediately
 *
 * When the filter has not been built yet (cold start before first candidate
 * load) this function returns true (conservative pass-through) so no
 * screening is suppressed during the startup window.
 */
export function bloomPreScreen(subjectName: string, aliases: string[] = []): boolean {
  const filter = getGlobalFilter();
  if (!globalThis.__hs_bloom_built_at) return true; // filter not yet built
  if (filter.mightContainAnyToken(subjectName)) return true;
  return aliases.some((a) => filter.mightContainAnyToken(a));
}
