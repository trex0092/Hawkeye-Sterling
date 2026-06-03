// Hawkeye Sterling — Asana GID resolver.
//
// Backstop for the AWS Lambda 4 KB env-var ceiling: instead of 25
// individual `ASANA_*_PROJECT_GID` env vars (~1.5 KB combined), the
// operator can set ONE `ASANA_GIDS_JSON` env var with all of them
// inside, e.g.:
//
//   ASANA_GIDS_JSON={"sar":"1214148631336502","tm":"...", ...}
//
// Each lookup checks the JSON map first, then the legacy individual
// env var, then the hardcoded fallback baked into the code below.
// All three layers default-on so operators can mix-and-match while
// migrating.

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
  master:         "1214828087238181",  // 00 · Hawkeye Inbox — Master Landing
  screening:      "1214148660020527",  // 01 · Screening - Sanctions & Adverse Media
  sar:            "1214148631336502",  // 05 · STR/SAR/CTR/PMR GoAML Filings
  tm:             "1214148661083263",  // 08 · Transaction Monitoring
  escalations:    "1214148643568798",  // 06 · FFR Incidents & Asset Freezes
  mlro:           "1214148910059926",  // 15 · MLRO Workbench
  mlroDaily:      "1214148631086118",  // 02 · Central MLRO Daily Digest
  kyc:            "1214148898062562",  // 07 · CDD/SDD/EDD/KYC
  fourEyes:       "1214148660376942",  // 04 · Four-Eyes Approvals
  auditLog:       "1214148643197211",  // 03 · Audit Log 10-Year Trail
  complianceOps:  "1214148898610839",  // 09 · Compliance Ops
  governance:     "1214148855187093",  // 13 · Compliance Governance
  routines:       "1214148910147230",  // 14 · Routines - Scheduled
  ffr:            "1214148643568798",  // 06 · FFR Incidents & Asset Freezes
  employees:      "1214148854421310",  // 11 · Employees
  training:       "1214148854927671",  // 12 · Training
  exportCtrl:     "1214148895117190",  // 17 · Export Control & Dual-Use
  shipments:      "1214148898360626",  // 10 · Shipments - Tracking
  supplyChain:    "1214148855758874",  // 16 · Supply Chain, ESG & LBMA Gold
  regulator:      "1214148894992036",  // 18 · Regulator Portal Handoff
  incidents:      "1214148895117145",  // 19 · Incidents & Grievances
  workspace:      "1213645083721316",  // ASANA_WORKSPACE_GID
  assignee:       "1213645083721304",  // default MLRO assignee
  cfSubject:      "",
  cfEntityType:   "",
  cfMode:         "",
  cfTotalMatches: "",
};

function get(key: keyof AsanaGidMap, legacyEnv: string): string {
  return loadJsonMap()[key]
    ?? process.env[legacyEnv]
    ?? HARDCODED[key];
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
