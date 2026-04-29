// Hawkeye Sterling — OSINT Bridge REST client.
// Wraps the six OSINT/analysis endpoints exposed by the Python FastAPI
// microservice at services/osint-bridge/.
//
// Env vars:
//   OSINT_BRIDGE_URL      — base URL of the running OSINT Bridge (required)
//   OSINT_BRIDGE_API_KEY  — X-API-Key header value (optional)

import { fetchJsonWithRetry } from './httpRetry.js';

declare const process: { env?: Record<string, string | undefined> } | undefined;

// ---------------------------------------------------------------------------
// Shared option bag
// ---------------------------------------------------------------------------

export interface OsintBridgeOptions {
  /** Override the microservice base URL (defaults to OSINT_BRIDGE_URL env var). */
  endpoint?: string;
  /** Override the API key (defaults to OSINT_BRIDGE_API_KEY env var). */
  apiKey?: string;
  /** Per-request timeout in milliseconds. Default 35 000. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface SherlockProfile {
  site: string;
  url: string;
  exists: boolean;
}

export interface SherlockResult {
  ok: boolean;
  username: string;
  profiles: SherlockProfile[];
  totalFound: number;
  error?: string;
}

export interface MaigretProfile {
  site: string;
  url: string;
  tags: string[];
  ids: Record<string, string>;
}

export interface MaigretResult {
  ok: boolean;
  username: string;
  profiles: MaigretProfile[];
  totalFound: number;
  error?: string;
}

export interface HarvesterResult {
  ok: boolean;
  domain: string;
  emails: string[];
  hosts: string[];
  ips: string[];
  error?: string;
}

export interface SocialAnalyzerProfile {
  platform: string;
  url: string;
  score: number;
}

export interface SocialAnalyzerResult {
  ok: boolean;
  person: string;
  profiles: SocialAnalyzerProfile[];
  error?: string;
}

export interface AnomalyResult {
  ok: boolean;
  algorithm: string;
  scores: number[];
  outliers: number[];
  error?: string;
}

export interface AmlSimAccount {
  id: string;
  balance: number;
}

export interface AmlSimTransaction {
  txId: string;
  src: string;
  dst: string;
  amount: number;
  step: number;
  timestamp: string;
}

export interface AmlSimResult {
  ok: boolean;
  pattern: string;
  accounts: AmlSimAccount[];
  transactions: AmlSimTransaction[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveBase(opts: OsintBridgeOptions): string | undefined {
  return opts.endpoint ?? (typeof process !== 'undefined' ? process.env?.OSINT_BRIDGE_URL : undefined);
}

function resolveApiKey(opts: OsintBridgeOptions): string | undefined {
  return opts.apiKey ?? (typeof process !== 'undefined' ? process.env?.OSINT_BRIDGE_API_KEY : undefined);
}

function buildHeaders(apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  return headers;
}

function notConfigured<T extends { ok: boolean; error?: string }>(
  partial: Omit<T, 'ok' | 'error'>,
): T {
  return { ...partial, ok: false, error: 'OSINT_BRIDGE_URL not configured' } as T;
}

// ---------------------------------------------------------------------------
// POST /sherlock
// ---------------------------------------------------------------------------

/**
 * Search for a username across 400+ social networks via Sherlock.
 */
export async function sherlockSearch(
  username: string,
  opts: OsintBridgeOptions = {},
): Promise<SherlockResult> {
  const base = resolveBase(opts);
  if (!base) {
    return notConfigured<SherlockResult>({ username, profiles: [], totalFound: 0 });
  }

  const apiKey = resolveApiKey(opts);
  const timeoutMs = opts.timeoutMs ?? 35_000;

  const result = await fetchJsonWithRetry<SherlockResult>(
    `${base.replace(/\/$/, '')}/sherlock`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ username }),
    },
    { perAttemptMs: timeoutMs, maxAttempts: 1 },
  );

  if (!result.ok || !result.json) {
    return {
      ok: false,
      username,
      profiles: [],
      totalFound: 0,
      error: result.error ?? 'Sherlock request failed',
    };
  }

  return result.json;
}

// ---------------------------------------------------------------------------
// POST /maigret
// ---------------------------------------------------------------------------

/**
 * Build a full profile dossier for a username via Maigret.
 */
export async function maigretProfile(
  username: string,
  opts: OsintBridgeOptions = {},
  sites?: number,
): Promise<MaigretResult> {
  const base = resolveBase(opts);
  if (!base) {
    return notConfigured<MaigretResult>({ username, profiles: [], totalFound: 0 });
  }

  const apiKey = resolveApiKey(opts);
  const timeoutMs = opts.timeoutMs ?? 35_000;

  const body: Record<string, unknown> = { username };
  if (sites !== undefined) body['sites'] = sites;

  const result = await fetchJsonWithRetry<MaigretResult>(
    `${base.replace(/\/$/, '')}/maigret`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
    },
    { perAttemptMs: timeoutMs, maxAttempts: 1 },
  );

  if (!result.ok || !result.json) {
    return {
      ok: false,
      username,
      profiles: [],
      totalFound: 0,
      error: result.error ?? 'Maigret request failed',
    };
  }

  return result.json;
}

