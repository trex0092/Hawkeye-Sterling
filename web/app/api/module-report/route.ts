import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MASTER_INBOX_GID    = "1214148630166524"; // 00 · Master Inbox (fallback)
const DEFAULT_WORKSPACE_GID = "1213645083721316";
const DEFAULT_ASSIGNEE_GID  = "1213645083721304"; // Luisa Fernanda

// Per-module Asana project routing.
// Each env var should be set to the GID of the corresponding Asana project.
// Fall back to Master Inbox when not configured so reports still land somewhere.
//
// Env vars to set in Netlify → Site settings → Environment variables:
//   ASANA_SCREENING_PROJECT_GID   → 01 · Screening — Sanctions & Watchlists
//   ASANA_FFR_PROJECT_GID         → 06 · FFR Incidents & Asset Freeze
//   ASANA_KYC_PROJECT_GID         → 07 · CDD/SDD/EDD/KYC
//   ASANA_SHIPMENTS_PROJECT_GID   → 10 · Shipments — Tracking
//   ASANA_MLRO_PROJECT_GID        → 15 · MLRO Workbench
//   ASANA_SUPPLYCHAIN_PROJECT_GID → 16 · Supply Chain, ESG & Trade
function projectGidForModule(module: string): string {
  const inbox = process.env["ASANA_PROJECT_GID"] ?? MASTER_INBOX_GID;
  switch (module) {
    // 01 · Screening — Sanctions & Watchlists
    case "screening":
    case "ongoing-monitor":
    case "batch":
    case "adverse-media-lookback":
    case "adverse-media":
      return process.env["ASANA_SCREENING_PROJECT_GID"] ?? inbox;

    // 02 · Central MLRO Daily Dashboard
    case "analytics":
    case "oversight":
    case "ewra":
    case "rmi":
      return process.env["ASANA_MLRO_DAILY_PROJECT_GID"] ?? inbox;

    // 05 · STR/SAR/CTR/PMR
    case "str-cases":
    case "sar-qa":
      return process.env["ASANA_SAR_PROJECT_GID"] ?? inbox;

    // 06 · FFR Incidents & Asset Freeze — forensic digit analysis
    case "benford":
      return process.env["ASANA_FFR_PROJECT_GID"] ?? inbox;

    // 07 · CDD/SDD/EDD/KYC — entity enrichment & due-diligence tools
    case "gleif":
    case "domain-intel":
    case "crypto-risk":
    case "cdd-review":
    case "ubo-declaration":
    case "vendor-dd":
      return process.env["ASANA_KYC_PROJECT_GID"] ?? inbox;

    // 08 · Transaction Monitoring
    case "transaction-monitor":
      return process.env["ASANA_TM_PROJECT_GID"] ?? inbox;

    // 10 · Shipments — Tracking
    case "shipments":
      return process.env["ASANA_SHIPMENTS_PROJECT_GID"] ?? inbox;

    // 15 · MLRO Workbench — advisor, investigation, AI tools, playbooks, policies
    case "mlro-advisor":
    case "investigation":
    case "weaponized-brain":
    case "workbench":
    case "playbook":
    case "policies":
    case "regulatory":
      return process.env["ASANA_MLRO_PROJECT_GID"] ?? inbox;

    // 16 · Supply Chain, ESG & Trade — vessel / trade compliance
    case "vessel-check":
    case "eocn":
      return process.env["ASANA_SUPPLYCHAIN_PROJECT_GID"] ?? inbox;

    // 02 · Central MLRO Daily Dashboard — governance, data, staff
    case "audit-trail":
    case "data-quality":
    case "corrections":
    case "training":
      return process.env["ASANA_MLRO_DAILY_PROJECT_GID"] ?? inbox;

    // 05 · STR/SAR/CTR/PMR — enforcement actions and case management
    case "enforcement":
    case "cases":
      return process.env["ASANA_SAR_PROJECT_GID"] ?? inbox;

    // 07 · CDD/SDD/EDD/KYC — OSINT, client and employee due diligence
    case "intel":
    case "client-portal":
    case "employees":
      return process.env["ASANA_KYC_PROJECT_GID"] ?? inbox;

    default:
      return inbox;
  }
}

