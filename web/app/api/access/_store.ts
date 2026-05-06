// Shared in-memory stores for the /api/access/* routes.
// Exported from a non-route file so Next.js doesn't reject them as
// invalid route export fields.

import { generateSalt, hashPassword } from "@/lib/server/auth";
import { randomBytes } from "node:crypto";

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
  username?: string;
  passwordHash?: string;
  passwordSalt?: string;
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

// Boot password for the primary CO/MLRO account.
// Priority:
//   1. LUISA_INITIAL_PASSWORD env var (set in Netlify dashboard → overrides default)
//   2. Fixed boot credential — stable across cold restarts, allows immediate access.
//      Change via Access Control → change password after first login.
const BOOT_PASSWORD = "Fortuna1$";

function resolveInitialPassword(): string {
  const fromEnv = process.env["LUISA_INITIAL_PASSWORD"];
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  return BOOT_PASSWORD;
}

const _luisaSalt = generateSalt();
const _luisaHash = hashPassword(resolveInitialPassword(), _luisaSalt);

export const USERS: AccessUser[] = [
  {
    id: "usr-001",
    name: "Luisa Fernanda",
    email: "",
    role: "compliance",
    lastLogin: "2025-04-30T08:14:22Z",
    active: true,
    modules: ROLE_MODULES.compliance,
    username: "luisa",
    passwordHash: _luisaHash,
    passwordSalt: _luisaSalt,
  },
];

export const PERMISSION_LOG: PermissionLogEntry[] = [];
