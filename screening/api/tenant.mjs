/**
 * Multi-tenancy support for the Hawkeye-Sterling screening REST API.
 *
 * Each tenant receives an isolated data directory under
 * .screening/tenants/<tenant-id>/ containing its own entity store,
 * audit log, and cache. A 'default' tenant exists for backward
 * compatibility and is used when no tenant mapping is specified on
 * the API key.
 *
 * Tenant configuration includes per-tenant threshold overrides and
 * enabled source selections. Admin users manage tenants through
 * dedicated REST endpoints.
 *
 * For review by the MLRO.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Default tenant
// ---------------------------------------------------------------------------

const DEFAULT_TENANT_ID = 'default';

// ---------------------------------------------------------------------------
// Tenant registry — flat JSON file at .screening/tenants.json
// ---------------------------------------------------------------------------

export class TenantRegistry {
  /**
   * @param {string} dataDir — base screening data directory (.screening)
   */
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = join(dataDir, 'tenants.json');
    /** @type {Map<string, object>} tenantId -> tenant config */
    this.tenants = new Map();
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    await mkdir(dirname(this.filePath), { recursive: true });

    if (existsSync(this.filePath)) {
      const raw = await readFile(this.filePath, 'utf8');
      const arr = JSON.parse(raw);
      for (const t of arr) {
        this.tenants.set(t.id, t);
      }
    }

    // Ensure default tenant always exists.
    if (!this.tenants.has(DEFAULT_TENANT_ID)) {
      const defaultTenant = {
        id: DEFAULT_TENANT_ID,
        name: 'Default Tenant',
        thresholds: null,       // null = use global defaults
        enabledSources: null,   // null = use global defaults
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
      this.tenants.set(DEFAULT_TENANT_ID, defaultTenant);
      await this._save();
    }

    this._loaded = true;
  }

  async _save() {
    const arr = Array.from(this.tenants.values());
    await writeFile(this.filePath, JSON.stringify(arr, null, 2), 'utf8');
  }

  /**
   * Create a new tenant.
   *
   * @param {object} opts
   * @param {string} opts.name        — human-readable tenant name
   * @param {object} [opts.thresholds] — override screening thresholds
   * @param {string[]} [opts.enabledSources] — override enabled source ids
   * @returns {object} created tenant record
   */
  async create(opts) {
    if (!opts || typeof opts.name !== 'string' || opts.name.trim().length === 0) {
      throw new Error('Tenant name is required');
    }

    const id = 'tenant_' + randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    // Validate thresholds if provided.
    if (opts.thresholds !== undefined && opts.thresholds !== null) {
      validateThresholds(opts.thresholds);
    }

    // Validate enabledSources if provided.
    if (opts.enabledSources !== undefined && opts.enabledSources !== null) {
      if (!Array.isArray(opts.enabledSources)) {
        throw new Error('enabledSources must be an array of source ids');
      }
      for (const s of opts.enabledSources) {
        if (typeof s !== 'string' || s.trim().length === 0) {
          throw new Error('Each source id must be a non-empty string');
        }
      }
    }

    const tenant = {
      id,
      name: opts.name.trim(),
      thresholds: opts.thresholds || null,
      enabledSources: opts.enabledSources || null,
      created: now,
      updated: now,
    };

    this.tenants.set(id, tenant);

    // Create the tenant's data directory.
    const tenantDir = this.tenantDataDir(id);
    await mkdir(join(tenantDir, 'cache'), { recursive: true });

    await this._save();
    return tenant;
  }

  /**
   * Update an existing tenant's mutable fields.
   *
   * @param {string} id
   * @param {object} patch — fields to update (name, thresholds, enabledSources)
   * @returns {object} updated tenant record
   */
  async update(id, patch) {
    const tenant = this.tenants.get(id);
    if (!tenant) throw new Error(`Tenant not found: ${id}`);

    if (patch.name !== undefined) {
      if (typeof patch.name !== 'string' || patch.name.trim().length === 0) {
        throw new Error('Tenant name must be a non-empty string');
      }
      tenant.name = patch.name.trim();
    }

    if (patch.thresholds !== undefined) {
      if (patch.thresholds === null) {
        tenant.thresholds = null;
      } else {
        validateThresholds(patch.thresholds);
        tenant.thresholds = patch.thresholds;
      }
    }

    if (patch.enabledSources !== undefined) {
      if (patch.enabledSources === null) {
        tenant.enabledSources = null;
      } else {
        if (!Array.isArray(patch.enabledSources)) {
          throw new Error('enabledSources must be an array of source ids');
        }
        for (const s of patch.enabledSources) {
          if (typeof s !== 'string' || s.trim().length === 0) {
            throw new Error('Each source id must be a non-empty string');
          }
        }
        tenant.enabledSources = patch.enabledSources;
      }
    }

    tenant.updated = new Date().toISOString();
    await this._save();
    return tenant;
  }

  /**
   * Get a tenant by id.
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    return this.tenants.get(id) || null;
  }

  /**
   * List all tenants.
   * @returns {object[]}
   */
  list() {
    return Array.from(this.tenants.values());
  }

  /**
   * Return the isolated data directory for a tenant.
   * The default tenant uses the base data directory for backward
   * compatibility. All other tenants get .screening/tenants/<id>/.
   *
   * @param {string} tenantId
   * @returns {string} absolute path
   */
  tenantDataDir(tenantId) {
    if (tenantId === DEFAULT_TENANT_ID) {
      return this.dataDir;
    }
    return join(this.dataDir, 'tenants', tenantId);
  }

  /**
   * Return path configuration for a tenant, suitable for passing to
   * Screening.init() or constructing per-tenant store/audit instances.
   *
   * @param {string} tenantId
   * @returns {object} { dataDir, storeFile, auditFile, cacheDir }
   */
  tenantPaths(tenantId) {
    const base = this.tenantDataDir(tenantId);
    return {
      dataDir: base,
      storeFile: join(base, 'store.json'),
      auditFile: join(base, 'audit.log'),
      cacheDir: join(base, 'cache'),
    };
  }

  /**
   * Resolve the tenant from an authenticated API key record.
   * Returns the tenant config, or the default tenant if the key has
   * no tenantId or the mapping is invalid.
   *
   * @param {object|null} keyRecord — from auth.mjs
   * @returns {object} tenant config
   */
  resolveFromKey(keyRecord) {
    if (!keyRecord || !keyRecord.tenantId) {
      return this.tenants.get(DEFAULT_TENANT_ID);
    }
    const tenant = this.tenants.get(keyRecord.tenantId);
    if (!tenant) {
      return this.tenants.get(DEFAULT_TENANT_ID);
    }
    return tenant;
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate threshold overrides. All values must be numbers in (0, 1) and
 * must satisfy reject < low < medium < high.
 */
function validateThresholds(t) {
  if (typeof t !== 'object' || t === null) {
    throw new Error('Thresholds must be an object');
  }

  const fields = ['reject', 'low', 'medium', 'high'];
  for (const f of fields) {
    if (t[f] !== undefined) {
      if (typeof t[f] !== 'number' || t[f] <= 0 || t[f] >= 1) {
        throw new Error(`Threshold "${f}" must be a number in (0, 1)`);
      }
    }
  }

  // If multiple thresholds specified, enforce ordering.
  const values = fields.map(f => t[f]).filter(v => v !== undefined);
  for (let i = 1; i < values.length; i++) {
    if (values[i] <= values[i - 1]) {
      throw new Error('Thresholds must be in strictly ascending order: reject < low < medium < high');
    }
  }
}

export { DEFAULT_TENANT_ID, validateThresholds };
