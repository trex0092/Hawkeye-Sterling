// Hawkeye Sterling — client-side global session-expiry detector.
//
// The portal renders many independent panels (Worldwide News, Sanctions
// List Update, Saved Filters, Activity Feed, Regulatory Feed, …) that each
// fetch their own authenticated API. When the session cookie expires the
// browser console fills with "Failed to load resource: 401" lines AND
// every panel renders its own inline "Authentication required" banner,
// making it look like the app is broken rather than that the operator
// just needs to sign in again.
//
// This module installs a single same-origin fetch interceptor that
// catches the first 401 from /api/* and dispatches a custom event the
// SessionExpiryWatcher component listens for. Result: one site-wide
// "Session expired — Sign in" modal instead of N error banners.
//
// Safety:
//   - Only patches if window.fetch has not already been patched (idempotent).
//   - Only inspects same-origin requests (path starts with "/api/" OR a URL
//     whose origin equals window.location.origin) — never blocks or modifies
//     cross-origin requests.
//   - Excludes /api/auth/login because a 401 there is an *expected*
//     "wrong credentials" message, not a session-expiry signal.
//   - Excludes /api/auth/me/logout-style negative results — only event-
//     fires once per page lifetime (resets on navigation).

import { isEmbeddedDocument } from "./is-embedded";
import { verifySessionDead } from "./verify-session";
import { setAuthState } from "./auth-state";

const EVENT_NAME = "hawkeye:session-expired" as const;
// Distinct event for "no cookie was ever sent" — fires the same modal but
// with sign-in-required copy instead of session-expired copy. Kept separate
// so listeners (currently just SessionExpiryWatcher) can branch on intent.
const NO_COOKIE_EVENT_NAME = "hawkeye:no-session" as const;
const PATCHED_FLAG = "__hawkeyeSessionExpiryPatched";
// Debounce window after a watched 401 before re-checking /api/auth/me.
// Long enough to swallow sign-in handshake / cookie-race transients,
// short enough that a genuinely expired session prompts the user quickly.
const VERIFY_DEBOUNCE_MS = 800;

const EXCLUDED_PATHS: readonly string[] = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/emergency-reset",
  // /api/auth/me 401 is the canonical "no valid session" signal — the
  // watcher's proactive path handles it explicitly via reportSessionExpired,
  // so the interceptor doesn't need to double-fire on it.
  "/api/auth/me",
];

const EXCLUDED_LOCATIONS: readonly string[] = [
  // No point telling someone who is already on /login that their session
  // expired — they're literally trying to fix it.
  "/login",
];

interface PatchableWindow extends Window {
  [PATCHED_FLAG]?: boolean;
}

function isSameOriginApiUrl(input: RequestInfo | URL): boolean {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : "";
    if (!raw) return false;
    // Relative URLs starting with "/api/" are always same-origin under
    // the Next.js app router — fastest path.
    if (raw.startsWith("/api/")) {
      return !EXCLUDED_PATHS.some((p) => raw.startsWith(p));
    }
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return false;
    if (!u.pathname.startsWith("/api/")) return false;
    return !EXCLUDED_PATHS.some((p) => u.pathname.startsWith(p));
  } catch {
    return false;
  }
}

function isLoginUrl(input: RequestInfo | URL): boolean {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : "";
    if (!raw) return false;
    if (raw.startsWith("/api/auth/login")) return true;
    const u = new URL(raw, window.location.origin);
    return u.origin === window.location.origin && u.pathname === "/api/auth/login";
  } catch {
    return false;
  }
}

let alreadyDispatched = false;
let noSessionAlreadyDispatched = false;

/** Fire the "sign in required" event — operator never sent a cookie. Uses a
 * separate dispatch latch from reportSessionExpired so an expired-session
 * event can still upgrade the no-session prompt to the expired-session
 * prompt within the same page lifetime if a stale cookie path triggers it
 * later. */
