// Hawkeye Sterling — Role-Based Access Control (RBAC)
// Defines the 7-role permission matrix for the platform.

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

/**
 * Middleware helper: checks whether the authenticated user (from an enforce
 * gate) holds the requested permission. Returns `{ allowed: true }` on
 * success, or `{ allowed: false, response }` with a 403 JSON response on
 * failure. Roles absent from the gate default to `junior_analyst`.
 */
export function requirePermission(
  gate: { ok: true; tenantId: string; userId: string; role?: string },
  permission: Permission,
): { allowed: true } | { allowed: false; response: Response } {
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
