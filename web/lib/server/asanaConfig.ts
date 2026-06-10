// Hawkeye Sterling — Asana GID resolver.
//
// Backstop for the AWS Lambda 4 KB env-var ceiling: instead of 25
// individual `ASANA_*_PROJECT_GID` env vars (~1.5 KB combined), the
// operator can set ONE `ASANA_GIDS_JSON` env var with all of them
// inside, e.g.:
//
//   ASANA_GIDS_JSON={"sar":"1215387011137084","tm":"...", ...}
//
// Each lookup checks the JSON map first, then the legacy individual
// env var, then the hardcoded fallback baked into the code below.
// All three layers default-on so operators can mix-and-match while
// migrating.

import { boardKeyForModule, boardProjectGid } from "./asana-workspace-map";

interface AsanaGidMap {
  master?: string;
  screening?: string;
  sar?: string;
  tm?: string;
  escalations?: string;
  mlro?: string;
  mlroDaily?: string;
  kyc?: string;
  fourEyes?: string;
  auditLog?: string;
  complianceOps?: string;
  governance?: string;
  routines?: string;
  ffr?: string;
  employees?: string;
  training?: string;
  exportCtrl?: string;
  shipments?: string;
  supplyChain?: string;
  regulator?: string;
  incidents?: string;
  workspace?: string;
  assignee?: string;
  cfSubject?: string;
  cfEntityType?: string;
  cfMode?: string;
  cfTotalMatches?: string;
}

let cached: AsanaGidMap | null = null;
function loadJsonMap(): AsanaGidMap {
  if (cached) return cached;
  const raw = process.env["ASANA_GIDS_JSON"];
  if (!raw) { cached = {}; return cached; }
  try {
    const parsed = JSON.parse(raw) as AsanaGidMap;
    cached = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("[asanaConfig] ASANA_GIDS_JSON failed to parse; falling back to individual env vars");
    cached = {};
  }
  return cached;
}

// Hardcoded fallbacks — these are the actual Hawkeye Sterling project
// GIDs in the operator's Asana workspace (also in netlify.toml history
// + previous .env.example). When NO env var is set, the code routes
// to these so screening/SAR/STR/TM still work without configuration.
const HARDCODED: Required<AsanaGidMap> = {
  master:         "1215400000666794",  // 00 · Hawkeye Inbox — Master Landing
  screening:      "1215389861812333",  // 01 · Screening - Sanctions & Adverse Media
  sar:            "1215387011137084",  // 05 · STR/SAR/CTR/PMR GoAML Filings
  tm:             "1215395098470750",  // 08 · Transaction Monitoring
  escalations:    "1215395098470712",  // 06 · FFR Incidents & Asset Freezes
  mlro:           "1215391626794374",  // 15 · MLRO Workbench
  mlroDaily:      "1215387011471390",  // 02 · Central MLRO Daily Digest
  kyc:            "1215400000658017",  // 07 · CDD/SDD/EDD/KYC
  fourEyes:       "1215391627746047",  // 04 · Four-Eyes Approvals
  auditLog:       "1215395098393602",  // 03 · Audit Log 10-Year Trail
  complianceOps:  "1215387011735720",  // 09 · Compliance Ops
  governance:     "1215387011867514",  // 13 · Compliance Governance
  routines:       "1215395098469392",  // 14 · Routines - Scheduled
  ffr:            "1215395098470712",  // 06 · FFR Incidents & Asset Freezes
  employees:      "1215400001087278",  // 11 · Employees
  training:       "1215389861887696",  // 12 · Training
  exportCtrl:     "1215391628026645",  // 17 · Export Control & Dual-Use
  shipments:      "1215391627861901",  // 10 · Shipments - Tracking
  supplyChain:    "1215400001079027",  // 16 · Supply Chain, ESG & LBMA Gold
  regulator:      "1215400000466496",  // 18 · Regulator Portal Handoff
  incidents:      "1215387012131368",  // 19 · Incidents & Grievances
  workspace:      "1213645083721316",  // ASANA_WORKSPACE_GID
  assignee:       "1213645083721304",  // default MLRO assignee
  cfSubject:      "",
  cfEntityType:   "",
  cfMode:         "",
  cfTotalMatches: "",
};

// Legacy functional key → canonical board in the rebuilt per-module
// workspace (asana-workspace-map.ts). Keeps every existing direct writer
// (screening-report, sar-report, tm-report, ongoing/run, …) working after
// the 2026-06-10 workspace rebuild without touching their call sites.
// Keys with no single-board equivalent route to the 00 · Inbox triage board.
const LEGACY_KEY_TO_BOARD: Partial<Record<keyof AsanaGidMap, string>> = {
  master: "inbox",
  screening: "screening",
  sar: "sar-qa",
  tm: "transaction-monitor",
  escalations: "inbox",
  mlro: "mlro-advisor",
  mlroDaily: "oversight",
  kyc: "cdd-review",
  fourEyes: "approvals",
  auditLog: "audit-trail",
  complianceOps: "inbox",
  governance: "ai-governance",
  routines: "ongoing-monitor",
  ffr: "inbox",
  employees: "employees",
  training: "training",
  exportCtrl: "eocn",
  shipments: "shipments",
  supplyChain: "supply-chain",
  regulator: "inspection-room",
  incidents: "grievances-whistleblowing",
};

