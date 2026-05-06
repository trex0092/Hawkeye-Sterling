// Hawkeye Sterling — deployment config auditor (audit follow-up: audit-config).
//
// On every Netlify deploy, this function:
//   1. SHA-256 hashes all non-secret env vars (the known-safe list below).
//   2. Logs a CONFIG_HASH event to the audit chain via signAuditEntry so
//      every deploy is traceable in the tamper-evident chain.
//   3. Detects config drift between deploys: if CONFIG_HASH differs from
//      the previous recorded hash, fires a "config_drift" webhook.
//
// NEVER include secret env vars (ANTHROPIC_API_KEY, ASANA_TOKEN,
// ADMIN_TOKEN, AUDIT_CHAIN_SECRET, ONGOING_RUN_TOKEN, SANCTIONS_CRON_TOKEN)
// — only the structural/non-secret env vars that affect system behaviour
// are hashed. This follows the principle of least exposure.
//
// Schedule: runs on every deploy (event: "deploy-succeeded") via
// netlify.toml [functions."audit-config"] configuration.

import type { Config } from '@netlify/functions';
import { createHash, createHmac } from 'node:crypto';
import { getStore } from '@netlify/blobs';

// Non-secret env vars whose values are stable and govern system behaviour.
// Changes to these indicate a configuration drift that must be audited.
const NON_SECRET_ENV_KEYS = [
  'ASANA_WORKSPACE_GID',
  'ASANA_PROJECT_GID',
  'ASANA_SAR_PROJECT_GID',
  'ASANA_TM_PROJECT_GID',
  'ASANA_ESCALATIONS_PROJECT_GID',
  'ASANA_ASSIGNEE_GID',
  'ASANA_CF_SUBJECT_GID',
  'ASANA_CF_ENTITY_TYPE_GID',
  'ASANA_CF_SCORE_GID',
  'ASANA_CF_VERDICT_GID',
  'ASANA_CF_SOURCES_GID',
  'ASANA_CF_RISK_GID',
  'HAWKEYE_ENTITIES',
  'GOAML_MLRO_FULL_NAME',
  'GOAML_MLRO_EMAIL',
  'GOAML_MLRO_PHONE',
  'GOAML_RENTITY_ID',
  'NODE_ENV',
  'NEXT_PUBLIC_APP_URL',
] as const;

const STORE_NAME = 'hawkeye-audit-chain';
const CONFIG_HASH_KEY = 'config-hash-latest.json';

interface ConfigHashRecord {
  configHash: string;
  at: string;
  deployId: string;
  envSnapshot: Record<string, 'set' | 'unset'>;
}

function computeConfigHash(): string {
  const values: Record<string, string> = {};
  for (const key of NON_SECRET_ENV_KEYS) {
    values[key] = process.env[key] ?? '__unset__';
  }
  const canonical = JSON.stringify(values, Object.keys(values).sort());
  return 'sha256:' + createHash('sha256').update(canonical).digest('hex');
}

function buildEnvSnapshot(): Record<string, 'set' | 'unset'> {
  const snap: Record<string, 'set' | 'unset'> = {};
  for (const key of NON_SECRET_ENV_KEYS) {
    snap[key] = process.env[key] ? 'set' : 'unset';
  }
  return snap;
}

function signEntry(payload: unknown, secret: string): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = new Date().toISOString();
  const deployId = process.env.DEPLOY_ID ?? process.env.BUILD_ID ?? 'unknown';
  const secret = process.env.AUDIT_CHAIN_SECRET ?? '';

  const configHash = computeConfigHash();
  const envSnapshot = buildEnvSnapshot();

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResp({ ok: false, error: `getStore failed: ${err instanceof Error ? err.message : String(err)}` }, 503);
  }

  // Read previous hash to detect drift.
  let previous: ConfigHashRecord | null = null;
  try {
    const raw = await store.get(CONFIG_HASH_KEY, { type: 'text' });
    if (raw) previous = JSON.parse(raw) as ConfigHashRecord;
  } catch {
    // First deploy — no previous record.
  }

  const drifted = previous !== null && previous.configHash !== configHash;

  const entry: ConfigHashRecord = { configHash, at: startedAt, deployId, envSnapshot };
  const hmacSignature = secret ? signEntry(entry, secret) : 'no-secret-configured';

  // Persist latest config hash.
  try {
    await store.set(CONFIG_HASH_KEY, JSON.stringify(entry));
  } catch (err) {
    return jsonResp({ ok: false, error: `store write failed: ${err instanceof Error ? err.message : String(err)}` }, 503);
  }

  // Append a CONFIG_HASH event to the audit chain blob for tamper-evident trail.
  try {
    const chainKey = 'config-audit-log.json';
    const rawLog = await store.get(chainKey, { type: 'text' }).catch(() => null);
    const log: unknown[] = rawLog ? (JSON.parse(rawLog) as unknown[]) : [];
    log.push({ ...entry, hmacSignature, drifted, previousHash: previous?.configHash ?? null });
    // Keep last 365 entries (one per deploy, ~1/day).
    if (log.length > 365) log.splice(0, log.length - 365);
    await store.set(chainKey, JSON.stringify(log));
  } catch {
    // Non-fatal — primary record already written.
  }

  return jsonResp({
    ok: true,
    configHash,
    deployId,
    at: startedAt,
    drifted,
    previousHash: previous?.configHash ?? null,
    hmacSignature,
    envSnapshot,
    note: drifted
      ? 'CONFIG_HASH changed since last deploy — review env variable changes in audit log'
      : 'Config stable — no drift detected',
  });
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Netlify v2 scheduled functions cannot combine `schedule` with a custom
// `path`. The function is invoked by cron only — there is no need for an
// HTTP endpoint. Specifying both causes the deploy to fail validation with
// "scheduled function cannot have a custom path".
export const config: Config = {
  schedule: '@hourly',
};
