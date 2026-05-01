import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MASTER_INBOX_GID    = "1214148630166524"; // 00 · Master Inbox (fallback)
const DEFAULT_WORKSPACE_GID = "1213645083721316";
const DEFAULT_ASSIGNEE_GID  = "1213645083721304"; // Luisa Fernanda

// Per-module Asana project routing — mapped to 19 Asana boards.
// Env vars to set in Netlify → Site settings → Environment variables:
//   ASANA_SCREENING_PROJECT_GID      → 01 · Screening — Sanctions & Adverse Media
//   ASANA_MLRO_DAILY_PROJECT_GID     → 02 · Central MLRO Daily Digest
//   ASANA_AUDIT_LOG_PROJECT_GID      → 03 · Audit Log 10-Year Trail
//   ASANA_FOUR_EYES_PROJECT_GID      → 04 · Four-Eyes Approvals
//   ASANA_SAR_PROJECT_GID            → 05 · STR/SAR/CTR/PMR GoAML Filings
//   ASANA_FFR_PROJECT_GID            → 06 · FFR Incidents & Asset Freezes
//   ASANA_KYC_PROJECT_GID            → 07 · CDD/SDD/EDD/KYC — Customer Due Diligence
//   ASANA_TM_PROJECT_GID             → 08 · Transaction Monitoring
//   ASANA_COMPLIANCE_OPS_PROJECT_GID → 09 · Compliance Ops — Daily & Weekly Tasks
//   ASANA_SHIPMENTS_PROJECT_GID      → 10 · Shipments — Tracking
//   ASANA_EMPLOYEES_PROJECT_GID      → 11 · Employees
//   ASANA_TRAINING_PROJECT_GID       → 12 · Training
//   ASANA_GOVERNANCE_PROJECT_GID     → 13 · Compliance Governance
//   ASANA_ROUTINES_PROJECT_GID       → 14 · Routines — Scheduled
//   ASANA_MLRO_PROJECT_GID           → 15 · MLRO Workbench
//   ASANA_SUPPLYCHAIN_PROJECT_GID    → 16 · Supply Chain, ESG & LBMA Gold
//   ASANA_EXPORT_CTRL_PROJECT_GID    → 17 · Export Control & Dual-Use
//   ASANA_REGULATOR_PROJECT_GID      → 18 · Regulator Portal Handoff
//   ASANA_INCIDENTS_PROJECT_GID      → 19 · Incidents & Grievances
function projectGidForModule(module: string): string {
  const inbox = process.env["ASANA_PROJECT_GID"] ?? MASTER_INBOX_GID;
  switch (module) {
    // 01 · Screening — Sanctions & Adverse Media
    // Primary nav: Screening, Batch · Governance: AM Lookback · Live Adverse Media
    case "screening":
    case "batch":
    case "adverse-media-lookback":
    case "adverse-media":
    case "adverse-media-live":
      return process.env["ASANA_SCREENING_PROJECT_GID"] ?? inbox;

    // 02 · Central MLRO Daily Digest
    // Intelligence: Analytics (MLRO performance digest)
    case "analytics":
      return process.env["ASANA_MLRO_DAILY_PROJECT_GID"] ?? inbox;

    // 03 · Audit Log 10-Year Trail
    // Governance: Audit (immutable audit chain)
    case "audit-trail":
      return process.env["ASANA_AUDIT_LOG_PROJECT_GID"] ?? inbox;

    // 04 · Four-Eyes Approvals
    // Governance: SAR QA (literal "four-eyes review" module per nav hint)
    case "sar-qa":
      return process.env["ASANA_FOUR_EYES_PROJECT_GID"] ?? inbox;

    // 05 · STR/SAR/CTR/PMR GoAML Filings
    // Primary nav: STR/SAR, Cases (case-management & filings), goAML Submission wizard
    case "str-cases":
    case "cases":
    case "goaml-submission":
      return process.env["ASANA_SAR_PROJECT_GID"] ?? inbox;

    // 06 · FFR Incidents & Asset Freezes
    // Enrichment: Benford (forensic fraud detection)
    case "benford":
      return process.env["ASANA_FFR_PROJECT_GID"] ?? inbox;

    // 07 · CDD/SDD/EDD/KYC — Customer Due Diligence
    // Enrichment: GLEIF, Domain Intel, Crypto Risk, Entity Graph
    // Operations: Client portal, UBO declaration, Supplier DD, CDD Review
    case "gleif":
    case "domain-intel":
    case "crypto-risk":
    case "vendor-dd":
    case "client-portal":
    case "ubo-declaration":
    case "cdd-review":
    case "entity-graph":
      return process.env["ASANA_KYC_PROJECT_GID"] ?? inbox;

    // 08 · Transaction Monitoring
    // Primary nav: Transaction monitor
    case "transaction-monitor":
      return process.env["ASANA_TM_PROJECT_GID"] ?? inbox;

    // 09 · Compliance Ops — Daily & Weekly Tasks
    // Governance: Regulatory, Policies, Playbook
    // Intelligence: Data quality · Operations: Corrections
    case "policies":
    case "regulatory":
    case "playbook":
    case "data-quality":
    case "corrections":
      return process.env["ASANA_COMPLIANCE_OPS_PROJECT_GID"] ?? inbox;

    // 10 · Shipments — Tracking
    // Operations: Shipments (bullion chain-of-custody)
    case "shipments":
      return process.env["ASANA_SHIPMENTS_PROJECT_GID"] ?? inbox;

    // 11 · Employees
    // Operations: Employees (HR registry)
    case "employees":
      return process.env["ASANA_EMPLOYEES_PROJECT_GID"] ?? inbox;

    // 12 · Training
    // Operations: Training (staff certification)
    case "training":
      return process.env["ASANA_TRAINING_PROJECT_GID"] ?? inbox;

    // 13 · Compliance Governance
    // Governance: EWRA, Oversight, Enforcement, Responsible AI, Eval KPIs
    case "ewra":
    case "oversight":
    case "enforcement":
    case "responsible-ai":
    case "eval-kpi":
      return process.env["ASANA_GOVERNANCE_PROJECT_GID"] ?? inbox;

    // 14 · Routines — Scheduled
    // Primary nav: Monitoring (ongoing-monitor scheduled runs)
    case "ongoing-monitor":
      return process.env["ASANA_ROUTINES_PROJECT_GID"] ?? inbox;

    // 15 · MLRO Workbench
    // Primary nav: MLRO Advisor, Intel
    // Intelligence: Workbench, Investigation, Brain, OSINT, Heatmap, Telemetry, Red-Team
    case "mlro-advisor":
    case "workbench":
    case "investigation":
    case "weaponized-brain":
    case "intel":
    case "osint":
    case "heatmap":
    case "telemetry":
    case "red-team":
      return process.env["ASANA_MLRO_PROJECT_GID"] ?? inbox;

    // 16 · Supply Chain, ESG & LBMA Gold
    // Enrichment: Vessel Check · Governance: RMI / RMAP (Responsible Minerals)
    case "vessel-check":
    case "rmi":
      return process.env["ASANA_SUPPLYCHAIN_PROJECT_GID"] ?? inbox;

    // 17 · Export Control & Dual-Use
    // Governance: EOCN (UAE TFS list & dual-use declarations)
    case "eocn":
      return process.env["ASANA_EXPORT_CTRL_PROJECT_GID"] ?? inbox;

    // 18 · Regulator Portal Handoff
    // Governance: Inspection Room
    case "inspection-room":
      return process.env["ASANA_REGULATOR_PROJECT_GID"] ?? inbox;

    // 07 · CDD/KYC — Onboarding Wizard
    case "onboarding":
      return process.env["ASANA_KYC_PROJECT_GID"] ?? inbox;

    // 05 · STR/SAR — legacy goAML export
    case "goaml":
      return process.env["ASANA_SAR_PROJECT_GID"] ?? inbox;

    // Everything else (status, …) lands in 00 · Master Inbox.
    default:
      return inbox;
  }
}

