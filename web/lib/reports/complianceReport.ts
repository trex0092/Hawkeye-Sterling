// Hawkeye Sterling — MLRO-grade compliance report formatter.
//
// Produces the canonical Hawkeye Sterling report shape (plain text, fixed-
// width columns) for a screened subject. Mirrors the template Luisa
// specified: header block · subject · screening result matrix ·
// classification · adverse-media overlay · recommendation · goAML package
// · MLRO decision · regulatory framework.

export type ReportType = "PEP" | "SANCTIONS" | "AM" | "STANDARD" | "SOE";

export interface ReportSubject {
  id: string;
  name: string;
  entityType: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  nationality?: string;
  jurisdiction?: string;
  dob?: string;
  office?: string;
  aliases?: string[];
  caseId?: string;
  group?: string;
  idNumber?: string;
}

export interface ReportScreeningResult {
  topScore: number;
  severity: "clear" | "low" | "medium" | "high" | "critical";
  hits: Array<{
    listId: string;
    listRef: string;
    candidateName: string;
    score: number;
    programs?: string[];
    method: string;
  }>;
}

export interface ReportSuperBrain {
  pep?: {
    tier: string;
    type: string;
    salience: number;
    rationale?: string;
  } | null;
  jurisdiction?: {
    iso2: string;
    name: string;
    region: string;
    cahra: boolean;
    regimes: string[];
  } | null;
  adverseMedia?: Array<{ categoryId: string; keyword: string }>;
  adverseKeywordGroups?: Array<{ group: string; label: string; count: number }>;
  esg?: Array<{ categoryId: string; domain: string; label: string }>;
  redlines?: { fired: Array<{ label?: string; id?: string }>; action: string | null };
  composite?: { score: number };
}

export interface ReportInput {
  subject: ReportSubject;
  result: ReportScreeningResult;
  superBrain?: ReportSuperBrain | null;
  reportingEntity?: string;
  mlro?: string;
  now?: Date;
}

const REG_FRAMEWORK = [
  "Federal Decree-Law No. (10) of 2025 — UAE AML/CFT/CPF primary law",
  "Cabinet Resolution No. (134) of 2025 — Executive Regulations",
  "MoE Circular No. (3) of 2025 — TFS / sanctions screening",
  "MoE Circular No. (2) of 2024 — Responsible sourcing (DPMS)",
  "MoE Circular No. (6) of 2025 — Risk-based CDD / SDD",
  "FATF Recommendations 10, 12, 20, 22",
  "LBMA Responsible Gold Guidance v9",
  "OECD Due Diligence Guidance — Gold Supplement",
];

const SEP = "═".repeat(79);
const SUB = "─".repeat(75);

function pad(s: string, n: number): string {
  return (s + " ".repeat(n)).slice(0, n);
}

function inferReportType(r: ReportScreeningResult, sb?: ReportSuperBrain | null): ReportType {
  if (r.severity === "critical" && r.hits.length > 0) return "SANCTIONS";
  if (sb?.pep && sb.pep.salience > 0) return "PEP";
  if (sb?.adverseKeywordGroups && sb.adverseKeywordGroups.length > 0) return "AM";
  if (sb?.adverseMedia && sb.adverseMedia.length > 0) return "AM";
  return "STANDARD";
}

function buildId(type: ReportType, d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `HWK-SCR-${y}${m}${day}-${type}-${h}${mm}`;
}

function formatHeader(
  type: ReportType,
  input: ReportInput,
  now: Date,
): string[] {
  const lines: string[] = [];
  lines.push("HAWKEYE STERLING");
  lines.push(`Report ID           : ${buildId(type, now)}`);
  lines.push(`Reporting entity    : ${input.reportingEntity ?? "Fine Gold LLC"}`);
  lines.push(
    `Date and Time       : ${now.toUTCString().replace(" GMT", " UTC")}`,
  );
  lines.push("Place               : Dubai, United Arab Emirates");
  lines.push("FIU registration    : [goAML reporting entity ID]");
  lines.push(`MLRO assigned       : ${input.mlro ?? "Luisa Fernanda"}`);
  lines.push("Report classification : Confidential");
  return lines;
}

