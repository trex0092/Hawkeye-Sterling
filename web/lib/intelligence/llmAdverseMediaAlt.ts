// Hawkeye Sterling — alternative free AI adverse-media adapters.
//
// Groq (LLaMA 3.3 70B) and Google Gemini Flash — both free-tier APIs
// that require only a free API key. They use the same JSON schema as
// the Claude (llmAdverseMedia.ts) adapter so results merge cleanly
// into the consensus engine.
//
// Env vars:
//   GROQ_API_KEY       — from console.groq.com (free, 30 req/min)
//   GEMINI_API_KEY     — from aistudio.google.com (free, 1500 req/day)
//
// Each adapter is independently gated and gracefully returns [] on any error.

import { NULL_NEWS_ADAPTER, type NewsAdapter, type NewsArticle } from "./newsAdapters";
import { AML_KEYWORDS_EN } from "./amlKeywords";

const TIMEOUT_MS = 12_000;

interface AiAdverseMediaItem {
  headline?: string;
  outlet?: string;
  approxDate?: string;
  url?: string;
  summary?: string;
  category?: string;
  severity?: "high" | "medium" | "low";
}

interface AiAdverseMediaResponse {
  found: boolean;
  confidence: "high" | "medium" | "low";
  items?: AiAdverseMediaItem[];
  notes?: string;
}

const SYSTEM_PROMPT = `You are an AML / sanctions adverse-media analyst. Recall adverse media about the named subject — sanctions, fraud, money laundering, corruption, lawsuits, regulatory enforcement, criminal indictments, short-seller reports, investigative journalism — from your training data.

Respond ONLY with valid JSON, no markdown fences:
{
  "found": true | false,
  "confidence": "high" | "medium" | "low",
  "items": [
    {
      "headline": "string",
      "outlet": "string",
      "approxDate": "YYYY-MM or YYYY-MM-DD",
      "url": "string (only if you recall the canonical URL)",
      "summary": "string (1-2 sentences)",
      "category": "sanctions | fraud | money_laundering | corruption | lawsuit | regulatory | indictment | short_seller | investigation | adverse_media",
      "severity": "high | medium | low"
    }
  ],
  "notes": "optional clarification"
}

Rules: Only cite what you actually recall. Do not fabricate URLs. If name is ambiguous, set confidence="low".
Focus on: ${AML_KEYWORDS_EN.slice(0, 60).join(", ")}.`;

function buildUserMsg(subjectName: string): string {
  return `Subject: "${subjectName}"\n\nReturn the JSON object now.`;
}

function parseAiResponse(text: string): AiAdverseMediaResponse | null {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as AiAdverseMediaResponse;
    if (typeof parsed !== "object" || parsed === null || typeof parsed.found !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

function itemsToArticles(items: AiAdverseMediaItem[], subjectName: string, source: string): NewsArticle[] {
  return items.map((it, i) => {
    const url = it.url && /^https?:\/\//i.test(it.url)
      ? it.url
      : `${source}://adverse-media/${encodeURIComponent(subjectName)}/${i}`;
    const severityWeight = it.severity === "high" ? -0.7 : it.severity === "medium" ? -0.4 : -0.2;
    return {
      source,
      outlet: it.outlet ?? `${source}-recall`,
      title: it.headline ?? `${it.category ?? "adverse-media"}: ${subjectName}`,
      url,
      publishedAt: it.approxDate ?? new Date().toISOString(),
      ...(it.summary ? { snippet: it.summary } : {}),
      sentiment: severityWeight,
    } as NewsArticle;
  });
}

// ── Groq — LLaMA 3.3 70B Versatile (free, 30 req/min) ───────────────
export function groqAdverseMediaAdapter(): NewsAdapter {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) return NULL_NEWS_ADAPTER;
  const disabled = process.env["GROQ_ADVERSE_MEDIA_DISABLED"];
  if (disabled === "1" || disabled?.toLowerCase() === "true") return NULL_NEWS_ADAPTER;

  return {
    isAvailable: () => true,
    search: async (subjectName) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 1200,
            temperature: 0.1,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: buildUserMsg(subjectName) },
            ],
          }),
        }).finally(() => clearTimeout(timer));
        if (!res.ok) return [];
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = json.choices?.[0]?.message?.content ?? "";
        const parsed = parseAiResponse(text);
        if (!parsed || !parsed.found || !parsed.items?.length) return [];
        return itemsToArticles(parsed.items, subjectName, "groq-adverse-media");
      } catch (err) {
        console.warn("[groq-adverse-media] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Google Gemini Flash — free 1500 req/day ──────────────────────────
export function geminiAdverseMediaAdapter(): NewsAdapter {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) return NULL_NEWS_ADAPTER;
  const disabled = process.env["GEMINI_ADVERSE_MEDIA_DISABLED"];
  if (disabled === "1" || disabled?.toLowerCase() === "true") return NULL_NEWS_ADAPTER;

  return {
    isAvailable: () => true,
    search: async (subjectName) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildUserMsg(subjectName)}` }],
              },
            ],
            generationConfig: { maxOutputTokens: 1200, temperature: 0.1 },
          }),
        }).finally(() => clearTimeout(timer));
        if (!res.ok) return [];
        const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const parsed = parseAiResponse(text);
        if (!parsed || !parsed.found || !parsed.items?.length) return [];
        return itemsToArticles(parsed.items, subjectName, "gemini-adverse-media");
      } catch (err) {
        console.warn("[gemini-adverse-media] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}
