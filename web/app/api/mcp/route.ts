// POST /api/mcp  — Hawkeye Sterling MCP server (Streamable HTTP, stateless)
//
// Implements the MCP JSON-RPC 2.0 protocol directly without the SDK transport
// layer so it works reliably on Netlify's serverless functions.
//
// Add to Claude.ai → Settings → Connectors:
//   URL: https://hawkeye-sterling.netlify.app/api/mcp
//
// Kill switch: set MCP_ENABLED=false in Netlify env vars to instantly disable
// all 28 tools. Set back to true (or remove) to re-enable.

import { AsyncLocalStorage } from "node:async_hooks";
import { getToolLevel } from "@/lib/mcp/tool-manifest";
import type { ConsequenceLevel } from "@/lib/mcp/tool-manifest";
import { getSanctionsHealth, GATE_BLOCKED_TOOLS } from "@/lib/mcp/sanctions-gate";
import {
  checkAndIncrementRate,
  isBreakerOpen,
  recordBreakerSuccess,
  recordBreakerFailure,
} from "@/lib/mcp/shared-state";
import { resolveCommitRef, resolveEngineVersion } from "@/lib/server/api-error";
import type { McpLogEntry } from "@/app/api/operator/logs/route";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Per-class timeouts (Control 2.03) ────────────────────────────────────────
const CLASS_TIMEOUT_MS: Record<ConsequenceLevel, number> = {
  "read-only":  15_000,
  "supervised": 45_000,
  "action":     55_000,
};

// ── Rate limiter + circuit breaker ───────────────────────────────────────────
// Both live in @/lib/mcp/shared-state now (Blobs-backed with a short-lived
// in-process cache). Previously these were module-level Maps which meant
// each warm Lambda instance had its own counter — effective rate cap was
// N × configured-limit where N = warm instance count. Same for the breaker:
// one instance's failures didn't trip others. See shared-state.ts for the
// consistency / latency trade-offs.

// ── Prompt injection detection (Control 13.03/13.07) ─────────────────────────
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /you\s+are\s+now\s+a/i,
  /act\s+as\s+if\s+you/i,
  /disregard\s+your\s+(previous\s+)?instructions?/i,
  /forget\s+everything/i,
  /\[INST\]/,
  /<\|system\|>/,
  /###\s*INSTRUCTION/i,
  /---\s*SYSTEM\s*PROMPT/i,
  /override\s+(safety|security|compliance)\s+mode/i,
];

function detectInjection(input: string): boolean {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  return INJECTION_PATTERNS.some(p => p.test(s));
}

function scanArgsForInjection(args: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(args)) {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (s.length > 0 && detectInjection(s)) return k;
  }
  return null;
}

// ── Governance wrapper (Controls 2.05, 12.04) ─────────────────────────────────
// Injects confidence score, human-review flag, and provenance onto supervised outputs.
function wrapWithGovernance(
  toolName: string,
  level: ConsequenceLevel,
  result: unknown,
  durationMs: number,
  listsVerified: boolean,
  missingLists: string[],
): unknown {
  if (level === "read-only") return result;
  if (typeof result !== "object" || result === null) return result;

  const r = result as Record<string, unknown>;
  let confidenceScore = 0.75;
  if (typeof r["confidence"] === "number")   confidenceScore = r["confidence"];
  else if (typeof r["riskScore"] === "number") {
    const rs = r["riskScore"] as number;
    confidenceScore = rs > 70 ? 0.85 : rs > 40 ? 0.75 : 0.65;
  }

  // ── Degraded-service surfacing (audit H-2) ─────────────────────────────────
  // Tools previously emitted retrievalGroundedValidation.passed=false alongside
  // verification.passed=true and humanReviewRequired=true at the same flat
  // confidence — the two validators silently disagreed. Lift any layer-2 RGV
  // failure into _governance so the operator dashboard can render it, and
  // downgrade confidenceScore proportionally to the defect rate.
  const degradedServices: string[] = [];
  let rgvDefects: number | null = null;
  let rgvUngroundedClaims: number | null = null;
  const rgv = r["retrievalGroundedValidation"];
  if (rgv && typeof rgv === "object") {
    const rgvObj = rgv as Record<string, unknown>;
    const rgvPassed = rgvObj["passed"];
    if (rgvPassed === false) {
      degradedServices.push("rag_grounding");
      rgvDefects = typeof rgvObj["defectCount"] === "number" ? (rgvObj["defectCount"] as number) : null;
      rgvUngroundedClaims = typeof rgvObj["ungroundedClaimCount"] === "number"
        ? (rgvObj["ungroundedClaimCount"] as number)
        : null;
      // Confidence haircut. 0 defects = no haircut; ≥10 defects = capped at 0.5.
      // Linear interpolation in between. This is a heuristic — the regulator
      // still requires MLRO sign-off either way (humanReviewRequired=true).
      const defects = rgvDefects ?? 0;
      const haircut = Math.min(defects / 10, 1) * 0.25;
      confidenceScore = Math.max(0.5, confidenceScore - haircut);
    }
  }
  // LISTS_MISSING surfacing — when the brain ran on incomplete sanctions data
  // it's a degraded service even if the underlying tool returned 200 with a
  // well-formed body. listsVerified is the canonical signal from upstream.
  if (!listsVerified || missingLists.length > 0) {
    degradedServices.push("sanctions_lists");
  }

  const engineVersion = resolveEngineVersion();
  const commitRef = resolveCommitRef();
  const generatedAt = new Date().toISOString();

  return {
    ...r,
    // F-07 / E-05 — top-level standard fields on every non-read-only response
    tool: r["tool"] ?? toolName,
    engineVersion: r["engineVersion"] ?? engineVersion,
    commitRef: r["commitRef"] ?? commitRef,
    generatedAt: r["generatedAt"] ?? generatedAt,
    latencyMs: r["latencyMs"] ?? durationMs,
    // F-07 top-level _provenance (listsVerified / missingLists required by spec)
    _provenance: {
      ...(typeof r["_provenance"] === "object" && r["_provenance"] !== null
        ? (r["_provenance"] as Record<string, unknown>)
        : {}),
      listsVerified,
      missingLists,
    },
    _governance: {
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      humanReviewRequired: true,
      consequenceLevel: level,
      reviewNote: "AI-generated output — MLRO review required before any compliance action. FDL No.10/2025 Art.18.",
      ...(degradedServices.length > 0 ? { degradedServices } : {}),
      ...(rgvDefects !== null ? { rgvDefects } : {}),
      ...(rgvUngroundedClaims !== null ? { rgvUngroundedClaims } : {}),
      _provenance: {
        tool: toolName,
        engineVersion,
        commitRef,
        generatedAt,
        dataSources: ["ofac-sdn", "eu-fsf", "uk-ofsi", "uae-eocn", "uae-ltl", "un-consolidated", "gdelt", "google-news-rss"],
      },
    },
  };
}

