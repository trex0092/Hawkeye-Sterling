"use client";

// Tiny in-app toast bus. No browser-permission dance, no audio-policy
// gating — a plain DOM event that the AlertToast component subscribes to
// and renders as a fixed-position popup. Always fires, never silent.

import type { DesignationAlert } from "@/lib/server/alerts-store";

const EVENT_NAME = "hawkeye:toast";

export interface ToastPayload {
  id: string;
  severity: DesignationAlert["severity"];
  title: string;
  body: string;
  href?: string;
  ttlMs?: number;
}

export function pushToast(payload: ToastPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT_NAME, { detail: payload }));
}

export function subscribeToasts(handler: (payload: ToastPayload) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (e: Event) => {
    const ce = e as CustomEvent<ToastPayload>;
    handler(ce.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
