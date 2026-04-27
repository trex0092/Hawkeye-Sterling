// Hawkeye Sterling — crypto wallet AML risk client.
// Supports multiple risk intelligence providers in priority order:
//   1. Januus (januusio/cryptowallet_risk_scoring) — ETH/BTC/TRX, free tier
//      NOTE: Januus free API is currently paused. Client retains the interface
//      and will activate automatically when the API resumes. Set JANUUS_API_KEY.
//   2. Chainalysis KYT API — enterprise, OFAC-grade taint analysis
//   3. Elliptic Lens API — enterprise, entity-level attribution
//
// The client tries providers in order and returns the first successful result.
// Configure at least one enterprise provider for production deployments.
//
// Env vars:
//   JANUUS_API_KEY      — Januus API key (free tier, currently paused)
//   CHAINALYSIS_API_KEY — Chainalysis KYT API key
//   ELLIPTIC_API_KEY    — Elliptic Lens API key
//   ELLIPTIC_SECRET     — Elliptic Lens API secret

import { fetchJsonWithRetry } from './httpRetry.js';

declare const process: { env?: Record<string, string | undefined> } | undefined;

export type CryptoChain = 'ethereum' | 'bitcoin' | 'tron' | 'unknown';

export interface WalletRiskResult {
  ok: boolean;
  address: string;
  chain: CryptoChain;
  provider: 'januus' | 'chainalysis' | 'elliptic' | 'unavailable';
  riskScore: number;         // 0–100 (higher = more suspicious)
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  riskCategory?: string;     // e.g. 'darknet_market', 'mixing', 'sanctioned_entity'
  exposure: {
    directSanctioned: number;    // % of funds from/to OFAC/UN sanctioned addresses
    indirectSanctioned: number;  // via 1-2 hop intermediaries
    mixing: number;              // % through known mixing services
    darknet: number;             // % from/to darknet markets
  };
  taintedTransactions?: number;
  totalTransactions?: number;
  firstSeen?: string;
  lastSeen?: string;
  labels: string[];
  error?: string;
}

// Detect chain from address format
function detectChain(address: string): CryptoChain {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return 'ethereum';
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{6,87}$/.test(address)) return 'bitcoin';
  if (/^T[a-zA-Z0-9]{33}$/.test(address)) return 'tron';
  return 'unknown';
}