// ── Anomaly detection (Controls 21.08/16.01) ─────────────────────────────────
// Baseline: ≤30 calls per 5-min window per session is normal. Alert at >50.
interface SessionWindow { calls: number; actionCalls: number; windowStart: number; flagged: boolean }
const _sessionWindows = new Map<string, SessionWindow>();

function trackAndDetectAnomaly(sessionId: string, toolName: string, level: ConsequenceLevel): string | null {
  const now = Date.now();
  const win = _sessionWindows.get(sessionId) ?? { calls: 0, actionCalls: 0, windowStart: now, flagged: false };
  if (now - win.windowStart >= 5 * 60_000) {
    // New window
    win.calls = 1;
    win.actionCalls = level === "action" ? 1 : 0;
    win.windowStart = now;
    win.flagged = false;
  } else {
    win.calls++;
    if (level === "action") win.actionCalls++;
  }
  _sessionWindows.set(sessionId, win);

  if (!win.flagged && win.calls > 50) {
    win.flagged = true;
    void writeAnomaly({ sessionId, type: "high_volume", toolName, calls: win.calls, windowMs: now - win.windowStart });
    return `session exceeded 50 calls in 5-minute window (${win.calls} calls)`;
  }
  if (!win.flagged && win.actionCalls > 5) {
    win.flagged = true;
    void writeAnomaly({ sessionId, type: "action_burst", toolName, actionCalls: win.actionCalls });
    return `session triggered ${win.actionCalls} action-level calls in 5 minutes`;
  }
  return null;
}

async function writeAnomaly(data: Record<string, unknown>): Promise<void> {
  try {
    const mod = await import("@netlify/blobs").catch(() => null);
    if (!mod) return;
    const store = mod.getStore({ name: "mcp-anomaly-logs" });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await store.setJSON(`anomaly/${ts}-${Math.random().toString(36).slice(2, 8)}`, {
      ...data,
      detectedAt: new Date().toISOString(),
    });
  } catch { /* never blocks */ }
}

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "hawkeye-sterling";
const SERVER_VERSION = "1.0.0";

// NEXT_PUBLIC_APP_URL can be empty string, "undefined", or missing protocol —
// validate it and always fall back to the hardcoded production URL.
const FALLBACK_URL = "https://hawkeye-sterling.netlify.app";
function resolveBaseUrl(): string {
  const raw = process.env["NEXT_PUBLIC_APP_URL"];
  if (!raw) return FALLBACK_URL;
  try {
    const u = new URL(raw);
    return u.origin; // e.g. "https://hawkeye-sterling.netlify.app"
  } catch {
    return FALLBACK_URL;
  }
}
const BASE_URL = resolveBaseUrl();

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-session-id",
};

// ── Sanctions-health cache (audit follow-up) ──────────────────────────────────
// getSanctionsHealth() makes an internal fetch on every gated tool call.
// Memoise for 30 s so a burst of screening calls in the same warm Lambda
// shares one round-trip instead of N. The TTL is short enough that a
// cron-driven sanctions refresh becomes visible within one window.
interface CachedSanctionsHealth {
  result: Awaited<ReturnType<typeof getSanctionsHealth>>;
  expiresAt: number;
}
let _sanctionsHealthCache: CachedSanctionsHealth | null = null;
const SANCTIONS_HEALTH_TTL_MS = 30_000;

async function getSanctionsHealthMemoised(): Promise<Awaited<ReturnType<typeof getSanctionsHealth>>> {
  const now = Date.now();
  if (_sanctionsHealthCache && now < _sanctionsHealthCache.expiresAt) {
    return _sanctionsHealthCache.result;
  }
  const result = await getSanctionsHealth();
  _sanctionsHealthCache = { result, expiresAt: now + SANCTIONS_HEALTH_TTL_MS };
  return result;
}

