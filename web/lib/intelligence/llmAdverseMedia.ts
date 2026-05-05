// Hawkeye Sterling — LLM-prompt-based adverse-media adapter.
//
// When keyword-search vendors miss niche cases (short-seller reports,
// class-action lawsuits, foreign-language press, recently-listed
// entities), this adapter prompts Claude directly using the operator's
// existing ANTHROPIC_API_KEY. Claude's January-2026 knowledge cutoff
// means it knows about most adverse-media events through that date.
//
// The model is instructed to return STRUCTURED JSON only — never free
// text — so we can fold its findings into the consensus engine.
// Returns the canonical NewsArticle shape so callers slot it into
// searchAllNews() unchanged.
//
// Real-world cases this catches that GDELT misses:
//   - Marex Financial (Ningi Research short-seller report Aug 2025)
//   - Ourominas DTVM (ReporterBrasil illegal-gold investigation 2021)
//   - Istanbul Gold Refinery / Halaç family (Patronlar Dünyası)

import type { NewsAdapter, NewsArticle } from "./newsAdapters";
import { NULL_NEWS_ADAPTER } from "./newsAdapters";
import { getAnthropicClient } from "@/lib/server/llm";
import { AML_KEYWORDS_EN } from "./amlKeywords";

const TIMEOUT_MS = 35_000;

interface ClaudeAdverseMediaItem {
  headline?: string;
  outlet?: string;
  approxDate?: string;
  url?: string;
  summary?: string;
  category?: string;          // sanctions | fraud | money_laundering | corruption | lawsuit | regulatory | indictment | adverse_media
  severity?: "high" | "medium" | "low";
}

interface ClaudeAdverseMediaResponse {
  found: boolean;
  confidence: "high" | "medium" | "low";
  items?: ClaudeAdverseMediaItem[];
  notes?: string;
}

const SYSTEM_PROMPT = `You are an AML / sanctions adverse-media analyst at a regulated UAE financial institution. Your job is to recall any publicly-reported adverse media about a named subject — sanctions, fraud, money laundering, corruption, lawsuits, regulatory enforcement, criminal indictments, short-seller reports, investigative journalism findings — based on your training data through January 2026.

You MUST respond ONLY with valid JSON matching this exact schema, no commentary, no markdown fences:
{
  "found": true | false,
  "confidence": "high" | "medium" | "low",
  "items": [
    {
      "headline": "string",
      "outlet": "string (publisher name or domain)",
      "approxDate": "YYYY-MM or YYYY-MM-DD",
      "url": "string (only if you remember the canonical URL)",
      "summary": "string (1-2 sentences)",
      "category": "sanctions | fraud | money_laundering | corruption | lawsuit | regulatory | indictment | short_seller | investigation | adverse_media",
      "severity": "high | medium | low"
    }
  ],
  "notes": "optional clarification (e.g. ambiguity about which entity)"
}

Rules:
- If you have no knowledge or the subject is too generic to disambiguate, return { "found": false, "confidence": "low" }.
- Cite only adverse media you actually recall — DO NOT fabricate URLs or outlet names. If unsure, omit the url field.
- Distinguish between subject and similarly-named third parties — if name is ambiguous, set confidence="low" and note it.
- Prefer multiple item objects over one summary so each event can be scored independently.
- Cover non-English press where you recall coverage (Reuters, FT, Bloomberg, Reporter Brasil, Folha, Patronlar Dünyası, OCCRP, ICIJ, Al Jazeera, Reuters EM, etc.).
- Include short-seller reports (Hindenburg, Muddy Waters, Citron, Ningi, Iceberg, Bonitas) as adverse media.

Look for any of these red-flag categories specifically (FATF predicate offences + sanctions/CFT + market conduct):
${AML_KEYWORDS_EN.slice(0, 80).join(", ")}.`;

function buildUserPrompt(subjectName: string, jurisdiction?: string, entityType?: string): string {
  const ctx = [
    `Subject: "${subjectName}"`,
    jurisdiction ? `Jurisdiction: ${jurisdiction}` : "",
    entityType ? `Entity type: ${entityType}` : "",
  ].filter(Boolean).join("\n");
  return `${ctx}\n\nReturn the JSON object now.`;
}

function parseClaudeResponse(text: string): ClaudeAdverseMediaResponse | null {
  // Strip markdown fences if Claude emits any
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  // Extract first {...} block
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as ClaudeAdverseMediaResponse;
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof parsed.found !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The adapter is gated on the existing ANTHROPIC_API_KEY (already used
 * for adverse-media-live's enrichment). Default-on when the key is
 * present; opt out with LLM_ADVERSE_MEDIA_DISABLED=1.
 */
export function llmAdverseMediaAdapter(opts: { jurisdiction?: string; entityType?: string } = {}): NewsAdapter {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NULL_NEWS_ADAPTER;
  const disabled = process.env["LLM_ADVERSE_MEDIA_DISABLED"];
  if (disabled === "1" || disabled?.toLowerCase() === "true") return NULL_NEWS_ADAPTER;

  return {
    isAvailable: () => true,
    search: async (subjectName, _query) => {
      void _query;
      try {
        const client = getAnthropicClient(apiKey, TIMEOUT_MS);
        const msg = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserPrompt(subjectName, opts.jurisdiction, opts.entityType) }],
        });
        const text = msg.content.find((b) => b.type === "text")?.text ?? "";
        const parsed = parseClaudeResponse(text);
        if (!parsed || !parsed.found || !parsed.items) return [];

        // Convert each item into a NewsArticle. Url is required by the
        // NewsArticle shape — we synthesize a deterministic placeholder
        // when Claude doesn't recall the canonical URL so the dedupe
        // key remains stable.
        return parsed.items.map((it, i) => {
          const url = it.url && /^https?:\/\//i.test(it.url)
            ? it.url
            : `claude://adverse-media/${encodeURIComponent(subjectName)}/${i}`;
          const severityWeight = it.severity === "high" ? -0.7 : it.severity === "medium" ? -0.4 : -0.2;
          return {
            source: "claude-adverse-media",
            outlet: it.outlet ?? "claude-llm-recall",
            title: it.headline ?? `${it.category ?? "adverse-media"}: ${subjectName}`,
            url,
            publishedAt: it.approxDate ?? new Date().toISOString(),
            ...(it.summary ? { snippet: it.summary } : {}),
            sentiment: severityWeight,
          } as NewsArticle;
        });
      } catch (err) {
        console.warn("[claude-adverse-media] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}
