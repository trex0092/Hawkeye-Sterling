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
}

export interface NewsDossier {
  subject: string;
  articleCount: number;
  topSeverity: NewsArticle["severity"];
  keywordGroupCounts: Array<{ group: string; label: string; count: number }>;
  esgDomains: string[];
  articles: NewsArticle[];
  source: "google-news-rss" | "newsapi";
}

export type NewsSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: NewsDossier }
  | { status: "error"; error: string };

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
    fetch(`/api/news-search?q=${encodeURIComponent(key)}`, { signal: ac.signal })
      .then(async (r) => {
        const payload = (await r.json()) as
          | ({ ok: true } & NewsDossier)
          | { ok: false; error: string; detail?: string };
        if (!payload.ok) {
          setState({
            status: "error",
            error: payload.detail ?? payload.error ?? "unknown",
          });
          return;
        }
        const { ok: _ok, ...rest } = payload;
        void _ok;
        setState({ status: "success", result: rest as NewsDossier });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setState({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => ac.abort();
  }, [key]);

  return state;
}