function formatSubject(s: ReportSubject): string[] {
  const lines: string[] = [];
  lines.push(`Subject type       : ${s.entityType.toUpperCase()}`);
  if (s.entityType === "individual") {
    lines.push(`Full legal name    : ${s.name}`);
    if (s.dob) lines.push(`Date of birth      : ${s.dob}`);
    if (s.nationality ?? s.jurisdiction)
      lines.push(`Nationality        : ${s.nationality ?? s.jurisdiction}`);
    if (s.office) lines.push(`Current office     : ${s.office}`);
  } else {
    lines.push(`Registered name    : ${s.name}`);
    if (s.jurisdiction) lines.push(`Jurisdiction       : ${s.jurisdiction}`);
  }
  if (s.aliases?.length) lines.push(`Alias(es)          : ${s.aliases.join("; ")}`);
  if (s.caseId) lines.push(`Case ID            : ${s.caseId}`);
  if (s.group) lines.push(`Group              : ${s.group}`);
  if (s.idNumber) lines.push(`ID / Register      : ${s.idNumber}`);
  return lines;
}

const SCREEN_VECTORS: Array<{ vector: string; engine: string; listIdMatch: RegExp }> = [
  { vector: "Sanctions (UN)     ", engine: "Hawkeye native    ", listIdMatch: /^UN/i },
  { vector: "Sanctions (UAE LTL)", engine: "Hawkeye native    ", listIdMatch: /^AE|EOCN/i },
  { vector: "Sanctions (OFAC)   ", engine: "Hawkeye + WC      ", listIdMatch: /OFAC/i },
  { vector: "Sanctions (EU)     ", engine: "Hawkeye native    ", listIdMatch: /EU/i },
  { vector: "Sanctions (UK OFSI)", engine: "Hawkeye native    ", listIdMatch: /UK|OFSI|HMT/i },
  { vector: "Sanctions (Canada) ", engine: "Hawkeye native    ", listIdMatch: /CA|OSFI|SEMA/i },
  { vector: "Sanctions (AUS)    ", engine: "Hawkeye native    ", listIdMatch: /AU|DFAT/i },
];

function formatMatrix(r: ReportScreeningResult, sb?: ReportSuperBrain | null): string[] {
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} SCREENING RESULT MATRIX ${"─".repeat(51)}`);
  lines.push(`Vector              Engine              Score    Result`);
  lines.push(`${"─".repeat(19)}   ${"─".repeat(17)}   ─────    ${"─".repeat(22)}`);
  for (const v of SCREEN_VECTORS) {
    const hits = r.hits.filter((h) => v.listIdMatch.test(h.listId));
    const score = hits.length > 0 ? String(Math.round(hits[0]!.score * 100)) : "—";
    const result = hits.length > 0 ? "POSITIVE — CONFIRMED" : "NEGATIVE";
    lines.push(`${v.vector}   ${v.engine}  ${pad(score, 5)}    ${result}`);
  }
  // PEP
  const pepScore = sb?.pep && sb.pep.salience > 0
    ? Math.round(sb.pep.salience * 100)
    : null;
  lines.push(
    `PEP                 World-Check       ${pad(
      pepScore != null ? String(pepScore) : "—",
      5,
    )}    ${pepScore != null ? "POSITIVE — CONFIRMED" : "NEGATIVE"}`,
  );
  // Adverse media
  const amCount =
    (sb?.adverseKeywordGroups?.length ?? 0) + (sb?.adverseMedia?.length ?? 0);
  const amLabel = amCount >= 4 ? "HIGH " : amCount >= 1 ? "LOW  " : "—    ";
  const amResult =
    amCount >= 4 ? "POSITIVE — extensive" : amCount >= 1 ? "Limited" : "NEGATIVE";
  lines.push(`Adverse media       Multi-source      ${amLabel}   ${amResult}`);
  return lines;
}

function formatPepBlock(sb: ReportSuperBrain): string[] {
  const pep = sb.pep;
  if (!pep) return [];
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} PEP CLASSIFICATION ${"─".repeat(56)}`);
  lines.push(`Flag              : PEP (primary)`);
  lines.push(`PEP class         : ${pep.type.replace(/_/g, " ").toUpperCase()}`);
  lines.push(`PEP tier          : ${pep.tier}`);
  lines.push(`Salience          : ${Math.round(pep.salience * 100)}%`);
  if (pep.rationale) lines.push(`Rationale         : ${pep.rationale}`);
  return lines;
}

