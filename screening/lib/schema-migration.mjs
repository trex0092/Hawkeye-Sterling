/**
 * Schema Migration Engine — Data Version Management.
 *
 * Manages incremental schema migrations for all JSON-backed registers
 * and configuration files. When the system upgrades (e.g., v1→v2→v3),
 * stored data must be transformed to match new field expectations.
 *
 * Inspired by Mojang's DataFixerUpper — a chain of versioned
 * transformations that can be composed and optimized.
 *
 * Covered registries:
 *   - Filing register (mlro-workflow)
 *   - PEP approval register
 *   - Case manager register
 *   - Training register
 *   - Calendar events
 *   - Webhook config
 *   - Rule engine rules
 *   - API keys
 *   - Tenant config
 *   - Ownership register
 *
 * Each migration: { fromVersion, toVersion, transform(data) → data }
 * Migrations are chained: v1 → v2 → v3 applied sequentially.
 *
 * Reference: https://github.com/Mojang/DataFixerUpper
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const MIGRATIONS = [];

/**
 * Register a migration.
 *
 * @param {string} registry - Registry name (e.g., 'filing-register')
 * @param {string} fromVersion - Source version (semver)
 * @param {string} toVersion - Target version (semver)
 * @param {Function} transform - (data) => transformedData
 */
export function registerMigration(registry, fromVersion, toVersion, transform) {
  MIGRATIONS.push({ registry, fromVersion, toVersion, transform });
}

/**
 * Migrate a registry file to the latest version.
 *
 * @param {string} filePath - Path to JSON register
 * @param {string} registry - Registry name
 * @param {string} targetVersion - Version to migrate to
 * @returns {{ migrated: boolean, fromVersion: string, toVersion: string, stepsApplied: number }}
 */
export async function migrateFile(filePath, registry, targetVersion) {
  if (!existsSync(filePath)) {
    return { migrated: false, reason: 'File not found' };
  }

  let data;
  try {
    data = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (err) {
    return { migrated: false, reason: `Parse error: ${err.message}` };
  }

  const currentVersion = data.version || '1.0.0';
  if (currentVersion === targetVersion) {
    return { migrated: false, reason: 'Already at target version', currentVersion };
  }

  // Find migration chain
  const chain = findMigrationChain(registry, currentVersion, targetVersion);
  if (chain.length === 0) {
    return { migrated: false, reason: `No migration path from ${currentVersion} to ${targetVersion}` };
  }

  // Apply migrations sequentially
  let migrated = data;
  for (const migration of chain) {
    try {
      migrated = migration.transform(migrated);
      migrated.version = migration.toVersion;
    } catch (err) {
      return {
        migrated: false,
        reason: `Migration ${migration.fromVersion}→${migration.toVersion} failed: ${err.message}`,
        partialVersion: migrated.version,
      };
    }
  }

  migrated.migratedAt = new Date().toISOString();
  migrated.migrationHistory = [
    ...(migrated.migrationHistory || []),
    { from: currentVersion, to: targetVersion, steps: chain.length, timestamp: migrated.migratedAt },
  ];

  // Write back
  await writeFile(filePath, JSON.stringify(migrated, null, 2));

  return {
    migrated: true,
    fromVersion: currentVersion,
    toVersion: targetVersion,
    stepsApplied: chain.length,
    path: chain.map(m => `${m.fromVersion}→${m.toVersion}`),
  };
}

/**
 * Find the shortest migration chain between versions using BFS.
 */
function findMigrationChain(registry, fromVersion, toVersion) {
  const registryMigrations = MIGRATIONS.filter(m => m.registry === registry);
  if (registryMigrations.length === 0) return [];

  const queue = [{ version: fromVersion, chain: [] }];
  const visited = new Set([fromVersion]);

  while (queue.length > 0) {
    const { version, chain } = queue.shift();
    if (version === toVersion) return chain;

    for (const m of registryMigrations) {
      if (m.fromVersion === version && !visited.has(m.toVersion)) {
        visited.add(m.toVersion);
        queue.push({ version: m.toVersion, chain: [...chain, m] });
      }
    }
  }

  return []; // No path found
}

/**
 * Migrate all known registries to their latest versions.
 */
export async function migrateAll(basePath, targetVersion = '2.0.0') {
  const registries = [
    { name: 'filing-register', path: `${basePath}/filing-register.json` },
    { name: 'pep-approval', path: `${basePath}/pep-approval-register.json` },
    { name: 'case-register', path: `${basePath}/case-register.json` },
    { name: 'training', path: `${basePath}/training-register.json` },
    { name: 'calendar', path: `${basePath}/compliance-calendar.json` },
    { name: 'webhooks', path: `${basePath}/webhooks.json` },
    { name: 'rules', path: `${basePath}/rules.json` },
    { name: 'api-keys', path: `${basePath}/api-keys.json` },
    { name: 'tenants', path: `${basePath}/tenants.json` },
  ];

  const results = [];
  for (const reg of registries) {
    const result = await migrateFile(reg.path, reg.name, targetVersion);
    results.push({ registry: reg.name, ...result });
  }

  return {
    total: results.length,
    migrated: results.filter(r => r.migrated).length,
    skipped: results.filter(r => !r.migrated).length,
    results,
    migratedAt: new Date().toISOString(),
  };
}

// ── Built-in Migrations ────────────────────────────────────────

// Example: filing register v1 → v2 (add mlroApproval field)
registerMigration('filing-register', '1.0.0', '2.0.0', (data) => {
  const filings = data.filings || [];
  for (const f of filings) {
    if (!f.mlroApproval) f.mlroApproval = null;
    if (!f.history) f.history = [];
    if (!f.deadline) f.deadline = null;
  }
  return data;
});

// Case register v1 → v2 (add SLA fields)
registerMigration('case-register', '1.0.0', '2.0.0', (data) => {
  const cases = data.cases || [];
  for (const c of cases) {
    if (!c.slaDeadline) c.slaDeadline = null;
    if (!c.linkedCases) c.linkedCases = [];
    if (!c.evidence) c.evidence = [];
  }
  return data;
});

// PEP approval v1 → v2 (add expiry tracking)
registerMigration('pep-approval', '1.0.0', '2.0.0', (data) => {
  const records = data.records || [];
  for (const r of records) {
    if (!r.currentApproval) r.currentApproval = null;
    if (!r.sowVerified) r.sowVerified = false;
    if (!r.sofVerified) r.sofVerified = false;
  }
  return data;
});

export { MIGRATIONS };
