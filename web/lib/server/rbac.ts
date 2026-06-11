// Hawkeye Sterling — Role-Based Access Control (RBAC)
// Defines the 7-role human permission matrix and the service-principal
// registry for machine identities (AI agents, scheduled functions, the
// portal proxy). Service principals are first-class: they carry their own
// permission sets and audit-actor strings instead of borrowing human roles.

import { NextResponse } from "next/server";

export type UserRole =
  | "super_admin"        // full access, manage tenants
  | "mlro"               // MLRO — approve STR/freeze/EDD, see all cases
  | "senior_analyst"     // full screening + case management, no SAR filing
  | "junior_analyst"     // screening only, cannot freeze or file STR
  | "auditor"            // read-only access to everything
  | "compliance_officer" // policy + reports, no subject management
  | "it_admin";          // user management only

export interface RolePermissions {
  canScreen: boolean;
  canFreezeSubject: boolean;
  canFileSTR: boolean;
  canApproveEDD: boolean;
  canManageUsers: boolean;
  canViewAuditTrail: boolean;
  canExportData: boolean;
  canAccessCases: boolean;
  canApproveFourEyes: boolean;
  canManageWorkflows: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  super_admin: {
    canScreen: true,
    canFreezeSubject: true,
    canFileSTR: true,
    canApproveEDD: true,
    canManageUsers: true,
    canViewAuditTrail: true,
    canExportData: true,
    canAccessCases: true,
    canApproveFourEyes: true,
    canManageWorkflows: true,
  },
  mlro: {
    canScreen: true,
    canFreezeSubject: true,
    canFileSTR: true,
    canApproveEDD: true,
    canManageUsers: false,
    canViewAuditTrail: true,
    canExportData: true,
    canAccessCases: true,
    canApproveFourEyes: true,
    canManageWorkflows: true,
  },
  senior_analyst: {
    canScreen: true,
    canFreezeSubject: true,
    canFileSTR: false,
    canApproveEDD: true,
    canManageUsers: false,
    canViewAuditTrail: true,
    canExportData: true,
    canAccessCases: true,
    canApproveFourEyes: false,
    canManageWorkflows: false,
  },
  junior_analyst: {
    canScreen: true,
    canFreezeSubject: false,
    canFileSTR: false,
    canApproveEDD: false,
    canManageUsers: false,
    canViewAuditTrail: false,
    canExportData: false,
    canAccessCases: true,
    canApproveFourEyes: false,
    canManageWorkflows: false,
  },
  auditor: {
    canScreen: false,
    canFreezeSubject: false,
    canFileSTR: false,
    canApproveEDD: false,
    canManageUsers: false,
    canViewAuditTrail: true,
    canExportData: true,
    canAccessCases: true,
    canApproveFourEyes: false,
    canManageWorkflows: false,
  },
  compliance_officer: {
    canScreen: false,
    canFreezeSubject: false,
    canFileSTR: false,
    canApproveEDD: false,
    canManageUsers: false,
    canViewAuditTrail: true,
    canExportData: true,
    canAccessCases: true,
    canApproveFourEyes: false,
    canManageWorkflows: true,
  },
  it_admin: {
    canScreen: false,
    canFreezeSubject: false,
    canFileSTR: false,
    canApproveEDD: false,
    canManageUsers: true,
    canViewAuditTrail: true,
    canExportData: false,
    canAccessCases: false,
    canApproveFourEyes: false,
    canManageWorkflows: false,
  },
};

/** Returns the full permission set for a given role. */
export function getRolePermissions(role: UserRole): RolePermissions {
  return ROLE_PERMISSIONS[role];
}

/** Returns true if the given role has the specified permission. */
export function hasPermission(role: UserRole, permission: keyof RolePermissions): boolean {
  return ROLE_PERMISSIONS[role][permission];
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  mlro: "MLRO",
  senior_analyst: "Senior Analyst",
  junior_analyst: "Junior Analyst",
  auditor: "Auditor",
  compliance_officer: "Compliance Officer",
  it_admin: "IT Admin",
};

/** Returns a human-readable label for the role. */
export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

/** Validates that a string is a valid UserRole. */
export function isValidRole(value: string): value is UserRole {
  return value in ROLE_PERMISSIONS;
}

/** Roles that can manage other users' roles. */
export const ROLE_MANAGERS: UserRole[] = ["super_admin", "mlro", "it_admin"];

/** Union type of all permission keys in the RBAC matrix. */
export type Permission = keyof typeof ROLE_PERMISSIONS[UserRole];

// ── Service principals — machine identities (FRAMEWORK_COVERAGE.md §5 #6) ──
//
// enforce() mints exactly two non-human identities: "portal_admin" (ADMIN_TOKEN,
// injected server-side by web/proxy.ts for same-origin portal requests) and
// "cron_internal" (SANCTIONS_CRON_TOKEN, used by Netlify scheduled functions).
// This registry makes them first-class principals: each carries an explicit
// permission set and a stable audit-actor string, so authorization decisions
// and audit attribution resolve centrally instead of via per-route keyId
// string comparisons.
//
// Invariant ("AI proposes; the MLRO decides", AI_GOVERNANCE_POLICY.md §1.1):
// no service principal may ever hold canFileSTR, canApproveFourEyes,
// canFreezeSubject, or canApproveEDD — those actions require a human portal
// session via requireRole() regardless of transport identity. Enforced by
// assertServicePrincipalInvariants() at module load and pinned by unit test.

