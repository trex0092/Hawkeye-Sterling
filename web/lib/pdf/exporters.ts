import type { EwraBoardReportResult } from "@/app/api/ewra-report/route";
import type { GovernanceGapResult } from "@/app/api/governance-gap/route";
import { exportToPdf, type PdfSection } from "./exportPdf";

// ─── EWRA Board Report ───────────────────────────────────────────────────────

interface EwraDimension {
  dimension: string;
  inherent: number;
  controls: number;
  notes: string;
}

export function exportEwraBoardReport(
  boardReport: EwraBoardReportResult,
  dimensions: EwraDimension[],
): void {
  const riskTone = (risk: string): "red" | "amber" | "green" | "neutral" =>
    risk === "critical" || risk === "high" ? "red" :
    risk === "medium" ? "amber" :
    risk === "low" ? "green" : "neutral";

  const sections: PdfSection[] = [
    { type: "header", content: "Enterprise-Wide Risk Assessment — Board Report" },
    {
      type: "badge",
      content: `${boardReport.overallRisk} risk`,
      tone: riskTone(boardReport.overallRisk),
    },
    { type: "subheader", content: "Executive Summary" },
    { type: "paragraph", content: boardReport.executiveSummary },
    { type: "divider" },
  ];

  if (boardReport.keyFindings?.length > 0) {
    sections.push({ type: "subheader", content: "Key Findings" });
    for (const finding of boardReport.keyFindings) {
      sections.push({ type: "paragraph", content: `• ${finding}` });
    }
    sections.push({ type: "divider" });
  }

  if (boardReport.dimensionNarratives?.length > 0) {
    sections.push({ type: "subheader", content: "Dimension Narratives" });
    sections.push({
      type: "table",
      columns: ["Dimension", "Inherent", "Residual", "Narrative"],
      rows: boardReport.dimensionNarratives.map((dn) => [
        dn.dimension,
        dn.inherentRisk,
        dn.residualRisk,
        dn.narrative.slice(0, 120) + (dn.narrative.length > 120 ? "…" : ""),
      ]),
    });
  }

  if (dimensions.length > 0) {
    sections.push({ type: "subheader", content: "Risk Dimension Scores" });
    sections.push({
      type: "table",
      columns: ["Dimension", "Inherent", "Controls", "Notes"],
      rows: dimensions.map((d) => [
        d.dimension,
        String(d.inherent),
        String(d.controls),
        d.notes || "—",
      ]),
    });
  }

  if (boardReport.boardRecommendations?.length > 0) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Board Recommendations" });
    boardReport.boardRecommendations.forEach((rec, i) => {
      sections.push({ type: "paragraph", content: `${i + 1}. ${rec}` });
    });
  }

  if (boardReport.regulatoryContext) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Regulatory Context" });
    sections.push({ type: "paragraph", content: boardReport.regulatoryContext });
  }

  if (boardReport.nextSteps?.length > 0) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Next Steps" });
    boardReport.nextSteps.forEach((step, i) => {
      sections.push({ type: "paragraph", content: `${i + 1}. ${step}` });
    });
  }

  if (boardReport.approvalStatement) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Approval Statement" });
    sections.push({ type: "paragraph", content: boardReport.approvalStatement });
  }

  exportToPdf({
    title: "EWRA / BWRA Board Report",
    moduleName: "Module 23 · Risk Assessment",
    reportRef: `EWRA-${new Date().getFullYear()}-BOARD`,
    institution: "Hawkeye Sterling DPMS",
    regulatoryBasis: "UAE FDL 10/2025 Art.4 · FATF R.1 · CBUAE AML Standards",
    confidential: true,
    sections,
  });
}

// ─── STR Draft ───────────────────────────────────────────────────────────────

interface StrTransaction {
  date: string;
  amount: number;
  desc: string;
}

interface StrDraftInput {
  subject: string;
  narrative: string;
  transactions: StrTransaction[];
  composite: number;
  jurisdiction: string;
}

