// Shared in-memory stores for the /api/access/* routes.
// Exported from a non-route file so Next.js doesn't reject them as
// invalid route export fields.

export type UserRole = "viewer" | "analyst" | "supervisor" | "mlro" | "admin";

export interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastLogin: string;
  active: boolean;
  modules: string[];
}

export interface PermissionLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: "role_assigned" | "role_revoked" | "session_revoked" | "manual";
  targetUserId: string;
  targetUserName: string;
  oldRole?: string;
  newRole?: string;
  reason: string;
}

const ALL_MODULES = [
  "Screening", "STR Cases", "MLRO Advisor", "Oversight", "Responsible AI",
  "EWRA", "Playbook", "Investigation", "Audit Trail", "Access Control",
];

export const ROLE_MODULES: Record<UserRole, string[]> = {
  viewer: ["Screening", "Audit Trail"],
  analyst: ["Screening", "STR Cases", "Investigation", "Audit Trail"],
  supervisor: ["Screening", "STR Cases", "MLRO Advisor", "Oversight", "Investigation", "Audit Trail", "EWRA", "Playbook"],
  mlro: ALL_MODULES.filter((m) => m !== "Access Control"),
  admin: ALL_MODULES,
};

export const USERS: AccessUser[] = [
  { id: "usr-001", name: "Luisa Fernanda", email: "l.fernanda@hawkeyesterling.ae", role: "mlro", lastLogin: "2025-04-30T08:14:22Z", active: true, modules: ROLE_MODULES.mlro },
  { id: "usr-002", name: "Ahmed Rahman", email: "a.rahman@hawkeyesterling.ae", role: "analyst", lastLogin: "2025-04-30T07:55:11Z", active: true, modules: ROLE_MODULES.analyst },
  { id: "usr-003", name: "Nisha Patel", email: "n.patel@hawkeyesterling.ae", role: "analyst", lastLogin: "2025-04-29T16:42:05Z", active: true, modules: ROLE_MODULES.analyst },
  { id: "usr-004", name: "Tariq Ibrahim", email: "t.ibrahim@hawkeyesterling.ae", role: "supervisor", lastLogin: "2025-04-30T09:01:33Z", active: true, modules: ROLE_MODULES.supervisor },
  { id: "usr-005", name: "System Administrator", email: "sysadmin@hawkeyesterling.ae", role: "admin", lastLogin: "2025-04-28T11:22:00Z", active: true, modules: ROLE_MODULES.admin },
];

export const PERMISSION_LOG: PermissionLogEntry[] = [
  { id: "log-001", timestamp: "2025-04-15T09:00:00Z", actor: "System Administrator", action: "role_assigned", targetUserId: "usr-002", targetUserName: "Ahmed Rahman", oldRole: "viewer", newRole: "analyst", reason: "Promoted following successful probation review." },
  { id: "log-002", timestamp: "2025-04-20T14:30:00Z", actor: "System Administrator", action: "role_assigned", targetUserId: "usr-004", targetUserName: "Tariq Ibrahim", oldRole: "analyst", newRole: "supervisor", reason: "Appointed as Compliance Team Lead — expanded oversight responsibilities." },
];
