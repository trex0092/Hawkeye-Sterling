// Hawkeye Sterling — LSEG (Refinitiv) Data Platform integration.
//
// Covers:
//   · OAuth2 token management  (/auth/oauth2/v1/token + refresh)
//   · CFS packages discovery   (/file-store/v1/packages)
//   · CFS fileset polling      (/file-store/v1/file-sets)
//   · CFS file download        (/file-store/v1/files/{id}/stream)
//   · News headlines           (/data/news/v1/headlines)
//   · Corporate alerts         (/corporate/service-insight/v2/alerts)
//   · SQS cloud credentials    (/auth/cloud-credentials/v1/)
//
// Credentials are read from environment variables — never hardcoded:
//   LSEG_USERNAME   — LSEG account email
//   LSEG_PASSWORD   — LSEG account password
//   LSEG_APP_KEY    — AppKey generated in the LSEG AppKey Generator
//   LSEG_SQS_ENDPOINT — Full SQS queue URL for file notifications
//
// Token lifecycle:
//   · Access token valid ~300 s — refreshed automatically via refresh_token.
//   · Cache is module-level (lives for the Lambda instance lifetime).
//   · Refresh token rotation is handled transparently.

import { fetchJsonWithRetry } from './httpRetry.js';

const LSEG_BASE = 'https://api.refinitiv.com';
const TOKEN_PATH = '/auth/oauth2/v1/token';
const TOKEN_BUFFER_MS = 30_000; // refresh 30 s before expiry

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LsegTokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface LsegPackage {
  packageId: string;
  packageName: string;
  bucket: string;
  packageType: string;
}

export interface LsegFileSet {
  id: string;
  name: string;
  packageId?: string;
  contentFrom?: string;
  contentTo?: string;
  numFiles?: number;
  status?: string;
  attributes?: Record<string, string>;
}

export interface LsegFile {
  fileId: string;
  filename: string;
  size?: number;
  contentType?: string;
}

export interface LsegNewsHeadline {
  storyId: string;
  headline: string;
  source?: string;
  publishedAt?: string;
  topics?: string[];
}

export interface LsegAlert {
  alertId: string;
  type: string;
  subject?: string;
  summary?: string;
  severity?: string;
  publishedAt?: string;
}

export interface LsegSqsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: string;
  endpoint: string;
}

export type LsegResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── Token cache (module-level — one per Lambda warm instance) ─────────────────

let _tokenCache: LsegTokenCache | null = null;

function credentialsFromEnv(): { username: string; password: string; appKey: string } {
  const username = process.env['LSEG_USERNAME'];
  const password = process.env['LSEG_PASSWORD'];
  const appKey   = process.env['LSEG_APP_KEY'];
  if (!username || !password || !appKey) {
    throw new Error('Missing LSEG credentials: LSEG_USERNAME, LSEG_PASSWORD, LSEG_APP_KEY must be set');
  }
  return { username, password, appKey };
}

