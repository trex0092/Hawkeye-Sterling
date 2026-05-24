// GET /api/admin/rbac/permissions
// Public endpoint — returns the full ROLE_PERMISSIONS capability matrix.
// No auth required (informational, no sensitive data).

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
