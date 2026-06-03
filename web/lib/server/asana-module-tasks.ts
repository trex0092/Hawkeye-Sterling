// Hawkeye Sterling — Asana "Modules" status board.
//
// One Asana task per operational module, living in the project
// "Hawkeye Sterling — Modules" (team HAWKEYE STERLING V2). A daily
// scheduled function posts a compliance attestation comment to each
// task. The task GIDs below were created from the Module Compliance
// Register (docs/MODULE-COMPLIANCE-REGISTER.md).
//
// Override the project GID via ASANA_MODULES_PROJECT_GID if the board
// is re-created in another workspace.

export const ASANA_MODULES_PROJECT_GID =
  process.env["ASANA_MODULES_PROJECT_GID"] ?? "1215399932870281";

export interface AsanaModuleTask {
  /** App module key (matches asanaConfig / module-report routing). */
  key: string;
  /** Display label as it appears on the Asana task. */
  label: string;
  /** Asana task GID. */
  taskGid: string;
}

export const ASANA_MODULE_TASKS: AsanaModuleTask[] = [
  // Onboarding & CDD
  { key: "client-portal", label: "Client Portal", taskGid: "1215389795331655" },
  { key: "ubo-declaration", label: "UBO Declaration", taskGid: "1215395029376154" },
  { key: "pep-profile", label: "PEP Profiles", taskGid: "1215399933160720" },
  { key: "cdd-review", label: "CDD Review", taskGid: "1215389795005123" },
  { key: "data-quality", label: "Data Quality", taskGid: "1215399932805477" },
  { key: "ownership", label: "Ownership Explorer", taskGid: "1215395029619715" },
  { key: "employees", label: "Employees", taskGid: "1215395028651392" },
  { key: "approvals", label: "Approvals", taskGid: "1215395029091103" },
  { key: "vendor-dd", label: "Supplier / Vendor DD", taskGid: "1215391560293131" },
  { key: "onboarding", label: "Onboarding Wizard", taskGid: "1215391559365147" },
  // Risk & AML Ops
  { key: "ewra", label: "EWRA / BWRA", taskGid: "1215389795092985" },
  { key: "sar-qa", label: "STR/SAR QA", taskGid: "1215389795331754" },
  { key: "sar-narrative", label: "SAR Narrative", taskGid: "1215389794887438" },
  { key: "supply-chain", label: "Supply Chain / Responsible Sourcing", taskGid: "1215399932942190" },
  { key: "rmi", label: "RMI / RMAP", taskGid: "1215386943096738" },
  { key: "oecd-ddg", label: "OECD DDG", taskGid: "1215386942786273" },
  { key: "reg-change", label: "Reg Changes", taskGid: "1215386942169607" },
  { key: "shipments", label: "Shipments", taskGid: "1215399932805511" },
  { key: "eocn", label: "EOCN", taskGid: "1215391559997416" },
  { key: "tfs-alerts", label: "TFS Alerts", taskGid: "1215389795150803" },
  { key: "cnmr", label: "CNMR / PNMR", taskGid: "1215386942276174" },
  { key: "dpmsr", label: "DPMSR", taskGid: "1215395029662814" },
  { key: "moe-survey", label: "MoE Survey", taskGid: "1215391560382846" },
  { key: "enforcement", label: "Enforcement", taskGid: "1215389794793877" },
  { key: "oversight", label: "Oversight", taskGid: "1215386942712638" },
  { key: "maker-checker", label: "Maker-Checker", taskGid: "1215386943021777" },
  { key: "goaml", label: "goAML Export / Submission", taskGid: "1215389795431515" },
  { key: "batch-screening", label: "Batch Screening", taskGid: "1215391559453600" },
  // Governance & Audit
  { key: "responsible-ai", label: "Responsible AI", taskGid: "1215399933258068" },
  { key: "inspection-room", label: "Inspection Room", taskGid: "1215389795158260" },
  { key: "regulatory", label: "Regulatory Library", taskGid: "1215386942915596" },
  { key: "policies", label: "Policies & SOPs", taskGid: "1215395029252890" },
  { key: "typology-library", label: "Typology Library", taskGid: "1215386942278645" },
  { key: "playbook", label: "Playbook", taskGid: "1215399931643642" },
  { key: "corrections", label: "Corrections", taskGid: "1215386942129039" },
  { key: "ai-incident-playbook", label: "AI Incident Playbook", taskGid: "1215399933199811" },
  { key: "incident-runbook", label: "Incident Runbook", taskGid: "1215389795435804" },
  { key: "eval-kpi", label: "Eval KPI", taskGid: "1215395029330423" },
  { key: "audit-trail", label: "Audit Trail", taskGid: "1215389795047605" },
  // Intelligence & KYC Tools
  { key: "intel", label: "Live Intelligence Feed", taskGid: "1215399933267769" },
  { key: "intelligence-hub", label: "Intelligence Hub", taskGid: "1215399932831938" },
  { key: "osint", label: "OSINT", taskGid: "1215399932870318" },
  { key: "gleif", label: "GLEIF / LEI", taskGid: "1215391560293145" },
  { key: "entity-graph", label: "Entity Graph", taskGid: "1215395029681062" },
  { key: "domain-intel", label: "Domain Intel", taskGid: "1215395029681133" },
  { key: "crypto-risk", label: "Crypto Risk / Exposure", taskGid: "1215386942784660" },
  { key: "vessel-check", label: "Vessel Check", taskGid: "1215386942588445" },
  { key: "benford", label: "Benford Analysis", taskGid: "1215391560085886" },
  { key: "investigation", label: "Investigation", taskGid: "1215391559142826" },
  { key: "country-risk", label: "Country & Geopolitical Risk", taskGid: "1215391559319047" },
  { key: "sanctions-evasion", label: "Sanctions Evasion", taskGid: "1215389795331770" },
  { key: "intelligence-tools", label: "Intelligence Tools", taskGid: "1215399933189531" },
  { key: "adverse-media-live", label: "Adverse-Media (Live/Lookback)", taskGid: "1215389795006518" },
  { key: "analyst-behavior", label: "Analyst Behavior", taskGid: "1215395028703800" },
  { key: "brain-map", label: "Brain Map", taskGid: "1215391559696335" },
  { key: "intel-status", label: "Intel Status", taskGid: "1215389794362258" },
  // Screening, Monitoring & Core
  { key: "screening", label: "Screening", taskGid: "1215399932324435" },
  { key: "transaction-monitor", label: "Transaction Monitor", taskGid: "1215389794939200" },
  { key: "ongoing-monitor", label: "Ongoing Monitor", taskGid: "1215395029307642" },
  { key: "str-cases", label: "STR Cases", taskGid: "1215399932805525" },
  { key: "mlro-advisor", label: "MLRO Advisor", taskGid: "1215391560330326" },
  { key: "access-control", label: "Access Control", taskGid: "1215399932334600" },
  { key: "analytics-dashboard", label: "Analytics Dashboard", taskGid: "1215386942464213" },
  { key: "kri-dashboard", label: "KRI Dashboard", taskGid: "1215389793489223" },
  { key: "training", label: "Training", taskGid: "1215389794320590" },
];