async function fetchToken(
  body: Record<string, string>,
  timeoutMs = 15_000,
): Promise<LsegTokenCache> {
  const form = Object.entries(body)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const result = await fetchJsonWithRetry<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>(
    `${LSEG_BASE}${TOKEN_PATH}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    },
    { perAttemptMs: timeoutMs, maxAttempts: 2 },
  );

  if (!result.ok || !result.json) {
    throw new Error(`LSEG auth failed (${result.status}): ${result.error ?? result.body}`);
  }

  return {
    accessToken:  result.json.access_token,
    refreshToken: result.json.refresh_token,
    expiresAt:    Date.now() + result.json.expires_in * 1_000,
  };
}

// Returns a valid access token, refreshing transparently as needed.
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  const { username, password, appKey } = credentialsFromEnv();

  // Token still valid
  if (_tokenCache && now < _tokenCache.expiresAt - TOKEN_BUFFER_MS) {
    return _tokenCache.accessToken;
  }

  // Refresh using refresh_token (avoids sending password on every call)
  if (_tokenCache?.refreshToken) {
    try {
      _tokenCache = await fetchToken({
        grant_type:    'refresh_token',
        refresh_token: _tokenCache.refreshToken,
        client_id:     appKey,
      });
      return _tokenCache.accessToken;
    } catch {
      // Refresh token may have expired — fall through to password grant
      _tokenCache = null;
    }
  }

  // Password grant (first call or after refresh token expiry)
  _tokenCache = await fetchToken({
    grant_type: 'password',
    username,
    password,
    scope:      'trapi',
    client_id:  appKey,
  });

  return _tokenCache.accessToken;
}

// ── Generic authenticated GET ─────────────────────────────────────────────────

async function lsegGet<T>(
  path: string,
  query: Record<string, string> = {},
  timeoutMs = 20_000,
): Promise<LsegResult<T>> {
  const token = await getAccessToken();
  const qs = Object.keys(query).length
    ? '?' + Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';

  const result = await fetchJsonWithRetry<T>(
    `${LSEG_BASE}${path}${qs}`,
    { headers: { Authorization: `Bearer ${token}` } },
    { perAttemptMs: timeoutMs, maxAttempts: 2 },
  );

  if (!result.ok || result.json === null) {
    return { ok: false, error: result.error ?? `HTTP ${result.status}` };
  }
  return { ok: true, data: result.json };
}

// ── CFS — Client File Store ───────────────────────────────────────────────────
//
// Audit DR-11: LSEG's data platform returns paged collections as
// `{ value: [...] }`. Earlier code applied `?? []` to the array which
// silently produced an empty collection if upstream ever renamed the
// envelope field or wrapped it in a `data:` shell. Validate that the
// `value` key actually exists and is an array — when it's missing,
// surface as a structured error so caller distinguishes "empty list"
// from "schema drift". A schema-drift incident at LSEG would otherwise
// look like "your account has zero packages" — a wrong-but-plausible
// silent-failure mode.
function unwrapList<T>(
  endpoint: string,
  res: LsegResult<{ value: unknown }>,
): LsegResult<T[]> {
  if (!res.ok) return { ok: false, error: res.error ?? 'Unknown LSEG error' };
  const value = res.data?.value;
  if (value === undefined) {
    return {
      ok: false,
      error: `LSEG ${endpoint}: response missing 'value' field — possible schema change. Body keys: ${Object.keys(res.data ?? {}).join(', ') || '(empty)'}`,
    };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: `LSEG ${endpoint}: 'value' is ${typeof value}, expected array — possible schema change.`,
    };
  }
  return { ok: true, data: value as T[] };
}

// Discover which bulk data packages your account is entitled to.
export async function getPackages(): Promise<LsegResult<LsegPackage[]>> {
  const res = await lsegGet<{ value: unknown }>(
    '/file-store/v1/packages',
    { packageType: 'bulk' },
  );
  return unwrapList<LsegPackage>('/file-store/v1/packages', res);
}

// List filesets for a given bucket, optionally filtered by date.
export async function getFileSets(
  bucket: string,
  options: { contentFrom?: string; packageId?: string } = {},
): Promise<LsegResult<LsegFileSet[]>> {
  const q: Record<string, string> = { bucket };
  if (options.contentFrom) q['contentFrom'] = options.contentFrom;
  if (options.packageId)   q['packageId']   = options.packageId;

  const res = await lsegGet<{ value: unknown }>('/file-store/v1/file-sets', q);
  return unwrapList<LsegFileSet>('/file-store/v1/file-sets', res);
}

// List files inside a fileset.
export async function getFiles(filesetId: string): Promise<LsegResult<LsegFile[]>> {
  const res = await lsegGet<{ value: unknown }>(
    '/file-store/v1/files',
    { filesetId },
  );
  return unwrapList<LsegFile>('/file-store/v1/files', res);
}

// Download a file as a UTF-8 string (suitable for JSON/CSV bulk files).
export async function downloadFile(
  fileId: string,
  timeoutMs = 60_000,
): Promise<LsegResult<string>> {
  const token = await getAccessToken();
  const result = await fetchJsonWithRetry<string>(
    `${LSEG_BASE}/file-store/v1/files/${encodeURIComponent(fileId)}/stream`,
    { headers: { Authorization: `Bearer ${token}` } },
    { perAttemptMs: timeoutMs, maxAttempts: 1 },
  );
  if (!result.ok) return { ok: false, error: result.error ?? `HTTP ${result.status}` };
  return { ok: true, data: result.body };
}

// ── News feed → feeds Hawkeye intel_feed (source=gdelt|news|both) ────────────

export async function getNewsHeadlines(
  query: string,
  options: { count?: number; dateFrom?: string } = {},
): Promise<LsegResult<LsegNewsHeadline[]>> {
  const q: Record<string, string> = { query };
  if (options.count)    q['count']    = String(options.count);
  if (options.dateFrom) q['dateFrom'] = options.dateFrom;

  const res = await lsegGet<{ data: LsegNewsHeadline[] }>('/data/news/v1/headlines', q);
  if (!res.ok) return { ok: false, error: res.error ?? 'Unknown LSEG error' };
  return { ok: true, data: res.data?.data ?? [] };
}

// ── Corporate alerts → feeds Hawkeye relationship_graph (type=corporate) ─────

export async function getAlerts(
  params: Record<string, string> = {},
): Promise<LsegResult<LsegAlert[]>> {
  const res = await lsegGet<{ value: LsegAlert[] }>(
    '/corporate/service-insight/v2/alerts',
    params,
  );
  if (!res.ok) return { ok: false, error: res.error ?? 'Unknown LSEG error' };
  return { ok: true, data: res.data?.value ?? [] };
}

// ── SQS cloud credentials ─────────────────────────────────────────────────────

// Returns temporary AWS credentials for reading the SQS notification queue.
export async function getSqsCredentials(
  sqsEndpoint?: string,
): Promise<LsegResult<LsegSqsCredentials>> {
  const endpoint = sqsEndpoint ?? process.env['LSEG_SQS_ENDPOINT'];
  if (!endpoint) {
    return { ok: false, error: 'LSEG_SQS_ENDPOINT env var not set' };
  }

  const res = await lsegGet<{
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
      expiration?: string;
    };
  }>(
    '/auth/cloud-credentials/v1/',
    { endpoint },
  );

  if (!res.ok) return { ok: false, error: res.error };
  if (!res.data?.credentials) return { ok: false, error: 'No credentials in response' };

  return {
    ok: true,
    data: { ...res.data.credentials, endpoint },
  };
}
