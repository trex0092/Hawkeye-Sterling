// GET /api/routes
//
// Audit M-04: the auditor probed /api/screen, /api/pep, /api/audit-trail,
// /api/goaml-report, /api/relationship-graph, /api/lei via `call_api` and
// got HTTP 404 from each — the real paths differ from the MCP tool names.
// Without a discovery endpoint, callers had to grep the source to find the
// right path. This route publishes a curated index of public endpoints
// (method, path, brief description, auth scope) so MCP tool-name → API
// path mapping is unambiguous.
//
// Privacy: no secrets, no env values, no internal-only routes. Safe to
// expose to operators and to the MCP layer.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Method = "GET" | "POST" | "DELETE";
type AuthScope = "operator" | "mlro" | "admin" | "public";

interface RouteEntry {
  path: string;
  method: Method;
  description: string;
  scope: AuthScope;
  /** MCP tool names that proxy here, if any. Helps operators map tool→endpoint. */
  mcpTools?: string[];
}

// Curated index — keep alphabetical-by-path within each section.
const ROUTES: readonly RouteEntry[] = [
  // ── Screening ───────────────────────────────────────────────────────────────
  { path: "/api/batch-screen",     method: "POST", description: "Batch screening: subjects[] against sanctions/PEP/adverse media.",                       scope: "operator", mcpTools: ["screen"] },
  { path: "/api/quick-screen",     method: "POST", description: "Single-subject screening with full provenance.",                                          scope: "operator", mcpTools: ["screen"] },
  { path: "/api/smart-disambiguate", method: "POST", description: "Bulk hit disambiguation for high-frequency names.",                                     scope: "mlro",     mcpTools: ["smart_disambiguate"] },

  // ── PEP ─────────────────────────────────────────────────────────────────────
  { path: "/api/pep-profile",      method: "POST", description: "PEP profile lookup (depth=0).",                                                            scope: "operator", mcpTools: ["pep"] },
  { path: "/api/pep-network",      method: "POST", description: "PEP association network (depth=1..3).",                                                    scope: "mlro",     mcpTools: ["pep"] },
  { path: "/api/pep-corporate",    method: "POST", description: "PEP-controlled corporate entity check.",                                                   scope: "mlro" },
  { path: "/api/pep-screening-enhance", method: "POST", description: "Enhanced PEP screening with multi-source corroboration.",                             scope: "mlro" },
  { path: "/api/pep-edd-generator", method: "POST", description: "Generate EDD questionnaire for an identified PEP.",                                       scope: "mlro" },

  // ── Sanctions ───────────────────────────────────────────────────────────────
  { path: "/api/sanctions/status", method: "GET",  description: "Per-list health (entityCount, freshness, warnings). Replaces audit-flagged red signal.",  scope: "operator", mcpTools: ["sanctions_status"] },
  { path: "/api/sanctions-indirect", method: "POST", description: "Indirect-exposure sanctions search via UBO/control chain.",                              scope: "mlro" },
  { path: "/api/sanctions-exposure-calc",   method: "POST", description: "Calculate exposure score across all sanctions regimes.",                          scope: "mlro" },
  { path: "/api/sanctions-exposure-mapper", method: "POST", description: "Map sanctions exposure across a counterparty chain.",                             scope: "mlro" },

  // ── Country / Geo ───────────────────────────────────────────────────────────
  { path: "/api/country-risk",     method: "POST", description: "Country risk profile (AML, FATF, sanctions, political).",                                 scope: "operator", mcpTools: ["country_risk"] },
  { path: "/api/country-risk/compare", method: "POST", description: "Side-by-side country risk comparison.",                                                scope: "operator" },
  { path: "/api/geo-intelligence",     method: "POST", description: "Geopolitical event intelligence layer.",                                               scope: "mlro" },

  // ── Vessel / Vasp / Crypto ─────────────────────────────────────────────────
  { path: "/api/vessel-check",            method: "POST", description: "IMO vessel screening (single or batch).",                                          scope: "operator", mcpTools: ["vessel_check"] },
  { path: "/api/vessel-check/risk-profile", method: "POST", description: "Vessel risk profile (flag state, ownership, sanctions overlap).",                scope: "mlro" },
  { path: "/api/crypto-tracing",          method: "POST", description: "On-chain address tracing.",                                                          scope: "mlro",     mcpTools: ["crypto_risk"] },
  { path: "/api/vasp-risk",               method: "POST", description: "Virtual Asset Service Provider risk profile.",                                      scope: "mlro" },

  // ── Entity / LEI / Identity ────────────────────────────────────────────────
  { path: "/api/lei-lookup",       method: "POST", description: "GLEIF LEI lookup (single record or name search). Cached on GLEIF outage.",                scope: "operator", mcpTools: ["lei_lookup"] },
  { path: "/api/lei-lookup",       method: "GET",  description: "GLEIF LEI lookup via query params: ?lei=<20-char> or ?legalName=<name>.",                  scope: "operator", mcpTools: ["lei_lookup"] },
  { path: "/api/gleif",            method: "POST", description: "Raw GLEIF passthrough — prefer /api/lei-lookup for cached results.",                       scope: "admin" },
  { path: "/api/ubo-risk",         method: "POST", description: "Ultimate beneficial owner risk profile.",                                                  scope: "mlro" },
  { path: "/api/ownership",        method: "POST", description: "Corporate ownership chain traversal.",                                                     scope: "mlro" },

  // ── Transaction / Anomaly ───────────────────────────────────────────────────
  { path: "/api/transaction-anomaly", method: "POST", description: "Streaming anomaly score. Body: { transaction: { amountUsd, ... }, sessionId? }.",       scope: "operator", mcpTools: ["transaction_anomaly"] },
  { path: "/api/typology-match",   method: "POST", description: "FATF predicate offence typology match.",                                                   scope: "mlro",     mcpTools: ["typology_match"] },
  { path: "/api/transaction-monitor/typology-tag", method: "POST", description: "Tag an existing transaction with typology codes.",                          scope: "mlro" },

  // ── Cases / Audit / Reports ────────────────────────────────────────────────
  { path: "/api/cases",            method: "GET",  description: "List compliance cases with pagination + filtering.",                                       scope: "operator", mcpTools: ["get_cases"] },
  { path: "/api/cases/triage",     method: "POST", description: "AI batch triage for cases.",                                                                scope: "mlro" },
  { path: "/api/cases/nl-search",  method: "POST", description: "Natural-language case search.",                                                             scope: "operator" },
  { path: "/api/audit/view",       method: "GET",  description: "HMAC-signed audit trail. Provide ?screeningId=<id> for one case, omit for 10 most recent.", scope: "mlro",     mcpTools: ["audit_trail"] },
  { path: "/api/sar-report",       method: "POST", description: "Generate SAR/STR draft narrative + goAML XML. FILED VIA goaml.uae.gov.ae — not from here.", scope: "mlro",     mcpTools: ["generate_sar_report"] },
  { path: "/api/compliance-report", method: "POST", description: "Generate compliance report (scope=screening | full).",                                    scope: "mlro",     mcpTools: ["generate_report"] },

  // ── Regulatory / Intel ─────────────────────────────────────────────────────
  { path: "/api/regulatory-feed",  method: "GET",  description: "Live UAE regulatory feed (CBUAE, MoET, FSRA, FATF, OFAC, UN, Google News).",              scope: "operator", mcpTools: ["regulatory_feed"] },
  { path: "/api/compliance-qa",    method: "POST", description: "Multi-agent regulatory Q&A with citations.",                                               scope: "mlro",     mcpTools: ["compliance_qa"] },
  { path: "/api/adverse-media",    method: "POST", description: "GDELT + Google News RSS adverse-media scan.",                                              scope: "operator", mcpTools: ["intel_feed"] },
  { path: "/api/news-intel/feed",  method: "GET",  description: "Live news intelligence feed.",                                                              scope: "operator" },
  { path: "/api/news-intel/analyze", method: "POST", description: "Synthesise news items into typology-tagged risk profile.",                                scope: "mlro" },

  // ── System / Health / MCP ──────────────────────────────────────────────────
  { path: "/api/mcp",              method: "POST", description: "MCP JSON-RPC endpoint (Streamable HTTP). Add to Claude.ai connectors.",                    scope: "public",   mcpTools: ["call_api"] },
  { path: "/api/health",           method: "GET",  description: "Lightweight health probe.",                                                                 scope: "public" },
  { path: "/api/routes",           method: "GET",  description: "This index — list of public API routes with methods and MCP tool mappings.",               scope: "public" },
];

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const tool = url.searchParams.get("mcpTool")?.trim();
  const filtered = tool
    ? ROUTES.filter((r) => r.mcpTools?.includes(tool))
    : ROUTES;

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      total: filtered.length,
      routes: filtered,
      hint: tool
        ? `Showing routes proxied by MCP tool "${tool}". Drop ?mcpTool to list all.`
        : "Tip: /api/routes?mcpTool=<name> filters by MCP tool. /api/health is the lightweight readiness probe.",
    },
    { headers: gate.headers },
  );
}
