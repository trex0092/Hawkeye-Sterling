// Shared store for the /api/access/* routes.
// Exported from a non-route file so Next.js doesn't reject them as
// invalid route export fields.
//
// ── Persistence ───────────────────────────────────────────────────────────────
// USERS and PERMISSION_LOG are now persisted to Netlify Blobs so they survive
// Lambda cold starts and are shared across all function instances.
// All callers must use the async helpers (loadUsers / saveUsers /
// loadPermissionLog / appendPermissionLog) — never mutate a local copy without
// writing it back immediately.
//
// Blob keys:
//   users/all.v1.json        — AccessUser[] (includes hashed credentials)
//   permlogs/all.v1.json     — PermissionLogEntry[]

import { generateSalt, hashPassword } from "@/lib/server/auth";
import { createHmac } from "node:crypto";
import { getJson, setJson } from "@/lib/server/store";

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
  /** Incremented on every password change. Sessions carry this at issue time;
   *  a mismatch means the session predates the latest password change. */
  pwVersion?: number;
  /** SHA-256 prefix of the most recent login IP — used for geo-velocity
   *  detection between sessions. Never stores the raw IP. */
  lastIpHash?: string;
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

const USERS_BLOB_KEY = "users/all.v1.json";
const PERMLOGS_BLOB_KEY = "permlogs/all.v1.json";

// ── Default seed account ──────────────────────────────────────────────────────
// Called only when the blob store has no users yet (first deploy).
// The boot password is NEVER logged — operators must set LUISA_INITIAL_PASSWORD
// in Netlify env vars (Site settings → Environment variables) before first login.
function buildDefaultLuisa(): AccessUser {
  // NETLIFY_SITE_ID / SITE_ID are excluded from the anchor chain: they are
  // publicly visible in build logs and the Netlify dashboard URL, so deriving
  // a credential from them provides no real security. Only operator-set secrets
  // (LUISA_INITIAL_PASSWORD, AUDIT_CHAIN_SECRET, SESSION_SECRET) are accepted.
  const envCredential = process.env["LUISA_INITIAL_PASSWORD"];
  const anchor =
    process.env["AUDIT_CHAIN_SECRET"] ??
    process.env["SESSION_SECRET"];

  let bootCredential: string;
  if (envCredential && envCredential.length >= 8) {
    bootCredential = envCredential;
  } else if (anchor && anchor.length >= 8) {
    bootCredential = createHmac("sha256", anchor)
      .update("hawkeye-boot-credential-v1")
      .digest("base64url")
      .slice(0, 16);
    // Warn operators to configure the credential — do NOT log the value itself.
    console.warn(
      "[hawkeye] LUISA_INITIAL_PASSWORD is not set. " +
      "A deployment-scoped credential has been derived and will be stable across restarts. " +
      "Set LUISA_INITIAL_PASSWORD in Netlify (Site settings → Environment variables) " +
      "and change it after first login.",
    );
  } else {
    // No anchor available at all — this should never happen in a real deployment.
    throw new Error(
      "[hawkeye] Cannot seed default account: set LUISA_INITIAL_PASSWORD or " +
      "AUDIT_CHAIN_SECRET in Netlify environment variables.",
    );
  }

  const salt = generateSalt();
  const hash = hashPassword(bootCredential, salt);
  return {
    id: "usr-001",
    name: "Luisa Fernanda",
    email: "",
    role: "mlro",
    lastLogin: "2025-04-30T08:14:22Z",
    active: true,
    modules: ROLE_MODULES.mlro,
    username: "luisa",
    passwordHash: hash,
    passwordSalt: salt,
  };
}

// ── In-process write serializer ───────────────────────────────────────────────
// Ensures at most one in-flight write per blob key within a single Lambda
// instance. DOES NOT protect against concurrent writes across separate
// Netlify Lambda instances; for full cross-instance safety, Netlify Blobs
// ETag CAS or an external distributed lock (Redis, DynamoDB) is required.
const _writeQueues = new Map<string, Promise<unknown>>();

function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = _writeQueues.get(key) ?? Promise.resolve<unknown>(undefined);
  // Run fn even if the previous queued operation failed.
  const next: Promise<T> = prev.then(() => fn(), () => fn());
  // Store a non-rejecting tail so future enqueues don't see a rejected promise.
  _writeQueues.set(key, next.catch(() => {}));
  return next;
}

/** Wrap a load→mutate→save sequence in an in-process users-blob lock. */
export function withUsersLock<T>(fn: () => Promise<T>): Promise<T> {
  return withKeyLock(USERS_BLOB_KEY, fn);
}

// ── User store helpers ────────────────────────────────────────────────────────

export async function loadUsers(): Promise<AccessUser[]> {
  const persisted = await getJson<AccessUser[]>(USERS_BLOB_KEY);
  if (Array.isArray(persisted) && persisted.length > 0) return persisted;
  // First deploy — seed with the default MLRO account and persist immediately.
  const seed = buildDefaultLuisa();
  await setJson(USERS_BLOB_KEY, [seed]);
  return [seed];
}

export async function saveUsers(users: AccessUser[]): Promise<void> {
  await setJson(USERS_BLOB_KEY, users);
}

// ── Permission log helpers ────────────────────────────────────────────────────

export async function loadPermissionLog(): Promise<PermissionLogEntry[]> {
  const persisted = await getJson<PermissionLogEntry[]>(PERMLOGS_BLOB_KEY);
  return Array.isArray(persisted) ? persisted : [];
}

export async function appendPermissionLog(entry: PermissionLogEntry): Promise<void> {
  // Use the per-key lock so concurrent calls don't overwrite each other's append.
  return withKeyLock(PERMLOGS_BLOB_KEY, async () => {
    const current = await loadPermissionLog();
    // Cap at 10,000 entries — oldest entries are dropped when over limit.
    const updated = [...current, entry].slice(-10_000);
    await setJson(PERMLOGS_BLOB_KEY, updated);
  });
}
