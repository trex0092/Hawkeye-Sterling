// POST/GET /api/mcp
// MCP (Model Context Protocol) server — exposes Hawkeye Sterling's screening,
// intelligence, and compliance tools to Claude and other MCP clients.
//
// Transport: Streamable HTTP (stateless mode, no session management needed)
// Spec: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
//
// Add to Claude.ai → Settings → Connectors:
//   URL: https://hawkeye-sterling.netlify.app/api/mcp

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL =
  process.env["NEXT_PUBLIC_APP_URL"] ??
  "https://hawkeye-sterling.netlify.app";

// ── Internal API proxy ───────────────────────────────────────────────────────
async function callApi(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  query?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(55_000),
  });
  return res.json().catch(() => ({ ok: res.ok, status: res.status }));
}

function txt(data: unknown): { content: [{ type: "text"; text: string }] } {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

// ── Build MCP server ─────────────────────────────────────────────────────────
function buildServer(): McpServer {
  const server = new McpServer({
    name: "hawkeye-sterling",
    version: "1.0.0",
  });

  // ── SCREENING ──────────────────────────────────────────────────────────────

  server.tool(
    "screen_subject",
    "Screen a single subject against sanctions lists, PEP registers, adverse media, and intelligence sources. Returns a risk score, severity, hit list, and AI reasoning.",
    {
      name: z.string().describe("Full name of the subject"),
      entityType: z
        .enum(["individual", "organisation", "vessel", "aircraft", "other"])
        .optional()
        .describe("Entity type"),
      jurisdiction: z.string().optional().describe("Country / jurisdiction (e.g. 'Russia', 'UAE')"),
      aliases: z.array(z.string()).optional().describe("Known aliases or alternate spellings"),
      dob: z.string().optional().describe("Date of birth (YYYY-MM-DD), individuals only"),
      idNumber: z.string().optional().describe("Passport, trade licence, or other ID number"),
    },
    async (args) => {
      const data = await callApi("/api/quick-screen", "POST", { subject: args });
      return txt(data);
    },
  );

  server.tool(
    "batch_screen",
    "Screen multiple subjects in one call. Streams progress. Returns a result per subject plus a summary.",
    {
      subjects: z
        .array(
          z.object({
            name: z.string(),
            entityType: z
              .enum(["individual", "organisation", "vessel", "aircraft", "other"])
              .optional(),
            jurisdiction: z.string().optional(),
            aliases: z.array(z.string()).optional(),
            dob: z.string().optional(),
          }),
        )
        .describe("List of subjects to screen (max 500)"),
    },
    async (args) => {
      const data = await callApi("/api/batch-screen", "POST", { rows: args.subjects });
      return txt(data);
    },
  );

  server.tool(
    "super_brain",
    "Full deep-analysis of a subject: composite risk score, PEP assessment, jurisdiction profile, adverse media scoring, typology matching, ESG, redlines, and audit rationale.",
    {
      name: z.string().describe("Subject full name"),
      entityType: z
        .enum(["individual", "organisation", "vessel", "aircraft", "other"])
        .optional(),
      jurisdiction: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      adverseMediaText: z
        .string()
        .optional()
        .describe("Pre-fetched adverse media text to incorporate"),
    },
    async (args) => {
      const { adverseMediaText, ...subject } = args;
      const data = await callApi("/api/super-brain", "POST", {
        subject,
        ...(adverseMediaText ? { adverseMediaText } : {}),
      });
      return txt(data);
    },
  );

  server.tool(
    "smart_disambiguate",
    "Disambiguate a common or ambiguous name using supplementary identity fields. Returns a confidence score and the best-matching sanctioned/PEP candidate.",
    {
      name: z.string(),
      nationality: z.string().optional(),
      dob: z.string().optional(),
      gender: z.enum(["M", "F", "male", "female", "other"]).optional(),
      idNumber: z.string().optional(),
      occupation: z.string().optional(),
      employer: z.string().optional(),
      context: z.string().optional().describe("Any additional context about the subject"),
    },
    async (args) => {
      const data = await callApi("/api/smart-disambiguate", "POST", args);
      return txt(data);
    },
  );

  // ── ADVERSE MEDIA & NEWS ───────────────────────────────────────────────────

  server.tool(
    "adverse_media_live",
    "Real-time GDELT 10-year adverse media lookup. Returns articles with tone scores, keyword categories (fraud, bribery, terrorism, etc.), and an AI summary.",
    {
      subjectName: z.string().describe("Name to search for"),
      entityType: z
        .enum(["individual", "organisation", "vessel", "aircraft", "other"])
        .optional(),
      jurisdiction: z.string().optional(),
      aliases: z.array(z.string()).optional(),
    },
    async (args) => {
      const data = await callApi("/api/adverse-media-live", "POST", args);
      return txt(data);
    },
  );

  server.tool(
    "news_search",
    "Search Google News RSS across 7 locales for a subject. Returns articles with severity classification and adverse-keyword tagging.",
    {
      query: z.string().describe("Search query — typically the subject's name"),
    },
    async (args) => {
      const data = await callApi("/api/news-search", "GET", undefined, {
        q: args.query,
      });
      return txt(data);
    },
  );

  // ── PEP & SANCTIONS ────────────────────────────────────────────────────────

  server.tool(
    "pep_profile",
    "Look up a detailed PEP (Politically Exposed Person) profile including role history, family links, and associated entities.",
    {
      name: z.string(),
      jurisdiction: z.string().optional(),
      aliases: z.array(z.string()).optional(),
    },
    async (args) => {
      const data = await callApi("/api/pep-profile", "POST", args);
      return txt(data);
    },
  );

  server.tool(
    "country_risk",
    "Multi-factor jurisdiction risk assessment: FATF status, corruption index, sanctions regime, regulatory quality, and AML/CFT maturity.",
    {
      country: z.string().describe("Country name or ISO code"),
    },
    async (args) => {
      const data = await callApi("/api/country-risk", "POST", { countries: [args.country] });
      return txt(data);
    },
  );

  server.tool(
    "sanctions_status",
    "Check the freshness and coverage of all loaded sanctions lists.",
    {},
    async () => {
      const data = await callApi("/api/sanctions/status", "GET");
      return txt(data);
    },
  );

  // ── REPORTS ────────────────────────────────────────────────────────────────

  server.tool(
    "generate_screening_report",
    "Generate a full Screening Compliance Report (SCR) — 14 sections covering sanctions, PEP, adverse media, EDD, and regulatory basis. Returns HTML, PDF, or JSON.",
    {
      subjectName: z.string(),
      entityType: z
        .enum(["individual", "organisation", "vessel", "aircraft", "other"])
        .optional(),
      jurisdiction: z.string().optional(),
      format: z.enum(["json", "html"]).optional().default("json"),
    },
    async (args) => {
      const { format, ...rest } = args;
      const data = await callApi(
        "/api/scr-report",
        "POST",
        { subject: rest, format },
      );
      return txt(data);
    },
  );

  server.tool(
    "generate_sar_report",
    "Generate a Suspicious Activity Report (SAR/STR) narrative and GoAML-compatible XML filing.",
    {
      subjectName: z.string(),
      entityType: z
        .enum(["individual", "organisation", "vessel", "aircraft", "other"])
        .optional(),
      jurisdiction: z.string().optional(),
      dob: z.string().optional(),
      suspicionBasis: z.string().describe("Describe the grounds for suspicion"),
    },
    async (args) => {
      const { suspicionBasis, ...subject } = args;
      const data = await callApi("/api/sar-report", "POST", {
        subject: { name: subject.subjectName, ...subject },
        suspicionBasis,
      });
      return txt(data);
    },
  );

  server.tool(
    "compliance_report",
    "Generate a module-level compliance report for a subject combining screening, super-brain, and audit trail.",
    {
      subjectName: z.string(),
      entityType: z
        .enum(["individual", "organisation", "vessel", "aircraft", "other"])
        .optional(),
      jurisdiction: z.string().optional(),
    },
    async (args) => {
      const data = await callApi("/api/compliance-report", "POST", {
        subject: { name: args.subjectName, entityType: args.entityType, jurisdiction: args.jurisdiction },
      });
      return txt(data);
    },
  );

  // ── MLRO ADVISOR ───────────────────────────────────────────────────────────

  server.tool(
    "mlro_advisor",
    "Deep multi-perspective MLRO analysis. Runs three AI modes (executor, advisor, challenger) and synthesises a consensus compliance verdict with confidence score.",
    {
      question: z.string().describe("The compliance question or case to analyse"),
      context: z.string().optional().describe("Additional case context, evidence, or background"),
      mode: z
        .enum(["executor", "advisor", "challenger", "all"])
        .optional()
        .default("all")
        .describe("Run a specific mode or all three"),
    },
    async (args) => {
      const data = await callApi("/api/mlro-advisor", "POST", args);
      return txt(data);
    },
  );

  server.tool(
    "mlro_advisor_quick",
    "Fast single-pass MLRO analysis (< 5s). Good for quick compliance questions, flag extraction, and escalation recommendations.",
    {
      question: z.string(),
      context: z.string().optional(),
    },
    async (args) => {
      const data = await callApi("/api/mlro-advisor-quick", "POST", args);
      return txt(data);
    },
  );

  server.tool(
    "ai_decision",
    "Run the AI Decision Engine on a subject. Automatically decides disposition (approve / EDD / escalate / STR) with reasoning and confidence.",
    {
      subjectName: z.string(),
      riskScore: z.number().optional().describe("Pre-computed risk score 0–100"),
      verdict: z.string().optional().describe("Preliminary human verdict to evaluate"),
      evidence: z.string().optional().describe("Evidence summary"),
    },
    async (args) => {
      const data = await callApi("/api/ai-decision", "POST", args);
      return txt(data);
    },
  );

  // ── ENTITY INTELLIGENCE ────────────────────────────────────────────────────

  server.tool(
    "entity_graph",
    "Build a knowledge graph of corporate ownership, directorships, and UBO chains for a company.",
    {
      companyName: z.string(),
      jurisdiction: z.string().optional(),
      companyNumber: z.string().optional(),
    },
    async (args) => {
      const data = await callApi("/api/entity-graph", "POST", args);
      return txt(data);
    },
  );

  server.tool(
    "domain_intel",
    "Domain reputation and hosting intelligence: registration data, hosting provider, associated entities, and risk indicators.",
    {
      domain: z.string().describe("Domain name, e.g. example.com"),
    },
    async (args) => {
      const data = await callApi("/api/domain-intel", "POST", args);
      return txt(data);
    },
  );

  server.tool(
    "vessel_check",
    "Screen a vessel by IMO number against sanctions lists, flag-state risk, and ownership chains.",
    {
      imoNumber: z.string().describe("IMO vessel number"),
      name: z.string().optional().describe("Vessel name (for fuzzy matching)"),
      flagState: z.string().optional(),
    },
    async (args) => {
      const data = await callApi("/api/vessel-check", "POST", args);
      return txt(data);
    },
  );

  server.tool(
    "crypto_risk",
    "Blockchain address risk assessment: sanctions exposure, mixer interactions, darknet links, and exchange attribution.",
    {
      address: z.string().describe("Blockchain wallet address"),
      chain: z
        .enum(["bitcoin", "ethereum", "tron", "other"])
        .optional()
        .describe("Blockchain network"),
    },
    async (args) => {
      const data = await callApi("/api/crypto-risk", "POST", args);
      return txt(data);
    },
  );

  server.tool(
    "lei_lookup",
    "Look up a Legal Entity Identifier (LEI) and traverse the ownership hierarchy to the ultimate parent.",
    {
      lei: z.string().optional().describe("20-character LEI code"),
      legalName: z.string().optional().describe("Legal entity name (if LEI unknown)"),
    },
    async (args) => {
      const data = await callApi("/api/lei-lookup", "POST", args);
      return txt(data);
    },
  );

  server.tool(
    "pep_network",
    "Map the PEP association network — family members, business associates, and shell entities linked to a politically exposed person.",
    {
      subject: z.string().describe("PEP subject name"),
      maxDepth: z.number().optional().default(2).describe("Network traversal depth (1–3)"),
    },
    async (args) => {
      const data = await callApi("/api/pep-network", "POST", args);
      return txt(data);
    },
  );

  // ── TRANSACTION & TYPOLOGY ─────────────────────────────────────────────────

  server.tool(
    "transaction_anomaly",
    "Real-time transaction anomaly scoring. Detects structuring, layering, smurfing, and FATF typology patterns.",
    {
      amount: z.number().describe("Transaction amount"),
      currency: z.string().describe("ISO currency code, e.g. USD"),
      senderName: z.string().optional(),
      senderCountry: z.string().optional(),
      receiverName: z.string().optional(),
      receiverCountry: z.string().optional(),
      channel: z.string().optional().describe("e.g. wire, cash, crypto, trade"),
      narrative: z.string().optional(),
    },
    async (args) => {
      const data = await callApi("/api/transaction-anomaly", "POST", { transaction: args });
      return txt(data);
    },
  );

  server.tool(
    "typology_match",
    "Match a set of facts against the FATF predicate offence typology library. Returns matched typologies with confidence and red-flag indicators.",
    {
      facts: z.string().describe("Description of the transaction or behaviour to classify"),
      subjectType: z.string().optional().describe("e.g. individual, company, VASP"),
      transactionType: z.string().optional().describe("e.g. wire transfer, cash deposit, trade finance"),
    },
    async (args) => {
      const data = await callApi("/api/typology-match", "POST", args);
      return txt(data);
    },
  );

  // ── CASES & AUDIT ──────────────────────────────────────────────────────────

  server.tool(
    "get_cases",
    "List all compliance cases in the vault with their status, disposition, and risk scores.",
    {
      status: z
        .enum(["active", "closed", "escalated", "all"])
        .optional()
        .default("all"),
    },
    async (args) => {
      const data = await callApi("/api/cases", "GET", undefined,
        args.status !== "all" ? { status: args.status } : undefined,
      );
      return txt(data);
    },
  );

  server.tool(
    "audit_trail",
    "Retrieve the HMAC-signed immutable audit trail for a screening or case.",
    {
      screeningId: z.string().optional().describe("Screening ID to look up"),
    },
    async (args) => {
      const data = await callApi("/api/audit/view", "GET", undefined,
        args.screeningId ? { screeningId: args.screeningId } : undefined,
      );
      return txt(data);
    },
  );

  // ── REGULATORY ─────────────────────────────────────────────────────────────

  server.tool(
    "regulatory_feed",
    "Latest UAE regulatory announcements and AML/CFT notices from CBUAE, FSRA, SCA, and other authorities.",
    {},
    async () => {
      const data = await callApi("/api/regulatory-feed", "GET");
      return txt(data);
    },
  );

  server.tool(
    "compliance_qa",
    "Multi-agent compliance Q&A. Ask any AML/CFT regulatory question and get a cited, jurisdiction-aware answer.",
    {
      query: z.string().describe("Compliance question to answer"),
      jurisdiction: z.string().optional().describe("Jurisdiction context, e.g. 'UAE', 'EU'"),
    },
    async (args) => {
      const data = await callApi("/api/compliance-qa", "POST", args);
      return txt(data);
    },
  );

  // ── SYSTEM ─────────────────────────────────────────────────────────────────

  server.tool(
    "system_status",
    "Check Hawkeye Sterling system health: all services, external dependencies (GDELT, Asana, news feeds), and sanctions list freshness.",
    {},
    async () => {
      const data = await callApi("/api/status", "GET");
      return txt(data);
    },
  );

  // ── GENERIC PROXY ──────────────────────────────────────────────────────────

  server.tool(
    "call_api",
    "Generic proxy to any Hawkeye Sterling API endpoint not covered by the named tools above. Use the exact path, e.g. /api/crypto-tracing.",
    {
      path: z.string().describe("API path, e.g. /api/vessel-check/risk-profile"),
      method: z.enum(["GET", "POST"]).default("POST"),
      body: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Request body as JSON object"),
      query: z
        .record(z.string(), z.string())
        .optional()
        .describe("URL query parameters"),
    },
    async (args) => {
      const data = await callApi(args.path, args.method, args.body as unknown, args.query);
      return txt(data);
    },
  );

  return server;
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });
  await server.connect(transport);
  const response = await transport.handleRequest(req);
  await server.close();
  return response;
}

export async function GET(req: Request): Promise<Response> {
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(req);
  // Don't close for SSE — the stream stays open
  return response;
}

export async function DELETE(req: Request): Promise<Response> {
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(req);
  await server.close();
  return response;
}
