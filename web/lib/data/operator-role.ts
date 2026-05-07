"use client";

// Four-eyes role concept. Analyst proposes a disposition (clear / escalate /
// STR); MLRO approves. The app gates high-impact actions (STR filing,
// final disposition) behind the MLRO role so a single compromised login
// can't bypass the four-eyes principle.
//
// Role is stored per-browser in localStorage. Real RBAC with a user store
// + server session lands with the auth phase; this client-side shim is
// enough to enforce the four-eyes UX today and the audit chain cares
// about the signed intent anyway (see /api/audit/sign).

// analyst              — front-line screening; may propose actions
// compliance_assistant — supports CO; same action scope as analyst
// co                   — Compliance Officer; can view STR register, assist preparation
// mlro                 — Money Laundering Reporting Officer; full authority, final sign-off
// managing_director    — Executive authority; same action scope as MLRO
export type OperatorRole =
  | "analyst"
  | "compliance_assistant"
  | "co"
  | "mlro"
  | "managing_director";

const ROLE_STORAGE_KEY = "hawkeye.operator-role";

const ALL_ROLES: OperatorRole[] = [
  "analyst",
  "compliance_assistant",
  "co",
  "mlro",
  "managing_director",
];

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadOperatorRole(): OperatorRole {
  if (!isBrowser()) return "mlro";
  try {
    const raw = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (raw && (ALL_ROLES as string[]).includes(raw)) return raw as OperatorRole;
  } catch (err) {
    console.warn("[hawkeye] operator-role load failed (localStorage disabled?) — defaulting to mlro:", err);
  }
  return "mlro";
}

export function saveOperatorRole(role: OperatorRole): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(ROLE_STORAGE_KEY, role);
    window.dispatchEvent(new CustomEvent("hawkeye:operator-role-updated"));
  } catch {
    /* localStorage quota / disabled */
  }
}

export const ROLE_LABEL: Record<OperatorRole, string> = {
  analyst:              "Analyst",
  compliance_assistant: "CO Assistant",
  co:                   "CO",
  mlro:                 "CO / MLRO",
  managing_director:    "Managing Director",
};

// Roles available in the user-profile card (MLRO/CO, CO Assistant, MD).
export const CARD_ROLES: OperatorRole[] = [
  "mlro",
  "compliance_assistant",
  "managing_director",
];

export const ROLE_POWER: Record<OperatorRole, number> = {
  analyst:              1,
  compliance_assistant: 1,
  co:                   2,
  mlro:                 3,
  managing_director:    3,
};

// Action → minimum role required.
export const ACTION_MIN_ROLE: Record<string, OperatorRole> = {
  clear:         "analyst",
  escalate:      "analyst",
  str_read:      "co",
  str:           "mlro",
  freeze:        "mlro",
  dispose:       "mlro",
  goaml_submit:  "mlro",
};

export function canPerform(role: OperatorRole, action: string): boolean {
  const min = ACTION_MIN_ROLE[action];
  if (!min) return true;
  return ROLE_POWER[role] >= ROLE_POWER[min];
}

export { ALL_ROLES };
