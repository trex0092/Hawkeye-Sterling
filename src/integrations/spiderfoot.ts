// Hawkeye Sterling — SpiderFoot OSINT REST API client.
// SpiderFoot (smicallef/spiderfoot) exposes a REST API when self-hosted.
// This client submits a scan target and polls for completion, then returns
// the AML-relevant findings: email addresses, domains, social accounts,
// breach data, and correlated risk indicators.
//
// Env vars:
//   SPIDERFOOT_URL      — base URL of self-hosted SpiderFoot (required)
//   SPIDERFOOT_API_KEY  — API key if auth is enabled (optional)

import { fetchJsonWithRetry } from './httpRetry.js';

declare const process: { env?: Record<string, string | undefined> } | undefined;

export interface SpiderFootScanOptions {
  endpoint?: string;
  apiKey?: string;
  /** SpiderFoot module set. 'all' runs every module; 'passive' avoids active probing. */
  moduleSet?: 'all' | 'passive' | 'safe';
  /** Scan poll interval ms. Default 5000. */
  pollIntervalMs?: number;
  /** Max total wait for scan completion ms. Default 120_000. */
  maxWaitMs?: number;
  timeoutMs?: number;
}

export interface SpiderFootFinding {
  type: string;           // SpiderFoot event type e.g. 'EMAILADDR', 'DOMAIN_NAME'
  data: string;           // Raw value
  module: string;         // Module that produced it
  confidence: number;     // 0–100
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INFO';
  source: string;
  timestamp: string;
}

export interface SpiderFootScanResult {
  ok: boolean;
  scanId?: string;
  target: string;
  status: 'STARTED' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT' | 'NOT_CONFIGURED';
  findings: SpiderFootFinding[];
  summary: {
    totalFindings: number;
    emailAddresses: string[];
    domains: string[];
    socialProfiles: string[];
    breachData: string[];
    riskIndicators: string[];
  };
  error?: string;
}

interface SpiderFootScanStatus {
  status?: string;
  name?: string;
  id?: string;
}

interface SpiderFootEvent {
  type?: string;
  data?: string;
  module?: string;
  confidence?: number;
  risk?: string;
  source?: string;
  generated?: string;
}

// AML-relevant SpiderFoot event types to extract
const AML_EVENT_TYPES = new Set([
  'EMAILADDR', 'EMAILADDR_COMPROMISED',
  'DOMAIN_NAME', 'DOMAIN_WHOIS',
  'SOCIAL_MEDIA', 'USERNAME',
  'PHONE_NUMBER',
  'DARKWEB_MENTION', 'LEAKSITE_CONTENT',
  'MALICIOUS_IPADDR', 'MALICIOUS_INTERNET_NAME',
  'COMPANY_NAME', 'AFFILIATE',
  'IP_ADDRESS', 'INTERNET_NAME',
  'ACCOUNT_EXTERNAL_OWNED', 'ACCOUNT_EXTERNAL_OWNED_COMPROMISED',
]);

