// POST /api/audit-trail/nl-search
//
// Natural-language → structured audit trail filter translator.
// Accepts a plain-English query and uses Claude to extract date ranges,
// event types, actor filters, and case IDs so analysts can query the
// audit chain without knowing the exact event schema.
//
// Returns:
//   { ok, filters: { from, to, events, actors, caseIds, tenants },
//     interpretation, confidence, auditRef }
//
// Charter P2: interpretation field always populated for auditor review.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { writeAuditEvent } from "@/lib/audit";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface AuditTrailFilters {
  from?: string;        // ISO 8601 datetime
  to?: string;          // ISO 8601 datetime
  events?: string[];    // e.g. ["screening.run", "ai.decision"]
  actors?: string[];    // key IDs or usernames
  caseIds?: string[];
  tenants?: string[];
  minSeverity?: "info" | "warn" | "error";
}

interface NlAuditResponse {
  ok: true;
  filters: AuditTrailFilters;
  interpretation: string;
  confidence: number;
  reasoning: string;
  degraded?: boolean;
  auditRef?: string;
}

// SYSTEM_PROMPT is a template — today's date is injected per-request via
// buildSystemPrompt() so warm-instance reuse never causes stale date parses.
const SYSTEM_PROMPT_TEMPLATE = `You are a UAE AML audit trail query parser. Parse a compliance officer's plain-English request into structured audit trail filters.

OUTPUT FORMAT — return ONLY this JSON object:
{
  "filters": {
    "from": "ISO 8601 datetime (optional) — start of date range",
    "to": "ISO 8601 datetime (optional) — end of date range",
    "events": ["array of event type patterns, e.g. screening.run, ai.decision, audit.verify (optional)"],
    "actors": ["array of actor IDs or usernames (optional)"],
    "caseIds": ["array of case IDs (optional)"],
    "tenants": ["array of tenant IDs (optional)"],
    "minSeverity": "info | warn | error (optional)"
  },
  "interpretation": "One sentence describing what the analyst is searching for",
  "confidence": 0.0-1.0,
  "reasoning": "One sentence explaining which fields were extracted and why"
}

DATE PARSING (relative to today __TODAY__):
- "today" → from: today 00:00 UTC, to: today 23:59 UTC
- "last week" / "past 7 days" → from: 7 days ago
- "last month" / "past 30 days" → from: 30 days ago
- "yesterday" → from/to: yesterday
- Specific date "May 15" → from: that date 00:00, to: that date 23:59

EVENT TYPE MAPPINGS:
- "screenings" / "screening runs" → events: ["screening.run"]
- "AI decisions" / "decisions" → events: ["ai.decision"]
- "sanctions" / "sanctions hits" → events: ["screening.sanctions_hit"]
- "goAML" / "STR filings" → events: ["goaml.submitted"]
- "approvals" / "sign-offs" → events: ["four-eyes.approved", "four-eyes.rejected"]
- "drift" / "model drift" → events: ["ai.model_drift_detected"]
- "bias" / "bias alerts" → events: ["ai.bias_detected"]
- "audit chain" / "chain writes" → events: ["audit-chain.write"]
- "hallucination" → events: ["ai.hallucination_detected"]
- "errors" / "failures" → minSeverity: "error"`;

function buildDeterministicFilters(userQuery: string): AuditTrailFilters {
  const lower = userQuery.toLowerCase();
  const filters: AuditTrailFilters = {};

  if (lower.includes("today")) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    filters.from = today.toISOString();
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    filters.to = end.toISOString();
  } else if (lower.includes("last week") || lower.includes("past 7")) {
    filters.from = new Date(Date.now() - 7 * 86400000).toISOString();
  } else if (lower.includes("last month") || lower.includes("past 30")) {
    filters.from = new Date(Date.now() - 30 * 86400000).toISOString();
  }

  if (lower.includes("screening")) filters.events = ["screening.run"];
  if (lower.includes("decision")) filters.events = [...(filters.events ?? []), "ai.decision"];
  if (lower.includes("error") || lower.includes("fail")) filters.minSeverity = "error";

  return filters;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { query?: string; q?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  const userQuery = sanitizeText(body.query ?? body.q);
  if (!userQuery || userQuery.trim().length < 3) {
    return NextResponse.json(
      { ok: false, error: "query is required (min 3 characters)" },
      { status: 400, headers: gate.headers },
    );
  }

  writeAuditEvent("analyst", "audit-trail.nl-search", userQuery.slice(0, 100));

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: true,
        filters: buildDeterministicFilters(userQuery),
        interpretation: `Audit trail query: "${userQuery.slice(0, 80)}"`,
        confidence: 0.4,
        reasoning: "Deterministic keyword extraction — set ANTHROPIC_API_KEY for AI-powered parsing.",
        degraded: true,
      } satisfies NlAuditResponse,
      { headers: gate.headers },
    );
  }

  try {
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("__TODAY__", new Date().toISOString().slice(0, 10));
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: sanitizeField(userQuery, 1000) }],
    });

    const raw = (response.content[0]?.type === "text" ? response.content[0].text : "{}").trim();
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const parsed = JSON.parse(stripped) as {
      filters: AuditTrailFilters;
      interpretation: string;
      confidence: number;
      reasoning: string;
    };

    const auditRef = await writeAuditChainEntry(
      {
        event: "audit_trail.nl_search_completed",
        actor: gate.keyId,
        query: userQuery.slice(0, 100),
        confidence: parsed.confidence,
        hasDateFilter: !!(parsed.filters?.from || parsed.filters?.to),
      },
      tenantIdFromGate(gate),
    ).then(() => "recorded").catch(() => undefined);

    return NextResponse.json(
      {
        ok: true,
        filters: parsed.filters,
        interpretation: parsed.interpretation,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        auditRef,
      } satisfies NlAuditResponse,
      { headers: gate.headers },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[audit-trail/nl-search] LLM parse failed:", msg);
    return NextResponse.json(
      {
        ok: true,
        filters: buildDeterministicFilters(userQuery),
        interpretation: `Audit trail query: "${userQuery.slice(0, 80)}"`,
        confidence: 0.3,
        reasoning: "LLM parse failed — using keyword fallback.",
        degraded: true,
      } satisfies NlAuditResponse,
      { headers: gate.headers },
    );
  }
}