export function reportNoSession(): void {
  // Auth state first, before any modal-suppression guard below — pollers must
  // halt even on /login, in iframes, and after the modal already fired once.
  setAuthState("unauthenticated");
  if (noSessionAlreadyDispatched || alreadyDispatched) return;
  if (isEmbeddedDocument()) return;
  if (typeof window !== "undefined") {
    const here = window.location.pathname;
    if (EXCLUDED_LOCATIONS.some((p) => here === p || here.startsWith(`${p}/`))) {
      return;
    }
  }
  noSessionAlreadyDispatched = true;
  try {
    window.dispatchEvent(new CustomEvent(NO_COOKIE_EVENT_NAME));
  } catch {
    /* dispatchEvent unavailable — caller already in degraded state */
  }
}

/** Manually fire the session-expired event. */
export function reportSessionExpired(): void {
  // Auth state first — see reportNoSession.
  setAuthState("unauthenticated");
  if (alreadyDispatched) return;
  // Belt-and-braces gate: even if a future caller bypasses the watcher /
  // interceptor and calls reportSessionExpired() directly inside an iframe,
  // we suppress here. The parent frame owns the auth UX — re-prompting
  // inside each iframe would produce N stacked modals.
  if (isEmbeddedDocument()) return;
  if (typeof window !== "undefined") {
    const here = window.location.pathname;
    if (EXCLUDED_LOCATIONS.some((p) => here === p || here.startsWith(`${p}/`))) {
      return;
    }
  }
  alreadyDispatched = true;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* dispatchEvent unavailable — caller already in degraded state */
  }
}

/** Idempotently install the same-origin /api 401 → session-expired interceptor.
 *
 * Single 401s do NOT immediately fire the modal: they queue a debounced
 * /api/auth/me re-check. Only when /api/auth/me ALSO returns 401/403 do we
 * dispatch the session-expired event. This prevents the modal from popping
 * during sign-in handshakes or transient route-level 401s that aren't
 * actually session expiry. */
export function installSessionExpiryInterceptor(): void {
  if (typeof window === "undefined") return;
  // Embedded iframes (Intel-Feed inline preview, etc.) inherit the same
  // Next.js bundle, so this interceptor would otherwise patch the iframe's
  // window.fetch too. Any 401 hitting an /api/* call from inside the iframe
  // would then debounce-verify and fire the modal even though the parent
  // frame already has its own watcher. Skip install entirely when embedded.
  if (isEmbeddedDocument()) return;
  const w = window as PatchableWindow;
  if (w[PATCHED_FLAG]) return;
  w[PATCHED_FLAG] = true;

  let pendingVerifyTimer: ReturnType<typeof setTimeout> | null = null;
  let verifyInFlight = false;

  const scheduleVerify = (): void => {
    if (alreadyDispatched || verifyInFlight || pendingVerifyTimer !== null) return;
    pendingVerifyTimer = setTimeout(() => {
      pendingVerifyTimer = null;
      verifyInFlight = true;
      void verifySessionDead()
        .then((dead) => {
          if (dead) reportSessionExpired();
        })
        .finally(() => {
          verifyInFlight = false;
        });
    }, VERIFY_DEBOUNCE_MS);
  };

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const shouldWatch = isSameOriginApiUrl(input);
    const res = await original(input, init);
    if (shouldWatch && res.status === 401) {
      try {
        scheduleVerify();
      } catch {
        /* never bubble up — the original response goes through unchanged */
      }
    }
    // A successful login is the one place a signed-out browser becomes
    // signed-in without a full navigation — flip the auth state so halted
    // pollers (case stream, alerts) resume immediately.
    if (res.ok && isLoginUrl(input)) {
      try {
        setAuthState("authenticated");
      } catch {
        /* never bubble up */
      }
    }
    return res;
  };
}

/** Event name a UI component can subscribe to. */
export const SESSION_EXPIRED_EVENT = EVENT_NAME;
/** Event name for the "no cookie was ever sent" variant — sibling of
 *  SESSION_EXPIRED_EVENT, fires the same modal with sign-in-required copy. */
export const SESSION_NO_COOKIE_EVENT = NO_COOKIE_EVENT_NAME;