export function exportStrDraft(str: StrDraftInput): void {
  const riskTone = (score: number): "red" | "amber" | "green" =>
    score >= 70 ? "red" : score >= 40 ? "amber" : "green";

  const sections: PdfSection[] = [
    { type: "header", content: "Suspicious Transaction Report — Draft" },
    { type: "badge", content: `Risk score ${str.composite}`, tone: riskTone(str.composite) },
    { type: "subheader", content: "Report Details" },
    {
      type: "keyvalue",
      pairs: [
        { label: "Subject", value: str.subject },
        { label: "Jurisdiction", value: str.jurisdiction },
        { label: "Composite Risk Score", value: `${str.composite} / 100` },
        { label: "Date Prepared", value: new Date().toLocaleDateString("en-GB") },
      ],
    },
    { type: "divider" },
    { type: "subheader", content: "Narrative" },
    { type: "paragraph", content: str.narrative },
  ];

  if (str.transactions.length > 0) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Supporting Transactions" });
    sections.push({
      type: "table",
      columns: ["Date", "Amount (AED)", "Description"],
      rows: str.transactions.map((t) => [
        t.date,
        t.amount.toLocaleString("en-AE", { minimumFractionDigits: 2 }),
        t.desc,
      ]),
    });
  }

  sections.push({ type: "divider" });
  sections.push({
    type: "paragraph",
    content:
      "This draft STR has been prepared for MLRO review. It must not be disclosed to the subject. " +
      "Filing is required within the timeframe prescribed by CBUAE AML Standards §8 and UAE FDL 10/2025 Art.14.",
  });

  exportToPdf({
    title: "Suspicious Transaction Report — Draft",
    moduleName: "STR Workbench",
    reportRef: `STR-DRAFT-${Date.now()}`,
    institution: "Hawkeye Sterling DPMS",
    regulatoryBasis: "UAE FDL 10/2025 Art.14 · CBUAE AML Standards §8 · FATF R.20",
    confidential: true,
    sections,
  });
}

// ─── Oversight Gap Analysis ───────────────────────────────────────────────────

