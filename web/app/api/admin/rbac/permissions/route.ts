// GET /api/admin/rbac/permissions
// Public endpoint — returns the full ROLE_PERMISSIONS capability matrix.
//
// Threat model decision (reviewed 2026-05-26):
// The capability matrix lists WHAT permissions each role has (canScreen, canFileSTR, etc.)
// but does NOT expose which users have which roles, no PII, no credentials, and no
// tenant-specific configuration. The permission names themselves are static code constants.
//
// Accepting risk: an attacker who can enumerate role permissions gains knowledge of
// the permission gates that exist (e.g., canApproveFourEyes). This is equivalent to
// reading the open-source code. It does NOT reveal which specific API routes implement
// each gate (those are protected by enforce() regardless of this endpoint).
//
// If the threat model changes (e.g., custom per-tenant role definitions are added),
// this endpoint must be moved behind auth. See D-04 in the audit report.
// No auth required — read-only public reference data.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ROLE_PERMISSIONS, ROLE_MANAGERS, roleLabel, type UserRole } from "@/lib/server/rbac";

export async function GET(): Promise<NextResponse> {
  // Build an enriched version with human-readable labels
  const matrix = (Object.entries(ROLE_PERMISSIONS) as [UserRole, (typeof ROLE_PERMISSIONS)[UserRole]][]).map(
    ([role, permissions]) => ({
      role,
      label: roleLabel(role),
      canManageRoles: ROLE_MANAGERS.includes(role),
      permissions,
    }),
  );

  return NextResponse.json({
    ok: true,
    matrix,
    roles: Object.keys(ROLE_PERMISSIONS),
    permissions: [
      "canScreen",
      "canFreezeSubject",
      "canFileSTR",
      "canApproveEDD",
      "canManageUsers",
      "canViewAuditTrail",
      "canExportData",
      "canAccessCases",
      "canApproveFourEyes",
      "canManageWorkflows",
    ],
  });
}
