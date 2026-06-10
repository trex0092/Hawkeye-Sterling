// Hawkeye Sterling — Google AI Mode OSINT Adapter
//
// Wires the PleasePrompto/google-ai-mode-mcp tool (or Google Custom Search
// API) into the screening pipeline. Every screen fires a synthesised Google AI
// query and merges the results into the brain's adverse-media evidence corpus.
//
// Configuration (priority order):
//   1. GOOGLE_AI_MODE_MCP_URL — base URL of a running google-ai-mode-mcp
//      HTTP server (e.g. https://your-mcp.example.com). The adapter POSTs
//      to {GOOGLE_AI_MODE_MCP_URL}/search with { "query": "..." }.
//   2. GOOGLE_SEARCH_API_KEY + GOOGLE_CSE_ID — Google Custom Search API
//      (free tier: 100 req/day; paid: 10,000/day).
//
// When neither is configured the adapter returns isAvailable()=false and
// the screening pipeline skips it — no side effects, no errors.

import { NULL_NEWS_ADAPTER, type NewsAdapter, type NewsArticle } from "./newsAdapters";

// Must fit inside quick-screen's LLM adapter race (2.5s) plus the
// post-response completion window — see llmAdverseMedia.ts.
const TIMEOUT_MS = 4_000;

interface McpSearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  source?: string;
  date?: string;
}

interface McpSearchResponse {
  results?: McpSearchResult[];
  query?: string;
  error?: string;
}

interface GoogleCseItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
}

interface GoogleCseResponse {
  items?: GoogleCseItem[];
  error?: { message?: string };
}

function abortable<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`google-ai-mode exceeded ${ms}ms`)), ms),
    ),
  ]);
}

function buildAmlQuery(subjectName: string, jurisdiction?: string): string {
  const jx = jurisdiction ? ` ${jurisdiction}` : "";
  return `"${subjectName}"${jx} (sanctions OR fraud OR money laundering OR corruption OR indictment OR regulatory enforcement OR adverse media OR "FinCEN" OR OFAC OR "money laundering" OR "bribery" OR "financial crime")`;
}

function mcpAdapter(mcpUrl: string): NewsAdapter {
  const base = mcpUrl.replace(/\/+$/, "");
  return {
    source: "google-ai-mode-mcp",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      const query = buildAmlQuery(subjectName);
      try {
        const res = await abortable(
          fetch(`${base}/search`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query, limit: opts?.limit ?? 10 }),
          }),
        );
        if (!res.ok) {
          console.warn(`[google-ai-mode-mcp] HTTP ${res.status}`);
          return [];
        }
        const data = (await res.json()) as McpSearchResponse;
        if (!Array.isArray(data.results)) return [];
        return data.results.map((r): NewsArticle => ({
          source: "google-ai-mode",
          outlet: r.source ?? r.url?.replace(/^https?:\/\/([^/]+).*/, "$1") ?? "google-ai",
          title: r.title ?? subjectName,
          url: r.url ?? "",
          publishedAt: r.date ?? new Date().toISOString(),
          snippet: r.snippet,
          language: "en",
          relevanceScore: 0.85,
        }));
      } catch (err) {
        console.warn("[google-ai-mode-mcp] search failed:", err instanceof Error ? err.message : String(err));
        return [];
      }
    },
  };
}

function googleCseAdapter(apiKey: string, cseId: string): NewsAdapter {
  return {
    source: "google-cse",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      const query = buildAmlQuery(subjectName);
      try {
        const params = new URLSearchParams({
          key: apiKey,
          cx: cseId,
          q: query,
          num: String(Math.min(opts?.limit ?? 10, 10)),
        });
        const res = await abortable(
          fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`),
        );
        if (!res.ok) {
          console.warn(`[google-cse] HTTP ${res.status}`);
          return [];
        }
        const data = (await res.json()) as GoogleCseResponse;
        if (!Array.isArray(data.items)) return [];
        return data.items.map((item): NewsArticle => ({
          source: "google-cse",
          outlet: item.displayLink ?? item.link?.replace(/^https?:\/\/([^/]+).*/, "$1") ?? "google",
          title: item.title ?? subjectName,
          url: item.link ?? "",
          publishedAt: new Date().toISOString(),
          snippet: item.snippet,
          language: "en",
          relevanceScore: 0.8,
        }));
      } catch (err) {
        console.warn("[google-cse] search failed:", err instanceof Error ? err.message : String(err));
        return [];
      }
    },
  };
}

export function googleAiModeAdapter(): NewsAdapter {
  const mcpUrl = process.env["GOOGLE_AI_MODE_MCP_URL"];
  if (mcpUrl) return mcpAdapter(mcpUrl);

  const apiKey = process.env["GOOGLE_SEARCH_API_KEY"];
  const cseId = process.env["GOOGLE_CSE_ID"] ?? process.env["GOOGLE_SEARCH_CSE_ID"];
  if (apiKey && cseId) return googleCseAdapter(apiKey, cseId);

  return NULL_NEWS_ADAPTER;
}

export function isGoogleAiModeAvailable(): boolean {
  return !!(
    process.env["GOOGLE_AI_MODE_MCP_URL"] ||
    (process.env["GOOGLE_SEARCH_API_KEY"] && (process.env["GOOGLE_CSE_ID"] ?? process.env["GOOGLE_SEARCH_CSE_ID"]))
  );
}
