"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// Intel — live adverse-media ticker. Rolls the /api/news-search
// output for a configurable watchlist of names into a reverse-
// chronological feed grouped by severity. MLRO can click any
// article to open it or forward to screening.

interface Article {
  url: string;
  title: string;
  snippet?: string;
  pubDate?: string;
  source?: string;
  severity: "clear" | "low" | "medium" | "high" | "critical";
}

const STORAGE_KEY = "hawkeye.intel.watchlist";
const DEFAULTS = ["Nicolas Maduro", "Donald Trump", "Vladimir Putin"];

const SEV_TONE: Record<Article["severity"], string> = {
  clear: "bg-green-dim text-green",
  low: "bg-blue-dim text-blue",
  medium: "bg-amber-dim text-amber",
  high: "bg-orange-dim text-orange",
  critical: "bg-red text-white",
};

export default function IntelPage() {
  const [watch, setWatch] = useState<string[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setWatch(raw ? JSON.parse(raw) : DEFAULTS);
    } catch {
      setWatch(DEFAULTS);
    }
  }, []);

  const save = (list: string[]) => {
    setWatch(list);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* */
    }
  };

  const add = () => {
    if (!draft.trim()) return;
    save([...watch, draft.trim()]);
    setDraft("");
  };

  const remove = (name: string) => save(watch.filter((n) => n !== name));

  const sweep = async () => {
    setLoading(true);
    try {
      const all: Article[] = [];
      for (const name of watch) {
        const res = await fetch(`/api/news-search?q=${encodeURIComponent(name)}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) continue;
        const body = (await res.json()) as { articles?: Article[] };
        for (const a of body.articles ?? []) all.push(a);
      }
      all.sort((a, b) => {
        const order = ["clear", "low", "medium", "high", "critical"];
        return order.indexOf(b.severity) - order.indexOf(a.severity);
      });
      setArticles(all.slice(0, 60));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout narrow>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <ModuleHero
          eyebrow="Module 10 · Adverse-media Intel"
          title="Intel"
          titleEm="feed."
          intro={
            <>
              <strong>Real-time adverse-media sweep.</strong> Configure a
              watchlist of names; the brain polls Google News RSS,
              classifies every article via the 737-keyword taxonomy, and
              surfaces HIGH / CRITICAL items at the top.
            </>
          }
        />

        <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-6 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2">
              Watchlist
            </span>
            <button
              type="button"
              onClick={sweep}
              disabled={loading || watch.length === 0}
              className="text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40"
            >
              {loading ? "Sweeping…" : "Run sweep"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {watch.map((n) => (
              <span
                key={n}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-11 bg-brand-dim text-brand-deep"
              >
                {n}
                <button
                  type="button"
                  onClick={() => remove(n)}
                  className="text-ink-3 hover:text-red"
                  aria-label={`Remove ${n}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder="+ Add subject to watch"
              className="flex-1 text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0"
            />
            <button
              type="button"
              onClick={add}
              className="text-11 font-medium px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 hover:bg-bg-1"
            >
              Add
            </button>
          </div>
        </div>

        {articles.length === 0 ? (
          <div className="text-12 text-ink-2 py-8 text-center">
            Run a sweep to pull the latest adverse-media articles matching
            your watchlist. No articles yet.
          </div>
        ) : (
          <div className="space-y-2">
            {articles.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="block bg-bg-panel border border-hair-2 rounded-lg p-3 no-underline hover:border-brand transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-13 font-medium text-ink-0 flex-1">
                    {a.title}
                  </span>
                  <span
                    className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${SEV_TONE[a.severity]}`}
                  >
                    {a.severity}
                  </span>
                </div>
                {a.snippet && (
                  <div className="text-11 text-ink-2 mb-1 leading-snug">
                    {a.snippet}
                  </div>
                )}
                <div className="flex gap-3 font-mono text-10 text-ink-3">
                  {a.source && <span>{a.source}</span>}
                  {a.pubDate && <span>{a.pubDate}</span>}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
