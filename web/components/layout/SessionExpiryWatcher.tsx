"use client";

// Polls /api/auth/me once on mount to learn the session expiry timestamp,
// then fires in-app toast warnings at T-15min and T-5min, and hard-redirects
// to /login at expiry. This ensures users are never silently dropped mid-
// workflow without notice — a UX and regulatory concern (FDL 10/2025 Art.24
// requires that access events are attributable to an authenticated actor).

import { useEffect, useRef } from "react";
import { pushToast } from "@/lib/toast-bus";

const WARN_AT_SECS = [15 * 60, 5 * 60] as const;

export function SessionExpiryWatcher(): null {
  const expRef = useRef<number | null>(null);
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let dead = false;

    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ok: boolean; user?: { sessionExp?: number }; warning?: { code: string; message: string } }) => {
        if (dead) return;
        if (!d.ok || !d.user?.sessionExp) return;
        expRef.current = d.user.sessionExp;
        // IP change detection is logged server-side to the audit chain.
        // The front-end toast is suppressed — VPN/mobile networks change
        // IP legitimately and the alert caused false-positive anxiety.
      })
      .catch(() => undefined);

    const tick = setInterval(() => {
      const exp = expRef.current;
      if (!exp) return;

      const now = Math.floor(Date.now() / 1000);
      const remaining = exp - now;

      if (remaining <= 0) {
        clearInterval(tick);
        window.location.href = "/login";
        return;
      }

      for (const threshold of WARN_AT_SECS) {
        if (remaining <= threshold && !firedRef.current.has(threshold)) {
          firedRef.current.add(threshold);
          const mins = Math.ceil(remaining / 60);
          pushToast({
            id: `session-expiry-${threshold}`,
            severity: threshold <= 5 * 60 ? "high" : "medium",
            title: "Session expiring soon",
            body: `Your session expires in ${mins} minute${mins === 1 ? "" : "s"}. Save your work and log in again.`,
          });
        }
      }
    }, 30_000);

    return () => {
      dead = true;
      clearInterval(tick);
    };
  }, []);

  return null;
}