const MODULE_LABELS: Record<string, string> = {
  // 01 · Screening
  screening:                "Screening",
  batch:                    "Batch Screen",
  "adverse-media-lookback": "Adverse Media Lookback",
  "adverse-media":          "Adverse Media",
  "adverse-media-live":     "Live Adverse Media Feed",
  // 02 · MLRO Daily Digest
  analytics:                "Analytics",
  rmi:                      "Risk & Management Information",
  oversight:                "Oversight",
  // 03 · Audit Log
  "audit-trail":            "Audit Trail",
  // 04 · Four-Eyes Approvals
  "cdd-review":             "CDD Review",
  "ubo-declaration":        "UBO Declaration",
  // 05 · STR/SAR
  "str-cases":              "STR / SAR Cases",
  "sar-qa":                 "SAR Quality Assurance",
  cases:                    "Cases",
  enforcement:              "Enforcement",
  "goaml-submission":       "goAML STR Submission",
  // 06 · FFR
  benford:                  "Benford Analysis",
  // 07 · CDD/KYC
  gleif:                    "GLEIF / LEI",
  "entity-graph":           "Entity Graph & UBO Intelligence",
  "domain-intel":           "Domain Intel",
  "crypto-risk":            "Crypto Risk",
  "vendor-dd":              "Vendor Due Diligence",
  "client-portal":          "Client Portal",
  intel:                    "OSINT Intelligence",
  // 08 · Transaction Monitoring
  "transaction-monitor":    "Transaction Monitor",
  // 09 · Compliance Ops
  policies:                 "Policies",
  regulatory:               "Regulatory",
  playbook:                 "Playbook",
  "data-quality":           "Data Quality",
  corrections:              "Corrections",
  // 10 · Shipments
  shipments:                "Shipments",
  // 11 · Employees
  employees:                "Employees",
  // 12 · Training
  training:                 "Training",
  // 13 · Compliance Governance
  ewra:                     "Enterprise-Wide Risk Assessment",
  "api-docs":               "API Documentation",
  "responsible-ai":         "Responsible AI Governance",
  "eval-kpi":               "Eval KPIs & Performance Metrics",
  // 14 · Routines
  "ongoing-monitor":        "Ongoing Monitor",
  // 15 · MLRO Workbench
  workbench:                "MLRO Workbench",
  "mlro-advisor":           "MLRO Advisor",
  investigation:            "Investigation",
  "weaponized-brain":       "Weaponized Brain",
  heatmap:                  "Geographic Heatmap",
  telemetry:                "Mode Telemetry",
  "red-team":               "Red-Team Prompt Tests",
  // 16 · Supply Chain
  "vessel-check":           "Vessel Check",
  // 17 · Export Control
  eocn:                     "EOCN Trade Compliance",
  // 18 · Regulator Portal
  "inspection-room":        "Inspection Room",
  // 07 · CDD — Onboarding
  onboarding:               "Onboarding Wizard",
  // 05 · STR/SAR
  goaml:                    "goAML Export",
};

