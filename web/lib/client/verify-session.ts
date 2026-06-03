// Hawkeye Sterling — confirm whether the operator's session really is dead.
//
// The reactive interceptor in session-expiry.ts fires this whenever a
// watched /api/* route returns 401. A single 401 is NOT sufficient to
// trigger the "Session expired" modal — sign-in handshakes, cookie-race
// conditions during navigation, and individual route auth misconfigurations
// produce transient 401s that the modal would over-eagerly surface.
//
// The contract: returns true ONLY when /api/auth/me confirms the session
// is dead AND the operator previously had one (cookie was sent but failed
// verification, or was expired, or was invalidated by an admin reset).
//
// A 401 with `code: "no_session"` means the browser never sent a session
// cookie — the operator was never signed in (or their cookie was cleared
// long ago). Treat that as "not dead" → return false → modal stays closed.
// Otherwise an unauthenticated visit to a public page would re-pop the
// "Your session has expired" modal on every navigation.
//
// Any 2xx response (including 200 with `ok:false` for non-auth reasons)
// also proves the session is still valid and returns false. Network
// failures return false fail-open — better to leave the modal closed and
// let the next real 401 retrigger the verifier than to flash an "expired"
// modal on an unrelated connectivity blip.

export async function verifySessionDead(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status !== 401 && res.status !== 403) return false;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { code?: unknown };
      if (typeof body?.code === "string") code = body.code;
    } catch {
      /* response had no JSON body — treat as a legacy/unknown 401 below */
    }
    // "no_session" = no cookie was ever sent. Operator is not signed in
    // and likely never was on this browser; the "expired" framing is wrong.
    if (code === "no_session") return false;
    return true;
  } catch {
    return false;
  }
}
