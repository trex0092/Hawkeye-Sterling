// Optional Upstash Redis client. Returns null if env vars are not set, so the
// caller can fall back to in-memory caching with no behavioural change.
//
// We talk to Upstash via the REST API (HTTPS) rather than the regular Redis
// protocol because Netlify Lambdas don't keep TCP connections across cold
// starts — REST works under that model and Upstash's TCP cost is the same.
//
// Required env vars (both):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// Dynamic import on the SDK so this module is safe to import even when the
// dependency hasn't been installed yet (e.g. on a deploy that pre-dates the
// package.json bump).

type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
};

let _client: RedisLike | null = null;
let _resolved = false;

// Returns a Redis-compatible client, or null when Upstash is not configured /
// not installed. Caches the resolution so we don't re-import on every call.
export async function getRedis(): Promise<RedisLike | null> {
  if (_resolved) return _client;
  _resolved = true;

  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) return null;

  try {
    // The cast-to-string suppresses Next's static-analyser warning about
    // non-literal dynamic imports — same pattern used elsewhere in this
    // repo for optional deps (e.g. exceljs in the XLSX adapters).
    const mod = await import("@upstash/redis" as string) as {
      Redis: new (opts: { url: string; token: string }) => RedisLike;
    };
    _client = new mod.Redis({ url, token });
    return _client;
  } catch (err) {
    // @upstash/redis not installed — that's fine; the cache layer will fall
    // back to in-memory. Don't log loudly; this is the expected state in
    // environments where the optional dep wasn't bundled.
    console.warn("[cache/redis] @upstash/redis unavailable, falling back to in-memory:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Synchronous "is Redis configured" probe for status endpoints — doesn't
// import the SDK, just checks the env vars.
export function isRedisConfigured(): boolean {
  return !!(process.env["UPSTASH_REDIS_REST_URL"] && process.env["UPSTASH_REDIS_REST_TOKEN"]);
}
