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

const EVENT_NAME = "hawkeye:session-expired" as const;
const PATCHED_FLAG = "__hawkeyeSessionExpiryPatched";

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

let alreadyDispatched = false;

/** Manually fire the session-expired event. */
export function reportSessionExpired(): void {
  if (alreadyDispatched) return;
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

/** Idempotently install the same-origin /api 401 → session-expired interceptor. */
export function installSessionExpiryInterceptor(): void {
  if (typeof window === "undefined") return;
  const w = window as PatchableWindow;
  if (w[PATCHED_FLAG]) return;
  w[PATCHED_FLAG] = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const shouldWatch = isSameOriginApiUrl(input);
    const res = await original(input, init);
    if (shouldWatch && res.status === 401) {
      // Fire-and-forget so we never delay the caller's resolution.
      try {
        reportSessionExpired();
      } catch {
        /* never bubble up — the original response goes through unchanged */
      }
    }
    return res;
  };
}

/** Event name a UI component can subscribe to. */
export const SESSION_EXPIRED_EVENT = EVENT_NAME;