const MODULE_LABELS: Record<string, string> = {
  // 01 · Screening
  screening:              "Screening",
  "ongoing-monitor":      "Ongoing Monitor",
  batch:                  "Batch Screen",
  "adverse-media-lookback": "Adverse Media Lookback",
  "adverse-media":        "Adverse Media",
  // 02 · MLRO Daily
  analytics:              "Analytics",
  oversight:              "Oversight",
  ewra:                   "Enterprise-Wide Risk Assessment",
  rmi:                    "Risk & Management Information",
  // 05 · STR/SAR
  "str-cases":            "STR / SAR Cases",
  "sar-qa":               "SAR Quality Assurance",
  // 06 · FFR
  benford:                "Benford Analysis",
  // 07 · CDD/KYC
  gleif:                  "GLEIF / LEI",
  "domain-intel":         "Domain Intel",
  "crypto-risk":          "Crypto Risk",
  "cdd-review":           "CDD Review",
  "ubo-declaration":      "UBO Declaration",
  "vendor-dd":            "Vendor Due Diligence",
  // 08 · TM
  "transaction-monitor":  "Transaction Monitor",
  // 10 · Shipments
  shipments:              "Shipments",
  // 15 · MLRO Workbench
  "mlro-advisor":         "MLRO Advisor",
  investigation:          "Investigation",
  "weaponized-brain":     "Weaponized Brain",
  // 16 · Supply Chain
  "vessel-check":         "Vessel Check",
  eocn:                   "EOCN Trade Compliance",
  // General
  "audit-trail":          "Audit Trail",
  enforcement:            "Enforcement",
  intel:                  "OSINT Intelligence",
  training:               "Training",
  employees:              "Employees",
  "client-portal":        "Client Portal",
  corrections:            "Corrections",
  "data-quality":         "Data Quality",
  playbook:               "Playbook",
  policies:               "Policies",
  regulatory:             "Regulatory",
  cases:                  "Cases",
  "api-docs":             "API Documentation",
  "compliance-qa":        "Compliance Q&A",
  workbench:              "MLRO Workbench",
};

// Project label map — shown in the task notes so the MLRO knows the destination.
const PROJECT_BOARD: Record<string, string> = {
  screening:              "01 · Screening — Sanctions & Watchlists",
  "ongoing-monitor":      "01 · Screening — Sanctions & Watchlists",
  batch:                  "01 · Screening — Sanctions & Watchlists",
  "adverse-media-lookback": "01 · Screening — Sanctions & Watchlists",
  "adverse-media":        "01 · Screening — Sanctions & Watchlists",
  analytics:              "02 · Central MLRO Daily Dashboard",
  oversight:              "02 · Central MLRO Daily Dashboard",
  ewra:                   "02 · Central MLRO Daily Dashboard",
  rmi:                    "02 · Central MLRO Daily Dashboard",
  "str-cases":            "05 · STR/SAR/CTR/PMR",
  "sar-qa":               "05 · STR/SAR/CTR/PMR",
  benford:                "06 · FFR Incidents & Asset Freeze",
  gleif:                  "07 · CDD/SDD/EDD/KYC",
  "domain-intel":         "07 · CDD/SDD/EDD/KYC",
  "crypto-risk":          "07 · CDD/SDD/EDD/KYC",
  "cdd-review":           "07 · CDD/SDD/EDD/KYC",
  "ubo-declaration":      "07 · CDD/SDD/EDD/KYC",
  "vendor-dd":            "07 · CDD/SDD/EDD/KYC",
  "transaction-monitor":  "08 · Transaction Monitoring",
  shipments:              "10 · Shipments — Tracking",
  "mlro-advisor":         "15 · MLRO Workbench",
  investigation:          "15 · MLRO Workbench",
  "weaponized-brain":     "15 · MLRO Workbench",
  "vessel-check":         "16 · Supply Chain, ESG & Trade",
  eocn:                   "16 · Supply Chain, ESG & Trade",
  // 02 · MLRO Daily — governance & data
  "audit-trail":          "02 · Central MLRO Daily Dashboard",
  "data-quality":         "02 · Central MLRO Daily Dashboard",
  corrections:            "02 · Central MLRO Daily Dashboard",
  training:               "02 · Central MLRO Daily Dashboard",
  // 05 · STR/SAR — enforcement & cases
  enforcement:            "05 · STR/SAR/CTR/PMR",
  cases:                  "05 · STR/SAR/CTR/PMR",
  // 07 · CDD/KYC — OSINT & client/employee DD
  intel:                  "07 · CDD/SDD/EDD/KYC",
  "client-portal":        "07 · CDD/SDD/EDD/KYC",
  employees:              "07 · CDD/SDD/EDD/KYC",
  // 15 · MLRO Workbench
  workbench:              "15 · MLRO Workbench",
  playbook:               "15 · MLRO Workbench",
  policies:               "15 · MLRO Workbench",
  regulatory:             "15 · MLRO Workbench",
};