function categorise(findings: SpiderFootFinding[]): SpiderFootScanResult['summary'] {
  return {
    totalFindings: findings.length,
    emailAddresses: findings.filter((f) => f.type === 'EMAILADDR').map((f) => f.data),
    domains: findings.filter((f) => f.type === 'DOMAIN_NAME' || f.type === 'INTERNET_NAME').map((f) => f.data),
    socialProfiles: findings.filter((f) => f.type === 'SOCIAL_MEDIA' || f.type === 'USERNAME').map((f) => f.data),
    breachData: findings.filter((f) => f.type.includes('COMPROMISED') || f.type.includes('LEAKSITE')).map((f) => f.data),
    riskIndicators: findings.filter((f) => f.risk === 'HIGH' || f.risk === 'CRITICAL').map((f) => `${f.type}: ${f.data}`),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function spiderFootScan(
  target: string,
  opts: SpiderFootScanOptions = {},
): Promise<SpiderFootScanResult> {
  const endpoint = opts.endpoint ?? (typeof process !== 'undefined' ? process.env?.SPIDERFOOT_URL : undefined);
  if (!endpoint) {
    return {
      ok: false, target, status: 'NOT_CONFIGURED', findings: [],
      summary: { totalFindings: 0, emailAddresses: [], domains: [], socialProfiles: [], breachData: [], riskIndicators: [] },
      error: 'SPIDERFOOT_URL not configured',
    };
  }

  const base = endpoint.replace(/\/$/, '');
  const apiKey = opts.apiKey ?? (typeof process !== 'undefined' ? process.env?.SPIDERFOOT_API_KEY : undefined);
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
  const maxWaitMs = opts.maxWaitMs ?? 120_000;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (apiKey) headers['X-API-Key'] = apiKey;

  // Submit scan
  const body = new URLSearchParams({
    scanname: `hs-${Date.now()}`,
    scantarget: target,
    modulelist: opts.moduleSet === 'passive' ? 'sfp_passive' : '',
    typelist: '',
  });

  const startResult = await fetchJsonWithRetry<{ id?: string }>(
    `${base}/startscan`,
    { method: 'POST', headers, body: body.toString() },
    { perAttemptMs: timeoutMs, maxAttempts: 2 },
  );

  if (!startResult.ok || !startResult.json?.id) {
    return {
      ok: false, target, status: 'ERROR', findings: [],
      summary: { totalFindings: 0, emailAddresses: [], domains: [], socialProfiles: [], breachData: [], riskIndicators: [] },
      error: startResult.error ?? 'Failed to start SpiderFoot scan',
    };
  }

  const scanId = startResult.json.id;

  // Poll for completion
  const started = Date.now();
  let status = 'RUNNING';
  while (status === 'RUNNING' || status === 'STARTED') {
    // Sleep BEFORE the timeout check so the first status poll fires immediately
    // after the scan is submitted. Timeout guard is placed before the sleep so
    // we don't overshoot the deadline by a full pollIntervalMs on the final
    // iteration — previously the sleep always preceded the check, adding up
    // to one extra pollIntervalMs of delay after the budget had expired.
    await sleep(pollIntervalMs);
    if (Date.now() - started > maxWaitMs) {
      return {
        ok: false, scanId, target, status: 'TIMEOUT', findings: [],
        summary: { totalFindings: 0, emailAddresses: [], domains: [], socialProfiles: [], breachData: [], riskIndicators: [] },
        error: `Scan timed out after ${maxWaitMs}ms`,
      };
    }

    const statusResult = await fetchJsonWithRetry<SpiderFootScanStatus>(
      `${base}/scanstatus?id=${encodeURIComponent(scanId)}`,
      { method: 'GET', headers: { accept: 'application/json', ...(apiKey ? { 'X-API-Key': apiKey } : {}) } },
      { perAttemptMs: timeoutMs, maxAttempts: 2 },
    );

    status = statusResult.json?.status ?? 'ERROR';
    if (status === 'ERROR') {
      return {
        ok: false, scanId, target, status: 'ERROR', findings: [],
        summary: { totalFindings: 0, emailAddresses: [], domains: [], socialProfiles: [], breachData: [], riskIndicators: [] },
        error: 'SpiderFoot scan failed',
      };
    }
  }

  // Fetch results
  const eventsResult = await fetchJsonWithRetry<SpiderFootEvent[]>(
    `${base}/scaneventresults?id=${encodeURIComponent(scanId)}&eventType=ALL`,
    { method: 'GET', headers: { accept: 'application/json', ...(apiKey ? { 'X-API-Key': apiKey } : {}) } },
    { perAttemptMs: timeoutMs, maxAttempts: 2 },
  );

  // Guard against non-array responses — the API may return an object or error
  // body instead of an array if the scan ID is stale or the server is degraded.
  const rawEvents = Array.isArray(eventsResult.json) ? eventsResult.json : [];
  const findings: SpiderFootFinding[] = rawEvents
    .filter((e) => e.type && AML_EVENT_TYPES.has(e.type))
    .map((e) => ({
      type: e.type ?? '',
      data: e.data ?? '',
      module: e.module ?? '',
      confidence: e.confidence ?? 100,
      risk: (e.risk as SpiderFootFinding['risk']) ?? 'INFO',
      source: e.source ?? '',
      timestamp: e.generated ?? new Date().toISOString(),
    }));

  return {
    ok: true,
    scanId,
    target,
    status: 'FINISHED',
    findings,
    summary: categorise(findings),
  };
}