export function exportGapAnalysis(
  gapResult: GovernanceGapResult,
  institutionName: string,
): void {
  const gradeTone = (grade: string): "red" | "amber" | "green" | "neutral" =>
    grade === "F" || grade === "D" ? "red" :
    grade === "C" ? "amber" :
    grade === "A" || grade === "B" ? "green" : "neutral";

  const severityTone = (sev: string): "red" | "amber" | "green" | "neutral" =>
    sev === "critical" || sev === "high" ? "red" :
    sev === "medium" ? "amber" :
    sev === "low" ? "green" : "neutral";

  const sections: PdfSection[] = [
    { type: "header", content: "Governance Gap Analysis Report" },
    {
      type: "badge",
      content: `Grade ${gapResult.overallGrade}`,
      tone: gradeTone(gapResult.overallGrade),
    },
    { type: "subheader", content: "Overall Assessment" },
    {
      type: "keyvalue",
      pairs: [
        { label: "Institution", value: institutionName },
        { label: "Overall Grade", value: gapResult.overallGrade },
        { label: "Assessment Date", value: new Date().toLocaleDateString("en-GB") },
      ],
    },
    { type: "paragraph", content: gapResult.gradeRationale },
  ];

  if (gapResult.criticalGaps.length > 0) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Critical Gaps" });
    for (const gap of gapResult.criticalGaps) {
      sections.push({ type: "paragraph", content: `! ${gap}` });
    }
  }

  if (gapResult.findings.length > 0) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Findings" });
    sections.push({
      type: "table",
      columns: ["Area", "Finding", "Severity", "Regulatory Ref"],
      rows: gapResult.findings.map((f) => [
        f.area,
        f.finding.slice(0, 100) + (f.finding.length > 100 ? "…" : ""),
        f.severity.toUpperCase(),
        f.regulatoryRef,
      ]),
    });
  }

  if (gapResult.recommendations.length > 0) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Recommendations" });
    sections.push({
      type: "table",
      columns: ["Priority", "Action", "Owner", "Deadline"],
      rows: gapResult.recommendations.map((r) => [
        r.priority.toUpperCase(),
        r.action.slice(0, 80) + (r.action.length > 80 ? "…" : ""),
        r.owner,
        r.deadline,
      ]),
    });
  }

  if (gapResult.regulatoryRisks.length > 0) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Regulatory Risks" });
    sections.push({
      type: "table",
      columns: ["Risk", "Likelihood", "Impact", "Mitigant"],
      rows: gapResult.regulatoryRisks.map((r) => [
        r.risk.slice(0, 60) + (r.risk.length > 60 ? "…" : ""),
        r.likelihood.toUpperCase(),
        r.impact.toUpperCase(),
        r.mitigant.slice(0, 60) + (r.mitigant.length > 60 ? "…" : ""),
      ]),
    });
  }

  if (gapResult.summary) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Summary" });
    sections.push({ type: "paragraph", content: gapResult.summary });
  }

  exportToPdf({
    title: "Governance Gap Analysis",
    moduleName: "Management Oversight",
    reportRef: `GAP-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    institution: institutionName,
    regulatoryBasis: "UAE FDL 10/2025 Art.20 · CBUAE AML Standards §6",
    confidential: true,
    sections,
  });
}

// ─── Screening Report ─────────────────────────────────────────────────────────

interface ScreeningResult {
  composite: number;
  disposition: string;
  findings: string[];
}

export function exportScreeningReport(
  subject: string,
  result: ScreeningResult,
): void {
  const riskTone = (score: number): "red" | "amber" | "green" =>
    score >= 70 ? "red" : score >= 40 ? "amber" : "green";

  const sections: PdfSection[] = [
    { type: "header", content: "Customer Screening Report" },
    {
      type: "badge",
      content: result.disposition,
      tone: riskTone(result.composite),
    },
    { type: "subheader", content: "Subject Details" },
    {
      type: "keyvalue",
      pairs: [
        { label: "Subject Name", value: subject },
        { label: "Composite Score", value: `${result.composite} / 100` },
        { label: "Disposition", value: result.disposition },
        { label: "Screened On", value: new Date().toLocaleDateString("en-GB") },
      ],
    },
  ];

  if (result.findings.length > 0) {
    sections.push({ type: "divider" });
    sections.push({ type: "subheader", content: "Findings" });
    for (const finding of result.findings) {
      sections.push({ type: "paragraph", content: `• ${finding}` });
    }
  }

  sections.push({ type: "divider" });
  sections.push({
    type: "paragraph",
    content:
      "This screening report is produced for MLRO and compliance team use only. " +
      "Results must be reviewed against primary source data before a final disposition is recorded. " +
      "Screening performed under UAE FDL 10/2025 Art.9 and FATF R.10.",
  });

  exportToPdf({
    title: "Customer Screening Report",
    moduleName: "Name Screening",
    reportRef: `SCR-${Date.now()}`,
    institution: "Hawkeye Sterling DPMS",
    regulatoryBasis: "UAE FDL 10/2025 Art.9 · FATF R.10 · CBUAE AML Standards §4",
    confidential: true,
    sections,
  });
}

// ─── MLRO Memo ────────────────────────────────────────────────────────────────

interface MlroMemoInput {
  subject: string;
  summary: string;
  recommendation: string;
  regulatoryBasis: string;
}

export function exportMlroMemo(memo: MlroMemoInput): void {
  const sections: PdfSection[] = [
    { type: "header", content: "MLRO Internal Memorandum" },
    { type: "subheader", content: "Memorandum Details" },
    {
      type: "keyvalue",
      pairs: [
        { label: "Subject", value: memo.subject },
        { label: "Date", value: new Date().toLocaleDateString("en-GB") },
        { label: "Regulatory Basis", value: memo.regulatoryBasis },
        { label: "Classification", value: "CONFIDENTIAL — MLRO USE ONLY" },
      ],
    },
    { type: "divider" },
    { type: "subheader", content: "Summary" },
    { type: "paragraph", content: memo.summary },
    { type: "divider" },
    { type: "subheader", content: "Recommendation" },
    { type: "paragraph", content: memo.recommendation },
    { type: "divider" },
    {
      type: "paragraph",
      content:
        "This memorandum is prepared by and for the MLRO and is protected under legal professional " +
        "privilege where applicable. It is not to be disclosed externally without authorisation.",
    },
  ];

  exportToPdf({
    title: "MLRO Internal Memorandum",
    moduleName: "MLRO Office",
    reportRef: `MLRO-MEMO-${Date.now()}`,
    institution: "Hawkeye Sterling DPMS",
    regulatoryBasis: memo.regulatoryBasis,
    confidential: true,
    sections,
  });
}
