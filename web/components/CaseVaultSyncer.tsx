"use client";

import { useEffect } from "react";
import { syncFromServer } from "@/lib/data/case-store";
import type { CaseRecord } from "@/lib/types";

// Mounted once at the top of the app. Two responsibilities:
//
// 1. Boot-time pull — syncFromServer() merges localStorage with the
//    server vault on first paint so cases written from another device
//    show up here.
//
// 2. Live stream — opens an EventSource against /api/cases/stream and
//    re-applies any incoming change snapshot to localStorage. The
//    server holds each connection up to ~24s and closes; the browser
//    auto-reconnects, so we get near-real-time updates without
//    polling overhead. Failures are silent: localStorage stays
//    authoritative when offline / unauthenticated / unsupported.

const STORAGE_KEY = "hawkeye.cases.v1";

interface ChangePayload {
  tenant?: string;
  lastChangeAt?: string;
  cases?: CaseRecord[];
}

export function CaseVaultSyncer(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    void syncFromServer();

    // EventSource auto-reconnects on close. We track the latest
    // lastChangeAt we've seen so the server only emits a change
    // event when something actually moved past our cursor.
    let lastSeen = new Date(0).toISOString();
    let es: EventSource | null = null;
    let closed = false;

    const open = (): void => {
      if (closed) return;
      const adminToken =
        process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";
      const params = new URLSearchParams({ since: lastSeen });
      if (adminToken) params.set("token", adminToken);
      const url = `/api/cases/stream?${params.toString()}`;
      try {
        es = new EventSource(url, { withCredentials: false });
      } catch {
        return;
      }
      es.addEventListener("change", (ev) => {
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
      // The server emits "ping" after the 24s hold and closes; the
      // browser will reconnect on its own, but the explicit close +
      // reopen below avoids relying on browser-specific reconnect
      // delays.
      es.addEventListener("ping", () => {
        es?.close();
        if (!closed) {
          // Brief jitter so a fleet of tabs doesn't reconnect in
          // lock-step. 200-500 ms.
          setTimeout(open, 200 + Math.floor(Math.random() * 300));
        }
      });
      es.onerror = (): void => {
        // EventSource error — could be auth (401) or network. Close
        // and back off; the browser would retry too, but this keeps
        // the back-off bounded.
        es?.close();
        if (!closed) {
          setTimeout(open, 5_000);
        }
      };
    };

    open();

    return () => {
      closed = true;
      es?.close();
    };
  }, []);

  return null;
}
