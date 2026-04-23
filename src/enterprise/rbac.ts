// Hawkeye Sterling — role-based access control.
//
// Small RBAC layer that models the minimum MLRO-ready permissions:
//   - analyst: run screenings, raise STRs, but cannot dispose cases
//   - mlro: dispose cases (clear/escalate), sign off on four-eyes
//   - deputy_mlro: counter-sign four-eyes; cannot create cases
//   - auditor: read-only — every case, every audit chain
//   - admin: manage users, tenants, feeds (but NOT dispose cases)
//
// The permission model is intentionally coarse; every deployment can
// extend Role and Permission via declaration merging.

export type Permission =
  | 'case.create'
  | 'case.read'
  | 'case.screen'
  | 'case.dispose_clear'
  | 'case.dispose_escalate'
  | 'case.dispose_block'
  | 'str.file'
  | 'four_eyes.sign'
  | 'four_eyes.counter_sign'
  | 'feed.configure'
  | 'tenant.manage'
  | 'audit.read';

export type Role = 'analyst' | 'mlro' | 'deputy_mlro' | 'auditor' | 'admin';

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  analyst: [
    'case.create', 'case.read', 'case.screen',
    'four_eyes.sign',
    'str.file',
  ],
  deputy_mlro: [
    'case.read', 'case.screen',
    'four_eyes.counter_sign',
  ],
  mlro: [
    'case.create', 'case.read', 'case.screen',
    'case.dispose_clear', 'case.dispose_escalate', 'case.dispose_block',
    'four_eyes.sign', 'four_eyes.counter_sign',
    'str.file',
    'audit.read',
  ],
  auditor: [
    'case.read',
    'audit.read',
  ],
  admin: [
    'case.read',
    'feed.configure', 'tenant.manage',
    'audit.read',
  ],
};

export interface Principal {
  id: string;                  // user ID (opaque)
  tenantId: string;
  roles: readonly Role[];
}

export function can(p: Principal, perm: Permission): boolean {
  for (const r of p.roles) {
    const perms = ROLE_PERMISSIONS[r];
    if (perms.includes(perm)) return true;
  }
  return false;
}

export class PermissionDenied extends Error {
  constructor(public readonly perm: Permission, public readonly principal: Principal) {
    super(`Permission denied: ${principal.id} (roles: ${principal.roles.join(',')}) cannot ${perm}`);
  }
}

/** Guard helper: throws PermissionDenied if the principal lacks a permission. */
export function enforce(p: Principal, perm: Permission): void {
  if (!can(p, perm)) throw new PermissionDenied(perm, p);
}

/** Four-eyes enforcement: the counter-signer must be a DIFFERENT principal
 *  AND must have the counter-sign permission. Mirrors Cabinet Resolution
 *  134/2025 Art.19 (UAE). */
export function verifyFourEyes(signer: Principal, counterSigner: Principal): { ok: true } | { ok: false; reason: string } {
  if (signer.id === counterSigner.id) return { ok: false, reason: 'Signer and counter-signer are the same principal.' };
  if (!can(signer, 'four_eyes.sign')) return { ok: false, reason: 'Signer lacks four_eyes.sign permission.' };
  if (!can(counterSigner, 'four_eyes.counter_sign')) return { ok: false, reason: 'Counter-signer lacks four_eyes.counter_sign permission.' };
  if (signer.tenantId !== counterSigner.tenantId) return { ok: false, reason: 'Cross-tenant four-eyes is not permitted.' };
  return { ok: true };
}