function get(key: keyof AsanaGidMap, legacyEnv: string): string {
  const fromArtifact = (() => {
    const boardKey = LEGACY_KEY_TO_BOARD[key];
    return boardKey ? boardProjectGid(boardKey) : undefined;
  })();
  return loadJsonMap()[key]
    ?? process.env[legacyEnv]
    ?? fromArtifact
    ?? HARDCODED[key];
}

/**
 * Per-module board GID for the rebuilt workspace: resolves any module id
 * (including routing aliases) to its dedicated board, falling back to the
 * 00 · Inbox master landing board when unmapped or before bootstrap.
 */
export function moduleProjectGid(moduleId: string): string {
  const boardKey = boardKeyForModule(moduleId);
  const gid = boardKey ? boardProjectGid(boardKey) : undefined;
  return gid ?? boardProjectGid("inbox") ?? asanaGids.master();
}

// Startup guard — log once per process if critical GIDs are unset so ops
// can spot misconfiguration in Netlify function logs without a failed task.
let _startupChecked = false;
function maybeWarnMissingGids(): void {
  if (_startupChecked) return;
  _startupChecked = true;
  const missing: string[] = [];
  // SECRET-001: do NOT log the fallback GID values themselves — they are
  // organisational identifiers that aid reconnaissance if logs leak. The
  // env-var name alone is enough signal for ops to fix the misconfiguration.
  if (!process.env["ASANA_TOKEN"])         missing.push("ASANA_TOKEN");
  if (!process.env["ASANA_WORKSPACE_GID"]) missing.push("ASANA_WORKSPACE_GID (using fallback)");
  if (!process.env["ASANA_PROJECT_GID"])   missing.push("ASANA_PROJECT_GID (using fallback)");
  if (missing.length > 0) {
    console.warn("[asanaConfig] missing env vars — using fallback:", missing.join(", "));
  }
}

// Public API — every consumer reads through these helpers, so we can
// add new GIDs / migrate vars without touching call sites.
export const asanaGids = {
  master:         () => { maybeWarnMissingGids(); return get("master",         "ASANA_PROJECT_GID"); },
  screening:      () => get("screening",      "ASANA_SCREENING_PROJECT_GID"),
  sar:            () => get("sar",            "ASANA_SAR_PROJECT_GID"),
  tm:             () => get("tm",             "ASANA_TM_PROJECT_GID"),
  escalations:    () => get("escalations",    "ASANA_ESCALATIONS_PROJECT_GID"),
  mlro:           () => get("mlro",           "ASANA_MLRO_PROJECT_GID"),
  mlroDaily:      () => get("mlroDaily",      "ASANA_MLRO_DAILY_PROJECT_GID"),
  kyc:            () => get("kyc",            "ASANA_KYC_PROJECT_GID"),
  fourEyes:       () => get("fourEyes",       "ASANA_FOUR_EYES_PROJECT_GID"),
  auditLog:       () => get("auditLog",       "ASANA_AUDIT_LOG_PROJECT_GID"),
  complianceOps:  () => get("complianceOps",  "ASANA_COMPLIANCE_OPS_PROJECT_GID"),
  governance:     () => get("governance",     "ASANA_GOVERNANCE_PROJECT_GID"),
  routines:       () => get("routines",       "ASANA_ROUTINES_PROJECT_GID"),
  ffr:            () => get("ffr",            "ASANA_FFR_PROJECT_GID"),
  employees:      () => get("employees",      "ASANA_EMPLOYEES_PROJECT_GID"),
  training:       () => get("training",       "ASANA_TRAINING_PROJECT_GID"),
  exportCtrl:     () => get("exportCtrl",     "ASANA_EXPORT_CTRL_PROJECT_GID"),
  shipments:      () => get("shipments",      "ASANA_SHIPMENTS_PROJECT_GID"),
  supplyChain:    () => get("supplyChain",    "ASANA_SUPPLYCHAIN_PROJECT_GID"),
  regulator:      () => get("regulator",      "ASANA_REGULATOR_PROJECT_GID"),
  incidents:      () => get("incidents",      "ASANA_INCIDENTS_PROJECT_GID"),
  workspace:      () => get("workspace",      "ASANA_WORKSPACE_GID"),
  assignee:       () => get("assignee",       "ASANA_ASSIGNEE_GID"),
  cfSubject:      () => get("cfSubject",      "ASANA_CF_SUBJECT_GID"),
  cfEntityType:   () => get("cfEntityType",   "ASANA_CF_ENTITY_TYPE_GID"),
  cfMode:         () => get("cfMode",         "ASANA_CF_MODE_GID"),
  cfTotalMatches: () => get("cfTotalMatches", "ASANA_CF_TOTAL_MATCHES_GID"),
};

/** Returns true when this GID is provisioned (any layer). */
export function asanaConfigured(key: keyof AsanaGidMap): boolean {
  return Boolean(asanaGids[key]());
}