// ── Session-id resolution (audit follow-up) ───────────────────────────────────
// Anomaly buckets are keyed by sessionId. When MCP clients omit the
// `_sessionId` param the prior implementation coalesced every anonymous
// caller into "default" — which then trivially trips the >50-calls-per-5min
// threshold from unrelated traffic. Derive a stable per-caller id from the
// X-Forwarded-For chain so each remote IP gets its own bucket. Strip the
// last octet so the id is not a PII-grade IP record in the anomaly logs.
function deriveSessionId(req: Request, explicit?: string): string {
  if (explicit) return explicit;
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim() ?? "";
  if (!first) return "anonymous";
  // IPv4: 1.2.3.4 → 1.2.3 ; IPv6: keep first 4 groups
  if (first.includes(":")) {
    return first.split(":").slice(0, 4).join(":") || "anonymous";
  }
  const parts = first.split(".");
  return parts.length >= 3 ? parts.slice(0, 3).join(".") : "anonymous";
}

// ── Body-size guard (audit follow-up) ─────────────────────────────────────────
// req.json() will happily attempt to parse a multi-MB body. Netlify caps at
// 6 MB but we want a smaller explicit guard — MCP JSON-RPC bodies are
// typically <100 KB. Reject anything over 1 MB up front so a single bad
// caller cannot tie up Lambda memory parsing junk.
const MAX_BODY_BYTES = 1_000_000;

// ── Activity logger ───────────────────────────────────────────────────────────
// Writes one blob per tool call to "mcp-activity-logs" store.
// Fire-and-forget — never throws, never blocks the tool response.
async function logToolCall(entry: McpLogEntry): Promise<void> {
  try {
    const mod = await import("@netlify/blobs").catch(() => null);
    if (!mod) return;
    const store = mod.getStore({ name: "mcp-activity-logs" });
    // Key format: entry/YYYY-MM-DDTHH-MM-SS-mmmZ-{id}
    // Lexicographic sort = chronological order; prefix "entry/" for easy listing.
    const key = `entry/${entry.timestamp.replace(/[:.]/g, "-")}-${entry.id}`;
    await store.setJSON(key, entry);
  } catch (err) {
    console.warn("[mcp] activity log persist failed:", err instanceof Error ? err.message : err);
  }
}

function summarise(value: unknown, maxLen = 200): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

// Per-request context stored in AsyncLocalStorage so concurrent requests
// don't share state (eliminates auth header and timeout cross-contamination).
// sessionId is captured here so dispatch() can attribute anomaly events
// without needing to thread the Request object through every layer.
interface CallCtx { authHeader?: string; timeoutMs?: number; sessionId?: string }
const _callCtx = new AsyncLocalStorage<CallCtx>();

// ── Internal API proxy ────────────────────────────────────────────────────────
//
// Self-fetch reliability on Netlify Lambdas has been historically flaky:
// outbound HTTP from a Lambda back to its own public origin sometimes fails
// the TLS handshake (~200 ms, generic "fetch failed") even though the
// underlying service is healthy. The symptom is observed as cold-start MCP
// timeouts (system_status / audit_trail). Retry once-with-backoff on
// connection-level failures only. Do NOT retry on:
//   · Timeouts — the AbortSignal fired; retrying inside the same parent
//     deadline would just compound the delay.
//   · Non-success HTTP status — that's an upstream service decision, not a
//     transient connection failure.

const CALLAPI_MAX_ATTEMPTS = 3;
const CALLAPI_RETRY_BACKOFF_MS = [100, 250]; // applied before attempt 2, 3

function isTransientFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Node fetch surfaces network-level failures as TypeError with cause set
  // to ECONNRESET / ENOTFOUND / EAI_AGAIN / etc. Message "fetch failed" is
  // the canonical Netlify Lambda self-fetch handshake failure.
  const msg = err.message.toLowerCase();
  if (msg.includes("fetch failed")) return true;
  if (msg.includes("econnreset")) return true;
  if (msg.includes("econnrefused")) return true;
  if (msg.includes("etimedout") && !msg.includes("aborted")) return true;
  if (msg.includes("enotfound")) return true;
  if (msg.includes("eai_again")) return true;
  if (msg.includes("socket hang up")) return true;
  return false;
}

function isAbortLike(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    err.message.includes("aborted") ||
    err.message.includes("timed out");
}

async function callApi(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  query?: Record<string, string>,
  timeoutMs?: number,
): Promise<unknown> {
  let url: URL;
  try {
    url = new URL(path, BASE_URL);
  } catch {
    return { ok: false, error: `URL construction failed: path="${path}" base="${BASE_URL}"` };
  }
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  const ctx = _callCtx.getStore();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(ctx?.authHeader ? { authorization: ctx.authHeader } : {}),
  };
  const init: RequestInit = {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs ?? ctx?.timeoutMs ?? 55_000),
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= CALLAPI_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url.toString(), init);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        const text = await res.text().catch(() => "");
        return {
          ok: res.ok,
          status: res.status,
          format: ct.includes("text/html") ? "html" : "text",
          message: `Report generated (${text.length} bytes). Open the Hawkeye Sterling web interface to view the full rendered report.`,
        };
      }
      return await res.json().catch(() => ({ ok: res.ok, status: res.status }));
    } catch (err) {
      lastError = err;
      // Timeout → caller is past its budget. Don't retry.
      if (isAbortLike(err)) {
        return {
          ok: false,
          degraded: true,
          error: `Tool timed out — the upstream service did not respond within the allowed window. Manual MLRO review is required for any case affected by this outage.`,
          _governance: { humanReviewRequired: true, degradedService: path },
          attempts: attempt,
        };
      }
      // Transient connection error → retry with backoff.
      if (isTransientFetchError(err) && attempt < CALLAPI_MAX_ATTEMPTS) {
        const wait = CALLAPI_RETRY_BACKOFF_MS[attempt - 1] ?? 250;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      // Non-transient or out of attempts → bubble up.
      break;
    }
  }

  return {
    ok: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    attempts: CALLAPI_MAX_ATTEMPTS,
  };
}

