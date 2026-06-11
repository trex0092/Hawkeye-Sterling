// Hawkeye Sterling — client-side auth-state signal for polling components.
//
// The root layout mounts several pollers (CaseVaultSyncer's EventSource,
// useAlerts' interval, the regulatory ticker's one-shot fetch). Before this
// module existed they all polled unconditionally, so an unauthenticated
// browser — a visitor who never signed in, or an operator whose session was
// invalidated mid-tab — hammered /api/* with 401s forever and the console
// filled with "Failed to load resource" lines without bound.
//
// This is a tiny shared store, not React state: pollers run in effects and
// module singletons, and the feeders (SessionExpiryWatcher's /api/auth/me
// probe, session-expiry.ts's report* paths, the login-success interception)
// are spread across modules. Plain subscribe/notify keeps it usable from all
// of them and unit-testable in Node without a DOM.
//
// States:
//   "unknown"          — page just loaded; no auth signal yet. Pollers stay
//                        dormant (no speculative 401s).
//   "authenticated"    — /api/auth/me returned ok, or /api/auth/login
//                        succeeded. Pollers may run.
//   "unauthenticated"  — auth/me said no_session / session_* (401/403), or
//                        the session-expiry verifier confirmed death.
//                        Pollers must stop.
//
// A 503 / network failure from auth/me deliberately leaves the state
// unchanged — a Blobs blip must not look like a logout (see the
// store_unavailable path in /api/auth/me).

export type AuthState = "unknown" | "authenticated" | "unauthenticated";

type Listener = (_state: AuthState) => void;

let current: AuthState = "unknown";
const listeners = new Set<Listener>();

export function getAuthState(): AuthState {
  return current;
}

/** Transition the auth state. No-op (no notifications) when unchanged. */
export function setAuthState(next: AuthState): void {
  if (next === current) return;
  current = next;
  for (const cb of Array.from(listeners)) {
    try {
      cb(current);
    } catch {
      /* one bad listener must not break the others */
    }
  }
}

/** Subscribe to auth-state changes. The callback is invoked immediately with
 *  the current state (so a poller mounted after login still starts), and on
 *  every subsequent transition. Returns an unsubscribe function. */
export function subscribeAuthState(cb: Listener): () => void {
  listeners.add(cb);
  try {
    cb(current);
  } catch {
    /* listener threw on replay — keep it subscribed; transitions still fire */
  }
  return () => {
    listeners.delete(cb);
  };
}

/** True for the HTTP statuses that mean "stop polling, you are not signed
 *  in" — the halt rule ActivityFeed pioneered, shared so every poller
 *  treats the same statuses the same way. */
export function isAuthHaltStatus(status: number): boolean {
  return status === 401 || status === 403;
}
