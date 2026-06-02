// Hawkeye Sterling — confirm whether the operator's session really is dead.
//
// The reactive interceptor in session-expiry.ts fires this whenever a
// watched /api/* route returns 401. A single 401 is NOT sufficient to
// trigger the "Session expired" modal — sign-in handshakes, cookie-race
// conditions during navigation, and individual route auth misconfigurations
// produce transient 401s that the modal would over-eagerly surface.
//
// The contract: returns true ONLY when /api/auth/me also returns 401/403.
// Any 2xx response (including 200 with `ok:false` for non-auth reasons)
// proves the session is still valid and the watcher should NOT fire.
// Network failures return false fail-open — better to leave the modal
// closed and let the next real 401 retrigger the verifier than to flash
// an "expired" modal on an unrelated connectivity blip.

export async function verifySessionDead(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    });
    return res.status === 401 || res.status === 403;
  } catch {
    return false;
  }
}
