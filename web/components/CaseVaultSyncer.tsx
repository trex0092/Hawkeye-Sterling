"use client";

import { useEffect } from "react";
import { syncFromServer } from "@/lib/data/case-store";
import { subscribeAuthState } from "@/lib/client/auth-state";
import type { CaseRecord } from "@/lib/types";

// Mounted once at the top of the app. Two responsibilities:
//
// 1. Boot-time pull — syncFromServer() merges localStorage with the
//    server vault once the session is confirmed, so cases written from
//    another device show up here.
//
// 2. Live stream — opens an EventSource against /api/cases/stream and
//    re-applies any incoming change snapshot to localStorage. The
//    server holds each connection up to ~18s and closes; we reopen,
//    so we get near-real-time updates without polling overhead.
//
// Both are gated on the shared auth state: EventSource cannot see HTTP
// status codes, so before this gate an unauthenticated tab re-dialled
// /api/cases/stream every 5s forever, logging an unbounded stream of
// 401 console errors. The stream now opens only while the session is
// confirmed live, halts the moment it dies, and resumes on re-login.
// Transient errors while authenticated back off exponentially (5s → 60s)
// instead of retrying at a fixed clip.

const STORAGE_KEY = "hawkeye.cases.v1";
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;

interface ChangePayload {
  tenant?: string;
  lastChangeAt?: string;
  cases?: CaseRecord[];
}

export function CaseVaultSyncer(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // EventSource auto-reconnects on close. We track the latest
    // lastChangeAt we've seen so the server only emits a change
    // event when something actually moved past our cursor.
    let lastSeen = new Date(0).toISOString();
    let es: EventSource | null = null;
    let closed = false;
    // Dormant until the auth-state subscription confirms a live session.
    let halted = true;
    let attempts = 0;
    let reopenTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReopen = (): void => {
      if (reopenTimer !== null) {
        clearTimeout(reopenTimer);
        reopenTimer = null;
      }
    };

    const schedule = (ms: number): void => {
      if (closed || halted) return;
      clearReopen();
      reopenTimer = setTimeout(open, ms);
    };

    const open = (): void => {
      if (closed || halted) return;
      const params = new URLSearchParams({ since: lastSeen });
      const url = `/api/cases/stream?${params.toString()}`;
      try {
        es = new EventSource(url, { withCredentials: true });
      } catch {
        return;
      }
      // Any server-sent event proves the connection (and session) is
      // healthy — reset the error backoff.
      es.addEventListener("hello", () => {
        attempts = 0;
      });
      es.addEventListener("change", (ev) => {
        attempts = 0;
        try {
          const data = JSON.parse((ev as MessageEvent).data) as ChangePayload;
          if (data.lastChangeAt) lastSeen = data.lastChangeAt;
          if (Array.isArray(data.cases)) {
            window.localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(data.cases),
            );
            window.dispatchEvent(new CustomEvent("hawkeye:cases-updated"));
          }
        } catch {
          /* malformed event — ignore */
        }
      });
      // The server emits "ping" after its hold window and closes; the
      // browser would reconnect on its own, but the explicit close +
      // reopen avoids relying on browser-specific reconnect delays.
      es.addEventListener("ping", () => {
        attempts = 0;
        es?.close();
        // Brief jitter so a fleet of tabs doesn't reconnect in
        // lock-step. 200-500 ms.
        schedule(200 + Math.floor(Math.random() * 300));
      });
      es.onerror = (): void => {
        // EventSource hides the HTTP status, so this is either a network
        // blip or an auth failure. While the auth state says we're signed
        // in, retry with capped exponential backoff; if the session died,
        // the auth-state subscription below halts the loop the moment any
        // gated fetch confirms it.
        es?.close();
        attempts += 1;
        schedule(Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS));
      };
    };

    const unsubscribe = subscribeAuthState((state) => {
      if (state === "authenticated") {
        if (!halted) return;
        halted = false;
        attempts = 0;
        void syncFromServer();
        open();
      } else if (state === "unauthenticated") {
        halted = true;
        clearReopen();
        es?.close();
      }
      // "unknown" — leave whatever is running untouched; the next
      // definitive signal decides.
    });

    return () => {
      closed = true;
      unsubscribe();
      clearReopen();
      es?.close();
    };
  }, []);

  return null;
}