function scoreToLevel(score: number): WalletRiskResult['riskLevel'] {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function env(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env?.[key] : undefined;
}

// Januus risk scoring (januusio/cryptowallet_risk_scoring)
async function januusScore(address: string, chain: CryptoChain, timeoutMs: number): Promise<WalletRiskResult | null> {
  const apiKey = env('JANUUS_API_KEY');
  if (!apiKey) return null;

  interface JanuusResponse {
    risk_score?: number;
    risk_level?: string;
    risk_category?: string;
    offsets?: {
      sanctions?: number;
      mixing?: number;
      darknet?: number;
    };
    labels?: string[];
    total_txns?: number;
    tainted_txns?: number;
    first_seen?: string;
    last_seen?: string;
  }

  const result = await fetchJsonWithRetry<JanuusResponse>(
    `https://api.januus.io/v1/risk/${address}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    },
    { perAttemptMs: timeoutMs, maxAttempts: 2 },
  );

  if (!result.ok || !result.json) return null;
  const d = result.json;
  const score = d.risk_score ?? 0;
  const sanctions = d.offsets?.sanctions ?? 0;
  const mixing = d.offsets?.mixing ?? 0;
  const darknet = d.offsets?.darknet ?? 0;

  return {
    ok: true,
    address,
    chain,
    provider: 'januus',
    riskScore: score,
    riskLevel: scoreToLevel(score),
    riskCategory: d.risk_category,
    exposure: {
      directSanctioned: sanctions,
      indirectSanctioned: 0,
      mixing,
      darknet,
    },
    taintedTransactions: d.tainted_txns,
    totalTransactions: d.total_txns,
    firstSeen: d.first_seen,
    lastSeen: d.last_seen,
    labels: d.labels ?? [],
  };
}

// Chainalysis KYT (Know Your Transaction) API
async function chainalysisScore(address: string, chain: CryptoChain, timeoutMs: number): Promise<WalletRiskResult | null> {
  const apiKey = env('CHAINALYSIS_API_KEY');
  if (!apiKey) return null;

  const assetMap: Record<CryptoChain, string> = {
    ethereum: 'ETH',
    bitcoin: 'BTC',
    tron: 'TRX',
    unknown: 'BTC',
  };

  interface ChainalysisResponse {
    cluster?: {
      name?: string;
      category?: string;
    };
    riskScore?: string;         // 'Low' | 'Medium' | 'High' | 'Severe'
    exposures?: Array<{
      category: string;
      value: number;
      directExposure: boolean;
    }>;
    alerts?: Array<{ alertLevel: string; category: string }>;
  }

  const result = await fetchJsonWithRetry<ChainalysisResponse>(
    `https://api.chainalysis.com/api/risk/v2/entities/${encodeURIComponent(address)}`,
    {
      method: 'GET',
      headers: { Token: apiKey, accept: 'application/json', 'X-Asset': assetMap[chain] },
    },
    { perAttemptMs: timeoutMs, maxAttempts: 2 },
  );

  if (!result.ok || !result.json) return null;
  const d = result.json;

  const rawRisk = d.riskScore ?? 'Low';
  const score = rawRisk === 'Severe' ? 90 : rawRisk === 'High' ? 70 : rawRisk === 'Medium' ? 40 : 10;
  const exposures = d.exposures ?? [];
  const getExp = (cat: string, direct?: boolean): number =>
    exposures.filter((e) => e.category.toLowerCase().includes(cat) && (direct === undefined || e.directExposure === direct))
      .reduce((s, e) => s + e.value, 0);

  return {
    ok: true,
    address,
    chain,
    provider: 'chainalysis',
    riskScore: score,
    riskLevel: scoreToLevel(score),
    riskCategory: d.cluster?.category,
    exposure: {
      directSanctioned: getExp('sanction', true),
      indirectSanctioned: getExp('sanction', false),
      mixing: getExp('mixing'),
      darknet: getExp('darknet'),
    },
    labels: d.cluster?.name ? [d.cluster.name] : [],
  };
}

// Elliptic Lens API
async function ellipticScore(address: string, chain: CryptoChain, timeoutMs: number): Promise<WalletRiskResult | null> {
  const apiKey = env('ELLIPTIC_API_KEY');
  const secret = env('ELLIPTIC_SECRET');
  if (!apiKey || !secret) return null;

  const assetMap: Record<CryptoChain, string> = {
    ethereum: 'ETH',
    bitcoin: 'BTC',
    tron: 'TRX',
    unknown: 'BTC',
  };

  interface EllipticResponse {
    risk_score?: number;
    triggers?: Array<{ category: string; contribution_to_risk: number }>;
    cluster?: { primary_entity?: string };
    sanctions?: { is_sanctioned?: boolean; sanctioning_authority?: string };
    first_activity?: string;
    last_activity?: string;
  }

  const result = await fetchJsonWithRetry<EllipticResponse>(
    `https://api.elliptic.co/v2/wallet/synchronous`,
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'x-api-secret': secret,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ subject: { asset: assetMap[chain], blockchain: assetMap[chain], hash: address } }),
    },
    { perAttemptMs: timeoutMs, maxAttempts: 2 },
  );

  if (!result.ok || !result.json) return null;
  const d = result.json;
  const score = Math.round((d.risk_score ?? 0) * 100);
  const triggers = d.triggers ?? [];
  const getContrib = (cat: string): number =>
    triggers.filter((t) => t.category.toLowerCase().includes(cat))
      .reduce((s, t) => s + t.contribution_to_risk, 0) * 100;

  const labels: string[] = [];
  if (d.cluster?.primary_entity) labels.push(d.cluster.primary_entity);
  if (d.sanctions?.is_sanctioned) labels.push(`SANCTIONED:${d.sanctions.sanctioning_authority ?? 'unknown'}`);

  return {
    ok: true,
    address,
    chain,
    provider: 'elliptic',
    riskScore: score,
    riskLevel: scoreToLevel(score),
    exposure: {
      directSanctioned: getContrib('sanction'),
      indirectSanctioned: 0,
      mixing: getContrib('mixing') + getContrib('tumbling'),
      darknet: getContrib('darknet') + getContrib('dark market'),
    },
    firstSeen: d.first_activity,
    lastSeen: d.last_activity,
    labels,
  };
}

export async function scoreWallet(
  address: string,
  options: { chain?: CryptoChain; timeoutMs?: number } = {},
): Promise<WalletRiskResult> {
  const chain = options.chain ?? detectChain(address);
  const timeoutMs = options.timeoutMs ?? 12_000;

  // Try providers in priority order
  for (const fn of [januusScore, chainalysisScore, ellipticScore]) {
    const result = await fn(address, chain, timeoutMs);
    if (result) return result;
  }

  return {
    ok: false,
    address,
    chain,
    provider: 'unavailable',
    riskScore: 0,
    riskLevel: 'unknown',
    exposure: { directSanctioned: 0, indirectSanctioned: 0, mixing: 0, darknet: 0 },
    labels: [],
    error: 'No crypto risk provider configured (set JANUUS_API_KEY, CHAINALYSIS_API_KEY, or ELLIPTIC_API_KEY)',
  };
}
