// Hawkeye Sterling — comprehensive PDF-ready HTML compliance report generator.
//
// POST /api/generate-report
//
// Produces a professional, multi-section HTML compliance report that can be
// printed to PDF directly from the browser (Ctrl+P / ⌘+P). The report
// design is consistent with the hs-reportHtml design system used across all
// other Hawkeye Sterling reports (A4 portrait, MLRO audit-grade typography).
//
// Sections included depend on the request body flags:
//   • Header + cover page (always)
//   • Executive summary with risk score (always)
//   • Subject information table (always)
//   • Sanctions screening results (includeScreeningResult)
//   • PEP assessment with tier and rationale (includePepAssessment)
//   • Adverse media findings + severity breakdown (includeAdverseMedia)
//   • UBO / beneficial-ownership chain diagram (includeUboChain)
//   • Audit trail timeline — last N entries (includeAuditTrail)
//   • Regulatory findings + required actions (always)
//   • Conclusion and recommendation (always)
//   • MLRO certification / signature block (always)
//
// Returns:
//   • text/html when ?format=html (default) — browser opens and auto-prints
//   • application/json when ?format=json — { ok, html, reportId }

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import {
  buildHtmlDoc,
  hsCover,
  hsPage,
  hsFinis,
  hsSection,
  hsTable,
  hsKvGrid,
  hsNarrative,
  hsSeverityCell,
  hsPill as _hsPill,
  hsFindings,
  hsNumList,
  hsSignatureBlock,
  hsScorebox as _hsScorebox,
  hsBar,
  escHtml,
  nowMeta,
  type CoverData,
} from "@/lib/reportHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType = "screening" | "due_diligence" | "sar_package" | "audit_certificate";

interface ScreeningHit {
  list?: string;
  listLabel?: string;
  matchedName?: string;
  score?: number;
  confidence?: number;
  category?: string;
  sanctionType?: string;
  jurisdiction?: string;
  dateAdded?: string;
}

interface PepAssessmentInput {
  isPep?: boolean;
  tier?: number | string;
  role?: string;
  jurisdiction?: string;
  rationale?: string;
  salience?: number;
  relatedParties?: string[];
}

interface AdverseMediaInput {
  articleCount?: number;
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
  compositeScore?: number;
  topHeadlines?: string[];
  categories?: string[];
}

interface UboEntry {
  name: string;
  ownershipPct?: number;
  entityType?: string;
  jurisdiction?: string;
  notes?: string;
}

interface AuditEntry {
  seq: number;
  at: string;
  actor?: string;
  event?: string;
  payload?: unknown;
}

interface RegulatoryFinding {
  regulation: string;
  article?: string;
  requirement: string;
  deadline?: string;
  status?: string;
}

interface GenerateReportBody {
  subjectId: string;
  subjectName: string;
  reportType: ReportType;
  // Subject metadata
  subjectType?: string;           // "individual" | "corporate" | "vessel" etc.
  nationality?: string;
  dobOrIncorporation?: string;
  referenceIds?: Record<string, string>;  // e.g. { CBUAE: "...", LEI: "..." }
  // Sections
  includeScreeningResult?: boolean;
  screeningResult?: {
    topScore?: number;
    severity?: string;
    hits?: ScreeningHit[];
    screenerVersion?: string;
    screenedAt?: string;
  };
  includePepAssessment?: boolean;
  pepAssessment?: PepAssessmentInput;
  includeAdverseMedia?: boolean;
  adverseMedia?: AdverseMediaInput;
  includeUboChain?: boolean;
  uboChain?: UboEntry[];
  includeAuditTrail?: boolean;
  auditTrail?: AuditEntry[];
  auditTrailLimit?: number;
  // Risk override — if caller already computed composite risk
  riskScore?: number;             // 0..100
  riskLevel?: string;             // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  // Regulatory context
  regulatoryFindings?: RegulatoryFinding[];
  applicableRegulations?: string[];
  // Recommendation
  recommendation?: "APPROVE" | "EDD" | "ESCALATE" | "FREEZE" | "SAR_FILE" | "CLOSE";
  recommendationRationale?: string;
  // Report metadata
  reportingOfficer?: string;
  reportingOfficerLicense?: string;
  preparedFor?: string;
  institutionName?: string;
  jurisdiction?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeFilename(s: string | undefined | null): string {
  if (!s) return "unknown";
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64) || "unknown";
}

function genReportId(): string {
  return "HS-RPT-" + randomBytes(5).toString("hex").toUpperCase();
}

function scoreToTone(score: number): "ember" | "amber" | "sage" {
  if (score >= 75) return "ember";
  if (score >= 40) return "amber";
  return "sage";
}

