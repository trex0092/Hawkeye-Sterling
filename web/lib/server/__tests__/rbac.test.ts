import { describe, expect, it } from 'vitest';
import {
  ROLE_PERMISSIONS,
  SERVICE_PRINCIPALS,
  isServicePrincipal,
  servicePrincipal,
  auditActorFromGate,
  requirePermission,
  hasPermission,
  type RolePermissions,
} from '../rbac';

// Pins the service-principal model that closes the FRAMEWORK_COVERAGE.md §5 #6
// access-control gap: machine identities (portal proxy, scheduled functions)
// are first-class principals with their own permission sets and audit-actor
// attribution, and may never hold human sign-off permissions
// ("AI proposes; the MLRO decides" — AI_GOVERNANCE_POLICY.md §1.1).

const HUMAN_SIGNOFF_PERMISSIONS: (keyof RolePermissions)[] = [
  'canFileSTR',
  'canApproveFourEyes',
  'canFreezeSubject',
  'canApproveEDD',
];

describe('service principals', () => {
  it('registers exactly the two identities enforce() can mint', () => {
    expect(Object.keys(SERVICE_PRINCIPALS).sort()).toEqual(['cron_internal', 'portal_admin']);
  });

  it('never grants human sign-off permissions to any service principal', () => {
    for (const sp of Object.values(SERVICE_PRINCIPALS)) {
      for (const p of HUMAN_SIGNOFF_PERMISSIONS) {
        expect(sp.permissions[p], `${sp.id} must not hold ${p}`).toBe(false);
      }
    }
  });

  it('keeps audit-actor strings identical to the historical chain values', () => {
    expect(SERVICE_PRINCIPALS.portal_admin.auditActor).toBe('portal_admin');
    expect(SERVICE_PRINCIPALS.cron_internal.auditActor).toBe('cron_internal');
  });

  it('isServicePrincipal accepts registered ids and rejects everything else', () => {
    expect(isServicePrincipal('portal_admin')).toBe(true);
    expect(isServicePrincipal('cron_internal')).toBe(true);
    expect(isServicePrincipal('mlro')).toBe(false);
    expect(isServicePrincipal('session_user-1')).toBe(false);
    expect(isServicePrincipal('')).toBe(false);
  });

  it('servicePrincipal returns null for human/API-key identities', () => {
    expect(servicePrincipal('cron_internal')?.id).toBe('cron_internal');
    expect(servicePrincipal('hk_live_abc123')).toBeNull();
  });
});

describe('auditActorFromGate', () => {
  it('resolves service principals to their registered audit actor', () => {
    expect(auditActorFromGate({ keyId: 'cron_internal', sub: 'cron_internal' })).toBe('cron_internal');
    expect(auditActorFromGate({ keyId: 'portal_admin' })).toBe('portal_admin');
  });

  it('attributes human/API-key callers to sub, falling back to keyId', () => {
    expect(auditActorFromGate({ keyId: 'key-1', sub: 'user@example.com' })).toBe('user@example.com');
    expect(auditActorFromGate({ keyId: 'key-1' })).toBe('key-1');
  });
});

describe('requirePermission with service principals', () => {
  it('allows a service principal an action in its permission set', () => {
    const result = requirePermission({ ok: true, keyId: 'cron_internal' }, 'canScreen');
    expect(result.allowed).toBe(true);
  });

  it('denies a service principal a human sign-off action with 403', () => {
    const result = requirePermission({ ok: true, keyId: 'cron_internal' }, 'canFileSTR');
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.response.status).toBe(403);
  });

  it('never lets a service principal escalate via the role field', () => {
    // Even if a role claim somehow rode along, the service identity wins.
    const result = requirePermission(
      { ok: true, keyId: 'portal_admin', role: 'mlro' },
      'canApproveFourEyes',
    );
    expect(result.allowed).toBe(false);
  });

  it('still resolves human callers via their role', () => {
    expect(requirePermission({ ok: true, userId: 'u1', role: 'mlro' }, 'canFileSTR').allowed).toBe(true);
    expect(requirePermission({ ok: true, userId: 'u1', role: 'junior_analyst' }, 'canFileSTR').allowed).toBe(false);
  });

  it('defaults unknown roles to junior_analyst (fail-closed)', () => {
    const result = requirePermission({ ok: true, userId: 'u1', role: 'made_up' }, 'canFreezeSubject');
    expect(result.allowed).toBe(false);
  });
});

describe('human role matrix (regression pins)', () => {
  it('only mlro and super_admin can file STRs or approve four-eyes', () => {
    const strRoles = Object.entries(ROLE_PERMISSIONS)
      .filter(([, p]) => p.canFileSTR)
      .map(([r]) => r)
      .sort();
    expect(strRoles).toEqual(['mlro', 'super_admin']);
    expect(hasPermission('senior_analyst', 'canApproveFourEyes')).toBe(false);
  });
});
