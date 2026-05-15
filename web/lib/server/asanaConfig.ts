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
  master:         "1214148630166524",
  screening:      "1214148630166524",
  sar:            "1214148631336502",
  tm:             "1214148661083263",
  escalations:    "1214148643568798",
  mlro:           "1214148643197211",
  mlroDaily:      "1214148643197211",
  kyc:            "1214148630166524",
  fourEyes:       "1214148660376942",
  auditLog:       "1214148643197211",
  complianceOps:  "1214148898610839",
  governance:     "1214148855187093",
  routines:       "1214148910147230",
  ffr:            "1214148630166524",
  employees:      "1214148854421310",
  training:       "1214148854927671",
  exportCtrl:     "1214148895117190",
  shipments:      "1214148630166524",
  supplyChain:    "1214148630166524",
  regulator:      "1214148630166524",
  incidents:      "1214148630166524",
  workspace:      "1213645083721316",
  assignee:       "1213645083721304",
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

// Public API — every consumer reads through these helpers, so we can
// add new GIDs / migrate vars without touching call sites.
export const asanaGids = {
  master:         () => get("master",         "ASANA_PROJECT_GID"),
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
