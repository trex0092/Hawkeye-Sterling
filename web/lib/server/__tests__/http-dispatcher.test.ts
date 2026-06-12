// Unit tests for the shared news-egress dispatcher.
//
// Proxy config is resolved at module load, so each case resets the module
// registry and re-imports with the desired env. Verifies the proxy is built
// only when configured, the env-var precedence (NEWS_HTTP_PROXY → HTTPS_PROXY →
// HTTP_PROXY), and that newsFetch injects the dispatcher per-call (never
// globally) and passes caller init through untouched.

import { afterEach, describe, expect, it, vi } from "vitest";

const MOD = "@/lib/server/http-dispatcher";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function loadFresh() {
  vi.resetModules();
  return import(MOD);
}

function clearProxyEnv() {
  for (const k of ["NEWS_HTTP_PROXY", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) {
    vi.stubEnv(k, "");
  }
}

describe("http-dispatcher proxy resolution", () => {
  it("returns no dispatcher when no proxy env is set", async () => {
    clearProxyEnv();
    const m = await loadFresh();
    expect(m.getNewsDispatcher()).toBeUndefined();
    expect(m.newsProxyInfo()).toEqual({ configured: false, source: null });
  });

  it("builds a ProxyAgent from NEWS_HTTP_PROXY", async () => {
    clearProxyEnv();
    vi.stubEnv("NEWS_HTTP_PROXY", "http://proxy.internal:8080");
    const m = await loadFresh();
    const { ProxyAgent } = await import("undici");
    expect(m.getNewsDispatcher()).toBeInstanceOf(ProxyAgent);
    expect(m.newsProxyInfo()).toEqual({ configured: true, source: "NEWS_HTTP_PROXY" });
  });

  it("falls back to HTTPS_PROXY when NEWS_HTTP_PROXY is unset", async () => {
    clearProxyEnv();
    vi.stubEnv("HTTPS_PROXY", "http://corp-proxy:3128");
    const m = await loadFresh();
    expect(m.newsProxyInfo()).toEqual({ configured: true, source: "HTTPS_PROXY" });
  });

  it("memoizes the dispatcher across calls", async () => {
    clearProxyEnv();
    vi.stubEnv("NEWS_HTTP_PROXY", "http://proxy.internal:8080");
    const m = await loadFresh();
    expect(m.getNewsDispatcher()).toBe(m.getNewsDispatcher());
  });
});

describe("newsFetch", () => {
  it("calls global fetch without a dispatcher when unconfigured", async () => {
    clearProxyEnv();
    const m = await loadFresh();
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await m.newsFetch("https://example.com/feed", { headers: { "x-test": "1" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit & { dispatcher?: unknown };
    expect(init.dispatcher).toBeUndefined();
    expect(init.headers).toEqual({ "x-test": "1" });
  });

  it("injects the proxy dispatcher per-call when configured", async () => {
    clearProxyEnv();
    vi.stubEnv("NEWS_HTTP_PROXY", "http://proxy.internal:8080");
    const m = await loadFresh();
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await m.newsFetch("https://example.com/feed");
    const init = fetchMock.mock.calls[0][1] as RequestInit & { dispatcher?: unknown };
    expect(init.dispatcher).toBeDefined();
    expect(init.dispatcher).toBe(m.getNewsDispatcher());
  });
});

describe("drainResponse", () => {
  it("releases a body and never throws (undefined, null, fresh, or already-consumed)", async () => {
    const m = await loadFresh();
    await expect(m.drainResponse(undefined)).resolves.toBeUndefined();
    await expect(m.drainResponse(null)).resolves.toBeUndefined();
    await expect(m.drainResponse(new Response("body"))).resolves.toBeUndefined();
    const consumed = new Response("body");
    await consumed.text(); // body already read → cancel would reject; must be swallowed
    await expect(m.drainResponse(consumed)).resolves.toBeUndefined();
  });
});

describe("newsFetch relay fallback", () => {
  function clearRelayEnv() {
    vi.stubEnv("NEWS_RELAY_ENABLED", "");
    vi.stubEnv("NEWS_FETCH_RELAY", "");
  }

  it("is ON by default — 1 internal edge relay always active", async () => {
    clearProxyEnv();
    clearRelayEnv();
    const m = await loadFresh();
    expect(m.newsRelayInfo()).toEqual({ enabled: true, count: 1 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 403 })) // direct
      .mockResolvedValueOnce(new Response("<rss>ok</rss>", { status: 200 })); // edge relay
    vi.stubGlobal("fetch", fetchMock);
    const res = await m.newsFetch("https://news.example/feed", undefined, { allowRelay: true });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2); // direct + relay
  });

  it("uses the internal edge relay when no NEWS_FETCH_RELAY override is set", async () => {
    clearProxyEnv();
    clearRelayEnv();
    const m = await loadFresh();
    const info = m.newsRelayInfo();
    expect(info.enabled).toBe(true);
    expect(info.count).toBe(1);
  });

  it("retries through the relay on a 403 when allowRelay is set", async () => {
    clearProxyEnv();
    clearRelayEnv();
    const m = await loadFresh();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }))
      .mockResolvedValueOnce(new Response("<rss>ok</rss>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await m.newsFetch("https://api.gdeltproject.org/x", undefined, { allowRelay: true });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const relayCall = fetchMock.mock.calls[1][0] as string;
    expect(relayCall).toContain(encodeURIComponent("https://api.gdeltproject.org/x"));
  });

  it("returns upstream status when the single relay also fails", async () => {
    clearProxyEnv();
    clearRelayEnv();
    const m = await loadFresh();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 403 })) // direct
      .mockResolvedValueOnce(new Response("relay down", { status: 502 })); // edge relay
    vi.stubGlobal("fetch", fetchMock);
    const res = await m.newsFetch("https://api.gdeltproject.org/x", undefined, { allowRelay: true });
    // Both failed — hand back the direct upstream response (403)
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT relay when allowRelay is unset — API-key calls never relay", async () => {
    clearProxyEnv();
    clearRelayEnv();
    const m = await loadFresh();
    const fetchMock = vi.fn().mockResolvedValue(new Response("blocked", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await m.newsFetch("https://newsapi.org/v2/everything?apiKey=secret");
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not touch the relay when the direct fetch succeeds fast", async () => {
    clearProxyEnv();
    clearRelayEnv();
    const m = await loadFresh();
    const fetchMock = vi.fn().mockResolvedValue(new Response("<rss>ok</rss>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await m.newsFetch("https://api.gdeltproject.org/x", undefined, { allowRelay: true });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1); // direct only — no hedge fired
  });
});

// The hedge: a HANGING direct upstream (GDELT's weekly brownout mode) must not
// starve the relay of the caller's timeout budget. After NEWS_RELAY_HEDGE_MS
// the relay chain runs in parallel and the first usable response wins.
describe("newsFetch hedged relay (hanging upstream)", () => {
  function clearRelayEnv() {
    vi.stubEnv("NEWS_RELAY_ENABLED", "");
    vi.stubEnv("NEWS_FETCH_RELAY", "");
  }

  // A direct fetch that never answers but honours its abort signal — the shape
  // of a GDELT brownout socket.
  function hangUntilAborted(init?: RequestInit): Promise<Response> {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      const onAbort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  function respondAfter(ms: number, res: Response): Promise<Response> {
    return new Promise((resolve) => setTimeout(() => resolve(res), ms));
  }

  it("rescues a hanging direct fetch through the relay and aborts the hung socket", async () => {
    clearProxyEnv();
    clearRelayEnv();
    vi.stubEnv("NEWS_RELAY_HEDGE_MS", "10");
    const m = await loadFresh();
    let directSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        directSignal = init?.signal ?? undefined;
        return hangUntilAborted(init); // direct: hangs
      }
      return respondAfter(5, new Response("<rss>relayed</rss>", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const t0 = Date.now();
    const res = await m.newsFetch("https://api.gdeltproject.org/x", undefined, { allowRelay: true });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("relayed");
    expect(fetchMock).toHaveBeenCalledTimes(2); // direct + hedged relay
    // The win must come from the hedge, not from waiting out a long timeout.
    expect(Date.now() - t0).toBeLessThan(1_000);
    // The hung direct socket must be released once the relay wins.
    expect(directSignal?.aborted).toBe(true);
  });

  it("lets a slow-but-healthy direct response win when the hedged relay fails", async () => {
    clearProxyEnv();
    clearRelayEnv();
    vi.stubEnv("NEWS_RELAY_HEDGE_MS", "10");
    const m = await loadFresh();
    const fetchMock = vi.fn((_url: unknown) =>
      fetchMock.mock.calls.length === 1
        ? respondAfter(100, new Response("<rss>direct</rss>", { status: 200 })) // healthy, just slow
        : respondAfter(5, new Response("relay down", { status: 502 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await m.newsFetch("https://api.gdeltproject.org/x", undefined, { allowRelay: true });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("direct");
    expect(fetchMock).toHaveBeenCalledTimes(2); // hedge fired, but direct still won
  });

  it("surfaces the outage when direct hangs to the caller's deadline and relays fail", async () => {
    clearProxyEnv();
    clearRelayEnv();
    vi.stubEnv("NEWS_RELAY_HEDGE_MS", "10");
    const m = await loadFresh();
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) =>
      fetchMock.mock.calls.length === 1
        ? hangUntilAborted(init) // direct: hangs until the caller aborts
        : respondAfter(5, new Response("relay down", { status: 502 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const caller = new AbortController();
    const timer = setTimeout(() => caller.abort(), 80); // the probe's 4s budget, scaled down
    try {
      await expect(
        m.newsFetch(
          "https://api.gdeltproject.org/x",
          { signal: caller.signal },
          { allowRelay: true },
        ),
      ).rejects.toThrow("news fetch failed (direct and all relays)");
    } finally {
      clearTimeout(timer);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2); // the relay genuinely ran this time
  });
});

describe("newsFetch global egress concurrency cap", () => {
  it("never opens more than NEWS_MAX_CONCURRENCY sockets at once", async () => {
    clearProxyEnv();
    vi.stubEnv("NEWS_MAX_CONCURRENCY", "4");
    const m = await loadFresh();

    let inFlight = 0;
    let peak = 0;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            resolve(new Response("ok"));
          }, 15);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Fire 40 concurrent news fetches (no relay → one socket each).
    await Promise.all(
      Array.from({ length: 40 }, (_, i) => m.newsFetch(`https://example.com/feed/${i}`)),
    );

    expect(peak).toBeLessThanOrEqual(4); // the cap held under a 40-way burst
    expect(fetchMock).toHaveBeenCalledTimes(40); // every request still ran, just throttled
  });

  it("drains the queue — all callers resolve, none are starved", async () => {
    clearProxyEnv();
    vi.stubEnv("NEWS_MAX_CONCURRENCY", "2");
    const m = await loadFresh();
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => m.newsFetch(`https://example.com/${i}`)),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });
});

describe("newsFetchRelayOnly", () => {
  it("goes straight to the relay (never the direct URL) and returns its response", async () => {
    clearProxyEnv();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hawkeye.example");
    const m = await loadFresh();
    const calls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: RequestInfo | URL) => {
      calls.push(String(url));
      return Promise.resolve(new Response("<rss><item/></rss>", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await m.newsFetchRelayOnly("https://news.google.com/rss/search?q=x");
    expect(res).not.toBeNull();
    expect(await res!.text()).toContain("<rss>");
    // Every call went to the relay template, none to news.google.com directly.
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((u) => u.includes("/.netlify/edge-functions/fetch-relay"))).toBe(true);
  });

  it("returns null (never throws) when every relay fails", async () => {
    clearProxyEnv();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hawkeye.example");
    const m = await loadFresh();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("relay down")));
    const res = await m.newsFetchRelayOnly("https://news.google.com/rss/search?q=x");
    expect(res).toBeNull();
  });
});

describe("newsFetch slot lease + abort-aware queue", () => {
  it("force-releases a slot after the lease so a hung fetch can't pin the pool", async () => {
    clearProxyEnv();
    vi.stubEnv("NEWS_MAX_CONCURRENCY", "1");
    const m = await loadFresh();
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn()
        .mockImplementationOnce(() => new Promise<Response>(() => { /* hangs forever */ }))
        .mockImplementation(() => Promise.resolve(new Response("ok")));
      vi.stubGlobal("fetch", fetchMock);

      const hung = m.newsFetch("https://example.com/hang"); // takes the only slot, never settles
      void hung.catch(() => undefined);
      const queued = m.newsFetch("https://example.com/next"); // waits for a permit

      await vi.advanceTimersByTimeAsync(6_100); // lease ceiling fires → permit handed to the waiter
      const res = await queued;
      expect(res.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2); // the queued fetch genuinely ran
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a queued waiter with AbortError when its signal fires while waiting", async () => {
    clearProxyEnv();
    vi.stubEnv("NEWS_MAX_CONCURRENCY", "1");
    const m = await loadFresh();
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(() => { /* hangs */ }));
    vi.stubGlobal("fetch", fetchMock);

    const hung = m.newsFetch("https://example.com/hang");
    void hung.catch(() => undefined);

    const ac = new AbortController();
    const queued = m.newsFetch("https://example.com/queued", { signal: ac.signal });
    ac.abort();

    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // the aborted waiter never opened a socket
  });
});
