"use client";

// Shared client-side event bus for the AlertBell.
// Any module can call pushBellEvent() — it writes to localStorage and fires
// a "storage" event so the bell picks it up immediately without a page reload.

import type { DesignationAlert } from "@/lib/server/alerts-store";

const EVENTS_KEY = "hawkeye.bell.events.v1";
const MAX_EVENTS = 100;

export function loadBellEvents(): DesignationAlert[] {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(EVENTS_KEY);
    return raw ? (JSON.parse(raw) as DesignationAlert[]) : [];
  } catch (err) {
    console.error("[hawkeye] bell-events corrupted (parse failed) — returning empty:", err);
    return [];
  }
}

function saveBellEvents(events: DesignationAlert[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
    }
  } catch { /* storage full */ }
}

export function pushBellEvent(event: Omit<DesignationAlert, "read">): void {
  const existing = loadBellEvents();
  // Dedup by id
  if (existing.some((e) => e.id === event.id)) return;
  const full: DesignationAlert = { ...event, read: false };
  saveBellEvents([full, ...existing]);
  // Trigger storage event so other tabs / the bell hook pick it up
  if (typeof window !== "undefined") {
    window.dispatchEvent(new StorageEvent("storage", { key: EVENTS_KEY }));
  }
}

// Called by useAlerts to mark a local event as read without an API call
export function markBellEventRead(id: string): void {
  const events = loadBellEvents();
  saveBellEvents(events.map((e) => e.id === id ? { ...e, read: true } : e));
}
