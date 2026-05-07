// Shared in-memory stores for the /api/access/* routes.
// Exported from a non-route file so Next.js doesn't reject them as
// invalid route export fields.

import { generateSalt, hashPassword } from "@/lib/server/auth";
import { createHmac, randomBytes } from "node:crypto";

export type UserRole = "compliance" | "management" | "logistics" | "trading" | "accounts" | "mlro";

export const ROLE_LABEL: Record<UserRole, string> = {
  mlro: "MLRO / Compliance Officer",
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
  mlro: ALL_MODULES,
  compliance: ALL_MODULES,
  management: ["Screening", "STR Cases", "MLRO Advisor", "Oversight", "EWRA", "Audit Trail"],
  logistics: ["Screening", "Investigation", "Audit Trail"],
  trading: ["Screening", "Audit Trail"],
  accounts: ["Screening", "Audit Trail"],
};

// Boot password for the primary CO/MLRO account.
// Set LUISA_INITIAL_PASSWORD in Netlify dashboard (Site → Environment variables).
// If not set, a stable password is derived from deployment-scoped env vars and
// printed to Netlify function logs on first request — never hardcoded here.
function resolveInitialPassword(): string {
  const fromEnv = process.env["LUISA_INITIAL_PASSWORD"];
  if (fromEnv && fromEnv.length >= 8) return fromEnv;

  // Derive a stable, deployment-specific password so it survives cold restarts
  // without requiring a new env var. Same anchor used by auth.ts getSecret().
  const anchor =
    process.env["AUDIT_CHAIN_SECRET"] ??
    process.env["SESSION_SECRET"] ??
    process.env["NETLIFY_SITE_ID"] ??
    process.env["SITE_ID"];

  if (anchor && anchor.length >= 8) {
    const pw = createHmac("sha256", anchor)
      .update("hawkeye-boot-password-v1")
      .digest("base64url")
      .slice(0, 16);
    console.info(
      `[hawkeye] BOOT PASSWORD for luisa: ${pw}  ` +
      `(derived — stable across restarts. Set LUISA_INITIAL_PASSWORD in Netlify to override.)`,
    );
    return pw;
  }

  // Last resort — random, changes on every cold-start.
  const generated = randomBytes(12).toString("base64url");
  console.warn(
    `[hawkeye] TEMPORARY boot password for luisa: ${generated}\n` +
    `[hawkeye] THIS CHANGES ON EVERY COLD START — set LUISA_INITIAL_PASSWORD in Netlify.`,
  );
  return generated;
}

const _luisaSalt = generateSalt();
const _luisaHash = hashPassword(resolveInitialPassword(), _luisaSalt);

export const USERS: AccessUser[] = [
  {
    id: "usr-001",
    name: "Luisa Fernanda",
    email: "",
    role: "mlro",
    lastLogin: "2025-04-30T08:14:22Z",
    active: true,
    modules: ROLE_MODULES.mlro,
    username: "luisa",
    passwordHash: _luisaHash,
    passwordSalt: _luisaSalt,
  },
];

export const PERMISSION_LOG: PermissionLogEntry[] = [];
