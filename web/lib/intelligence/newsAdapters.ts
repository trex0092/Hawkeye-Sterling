// Hawkeye Sterling — news / financial-data vendor adapters.
//
// Mirrors the pattern of liveAdapters.ts + commercialAdapters.ts:
//   - Free-tier providers (NewsAPI, MarketAux, GNews, Mediastack,
//     Currents) — env-gated by their respective free API keys
//   - Commercial-tier providers (Bloomberg, Factset, S&P Global,
//     ComplyAdvantage, Moody's Orbis) — env-gated by paid keys
//   - Refinitiv RDP / Reuters News WebSocket — env-gated by RDP creds
//
// Every adapter degrades to a NULL fallback when keys are absent so
// the surrounding code never has to branch on availability.

import { freeRssAdapter } from "./freeRssAggregator";
import { flagOn } from "./featureFlags";

const FETCH_TIMEOUT_MS = 12_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`adapter exceeded ${ms}ms`)), ms),
    ),
  ]);
}

// ── Audit DR-15: shared response-shape validator ─────────────────────────
//
// 25+ news adapters in this file each independently assume the upstream
// response shape (`{ articles: [...] }`, `{ data: [...] }`, etc.) and
// return `[]` when the field is missing. Adapter outages that look like
// "zero results" make schema drift indistinguishable from a quiet news
// day, starving downstream intelligence without alerting operators.
//
// This validator centralises the shape check + extraction. On schema
// drift it returns an empty array AND console.warns with the actual
// keys received so the adapter can be patched quickly.
//
// Track recent drift warnings per-provider so we only log each unique
// drift signature once per Lambda warm life — high-volume routes don't
// flood the log.
const _driftLogged = new Set<string>();
function validateNewsResponseArray<T>(
  provider: string,
  raw: unknown,
  accessor: (root: Record<string, unknown>) => unknown,
): T[] {
  // Some providers (Tiingo, certain RSS-derived feeds) return a bare
  // top-level array. The accessor doesn't apply — return as-is.
  if (Array.isArray(raw)) return raw as T[];
  if (!raw || typeof raw !== "object") {
    const sig = `${provider}:non-object`;
    if (!_driftLogged.has(sig)) {
      _driftLogged.add(sig);
      console.warn(`[${provider}] schema drift — response is ${typeof raw}, expected object or array`);
    }
    return [];
  }
  const root = raw as Record<string, unknown>;
  const value = accessor(root);
  if (value === undefined) {
    const keys = Object.keys(root).slice(0, 8).join(", ") || "(empty)";
    const sig = `${provider}:missing-array-key:${keys}`;
    if (!_driftLogged.has(sig)) {
      _driftLogged.add(sig);
      console.warn(`[${provider}] schema drift — expected array key missing; response keys: ${keys}`);
    }
    return [];
  }
  if (!Array.isArray(value)) {
    const sig = `${provider}:wrong-type:${typeof value}`;
    if (!_driftLogged.has(sig)) {
      _driftLogged.add(sig);
      console.warn(`[${provider}] schema drift — value is ${typeof value}, expected array`);
    }
    return [];
  }
  return value as T[];
}

export interface NewsArticle {
  source: string;             // provider id ("newsapi" | "marketaux" | etc.)
  outlet: string;             // domain / publisher
  title: string;
  url: string;
  publishedAt: string;        // ISO
  snippet?: string;
  sentiment?: number;         // -1..+1 when provider supplies it
  language?: string;
}

export interface NewsAdapter {
  isAvailable(): boolean;
  search(subjectName: string, opts?: { limit?: number; since?: string }): Promise<NewsArticle[]>;
}

export const NULL_NEWS_ADAPTER: NewsAdapter = {
  isAvailable: () => false,
  search: async () => [],
};