function riskLevelFromScore(score: number): string {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

function verdictBand(level: string): "ember" | "amber" | "sage" {
  const l = level.toUpperCase();
  if (l === "CRITICAL" || l === "HIGH") return "ember";
  if (l === "MEDIUM") return "amber";
  return "sage";
}

function recommendationLabel(rec: string): string {
  const map: Record<string, string> = {
    APPROVE: "APPROVE",
    EDD: "ENHANCED DUE DILIGENCE",
    ESCALATE: "ESCALATE TO MLRO",
    FREEZE: "FREEZE ACCOUNT / ASSETS",
    SAR_FILE: "FILE SAR / STR",
    CLOSE: "CLOSE CASE",
  };
  return map[rec] ?? rec;
}

function recommendationTone(rec: string): "ember" | "amber" | "sage" | "ink" {
  if (rec === "FREEZE" || rec === "SAR_FILE" || rec === "ESCALATE") return "ember";
  if (rec === "EDD") return "amber";
  if (rec === "APPROVE" || rec === "CLOSE") return "sage";
  return "ink";
}

function reportTypeLabel(t: ReportType): string {
  const map: Record<ReportType, string> = {
    screening: "Screening Report",
    due_diligence: "Due Diligence Report",
    sar_package: "SAR Package",
    audit_certificate: "Audit Certificate",
  };
  return map[t] ?? "Compliance Report";
}

function reportTypeModule(t: ReportType): string {
  const map: Record<ReportType, string> = {
    screening: "SANCTIONS & PEP SCREENING",
    due_diligence: "ENHANCED DUE DILIGENCE",
    sar_package: "SAR / STR PACKAGE",
    audit_certificate: "AUDIT CERTIFICATE",
  };
  return map[t] ?? "COMPLIANCE";
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Dubai",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Dubai",
    }) + " GST";
  } catch {
    return iso;
  }
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildExecutiveSummary(body: GenerateReportBody, riskScore: number, riskLevel: string): string {
  const tone = scoreToTone(riskScore);
  const rec = body.recommendation ?? (riskScore >= 75 ? "ESCALATE" : riskScore >= 50 ? "EDD" : "APPROVE");
  const recLabel = recommendationLabel(rec);
  const recTone = recommendationTone(rec);

  // Determine key findings
  const findings: string[] = [];
  if (body.includeScreeningResult && body.screeningResult) {
    const hits = body.screeningResult.hits ?? [];
    const hitCount = hits.length;
    if (hitCount > 0) {
      findings.push(`${hitCount} sanctions list match${hitCount > 1 ? "es" : ""} identified with top confidence score ${body.screeningResult.topScore ?? "N/A"}/100 — immediate MLRO review required.`);
    } else {
      findings.push("No direct sanctions list matches identified across screened jurisdictions.");
    }
  }
  if (body.includePepAssessment && body.pepAssessment) {
    const p = body.pepAssessment;
    if (p.isPep) {
      findings.push(`Subject identified as a Politically Exposed Person (PEP) — Tier ${p.tier ?? "N/A"}, ${p.jurisdiction ?? "jurisdiction not specified"}. Enhanced due diligence obligations apply.`);
    } else {
      findings.push("Subject is not identified as a Politically Exposed Person (PEP).");
    }
  }
  if (body.includeAdverseMedia && body.adverseMedia) {
    const am = body.adverseMedia;
    const total = am.articleCount ?? 0;
    const critical = am.criticalCount ?? 0;
    if (total > 0) {
      findings.push(`${total} adverse media article${total > 1 ? "s" : ""} identified${critical > 0 ? `, including ${critical} critical-severity finding${critical > 1 ? "s" : ""}` : ""}. Reputational risk elevated.`);
    } else {
      findings.push("No significant adverse media coverage identified.");
    }
  }
  if (body.includeUboChain && body.uboChain && body.uboChain.length > 0) {
    findings.push(`Beneficial ownership chain traced to ${body.uboChain.length} entity tier${body.uboChain.length > 1 ? "s" : ""}. Full UBO disclosure required for EDD compliance.`);
  }
  if (body.regulatoryFindings && body.regulatoryFindings.length > 0) {
    const pending = body.regulatoryFindings.filter(f => f.status !== "COMPLIANT");
    if (pending.length > 0) {
      findings.push(`${pending.length} regulatory obligation${pending.length > 1 ? "s" : ""} require${pending.length === 1 ? "s" : ""} action under applicable AML/CFT frameworks.`);
    }
  }
  if (findings.length < 3) {
    findings.push(`Overall composite risk score: ${riskScore}/100 — ${riskLevel} risk band.`);
  }

  const kpis = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0 16px">
    ${[
      { n: String(riskScore), label: "Risk Score", tone },
      { n: riskLevel, label: "Risk Band", tone },
      { n: recLabel, label: "Recommendation", tone: recTone },
      { n: body.reportType?.toUpperCase().replace("_", " ") ?? "—", label: "Report Type", tone: "ink" as const },
    ].map(k => `<div class="hs-scorebox">
      <div class="hs-scorebox-n${k.tone && k.tone !== "ink" ? ` is-${k.tone}` : ""}" style="font-size:16px;word-break:break-word">${escHtml(String(k.n))}</div>
      <div class="hs-scorebox-l">${escHtml(k.label)}</div>
    </div>`).join("")}
  </div>`;

  const findingsHtml = hsFindings(findings);

  return hsSection({
    num: "01",
    kicker: "Executive Summary",
    title: "Key Findings & Risk Assessment",
    content: kpis + findingsHtml + (body.recommendationRationale
      ? hsNarrative(body.recommendationRationale)
      : ""),
  });
}

function buildSubjectInfo(body: GenerateReportBody, reportId: string, dateStr: string): string {
  const rows: Array<{ k: string; v: string }> = [
    { k: "Full Name / Entity", v: escHtml(body.subjectName) },
    { k: "Subject ID", v: `<span class="hs-mono-s">${escHtml(body.subjectId)}</span>` },
    { k: "Type", v: escHtml(body.subjectType ?? "—") },
    { k: "Nationality / Jurisdiction", v: escHtml(body.nationality ?? "—") },
    { k: "Date of Birth / Incorporation", v: escHtml(body.dobOrIncorporation ?? "—") },
    { k: "Report Reference", v: `<span class="hs-mono-s">${escHtml(reportId)}</span>` },
    { k: "Report Generated", v: escHtml(dateStr) },
    { k: "Reporting Officer", v: escHtml(body.reportingOfficer ?? "—") },
    { k: "Prepared For", v: escHtml(body.preparedFor ?? "—") },
    { k: "Institution", v: escHtml(body.institutionName ?? "Hawkeye Sterling AML Platform") },
  ];

  // Add reference IDs if provided
  if (body.referenceIds && typeof body.referenceIds === "object") {
    for (const [key, val] of Object.entries(body.referenceIds)) {
      rows.push({ k: escHtml(key), v: `<span class="hs-mono-s">${escHtml(String(val))}</span>` });
    }
  }

  return hsSection({
    num: "02",
    kicker: "Subject Profile",
    title: "Subject Information",
    content: hsKvGrid(rows),
  });
}

function buildScreeningSection(body: GenerateReportBody): string {
  const sr = body.screeningResult ?? {};
  const hits = sr.hits ?? [];
  const topScore = sr.topScore ?? 0;
  const severity = sr.severity ?? (hits.length > 0 ? "hit" : "clear");
  const tone = scoreToTone(topScore);

  const summaryKv = [
    { k: "Overall Status", v: hsSeverityCell(hits.length > 0 ? "HIT" : "CLEAR") },
    { k: "Top Match Score", v: `${escHtml(String(topScore))}/100 &nbsp; ${hsBar(topScore, tone === "ember" ? "pink" : tone === "amber" ? "amber" : "sage")}` },
    { k: "Total Matches", v: escHtml(String(hits.length)) },
    { k: "Severity", v: hsSeverityCell(severity.toUpperCase()) },
    { k: "Screener Version", v: `<span class="hs-mono-s">${escHtml(sr.screenerVersion ?? "Hawkeye v5")}</span>` },
    { k: "Screened At", v: escHtml(formatDateTime(sr.screenedAt)) },
  ];

  let hitsTable = "";
  if (hits.length > 0) {
    hitsTable = `<div style="margin-top:14px">` + hsTable(
      ["List", "Matched Name", "Confidence", "Category", "Jurisdiction", "Date Added"],
      hits.slice(0, 20).map((h) => [
        h.listLabel ?? h.list ?? "—",
        h.matchedName ?? "—",
        h.confidence !== undefined ? `${h.confidence}/100` : "—",
        h.category ?? h.sanctionType ?? "—",
        h.jurisdiction ?? "—",
        h.dateAdded ? formatDate(h.dateAdded) : "—",
      ]),
    ) + `</div>`;
    if (hits.length > 20) {
      hitsTable += `<p style="font-size:10px;color:var(--ink-3);margin-top:6px;font-family:var(--mono)">${hits.length - 20} additional matches omitted — see full dataset.</p>`;
    }
  } else {
    hitsTable = `<div style="margin-top:10px;padding:12px 14px;background:oklch(45% 0.06 155 / 0.06);border:0.5px solid var(--sage)">
      <span style="color:var(--sage);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600">NO SANCTIONS MATCHES — CLEAR</span>
      <p style="margin:6px 0 0;font-size:11px;color:var(--ink-2);font-family:var(--serif)">Subject has been screened against all configured sanctions lists. No direct matches were returned at the configured threshold.</p>
    </div>`;
  }

  return hsSection({
    num: "03",
    kicker: "Sanctions Screening",
    title: "Sanctions & Watchlist Screening Results",
    content: hsKvGrid(summaryKv) + hitsTable,
  });
}

function buildPepSection(body: GenerateReportBody, sectionNum: string): string {
  const p = body.pepAssessment ?? {};
  const isPep = p.isPep ?? false;
  const tier = p.tier ?? "—";
  const tierBadge = isPep
    ? `<span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;padding:4px 10px;border:0.5px solid var(--pink);color:var(--pink);background:var(--pink-soft)">
        <span style="width:5px;height:5px;background:var(--pink);border-radius:50%;display:inline-block"></span>
        PEP TIER ${escHtml(String(tier))}
      </span>`
    : `<span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;padding:4px 10px;border:0.5px solid var(--sage);color:var(--sage);background:oklch(45% 0.06 155 / 0.06)">
        <span style="width:5px;height:5px;background:var(--sage);border-radius:50%;display:inline-block"></span>
        NOT A PEP
      </span>`;

  const kvRows = [
    { k: "PEP Status", v: tierBadge },
    { k: "PEP Tier", v: escHtml(String(tier)) },
    { k: "Role / Position", v: escHtml(p.role ?? "—") },
    { k: "Jurisdiction", v: escHtml(p.jurisdiction ?? "—") },
    { k: "Salience Score", v: p.salience !== undefined ? `${escHtml(String(p.salience))}/100 &nbsp; ${hsBar(p.salience, isPep ? "pink" : "sage")}` : "—" },
    { k: "EDD Required", v: isPep ? hsSeverityCell("EDD REQUIRED") : hsSeverityCell("STANDARD CDD") },
  ];

  if (p.relatedParties && p.relatedParties.length > 0) {
    kvRows.push({ k: "Related PEP Parties", v: escHtml(p.relatedParties.join(", ")) });
  }

  const rationale = p.rationale
    ? hsNarrative(p.rationale)
    : "";

  const eddNote = isPep
    ? `<div style="margin-top:12px;padding:10px 14px;border-left:2px solid var(--pink);background:var(--pink-soft)">
        <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;color:var(--pink);margin-bottom:4px">EDD Obligations</div>
        <div style="font-size:10.5px;color:var(--ink);font-family:var(--serif);line-height:1.6">
          As a designated PEP (Tier ${escHtml(String(tier))}), this subject requires Enhanced Due Diligence per UAE Federal Decree-Law No. 10 of 2025 Art.12, FATF Recommendation 12, and applicable CBUAE guidance. Senior management approval is required for onboarding or continued relationship.
        </div>
      </div>`
    : "";

  return hsSection({
    num: sectionNum,
    kicker: "PEP Screening",
    title: "Politically Exposed Person Assessment",
    content: hsKvGrid(kvRows) + rationale + eddNote,
  });
}

function buildAdverseMediaSection(body: GenerateReportBody, sectionNum: string): string {
  const am = body.adverseMedia ?? {};
  const total = am.articleCount ?? 0;
  const compositeScore = am.compositeScore ?? 0;
  const tone = scoreToTone(compositeScore);

  const breakdownBars = `<div style="margin-top:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
    ${[
      { label: "Critical", count: am.criticalCount ?? 0, tone: "pink" as const, color: "var(--pink)" },
      { label: "High", count: am.highCount ?? 0, tone: "pink" as const, color: "var(--amber)" },
      { label: "Medium", count: am.mediumCount ?? 0, tone: "amber" as const, color: "var(--amber)" },
      { label: "Low", count: am.lowCount ?? 0, tone: "sage" as const, color: "var(--sage)" },
    ].map(b => `<div class="hs-scorebox">
      <div class="hs-scorebox-n" style="font-size:28px;color:${b.color}">${escHtml(String(b.count))}</div>
      <div class="hs-scorebox-l">${escHtml(b.label)}</div>
    </div>`).join("")}
  </div>`;

  const kvRows = [
    { k: "Total Articles", v: escHtml(String(total)) },
    { k: "Composite Score", v: `${escHtml(String(compositeScore))}/100 &nbsp; ${hsBar(compositeScore, tone === "ember" ? "pink" : tone === "amber" ? "amber" : "sage")}` },
    { k: "Severity", v: total > 0 && compositeScore >= 50 ? hsSeverityCell("HIGH") : total > 0 ? hsSeverityCell("MEDIUM") : hsSeverityCell("CLEAR") },
  ];

  if (am.categories && am.categories.length > 0) {
    kvRows.push({ k: "Categories", v: escHtml(am.categories.join(" · ")) });
  }

  let headlinesHtml = "";
  if (am.topHeadlines && am.topHeadlines.length > 0) {
    headlinesHtml = `<div style="margin-top:12px">
      <div style="font-size:8px;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink-3);font-weight:600;margin-bottom:8px">Top Adverse Media Headlines</div>
      ${hsFindings(am.topHeadlines.slice(0, 8))}
    </div>`;
  }

  return hsSection({
    num: sectionNum,
    kicker: "Adverse Media",
    title: "Adverse Media & Reputational Risk",
    content: hsKvGrid(kvRows) + breakdownBars + headlinesHtml,
  });
}

function buildUboSection(body: GenerateReportBody, sectionNum: string): string {
  const chain = body.uboChain ?? [];

  // Text-based UBO chain diagram
  let chainDiagram = `<div style="margin-top:12px;font-family:var(--mono);font-size:10px;line-height:1.8;color:var(--ink)">`;
  chainDiagram += `<div style="font-size:8px;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink-3);font-weight:600;margin-bottom:8px">OWNERSHIP CHAIN (TOP → BOTTOM)</div>`;

  if (chain.length === 0) {
    chainDiagram += `<span style="color:var(--ink-3)">No UBO chain data provided.</span>`;
  } else {
    chain.forEach((entry, idx) => {
      const prefix = idx === 0 ? "█" : idx === chain.length - 1 ? "└─" : "├─";
      const indent = idx === 0 ? "" : "  ".repeat(Math.min(idx, 3));
      const pct = entry.ownershipPct !== undefined ? ` [${entry.ownershipPct}%]` : "";
      const type = entry.entityType ? ` · ${entry.entityType.toUpperCase()}` : "";
      const jur = entry.jurisdiction ? ` · ${entry.jurisdiction}` : "";
      chainDiagram += `<div style="padding:2px 0">${indent}${prefix} <strong>${escHtml(entry.name)}</strong>${escHtml(pct)}${escHtml(type)}${escHtml(jur)}${entry.notes ? `<br>${indent}     <span style="color:var(--ink-3);font-size:9px">${escHtml(entry.notes)}</span>` : ""}</div>`;
    });
  }
  chainDiagram += `</div>`;

  // UBO table
  const uboTable = chain.length > 0
    ? `<div style="margin-top:14px">` + hsTable(
        ["Tier", "Name", "Ownership %", "Type", "Jurisdiction", "Notes"],
        chain.map((u, i) => [
          String(i + 1),
          u.name,
          u.ownershipPct !== undefined ? `${u.ownershipPct}%` : "—",
          u.entityType ?? "—",
          u.jurisdiction ?? "—",
          u.notes ?? "—",
        ]),
      ) + `</div>`
    : "";

  const kv = [
    { k: "UBO Tiers Identified", v: escHtml(String(chain.length)) },
    { k: "Disclosure Status", v: chain.length > 0 ? hsSeverityCell("DISCLOSED") : hsSeverityCell("NOT PROVIDED") },
    { k: "25% Threshold Check", v: chain.some(u => (u.ownershipPct ?? 0) >= 25) ? hsSeverityCell("THRESHOLD MET") : escHtml("No single UBO ≥ 25%") },
  ];

  return hsSection({
    num: sectionNum,
    kicker: "Beneficial Ownership",
    title: "UBO Chain & Ownership Structure",
    content: hsKvGrid(kv) + chainDiagram + uboTable,
  });
}

function buildAuditTrailSection(body: GenerateReportBody, sectionNum: string): string {
  const limit = Math.min(Math.max(1, body.auditTrailLimit ?? 10), 30);
  const entries = (body.auditTrail ?? []).slice(-limit).reverse();

  let timeline = `<div style="margin-top:12px;display:flex;flex-direction:column;gap:0">`;
  if (entries.length === 0) {
    timeline += `<span style="color:var(--ink-3);font-size:11px;font-family:var(--serif)">No audit trail entries provided.</span>`;
  } else {
    entries.forEach((entry, idx) => {
      const isLast = idx === entries.length - 1;
      const eventLabel = typeof entry.payload === "object" && entry.payload !== null
        ? ((entry.payload as Record<string, unknown>)["event"] as string | undefined ?? entry.event ?? "event")
        : (entry.event ?? "event");
      const actorLabel = typeof entry.payload === "object" && entry.payload !== null
        ? ((entry.payload as Record<string, unknown>)["actor"] as string | undefined ?? entry.actor ?? "system")
        : (entry.actor ?? "system");

      timeline += `<div style="display:grid;grid-template-columns:16px 1fr;gap:10px;align-items:stretch">
        <div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:10px;height:10px;border:1.5px solid var(--pink);border-radius:50%;margin-top:4px;flex-shrink:0"></div>
          ${!isLast ? `<div style="width:1px;flex:1;background:var(--hair);margin:4px 0"></div>` : ""}
        </div>
        <div style="padding-bottom:${isLast ? "0" : "12px"}">
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <span style="font-family:var(--mono);font-size:9px;color:var(--ink-3)">${escHtml(formatDateTime(entry.at))}</span>
            <span style="font-family:var(--mono);font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--ink-2)">${escHtml(String(eventLabel))}</span>
            <span style="font-size:9px;color:var(--ink-3)">by ${escHtml(String(actorLabel))}</span>
          </div>
          <div style="font-size:9.5px;color:var(--ink-3);font-family:var(--mono);margin-top:2px">SEQ:${escHtml(String(entry.seq))}</div>
        </div>
      </div>`;
    });
  }
  timeline += `</div>`;

  const kv = [
    { k: "Entries Shown", v: escHtml(String(entries.length)) },
    { k: "Audit Limit", v: escHtml(String(limit)) },
    { k: "Tamper-Evident Chain", v: hsSeverityCell("ACTIVE") },
  ];

  return hsSection({
    num: sectionNum,
    kicker: "Audit Trail",
    title: "Activity Timeline",
    content: hsKvGrid(kv) + timeline,
  });
}

function buildRegulatorySection(body: GenerateReportBody, sectionNum: string): string {
  const findings = body.regulatoryFindings ?? [];
  const regs = body.applicableRegulations ?? [
    "UAE Federal Decree-Law No. 10 of 2025 (AML/CFT)",
    "CBUAE AML/CFT Framework 2020",
    "FATF Recommendations (2023)",
    "UAE PDPL Federal Decree-Law No. 45/2021",
  ];

  const regsHtml = `<div style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:6px">${regs.map(r =>
    `<span style="font-family:var(--mono);font-size:8.5px;letter-spacing:0.12em;text-transform:uppercase;padding:3px 8px;border:0.5px solid var(--hair);color:var(--ink-2)">${escHtml(r)}</span>`
  ).join("")}</div>`;

  let findingsTable = "";
  if (findings.length > 0) {
    findingsTable = hsTable(
      ["Regulation", "Article", "Requirement", "Deadline", "Status"],
      findings.map(f => [
        f.regulation,
        f.article ?? "—",
        f.requirement,
        f.deadline ?? "—",
        f.status ?? "PENDING",
      ]),
    );
  } else {
    findingsTable = `<p style="font-size:11px;color:var(--ink-2);font-family:var(--serif);margin-top:8px">Standard regulatory obligations apply. No specific findings flagged at this time.</p>`;
  }

  return hsSection({
    num: sectionNum,
    kicker: "Regulatory",
    title: "Regulatory Findings & Required Actions",
    content: regsHtml + findingsTable,
  });
}

function buildConclusionSection(body: GenerateReportBody, riskScore: number, riskLevel: string, sectionNum: string): string {
  const rec = body.recommendation ?? (riskScore >= 75 ? "ESCALATE" : riskScore >= 50 ? "EDD" : "APPROVE");
  const recLabel = recommendationLabel(rec);
  const recTone = recommendationTone(rec);

  const recBadge = `<div style="margin:14px 0;padding:16px 20px;border:1.5px solid ${recTone === "ember" ? "var(--pink)" : recTone === "amber" ? "var(--amber)" : "var(--sage)"};background:${recTone === "ember" ? "var(--pink-soft)" : recTone === "amber" ? "oklch(60% 0.11 70 / 0.06)" : "oklch(45% 0.06 155 / 0.06)"}">
    <div style="font-size:8px;letter-spacing:0.32em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px">REQUIRED ACTION</div>
    <div style="font-family:var(--serif);font-size:26px;font-weight:500;letter-spacing:0.02em;color:${recTone === "ember" ? "var(--pink)" : recTone === "amber" ? "var(--amber)" : "var(--sage)"}">${escHtml(recLabel)}</div>
  </div>`;

  const rationale = body.recommendationRationale
    ? hsNarrative(`Rationale: ${body.recommendationRationale}`)
    : hsNarrative(`Based on a composite risk score of ${riskScore}/100 (${riskLevel} risk band), the compliance assessment indicates that the recommended action is ${recLabel}. This determination is based on all available screening, due diligence, and intelligence data at the time of report generation.`);

  const actions = buildActionList(rec, riskLevel);

  return hsSection({
    num: sectionNum,
    kicker: "Conclusion",
    title: "Conclusion & Recommendation",
    content: recBadge + rationale + `<div style="margin-top:14px"><div style="font-size:8px;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink-3);font-weight:600;margin-bottom:6px">REQUIRED FOLLOW-UP ACTIONS</div>${hsNumList(actions)}</div>`,
  });
}

function buildActionList(rec: string, _riskLevel: string): string[] {
  const base: Record<string, string[]> = {
    APPROVE: [
      "File report in case management system with APPROVE disposition.",
      "Update customer risk rating to reflect current assessment.",
      "Schedule next periodic review per risk-based approach calendar.",
      "Retain all supporting documentation for 10 years per UAE Federal Decree-Law No. 10 of 2025 Art.24.",
    ],
    EDD: [
      "Initiate Enhanced Due Diligence (EDD) review within 5 business days.",
      "Obtain senior management approval before proceeding with any transactions.",
      "Request additional documentation: source of funds, source of wealth, beneficial ownership.",
      "Escalate to MLRO if EDD cannot be completed within the required timeframe.",
      "Retain all supporting documentation for 10 years per UAE Federal Decree-Law No. 10 of 2025 Art.24.",
    ],
    ESCALATE: [
      "Escalate immediately to MLRO / Compliance Officer for review.",
      "Do not process any pending transactions pending MLRO determination.",
      "Preserve all records, communications, and supporting documentation.",
      "MLRO to assess SAR/STR filing obligation within 5 business days.",
      "Do not tip-off the subject or associated parties (UAE Federal Decree-Law No. 10 of 2025 Art.29).",
    ],
    FREEZE: [
      "Apply immediate account / asset freeze in accordance with applicable sanctions regulations.",
      "Notify CBUAE / competent authority within the required reporting window.",
      "File STR/SAR with the UAE Financial Intelligence Unit (EOCN / goAML).",
      "Preserve all records and evidence — do not destroy or alter documentation.",
      "Engage legal counsel before communicating with the subject.",
      "Do not tip-off the subject or associated parties (UAE Federal Decree-Law No. 10 of 2025 Art.29).",
    ],
    SAR_FILE: [
      "Prepare and file Suspicious Transaction Report (STR) via goAML within the statutory deadline.",
      "Obtain MLRO sign-off and four-eyes verification before submission.",
      "File all supporting documentation in the SAR package.",
      "Do not tip-off the subject or associated parties (UAE Federal Decree-Law No. 10 of 2025 Art.29).",
      "Monitor for any subsequent activity and file follow-on reports as required.",
    ],
    CLOSE: [
      "Record CLOSE disposition in case management system with full supporting rationale.",
      "Ensure all documentation is archived per the 10-year retention schedule.",
      "Update customer risk rating and monitoring frequency.",
      "Notify relevant stakeholders of case closure.",
    ],
  };
  return base[rec] ?? base["APPROVE"] ?? [];
}

function buildCertificationSection(body: GenerateReportBody, reportId: string, dateStr: string, sectionNum: string): string {
  const signers = [
    {
      name: body.reportingOfficer ?? "___________________________",
      role: "MLRO / Reporting Officer",
      lic: body.reportingOfficerLicense ?? "License / Registration No.: _____________",
      date: dateStr,
    },
    {
      name: "___________________________",
      role: "Compliance Director",
      lic: "Co-signatory",
      date: "Date: _______________",
    },
    {
      name: body.institutionName ?? "___________________________",
      role: "Institution",
      lic: "UAE CBUAE License No.: _____________",
      date: "Date: _______________",
    },
  ];

  const certNote = `<div style="margin:14px 0;padding:10px 14px;border:0.5px solid var(--hair);background:oklch(98% 0.005 85 / 0.4)">
    <div style="font-size:8px;letter-spacing:0.28em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px;font-weight:600">CERTIFICATION</div>
    <div style="font-family:var(--serif);font-style:italic;font-size:11px;color:var(--ink-2);line-height:1.7">
      I, the undersigned Money Laundering Reporting Officer (MLRO), hereby certify that this report has been prepared in accordance with the requirements of UAE Federal Decree-Law No. 10 of 2025 on Anti-Money Laundering and Combatting the Financing of Terrorism, the Central Bank of the UAE AML/CFT Framework, and applicable FATF Recommendations. The findings contained herein are based on all available information at the time of preparation and represent the considered professional judgment of the compliance function. This document is CONFIDENTIAL and issued exclusively for MLRO and regulatory use.
    </div>
  </div>`;

  const metaRow = `<div style="margin-bottom:14px">` + hsKvGrid([
    { k: "Report Reference", v: `<span class="hs-mono-s">${escHtml(reportId)}</span>` },
    { k: "Date of Issue", v: escHtml(dateStr) },
    { k: "Report Type", v: escHtml(reportTypeLabel(body.reportType)) },
    { k: "Prepared For", v: escHtml(body.preparedFor ?? "Internal MLRO Use") },
    { k: "Jurisdiction", v: escHtml(body.jurisdiction ?? "United Arab Emirates") },
  ]) + `</div>`;

  return hsSection({
    num: sectionNum,
    kicker: "Certification",
    title: "MLRO Certification & Signature Block",
    content: metaRow + certNote + hsSignatureBlock(signers),
  });
}

// ─── Main report builder ─────────────────────────────────────────────────────

function buildReport(body: GenerateReportBody): { html: string; reportId: string } {
  const reportId = genReportId();
  const { dateStr, time } = nowMeta();
  const dateTimeStr = `${dateStr} · ${time}`;

  // Resolve risk score
  const riskScore = typeof body.riskScore === "number" && body.riskScore >= 0 && body.riskScore <= 100
    ? body.riskScore
    : (body.screeningResult?.topScore ?? 0);
  const riskLevel = body.riskLevel?.toUpperCase() ?? riskLevelFromScore(riskScore);
  const tone = verdictBand(riskLevel);
  const rec = body.recommendation ?? (riskScore >= 75 ? "ESCALATE" : riskScore >= 50 ? "EDD" : "APPROVE");

  const regsLabel = (body.applicableRegulations ?? ["UAE Federal Decree-Law No. 10 of 2025"]).slice(0, 2).join(" · ");

  // Build cover page
  const coverMeta: CoverData["meta"] = [
    { label: "Report Reference", value: reportId },
    { label: "Date Generated", value: dateTimeStr },
    { label: "Risk Score", value: `${riskScore}/100` },
    { label: "Risk Band", value: riskLevel },
    { label: "Reporting Officer", value: body.reportingOfficer ?? "—" },
    { label: "Prepared For", value: body.preparedFor ?? "Internal MLRO Use" },
  ];

  const coverData: CoverData = {
    reportId,
    regs: regsLabel,
    module: reportTypeModule(body.reportType),
    title: reportTypeLabel(body.reportType),
    subtitle: `Comprehensive compliance assessment for ${body.subjectName}. Generated ${dateTimeStr}. For MLRO and regulatory use only.`,
    subjectLabel: "SUBJECT OF REPORT",
    subjectName: body.subjectName,
    subjectMeta: [
      body.subjectType ?? "",
      body.nationality ?? "",
      body.subjectId,
    ].filter(Boolean).join(" · "),
    verdictLabel: recommendationLabel(rec),
    verdictBand: tone,
    verdictNote: `${riskLevel} risk — ${riskScore}/100`,
    meta: coverMeta,
  };

  const coverContent = hsCover(coverData);
  const coverPage = hsPage({
    reportId,
    pageNum: 1,
    pageTotal: 99, // Will be replaced in post-processing
    regs: regsLabel,
    label: reportTypeLabel(body.reportType),
    content: coverContent,
  });

  // Determine which sections to include and build them
  const contentSections: string[] = [];
  let sectionCounter = 3; // 01 = executive summary, 02 = subject info

  contentSections.push(buildExecutiveSummary(body, riskScore, riskLevel));
  contentSections.push(buildSubjectInfo(body, reportId, dateTimeStr));

  if (body.includeScreeningResult) {
    contentSections.push(buildScreeningSection(body));
    sectionCounter++;
  }

  if (body.includePepAssessment) {
    contentSections.push(buildPepSection(body, String(sectionCounter).padStart(2, "0")));
    sectionCounter++;
  }

  if (body.includeAdverseMedia) {
    contentSections.push(buildAdverseMediaSection(body, String(sectionCounter).padStart(2, "0")));
    sectionCounter++;
  }

  if (body.includeUboChain) {
    contentSections.push(buildUboSection(body, String(sectionCounter).padStart(2, "0")));
    sectionCounter++;
  }

  if (body.includeAuditTrail) {
    contentSections.push(buildAuditTrailSection(body, String(sectionCounter).padStart(2, "0")));
    sectionCounter++;
  }

  contentSections.push(buildRegulatorySection(body, String(sectionCounter).padStart(2, "0")));
  sectionCounter++;

  contentSections.push(buildConclusionSection(body, riskScore, riskLevel, String(sectionCounter).padStart(2, "0")));
  sectionCounter++;

  contentSections.push(buildCertificationSection(body, reportId, dateTimeStr, String(sectionCounter).padStart(2, "0")));

  const totalSections = contentSections.length;
  const contentPageTotal = 1 + Math.ceil(totalSections / 2); // rough estimate
  const pageTotal = 1 + contentPageTotal;

  // Pack sections into pages — approximately 2 major sections per page
  const contentPages: string[] = [];
  for (let i = 0; i < contentSections.length; i += 2) {
    const pageNum = contentPages.length + 2; // page 1 = cover
    const chunk = contentSections.slice(i, i + 2).join("\n");
    contentPages.push(
      hsPage({
        reportId,
        pageNum,
        pageTotal,
        regs: regsLabel,
        label: reportTypeLabel(body.reportType),
        content: chunk + (i + 2 >= contentSections.length ? hsFinis(reportId, pageNum, pageTotal) : ""),
      }),
    );
  }

  const html = buildHtmlDoc({
    title: `${reportTypeLabel(body.reportType)} — ${body.subjectName} — ${reportId}`,
    pages: [coverPage, ...contentPages],
    autoprint: false, // caller can add ?autoprint=true
  });

  return { html, reportId };
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req, { cost: 10 });
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.headers;

  let body: GenerateReportBody;
  try {
    body = (await req.json()) as GenerateReportBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gateHeaders },
    );
  }

  // Validate required fields
  if (!body.subjectId || typeof body.subjectId !== "string") {
    return NextResponse.json(
      { ok: false, error: "subjectId is required" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (!body.subjectName || typeof body.subjectName !== "string") {
    return NextResponse.json(
      { ok: false, error: "subjectName is required" },
      { status: 400, headers: gateHeaders },
    );
  }
  const validReportTypes: ReportType[] = ["screening", "due_diligence", "sar_package", "audit_certificate"];
  if (!body.reportType || !validReportTypes.includes(body.reportType)) {
    return NextResponse.json(
      { ok: false, error: `reportType must be one of: ${validReportTypes.join(", ")}` },
      { status: 400, headers: gateHeaders },
    );
  }

  // Determine output format
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "html").toLowerCase();
  const autoprint = url.searchParams.get("autoprint") === "true";

  let html: string;
  let reportId: string;
  try {
    const result = buildReport(body);
    html = result.html;
    reportId = result.reportId;

    // Inject autoprint if requested
    if (autoprint) {
      html = html.replace(
        "</body>",
        `<script>setTimeout(function(){window.print()},400)</script></body>`,
      );
    }
  } catch (err) {
    console.error("[generate-report] build failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Report generation failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500, headers: gateHeaders },
    );
  }

  if (format === "json") {
    return NextResponse.json(
      { ok: true, html, reportId },
      {
        status: 200,
        headers: {
          ...gateHeaders,
          "cache-control": "no-store",
        },
      },
    );
  }

  // Default: return HTML for direct browser render / print-to-PDF
  const filename = `hawkeye-report-${safeFilename(body.subjectId)}-${reportId}.html`;
  return new Response(html, {
    status: 200,
    headers: {
      ...gateHeaders,
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
      "x-report-id": reportId,
    },
  });
}
