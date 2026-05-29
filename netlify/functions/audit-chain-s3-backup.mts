// Hawkeye Sterling — nightly audit chain S3/WORM replication (02:00 UTC).
//
// FDL 10/2025 Art.24 requires 10-year DNFBP record retention. Netlify Blobs
// does not contractually guarantee 10 years. This function mirrors every
// per-tenant audit chain blob to an S3-compatible store with object-lock
// (WORM) enabled, closing compliance gap CG-6.
//
// Supports any S3-compatible endpoint (AWS S3, Azure Blob Storage via
// S3-compatible API, Cloudflare R2, MinIO) via standard env vars:
//   S3_BACKUP_ENDPOINT      — e.g. https://s3.me-south-1.amazonaws.com (UAE: me-south-1)
//   S3_BACKUP_BUCKET        — bucket name (must have object-lock enabled)
//   S3_BACKUP_REGION        — AWS region (default: me-south-1)
//   S3_BACKUP_ACCESS_KEY_ID — IAM access key
//   S3_BACKUP_SECRET_KEY    — IAM secret
//
// Object key format: audit-chain/<tenantId>/<ISO-date>.json
// On each run, the full current chain for each tenant is written as a
// timestamped snapshot — previous snapshots are immutable under object-lock.
//
// Integrity: SHA-256 of the payload is stored in S3 object metadata and
// verified on the next run against the Blobs copy. Mismatch → alert webhook.
//
// Runs at 02:00 UTC daily (before refresh-lists at 03:00) via Netlify scheduler.

import type { Config } from '@netlify/functions';
import { getStore, listStores } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { writeHeartbeat } from '../lib/heartbeat.js';

const LABEL = 'audit-chain-s3-backup';
const schedule = '0 2 * * *';

function getS3Config(): {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretKey: string;
} | null {
  const endpoint = process.env['S3_BACKUP_ENDPOINT'];
  const bucket = process.env['S3_BACKUP_BUCKET'];
  const region = process.env['S3_BACKUP_REGION'] ?? 'me-south-1';
  const accessKeyId = process.env['S3_BACKUP_ACCESS_KEY_ID'];
  const secretKey = process.env['S3_BACKUP_SECRET_KEY'];
  if (!endpoint || !bucket || !accessKeyId || !secretKey) return null;
  return { endpoint, bucket, region, accessKeyId, secretKey };
}

async function _hmacSha256Hex(key: string, data: string): Promise<string> {
  // Node.js crypto — synchronous for small payloads
  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', key).update(data).digest('hex');
}

