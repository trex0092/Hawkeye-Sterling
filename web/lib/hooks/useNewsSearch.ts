"use client";

import { useEffect, useState } from "react";

export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
  keywordGroups: string[];
  esgCategories: string[];
  severity: "clear" | "low" | "medium" | "high" | "critical";
  fuzzyScore: number;
  fuzzyMethod: string;
  matchedVariant?: string;
  lang: string;
  sourceTier?: "tier1" | "tier2" | "tier3" | "unknown";
}

export interface NewsDossier {
  subject: string;
  articleCount: number;
  topSeverity: NewsArticle["severity"];
  keywordGroupCounts: Array<{ group: string; label: string; count: number }>;
  esgDomains: string[];
  articles: NewsArticle[];
  source: "google-news-rss" | "newsapi";
  languages: string[];
}

export type NewsSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: NewsDossier }
  | { status: "error"; error: string };

// Neutral empty-dossier shape used as a client-side fallback when the
// backend is genuinely unreachable. The UI renders this as
// "No articles found" rather than a red error — adverse-media is a
// regulator-facing panel so "no data" is infinitely preferable to
// "server 502" copy bleeding into the case file.
function emptyDossier(subject: string): NewsDossier {
  return {
    subject,
    articleCount: 0,
    topSeverity: "clear",
    keywordGroupCounts: [],
    esgDomains: [],
    articles: [],
    source: "google-news-rss",
    languages: [],
  };
}

const RETRY_DELAYS_MS = [400, 1200, 2500];

async function fetchDossier(
  key: string,
  signal: AbortSignal,
): Promise<NewsDossier> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const r = await fetch(
        `/api/news-search?q=${encodeURIComponent(key)}`,
        { signal },
      );
      if (r.status >= 500) {
        // Transient infra/edge failure (Netlify 502 during cold-start,
        // 504 on upstream timeout, etc.) — fall through to retry.
        lastErr = new Error(`server ${r.status}`);
      } else {
        const payload = (await r.json().catch((err: unknown) => {
          console.warn("[hawkeye] useNewsSearch response parse failed:", err);
          return null;
        })) as
          | ({ ok: true } & NewsDossier)
          | { ok: false; error?: string; detail?: string }
          | null;
        if (!r.ok || !payload || !payload.ok) {
          // 4xx or malformed success — not retry-able; treat as empty.
          return emptyDossier(key);
        }
        const { ok: _ok, ...rest } = payload;
        void _ok;
        return rest as NewsDossier;
      }
    } catch (err) {
      if (signal.aborted) throw err;
      lastErr = err;
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (signal.aborted) throw new Error("aborted");
  }
  // Retries exhausted — surface the error so the UI does not silently
  // present a 502 or upstream failure as genuine absence of adverse media.
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr ?? "unknown error");
  throw new Error(`News service temporarily unavailable — manual search required (${msg})`);
}

export function useNewsSearch(subjectName: string | null): NewsSearchState {
  const [state, setState] = useState<NewsSearchState>({ status: "idle" });
  const key = subjectName?.trim() ?? "";

  useEffect(() => {
    if (!key) {
      setState({ status: "idle" });
      return;
    }
    const ac = new AbortController();
    setState({ status: "loading" });
    fetchDossier(key, ac.signal)
      .then((result) => {
        if (ac.signal.aborted) return;
        setState({ status: "success", result });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        // fetchDossier throws when retries are exhausted — surface the
        // error so the UI doesn't show "no adverse media" on a 502.
        const msg =
          err instanceof Error
            ? err.message
            : "News service temporarily unavailable — manual search required";
        setState({ status: "error", error: msg });
      });
    return () => ac.abort();
  }, [key]);

  return state;
}