interface Body {
  module: string;
  label: string;
  summary: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

interface ApiResponse {
  ok: boolean;
  taskGid?: string;
  taskUrl?: string;
  error?: string;
  detail?: string;
}

function respond(status: number, body: ApiResponse): NextResponse {
  return NextResponse.json(body, { status });
}

function buildNotes(b: Body, gen: Date): string {
  const moduleLabel = MODULE_LABELS[b.module] ?? b.module.toUpperCase();
  const board = PROJECT_BOARD[b.module] ?? "00 · Master Inbox";
  const lines: string[] = [];
  lines.push(`HAWKEYE STERLING · ${moduleLabel.toUpperCase()} MODULE REPORT`);
  lines.push(`Generated   : ${gen.toUTCString().replace(" GMT", " UTC")}`);
  lines.push(`Module      : ${moduleLabel}`);
  lines.push(`Board       : ${board}`);
  lines.push(`Subject     : ${b.label}`);
  lines.push("");
  lines.push(`SUMMARY`);
  lines.push(b.summary);
  lines.push("");
  if (b.metadata && Object.keys(b.metadata).length > 0) {
    lines.push(`DETAIL`);
    for (const [k, v] of Object.entries(b.metadata)) {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v);
      lines.push(`${k.padEnd(18, " ")}: ${val}`);
    }
    lines.push("");
  }
  const pageUrl = b.url ?? `https://hawkeye-sterling.netlify.app/${b.module}`;
  lines.push(`Module URL  : ${pageUrl}`);
  lines.push(`Legal basis : FDL 10/2025 Art.26-27 · CR 134/2025 Art.18 · 10-year retention`);
  return lines.join("\n");
}

async function handleModuleReport(req: Request): Promise<NextResponse> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return respond(503, {
      ok: false,
      error: "asana not configured",
      detail: "Set ASANA_TOKEN in Netlify env vars for the hawkeye-sterling site.",
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return respond(400, { ok: false, error: "invalid JSON body" });
  }
  if (!body?.module || !body?.label || !body?.summary) {
    return respond(400, { ok: false, error: "module, label and summary are required" });
  }

  const gen = new Date();
  const moduleLabel = MODULE_LABELS[body.module] ?? body.module.toUpperCase();
  const taskName = `[${moduleLabel.toUpperCase()}] ${body.label} · ${gen.toISOString().slice(0, 10)}`;
  const notes = buildNotes(body, gen);
  const projectGid = projectGidForModule(body.module);

  const TIMEOUT_MS = 10_000;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let asanaRes: Response;
    try {
      asanaRes = await fetch("https://app.asana.com/api/1.0/tasks", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          data: {
            name: taskName,
            notes,
            projects: [projectGid],
            workspace: process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE_GID,
            assignee: process.env["ASANA_ASSIGNEE_GID"] ?? DEFAULT_ASSIGNEE_GID,
          },
        }),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const payload = (await asanaRes.json().catch(() => null)) as
      | { data?: { gid?: string; permalink_url?: string }; errors?: { message?: string }[] }
      | null;

    if (!asanaRes.ok || !payload?.data?.gid) {
      const msg = payload?.errors?.[0]?.message ?? `HTTP ${asanaRes.status}`;
      const mappedStatus =
        asanaRes.status >= 500 ? 502
        : asanaRes.status === 401 || asanaRes.status === 403 ? 503
        : 422;
      return respond(mappedStatus, { ok: false, error: "asana rejected the task", detail: msg });
    }

    return respond(201, {
      ok: true,
      taskGid: payload.data.gid,
      ...(payload.data.permalink_url ? { taskUrl: payload.data.permalink_url } : {}),
    });
  } catch (err) {
    return respond(500, {
      ok: false,
      error: "asana request failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export const POST = withGuard(handleModuleReport);