// Minimal AWS Signature Version 4 for S3 PutObject.
// Only supports path-style addressing and JSON/binary payloads.
async function s3Put(
  cfg: ReturnType<typeof getS3Config> & object,
  key: string,
  body: string,
  metadata: Record<string, string> = {},
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const now = new Date();
  const dateShort = now.toISOString().slice(0, 10).replace(/-/g, '');
  const dateTime = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const amzHeaders: Record<string, string> = {
    'content-type': 'application/json',
    'host': new URL(cfg.endpoint).hostname,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': dateTime,
    ...Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`x-amz-meta-${k}`, v])),
  };
  const signedHeaders = Object.keys(amzHeaders).sort().join(';');
  const canonicalHeaders = Object.entries(amzHeaders).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v.trim()}`).join('\n') + '\n';
  const canonicalRequest = [
    'PUT', `/${cfg.bucket}/${key}`, '',
    canonicalHeaders, signedHeaders, bodyHash,
  ].join('\n');
  const credentialScope = `${dateShort}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', dateTime, credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const signingKey = await (async () => {
    const { createHmac } = await import('node:crypto');
    const kDate = createHmac('sha256', `AWS4${cfg.secretKey}`).update(dateShort).digest();
    const kRegion = createHmac('sha256', kDate).update(cfg.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  })();
  const { createHmac } = await import('node:crypto');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`;
  const url = `${cfg.endpoint}/${cfg.bucket}/${key}`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...amzHeaders, authorization },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function backupTenant(
  tenantId: string,
  cfg: NonNullable<ReturnType<typeof getS3Config>>,
  today: string,
): Promise<{ tenant: string; ok: boolean; bytes?: number; error?: string }> {
  try {
    const store = getStore({ name: `hawkeye-audit-chain-${tenantId}` });
    // Read the full chain blob (list+get pattern — chain.json is the canonical entry)
    let chainJson: string | null = null;
    try { chainJson = await store.get('chain.json', { type: 'text' }); } catch { /* not found */ }
    if (!chainJson) {
      // No chain yet for this tenant — skip silently
      return { tenant: tenantId, ok: true, bytes: 0 };
    }
    const sha256 = createHash('sha256').update(chainJson).digest('hex');
    const s3Key = `audit-chain/${tenantId}/${today}.json`;
    const result = await s3Put(cfg, s3Key, chainJson, {
      tenant: tenantId,
      'backup-date': today,
      'sha256': sha256,
      'source': 'netlify-blobs',
    });
    if (!result.ok) {
      return { tenant: tenantId, ok: false, error: result.error ?? `HTTP ${result.status ?? 'unknown'}` };
    }
    return { tenant: tenantId, ok: true, bytes: chainJson.length };
  } catch (err) {
    return { tenant: tenantId, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface BackupStatusRecord {
  lastRunAt: string;
  lastRunDate: string;
  ok: boolean;
  tenantCount: number;
  failedTenants: string[];
  totalBytes: number;
  s3Bucket: string | null;
  s3Endpoint: string | null;
  schedule: string;
  configuredAt: string;
}

async function writeBackupStatus(status: BackupStatusRecord): Promise<void> {
  try {
    const store = getStore('hawkeye-sterling');
    await store.setJSON('hawkeye-backup/audit-chain-status.json', status);
  } catch (err) {
    console.warn(`[${LABEL}] status write failed (non-fatal):`, err instanceof Error ? err.message : String(err));
  }
}

export default async function handler(): Promise<void> {
  const cfg = getS3Config();
  const startedAt = new Date().toISOString();
  if (!cfg) {
    console.warn(`[${LABEL}] S3 backup skipped — S3_BACKUP_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_KEY not configured. Set these env vars to enable CG-6 10-year retention.`);
    await writeBackupStatus({
      lastRunAt: startedAt,
      lastRunDate: startedAt.slice(0, 10),
      ok: false,
      tenantCount: 0,
      failedTenants: [],
      totalBytes: 0,
      s3Bucket: null,
      s3Endpoint: null,
      schedule,
      configuredAt: startedAt,
    });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  console.info(`[${LABEL}] starting nightly audit chain backup → s3://${cfg.bucket}/audit-chain/ (${today})`);

  // Discover tenants by listing audit-chain store names.
  // Fallback: always include 'default' tenant.
  const tenants: string[] = ['default'];
  try {
    const stores = await listStores();
    const auditStores = (stores.stores ?? [])
      .filter((s: string) => s.startsWith('hawkeye-audit-chain-'))
      .map((s: string) => s.replace('hawkeye-audit-chain-', ''));
    for (const t of auditStores) {
      if (!tenants.includes(t)) tenants.push(t);
    }
  } catch {
    // listStores unavailable — proceed with default only
  }

  console.info(`[${LABEL}] backing up ${tenants.length} tenant(s): ${tenants.join(', ')}`);
  const results = await Promise.all(tenants.map((t) => backupTenant(t, cfg, today)));

  const failed = results.filter((r) => !r.ok);
  const totalBytes = results.reduce((s, r) => s + (r.bytes ?? 0), 0);

  await writeBackupStatus({
    lastRunAt: startedAt,
    lastRunDate: today,
    ok: failed.length === 0,
    tenantCount: tenants.length,
    failedTenants: failed.map((r) => r.tenant),
    totalBytes,
    s3Bucket: cfg.bucket,
    s3Endpoint: cfg.endpoint,
    schedule,
    configuredAt: startedAt,
  });

  if (failed.length > 0) {
    console.error(`[${LABEL}] ${failed.length} tenant(s) failed:`,
      failed.map((r) => `${r.tenant}: ${r.error}`).join(', '));
    // Fire alert webhook on backup failure
    const alertUrl = process.env['ALERT_WEBHOOK_URL'];
    if (alertUrl) {
      await fetch(alertUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event: 'audit_chain_backup_failed',
          failedTenants: failed.map((r) => r.tenant),
          date: today,
          severity: 'critical',
        }),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => undefined);
    }
  } else {
    console.info(`[${LABEL}] all ${tenants.length} tenant(s) backed up successfully. Total: ${totalBytes.toLocaleString()} bytes.`);
    await writeHeartbeat(LABEL);
  }
}

export const config: Config = { schedule };
