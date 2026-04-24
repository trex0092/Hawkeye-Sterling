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

// analyst   — front-line screening; may propose actions, never sees STR register
// co        — Compliance Officer; can view STR register, assist preparation
// mlro      — Money Laundering Reporting Officer; full authority, final sign-off
export type OperatorRole = "analyst" | "co" | "mlro";

const ROLE_STORAGE_KEY = "hawkeye.operator-role";

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadOperatorRole(): OperatorRole {
  if (!isBrowser()) return "analyst";
  try {
    const raw = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (raw === "mlro" || raw === "analyst" || raw === "co") return raw;
  } catch {
    /* localStorage disabled */
  }
  return "analyst";
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
  analyst: "Analyst",
  co: "CO",
  mlro: "MLRO",
};

export const ROLE_POWER: Record<OperatorRole, number> = {
  analyst: 1,
  co: 2,
  mlro: 3,
};

// Action → minimum role required. The UI uses this to gate buttons; the
// server-side audit-signing endpoint enforces it independently so a
// modified client can't bypass.
//
// str_read: viewing the STR case register — CO and above (tipping-off guard)
// str/freeze/dispose/goaml_submit: MLRO only (final sign-off authority)
export const ACTION_MIN_ROLE: Record<string, OperatorRole> = {
  clear: "analyst",
  escalate: "analyst",
  str_read: "co",
  str: "mlro",
  freeze: "mlro",
  dispose: "mlro",
  goaml_submit: "mlro",
};

export function canPerform(role: OperatorRole, action: string): boolean {
  const min = ACTION_MIN_ROLE[action];
  if (!min) return true;
  return ROLE_POWER[role] >= ROLE_POWER[min];
}
