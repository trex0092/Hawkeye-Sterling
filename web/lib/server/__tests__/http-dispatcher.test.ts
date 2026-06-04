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
