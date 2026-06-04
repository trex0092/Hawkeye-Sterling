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

describe("newsFetch relay fallback", () => {
  function clearRelayEnv() {
    vi.stubEnv("NEWS_RELAY_ENABLED", "");
    vi.stubEnv("NEWS_RELAY_DISABLED", "");
    vi.stubEnv("NEWS_FETCH_RELAY", "");
  }

  it("is ON by default — the built-in public chain is active", async () => {
    clearProxyEnv();
    clearRelayEnv();
    const m = await loadFresh();
    const info = m.newsRelayInfo();
    expect(info.enabled).toBe(true);
    expect(info.count).toBeGreaterThanOrEqual(2);
  });

  it("can be turned off with NEWS_RELAY_DISABLED — a 403 is returned as-is, no relay call", async () => {
    clearProxyEnv();
    clearRelayEnv();
    vi.stubEnv("NEWS_RELAY_DISABLED", "1");
    const m = await loadFresh();
    expect(m.newsRelayInfo()).toEqual({ enabled: false, count: 0 });
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await m.newsFetch("https://news.example/feed", undefined, { allowRelay: true });
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no relay retry when disabled
  });

  it("also honours the legacy NEWS_RELAY_ENABLED=off kill-switch", async () => {
    clearProxyEnv();
    clearRelayEnv();
    vi.stubEnv("NEWS_RELAY_ENABLED", "off");
    const m = await loadFresh();
    expect(m.newsRelayInfo()).toEqual({ enabled: false, count: 0 });
  });

  it("retries through the relay on a 403 (default-on) when allowRelay is set", async () => {
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

  it("advances to the next relay when the first relay also fails", async () => {
    clearProxyEnv();
    clearRelayEnv();
    const m = await loadFresh();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 403 })) // direct
      .mockResolvedValueOnce(new Response("relay1 down", { status: 503 })) // relay 1
      .mockResolvedValueOnce(new Response("<rss>ok</rss>", { status: 200 })); // relay 2
    vi.stubGlobal("fetch", fetchMock);
    const res = await m.newsFetch("https://api.gdeltproject.org/x", undefined, { allowRelay: true });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT relay when allowRelay is unset, even with the relay enabled (API-key calls never relay)", async () => {
    clearProxyEnv();
    clearRelayEnv();
    const m = await loadFresh();
    const fetchMock = vi.fn().mockResolvedValue(new Response("blocked", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await m.newsFetch("https://newsapi.org/v2/everything?apiKey=secret");
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
