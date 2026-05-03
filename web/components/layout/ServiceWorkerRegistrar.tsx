"use client";

// Registers /sw.js on first paint. Listens for new service-worker versions and
// silently activates them — no nagging "reload to update" toasts. Skips
// registration in development so HMR isn't fighting the cache.

import { useEffect } from "react";

export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Auto-activate updates without user prompt
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage("skip-waiting");
            }
          });
        });
      } catch { /* registration failed — site still works without SW */ }
    };
    void register();
  }, []);

  return null;
}

export default ServiceWorkerRegistrar;