// Project board label — shown in the Asana task notes.
const PROJECT_BOARD: Record<string, string> = {
  screening:                "01 · Screening — Sanctions & Adverse Media",
  batch:                    "01 · Screening — Sanctions & Adverse Media",
  "adverse-media-lookback": "01 · Screening — Sanctions & Adverse Media",
  "adverse-media":          "01 · Screening — Sanctions & Adverse Media",
  "adverse-media-live":     "01 · Screening — Sanctions & Adverse Media",
  analytics:                "02 · Central MLRO Daily Digest",
  rmi:                      "02 · Central MLRO Daily Digest",
  oversight:                "02 · Central MLRO Daily Digest",
  "audit-trail":            "03 · Audit Log 10-Year Trail",
  "cdd-review":             "04 · Four-Eyes Approvals",
  "ubo-declaration":        "04 · Four-Eyes Approvals",
  "str-cases":              "05 · STR/SAR/CTR/PMR GoAML Filings",
  "sar-qa":                 "05 · STR/SAR/CTR/PMR GoAML Filings",
  cases:                    "05 · STR/SAR/CTR/PMR GoAML Filings",
  enforcement:              "05 · STR/SAR/CTR/PMR GoAML Filings",
  "goaml-submission":       "05 · STR/SAR/CTR/PMR GoAML Filings",
  benford:                  "06 · FFR Incidents & Asset Freezes",
  gleif:                    "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "entity-graph":           "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "domain-intel":           "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "crypto-risk":            "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "vendor-dd":              "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "client-portal":          "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  intel:                    "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  "transaction-monitor":    "08 · Transaction Monitoring",
  policies:                 "09 · Compliance Ops — Daily & Weekly Tasks",
  regulatory:               "09 · Compliance Ops — Daily & Weekly Tasks",
  playbook:                 "09 · Compliance Ops — Daily & Weekly Tasks",
  "data-quality":           "09 · Compliance Ops — Daily & Weekly Tasks",
  corrections:              "09 · Compliance Ops — Daily & Weekly Tasks",
  shipments:                "10 · Shipments — Tracking",
  employees:                "11 · Employees",
  training:                 "12 · Training",
  ewra:                     "13 · Compliance Governance",
  "api-docs":               "13 · Compliance Governance",
  "responsible-ai":         "13 · Compliance Governance",
  "eval-kpi":               "13 · Compliance Governance",
  "ongoing-monitor":        "14 · Routines — Scheduled",
  workbench:                "15 · MLRO Workbench",
  "mlro-advisor":           "15 · MLRO Workbench",
  investigation:            "15 · MLRO Workbench",
  "weaponized-brain":       "15 · MLRO Workbench",
  heatmap:                  "15 · MLRO Workbench",
  telemetry:                "15 · MLRO Workbench",
  "red-team":               "15 · MLRO Workbench",
  "vessel-check":           "16 · Supply Chain, ESG & LBMA Gold",
  eocn:                     "17 · Export Control & Dual-Use",
  "inspection-room":        "18 · Regulator Portal Handoff",
  onboarding:               "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
  goaml:                    "05 · STR/SAR/CTR/PMR GoAML Filings",
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
