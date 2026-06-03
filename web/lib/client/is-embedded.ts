// Hawkeye Sterling — single source of truth for "am I rendering inside an
// iframe / embed?".
//
// Several modules render their own panels inside iframes (e.g. the Intel-Feed
// inline preview at /intel which mounts `<iframe src="…?embed=1">`). The
// embedded document is the SAME Next.js app, so client components like
// SessionExpiryWatcher run inside both the parent frame AND each iframe.
// That meant a transient 401 inside an iframe popped its own "Session
// expired" modal — one per visible iframe — while the parent frame already
// owned the auth UX.
//
// The contract for "this document is embedded":
//   - `?embed=1` query parameter is the explicit handshake the iframe host
//     uses (see /intel page.tsx iframe src builder); OR
//   - `window.self !== window.top`, which catches any future host that
//     forgets to set the query string. Same-origin iframes can safely read
//     window.top — no SecurityError. (Cross-origin iframes throw, in which
//     case we treat it as embedded too — a cross-origin frame should never
//     own the parent's auth UX.)
//
// Callers MUST guard for the SSR phase: this returns `false` server-side so
// the component renders the same markup on the server and on first client
// paint, then re-evaluates after hydration. For client-only call sites
// (event handlers, interceptors installed in useEffect) the SSR branch is
// never reached, but the guard is cheap.

export function isEmbeddedDocument(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("embed") === "1") return true;
  } catch {
    /* malformed URL — fall through to the frame check */
  }
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin parent — accessing window.top throws SecurityError.
    // Treat as embedded; the parent frame owns the auth UX, not us.
    return true;
  }
}
