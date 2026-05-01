// Shared in-memory stores for the /api/access/* routes.
// Exported from a non-route file so Next.js doesn't reject them as
// invalid route export fields.

export type UserRole = "compliance" | "management" | "logistics" | "trading" | "accounts";

export const ROLE_LABEL: Record<UserRole, string> = {
  compliance: "Compliance Department",
  management: "Management Department",
  logistics: "Logistic Department",
  trading: "Trading Department",
  accounts: "Accounts Department",
};

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
  compliance: ALL_MODULES,
  management: ["Screening", "STR Cases", "MLRO Advisor", "Oversight", "EWRA", "Audit Trail"],
  logistics: ["Screening", "Investigation", "Audit Trail"],
  trading: ["Screening", "Audit Trail"],
  accounts: ["Screening", "Audit Trail"],
};

export const USERS: AccessUser[] = [
  { id: "usr-001", name: "Luisa Fernanda", email: "l.fernanda@hawkeyesterling.ae", role: "compliance", lastLogin: "2025-04-30T08:14:22Z", active: true, modules: ROLE_MODULES.compliance },
];

export const PERMISSION_LOG: PermissionLogEntry[] = [];