function formatAdverseMedia(sb: ReportSuperBrain): string[] {
  const kw = sb.adverseKeywordGroups ?? [];
  const am = sb.adverseMedia ?? [];
  if (kw.length === 0 && am.length === 0) return [];
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} ADVERSE MEDIA OVERLAY ${"─".repeat(53)}`);
  if (kw.length > 0) {
    lines.push("Keyword groups fired:");
    for (const g of kw) lines.push(`  • ${g.label} (${g.count})`);
  }
  if (am.length > 0) {
    lines.push("Classifier categories:");
    for (const a of am) lines.push(`  • ${a.categoryId}  —  keyword "${a.keyword}"`);
  }
  return lines;
}

function formatJurisdiction(sb: ReportSuperBrain): string[] {
  const j = sb.jurisdiction;
  if (!j) return [];
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} JURISDICTION RISK ${"─".repeat(57)}`);
  lines.push(`Jurisdiction      : ${j.name} (${j.iso2}) · ${j.region}`);
  lines.push(`CAHRA             : ${j.cahra ? "YES" : "no"}`);
  if (j.regimes.length) lines.push(`Active regimes    : ${j.regimes.join(", ")}`);
  return lines;
}

function formatRecommendation(type: ReportType, r: ReportScreeningResult): string[] {
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} RECOMMENDATION (SYSTEM) ${"─".repeat(51)}`);
  if (type === "SANCTIONS" && r.severity === "critical") {
    lines.push("▶ FREEZE IMMEDIATELY — ALL IN-FLIGHT FUNDS AND PENDING TRANSACTIONS");
    lines.push("▶ FILE FFR VIA goAML WITHIN 5 BUSINESS DAYS");
    lines.push("▶ NOTIFY UAE EXECUTIVE OFFICE FOR CONTROL & NON-PROLIFERATION (EOCN)");
    lines.push("▶ NOTIFY MoE");
    lines.push("▶ FILE PARALLEL SAR FOR SANCTIONS EVASION IF INTERMEDIARY INVOLVED");
    lines.push("▶ ESCALATE TO CEO + BOARD CHAIR — personal criminal liability attaches");
    lines.push("▶ ENGAGE LEGAL COUNSEL — multi-jurisdictional exposure");
    lines.push("▶ REFUSE RELATIONSHIP — no onboarding, no further processing");
    lines.push("▶ TIPPING-OFF PROHIBITION ABSOLUTE");
  } else if (type === "PEP") {
    lines.push("▶ ENHANCED DUE DILIGENCE (EDD)");
    lines.push("▶ ESCALATE TO CEO AND BOARD CHAIR FOR APPROVAL DECISION");
    lines.push("▶ NO goAML FILING ON PEP STATUS ALONE");
    lines.push("▶ CONDITIONAL STR IF EDD REVEALS SoF / SoW INCONSISTENCY");
    lines.push("▶ CONDITIONAL DPMSR IF CASH COMPONENT ≥ AED 55,000 IN ANY TRANSACTION");
    lines.push("▶ RECOMMEND CONSIDER DECLINING ON REPUTATIONAL-RISK / RISK-APPETITE GROUNDS");
  } else if (type === "AM") {
    lines.push("▶ IMMEDIATE ESCALATION TO MLRO");
    lines.push("▶ 24-MONTH RETROSPECTIVE TRANSACTION REVIEW");
    lines.push("▶ CONSIDER SOURCING SUSPENSION PENDING INVESTIGATION");
    lines.push("▶ LBMA STEP 4 AUDIT FILE UPDATE (IF DPMS SUPPLIER)");
    lines.push("▶ ANNUAL RESPONSIBLE SOURCING REPORT DISCLOSURE");
    lines.push("▶ MoE NOTIFICATION (Circular 2/2024 compliance evidence)");
    lines.push("▶ SAR IF CONSTRUCTIVE KNOWLEDGE THRESHOLD CROSSED");
    lines.push("▶ TIPPING-OFF PROHIBITION ABSOLUTE");
  } else {
    lines.push("▶ PROCEED WITH STANDARD CDD");
    lines.push("▶ SDD ELIGIBLE (MoE Circular 6/2025) — MLRO DISCRETION APPLIES");
    lines.push("▶ NO goAML FILING REQUIRED");
    lines.push("▶ DPMSR NOT TRIGGERED (wire-funded; no cash component at threshold)");
    lines.push("▶ PERIODIC REVIEW PER RISK TABLE (LOW → 3 yrs · MEDIUM → 2 yrs)");
    lines.push("▶ STANDARD ONGOING MONITORING");
  }
  return lines;
}

function formatGoaml(type: ReportType, input: ReportInput, now: Date): string[] {
  if (type !== "SANCTIONS" && type !== "AM") return [];
  const lines: string[] = [];
  const isSan = type === "SANCTIONS";
  lines.push(
    `${SUB.slice(0, 3)} goAML FILING DATA PACKAGE ${"─".repeat(50)}`,
  );
  lines.push(`report_code           : ${isSan ? "FFR" : "SAR"}`);
  lines.push(
    `entity_reference      : ${buildId(type, now)}${isSan ? "-FFR" : "-SAR"}`,
  );
  lines.push(
    `reason                : [Auto-drafted from brain verdict — MLRO to review]`,
  );
  lines.push(
    `action                : ${isSan ? "Freeze executed; relationship refused" : "Sourcing suspended; retrospective review opened"}`,
  );
  if (input.subject.entityType === "individual") {
    lines.push(`t_person.name         : ${input.subject.name}`);
    if (input.subject.dob) lines.push(`t_person.dob          : ${input.subject.dob}`);
    if (input.subject.nationality)
      lines.push(`t_person.nationality  : ${input.subject.nationality}`);
  } else {
    lines.push(`t_entity.name         : ${input.subject.name}`);
    if (input.subject.jurisdiction)
      lines.push(`t_entity.incorp_ctry  : ${input.subject.jurisdiction}`);
  }
  return lines;
}

function formatDecision(type: ReportType): string[] {
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} MLRO DECISION (TO BE COMPLETED) ${"─".repeat(44)}`);
  if (type === "SANCTIONS") {
    lines.push("[ ] Accept system recommendation — freeze + FFR + parallel SAR + notify");
    lines.push("[ ] Modify narrative — record reason (system will flag variation)");
    lines.push("");
    lines.push("MLRO signature: _____________________     Date: _____________");
    lines.push("CEO signature : _____________________     Date: _____________");
  } else if (type === "PEP") {
    lines.push("[ ] Accept recommendation — proceed to EDD + Board review");
    lines.push("[ ] Decline relationship — document rationale");
    lines.push("[ ] Escalate for policy-level decision — Board-standing item");
    lines.push("");
    lines.push("MLRO signature: _____________________     Date: _____________");
  } else if (type === "AM") {
    lines.push("[ ] Accept system recommendation — submit SAR + suspend sourcing");
    lines.push("[ ] Submit SAR with modifications — record rationale");
    lines.push("[ ] Escalate to Board before SAR submission");
    lines.push("");
    lines.push("MLRO signature: _____________________     Date: _____________");
  } else {
    lines.push("[ ] Apply Standard CDD — proceed");
    lines.push("[ ] Apply SDD — proceed");
    lines.push("[ ] Override to EDD — record reason");
    lines.push("");
    lines.push("MLRO signature: _____________________     Date: _____________");
  }
  return lines;
}