// ── Tool definitions ──────────────────────────────────────────────────────────
interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const TOOLS: ToolDef[] = [
  // ── SCREENING ───────────────────────────────────────────────────────────────
  {
    name: "screen_subject",
    description:
      "Screen a single subject against sanctions lists, PEP registers, and adverse media. Returns risk score, severity, hit list, and AI reasoning.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the subject" },
        entityType: {
          type: "string",
          enum: ["individual", "organisation", "vessel", "aircraft", "other"],
          description: "Entity type",
        },
        jurisdiction: { type: "string", description: "Country / jurisdiction, e.g. Russia" },
        aliases: { type: "array", items: { type: "string" }, description: "Known aliases" },
        dob: { type: "string", description: "Date of birth YYYY-MM-DD (individuals)" },
        idNumber: { type: "string", description: "Passport or trade licence number" },
      },
      required: ["name"],
    },
    handler: async (args) => callApi("/api/quick-screen", "POST", { subject: args }),
  },
  {
    name: "batch_screen",
    description: "Screen multiple subjects in one call. Returns a result per subject plus a summary.",
    inputSchema: {
      type: "object",
      properties: {
        subjects: {
          type: "array",
          description: "List of subjects to screen (up to 10,000)",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              entityType: { type: "string" },
              jurisdiction: { type: "string" },
              aliases: { type: "array", items: { type: "string" } },
              dob: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      required: ["subjects"],
    },
    handler: async (args) =>
      callApi("/api/batch-screen", "POST", { rows: args["subjects"] }),
  },
  {
    name: "super_brain",
    description:
      "Full deep-analysis: composite risk score, PEP assessment, jurisdiction profile, adverse media scoring, typology matching, ESG, redlines, and audit rationale.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        entityType: { type: "string" },
        jurisdiction: { type: "string" },
        aliases: { type: "array", items: { type: "string" } },
        adverseMediaText: { type: "string", description: "Pre-fetched adverse media text" },
      },
      required: ["name"],
    },
    handler: async ({ adverseMediaText, ...subject }) =>
      callApi("/api/super-brain", "POST", {
        subject,
        ...(adverseMediaText ? { adverseMediaText } : {}),
      }),
  },
  {
    name: "smart_disambiguate",
    description:
      "Disambiguate screening hits against a client profile. Provide client identity fields and the hits array from a prior sanctions/PEP screen.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Client full name" },
        nationality: { type: "string" },
        dob: { type: "string", description: "Date of birth YYYY-MM-DD" },
        gender: { type: "string" },
        idNumber: { type: "string" },
        occupation: { type: "string" },
        context: { type: "string" },
        hits: {
          type: "array",
          description: "Screening hits to disambiguate — from a prior screen_subject or batch_screen call",
          items: {
            type: "object",
            properties: {
              hitId: { type: "string" },
              hitName: { type: "string" },
              hitCategory: { type: "string" },
              hitCountry: { type: "string" },
              hitDob: { type: "string" },
              matchScore: { type: "number" },
            },
          },
        },
      },
      required: ["name", "hits"],
    },
    handler: async (args) => {
      const { hits, ...clientFields } = args as Record<string, unknown>;
      return callApi("/api/smart-disambiguate", "POST", {
        client: clientFields,
        hits: (hits as unknown[]) ?? [],
      });
    },
  },

  // ── ADVERSE MEDIA & NEWS ────────────────────────────────────────────────────
  {
    name: "adverse_media_live",
    description:
      "Real-time GDELT 10-year adverse media lookup. Returns articles with tone scores, keyword categories, and AI summary.",
    inputSchema: {
      type: "object",
      properties: {
        subjectName: { type: "string" },
        entityType: { type: "string" },
        jurisdiction: { type: "string" },
        aliases: { type: "array", items: { type: "string" } },
      },
      required: ["subjectName"],
    },
    handler: async (args) => callApi("/api/adverse-media-live", "POST", args),
  },
  {
    name: "news_search",
    description:
      "Search Google News RSS across 7 locales for a subject. Returns articles with severity classification and adverse-keyword tagging.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — typically the subject name" },
      },
      required: ["query"],
    },
    handler: async ({ query }) =>
      callApi("/api/news-search", "GET", undefined, { q: String(query) }),
  },

  // ── PEP & SANCTIONS ─────────────────────────────────────────────────────────
  {
    name: "pep_profile",
    description:
      "Detailed PEP profile including role history, family links, and associated entities.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        jurisdiction: { type: "string" },
        aliases: { type: "array", items: { type: "string" } },
      },
      required: ["name"],
    },
    handler: async (args) => callApi("/api/pep-profile", "POST", args),
  },
  {
    name: "pep_network",
    description:
      "Map the PEP association network — family members, business associates, and shell entities.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        maxDepth: { type: "number", description: "Traversal depth 1–3" },
      },
      required: ["subject"],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const { subject, maxDepth, ...rest } = a;
      return callApi("/api/pep-network", "POST", { pepName: subject, maxDepth, ...rest });
    },
  },
  {
    name: "country_risk",
    description:
      "Multi-factor jurisdiction risk: FATF status, corruption index, sanctions regime, and AML/CFT maturity.",
    inputSchema: {
      type: "object",
      properties: {
        country: { type: "string", description: "Country name or ISO code" },
      },
      required: ["country"],
    },
    handler: async ({ country }) =>
      callApi("/api/country-risk", "POST", { country }),
  },
  {
    name: "sanctions_status",
    description: "Check freshness and coverage of all loaded sanctions lists.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => callApi("/api/sanctions/status", "GET"),
  },

  // ── REPORTS ─────────────────────────────────────────────────────────────────
  {
    name: "generate_screening_report",
    description:
      "Generate a full Screening Compliance Report (SCR) — 14 sections covering sanctions, PEP, adverse media, EDD, and regulatory basis.",
    inputSchema: {
      type: "object",
      properties: {
        subjectName: { type: "string" },
        entityType: { type: "string" },
        jurisdiction: { type: "string" },
        format: { type: "string", description: "Output format — currently always html; json planned" },
      },
      required: ["subjectName"],
    },
    handler: async ({ subjectName, entityType, jurisdiction, format }) =>
      callApi("/api/scr-report", "POST", {
        subject: {
          id: String(subjectName ?? "").slice(0, 32).replace(/[^A-Za-z0-9]/g, "-") || "subject",
          name: subjectName,
          entityType,
          jurisdiction,
        },
        format: format ?? "json",
      }),
  },
  {
    name: "generate_sar_report",
    description:
      "Generate a SAR/STR narrative and GoAML-compatible XML filing.",
    inputSchema: {
      type: "object",
      properties: {
        subjectName: { type: "string" },
        entityType: { type: "string" },
        jurisdiction: { type: "string" },
        dob: { type: "string" },
        suspicionBasis: { type: "string", description: "Grounds for suspicion" },
        filingType: { type: "string", enum: ["STR", "SAR", "CTR", "DPMSR", "FFR", "PNMR", "HRCR", "AIF"], description: "GoAML filing type — defaults to STR" },
        approver: { type: "string", description: "Four-eyes approver name (required for final filing)" },
      },
      required: ["subjectName", "suspicionBasis"],
    },
    handler: async ({ suspicionBasis, subjectName, filingType, approver, ...rest }) => {
      const subjectId = String(subjectName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Date.now().toString(36);
      return callApi("/api/sar-report", "POST", {
        subject: { id: subjectId, name: subjectName, ...rest },
        narrative: suspicionBasis,
        filingType: filingType ?? "STR",
        approver,
      });
    },
  },
  {
    name: "compliance_report",
    description:
      "Generate a module-level compliance report combining screening, super-brain, and audit trail.",
    inputSchema: {
      type: "object",
      properties: {
        subjectName: { type: "string" },
        entityType: { type: "string" },
        jurisdiction: { type: "string" },
      },
      required: ["subjectName"],
    },
    handler: async ({ subjectName, ...rest }) =>
      callApi("/api/compliance-report", "POST", {
        subject: { name: subjectName, ...rest },
      }),
  },

  // ── MLRO ADVISOR ────────────────────────────────────────────────────────────
  {
    name: "mlro_advisor",
    description:
      "Deep multi-perspective MLRO analysis (executor + advisor + challenger modes). Returns a consensus compliance verdict with confidence score.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Compliance question or case to analyse" },
        subjectName: { type: "string", description: "Full name of the subject being analysed" },
        context: { type: "array", items: { type: "object", properties: { q: { type: "string" }, a: { type: "string" } } }, description: "Prior Q&A context pairs" },
        mode: { type: "string", enum: ["executor", "advisor", "challenger", "all"] },
      },
      required: ["question", "subjectName"],
    },
    handler: async (args) => callApi("/api/mlro-advisor", "POST", args),
  },
  {
    name: "mlro_advisor_quick",
    description: "Fast single-pass MLRO analysis (<5s). Good for quick compliance questions and flag extraction.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        subjectName: { type: "string", description: "Full name of the subject being analysed" },
        context: { type: "array", items: { type: "object", properties: { q: { type: "string" }, a: { type: "string" } } }, description: "Prior Q&A context pairs" },
      },
      required: ["question"],
    },
    handler: async (args) => callApi("/api/mlro-advisor-quick", "POST", args),
  },
  {
    name: "ai_decision",
    description:
      "AI Decision Engine: automatically decides disposition (approve / EDD / escalate / STR) with reasoning and confidence.",
    inputSchema: {
      type: "object",
      properties: {
        subjectName: { type: "string", description: "Full name of the subject" },
        subjectId: { type: "string", description: "Unique subject ID (use case ID or screening ID if available)" },
        country: { type: "string", description: "Subject's country of residence or operation" },
        entityType: { type: "string", description: "individual / company / vessel / etc." },
        riskScore: { type: "number", description: "Pre-computed risk score 0–100" },
        listCoverage: { type: "array", items: { type: "string" }, description: "Sanctions lists checked" },
        sanctionsHits: { type: "array", items: { type: "object" }, description: "Hit objects from sanctions screen" },
        adverseMedia: { type: "string", description: "Adverse media summary" },
        pepTier: { type: "string", description: "PEP tier if applicable" },
        exposureAED: { type: "string", description: "Estimated transaction exposure in AED" },
        notes: { type: "string", description: "Additional compliance notes" },
      },
      required: ["subjectName"],
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const name = String(a.subjectName ?? "");
      return callApi("/api/ai-decision", "POST", {
        subjectId: a.subjectId ?? name,
        name,
        country: a.country ?? "Unknown",
        entityType: a.entityType ?? "individual",
        riskScore: a.riskScore ?? 50,
        listCoverage: a.listCoverage ?? [],
        sanctionsHits: a.sanctionsHits ?? [],
        adverseMedia: a.adverseMedia,
        pepTier: a.pepTier,
        exposureAED: a.exposureAED,
        notes: a.notes,
      });
    },
  },

  // ── ENTITY INTELLIGENCE ──────────────────────────────────────────────────────
  {
    name: "entity_graph",
    description:
      "Build a corporate ownership knowledge graph: directorships, UBO chains, and related entities. Requires a company/organisation name. For individual persons use pep_network instead.",
    inputSchema: {
      type: "object",
      properties: {
        companyName: { type: "string" },
        jurisdiction: { type: "string" },
        companyNumber: { type: "string" },
        subject: { type: "string", description: "Deprecated alias — use pep_network for individuals" },
        name: { type: "string", description: "Deprecated alias — use pep_network for individuals" },
      },
      required: [],
    },
    // BUG-01 fix: if caller passes a person name but no companyName, redirect to pep_network
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      if (!a.companyName && (a.subject || a.name)) {
        const subject = String(a.subject ?? a.name ?? "");
        return callApi("/api/pep-network", "POST", { pepName: subject, maxDepth: a.maxDepth ?? 2 });
      }
      if (!a.companyName) {
        return {
          error: "entity_graph requires a companyName. For individuals, use the pep_network tool instead.",
          routingHint: "pep_network",
        };
      }
      return callApi("/api/entity-graph", "POST", args);
    },
  },
  {
    name: "domain_intel",
    description: "Domain reputation and hosting intelligence: registration, hosting, associated entities, and risk indicators.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Domain name, e.g. example.com" },
      },
      required: ["domain"],
    },
    handler: async (args) => callApi("/api/domain-intel", "POST", args),
  },
  {
    name: "vessel_check",
    description: "Screen a vessel by IMO number against sanctions lists, flag-state risk, and ownership chains.",
    inputSchema: {
      type: "object",
      properties: {
        imoNumber: { type: "string" },
        name: { type: "string", description: "Vessel name for fuzzy matching" },
        flagState: { type: "string" },
      },
      required: ["imoNumber"],
    },
    handler: async (args) => callApi("/api/vessel-check", "POST", args),
  },
  {
    name: "crypto_risk",
    description: "Blockchain address risk: sanctions exposure, mixer interactions, darknet links, and exchange attribution.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string" },
        chain: { type: "string", enum: ["bitcoin", "ethereum", "tron", "other"] },
      },
      required: ["address"],
    },
    handler: async (args) => callApi("/api/crypto-risk", "POST", args),
  },
  {
    name: "lei_lookup",
    description: "Look up a Legal Entity Identifier and traverse the ownership hierarchy to the ultimate parent.",
    inputSchema: {
      type: "object",
      properties: {
        lei: { type: "string", description: "20-character LEI code" },
        legalName: { type: "string", description: "Legal entity name if LEI unknown" },
      },
    },
    handler: async (args) => callApi("/api/lei-lookup", "POST", args),
  },

  // ── TRANSACTIONS & TYPOLOGY ───────────────────────────────────────────────────
  {
    name: "transaction_anomaly",
    description: "Real-time transaction anomaly scoring. Detects structuring, layering, smurfing, and FATF typology patterns.",
    inputSchema: {
      type: "object",
      properties: {
        amountUsd: { type: "number", description: "Transaction amount in USD" },
        senderName: { type: "string" },
        senderCountry: { type: "string" },
        receiverName: { type: "string" },
        receiverCountry: { type: "string" },
        channel: { type: "string", description: "e.g. wire, cash, crypto, trade" },
        narrative: { type: "string" },
        countryRiskScore: { type: "number", description: "0-100 country risk score" },
        counterpartyFirstSeen: { type: "boolean" },
      },
      required: ["amountUsd"],
    },
    handler: async (args) => callApi("/api/transaction-anomaly", "POST", { transaction: args }),
  },
  {
    name: "typology_match",
    description: "Match facts against the FATF predicate offence typology library. Returns matched typologies with red-flag indicators.",
    inputSchema: {
      type: "object",
      properties: {
        facts: { type: "string", description: "Description of the transaction or behaviour" },
        subjectType: { type: "string" },
        transactionType: { type: "string" },
      },
      required: ["facts"],
    },
    handler: async (args) => callApi("/api/typology-match", "POST", args),
  },

  // ── CASES & AUDIT ────────────────────────────────────────────────────────────
  {
    name: "get_cases",
    description: "List compliance cases with pagination and filtering. Returns totalCount for the full matching set.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "closed", "escalated", "all"], description: "Filter by case status" },
        category: { type: "string", description: "Filter by badge/category label" },
        sourceType: { type: "string", description: "Filter by source type (maps to badge)" },
        includeArchived: { type: "boolean", description: "Include closed/archived cases (default true)" },
        limit: { type: "number", description: "Max records to return (default 500, max 500)" },
        offset: { type: "number", description: "Pagination offset (default 0)" },
      },
    },
    handler: async ({ status, category, sourceType, includeArchived, limit, offset }) => {
      const params: Record<string, string> = {};
      if (status && status !== "all") params["status"] = String(status);
      if (category) params["category"] = String(category);
      if (sourceType) params["sourceType"] = String(sourceType);
      if (includeArchived === false) params["includeArchived"] = "false";
      if (limit !== undefined) params["limit"] = String(limit);
      if (offset !== undefined) params["offset"] = String(offset);
      return callApi("/api/cases", "GET", undefined, Object.keys(params).length ? params : undefined);
    },
  },
  {
    name: "audit_trail",
    description: "Retrieve the HMAC-signed immutable audit trail for a screening or case. Omit screeningId to return the 10 most recent trail records.",
    inputSchema: {
      type: "object",
      properties: {
        screeningId: { type: "string", description: "Specific screening ID to retrieve. Omit to return 10 most recent records." },
      },
    },
    handler: async ({ screeningId }) => {
      // When no screeningId provided, call without it — the view route returns all entries,
      // which we slice to the 10 most recent for the MCP response.
      if (!screeningId) {
        const result = await callApi("/api/audit/view", "GET") as Record<string, unknown> | null;
        if (!result || !(result as Record<string, unknown>).ok) return result;
        const entries = Array.isArray((result as Record<string, unknown>).entries)
          ? ((result as Record<string, unknown>).entries as unknown[]).slice(-10)
          : [];
        return { ...result, entries, note: "Showing 10 most recent audit records. Provide screeningId for a specific case." };
      }
      return callApi("/api/audit/view", "GET", undefined, { screeningId: String(screeningId) });
    },
  },

  // ── REGULATORY ───────────────────────────────────────────────────────────────
  {
    name: "regulatory_feed",
    description: "Latest UAE regulatory AML/CFT notices from CBUAE, FSRA, SCA, and other authorities.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => callApi("/api/regulatory-feed", "GET"),
  },
  {
    name: "compliance_qa",
    description: "Multi-agent compliance Q&A. Ask any AML/CFT regulatory question and get a cited, jurisdiction-aware answer.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        jurisdiction: { type: "string" },
      },
      required: ["query"],
    },
    handler: async (args) => callApi("/api/compliance-qa", "POST", args),
  },

  // ── SYSTEM ───────────────────────────────────────────────────────────────────
  {
    name: "system_status",
    description: "Check Hawkeye Sterling system health: all services, external dependencies, and sanctions list freshness.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => callApi("/api/status", "GET"),
  },

  // ── GENERIC PROXY ────────────────────────────────────────────────────────────
  {
    name: "call_api",
    description:
      "Generic proxy to any Hawkeye Sterling API endpoint not covered by the named tools. Use the exact path, e.g. /api/crypto-tracing.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "API path, e.g. /api/vessel-check/risk-profile" },
        method: { type: "string", enum: ["GET", "POST"] },
        body: { type: "object", description: "Request body" },
        query: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "URL query parameters",
        },
      },
      required: ["path"],
    },
    handler: async ({ path, method, body, query }) =>
      callApi(
        String(path),
        (method as "GET" | "POST") ?? "POST",
        body as unknown,
        query as Record<string, string> | undefined,
      ),
  },
];

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────
function ok(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function err(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

// ── MCP request dispatcher ────────────────────────────────────────────────────
async function dispatch(msg: {
  jsonrpc: string;
  method: string;
  params?: unknown;
  id?: unknown;
}): Promise<unknown> {
  const { method, params, id } = msg;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      capabilities: { tools: {} },
    });
  }

  if (method === "ping") {
    return ok(id, {});
  }

  if (method === "tools/list") {
    return ok(id, {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }

  if (method === "tools/call") {
    const p = params as { name?: string; arguments?: Record<string, unknown> };
    const tool = TOOLS.find((t) => t.name === p?.name);
    if (!tool) return err(id, -32601, `Tool not found: ${p?.name}`);

    const toolName = p?.name ?? "unknown";
    const toolArgs = p?.arguments ?? {};
    const level = getToolLevel(toolName);
    const timeoutMs = CLASS_TIMEOUT_MS[level];

    // Circuit breaker check (Control 20.02) — Blobs-backed shared state.
    if (await isBreakerOpen(toolName)) {
      return err(id, -32002, `Tool ${toolName} is temporarily unavailable (circuit breaker open). Retry in 60s.`);
    }

    // Rate limit check (Control 20.06) — Blobs-backed shared state.
    const rate = await checkAndIncrementRate(toolName, level);
    if (!rate.allowed) {
      return err(id, -32003, `Rate limit exceeded for ${toolName}. Retry in ${Math.ceil((rate.retryAfterMs ?? 60_000) / 1_000)}s.`);
    }

    // Prompt injection check (Control 13.03)
    const injectedField = scanArgsForInjection(toolArgs);
    if (injectedField) {
      void logToolCall({
        id: Math.random().toString(36).slice(2, 10),
        timestamp: new Date().toISOString(),
        tool: toolName,
        consequenceLevel: level,
        inputSummary: summarise(toolArgs),
        outputSummary: `BLOCKED: prompt injection detected in field "${injectedField}"`,
        durationMs: 0,
        isError: true,
      });
      return err(id, -32004, `Request blocked: potential prompt injection detected in input field "${injectedField}".`);
    }

    // Fetch sanctions health once — reused by gate check and wrapWithGovernance.
    // Memoised for 30 s so a burst of screening calls in the same warm Lambda
    // shares one upstream round-trip instead of N.
    const sanctionsHealth = GATE_BLOCKED_TOOLS.has(toolName)
      ? await getSanctionsHealthMemoised()
      : { listsVerified: true, missingCritical: [] as string[], missingAll: [] as string[], checkedAt: new Date().toISOString() };

    // Sanctions gate (ADD-01): block screening tools when critical lists are missing.
    if (GATE_BLOCKED_TOOLS.has(toolName) && !sanctionsHealth.listsVerified) {
      const requestId = Math.random().toString(36).slice(2, 10);
      return ok(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: false,
              tool: toolName,
              errorCode: "LISTS_MISSING",
              errorType: "data",
              message:
                "Screening blocked: one or more critical sanctions lists are not loaded. " +
                "Run `sanctions_status` to diagnose, then trigger a list refresh. " +
                "No compliance decision may be based on results from a degraded screening engine.",
              retryAfterSeconds: null,
              requestId,
              missingLists: sanctionsHealth.missingCritical,
              missingAll: sanctionsHealth.missingAll,
              _governance: {
                humanReviewRequired: true,
                reviewNote:
                  "FDL No. 10/2025 Art. 15: AI-generated screening results are invalid when the underlying data corpus is incomplete.",
              },
              checkedAt: sanctionsHealth.checkedAt,
            }, null, 2),
          },
        ],
        isError: true,
      });
    }

    // Anomaly detection (Control 21.08). Prefer the explicit MCP-supplied
    // _sessionId, then fall back to the per-request sessionId captured in
    // AsyncLocalStorage (derived from X-Forwarded-For at POST entry), and
    // finally "anonymous" so a missing IP doesn't coalesce unrelated callers.
    const explicitSessionId = (params as Record<string, unknown>)["_sessionId"] as string | undefined;
    const ctxSessionId = _callCtx.getStore()?.sessionId;
    const sessionId = explicitSessionId ?? ctxSessionId ?? "anonymous";
    const anomaly = trackAndDetectAnomaly(sessionId, toolName, level);

    const t0 = Date.now();
    try {
      // Run the tool inside an AsyncLocalStorage context that carries
      // the per-class timeout, inheriting the caller's auth header from
      // the enclosing POST context.
      const parentCtx = _callCtx.getStore() ?? {};
      const result = await _callCtx.run(
        { ...parentCtx, timeoutMs },
        () => tool.handler(toolArgs),
      );
      const durationMs = Date.now() - t0;
      // Fire-and-forget — breaker state shouldn't block the response.
      void recordBreakerSuccess(toolName);
      const wrapped = wrapWithGovernance(
        toolName, level, result, durationMs,
        sanctionsHealth.listsVerified, sanctionsHealth.missingCritical,
      );
      void logToolCall({
        id: Math.random().toString(36).slice(2, 10),
        timestamp: new Date().toISOString(),
        tool: toolName,
        consequenceLevel: level,
        inputSummary: summarise(toolArgs),
        outputSummary: summarise(wrapped),
        durationMs,
        isError: false,
        ...(anomaly ? { anomalyNote: anomaly } : {}),
      });
      return ok(id, {
        content: [{ type: "text", text: JSON.stringify(wrapped, null, 2) }],
      });
    } catch (e) {
      const durationMs = Date.now() - t0;
      // Fire-and-forget — breaker write shouldn't block the error response.
      void recordBreakerFailure(toolName);
      const requestId = Math.random().toString(36).slice(2, 10);
      const errMsg = e instanceof Error ? e.message : String(e);
      void logToolCall({
        id: requestId,
        timestamp: new Date().toISOString(),
        tool: toolName,
        consequenceLevel: level,
        inputSummary: summarise(toolArgs),
        outputSummary: errMsg,
        durationMs,
        isError: true,
      });
      // F-07 standardised error schema
      return ok(id, {
        content: [{ type: "text", text: JSON.stringify({
          ok: false,
          tool: toolName,
          errorCode: "HANDLER_EXCEPTION",
          errorType: "internal",
          message: errMsg,
          retryAfterSeconds: null,
          requestId,
          latencyMs: durationMs,
        }, null, 2) }],
        isError: true,
      });
    }
  }

  // Notifications have no id — ignore them silently
  if (id === undefined || id === null) return null;

  return err(id, -32601, `Method not found: ${method}`);
}

