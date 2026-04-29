// Hawkeye Sterling — multi-tenant scaffolding.
//
// Enterprise deployments must isolate one bank/DPMS/investment firm from
// another. This module declares the TenantContext interface every
// production call path is expected to thread, plus an InMemoryTenantResolver
// suitable for tests and single-tenant deployments.
//
// Production deployments wire resolveTenant() to their session/JWT layer
// and plumb the resolved TenantContext into engine runs, ingestion writes,
// audit-chain actors, and storage paths.

export interface TenantContext {
  tenantId: string;                      // stable, opaque ID (UUID, etc.)
  displayName: string;
  /** Data-residency region (UAE / EU / US). */
  region: 'ae' | 'eu' | 'us' | 'global';
  /** Retention policy override (days). If absent, FDL 10/2025 + internal 10y apply. */
  retentionDays?: number;
  /** List of watchlist feeds this tenant is licensed to access. */
  licensedLists: string[];
  /** Optional tenant-scoped salts for deterministic hashing. */
  hashSalt?: string;
}

export interface TenantResolver {
  /** Resolve a tenant from an opaque auth token / session handle. */
  resolve(authToken: string): Promise<TenantContext | null>;
  /** Look up by stable ID (for admin / audit paths). */
  byId(tenantId: string): Promise<TenantContext | null>;
}

export class InMemoryTenantResolver implements TenantResolver {
  private readonly byToken = new Map<string, TenantContext>();
  private readonly byTid = new Map<string, TenantContext>();

  register(token: string, ctx: TenantContext): void {
    this.byToken.set(token, ctx);
    this.byTid.set(ctx.tenantId, ctx);
  }
  async resolve(authToken: string): Promise<TenantContext | null> {
    return this.byToken.get(authToken) ?? null;
  }
  async byId(tenantId: string): Promise<TenantContext | null> {
    return this.byTid.get(tenantId) ?? null;
  }
}

/** Scope a resource path under a tenant so storage backends (S3/PG) never
 *  accidentally co-mingle data. */
export function tenantScopedPath(tenant: TenantContext, ...parts: string[]): string {
  const sanitised = parts.map((p) => p.replace(/[^A-Za-z0-9_-]/g, '_'));
  return ['tenants', tenant.tenantId, ...sanitised].join('/');
}