export type ServicePrincipalId = "portal_admin" | "cron_internal";

export interface ServicePrincipal {
  id: ServicePrincipalId;
  kind: "service";
  label: string;
  /** Actor string written to the audit chain — matches the literal values
   *  routes have historically written, so chain queries stay consistent. */
  auditActor: string;
  /** Where this identity originates (token env var + injection point). */
  origin: string;
  permissions: RolePermissions;
}

export const SERVICE_PRINCIPALS: Record<ServicePrincipalId, ServicePrincipal> = {
  portal_admin: {
    id: "portal_admin",
    kind: "service",
    label: "Portal Proxy (server-side)",
    auditActor: "portal_admin",
    origin: "ADMIN_TOKEN injected by web/proxy.ts for same-origin portal requests",
    permissions: {
      canScreen: true,
      canFreezeSubject: false,
      canFileSTR: false,
      canApproveEDD: false,
      canManageUsers: true,
      canViewAuditTrail: true,
      canExportData: true,
      canAccessCases: true,
      canApproveFourEyes: false,
      canManageWorkflows: true,
    },
  },
  cron_internal: {
    id: "cron_internal",
    kind: "service",
    label: "Internal Scheduled Functions",
    auditActor: "cron_internal",
    origin: "SANCTIONS_CRON_TOKEN presented by Netlify scheduled functions",
    permissions: {
      canScreen: true,
      canFreezeSubject: false,
      canFileSTR: false,
      canApproveEDD: false,
      canManageUsers: false,
      canViewAuditTrail: true,
      canExportData: false,
      canAccessCases: true,
      canApproveFourEyes: false,
      canManageWorkflows: false,
    },
  },
};

/** Permissions no machine identity may ever hold — human sign-off actions. */
const SERVICE_FORBIDDEN_PERMISSIONS: readonly (keyof RolePermissions)[] = [
  "canFileSTR",
  "canApproveFourEyes",
  "canFreezeSubject",
  "canApproveEDD",
];

function assertServicePrincipalInvariants(): void {
  for (const sp of Object.values(SERVICE_PRINCIPALS)) {
    for (const p of SERVICE_FORBIDDEN_PERMISSIONS) {
      if (sp.permissions[p]) {
        throw new Error(
          `[rbac] service principal "${sp.id}" must not hold ${p} — human sign-off actions require a portal session (AI proposes; the MLRO decides)`,
        );
      }
    }
  }
}
assertServicePrincipalInvariants();

/** Type guard: is this identity (keyId/sub from an enforce gate) a registered service principal? */
export function isServicePrincipal(id: string): id is ServicePrincipalId {
  return id in SERVICE_PRINCIPALS;
}

/** Returns the service principal for an identity, or null for human/API-key callers. */
export function servicePrincipal(id: string): ServicePrincipal | null {
  return isServicePrincipal(id) ? SERVICE_PRINCIPALS[id] : null;
}

/**
 * Audit-chain actor attribution for an enforce gate. Service principals
 * resolve to their registered auditActor; everything else attributes to the
 * authenticated subject (JWT sub / API key id / session keyId).
 */
export function auditActorFromGate(gate: { keyId: string; sub?: string }): string {
  const sp = servicePrincipal(gate.keyId);
  if (sp) return sp.auditActor;
  return gate.sub ?? gate.keyId;
}

/**
 * Middleware helper: checks whether the authenticated caller (from an enforce
 * gate) holds the requested permission. Service principals are resolved
 * against SERVICE_PRINCIPALS — never against human roles. Human callers
 * resolve via their role; roles absent from the gate default to
 * `junior_analyst`. Returns `{ allowed: true }` on success, or
 * `{ allowed: false, response }` with a 403 JSON response on failure.
 */
export function requirePermission(
  gate: { ok: true; userId?: string; keyId?: string; role?: string },
  permission: Permission,
): { allowed: true } | { allowed: false; response: Response } {
  const identity = gate.keyId ?? gate.userId ?? "";
  const sp = servicePrincipal(identity);
  if (sp) {
    if (sp.permissions[permission]) {
      return { allowed: true };
    }
    return {
      allowed: false,
      response: NextResponse.json(
        { ok: false, error: `Insufficient permissions — service principal ${sp.id} does not hold ${permission}` },
        { status: 403 },
      ),
    };
  }

  const role: UserRole =
    gate.role && isValidRole(gate.role) ? gate.role : "junior_analyst";

  if (hasPermission(role, permission)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    response: NextResponse.json(
      { ok: false, error: "Insufficient permissions" },
      { status: 403 },
    ),
  };
}