// ── Route handlers ─────────────────────────────────────────────────────────────

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(): Promise<Response> {
  // Claude.ai sends a GET to discover the MCP endpoint.
  // Return a minimal SSE stream that immediately closes.
  const body = new ReadableStream({
    start(c) {
      c.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify({ type: "endpoint", endpoint: "/api/mcp" })}\n\n`,
        ),
      );
      c.close();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      ...CORS,
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Kill switch — set MCP_ENABLED=false in Netlify env vars to instantly
  // disable all 28 tools. All tool calls return 503 until re-enabled.
  if (process.env["MCP_ENABLED"] === "false") {
    return json(
      err(null, -32001, "Hawkeye Sterling MCP is offline. Contact your MLRO to re-enable."),
      503,
    );
  }

  // Body-size guard. Reject early (before req.json() buffers everything)
  // so a single bad caller cannot tie up Lambda memory parsing junk.
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return json(
        err(null, -32700, `Request body too large: ${declared} bytes (max ${MAX_BODY_BYTES})`),
        413,
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(err(null, -32700, "Parse error"), 400);
  }

  // Thread caller's auth + derived sessionId into all internal callApi
  // requests via AsyncLocalStorage so each concurrent request has its own
  // isolated context.
  const authHeader = req.headers.get("authorization") ?? undefined;
  const sessionId = deriveSessionId(req);

  // Batch request
  if (Array.isArray(body)) {
    const results = await _callCtx.run({ authHeader, sessionId }, () =>
      Promise.all(body.map((msg) => dispatch(msg as Parameters<typeof dispatch>[0]))),
    );
    const responses = results.filter((r) => r !== null);
    return json(responses);
  }

  // Single request
  const result = await _callCtx.run({ authHeader, sessionId }, () =>
    dispatch(body as Parameters<typeof dispatch>[0]),
  );
  if (result === null) {
    // Notification — no response body
    return new Response(null, { status: 202, headers: CORS });
  }
  return json(result);
}