// ---------------------------------------------------------------------------
// POST /harvester
// ---------------------------------------------------------------------------

/**
 * Harvest emails, subdomains, and IPs from public sources via theHarvester.
 */
export async function harvesterScan(
  domain: string,
  opts: OsintBridgeOptions = {},
  sources?: string[],
): Promise<HarvesterResult> {
  const base = resolveBase(opts);
  if (!base) {
    return notConfigured<HarvesterResult>({ domain, emails: [], hosts: [], ips: [] });
  }

  const apiKey = resolveApiKey(opts);
  const timeoutMs = opts.timeoutMs ?? 35_000;

  const body: Record<string, unknown> = { domain };
  if (sources !== undefined) body['sources'] = sources;

  const result = await fetchJsonWithRetry<HarvesterResult>(
    `${base.replace(/\/$/, '')}/harvester`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
    },
    { perAttemptMs: timeoutMs, maxAttempts: 1 },
  );

  if (!result.ok || !result.json) {
    return {
      ok: false,
      domain,
      emails: [],
      hosts: [],
      ips: [],
      error: result.error ?? 'harvester request failed',
    };
  }

  return result.json;
}

// ---------------------------------------------------------------------------
// POST /social-analyzer
// ---------------------------------------------------------------------------

/**
 * Analyze a person's presence across 1000+ platforms via Social Analyzer.
 */
export async function socialAnalyzerSearch(
  person: string,
  opts: OsintBridgeOptions = {},
  platforms?: string[],
): Promise<SocialAnalyzerResult> {
  const base = resolveBase(opts);
  if (!base) {
    return notConfigured<SocialAnalyzerResult>({ person, profiles: [] });
  }

  const apiKey = resolveApiKey(opts);
  const timeoutMs = opts.timeoutMs ?? 35_000;

  const body: Record<string, unknown> = { person };
  if (platforms !== undefined) body['platforms'] = platforms;

  const result = await fetchJsonWithRetry<SocialAnalyzerResult>(
    `${base.replace(/\/$/, '')}/social-analyzer`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
    },
    { perAttemptMs: timeoutMs, maxAttempts: 1 },
  );

  if (!result.ok || !result.json) {
    return {
      ok: false,
      person,
      profiles: [],
      error: result.error ?? 'social-analyzer request failed',
    };
  }

  return result.json;
}

// ---------------------------------------------------------------------------
// POST /anomaly
// ---------------------------------------------------------------------------

/**
 * Detect anomalies in a transaction feature matrix via PyOD.
 * @param features  2-D array of numeric transaction features, shape [n_samples, n_features].
 * @param algorithm IsolationForest | COPOD | ECOD (default: IsolationForest)
 * @param opts      Connection options.
 */
export async function detectAnomalies(
  features: number[][],
  algorithm = 'IsolationForest',
  opts: OsintBridgeOptions = {},
): Promise<AnomalyResult> {
  const base = resolveBase(opts);
  if (!base) {
    return notConfigured<AnomalyResult>({ algorithm, scores: [], outliers: [] });
  }

  const apiKey = resolveApiKey(opts);
  const timeoutMs = opts.timeoutMs ?? 35_000;

  const result = await fetchJsonWithRetry<AnomalyResult>(
    `${base.replace(/\/$/, '')}/anomaly`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ features, algorithm }),
    },
    { perAttemptMs: timeoutMs, maxAttempts: 1 },
  );

  if (!result.ok || !result.json) {
    return {
      ok: false,
      algorithm,
      scores: [],
      outliers: [],
      error: result.error ?? 'anomaly request failed',
    };
  }

  return result.json;
}

// ---------------------------------------------------------------------------
// POST /amlsim/patterns
// ---------------------------------------------------------------------------

/**
 * Generate synthetic AML transaction patterns via AMLSim.
 * @param pattern        fan-in | fan-out | cycle | scatter-gather
 * @param nAccounts      Number of accounts to generate (default: 5)
 * @param nTransactions  Number of transactions to generate (default: 20)
 * @param opts           Connection options.
 */
export async function amlSimPatterns(
  pattern: string,
  nAccounts = 5,
  nTransactions = 20,
  opts: OsintBridgeOptions = {},
): Promise<AmlSimResult> {
  const base = resolveBase(opts);
  if (!base) {
    return notConfigured<AmlSimResult>({ pattern, accounts: [], transactions: [] });
  }

  const apiKey = resolveApiKey(opts);
  const timeoutMs = opts.timeoutMs ?? 35_000;

  const result = await fetchJsonWithRetry<AmlSimResult>(
    `${base.replace(/\/$/, '')}/amlsim/patterns`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ pattern, n_accounts: nAccounts, n_transactions: nTransactions }),
    },
    { perAttemptMs: timeoutMs, maxAttempts: 1 },
  );

  if (!result.ok || !result.json) {
    return {
      ok: false,
      pattern,
      accounts: [],
      transactions: [],
      error: result.error ?? 'amlsim request failed',
    };
  }

  return result.json;
}