// ── NewsAPI.org — free tier 100 req/day ─────────────────────────────────
function newsApiAdapter(): NewsAdapter {
  const key = process.env["NEWSAPI_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}"`,
          pageSize: String(opts?.limit ?? 25),
          sortBy: "publishedAt",
          language: "en",
          apiKey: key,
          ...(opts?.since ? { from: opts.since } : {}),
        });
        const res = await abortable(fetch(`https://newsapi.org/v2/everything?${params.toString()}`));
        if (!res.ok) {
          console.warn(`[newsapi] HTTP ${res.status}`);
          return [];
        }
        const raw = await res.json();
        const articles = validateNewsResponseArray<{
          source?: { name?: string };
          title?: string;
          url?: string;
          publishedAt?: string;
          description?: string;
        }>("newsapi", raw, (r) => r["articles"]);
        return articles
          .filter((a) => a.title && a.url)
          .map((a) => ({
            source: "newsapi",
            outlet: a.source?.name ?? "unknown",
            title: a.title!,
            url: a.url!,
            publishedAt: a.publishedAt ?? new Date().toISOString(),
            ...(a.description ? { snippet: a.description } : {}),
            language: "en",
          } as NewsArticle));
      } catch (err) {
        console.warn("[newsapi] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── MarketAux — free tier 100 req/day, financial news + sentiment ───────
function marketAuxAdapter(): NewsAdapter {
  const key = process.env["MARKETAUX_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          api_token: key,
          search: subjectName,
          limit: String(opts?.limit ?? 25),
          sort: "published_at",
          ...(opts?.since ? { published_after: opts.since } : {}),
        });
        const res = await abortable(fetch(`https://api.marketaux.com/v1/news/all?${params.toString()}`));
        if (!res.ok) {
          console.warn(`[marketaux] HTTP ${res.status}`);
          return [];
        }
        const raw = await res.json();
        const articles = validateNewsResponseArray<{
          uuid?: string;
          source?: string;
          title?: string;
          url?: string;
          published_at?: string;
          description?: string;
          sentiment?: number;
          language?: string;
        }>("marketaux", raw, (r) => r["data"]);
        return articles
          .filter((a) => a.title && a.url)
          .map((a) => ({
            source: "marketaux",
            outlet: a.source ?? "unknown",
            title: a.title!,
            url: a.url!,
            publishedAt: a.published_at ?? new Date().toISOString(),
            ...(a.description ? { snippet: a.description } : {}),
            ...(typeof a.sentiment === "number" ? { sentiment: a.sentiment } : {}),
            ...(a.language ? { language: a.language } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[marketaux] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── GNews — free tier 100 req/day, Google News API ──────────────────────
function gNewsAdapter(): NewsAdapter {
  const key = process.env["GNEWS_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}"`,
          max: String(opts?.limit ?? 25),
          lang: "en",
          token: key,
          ...(opts?.since ? { from: opts.since } : {}),
        });
        const res = await abortable(fetch(`https://gnews.io/api/v4/search?${params.toString()}`));
        if (!res.ok) {
          console.warn(`[gnews] HTTP ${res.status}`);
          return [];
        }
        const raw = await res.json();
        const articles = validateNewsResponseArray<{
          source?: { name?: string };
          title?: string;
          url?: string;
          publishedAt?: string;
          description?: string;
        }>("gnews", raw, (r) => r["articles"]);
        return articles
          .filter((a) => a.title && a.url)
          .map((a) => ({
            source: "gnews",
            outlet: a.source?.name ?? "unknown",
            title: a.title!,
            url: a.url!,
            publishedAt: a.publishedAt ?? new Date().toISOString(),
            ...(a.description ? { snippet: a.description } : {}),
            language: "en",
          } as NewsArticle));
      } catch (err) {
        console.warn("[gnews] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Mediastack — free tier 500 req/month, multi-language ────────────────
function mediaStackAdapter(): NewsAdapter {
  const key = process.env["MEDIASTACK_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          access_key: key,
          keywords: subjectName,
          limit: String(opts?.limit ?? 25),
          sort: "published_desc",
          ...(opts?.since ? { date: `${opts.since},now` } : {}),
        });
        const res = await abortable(fetch(`http://api.mediastack.com/v1/news?${params.toString()}`));
        if (!res.ok) { console.warn(`[mediastack] HTTP ${res.status}`); return []; }
        const articles = validateNewsResponseArray<{
          source?: string;
          title?: string;
          url?: string;
          published_at?: string;
          description?: string;
          language?: string;
        }>("mediastack", await res.json(), (r) => r["data"]);
        return articles
          .filter((a) => a.title && a.url)
          .map((a) => ({
            source: "mediastack",
            outlet: a.source ?? "unknown",
            title: a.title!,
            url: a.url!,
            publishedAt: a.published_at ?? new Date().toISOString(),
            ...(a.description ? { snippet: a.description } : {}),
            ...(a.language ? { language: a.language } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[mediastack] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Currents API — free tier unlimited ──────────────────────────────────
function currentsAdapter(): NewsAdapter {
  const key = process.env["CURRENTS_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          apiKey: key,
          keywords: subjectName,
          page_size: String(opts?.limit ?? 25),
          language: "en",
        });
        const res = await abortable(fetch(`https://api.currentsapi.services/v1/search?${params.toString()}`));
        if (!res.ok) { console.warn(`[currents] HTTP ${res.status}`); return []; }
        const articles = validateNewsResponseArray<{
          title?: string;
          url?: string;
          published?: string;
          description?: string;
          language?: string;
          domain?: string;
        }>("currents", await res.json(), (r) => r["news"]);
        return articles
          .filter((a) => a.title && a.url)
          .map((a) => ({
            source: "currents",
            outlet: a.domain ?? "unknown",
            title: a.title!,
            url: a.url!,
            publishedAt: a.published ?? new Date().toISOString(),
            ...(a.description ? { snippet: a.description } : {}),
            ...(a.language ? { language: a.language } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[currents] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── NewsCatcher — free tier 50 req/day ──────────────────────────────────
function newsCatcherAdapter(): NewsAdapter {
  const key = process.env["NEWSCATCHER_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: subjectName,
          page_size: String(opts?.limit ?? 25),
          lang: "en",
          sort_by: "date",
        });
        const res = await abortable(
          fetch(`https://api.newscatcherapi.com/v2/search?${params.toString()}`, {
            headers: { "x-api-key": key },
          }),
        );
        if (!res.ok) { console.warn(`[newscatcher] HTTP ${res.status}`); return []; }
        const articles = validateNewsResponseArray<{
          clean_url?: string;
          title?: string;
          link?: string;
          published_date?: string;
          excerpt?: string;
          language?: string;
        }>("newscatcher", await res.json(), (r) => r["articles"]);
        return articles
          .filter((a) => a.title && a.link)
          .map((a) => ({
            source: "newscatcher",
            outlet: a.clean_url ?? "unknown",
            title: a.title!,
            url: a.link!,
            publishedAt: a.published_date ?? new Date().toISOString(),
            ...(a.excerpt ? { snippet: a.excerpt } : {}),
            ...(a.language ? { language: a.language } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[newscatcher] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Reuters News (Refinitiv RDP) — premium WebSocket / REST ─────────────
// Authenticates via RDP password grant, then fetches news headlines via
// the News REST endpoint (simpler than the WebSocket for our pull model).
// Operator must set RDP_USERNAME + RDP_PASSWORD + RDP_APP_KEY.
function reutersAdapter(): NewsAdapter {
  const usernameEnv = process.env["RDP_USERNAME"];
  const passwordEnv = process.env["RDP_PASSWORD"];
  const appKeyEnv = process.env["RDP_APP_KEY"];
  if (!usernameEnv || !passwordEnv || !appKeyEnv) return NULL_NEWS_ADAPTER;
  const username: string = usernameEnv;
  const password: string = passwordEnv;
  const appKey: string = appKeyEnv;

  let cachedToken: { token: string; expiresAt: number } | null = null;

  async function getToken(): Promise<string | null> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
    try {
      const res = await abortable(
        fetch("https://api.refinitiv.com/auth/oauth2/v1/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "password",
            username, password, client_id: appKey, scope: "trapi",
            takeExclusiveSignOnControl: "true",
          }).toString(),
        }),
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!json.access_token) return null;
      cachedToken = {
        token: json.access_token,
        expiresAt: Date.now() + (json.expires_in ?? 600) * 1000,
      };
      return cachedToken.token;
    } catch (err) {
      console.warn("[reuters] auth failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      const token = await getToken();
      if (!token) return [];
      try {
        const params = new URLSearchParams({
          query: subjectName,
          limit: String(opts?.limit ?? 25),
        });
        const res = await abortable(
          fetch(`https://api.refinitiv.com/data/news/v1/headlines?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{
            storyId?: string;
            headline?: string;
            firstCreated?: string;
            sourceName?: string;
            language?: string;
          }>;
        };
        return (json.data ?? [])
          .filter((a) => a.headline)
          .map((a) => ({
            source: "reuters-rdp",
            outlet: a.sourceName ?? "Reuters",
            title: a.headline!,
            url: `https://refinitiv.com/news/${a.storyId ?? ""}`,
            publishedAt: a.firstCreated ?? new Date().toISOString(),
            ...(a.language ? { language: a.language } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[reuters] news failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── ComplyAdvantage — Refinitiv-class screening alternative ─────────────
// Sanctions / PEP / adverse-media + ongoing monitoring. Single API.
function complyAdvantageAdapter(): NewsAdapter {
  const key = process.env["COMPLYADVANTAGE_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const res = await abortable(
          fetch("https://api.complyadvantage.com/searches", {
            method: "POST",
            headers: { Authorization: `Token ${key}`, "content-type": "application/json" },
            body: JSON.stringify({
              search_term: subjectName,
              fuzziness: 0.6,
              limit: opts?.limit ?? 25,
              filters: { types: ["adverse-media"] },
            }),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          content?: { data?: { hits?: Array<{ doc?: { name?: string; sources?: string[]; media?: Array<{ url?: string; title?: string; date?: string }> } }> } };
        };
        const articles: NewsArticle[] = [];
        for (const hit of json.content?.data?.hits ?? []) {
          for (const m of hit.doc?.media ?? []) {
            if (!m.title || !m.url) continue;
            articles.push({
              source: "complyadvantage",
              outlet: hit.doc?.sources?.[0] ?? "ComplyAdvantage",
              title: m.title,
              url: m.url,
              publishedAt: m.date ?? new Date().toISOString(),
            });
          }
        }
        return articles;
      } catch (err) {
        console.warn("[complyadvantage] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Bloomberg / Factset / S&P / Moody's / IHS — paid — stubs ────────────
// These vendors don't expose public free APIs and require enterprise
// contracts + signed data agreements. We declare the env-key shape so
// when a customer drops credentials in, the wrapper lights up.
function bloombergAdapter(): NewsAdapter {
  const key = process.env["BLOOMBERG_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  // Bloomberg B-PIPE / Bloomberg Open — requires Bloomberg Terminal SAPI.
  // No public REST endpoint — would require a Bloomberg server-side proxy.
  return NULL_NEWS_ADAPTER;
}

function factsetAdapter(): NewsAdapter {
  const username = process.env["FACTSET_USERNAME"];
  const apiKey = process.env["FACTSET_API_KEY"];
  if (!username || !apiKey) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const auth = Buffer.from(`${username}:${apiKey}`).toString("base64");
        const params = new URLSearchParams({
          q: subjectName,
          paginationLimit: String(opts?.limit ?? 25),
        });
        const res = await abortable(
          fetch(`https://api.factset.com/news/v1/news-search?${params.toString()}`, {
            headers: { Authorization: `Basic ${auth}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{ headline?: string; url?: string; publicationDateTime?: string; provider?: string }>;
        };
        return (json.data ?? [])
          .filter((a) => a.headline && a.url)
          .map((a) => ({
            source: "factset",
            outlet: a.provider ?? "FactSet",
            title: a.headline!,
            url: a.url!,
            publishedAt: a.publicationDateTime ?? new Date().toISOString(),
          } as NewsArticle));
      } catch (err) {
        console.warn("[factset] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

function spGlobalAdapter(): NewsAdapter {
  const key = process.env["SPGLOBAL_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const res = await abortable(
          fetch("https://api.spglobal.com/news/v1/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({ query: subjectName, limit: opts?.limit ?? 25 }),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ headline?: string; storyUrl?: string; publishedAt?: string; source?: string }>;
        };
        return (json.results ?? [])
          .filter((a) => a.headline && a.storyUrl)
          .map((a) => ({
            source: "spglobal",
            outlet: a.source ?? "S&P Global",
            title: a.headline!,
            url: a.storyUrl!,
            publishedAt: a.publishedAt ?? new Date().toISOString(),
          } as NewsArticle));
      } catch (err) {
        console.warn("[spglobal] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

function moodysOrbisAdapter(): NewsAdapter {
  const key = process.env["MOODYS_ORBIS_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (_subjectName, _opts) => {
      void _opts;
      // Moody's Orbis is corporate registry data, not news — return empty.
      // Placeholder so the env key gates correctly. Real integration would
      // route to /api/orbis with company-search payload.
      return [];
    },
  };
}

// ── The Guardian Open Platform — free tier ─────────────────────────────
function guardianAdapter(): NewsAdapter {
  const key = process.env["GUARDIAN_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}"`,
          "page-size": String(opts?.limit ?? 25),
          "show-fields": "trailText",
          "order-by": "newest",
          "api-key": key,
        });
        const res = await abortable(
          fetch(`https://content.guardianapis.com/search?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          response?: { results?: Array<{ webTitle?: string; webUrl?: string; webPublicationDate?: string; fields?: { trailText?: string } }> };
        };
        return (json.response?.results ?? [])
          .filter((a) => a.webUrl && a.webTitle)
          .map((a) => ({
            source: "guardian",
            outlet: "theguardian.com",
            title: a.webTitle!,
            url: a.webUrl!,
            publishedAt: a.webPublicationDate ?? new Date().toISOString(),
            ...(a.fields?.trailText ? { snippet: a.fields.trailText } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[guardian] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── New York Times Article Search — free tier ──────────────────────────
function nytAdapter(): NewsAdapter {
  const key = process.env["NYT_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, _opts) => {
      void _opts;
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}"`,
          sort: "newest",
          "api-key": key,
        });
        const res = await abortable(
          fetch(`https://api.nytimes.com/svc/search/v2/articlesearch.json?${params.toString()}`),
        );
        if (!res.ok) { console.warn(`[nyt] HTTP ${res.status}`); return []; }
        const docs = validateNewsResponseArray<{
          headline?: { main?: string };
          web_url?: string;
          pub_date?: string;
          abstract?: string;
          source?: string;
        }>("nyt", await res.json(), (r) => {
          const resp = r["response"];
          return resp && typeof resp === "object" ? (resp as Record<string, unknown>)["docs"] : undefined;
        });
        return docs
          .filter((d) => d.web_url && d.headline?.main)
          .map((d) => ({
            source: "nyt",
            outlet: d.source ?? "nytimes.com",
            title: d.headline!.main!,
            url: d.web_url!,
            publishedAt: d.pub_date ?? new Date().toISOString(),
            ...(d.abstract ? { snippet: d.abstract } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[nyt] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Aylien News API — premium ──────────────────────────────────────────
function aylienAdapter(): NewsAdapter {
  const appId = process.env["AYLIEN_APP_ID"];
  const apiKey = process.env["AYLIEN_API_KEY"];
  if (!appId || !apiKey) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          title: `"${subjectName}"`,
          per_page: String(opts?.limit ?? 25),
          sort_by: "published_at",
          language: "en",
        });
        const res = await abortable(
          fetch(`https://api.aylien.com/news/stories?${params.toString()}`, {
            headers: {
              "X-AYLIEN-NewsAPI-Application-ID": appId,
              "X-AYLIEN-NewsAPI-Application-Key": apiKey,
              accept: "application/json",
            },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          stories?: Array<{ id?: number; title?: string; links?: { permalink?: string }; published_at?: string; summary?: { sentences?: string[] }; source?: { name?: string; domain?: string }; sentiment?: { title?: { polarity?: string; score?: number } } }>;
        };
        return (json.stories ?? [])
          .filter((s) => s.title && s.links?.permalink)
          .map((s) => ({
            source: "aylien",
            outlet: s.source?.domain ?? s.source?.name ?? "aylien",
            title: s.title!,
            url: s.links!.permalink!,
            publishedAt: s.published_at ?? new Date().toISOString(),
            ...(s.summary?.sentences?.[0] ? { snippet: s.summary.sentences[0] } : {}),
            ...(typeof s.sentiment?.title?.score === "number" ? { sentiment: s.sentiment.title.score } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[aylien] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Webz.io (Webhose) — premium ────────────────────────────────────────
function webzAdapter(): NewsAdapter {
  const key = process.env["WEBZ_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          token: key,
          q: `"${subjectName}" language:english`,
          size: String(opts?.limit ?? 25),
        });
        const res = await abortable(
          fetch(`https://api.webz.io/newsApiLite?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          posts?: Array<{ title?: string; url?: string; published?: string; text?: string; thread?: { site?: string; site_full?: string } }>;
        };
        return (json.posts ?? [])
          .filter((p) => p.title && p.url)
          .map((p) => ({
            source: "webz",
            outlet: p.thread?.site ?? p.thread?.site_full ?? "webz.io",
            title: p.title!,
            url: p.url!,
            publishedAt: p.published ?? new Date().toISOString(),
            ...(p.text ? { snippet: p.text.slice(0, 240) } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[webz] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Event Registry / NewsAPI.ai — premium ──────────────────────────────
function eventRegistryAdapter(): NewsAdapter {
  const key = process.env["EVENTREGISTRY_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = {
          action: "getArticles",
          keyword: subjectName,
          articlesSortBy: "date",
          articlesCount: opts?.limit ?? 25,
          lang: "eng",
          apiKey: key,
        };
        const res = await abortable(
          fetch("https://eventregistry.org/api/v1/article/getArticles", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          articles?: { results?: Array<{ title?: string; url?: string; dateTime?: string; body?: string; source?: { uri?: string; title?: string }; sentiment?: number }> };
        };
        return (json.articles?.results ?? [])
          .filter((a) => a.title && a.url)
          .map((a) => ({
            source: "eventregistry",
            outlet: a.source?.uri ?? a.source?.title ?? "eventregistry",
            title: a.title!,
            url: a.url!,
            publishedAt: a.dateTime ?? new Date().toISOString(),
            ...(a.body ? { snippet: a.body.slice(0, 240) } : {}),
            ...(typeof a.sentiment === "number" ? { sentiment: a.sentiment } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[eventregistry] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Polygon.io news — premium (also financial data) ────────────────────
function polygonAdapter(): NewsAdapter {
  const key = process.env["POLYGON_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          "ticker.any_of": subjectName,
          limit: String(opts?.limit ?? 25),
          order: "desc",
          sort: "published_utc",
          apiKey: key,
        });
        const res = await abortable(
          fetch(`https://api.polygon.io/v2/reference/news?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ id?: string; title?: string; article_url?: string; published_utc?: string; description?: string; publisher?: { name?: string; homepage_url?: string } }>;
        };
        return (json.results ?? [])
          .filter((a) => a.title && a.article_url)
          .map((a) => ({
            source: "polygon",
            outlet: a.publisher?.name ?? a.publisher?.homepage_url ?? "polygon.io",
            title: a.title!,
            url: a.article_url!,
            publishedAt: a.published_utc ?? new Date().toISOString(),
            ...(a.description ? { snippet: a.description } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[polygon] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Tiingo News — premium ──────────────────────────────────────────────
function tiingoAdapter(): NewsAdapter {
  const key = process.env["TIINGO_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          tickers: subjectName,
          limit: String(opts?.limit ?? 25),
          sortBy: "publishedDate",
          token: key,
        });
        const res = await abortable(
          fetch(`https://api.tiingo.com/tiingo/news?${params.toString()}`, {
            headers: { accept: "application/json" },
          }),
        );
        if (!res.ok) { console.warn(`[tiingo] HTTP ${res.status}`); return []; }
        // Tiingo returns a bare top-level array — validator handles that path.
        const items = validateNewsResponseArray<{
          id?: number; title?: string; url?: string; publishedDate?: string; description?: string; source?: string;
        }>("tiingo", await res.json(), () => undefined);
        return items
          .filter((a) => a.title && a.url)
          .map((a) => ({
            source: "tiingo",
            outlet: a.source ?? "tiingo",
            title: a.title!,
            url: a.url!,
            publishedAt: a.publishedDate ?? new Date().toISOString(),
            ...(a.description ? { snippet: a.description } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[tiingo] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── AP News API — premium ──────────────────────────────────────────────
function apNewsAdapter(): NewsAdapter {
  const key = process.env["AP_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}"`,
          page_size: String(opts?.limit ?? 25),
          sort: "date",
          apikey: key,
        });
        const res = await abortable(
          fetch(`https://api.ap.org/media/v/content/search?${params.toString()}`, {
            headers: { accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: { items?: Array<{ item?: { headline?: string; firstcreated?: string; uri?: string; description_summary?: string } }> };
        };
        return (json.data?.items ?? [])
          .map((i) => i.item)
          .filter((it): it is NonNullable<typeof it> => !!it?.headline && !!it.uri)
          .map((it) => ({
            source: "ap",
            outlet: "apnews.com",
            title: it.headline!,
            url: it.uri!,
            publishedAt: it.firstcreated ?? new Date().toISOString(),
            ...(it.description_summary ? { snippet: it.description_summary } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[ap] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── BBC News (via key-gated proxy / Trusted Partner) ──────────────────
function bbcNewsAdapter(): NewsAdapter {
  const key = process.env["BBC_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}"`,
          size: String(opts?.limit ?? 25),
          api_key: key,
        });
        const res = await abortable(
          fetch(`https://api.bbc.co.uk/news/search?${params.toString()}`, {
            headers: { accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ headline?: string; url?: string; firstPublished?: string; summary?: string }>;
        };
        return (json.results ?? [])
          .filter((r) => r.headline && r.url)
          .map((r) => ({
            source: "bbc",
            outlet: "bbc.co.uk",
            title: r.headline!,
            url: r.url!,
            publishedAt: r.firstPublished ?? new Date().toISOString(),
            ...(r.summary ? { snippet: r.summary } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[bbc] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── NewsData.io — free key tier ────────────────────────────────────────
function newsDataAdapter(): NewsAdapter {
  const key = process.env["NEWSDATA_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          apikey: key,
          q: `"${subjectName}"`,
          language: "en",
          size: String(Math.min(50, opts?.limit ?? 25)),
        });
        const res = await abortable(
          fetch(`https://newsdata.io/api/1/news?${params.toString()}`),
        );
        if (!res.ok) { console.warn(`[newsdata] HTTP ${res.status}`); return []; }
        const results = validateNewsResponseArray<{
          title?: string;
          link?: string;
          pubDate?: string;
          description?: string;
          source_id?: string;
        }>("newsdata", await res.json(), (r) => r["results"]);
        return results
          .filter((r) => r.title && r.link)
          .map((r) => ({
            source: "newsdata",
            outlet: r.source_id ?? "newsdata.io",
            title: r.title!,
            url: r.link!,
            publishedAt: r.pubDate ?? new Date().toISOString(),
            ...(r.description ? { snippet: r.description } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[newsdata] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── WorldNewsAPI — free key tier ───────────────────────────────────────
function worldNewsAdapter(): NewsAdapter {
  const key = process.env["WORLDNEWS_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          text: `"${subjectName}"`,
          number: String(opts?.limit ?? 25),
          "api-key": key,
          "language": "en",
          "sort": "publish-time",
          "sort-direction": "desc",
        });
        const res = await abortable(
          fetch(`https://api.worldnewsapi.com/search-news?${params.toString()}`),
        );
        if (!res.ok) { console.warn(`[worldnews] HTTP ${res.status}`); return []; }
        const news = validateNewsResponseArray<{
          title?: string; url?: string; publish_date?: string; text?: string; source_country?: string; sentiment?: number;
        }>("worldnews", await res.json(), (r) => r["news"]);
        return news
          .filter((n) => n.title && n.url)
          .map((n) => ({
            source: "worldnews",
            outlet: n.source_country ?? "worldnewsapi",
            title: n.title!,
            url: n.url!,
            publishedAt: n.publish_date ?? new Date().toISOString(),
            ...(n.text ? { snippet: n.text.slice(0, 240) } : {}),
            ...(typeof n.sentiment === "number" ? { sentiment: n.sentiment } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[worldnews] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── AlphaVantage News & Sentiment — free key tier ─────────────────────
function alphaVantageAdapter(): NewsAdapter {
  const key = process.env["ALPHAVANTAGE_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          function: "NEWS_SENTIMENT",
          tickers: subjectName,
          limit: String(opts?.limit ?? 25),
          apikey: key,
        });
        const res = await abortable(
          fetch(`https://www.alphavantage.co/query?${params.toString()}`),
        );
        if (!res.ok) { console.warn(`[alphavantage] HTTP ${res.status}`); return []; }
        const feed = validateNewsResponseArray<{
          title?: string; url?: string; time_published?: string; summary?: string; source?: string; overall_sentiment_score?: number;
        }>("alphavantage", await res.json(), (r) => r["feed"]);
        return feed
          .filter((f) => f.title && f.url)
          .map((f) => ({
            source: "alphavantage",
            outlet: f.source ?? "alphavantage",
            title: f.title!,
            url: f.url!,
            publishedAt: f.time_published ? toIso(f.time_published) : new Date().toISOString(),
            ...(f.summary ? { snippet: f.summary } : {}),
            ...(typeof f.overall_sentiment_score === "number" ? { sentiment: f.overall_sentiment_score } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[alphavantage] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// AlphaVantage publishes time as "20240501T120000"
function toIso(av: string): string {
  const m = av.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : av;
}

// ── SerpAPI Google News — premium ──────────────────────────────────────
function serpApiAdapter(): NewsAdapter {
  const key = process.env["SERPAPI_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          engine: "google_news",
          q: `"${subjectName}"`,
          num: String(opts?.limit ?? 25),
          api_key: key,
        });
        const res = await abortable(
          fetch(`https://serpapi.com/search.json?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          news_results?: Array<{ title?: string; link?: string; date?: string; snippet?: string; source?: { name?: string } }>;
        };
        return (json.news_results ?? [])
          .filter((n) => n.title && n.link)
          .map((n) => ({
            source: "serpapi-googlenews",
            outlet: n.source?.name ?? "google-news",
            title: n.title!,
            url: n.link!,
            publishedAt: n.date ?? new Date().toISOString(),
            ...(n.snippet ? { snippet: n.snippet } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[serpapi] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Diffbot Knowledge Graph — premium ─────────────────────────────────
function diffbotAdapter(): NewsAdapter {
  const key = process.env["DIFFBOT_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const query = `type:Article text:"${subjectName}" sortBy:date`;
        const params = new URLSearchParams({
          token: key,
          query,
          size: String(opts?.limit ?? 25),
        });
        const res = await abortable(
          fetch(`https://kg.diffbot.com/kg/v3/dql?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{ title?: string; pageUrl?: string; date?: { str?: string }; text?: string; siteName?: string; sentiment?: number }>;
        };
        return (json.data ?? [])
          .filter((d) => d.title && d.pageUrl)
          .map((d) => ({
            source: "diffbot",
            outlet: d.siteName ?? "diffbot",
            title: d.title!,
            url: d.pageUrl!,
            publishedAt: d.date?.str ?? new Date().toISOString(),
            ...(d.text ? { snippet: d.text.slice(0, 240) } : {}),
            ...(typeof d.sentiment === "number" ? { sentiment: d.sentiment } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[diffbot] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Meltwater — premium (enterprise) ──────────────────────────────────
function meltwaterAdapter(): NewsAdapter {
  const key = process.env["MELTWATER_API_KEY"];
  const userKey = process.env["MELTWATER_USER_KEY"];
  if (!key || !userKey) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = {
          query: { search: { keyword: `"${subjectName}"` } },
          tz: "UTC",
          page_size: opts?.limit ?? 25,
        };
        const res = await abortable(
          fetch("https://api.meltwater.com/v3/search/articles", {
            method: "POST",
            headers: {
              authorization: `Bearer ${key}`,
              "x-user-key": userKey,
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          articles?: Array<{ headline?: string; url?: string; publish_date?: string; opening_text?: string; source?: { name?: string }; sentiment?: { value?: number } }>;
        };
        return (json.articles ?? [])
          .filter((a) => a.headline && a.url)
          .map((a) => ({
            source: "meltwater",
            outlet: a.source?.name ?? "meltwater",
            title: a.headline!,
            url: a.url!,
            publishedAt: a.publish_date ?? new Date().toISOString(),
            ...(a.opening_text ? { snippet: a.opening_text } : {}),
            ...(typeof a.sentiment?.value === "number" ? { sentiment: a.sentiment.value } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[meltwater] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Signal AI — premium (enterprise reputation/risk monitoring) ───────
function signalAiAdapter(): NewsAdapter {
  const key = process.env["SIGNALAI_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = { query: subjectName, size: opts?.limit ?? 25 };
        const res = await abortable(
          fetch("https://api.signal-ai.com/v1/articles/search", {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ title?: string; url?: string; publishedAt?: string; summary?: string; outlet?: { name?: string }; sentiment?: number }>;
        };
        return (json.results ?? [])
          .filter((r) => r.title && r.url)
          .map((r) => ({
            source: "signal-ai",
            outlet: r.outlet?.name ?? "signal-ai",
            title: r.title!,
            url: r.url!,
            publishedAt: r.publishedAt ?? new Date().toISOString(),
            ...(r.summary ? { snippet: r.summary } : {}),
            ...(typeof r.sentiment === "number" ? { sentiment: r.sentiment } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[signal-ai] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Dow Jones Factiva (DNA platform) — premium ────────────────────────
function factivaAdapter(): NewsAdapter {
  const userId = process.env["FACTIVA_USER_ID"];
  const password = process.env["FACTIVA_PASSWORD"];
  const clientId = process.env["FACTIVA_CLIENT_ID"];
  if (!userId || !password || !clientId) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = {
          query: { searchString: `"${subjectName}"`, languageCodes: ["en"] },
          formatting: { isReturnHeadline: true, isReturnSnippet: true, sortOrder: "PublicationDateChronological" },
          paging: { offset: 0, limit: opts?.limit ?? 25 },
        };
        const res = await abortable(
          fetch("https://api.dowjones.com/content/search", {
            method: "POST",
            headers: {
              "X-API-VERSION": "3.0",
              "user-id": userId,
              password,
              "client-id": clientId,
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{ attributes?: { headline?: { main?: string }; webUrl?: string; publicationDate?: string; snippet?: { content?: string }; sourceName?: string } }>;
        };
        return (json.data ?? [])
          .map((d) => d.attributes)
          .filter((a): a is NonNullable<typeof a> => !!a?.headline?.main && !!a.webUrl)
          .map((a) => ({
            source: "factiva",
            outlet: a.sourceName ?? "factiva",
            title: a.headline!.main!,
            url: a.webUrl!,
            publishedAt: a.publicationDate ?? new Date().toISOString(),
            ...(a.snippet?.content ? { snippet: a.snippet.content } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[factiva] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── LexisNexis Newsdesk — premium ─────────────────────────────────────
function lexisNexisNewsdeskAdapter(): NewsAdapter {
  const key = process.env["LEXISNEXIS_NEWSDESK_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          query: `"${subjectName}"`,
          limit: String(opts?.limit ?? 25),
          sort: "publishedAt:desc",
        });
        const res = await abortable(
          fetch(`https://api.newsdesk.lexisnexis.com/v1/articles?${params.toString()}`, {
            headers: { authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          articles?: Array<{ title?: string; url?: string; publishedAt?: string; excerpt?: string; sourceName?: string; sentiment?: number }>;
        };
        return (json.articles ?? [])
          .filter((a) => a.title && a.url)
          .map((a) => ({
            source: "lexisnexis-newsdesk",
            outlet: a.sourceName ?? "lexisnexis",
            title: a.title!,
            url: a.url!,
            publishedAt: a.publishedAt ?? new Date().toISOString(),
            ...(a.excerpt ? { snippet: a.excerpt } : {}),
            ...(typeof a.sentiment === "number" ? { sentiment: a.sentiment } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[lexisnexis-newsdesk] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Cision PR Newswire — premium ─────────────────────────────────────
function cisionAdapter(): NewsAdapter {
  const key = process.env["CISION_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}"`,
          pageSize: String(opts?.limit ?? 25),
          sort: "date_desc",
        });
        const res = await abortable(
          fetch(`https://api.cision.com/v1/articles?${params.toString()}`, {
            headers: { "x-api-key": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          items?: Array<{ headline?: string; url?: string; publishDate?: string; teaser?: string; outlet?: string; toneScore?: number }>;
        };
        return (json.items ?? [])
          .filter((i) => i.headline && i.url)
          .map((i) => ({
            source: "cision",
            outlet: i.outlet ?? "cision",
            title: i.headline!,
            url: i.url!,
            publishedAt: i.publishDate ?? new Date().toISOString(),
            ...(i.teaser ? { snippet: i.teaser } : {}),
            ...(typeof i.toneScore === "number" ? { sentiment: i.toneScore } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[cision] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── AlphaSense — premium financial intelligence ───────────────────────
function alphaSenseAdapter(): NewsAdapter {
  const key = process.env["ALPHASENSE_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = { query: subjectName, size: opts?.limit ?? 25, contentType: "news" };
        const res = await abortable(
          fetch("https://api.alpha-sense.com/v1/search", {
            method: "POST",
            headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ title?: string; url?: string; publishedAt?: string; summary?: string; source?: string; sentiment?: number }>;
        };
        return (json.results ?? [])
          .filter((r) => r.title && r.url)
          .map((r) => ({
            source: "alphasense",
            outlet: r.source ?? "alphasense",
            title: r.title!,
            url: r.url!,
            publishedAt: r.publishedAt ?? new Date().toISOString(),
            ...(r.summary ? { snippet: r.summary } : {}),
            ...(typeof r.sentiment === "number" ? { sentiment: r.sentiment } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[alphasense] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Quid (NetBase Quid) — premium narrative intelligence ──────────────
function quidAdapter(): NewsAdapter {
  const key = process.env["QUID_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = { query: { keyword: subjectName }, size: opts?.limit ?? 25, sort: "newest" };
        const res = await abortable(
          fetch("https://api.quid.com/v3/news/search", {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          documents?: Array<{ title?: string; url?: string; publishedAt?: string; description?: string; source?: { name?: string }; sentiment?: number }>;
        };
        return (json.documents ?? [])
          .filter((d) => d.title && d.url)
          .map((d) => ({
            source: "quid",
            outlet: d.source?.name ?? "quid",
            title: d.title!,
            url: d.url!,
            publishedAt: d.publishedAt ?? new Date().toISOString(),
            ...(d.description ? { snippet: d.description } : {}),
            ...(typeof d.sentiment === "number" ? { sentiment: d.sentiment } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[quid] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Brandwatch — premium consumer/risk intelligence ───────────────────
function brandwatchAdapter(): NewsAdapter {
  const key = process.env["BRANDWATCH_API_KEY"];
  const projectId = process.env["BRANDWATCH_PROJECT_ID"];
  if (!key || !projectId) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          queryString: `"${subjectName}"`,
          pageSize: String(opts?.limit ?? 25),
          orderBy: "date",
          orderDirection: "desc",
        });
        const res = await abortable(
          fetch(`https://api.brandwatch.com/projects/${projectId}/data/mentions?${params.toString()}`, {
            headers: { authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ title?: string; url?: string; date?: string; snippet?: string; pageType?: string; sentiment?: string }>;
        };
        return (json.results ?? [])
          .filter((r) => r.title && r.url)
          .map((r) => ({
            source: "brandwatch",
            outlet: r.pageType ?? "brandwatch",
            title: r.title!,
            url: r.url!,
            publishedAt: r.date ?? new Date().toISOString(),
            ...(r.snippet ? { snippet: r.snippet } : {}),
            ...(r.sentiment === "positive" ? { sentiment: 0.5 } : r.sentiment === "negative" ? { sentiment: -0.5 } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[brandwatch] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Talkwalker — premium social/news listening ────────────────────────
function talkwalkerAdapter(): NewsAdapter {
  const key = process.env["TALKWALKER_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = { query: `"${subjectName}"`, size: opts?.limit ?? 25, sort_by: "date", sort_order: "desc" };
        const res = await abortable(
          fetch("https://api.talkwalker.com/api/v1/search", {
            method: "POST",
            headers: { "x-tw-api-key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          result?: { documents?: Array<{ title?: string; url?: string; published?: string; content?: string; source_name?: string; sentiment?: number }> };
        };
        return (json.result?.documents ?? [])
          .filter((d) => d.title && d.url)
          .map((d) => ({
            source: "talkwalker",
            outlet: d.source_name ?? "talkwalker",
            title: d.title!,
            url: d.url!,
            publishedAt: d.published ?? new Date().toISOString(),
            ...(d.content ? { snippet: d.content.slice(0, 240) } : {}),
            ...(typeof d.sentiment === "number" ? { sentiment: d.sentiment } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[talkwalker] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Dataminr — premium real-time alerts ───────────────────────────────
function dataminrAdapter(): NewsAdapter {
  const cidEnv = process.env["DATAMINR_CLIENT_ID"];
  const csEnv = process.env["DATAMINR_CLIENT_SECRET"];
  if (!cidEnv || !csEnv) return NULL_NEWS_ADAPTER;
  const clientId: string = cidEnv;
  const clientSecret: string = csEnv;
  let cachedToken: { token: string; expiresAt: number } | null = null;
  async function getToken(): Promise<string | null> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
    try {
      const res = await abortable(
        fetch("https://gateway.dataminr.com/auth/2/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "api_key", client_id: clientId, client_secret: clientSecret }).toString(),
        }),
      );
      if (!res.ok) return null;
      const j = (await res.json()) as { dmaToken?: string; expire?: number };
      if (!j.dmaToken) return null;
      cachedToken = { token: j.dmaToken, expiresAt: (j.expire ?? Date.now() / 1000 + 600) * 1000 };
      return cachedToken.token;
    } catch {
      return null;
    }
  }
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      const token = await getToken();
      if (!token) return [];
      try {
        const params = new URLSearchParams({ query: `"${subjectName}"`, num: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://gateway.dataminr.com/api/3/alerts?${params.toString()}`, {
            headers: { authorization: `Dmauth ${token}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: { alerts?: Array<{ caption?: string; expandAlertURL?: string; eventTime?: number; categories?: Array<{ name?: string }>; source?: { displayName?: string } }> };
        };
        return (json.data?.alerts ?? [])
          .filter((a) => a.caption && a.expandAlertURL)
          .map((a) => ({
            source: "dataminr",
            outlet: a.source?.displayName ?? "dataminr",
            title: a.caption!,
            url: a.expandAlertURL!,
            publishedAt: a.eventTime ? new Date(a.eventTime).toISOString() : new Date().toISOString(),
          } as NewsArticle));
      } catch (err) {
        console.warn("[dataminr] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Zignal Labs — premium narrative-risk monitoring ───────────────────
function zignalAdapter(): NewsAdapter {
  const key = process.env["ZIGNAL_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = { search: `"${subjectName}"`, size: opts?.limit ?? 25, sort: { time: "desc" } };
        const res = await abortable(
          fetch("https://api.zignallabs.com/v1/stories/search", {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          hits?: Array<{ title?: string; link?: string; published_at?: string; summary?: string; outlet?: { name?: string }; sentiment?: number }>;
        };
        return (json.hits ?? [])
          .filter((h) => h.title && h.link)
          .map((h) => ({
            source: "zignal",
            outlet: h.outlet?.name ?? "zignal",
            title: h.title!,
            url: h.link!,
            publishedAt: h.published_at ?? new Date().toISOString(),
            ...(h.summary ? { snippet: h.summary } : {}),
            ...(typeof h.sentiment === "number" ? { sentiment: h.sentiment } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[zignal] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── ContextualWeb (RapidAPI) — free / paid tiers ──────────────────────
function contextualWebAdapter(): NewsAdapter {
  const key = process.env["CONTEXTUALWEB_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}"`,
          pageNumber: "1",
          pageSize: String(opts?.limit ?? 25),
          autoCorrect: "true",
          fromPublishedDate: "",
          toPublishedDate: "",
        });
        const res = await abortable(
          fetch(`https://contextualwebsearch-websearch-v1.p.rapidapi.com/api/Search/NewsSearchAPI?${params.toString()}`, {
            headers: { "x-rapidapi-key": key, "x-rapidapi-host": "contextualwebsearch-websearch-v1.p.rapidapi.com" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          value?: Array<{ title?: string; url?: string; datePublished?: string; description?: string; provider?: { name?: string } }>;
        };
        return (json.value ?? [])
          .filter((v) => v.title && v.url)
          .map((v) => ({
            source: "contextualweb",
            outlet: v.provider?.name ?? "contextualweb",
            title: v.title!,
            url: v.url!,
            publishedAt: v.datePublished ?? new Date().toISOString(),
            ...(v.description ? { snippet: v.description } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[contextualweb] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Cryptopanic — free crypto-focused news ────────────────────────────
function cryptopanicAdapter(): NewsAdapter {
  const key = process.env["CRYPTOPANIC_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, _opts) => {
      void _opts;
      try {
        const params = new URLSearchParams({
          auth_token: key,
          currencies: subjectName,
          public: "true",
        });
        const res = await abortable(
          fetch(`https://cryptopanic.com/api/v1/posts/?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ title?: string; url?: string; published_at?: string; source?: { title?: string; domain?: string } }>;
        };
        return (json.results ?? [])
          .filter((r) => r.title && r.url)
          .map((r) => ({
            source: "cryptopanic",
            outlet: r.source?.domain ?? r.source?.title ?? "cryptopanic",
            title: r.title!,
            url: r.url!,
            publishedAt: r.published_at ?? new Date().toISOString(),
          } as NewsArticle));
      } catch (err) {
        console.warn("[cryptopanic] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── MediaCloud — free academic / open news index ──────────────────────
function mediaCloudAdapter(): NewsAdapter {
  const key = process.env["MEDIACLOUD_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}"`,
          rows: String(opts?.limit ?? 25),
          sort: "publish_date_desc",
          key,
        });
        const res = await abortable(
          fetch(`https://api.mediacloud.org/api/v2/stories_public/list?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as Array<{
          stories_id?: number; title?: string; url?: string; publish_date?: string; media_name?: string;
        }>;
        return (Array.isArray(json) ? json : [])
          .filter((s) => s.title && s.url)
          .map((s) => ({
            source: "mediacloud",
            outlet: s.media_name ?? "mediacloud",
            title: s.title!,
            url: s.url!,
            publishedAt: s.publish_date ?? new Date().toISOString(),
          } as NewsArticle));
      } catch (err) {
        console.warn("[mediacloud] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Reuters Connect (REST, separate from RDP password grant) ──────────
function reutersConnectAdapter(): NewsAdapter {
  const key = process.env["REUTERS_CONNECT_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          query: subjectName,
          limit: String(opts?.limit ?? 25),
          sort: "date_desc",
        });
        const res = await abortable(
          fetch(`https://api.reutersconnect.com/content/v1/search?${params.toString()}`, {
            headers: { authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          items?: Array<{ headline?: string; webUrl?: string; firstCreated?: string; description?: string; sourceName?: string }>;
        };
        return (json.items ?? [])
          .filter((i) => i.headline && i.webUrl)
          .map((i) => ({
            source: "reuters-connect",
            outlet: i.sourceName ?? "reuters",
            title: i.headline!,
            url: i.webUrl!,
            publishedAt: i.firstCreated ?? new Date().toISOString(),
            ...(i.description ? { snippet: i.description } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[reuters-connect] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Bing News Search (Azure Cognitive Services) ───────────────────────
function bingNewsAdapter(): NewsAdapter {
  const key = process.env["BING_NEWS_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}"`,
          count: String(opts?.limit ?? 25),
          sortBy: "Date",
          mkt: "en-US",
          freshness: "Month",
        });
        const res = await abortable(
          fetch(`https://api.bing.microsoft.com/v7.0/news/search?${params.toString()}`, {
            headers: { "Ocp-Apim-Subscription-Key": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          value?: Array<{ name?: string; url?: string; datePublished?: string; description?: string; provider?: Array<{ name?: string }> }>;
        };
        return (json.value ?? [])
          .filter((v) => v.name && v.url)
          .map((v) => ({
            source: "bing-news",
            outlet: v.provider?.[0]?.name ?? "bing",
            title: v.name!,
            url: v.url!,
            publishedAt: v.datePublished ?? new Date().toISOString(),
            ...(v.description ? { snippet: v.description } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[bing-news] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Google News RSS — free, no key. Default-on (HS_DISABLED=google-news-rss to opt out).
// Searches 3 locales in parallel (EN, AR, RU) with AML modifiers so subjects
// from non-English-speaking jurisdictions (Turkey, MENA, CIS) are covered.
// The modifiers mirror those used by /api/news-search so both code paths
// surface the same articles.
const GNEWS_AML_LOCALES = [
  { hl: "en",    gl: "US", ceid: "US:en",    mod: "sanctions OR fraud OR corruption OR bribery OR arrest OR laundering OR trafficking OR terrorism" },
  { hl: "ar",    gl: "AE", ceid: "AE:ar",    mod: "عقوبات OR احتيال OR فساد OR رشوة OR اعتقال OR غسل" },
  { hl: "ru",    gl: "RU", ceid: "RU:ru",    mod: "санкции OR мошенничество OR коррупция OR арест OR отмывание" },
  { hl: "tr",    gl: "TR", ceid: "TR:tr",    mod: "yaptırım OR dolandırıcılık OR yolsuzluk OR rüşvet OR tutuklama OR kara para" },
] as const;

function googleNewsRssAdapter(): NewsAdapter {
  if (!flagOn("google-news-rss")) return NULL_NEWS_ADAPTER;

  async function fetchLocale(
    subjectName: string,
    locale: (typeof GNEWS_AML_LOCALES)[number],
    limitPerLocale: number,
  ): Promise<NewsArticle[]> {
    const q = `"${subjectName}" (${locale.mod})`;
    const params = new URLSearchParams({ q, hl: locale.hl, gl: locale.gl, ceid: locale.ceid });
    const res = await abortable(
      fetch(`https://news.google.com/rss/search?${params.toString()}`, {
        headers: { "user-agent": "HawkeyeSterling/1.0", accept: "application/rss+xml" },
      }),
      8_000,
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    const articles: NewsArticle[] = [];
    for (const it of items.slice(0, limitPerLocale)) {
      const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(it)?.[1]?.trim();
      const link  = /<link>([\s\S]*?)<\/link>/.exec(it)?.[1]?.trim();
      const pub   = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(it)?.[1]?.trim();
      const src   = /<source[^>]*>([\s\S]*?)<\/source>/.exec(it)?.[1]?.trim();
      if (!title || !link) continue;
      articles.push({
        source: "google-news-rss",
        outlet: src ?? "google-news",
        title,
        url: link,
        publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      });
    }
    return articles;
  }

  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const limit = opts?.limit ?? 25;
        const perLocale = Math.ceil(limit / GNEWS_AML_LOCALES.length);
        const settled = await Promise.allSettled(
          GNEWS_AML_LOCALES.map((loc) => fetchLocale(subjectName, loc, perLocale)),
        );
        const seen = new Set<string>();
        const articles: NewsArticle[] = [];
        for (const r of settled) {
          if (r.status !== "fulfilled") continue;
          for (const a of r.value) {
            const k = a.url.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            articles.push(a);
          }
        }
        return articles.slice(0, limit);
      } catch (err) {
        console.warn("[google-news-rss] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Hacker News (Algolia) — free, no key. Default-on (HS_DISABLED=hacker-news to opt out).
function hackerNewsAdapter(): NewsAdapter {
  if (!flagOn("hacker-news")) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          query: subjectName,
          tags: "story",
          hitsPerPage: String(opts?.limit ?? 25),
        });
        const res = await abortable(
          fetch(`https://hn.algolia.com/api/v1/search_by_date?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          hits?: Array<{ title?: string; url?: string; created_at?: string; story_text?: string; objectID?: string }>;
        };
        return (json.hits ?? [])
          .filter((h) => h.title && (h.url || h.objectID))
          .map((h) => ({
            source: "hackernews",
            outlet: "news.ycombinator.com",
            title: h.title!,
            url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
            publishedAt: h.created_at ?? new Date().toISOString(),
            ...(h.story_text ? { snippet: h.story_text.slice(0, 240) } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[hackernews] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Reddit — free w/ OAuth ───────────────────────────────────────────
function redditAdapter(): NewsAdapter {
  const cidEnv = process.env["REDDIT_CLIENT_ID"];
  const csEnv = process.env["REDDIT_CLIENT_SECRET"];
  if (!cidEnv || !csEnv) return NULL_NEWS_ADAPTER;
  const clientId: string = cidEnv;
  const clientSecret: string = csEnv;
  let cachedToken: { token: string; expiresAt: number } | null = null;
  async function getToken(): Promise<string | null> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
    try {
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const res = await abortable(
        fetch("https://www.reddit.com/api/v1/access_token", {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded", "user-agent": "HawkeyeSterling/1.0" },
          body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
        }),
      );
      if (!res.ok) return null;
      const j = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!j.access_token) return null;
      cachedToken = { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
      return cachedToken.token;
    } catch { return null; }
  }
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      const token = await getToken();
      if (!token) return [];
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, sort: "new", limit: String(opts?.limit ?? 25), restrict_sr: "false", type: "link" });
        const res = await abortable(
          fetch(`https://oauth.reddit.com/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}`, "user-agent": "HawkeyeSterling/1.0", accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: { children?: Array<{ data?: { title?: string; url?: string; created_utc?: number; selftext?: string; subreddit?: string; permalink?: string } }> };
        };
        return (json.data?.children ?? [])
          .map((c) => c.data)
          .filter((d): d is NonNullable<typeof d> => !!d?.title)
          .map((d) => ({
            source: "reddit",
            outlet: d.subreddit ? `r/${d.subreddit}` : "reddit.com",
            title: d.title!,
            url: d.url ?? (d.permalink ? `https://reddit.com${d.permalink}` : ""),
            publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : new Date().toISOString(),
            ...(d.selftext ? { snippet: d.selftext.slice(0, 240) } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[reddit] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Benzinga News — premium ──────────────────────────────────────────
function benzingaAdapter(): NewsAdapter {
  const key = process.env["BENZINGA_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ token: key, tickers: subjectName, pageSize: String(opts?.limit ?? 25), sort: "created:desc" });
        const res = await abortable(
          fetch(`https://api.benzinga.com/api/v2/news?${params.toString()}`, { headers: { accept: "application/json" } }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as Array<{ title?: string; url?: string; created?: string; teaser?: string; channels?: Array<{ name?: string }> }>;
        return (Array.isArray(json) ? json : [])
          .filter((a) => a.title && a.url)
          .map((a) => ({
            source: "benzinga",
            outlet: a.channels?.[0]?.name ?? "benzinga",
            title: a.title!,
            url: a.url!,
            publishedAt: a.created ?? new Date().toISOString(),
            ...(a.teaser ? { snippet: a.teaser } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[benzinga] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Seeking Alpha — premium ──────────────────────────────────────────
function seekingAlphaAdapter(): NewsAdapter {
  const key = process.env["SEEKINGALPHA_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ id: subjectName, size: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://seeking-alpha.p.rapidapi.com/news/v2/list-by-symbol?${params.toString()}`, {
            headers: { "x-rapidapi-key": key, "x-rapidapi-host": "seeking-alpha.p.rapidapi.com" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{ id?: string; attributes?: { title?: string; publishOn?: string; summary?: string }; links?: { canonical?: string } }>;
        };
        return (json.data ?? [])
          .filter((d) => d.attributes?.title && d.links?.canonical)
          .map((d) => ({
            source: "seekingalpha",
            outlet: "seekingalpha.com",
            title: d.attributes!.title!,
            url: d.links!.canonical!,
            publishedAt: d.attributes!.publishOn ?? new Date().toISOString(),
            ...(d.attributes!.summary ? { snippet: d.attributes!.summary } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[seekingalpha] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Financial Times — premium ────────────────────────────────────────
function ftAdapter(): NewsAdapter {
  const key = process.env["FT_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = {
          queryString: `"${subjectName}"`,
          queryContext: { curations: ["ARTICLES"] },
          resultContext: { maxResults: opts?.limit ?? 25, sortOrder: "DESC", sortField: "lastPublishDateTime", aspects: ["title", "lifecycle", "summary", "location"] },
        };
        const res = await abortable(
          fetch("https://api.ft.com/content/search/v1", {
            method: "POST",
            headers: { "X-Api-Key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          results?: Array<{ results?: Array<{ title?: { title?: string }; location?: { uri?: string }; lifecycle?: { initialPublishDateTime?: string }; summary?: { excerpt?: string } }> }>;
        };
        const items = (json.results ?? []).flatMap((r) => r.results ?? []);
        return items
          .filter((i) => i.title?.title && i.location?.uri)
          .map((i) => ({
            source: "ft",
            outlet: "ft.com",
            title: i.title!.title!,
            url: i.location!.uri!,
            publishedAt: i.lifecycle?.initialPublishDateTime ?? new Date().toISOString(),
            ...(i.summary?.excerpt ? { snippet: i.summary.excerpt } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[ft] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── The Economist (RSS-based, key-gated for caller-specific feed) ───
function economistAdapter(): NewsAdapter {
  const key = process.env["ECONOMIST_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.economist.com/v1/content/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          articles?: Array<{ headline?: string; url?: string; datePublished?: string; description?: string }>;
        };
        return (json.articles ?? [])
          .filter((a) => a.headline && a.url)
          .map((a) => ({
            source: "economist",
            outlet: "economist.com",
            title: a.headline!,
            url: a.url!,
            publishedAt: a.datePublished ?? new Date().toISOString(),
            ...(a.description ? { snippet: a.description } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[economist] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Yahoo Finance News — free key ────────────────────────────────────
function yahooFinanceAdapter(): NewsAdapter {
  const key = process.env["YAHOO_FINANCE_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ symbols: subjectName, count: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://yfapi.net/news/v2/list?${params.toString()}`, {
            headers: { "x-api-key": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          items?: { result?: Array<{ title?: string; link?: string; published_at?: string; summary?: string; publisher?: string }> };
        };
        return (json.items?.result ?? [])
          .filter((r) => r.title && r.link)
          .map((r) => ({
            source: "yahoo-finance",
            outlet: r.publisher ?? "yahoo",
            title: r.title!,
            url: r.link!,
            publishedAt: r.published_at ?? new Date().toISOString(),
            ...(r.summary ? { snippet: r.summary } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[yahoo-finance] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── StockNews API — premium ──────────────────────────────────────────
function stockNewsAdapter(): NewsAdapter {
  const key = process.env["STOCKNEWS_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ tickers: subjectName, items: String(opts?.limit ?? 25), token: key, sortby: "trending" });
        const res = await abortable(
          fetch(`https://stocknewsapi.com/api/v1?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{ title?: string; news_url?: string; date?: string; text?: string; source_name?: string; sentiment?: string }>;
        };
        return (json.data ?? [])
          .filter((d) => d.title && d.news_url)
          .map((d) => ({
            source: "stocknews",
            outlet: d.source_name ?? "stocknews",
            title: d.title!,
            url: d.news_url!,
            publishedAt: d.date ?? new Date().toISOString(),
            ...(d.text ? { snippet: d.text } : {}),
            ...(d.sentiment === "Positive" ? { sentiment: 0.5 } : d.sentiment === "Negative" ? { sentiment: -0.5 } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[stocknews] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── TheNewsAPI.com (different from NewsAPI.org) ─────────────────────
function theNewsApiAdapter(): NewsAdapter {
  const key = process.env["THENEWSAPI_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ api_token: key, search: `"${subjectName}"`, limit: String(opts?.limit ?? 25), language: "en", sort: "published_at" });
        const res = await abortable(
          fetch(`https://api.thenewsapi.com/v1/news/all?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{ uuid?: string; title?: string; url?: string; published_at?: string; description?: string; source?: string }>;
        };
        return (json.data ?? [])
          .filter((d) => d.title && d.url)
          .map((d) => ({
            source: "thenewsapi",
            outlet: d.source ?? "thenewsapi",
            title: d.title!,
            url: d.url!,
            publishedAt: d.published_at ?? new Date().toISOString(),
            ...(d.description ? { snippet: d.description } : {}),
          } as NewsArticle));
      } catch (err) {
        console.warn("[thenewsapi] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── ICE Connect News ────────────────────────────────────────────────
function iceConnectAdapter(): NewsAdapter {
  const key = process.env["ICE_CONNECT_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.theice.com/connect/v1/news/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ headline?: string; link?: string; publishedAt?: string; summary?: string; source?: string }> };
        return (json.items ?? []).filter((i) => i.headline && i.link).map((i) => ({
          source: "ice-connect", outlet: i.source ?? "ice", title: i.headline!, url: i.link!,
          publishedAt: i.publishedAt ?? new Date().toISOString(), ...(i.summary ? { snippet: i.summary } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[ice-connect] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Stocktwits — social-finance feed ────────────────────────────────
function stocktwitsAdapter(): NewsAdapter {
  const key = process.env["STOCKTWITS_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ access_token: key, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(subjectName)}.json?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { messages?: Array<{ id?: number; body?: string; created_at?: string; user?: { username?: string }; entities?: { sentiment?: { basic?: string } }; links?: Array<{ url?: string }> }> };
        return (json.messages ?? []).filter((m) => m.body).slice(0, opts?.limit ?? 25).map((m) => ({
          source: "stocktwits", outlet: m.user?.username ?? "stocktwits",
          title: m.body!.slice(0, 120),
          url: m.links?.[0]?.url ?? `https://stocktwits.com/message/${m.id}`,
          publishedAt: m.created_at ?? new Date().toISOString(),
          ...(m.body ? { snippet: m.body.slice(0, 240) } : {}),
          ...(m.entities?.sentiment?.basic === "Bullish" ? { sentiment: 0.5 } : m.entities?.sentiment?.basic === "Bearish" ? { sentiment: -0.5 } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[stocktwits] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Investing.com (RapidAPI) ────────────────────────────────────────
function investingComAdapter(): NewsAdapter {
  const key = process.env["INVESTING_COM_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ symbol: subjectName, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://investing-com.p.rapidapi.com/news/search?${params.toString()}`, {
            headers: { "x-rapidapi-key": key, "x-rapidapi-host": "investing-com.p.rapidapi.com" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: Array<{ title?: string; link?: string; date?: string; description?: string; source?: string }> };
        return (json.data ?? []).filter((d) => d.title && d.link).map((d) => ({
          source: "investing.com", outlet: d.source ?? "investing.com", title: d.title!, url: d.link!,
          publishedAt: d.date ?? new Date().toISOString(), ...(d.description ? { snippet: d.description } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[investing.com] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Lexology — legal news ───────────────────────────────────────────
function lexologyAdapter(): NewsAdapter {
  const key = process.env["LEXOLOGY_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, max: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.lexology.com/v1/articles/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ title?: string; url?: string; publishedAt?: string; abstract?: string; firm?: string }> };
        return (json.items ?? []).filter((i) => i.title && i.url).map((i) => ({
          source: "lexology", outlet: i.firm ?? "lexology.com", title: i.title!, url: i.url!,
          publishedAt: i.publishedAt ?? new Date().toISOString(), ...(i.abstract ? { snippet: i.abstract } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[lexology] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── ProPublica investigations ───────────────────────────────────────
function proPublicaAdapter(): NewsAdapter {
  const key = process.env["PROPUBLICA_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://www.propublica.org/api/v1/search?${params.toString()}`, {
            headers: { "x-api-key": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; publishedAt?: string; snippet?: string }> };
        return (json.results ?? []).filter((r) => r.title && r.url).map((r) => ({
          source: "propublica", outlet: "propublica.org", title: r.title!, url: r.url!,
          publishedAt: r.publishedAt ?? new Date().toISOString(), ...(r.snippet ? { snippet: r.snippet } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[propublica] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── OCCRP Aleph — investigative journalism + leaks corpus ───────────
function alephAdapter(): NewsAdapter {
  const key = process.env["ALEPH_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, limit: String(opts?.limit ?? 25), filter: "schema:Article" });
        const res = await abortable(
          fetch(`https://aleph.occrp.org/api/2/entities?${params.toString()}`, {
            headers: { Authorization: `ApiKey ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ properties?: { title?: string[]; sourceUrl?: string[]; publishedAt?: string[]; description?: string[]; publisher?: string[] } }> };
        return (json.results ?? []).map((r) => r.properties).filter((p): p is NonNullable<typeof p> => !!p?.title?.[0] && !!p?.sourceUrl?.[0]).map((p) => ({
          source: "occrp-aleph", outlet: p.publisher?.[0] ?? "occrp", title: p.title![0]!, url: p.sourceUrl![0]!,
          publishedAt: p.publishedAt?.[0] ?? new Date().toISOString(), ...(p.description?.[0] ? { snippet: p.description[0] } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[occrp-aleph] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Mention.com — premium social/web monitoring ─────────────────────
function mentionAdapter(): NewsAdapter {
  const key = process.env["MENTION_API_KEY"];
  const accountId = process.env["MENTION_ACCOUNT_ID"];
  const alertId = process.env["MENTION_ALERT_ID"];
  if (!key || !accountId || !alertId) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.mention.com/api/accounts/${accountId}/alerts/${alertId}/mentions?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { mentions?: Array<{ title?: string; url?: string; published_at?: string; description?: string; source_name?: string; tone?: number }> };
        return (json.mentions ?? []).filter((m) => m.title && m.url).map((m) => ({
          source: "mention.com", outlet: m.source_name ?? "mention", title: m.title!, url: m.url!,
          publishedAt: m.published_at ?? new Date().toISOString(),
          ...(m.description ? { snippet: m.description } : {}),
          ...(typeof m.tone === "number" ? { sentiment: m.tone } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[mention.com] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── BuzzSumo — premium content/influencer intelligence ──────────────
function buzzSumoAdapter(): NewsAdapter {
  const key = process.env["BUZZSUMO_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, num_results: String(opts?.limit ?? 25), api_key: key });
        const res = await abortable(
          fetch(`https://api.buzzsumo.com/search/articles.json?${params.toString()}`),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; published_date?: number; domain_name?: string }> };
        return (json.results ?? []).filter((r) => r.title && r.url).map((r) => ({
          source: "buzzsumo", outlet: r.domain_name ?? "buzzsumo", title: r.title!, url: r.url!,
          publishedAt: r.published_date ? new Date(r.published_date * 1000).toISOString() : new Date().toISOString(),
        } as NewsArticle));
      } catch (err) { console.warn("[buzzsumo] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Onclusive (formerly Critical Mention + Bulletin Intelligence) ───
function onclusiveAdapter(): NewsAdapter {
  const key = process.env["ONCLUSIVE_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const body = { keyword: `"${subjectName}"`, limit: opts?.limit ?? 25, sort: "publishDate desc" };
        const res = await abortable(
          fetch("https://api.onclusive.com/v2/coverage/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ headline?: string; url?: string; publishDate?: string; abstract?: string; outletName?: string; sentimentScore?: number }> };
        return (json.items ?? []).filter((i) => i.headline && i.url).map((i) => ({
          source: "onclusive", outlet: i.outletName ?? "onclusive", title: i.headline!, url: i.url!,
          publishedAt: i.publishDate ?? new Date().toISOString(),
          ...(i.abstract ? { snippet: i.abstract } : {}),
          ...(typeof i.sentimentScore === "number" ? { sentiment: i.sentimentScore } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[onclusive] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── NewsRiver — premium news API (RapidAPI) ─────────────────────────
function newsRiverAdapter(): NewsAdapter {
  const key = process.env["NEWSRIVER_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ query: `text:"${subjectName}"`, sortBy: "discoveredAt", sortOrder: "DESC", limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.newsriver.io/v2/search?${params.toString()}`, {
            headers: { Authorization: key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as Array<{ title?: string; url?: string; discoverDate?: string; description?: string; website?: { name?: string } }>;
        return (Array.isArray(json) ? json : []).filter((a) => a.title && a.url).map((a) => ({
          source: "newsriver", outlet: a.website?.name ?? "newsriver", title: a.title!, url: a.url!,
          publishedAt: a.discoverDate ?? new Date().toISOString(),
          ...(a.description ? { snippet: a.description } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[newsriver] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Brand24 — premium social listening ──────────────────────────────
function brand24Adapter(): NewsAdapter {
  const key = process.env["BRAND24_API_KEY"];
  const projectId = process.env["BRAND24_PROJECT_ID"];
  if (!key || !projectId) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ keywords: `"${subjectName}"`, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.brand24.com/v3/projects/${projectId}/mentions?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; created?: string; snippet?: string; source?: string; sentiment?: number }> };
        return (json.results ?? []).filter((r) => r.title && r.url).map((r) => ({
          source: "brand24", outlet: r.source ?? "brand24", title: r.title!, url: r.url!,
          publishedAt: r.created ?? new Date().toISOString(),
          ...(r.snippet ? { snippet: r.snippet } : {}),
          ...(typeof r.sentiment === "number" ? { sentiment: r.sentiment } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[brand24] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── RANE Worldview (Stratfor successor) — premium geopolitical risk ─
function raneAdapter(): NewsAdapter {
  const key = process.env["RANE_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.ranenetwork.com/v1/insights/search?${params.toString()}`, {
            headers: { "x-api-key": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ title?: string; url?: string; publishedAt?: string; summary?: string; analyst?: string; severity?: string }> };
        return (json.items ?? []).filter((i) => i.title && i.url).map((i) => ({
          source: "rane", outlet: i.analyst ?? "ranenetwork.com", title: i.title!, url: i.url!,
          publishedAt: i.publishedAt ?? new Date().toISOString(),
          ...(i.summary ? { snippet: i.summary } : {}),
          ...(i.severity === "high" ? { sentiment: -0.7 } : i.severity === "moderate" ? { sentiment: -0.3 } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[rane] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Verisk Maplecroft — premium country / political risk ───────────
function maplecroftAdapter(): NewsAdapter {
  const key = process.env["MAPLECROFT_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.maplecroft.com/v2/risk-alerts/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { alerts?: Array<{ headline?: string; url?: string; publishedAt?: string; summary?: string; country?: string; riskScore?: number }> };
        return (json.alerts ?? []).filter((a) => a.headline && a.url).map((a) => ({
          source: "maplecroft", outlet: a.country ?? "maplecroft", title: a.headline!, url: a.url!,
          publishedAt: a.publishedAt ?? new Date().toISOString(),
          ...(a.summary ? { snippet: a.summary } : {}),
          ...(typeof a.riskScore === "number" ? { sentiment: -a.riskScore / 10 } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[maplecroft] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Janes Defence Intelligence — premium ────────────────────────────
function janesAdapter(): NewsAdapter {
  const key = process.env["JANES_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: `"${subjectName}"`, max: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.janes.com/v2/content/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<{ title?: string; url?: string; publishedDate?: string; abstract?: string; section?: string }> };
        return (json.items ?? []).filter((i) => i.title && i.url).map((i) => ({
          source: "janes", outlet: i.section ?? "janes", title: i.title!, url: i.url!,
          publishedAt: i.publishedDate ?? new Date().toISOString(),
          ...(i.abstract ? { snippet: i.abstract } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[janes] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Mastodon search — free (toggle, public-instance fan-out) ────────
function mastodonAdapter(): NewsAdapter {
  const instance = process.env["MASTODON_INSTANCE"]; // e.g. "mastodon.social"
  if (!instance) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, type: "statuses", limit: String(opts?.limit ?? 25), resolve: "true" });
        const headers: Record<string, string> = { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" };
        const tok = process.env["MASTODON_ACCESS_TOKEN"];
        if (tok) headers.Authorization = `Bearer ${tok}`;
        const res = await abortable(
          fetch(`https://${instance}/api/v2/search?${params.toString()}`, { headers }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { statuses?: Array<{ url?: string; content?: string; created_at?: string; account?: { acct?: string } }> };
        return (json.statuses ?? []).filter((s) => s.url && s.content).map((s) => {
          const text = s.content!.replace(/<[^>]+>/g, "").trim();
          return {
            source: "mastodon",
            outlet: s.account?.acct ? `@${s.account.acct}` : instance,
            title: text.slice(0, 120),
            url: s.url!,
            publishedAt: s.created_at ?? new Date().toISOString(),
            snippet: text.slice(0, 240),
          } as NewsArticle;
        });
      } catch (err) { console.warn("[mastodon] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// ── Bing Web Search — broader than Bing News, key-gated ─────────────
function bingWebAdapter(): NewsAdapter {
  const key = process.env["BING_WEB_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({
          q: `"${subjectName}" sanctions OR fraud OR "money laundering" OR corruption OR investigation`,
          count: String(opts?.limit ?? 25),
          mkt: "en-US",
          freshness: "Month",
        });
        const res = await abortable(
          fetch(`https://api.bing.microsoft.com/v7.0/search?${params.toString()}`, {
            headers: { "Ocp-Apim-Subscription-Key": key, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { webPages?: { value?: Array<{ name?: string; url?: string; dateLastCrawled?: string; snippet?: string; siteName?: string }> } };
        return (json.webPages?.value ?? []).filter((v) => v.name && v.url).map((v) => ({
          source: "bing-web", outlet: v.siteName ?? "bing", title: v.name!, url: v.url!,
          publishedAt: v.dateLastCrawled ?? new Date().toISOString(),
          ...(v.snippet ? { snippet: v.snippet } : {}),
        } as NewsArticle));
      } catch (err) { console.warn("[bing-web] failed:", err instanceof Error ? err.message : err); return []; }
    },
  };
}

// Generic news adapter factory — for vendors with a key + simple
// query-string search returning a uniform array of items.
function makeNewsAdapter(opts: {
  envKey: string; source: string; outletDefault: string;
  baseUrl: string; queryParam: string;
  authHeader?: (key: string) => Record<string, string>;
  parser: (json: unknown) => Array<{ title?: string; url?: string; publishedAt?: string; snippet?: string; outlet?: string; sentiment?: number }>;
}): NewsAdapter {
  const key = process.env[opts.envKey];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, query) => {
      try {
        const params = new URLSearchParams({ [opts.queryParam]: `"${subjectName}"`, limit: String(query?.limit ?? 25) });
        const headers: Record<string, string> = {
          accept: "application/json",
          ...(opts.authHeader ? opts.authHeader(key) : { Authorization: `Bearer ${key}` }),
        };
        const res = await abortable(fetch(`${opts.baseUrl}?${params.toString()}`, { headers }));
        if (!res.ok) return [];
        const items = opts.parser(await res.json());
        return items.filter((i) => i.title && i.url).map((i) => ({
          source: opts.source,
          outlet: i.outlet ?? opts.outletDefault,
          title: i.title!,
          url: i.url!,
          publishedAt: i.publishedAt ?? new Date().toISOString(),
          ...(i.snippet ? { snippet: i.snippet } : {}),
          ...(typeof i.sentiment === "number" ? { sentiment: i.sentiment } : {}),
        } as NewsArticle));
      } catch (err) {
        console.warn(`[${opts.source}] failed:`, err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Global wire services ──────────────────────────────────────────────
const afpAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "AFP_API_KEY", source: "afp", outletDefault: "afp.com",
  baseUrl: "https://afp-apicore-prod.afp.com/v1/api/search", queryParam: "q",
  parser: (j) => ((j as { docs?: Array<{ title?: string; url?: string; published?: string; abstract?: string }> }).docs ?? [])
    .map((d) => ({ title: d.title, url: d.url, publishedAt: d.published, snippet: d.abstract })),
});

const yonhapAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "YONHAP_API_KEY", source: "yonhap", outletDefault: "yna.co.kr",
  baseUrl: "https://api.yonhapnews.co.kr/v1/articles/search", queryParam: "keyword",
  parser: (j) => ((j as { items?: Array<{ title?: string; url?: string; pubDate?: string; lead?: string }> }).items ?? [])
    .map((i) => ({ title: i.title, url: i.url, publishedAt: i.pubDate, snippet: i.lead })),
});

const kyodoAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "KYODO_API_KEY", source: "kyodo", outletDefault: "kyodonews.net",
  baseUrl: "https://api.kyodonews.net/v1/news/search", queryParam: "q",
  parser: (j) => ((j as { results?: Array<{ headline?: string; url?: string; date?: string; summary?: string }> }).results ?? [])
    .map((r) => ({ title: r.headline, url: r.url, publishedAt: r.date, snippet: r.summary })),
});

const anadoluAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "ANADOLU_API_KEY", source: "anadolu", outletDefault: "aa.com.tr",
  baseUrl: "https://api.aa.com.tr/v1/search", queryParam: "keywords",
  parser: (j) => ((j as { documents?: Array<{ title?: string; url?: string; date?: string; description?: string }> }).documents ?? [])
    .map((d) => ({ title: d.title, url: d.url, publishedAt: d.date, snippet: d.description })),
});

const dpaAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "DPA_API_KEY", source: "dpa", outletDefault: "dpa.com",
  baseUrl: "https://api.dpa.com/v1/articles/search", queryParam: "q",
  parser: (j) => ((j as { items?: Array<{ headline?: string; url?: string; published?: string; teaser?: string }> }).items ?? [])
    .map((i) => ({ title: i.headline, url: i.url, publishedAt: i.published, snippet: i.teaser })),
});

const efeAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "EFE_API_KEY", source: "efe", outletDefault: "efe.com",
  baseUrl: "https://efeapi.efe.com/v1/search", queryParam: "q",
  parser: (j) => ((j as { results?: Array<{ titulo?: string; url?: string; fecha?: string; entradilla?: string }> }).results ?? [])
    .map((r) => ({ title: r.titulo, url: r.url, publishedAt: r.fecha, snippet: r.entradilla })),
});

const ansaAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "ANSA_API_KEY", source: "ansa", outletDefault: "ansa.it",
  baseUrl: "https://api.ansa.it/v1/news/search", queryParam: "q",
  parser: (j) => ((j as { items?: Array<{ titolo?: string; url?: string; data?: string; sommario?: string }> }).items ?? [])
    .map((i) => ({ title: i.titolo, url: i.url, publishedAt: i.data, snippet: i.sommario })),
});

const alJazeeraAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "ALJAZEERA_API_KEY", source: "al-jazeera", outletDefault: "aljazeera.com",
  baseUrl: "https://api.aljazeera.com/v1/articles/search", queryParam: "q",
  parser: (j) => ((j as { articles?: Array<{ title?: string; url?: string; publishedAt?: string; description?: string }> }).articles ?? [])
    .map((a) => ({ title: a.title, url: a.url, publishedAt: a.publishedAt, snippet: a.description })),
});

const riskNetAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "RISKNET_API_KEY", source: "risk.net", outletDefault: "risk.net",
  baseUrl: "https://api.risk.net/v1/articles/search", queryParam: "q",
  parser: (j) => ((j as { articles?: Array<{ title?: string; url?: string; publishedAt?: string; teaser?: string }> }).articles ?? [])
    .map((a) => ({ title: a.title, url: a.url, publishedAt: a.publishedAt, snippet: a.teaser })),
});

const complianceWeekAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "COMPLIANCEWEEK_API_KEY", source: "complianceweek", outletDefault: "complianceweek.com",
  baseUrl: "https://api.complianceweek.com/v1/articles/search", queryParam: "q",
  parser: (j) => ((j as { items?: Array<{ headline?: string; url?: string; publishedDate?: string; summary?: string }> }).items ?? [])
    .map((i) => ({ title: i.headline, url: i.url, publishedAt: i.publishedDate, snippet: i.summary })),
});

const amlWatchdogAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "AMLWATCHDOG_API_KEY", source: "aml-watchdog", outletDefault: "amlwatchdog.com",
  baseUrl: "https://api.amlwatchdog.com/v1/alerts/search", queryParam: "q",
  parser: (j) => ((j as { alerts?: Array<{ title?: string; url?: string; alertedAt?: string; summary?: string; severity?: string }> }).alerts ?? [])
    .map((a) => ({ title: a.title, url: a.url, publishedAt: a.alertedAt, snippet: a.summary, sentiment: a.severity === "high" ? -0.7 : a.severity === "medium" ? -0.3 : 0 })),
});

const pegasusAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "PEGASUS_API_KEY", source: "pegasus", outletDefault: "pegasus.news",
  baseUrl: "https://api.pegasus.news/v1/articles/search", queryParam: "q",
  parser: (j) => ((j as { items?: Array<{ title?: string; url?: string; publishedAt?: string; description?: string }> }).items ?? [])
    .map((i) => ({ title: i.title, url: i.url, publishedAt: i.publishedAt, snippet: i.description })),
});

// ── 13 additional news / adverse-media adapters (89 → 102) ───────────────
const refinitivConnectAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "REFINITIV_CONNECT_API_KEY", source: "refinitiv-connect", outletDefault: "refinitiv.com",
  baseUrl: "https://api.refinitiv.com/data/news/v1/headlines", queryParam: "query",
  parser: (j) => ((j as { data?: Array<{ storyId?: string; headline?: string; firstCreated?: string; sourceName?: string }> }).data ?? [])
    .map((d) => ({ title: d.headline, url: `https://refinitiv.com/news/${d.storyId ?? ""}`, publishedAt: d.firstCreated, outlet: d.sourceName })),
});
const businessWireAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "BUSINESSWIRE_API_KEY", source: "businesswire", outletDefault: "businesswire.com",
  baseUrl: "https://api.businesswire.com/v1/releases/search", queryParam: "q",
  parser: (j) => ((j as { releases?: Array<{ headline?: string; url?: string; date?: string; teaser?: string }> }).releases ?? [])
    .map((r) => ({ title: r.headline, url: r.url, publishedAt: r.date, snippet: r.teaser })),
});
const prNewswireAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "PRNEWSWIRE_API_KEY", source: "pr-newswire", outletDefault: "prnewswire.com",
  baseUrl: "https://api.prnewswire.com/releases/search", queryParam: "q",
  parser: (j) => ((j as { items?: Array<{ title?: string; url?: string; published?: string; summary?: string }> }).items ?? [])
    .map((r) => ({ title: r.title, url: r.url, publishedAt: r.published, snippet: r.summary })),
});
const globeNewswireAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "GLOBENEWSWIRE_API_KEY", source: "globe-newswire", outletDefault: "globenewswire.com",
  baseUrl: "https://api.globenewswire.com/v1/releases/search", queryParam: "q",
  parser: (j) => ((j as { items?: Array<{ headline?: string; link?: string; date?: string; lead?: string }> }).items ?? [])
    .map((r) => ({ title: r.headline, url: r.link, publishedAt: r.date, snippet: r.lead })),
});
const acuityKnowledgeAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "ACUITY_KNOWLEDGE_API_KEY", source: "acuity-knowledge", outletDefault: "acuitykp.com",
  baseUrl: "https://api.acuitykp.com/v1/research/search", queryParam: "q",
  parser: (j) => ((j as { results?: Array<{ title?: string; url?: string; publishedAt?: string; abstract?: string }> }).results ?? [])
    .map((r) => ({ title: r.title, url: r.url, publishedAt: r.publishedAt, snippet: r.abstract })),
});
const moodysAnalyticsAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "MOODYS_ANALYTICS_API_KEY", source: "moodys-analytics", outletDefault: "moodysanalytics.com",
  baseUrl: "https://api.moodysanalytics.com/v1/insights/search", queryParam: "q",
  parser: (j) => ((j as { items?: Array<{ headline?: string; url?: string; publishedAt?: string; summary?: string }> }).items ?? [])
    .map((r) => ({ title: r.headline, url: r.url, publishedAt: r.publishedAt, snippet: r.summary })),
});
const omfifAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "OMFIF_API_KEY", source: "omfif", outletDefault: "omfif.org",
  baseUrl: "https://api.omfif.org/v1/articles/search", queryParam: "q",
  parser: (j) => ((j as { articles?: Array<{ title?: string; url?: string; date?: string; summary?: string }> }).articles ?? [])
    .map((r) => ({ title: r.title, url: r.url, publishedAt: r.date, snippet: r.summary })),
});
const centralBankingAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "CENTRALBANKING_API_KEY", source: "centralbanking", outletDefault: "centralbanking.com",
  baseUrl: "https://api.centralbanking.com/v1/news/search", queryParam: "q",
  parser: (j) => ((j as { items?: Array<{ title?: string; url?: string; publishedAt?: string; teaser?: string }> }).items ?? [])
    .map((r) => ({ title: r.title, url: r.url, publishedAt: r.publishedAt, snippet: r.teaser })),
});
const globalFinanceAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "GLOBAL_FINANCE_API_KEY", source: "global-finance", outletDefault: "gfmag.com",
  baseUrl: "https://api.gfmag.com/v1/articles/search", queryParam: "q",
  parser: (j) => ((j as { articles?: Array<{ headline?: string; link?: string; date?: string; abstract?: string }> }).articles ?? [])
    .map((r) => ({ title: r.headline, url: r.link, publishedAt: r.date, snippet: r.abstract })),
});
const eurofinasAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "EUROFINAS_API_KEY", source: "eurofinas", outletDefault: "eurofinas.org",
  baseUrl: "https://api.eurofinas.org/v1/news/search", queryParam: "q",
  parser: (j) => ((j as { items?: Array<{ title?: string; url?: string; publishedAt?: string }> }).items ?? [])
    .map((r) => ({ title: r.title, url: r.url, publishedAt: r.publishedAt })),
});
const ihsMarkitAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "IHS_MARKIT_API_KEY", source: "ihs-markit", outletDefault: "ihsmarkit.com",
  baseUrl: "https://api.ihsmarkit.com/v1/news/search", queryParam: "q",
  parser: (j) => ((j as { items?: Array<{ title?: string; url?: string; publishedAt?: string; description?: string }> }).items ?? [])
    .map((r) => ({ title: r.title, url: r.url, publishedAt: r.publishedAt, snippet: r.description })),
});
const eikonNewsAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "EIKON_NEWS_API_KEY", source: "eikon-news", outletDefault: "eikon.refinitiv.com",
  baseUrl: "https://api.eikon.refinitiv.com/v1/news/headlines", queryParam: "q",
  parser: (j) => ((j as { headlines?: Array<{ headline?: string; storyId?: string; firstCreated?: string }> }).headlines ?? [])
    .map((r) => ({ title: r.headline, url: `https://eikon.refinitiv.com/news/${r.storyId ?? ""}`, publishedAt: r.firstCreated })),
});
const nikkeiAsiaAdapter = (): NewsAdapter => makeNewsAdapter({
  envKey: "NIKKEI_ASIA_API_KEY", source: "nikkei-asia", outletDefault: "asia.nikkei.com",
  baseUrl: "https://api.asia.nikkei.com/v1/articles/search", queryParam: "q",
  parser: (j) => ((j as { articles?: Array<{ title?: string; url?: string; published_at?: string; description?: string }> }).articles ?? [])
    .map((r) => ({ title: r.title, url: r.url, publishedAt: r.published_at, snippet: r.description })),
});

// ── Tavily Search API ─────────────────────────────────────────────────
// Tavily is a search API designed for AI agents. It returns synthesised
// answers + source articles with relevance scores. For AML we use the
// raw search results (type:"news") to surface adverse media.
// Env: TAVILY_API_KEY   Free tier: 1 000 req/month. $0.005/req thereafter.
// Docs: https://docs.tavily.com/docs/rest-api/api-reference
const tavilyAdapter = (): NewsAdapter => {
  const key = process.env["TAVILY_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (name, opts) => {
      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            query: `"${name}" sanctions OR fraud OR money laundering OR criminal OR corruption`,
            topic: "news",
            search_depth: "basic",
            max_results: Math.min(opts?.limit ?? 10, 20),
            include_domains: [],
            exclude_domains: [],
          }),
        });
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; published_date?: string; content?: string; score?: number }> };
        return (json.results ?? [])
          .filter((r) => r.url && r.title)
          .map((r): NewsArticle => ({
            title: r.title!,
            url: r.url!,
            publishedAt: r.published_date ?? new Date().toISOString(),
            snippet: r.content?.slice(0, 300),
            source: "tavily",
            outlet: (() => { try { return new URL(r.url!).hostname; } catch { return "tavily"; } })(),
          }));
      } catch (err) {
        console.warn("[tavily] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
};

// ── Exa.ai Neural Search ──────────────────────────────────────────────
// Exa uses neural/embedding-based retrieval — finds semantically relevant
// pages even when the subject name doesn't appear verbatim. Particularly
// strong for finding adverse media on obscure entities, aliases, and
// transliterated names. Returns full page content.
// Env: EXA_API_KEY    Free tier: 1 000 req/month via exa.ai.
// Docs: https://docs.exa.ai/reference/search
const exaAdapter = (): NewsAdapter => {
  const key = process.env["EXA_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (name, opts) => {
      try {
        const res = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key },
          body: JSON.stringify({
            query: `${name} financial crime money laundering sanctions fraud`,
            type: "neural",
            numResults: Math.min(opts?.limit ?? 10, 25),
            contents: { text: { maxCharacters: 400 } },
            category: "news",
          }),
        });
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; publishedDate?: string; text?: string; score?: number }> };
        return (json.results ?? [])
          .filter((r) => r.url && r.title)
          .map((r): NewsArticle => ({
            title: r.title!,
            url: r.url!,
            publishedAt: r.publishedDate ?? new Date().toISOString(),
            snippet: r.text?.slice(0, 300),
            source: "exa",
            outlet: (() => { try { return new URL(r.url!).hostname; } catch { return "exa"; } })(),
          }));
      } catch (err) {
        console.warn("[exa] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
};

// ── Perplexity Sonar API ──────────────────────────────────────────────
// Perplexity Sonar returns synthesised answers with cited sources.
// For AML we extract the citations and use them as adverse-media articles.
// Strong for regulatory context and recent enforcement actions.
// Env: PERPLEXITY_API_KEY   sonar-pro: $3/1000 req.
// Docs: https://docs.perplexity.ai/reference/post_chat_completions
const perplexityAdapter = (): NewsAdapter => {
  const key = process.env["PERPLEXITY_API_KEY"];
  if (!key) return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (name) => {
      try {
        const res = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              {
                role: "user",
                content: `Find recent news about "${name}" related to: money laundering, sanctions, financial crime, fraud, corruption, criminal proceedings, regulatory action. List sources.`,
              },
            ],
            return_citations: true,
            search_domain_filter: [],
            max_tokens: 400,
          }),
        });
        if (!res.ok) return [];
        const json = (await res.json()) as { citations?: string[]; choices?: Array<{ message?: { content?: string } }> };
        const citations = json.citations ?? [];
        const content = json.choices?.[0]?.message?.content ?? "";
        if (citations.length === 0 && !content) return [];
        return citations.slice(0, 10).map((url): NewsArticle => ({
          title: `Perplexity — ${name} adverse media`,
          url,
          publishedAt: new Date().toISOString(),
          snippet: content.slice(0, 300),
          source: "perplexity",
          outlet: (() => { try { return new URL(url).hostname; } catch { return "perplexity"; } })(),
        }));
      } catch (err) {
        console.warn("[perplexity] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
};

// ── Master aggregator ───────────────────────────────────────────────────
/**
 * Returns ALL available news adapters whose env keys are configured.
 * Routes that need adverse-media coverage call this and merge results.
 */
export function activeNewsAdapters(): NewsAdapter[] {
  return [
    newsApiAdapter(),
    marketAuxAdapter(),
    gNewsAdapter(),
    mediaStackAdapter(),
    currentsAdapter(),
    newsCatcherAdapter(),
    reutersAdapter(),
    complyAdvantageAdapter(),
    bloombergAdapter(),
    factsetAdapter(),
    spGlobalAdapter(),
    moodysOrbisAdapter(),
    guardianAdapter(),
    nytAdapter(),
    aylienAdapter(),
    webzAdapter(),
    eventRegistryAdapter(),
    polygonAdapter(),
    tiingoAdapter(),
    apNewsAdapter(),
    bbcNewsAdapter(),
    newsDataAdapter(),
    worldNewsAdapter(),
    alphaVantageAdapter(),
    serpApiAdapter(),
    diffbotAdapter(),
    meltwaterAdapter(),
    signalAiAdapter(),
    factivaAdapter(),
    lexisNexisNewsdeskAdapter(),
    cisionAdapter(),
    alphaSenseAdapter(),
    quidAdapter(),
    brandwatchAdapter(),
    talkwalkerAdapter(),
    dataminrAdapter(),
    zignalAdapter(),
    contextualWebAdapter(),
    cryptopanicAdapter(),
    mediaCloudAdapter(),
    reutersConnectAdapter(),
    bingNewsAdapter(),
    googleNewsRssAdapter(),
    hackerNewsAdapter(),
    redditAdapter(),
    benzingaAdapter(),
    seekingAlphaAdapter(),
    ftAdapter(),
    economistAdapter(),
    yahooFinanceAdapter(),
    stockNewsAdapter(),
    theNewsApiAdapter(),
    iceConnectAdapter(),
    stocktwitsAdapter(),
    investingComAdapter(),
    lexologyAdapter(),
    proPublicaAdapter(),
    alephAdapter(),
    mentionAdapter(),
    buzzSumoAdapter(),
    onclusiveAdapter(),
    newsRiverAdapter(),
    brand24Adapter(),
    raneAdapter(),
    maplecroftAdapter(),
    janesAdapter(),
    mastodonAdapter(),
    bingWebAdapter(),
    afpAdapter(), yonhapAdapter(), kyodoAdapter(), anadoluAdapter(),
    dpaAdapter(), efeAdapter(), ansaAdapter(), alJazeeraAdapter(),
    riskNetAdapter(), complianceWeekAdapter(), amlWatchdogAdapter(), pegasusAdapter(),
    refinitivConnectAdapter(), businessWireAdapter(), prNewswireAdapter(),
    globeNewswireAdapter(), acuityKnowledgeAdapter(), moodysAnalyticsAdapter(),
    omfifAdapter(), centralBankingAdapter(), globalFinanceAdapter(),
    eurofinasAdapter(), ihsMarkitAdapter(), eikonNewsAdapter(), nikkeiAsiaAdapter(),
    freeRssAdapter(),
    // ── New AI-native research adapters ──────────────────────────────
    tavilyAdapter(),      // TAVILY_API_KEY — deep web search for AI agents
    exaAdapter(),         // EXA_API_KEY — neural/embedding search
    perplexityAdapter(),  // PERPLEXITY_API_KEY — synthesised adverse media
  ].filter((a) => a.isAvailable());
}

export function activeNewsProviders(): string[] {
  const keys: Array<[string, string]> = [
    ["NEWSAPI_API_KEY", "newsapi"],
    ["MARKETAUX_API_KEY", "marketaux"],
    ["GNEWS_API_KEY", "gnews"],
    ["MEDIASTACK_API_KEY", "mediastack"],
    ["CURRENTS_API_KEY", "currents"],
    ["NEWSCATCHER_API_KEY", "newscatcher"],
    ["RDP_APP_KEY", "reuters-rdp"],
    ["COMPLYADVANTAGE_API_KEY", "complyadvantage"],
    ["FACTSET_API_KEY", "factset"],
    ["SPGLOBAL_API_KEY", "spglobal"],
    ["MOODYS_ORBIS_API_KEY", "moodys-orbis"],
    ["BLOOMBERG_API_KEY", "bloomberg"],
    ["GUARDIAN_API_KEY", "guardian"],
    ["NYT_API_KEY", "nyt"],
    ["AYLIEN_API_KEY", "aylien"],
    ["WEBZ_API_KEY", "webz"],
    ["EVENTREGISTRY_API_KEY", "eventregistry"],
    ["POLYGON_API_KEY", "polygon"],
    ["TIINGO_API_KEY", "tiingo"],
    ["AP_API_KEY", "ap"],
    ["BBC_API_KEY", "bbc"],
    ["NEWSDATA_API_KEY", "newsdata"],
    ["WORLDNEWS_API_KEY", "worldnews"],
    ["ALPHAVANTAGE_API_KEY", "alphavantage"],
    ["SERPAPI_API_KEY", "serpapi-googlenews"],
    ["DIFFBOT_API_KEY", "diffbot"],
    ["MELTWATER_API_KEY", "meltwater"],
    ["SIGNALAI_API_KEY", "signal-ai"],
    ["FACTIVA_USER_ID", "factiva"],
    ["LEXISNEXIS_NEWSDESK_API_KEY", "lexisnexis-newsdesk"],
    ["CISION_API_KEY", "cision"],
    ["ALPHASENSE_API_KEY", "alphasense"],
    ["QUID_API_KEY", "quid"],
    ["BRANDWATCH_API_KEY", "brandwatch"],
    ["TALKWALKER_API_KEY", "talkwalker"],
    ["DATAMINR_CLIENT_ID", "dataminr"],
    ["ZIGNAL_API_KEY", "zignal"],
    ["CONTEXTUALWEB_API_KEY", "contextualweb"],
    ["CRYPTOPANIC_API_KEY", "cryptopanic"],
    ["MEDIACLOUD_API_KEY", "mediacloud"],
    ["REUTERS_CONNECT_API_KEY", "reuters-connect"],
    ["BING_NEWS_API_KEY", "bing-news"],
    ["GOOGLE_NEWS_RSS_ENABLED", "google-news-rss"],
    ["HACKER_NEWS_ENABLED", "hackernews"],
    ["REDDIT_CLIENT_ID", "reddit"],
    ["BENZINGA_API_KEY", "benzinga"],
    ["SEEKINGALPHA_API_KEY", "seekingalpha"],
    ["FT_API_KEY", "ft"],
    ["ECONOMIST_API_KEY", "economist"],
    ["YAHOO_FINANCE_API_KEY", "yahoo-finance"],
    ["STOCKNEWS_API_KEY", "stocknews"],
    ["THENEWSAPI_API_KEY", "thenewsapi"],
    ["ICE_CONNECT_API_KEY", "ice-connect"],
    ["STOCKTWITS_API_KEY", "stocktwits"],
    ["INVESTING_COM_API_KEY", "investing.com"],
    ["LEXOLOGY_API_KEY", "lexology"],
    ["PROPUBLICA_API_KEY", "propublica"],
    ["ALEPH_API_KEY", "occrp-aleph"],
    ["MENTION_API_KEY", "mention.com"],
    ["BUZZSUMO_API_KEY", "buzzsumo"],
    ["ONCLUSIVE_API_KEY", "onclusive"],
    ["NEWSRIVER_API_KEY", "newsriver"],
    ["BRAND24_API_KEY", "brand24"],
    ["RANE_API_KEY", "rane"],
    ["MAPLECROFT_API_KEY", "maplecroft"],
    ["JANES_API_KEY", "janes"],
    ["MASTODON_INSTANCE", "mastodon"],
    ["BING_WEB_API_KEY", "bing-web"],
    ["AFP_API_KEY", "afp"],
    ["YONHAP_API_KEY", "yonhap"],
    ["KYODO_API_KEY", "kyodo"],
    ["ANADOLU_API_KEY", "anadolu"],
    ["DPA_API_KEY", "dpa"],
    ["EFE_API_KEY", "efe"],
    ["ANSA_API_KEY", "ansa"],
    ["ALJAZEERA_API_KEY", "al-jazeera"],
    ["RISKNET_API_KEY", "risk.net"],
    ["COMPLIANCEWEEK_API_KEY", "complianceweek"],
    ["AMLWATCHDOG_API_KEY", "aml-watchdog"],
    ["PEGASUS_API_KEY", "pegasus"],
    ["FREE_RSS_ENABLED", "free-rss-aggregator"],
    // AI-native research adapters
    ["TAVILY_API_KEY", "tavily"],
    ["EXA_API_KEY", "exa"],
    ["PERPLEXITY_API_KEY", "perplexity"],
  ];
  return keys.filter(([envKey]) => process.env[envKey]).map(([, name]) => name);
}

/** Run every active adapter in parallel against a subject name. */
export async function searchAllNews(
  subjectName: string,
  opts?: { limit?: number; since?: string },
): Promise<{ articles: NewsArticle[]; providersUsed: string[] }> {
  const adapters = activeNewsAdapters();
  if (adapters.length === 0) return { articles: [], providersUsed: [] };
  const results = await Promise.all(adapters.map((a) => a.search(subjectName, opts)));
  const merged = results.flat();
  // De-dup by URL — different aggregators frequently surface the same article.
  const seen = new Set<string>();
  const articles = merged.filter((a) => {
    const k = a.url.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { articles, providersUsed: activeNewsProviders() };
}

/**
 * Run every active adapter independently via Promise.allSettled so that one
 * adapter's failure cannot block or delay results from other adapters.
 *
 * Each adapter already has an internal try/catch that returns [] on error, so
 * allSettled will almost always see fulfilled results. The rejected branch
 * handles the rare case where an adapter throws despite its guard.
 *
 * sourcesSucceeded is derived from the unique `source` values present in the
 * returned articles — only adapters that actually returned at least one article
 * appear here. sourcesFailed lists adapters that threw an unhandled exception.
 */
export async function searchAllNewsWithStatus(
  subjectName: string,
  opts?: { limit?: number; since?: string },
): Promise<{
  articles: NewsArticle[];
  sourcesSucceeded: string[];
  sourcesFailed: Array<{ name: string; error: string }>;
}> {
  const adapters = activeNewsAdapters();
  if (adapters.length === 0) {
    return { articles: [], sourcesSucceeded: [], sourcesFailed: [] };
  }

  const settled = await Promise.allSettled(
    adapters.map((a) => a.search(subjectName, opts)),
  );

  const sourcesFailed: Array<{ name: string; error: string }> = [];
  const allArticles: NewsArticle[] = [];

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === "fulfilled") {
      allArticles.push(...r.value);
    } else {
      sourcesFailed.push({
        name: `vendor_${i}`,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }

  const seen = new Set<string>();
  const articles = allArticles.filter((a) => {
    const k = a.url.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const sourcesSucceeded = [...new Set(articles.map((a) => a.source))];

  return { articles, sourcesSucceeded, sourcesFailed };
}
