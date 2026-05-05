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

const FETCH_TIMEOUT_MS = 12_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`adapter exceeded ${ms}ms`)), ms),
    ),
  ]);
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
        if (!res.ok) return [];
        const json = (await res.json()) as {
          articles?: Array<{
            source?: { name?: string };
            title?: string;
            url?: string;
            publishedAt?: string;
            description?: string;
          }>;
        };
        return (json.articles ?? [])
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
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{
            uuid?: string;
            source?: string;
            title?: string;
            url?: string;
            published_at?: string;
            description?: string;
            sentiment?: number;
            language?: string;
          }>;
        };
        return (json.data ?? [])
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
        if (!res.ok) return [];
        const json = (await res.json()) as {
          articles?: Array<{
            source?: { name?: string };
            title?: string;
            url?: string;
            publishedAt?: string;
            description?: string;
          }>;
        };
        return (json.articles ?? [])
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
        if (!res.ok) return [];
        const json = (await res.json()) as {
          data?: Array<{
            source?: string;
            title?: string;
            url?: string;
            published_at?: string;
            description?: string;
            language?: string;
          }>;
        };
        return (json.data ?? [])
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
        if (!res.ok) return [];
        const json = (await res.json()) as {
          news?: Array<{
            title?: string;
            url?: string;
            published?: string;
            description?: string;
            language?: string;
            domain?: string;
          }>;
        };
        return (json.news ?? [])
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
        if (!res.ok) return [];
        const json = (await res.json()) as {
          articles?: Array<{
            clean_url?: string;
            title?: string;
            link?: string;
            published_date?: string;
            excerpt?: string;
            language?: string;
          }>;
        };
        return (json.articles ?? [])
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
        if (!res.ok) return [];
        const json = (await res.json()) as {
          response?: { docs?: Array<{ headline?: { main?: string }; web_url?: string; pub_date?: string; abstract?: string; source?: string }> };
        };
        return (json.response?.docs ?? [])
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
        if (!res.ok) return [];
        const json = (await res.json()) as Array<{
          id?: number; title?: string; url?: string; publishedDate?: string; description?: string; source?: string;
        }>;
        return (Array.isArray(json) ? json : [])
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
