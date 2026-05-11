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

import { getToolLevel } from "@/lib/mcp/tool-manifest";
import type { ConsequenceLevel } from "@/lib/mcp/tool-manifest";
import type { McpLogEntry } from "@/app/api/operator/logs/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Per-class timeouts (Control 2.03) ────────────────────────────────────────
const CLASS_TIMEOUT_MS: Record<ConsequenceLevel, number> = {
  "read-only":  15_000,
  "supervised": 45_000,
  "action":     55_000,
};

// ── Rate limiter (Control 20.02/20.06) ───────────────────────────────────────
// Calls per minute per tool class. Module-level; resets each minute window.
const CLASS_RATE_LIMITS: Record<ConsequenceLevel, number> = {
  "read-only":  120,
  "supervised":  40,
  "action":      10,
};
interface RateWindow { count: number; windowStart: number }
const _rateWindows = new Map<string, RateWindow>();

function checkRateLimit(toolName: string, level: ConsequenceLevel): { allowed: boolean; retryAfterMs?: number } {
  const limit = CLASS_RATE_LIMITS[level];
  const now = Date.now();
  const win = _rateWindows.get(toolName);
  if (!win || now - win.windowStart >= 60_000) {
    _rateWindows.set(toolName, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (win.count >= limit) {
    return { allowed: false, retryAfterMs: 60_000 - (now - win.windowStart) };
  }
  win.count++;
  return { allowed: true };
}

// ── Circuit breaker (Control 20.02) ──────────────────────────────────────────
// Trip after 5 consecutive failures; auto-reset after 60 s.
interface BreakerState { failures: number; tripTime: number | null }
const _breakers = new Map<string, BreakerState>();
const BREAKER_THRESHOLD = 5;
const BREAKER_RESET_MS = 60_000;

function isBreakerOpen(toolName: string): boolean {
  const s = _breakers.get(toolName);
  if (!s || s.tripTime === null) return false;
  if (Date.now() - s.tripTime > BREAKER_RESET_MS) {
    // Auto-reset (half-open)
    s.tripTime = null;
    s.failures = 0;
    return false;
  }
  return true;
}

function recordBreakerSuccess(toolName: string): void {
  const s = _breakers.get(toolName);
  if (s) { s.failures = 0; s.tripTime = null; }
}

function recordBreakerFailure(toolName: string): void {
  const s = _breakers.get(toolName) ?? { failures: 0, tripTime: null };
  s.failures++;
  if (s.failures >= BREAKER_THRESHOLD) s.tripTime = Date.now();
  _breakers.set(toolName, s);
}

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
function wrapWithGovernance(toolName: string, level: ConsequenceLevel, result: unknown): unknown {
  if (level === "read-only") return result;
  if (typeof result !== "object" || result === null) return result;

  const r = result as Record<string, unknown>;
  let confidenceScore = 0.75;
  if (typeof r["confidence"] === "number")   confidenceScore = r["confidence"];
  else if (typeof r["riskScore"] === "number") {
    const rs = r["riskScore"] as number;
    confidenceScore = rs > 70 ? 0.85 : rs > 40 ? 0.75 : 0.65;
  }

  return {
    ...r,
    _governance: {
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      humanReviewRequired: true,
      consequenceLevel: level,
      reviewNote: "AI-generated output — MLRO review required before any compliance action. FDL No.10/2025 Art.18.",
      _provenance: {
        tool: toolName,
        engineVersion: process.env["BRAIN_VERSION"] ?? "wave-5",
        commitRef: (process.env["COMMIT_REF"] ?? process.env["NETLIFY_COMMIT_REF"] ?? "dev").slice(0, 7),
        generatedAt: new Date().toISOString(),
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
  } catch {
    // Logging must never break the tool call
  }
}

function summarise(value: unknown, maxLen = 200): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

// Per-call timeout set by the tools/call handler before invoking the tool handler.
// Tools call callApi() which picks up this value for per-class timeouts.
let _currentCallTimeout: number | undefined;

// ── Internal API proxy ────────────────────────────────────────────────────────
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
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs ?? _currentCallTimeout ?? 55_000),
    });
    return await res.json().catch(() => ({ ok: res.ok, status: res.status }));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
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
          description: "List of subjects to screen (max 500)",
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
      "Disambiguate an ambiguous name using supplementary identity fields. Returns confidence and best-matching candidate.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        nationality: { type: "string" },
        dob: { type: "string" },
        gender: { type: "string" },
        idNumber: { type: "string" },
        occupation: { type: "string" },
        context: { type: "string" },
      },
      required: ["name"],
    },
    handler: async (args) => callApi("/api/smart-disambiguate", "POST", args),
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
      callApi("/api/country-risk", "POST", { countries: [country] }),
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
        format: { type: "string", enum: ["json", "html"], default: "json" },
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
      },
      required: ["subjectName", "suspicionBasis"],
    },
    handler: async ({ suspicionBasis, subjectName, ...rest }) =>
      callApi("/api/sar-report", "POST", {
        subject: { name: subjectName, ...rest },
        suspicionBasis,
      }),
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
        context: { type: "string", description: "Additional case context or evidence" },
        mode: { type: "string", enum: ["executor", "advisor", "challenger", "all"] },
      },
      required: ["question"],
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
        context: { type: "string" },
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
        subjectName: { type: "string" },
        riskScore: { type: "number", description: "Pre-computed risk score 0–100" },
        verdict: { type: "string" },
        evidence: { type: "string" },
      },
      required: ["subjectName"],
    },
    handler: async (args) => callApi("/api/ai-decision", "POST", args),
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
        amount: { type: "number" },
        currency: { type: "string" },
        senderName: { type: "string" },
        senderCountry: { type: "string" },
        receiverName: { type: "string" },
        receiverCountry: { type: "string" },
        channel: { type: "string", description: "e.g. wire, cash, crypto, trade" },
        narrative: { type: "string" },
      },
      required: ["amount", "currency"],
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
    description: "List all compliance cases with status, disposition, and risk scores.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "closed", "escalated", "all"] },
      },
    },
    handler: async ({ status }) =>
      callApi("/api/cases", "GET", undefined,
        status && status !== "all" ? { status: String(status) } : undefined),
  },
  {
    name: "audit_trail",
    description: "Retrieve the HMAC-signed immutable audit trail for a screening or case.",
    inputSchema: {
      type: "object",
      properties: {
        screeningId: { type: "string" },
      },
    },
    handler: async ({ screeningId }) =>
      callApi("/api/audit/view", "GET", undefined,
        screeningId ? { screeningId: String(screeningId) } : undefined),
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

    // Circuit breaker check (Control 20.02)
    if (isBreakerOpen(toolName)) {
      return err(id, -32002, `Tool ${toolName} is temporarily unavailable (circuit breaker open). Retry in 60s.`);
    }

    // Rate limit check (Control 20.06)
    const rate = checkRateLimit(toolName, level);
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

    // Anomaly detection (Control 21.08)
    const sessionId = (params as Record<string, unknown>)["_sessionId"] as string | undefined ?? "default";
    const anomaly = trackAndDetectAnomaly(sessionId, toolName, level);

    const t0 = Date.now();
    try {
      // Pass per-class timeout to callApi via handler override
      const handlerWithTimeout = (args: Record<string, unknown>) => {
        // Temporarily override AbortSignal timeout via the tool's handler — we
        // achieve this by wrapping the handler and injecting timeout into callApi
        // indirectly: each handler ultimately calls callApi, which now accepts timeoutMs.
        // Since handlers are closures over callApi, we use a module-level variable trick:
        _currentCallTimeout = timeoutMs;
        try {
          return tool.handler(args);
        } finally {
          _currentCallTimeout = undefined;
        }
      };
      const result = await handlerWithTimeout(toolArgs);
      const durationMs = Date.now() - t0;
      recordBreakerSuccess(toolName);
      const wrapped = wrapWithGovernance(toolName, level, result);
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
      recordBreakerFailure(toolName);
      void logToolCall({
        id: Math.random().toString(36).slice(2, 10),
        timestamp: new Date().toISOString(),
        tool: toolName,
        consequenceLevel: level,
        inputSummary: summarise(toolArgs),
        outputSummary: e instanceof Error ? e.message : String(e),
        durationMs,
        isError: true,
      });
      return ok(id, {
        content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
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
  // Kill switch — set MCP_ENABLED=false in Netlify env vars to instantly
  // disable all 28 tools. All tool calls return 503 until re-enabled.
  if (process.env["MCP_ENABLED"] === "false") {
    return json(
      err(null, -32001, "Hawkeye Sterling MCP is offline. Contact your MLRO to re-enable."),
      503,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(err(null, -32700, "Parse error"), 400);
  }

  // Batch request
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map((msg) => dispatch(msg as Parameters<typeof dispatch>[0])));
    const responses = results.filter((r) => r !== null);
    return json(responses);
  }

  // Single request
  const result = await dispatch(body as Parameters<typeof dispatch>[0]);
  if (result === null) {
    // Notification — no response body
    return new Response(null, { status: 202, headers: CORS });
  }
  return json(result);
}
