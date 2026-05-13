// Hawkeye Sterling — MCP shared rate-limit + circuit-breaker state.
//
// The MCP route previously kept _rateWindows and _breakers in module-level
// Maps. Each warm Lambda instance had its own copy, so under load the
// effective rate cap was N × configured-limit where N = warm instance count.
// Same for the breaker: one instance's failures didn't trip others.
//
// This module persists both pieces of state to a single Netlify Blob per
// tool (consistency: strong), with a short-lived in-process cache so the
// happy path doesn't add round-trip latency to every tool call.
//
// Trade-offs:
//   · Reads are cached locally for SHARED_CACHE_TTL_MS — typical hot-path
//     overhead is ~0 ms (cache hit) or one blob get (~30-80 ms).
//   · Writes are read-modify-write against the blob, so two concurrent
//     instances can race and undercount. Accept that — sanctions screening
//     is not a billing path; an occasional ±1 on the counter is fine.
//   · If Blobs is unavailable, falls back to in-process state and logs.
//     The MCP route stays available rather than failing closed.
//
// Storage layout (in store "mcp-shared-state"):
//   rate/<toolName>            → { count, windowStart, updatedAt }
//   breaker/<toolName>         → { failures, tripTime }

import type { ConsequenceLevel } from "./tool-manifest";

const STORE_NAME = "mcp-shared-state";
const SHARED_CACHE_TTL_MS = 2_000;
const BLOB_WRITE_TIMEOUT_MS = 500;

interface RateWindow { count: number; windowStart: number; updatedAt: number }
interface BreakerState { failures: number; tripTime: number | null }

interface CacheEntry<T> { value: T; expiresAt: number }

// In-process caches (per-Lambda, short-lived).
const _rateCache = new Map<string, CacheEntry<RateWindow>>();
const _breakerCache = new Map<string, CacheEntry<BreakerState>>();

// Final fallback when Blobs is unavailable. Same shape as the previous
// module-level Maps — preserves availability if the blob plane breaks.
const _rateFallback = new Map<string, RateWindow>();
const _breakerFallback = new Map<string, BreakerState>();

interface BlobsModuleShape {
  getStore: (opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: "strong" | "eventual";
  }) => {
    setJSON: (key: string, value: unknown) => Promise<void>;
    get: (key: string, opts?: { type?: string }) => Promise<unknown>;
  };
}

let _blobsMod: BlobsModuleShape | null | undefined; // undefined = not yet loaded

async function blobs(): Promise<BlobsModuleShape | null> {
  if (_blobsMod !== undefined) return _blobsMod;
  try {
    _blobsMod = (await import("@netlify/blobs")) as unknown as BlobsModuleShape;
  } catch {
    _blobsMod = null;
  }
  return _blobsMod;
}

function credentials(): { siteID?: string; token?: string } {
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  const out: { siteID?: string; token?: string } = {};
  if (siteID) out.siteID = siteID;
  if (token) out.token = token;
  return out;
}

async function getStore(): Promise<ReturnType<BlobsModuleShape["getStore"]> | null> {
  const mod = await blobs();
  if (!mod) return null;
  const creds = credentials();
  return mod.getStore({
    name: STORE_NAME,
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });
}

// ── Rate limiter ─────────────────────────────────────────────────────────────

const CLASS_RATE_LIMITS: Record<ConsequenceLevel, number> = {
  "read-only":  120,
  "supervised":  40,
  "action":      10,
};

export async function checkAndIncrementRate(
  toolName: string,
  level: ConsequenceLevel,
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const limit = CLASS_RATE_LIMITS[level];
  const now = Date.now();
  const key = `rate/${toolName}`;

  // Try shared (blobs) path first.
  let win: RateWindow | null = null;
  const cached = _rateCache.get(toolName);
  if (cached && now < cached.expiresAt) {
    win = cached.value;
  } else {
    const store = await getStore();
    if (store) {
      try {
        const raw = (await store.get(key, { type: "json" })) as RateWindow | null;
        if (raw && typeof raw.count === "number") win = raw;
      } catch {
        // Fall through to fallback.
      }
    }
  }
  if (!win) win = _rateFallback.get(toolName) ?? { count: 0, windowStart: now, updatedAt: now };

  // Window roll-over.
  if (now - win.windowStart >= 60_000) {
    win = { count: 0, windowStart: now, updatedAt: now };
  }

  if (win.count >= limit) {
    return { allowed: false, retryAfterMs: 60_000 - (now - win.windowStart) };
  }

  win.count++;
  win.updatedAt = now;

  // Update fallback synchronously; write to blobs fire-and-forget with bound.
  _rateFallback.set(toolName, win);
  _rateCache.set(toolName, { value: win, expiresAt: now + SHARED_CACHE_TTL_MS });

  const store = await getStore();
  if (store) {
    void Promise.race([
      store.setJSON(key, win),
      new Promise<void>((resolve) => setTimeout(resolve, BLOB_WRITE_TIMEOUT_MS)),
    ]).catch(() => { /* shared write best-effort */ });
  }

  return { allowed: true };
}

// ── Circuit breaker ──────────────────────────────────────────────────────────

const BREAKER_THRESHOLD = 5;
const BREAKER_RESET_MS = 60_000;

async function readBreaker(toolName: string): Promise<BreakerState> {
  const cached = _breakerCache.get(toolName);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  const store = await getStore();
  if (store) {
    try {
      const raw = (await store.get(`breaker/${toolName}`, { type: "json" })) as BreakerState | null;
      if (raw && typeof raw.failures === "number") {
        _breakerCache.set(toolName, { value: raw, expiresAt: Date.now() + SHARED_CACHE_TTL_MS });
        return raw;
      }
    } catch {
      // Fall through.
    }
  }
  return _breakerFallback.get(toolName) ?? { failures: 0, tripTime: null };
}

async function writeBreaker(toolName: string, state: BreakerState): Promise<void> {
  _breakerFallback.set(toolName, state);
  _breakerCache.set(toolName, { value: state, expiresAt: Date.now() + SHARED_CACHE_TTL_MS });
  const store = await getStore();
  if (store) {
    void Promise.race([
      store.setJSON(`breaker/${toolName}`, state),
      new Promise<void>((resolve) => setTimeout(resolve, BLOB_WRITE_TIMEOUT_MS)),
    ]).catch(() => { /* shared write best-effort */ });
  }
}

export async function isBreakerOpen(toolName: string): Promise<boolean> {
  const s = await readBreaker(toolName);
  if (s.tripTime === null) return false;
  if (Date.now() - s.tripTime > BREAKER_RESET_MS) {
    // Auto-reset (half-open).
    await writeBreaker(toolName, { failures: 0, tripTime: null });
    return false;
  }
  return true;
}

export async function recordBreakerSuccess(toolName: string): Promise<void> {
  const s = await readBreaker(toolName);
  if (s.failures === 0 && s.tripTime === null) return; // nothing to reset
  await writeBreaker(toolName, { failures: 0, tripTime: null });
}

export async function recordBreakerFailure(toolName: string): Promise<void> {
  const s = await readBreaker(toolName);
  const failures = s.failures + 1;
  const tripTime = failures >= BREAKER_THRESHOLD ? Date.now() : s.tripTime;
  await writeBreaker(toolName, { failures, tripTime });
}
