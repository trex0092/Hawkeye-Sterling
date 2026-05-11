// POST /api/mcp  — Hawkeye Sterling MCP server (Streamable HTTP, stateless)
//
// Implements the MCP JSON-RPC 2.0 protocol directly without the SDK transport
// layer so it works reliably on Netlify's serverless functions.
//
// Add to Claude.ai → Settings → Connectors:
//   URL: https://hawkeye-sterling.netlify.app/api/mcp

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

// ── Internal API proxy ────────────────────────────────────────────────────────
async function callApi(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  query?: Record<string, string>,
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
      signal: AbortSignal.timeout(55_000),
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
    handler: async (args) => callApi("/api/pep-network", "POST", args),
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
        subject: { name: subjectName, entityType, jurisdiction },
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
      "Build a corporate ownership knowledge graph: directorships, UBO chains, and related entities.",
    inputSchema: {
      type: "object",
      properties: {
        companyName: { type: "string" },
        jurisdiction: { type: "string" },
        companyNumber: { type: "string" },
      },
      required: ["companyName"],
    },
    handler: async (args) => callApi("/api/entity-graph", "POST", args),
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
    try {
      const result = await tool.handler(p?.arguments ?? {});
      return ok(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (e) {
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
