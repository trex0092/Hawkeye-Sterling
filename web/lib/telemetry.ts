// Mode Telemetry — fire-count + last-fired tracking.
// Persists to localStorage["hawkeye.mode-telemetry.v1"]. Read by /intel/telemetry.
// Written by workbench's handleRun on every Run.

export interface ModeFireRecord {
  count: number;
  lastAt: number; // epoch ms
}

export type ModeFireMap = Record<string, ModeFireRecord>;

const STORAGE_KEY = "hawkeye.mode-telemetry.v1";

export function loadModeFires(): ModeFireMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ModeFireMap) : {};
  } catch {
    return {};
  }
}

export function saveModeFires(map: ModeFireMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function recordModeFiring(modeIds: readonly string[]): void {
  if (typeof window === "undefined" || modeIds.length === 0) return;
  const map = loadModeFires();
  const now = Date.now();
  for (const id of modeIds) {
    const prev = map[id];
    if (prev) {
      prev.count += 1;
      prev.lastAt = now;
    } else {
      map[id] = { count: 1, lastAt: now };
    }
  }
  saveModeFires(map);
}

export function clearModeFires(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* */
  }
}