function formatFramework(): string[] {
  const lines: string[] = [];
  lines.push("Regulatory framework applied:");
  lines.push("");
  for (const f of REG_FRAMEWORK) lines.push(`  - ${f}`);
  return lines;
}

export function buildComplianceReport(input: ReportInput): string {
  const now = input.now ?? new Date();
  const type = inferReportType(input.result, input.superBrain);
  const out: string[] = [];

  out.push(SEP);
  out.push(...formatHeader(type, input, now));

  if (type === "SANCTIONS") {
    out.push("╔" + "═".repeat(77) + "╗");
    out.push(
      "║   ⚠  CRITICAL ALERT — CONFIRMED PRIMARY SANCTIONS DESIGNATION  ⚠          ║",
    );
    out.push(
      "║   IMMEDIATE FREEZE · TIPPING-OFF ABSOLUTE · FFR + SAR REQUIRED            ║",
    );
    out.push("╚" + "═".repeat(77) + "╝");
  }

  out.push(...formatSubject(input.subject));
  out.push(...formatMatrix(input.result, input.superBrain));
  if (input.superBrain) {
    out.push(...formatPepBlock(input.superBrain));
    out.push(...formatJurisdiction(input.superBrain));
    out.push(...formatAdverseMedia(input.superBrain));
  }
  out.push(...formatRecommendation(type, input.result));
  out.push(...formatGoaml(type, input, now));
  out.push(...formatDecision(type));
  out.push(...formatFramework());
  out.push(SEP);
  out.push("END OF REPORT");
  out.push(SEP);
  return out.filter((l) => l != null).join("\n");
}
