// Configurable screening threshold parameters.
// All 11 previously hardcoded constants are now env-var-overridable.
// Changing a value requires no code deploy — just an env var update and
// Lambda recycle.
//
// Federal Decree-Law No. 10 of 2025 Art.18: threshold changes that alter verdict outcomes must be
// recorded in the audit chain and signed off by the MLRO before deployment.

export interface ScreeningThresholds {
  /** Hours before UAE EOCN/LTL list is considered stale. Default: 36 */
  staleListHours: number;
  /** Hard wall-clock deadline for the full screening pipeline (ms). Default: 3000 */
  hardDeadlineMs: number;
  /** Per-adapter timeout before it is dropped and recorded as pending (ms). Default: 1500 */
  adapterTimeoutMs: number;
  /** Whitelist lookup timeout before falling through to full screen (ms). Default: 200 */
  whitelistTimeoutMs: number;
  /** Screening result cache TTL (ms). Default: 60000 */
  cacheExpiryMs: number;
  /** UN-1267 token-set pre-screen similarity threshold. Default: 0.80 */
  un1267Threshold: number;
  /** Score at which enrichment adapters are skipped (decisive result). Default: 0.98 */
  decisiveThreshold: number;
  /** Minimum base name-score required for HIGH/CRITICAL classification. Default: 0.60 */
  minBaseScoreForHigh: number;
  /** Minimum alias match length (chars) required for HIGH/CRITICAL classification. Default: 4 */
  minAliasLengthForHigh: number;
  /** Default match threshold when caller does not specify one. Default: 0.82 */
  defaultMatchThreshold: number;
  /** Bloom filter max age before stale (ms). Default: 360000 (6 min) */
  bloomMaxAgeMs: number;
  /** Fraction of bloomMaxAgeMs at which a proactive pre-expiry rebuild fires. Default: 0.80 */
  bloomPreExpiryFraction: number;
  /** Minimum entity count in a list blob to be considered healthy (not degraded). Default: 1 */
  listMinEntityCount: number;
}

function envFloat(key: string, def: number, min?: number, max?: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return def;
  const v = parseFloat(raw);
  if (!isFinite(v)) return def;
  if (min !== undefined && v < min) return def;
  if (max !== undefined && v > max) return def;
  return v;
}

function envInt(key: string, def: number, min?: number, max?: number): number {
  return Math.round(envFloat(key, def, min, max));
}

let _cached: ScreeningThresholds | null = null;

/** Returns screening thresholds, reading from env vars with defaults.
 *  Result is cached for the Lambda invocation lifetime. */
export function getScreeningThresholds(): ScreeningThresholds {
  if (_cached) return _cached;
  _cached = {
    staleListHours:         envFloat("SCREENING_STALE_LIST_HOURS",      36,    1,    720),
    hardDeadlineMs:         envInt(  "SCREENING_HARD_DEADLINE_MS",      3000,  500, 30000),
    adapterTimeoutMs:       envInt(  "SCREENING_ADAPTER_TIMEOUT_MS",    1500,  200, 15000),
    whitelistTimeoutMs:     envInt(  "SCREENING_WHITELIST_TIMEOUT_MS",   200,   50,  5000),
    cacheExpiryMs:          envInt(  "SCREENING_CACHE_EXPIRY_MS",      60000, 5000, 600000),
    un1267Threshold:        envFloat("SCREENING_UN1267_THRESHOLD",       0.80,  0.50, 1.0),
    decisiveThreshold:      envFloat("SCREENING_DECISIVE_THRESHOLD",     0.98,  0.80, 1.0),
    minBaseScoreForHigh:    envFloat("SCREENING_MIN_BASE_SCORE_HIGH",    0.60,  0.30, 1.0),
    minAliasLengthForHigh:  envInt(  "SCREENING_MIN_ALIAS_LENGTH_HIGH",     4,    1,  20),
    defaultMatchThreshold:  envFloat("SCREENING_DEFAULT_THRESHOLD",      0.82,  0.50, 1.0),
    bloomMaxAgeMs:          envInt(  "SCREENING_BLOOM_MAX_AGE_MS",     360000, 60000, 3600000),
    bloomPreExpiryFraction: envFloat("SCREENING_BLOOM_PRE_EXPIRY_FRAC",  0.80,  0.50, 0.95),
    listMinEntityCount:     envInt(  "SCREENING_LIST_MIN_ENTITY_COUNT",     1,    0,  1000),
  };
  return _cached;
}

/** Clear the cache — use in tests or after env-var hot-reload. */
export function clearThresholdCache(): void {
  _cached = null;
}
