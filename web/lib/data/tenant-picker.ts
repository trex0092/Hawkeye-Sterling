"use client";

// Client-side tenant picker. One MLRO handles multiple companies from
// the same Netlify deploy — they pick the current tenant from the
// Header dropdown; every report / Asana filing / compliance artefact
// reads the current value.
//
// Pre-seeded with the 6 known tenant names so they're one-click.
// Free-text "Add company" extends the list locally. The currently
// selected name is also what /api/*-report routes write into the
// reporting-entity field on the goAML / Asana / compliance output.

const CURRENT_KEY = "hawkeye.current-tenant";
const LIST_KEY = "hawkeye.tenant-list.v1";

const DEFAULT_TENANTS = [
  "Fine Gold LLC",
  "Fine Gold Branch",
  "ZOE FZE",
  "Madison LLC",
  "Naples LLC",
  "Gramaltin AS",
];

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadTenantList(): string[] {
  if (!isBrowser()) return DEFAULT_TENANTS;
  try {
    const raw = window.localStorage.getItem(LIST_KEY);
    if (!raw) return DEFAULT_TENANTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_TENANTS;
    const merged = new Set<string>([...parsed, ...DEFAULT_TENANTS]);
    return Array.from(merged);
  } catch {
    return DEFAULT_TENANTS;
  }
}

export function saveTenantList(list: string[]): void {
  if (!isBrowser()) return;
  try {
    const cleaned = Array.from(new Set(list.filter((s) => s.trim().length > 0)));
    window.localStorage.setItem(LIST_KEY, JSON.stringify(cleaned));
    window.dispatchEvent(new CustomEvent("hawkeye:tenant-list-updated"));
  } catch {
    /* localStorage disabled */
  }
}

export function loadCurrentTenant(): string {
  if (!isBrowser()) return "";
  try {
    return window.localStorage.getItem(CURRENT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveCurrentTenant(name: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CURRENT_KEY, name.trim());
    window.dispatchEvent(new CustomEvent("hawkeye:tenant-updated"));
  } catch {
    /* */
  }
}

export function addTenant(name: string): void {
  const list = loadTenantList();
  if (!list.includes(name.trim())) {
    saveTenantList([...list, name.trim()]);
  }
}
