"use client";

// Two responsibilities:
//
//   1. PROACTIVE warning — polls /api/auth/me once on mount to learn the
//      session expiry timestamp, then fires in-app toasts at T-15 / T-5,
//      hard-redirects to /login at expiry. Lets operators save their work
//      before they're kicked out.
//
//   2. REACTIVE detection — installs a same-origin fetch interceptor that
//      watches every /api/* response and fires a single site-wide
//      "Session expired" modal on the first 401. Before this, each panel
//      (Worldwide News, Sanctions List, Saved Filters, Regulatory Feed,
//      Activity Feed, …) rendered its own "Authentication required"
//      banner — N error chrome instead of one clear sign-in prompt.
//
// Both paths converge on the same modal so the user sees the same prompt
// whether their session ran out cleanly (warning path) or was already
// invalid when they opened the tab (interceptor path).

import { useEffect, useRef, useState } from "react";
import { pushToast } from "@/lib/toast-bus";
import {
  installSessionExpiryInterceptor,
  SESSION_EXPIRED_EVENT,
  reportSessionExpired,
} from "@/lib/client/session-expiry";

const WARN_AT_SECS = [15 * 60, 5 * 60] as const;

export function SessionExpiryWatcher() {
  const expRef = useRef<number | null>(null);
  const firedRef = useRef<Set<number>>(new Set());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dead = false;

    // (2) Reactive path: install the global same-origin /api 401 interceptor
    // before any panel kicks off its first fetch. Listen for the event.
    installSessionExpiryInterceptor();
    const onExpired = () => setOpen(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    // (1) Proactive path: read sessionExp from /api/auth/me. If THIS call
    // 401s, the session is already dead — fire the modal immediately
    // instead of staying silent like the prior implementation did.
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (dead) return null;
        if (r.status === 401 || r.status === 403) {
          reportSessionExpired();
          return null;
        }
        try {
          return (await r.json()) as {
            ok: boolean;
            user?: { sessionExp?: number };
            warning?: { code: string; message: string };
          };
        } catch {
          return null;
        }
      })
      .then((d) => {
        if (!d || dead) return;
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
        reportSessionExpired();
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
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
  }, []);

  if (!open) return null;

  // Build the return-to URL so re-login lands the operator back where
  // they were. Skip on /login itself to avoid loops.
  const returnTo =
    typeof window !== "undefined" && !window.location.pathname.startsWith("/login")
      ? window.location.pathname + window.location.search
      : "/";
  const loginHref = `/login?next=${encodeURIComponent(returnTo)}`;

  return (
    <div
      role="alertdialog"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-body"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="max-w-md w-full mx-4 bg-bg-panel border border-hair-2 rounded-lg shadow-2xl p-6">
        <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-3 mb-3">
          Session · Authentication required
        </div>
        <h1
          id="session-expired-title"
          className="font-display font-normal text-24 text-ink-0 mb-3"
        >
          Your session has expired
        </h1>
        <p
          id="session-expired-body"
          className="text-13 text-ink-2 mb-6 leading-relaxed"
        >
          Some panels could not load because your sign-in is no longer
          valid. Sign in again to continue — work-in-progress in local
          fields is preserved.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-13 font-semibold text-ink-2 hover:text-ink-0 transition-colors"
          >
            Dismiss
          </button>
          <a
            href={loginHref}
            className="px-5 py-2 bg-ink-0 text-bg-0 text-13 font-semibold rounded hover:bg-ink-1 transition-colors"
          >
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
