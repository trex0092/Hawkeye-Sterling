import type { EwraBoardReportResult } from "@/app/api/ewra-report/route";
import type { GovernanceGapResult } from "@/app/api/governance-gap/route";
import { exportToPdf, type PdfSection } from "./exportPdf";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PW, ML, MR, CW, CONTENT_Y, BOTTOM_Y,
  BLACK, GRAY_D, GRAY_M, GRAY_L, WHITE, PINK,
  coverFrame, contentFrame, coverLogo, coverFooter,
  dropCapTitle, twoCards, metaGrid,
  partHeader, verdictBadge, kvRows, dropCapPara, sigFooter,
} from "./pdfDesign";

type ATDoc = { lastAutoTable: { finalY: number } };

function nowFmt() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = d.getFullYear();
  const time = d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"Asia/Dubai"})+" GST";
  return { dd, mm, yyyy, dateStr:`${dd}/${mm}/${yyyy}`, time };
}

function guard(doc: jsPDF, y: number, needed: number): number {
  if (y+needed > BOTTOM_Y) { doc.addPage(); return CONTENT_Y; }
  return y;
}

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
  const doc = new jsPDF({ unit:"pt", format:"a4" });
  const { dd, mm, yyyy, dateStr, time } = nowFmt();
  const ref = `EWRA-${yyyy}-BOARD`;
  const riskLabel = (boardReport.overallRisk ?? "HIGH").toUpperCase()+" RISK";

  // ── COVER ──
  coverFrame(doc, ref);
  coverLogo(doc, ML+22, 105);

  doc.setFont("helvetica","bold"); doc.setFontSize(22); doc.setCharSpace(6);
  doc.setTextColor(BLACK[0],BLACK[1],BLACK[2]);
  doc.text("HAWKEYE  ·  STERLING", PW/2, 147, {align:"center"}); doc.setCharSpace(0);

  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setCharSpace(2);
  doc.setTextColor(GRAY_D[0],GRAY_D[1],GRAY_D[2]);
  doc.text("MODULE 23  ·  RISK ASSESSMENT", PW/2, 163, {align:"center"}); doc.setCharSpace(0);

  doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setCharSpace(0.5);
  doc.setTextColor(GRAY_D[0],GRAY_D[1],GRAY_D[2]);
  doc.text(ref, PW-MR, 147, {align:"right"}); doc.setCharSpace(0);

  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setCharSpace(2.5);
  doc.setTextColor(GRAY_M[0],GRAY_M[1],GRAY_M[2]);
  doc.text("DOCUMENT TYPE", PW/2, 210, {align:"center"}); doc.setCharSpace(0);

  dropCapTitle(doc, "E", "nterprise-Wide Risk Assessment — Board Report", 250);

  doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(GRAY_D[0],GRAY_D[1],GRAY_D[2]);
  doc.text(doc.splitTextToSize(
    "Annual enterprise-wide risk assessment under UAE FDL 10/2025 Art.4 and CBUAE AML Standards §2. Scope: customer, geographic, products, channels, delivery mechanisms.",
    380
  ), PW/2, 272, {align:"center"});

  twoCards(doc, 308,
    { label:"REPORTING ENTITY", title:"Hawkeye Sterling DPMS", tags:`LICENSED DPMS  ·  DMCC  ·  UAE  ·  ${ref}` },
    { label:"VERDICT", value:riskLabel, sub:boardReport.executiveSummary?.slice(0,70) }
  );

  metaGrid(doc, 568, [
    { label:"DATE GENERATED",    value:dateStr,                sub:time },
    { label:"PLACE OF ISSUE",    value:"Dubai  ·  DMCC",       sub:"DMCC Free Zone" },
    { label:"OFFICER",           value:"L. Fernanda",           sub:"CO/MLRO" },
    { label:"FIU REGISTRATION",  value:"FIU-AE-DMCC-0428",     sub:"goAML Reporting Entity" },
    { label:"REPORT IDENTIFIER", value:ref,                    sub:"Immutable  ·  Signed" },
    { label:"NEXT ASSESSMENT",   value:`${dd}/${mm}/${Number(yyyy)+1}`, sub:"Annual Cycle" },
  ]);
  coverFooter(doc);

  // ── CONTENT ──
  doc.addPage();
  let y = CONTENT_Y;

  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(BLACK[0],BLACK[1],BLACK[2]);
  doc.text("Enterprise-Wide Risk Assessment — Board Report", ML, y); y+=18;
  y = verdictBadge(doc, riskLabel, y);

  // Part 1 — Executive summary
  y = guard(doc,y,80); y = partHeader(doc,"PART ONE","01","Executive summary",y);
  if (boardReport.executiveSummary) y = dropCapPara(doc, boardReport.executiveSummary, y);

  // Part 2 — Risk dimension scores
  if (dimensions.length > 0) {
    y = guard(doc,y,80); y = partHeader(doc,"PART TWO","02","Risk dimension scores",y);
    autoTable(doc, {
      startY: y,
      head: [["DIMENSION","INHERENT","CONTROLS","NOTES"]],
      body: dimensions.map(d=>[d.dimension,String(d.inherent),String(d.controls),d.notes||"—"]),
      margin: { left:ML, right:MR, top:CONTENT_Y },
      styles: { fontSize:8.5, cellPadding:5, overflow:"linebreak", textColor:[30,30,30] as [number,number,number] },
      headStyles: { fillColor:WHITE, textColor:BLACK, fontStyle:"bold", fontSize:7.5, lineWidth:0.3, lineColor:GRAY_L },
      bodyStyles: { lineWidth:0.3, lineColor:GRAY_L },
      columnStyles: { 0:{cellWidth:140}, 1:{cellWidth:55}, 2:{cellWidth:55}, 3:{cellWidth:CW-250} },
      theme:"plain",
    });
    y = (doc as unknown as ATDoc).lastAutoTable.finalY+16;
  }

  // Part 3 — Board recommendations
  if (boardReport.boardRecommendations?.length > 0) {
    y = guard(doc,y,80); y = partHeader(doc,"PART THREE","03","Board recommendations",y);
    for (let i=0; i<boardReport.boardRecommendations.length; i++) {
      y = guard(doc,y,20);
      const numStr = String(i+1).padStart(2,"0");
      doc.setFont("times","italic"); doc.setFontSize(10); doc.setTextColor(PINK[0],PINK[1],PINK[2]);
      const nw = doc.getTextWidth(numStr+"  "); doc.text(numStr, ML+20, y);
      doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(BLACK[0],BLACK[1],BLACK[2]);
      const rl = doc.splitTextToSize(boardReport.boardRecommendations[i], CW-nw-20);
      doc.text(rl, ML+20+nw, y); y += rl.length*12+6;
    }
    y+=6;
  }

  // Part 4 — Regulatory context
  if (boardReport.regulatoryContext) {
    y = guard(doc,y,80); y = partHeader(doc,"PART FOUR","04","Regulatory context",y);
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(BLACK[0],BLACK[1],BLACK[2]);
    const rl = doc.splitTextToSize(boardReport.regulatoryContext, CW); doc.text(rl, ML, y); y+=rl.length*12+8;
  }

  // Signature footer
  y = guard(doc,y,90);
  sigFooter(doc, Math.max(y+20,BOTTOM_Y-60), ref, [
    { name:"L. Fernanda",         role:"COMPLIANCE OFFICER / MLRO", id:"HS-MLRO-0428", date:dateStr },
    { name:"Board Chair",         role:"AML SIGN-OFF",              id:`Board Resolution ${yyyy}-04`, date:dateStr },
    { name:"Independent Director",role:"AML OVERSIGHT",             id:"—", date:"—" },
  ]);

  const total = doc.getNumberOfPages()-1;
  for (let p=2; p<=doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    contentFrame(doc, ref, "FDL 10/2025 ART.4  ·  FATF R.1  ·  CBUAE AML","STANDARDS §2", p-1, total);
  }

  doc.save(`${ref}-${dd}-${mm}-${yyyy}.pdf`);
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
  const doc = new jsPDF({ unit:"pt", format:"a4" });
  const { dd, mm, yyyy, dateStr, time } = nowFmt();
  const ref = `STR-DRAFT-${dd}-${mm}-${yyyy}`;
  const riskBadge = `RISK SCORE ${str.composite} / 100`;

  // ── COVER ──
  coverFrame(doc, ref);
  coverLogo(doc, ML+22, 105);

  doc.setFont("helvetica","bold"); doc.setFontSize(22); doc.setCharSpace(6);
  doc.setTextColor(BLACK[0],BLACK[1],BLACK[2]);
  doc.text("HAWKEYE  ·  STERLING", PW/2, 147, {align:"center"}); doc.setCharSpace(0);

  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setCharSpace(2);
  doc.setTextColor(GRAY_D[0],GRAY_D[1],GRAY_D[2]);
  doc.text("STR WORKBENCH", PW/2, 163, {align:"center"}); doc.setCharSpace(0);

  doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setCharSpace(0.5);
  doc.setTextColor(GRAY_D[0],GRAY_D[1],GRAY_D[2]);
  doc.text(ref, PW-MR, 147, {align:"right"}); doc.setCharSpace(0);

  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setCharSpace(2.5);
  doc.setTextColor(GRAY_M[0],GRAY_M[1],GRAY_M[2]);
  doc.text("DOCUMENT TYPE", PW/2, 210, {align:"center"}); doc.setCharSpace(0);

  dropCapTitle(doc, "S", "uspicious Transaction Report — Draft", 250);

  doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(GRAY_D[0],GRAY_D[1],GRAY_D[2]);
  doc.text(doc.splitTextToSize(
    "Draft STR prepared for MLRO review. Documents structuring pattern and supporting transactions for submission via goAML under UAE FDL 10/2025 Art.14 and CBUAE AML Standards §8.",
    380
  ), PW/2, 272, {align:"center"});

  twoCards(doc, 308,
    { label:"SUBJECT OF REPORT", title:str.subject, tags:`${str.jurisdiction.toUpperCase()}  ·  ${ref}` },
    { label:"VERDICT", value:`RISK ${str.composite}/100`, sub:"Filing required within\nprescribed 30-day window." }
  );

  metaGrid(doc, 568, [
    { label:"DATE PREPARED",     value:dateStr,             sub:time },
    { label:"PLACE OF ISSUE",    value:"Dubai  ·  DMCC",    sub:"DMCC Free Zone" },
    { label:"OFFICER",           value:"L. Fernanda",        sub:"CO/MLRO" },
    { label:"FIU REGISTRATION",  value:"FIU-AE-DMCC-0428",  sub:"goAML Reporting Entity" },
    { label:"REPORT IDENTIFIER", value:ref,                 sub:"Draft  ·  Pre-filing" },
    { label:"RETENTION",         value:"10 years",          sub:"FDL 10/2025 ART.24" },
  ]);
  coverFooter(doc);

  // ── CONTENT ──
  doc.addPage();
  let y = CONTENT_Y;

  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(BLACK[0],BLACK[1],BLACK[2]);
  doc.text("Suspicious Transaction Report — Draft", ML, y); y+=18;
  y = verdictBadge(doc, riskBadge, y);

  // Part 1 — Report details
  y = guard(doc,y,80); y = partHeader(doc,"PART ONE","01","Report details",y);
  y = kvRows(doc, [
    ["SUBJECT",              str.subject],
    ["JURISDICTION",         str.jurisdiction],
    ["COMPOSITE RISK SCORE", `${str.composite} / 100`],
    ["DATE PREPARED",        dateStr],
    ["REPORTING OFFICER",    "L. Fernanda — CO/MLRO"],
  ], y);

  // Part 2 — Narrative
  y = guard(doc,y,80); y = partHeader(doc,"PART TWO","02","Narrative",y);
  y = dropCapPara(doc, str.narrative, y);

  // Part 3 — Supporting transactions
  if (str.transactions.length > 0) {
    y = guard(doc,y,80); y = partHeader(doc,"PART THREE","03","Supporting transactions",y);
    autoTable(doc, {
      startY: y,
      head: [["DATE","AMOUNT (AED)","DESCRIPTION"]],
      body: str.transactions.map(tx=>[
        tx.date,
        tx.amount.toLocaleString("en-AE",{minimumFractionDigits:2}),
        tx.desc,
      ]),
      margin: { left:ML, right:MR, top:CONTENT_Y },
      styles: { fontSize:8.5, cellPadding:5, overflow:"linebreak", textColor:[30,30,30] as [number,number,number] },
      headStyles: { fillColor:WHITE, textColor:BLACK, fontStyle:"bold", fontSize:7.5, lineWidth:0.3, lineColor:GRAY_L },
      bodyStyles: { lineWidth:0.3, lineColor:GRAY_L },
      columnStyles: { 0:{cellWidth:80}, 1:{cellWidth:110}, 2:{cellWidth:CW-190} },
      theme:"plain",
    });
    y = (doc as unknown as ATDoc).lastAutoTable.finalY+10;
  }

  // Disclaimer
  y = guard(doc,y,30);
  doc.setFont("times","italic"); doc.setFontSize(7.5); doc.setTextColor(GRAY_D[0],GRAY_D[1],GRAY_D[2]);
  const disc = "This draft STR has been prepared for MLRO review. It must not be disclosed to the subject. Filing is required within the timeframe prescribed by CBUAE AML Standards §8 and UAE FDL 10/2025 Art.14.";
  const dl = doc.splitTextToSize(disc, CW); doc.text(dl, ML, y); y+=dl.length*10+12;

  // Signature footer
  y = guard(doc,y,90);
  sigFooter(doc, Math.max(y+20,BOTTOM_Y-60), ref, [
    { name:"L. Fernanda",     role:"CO/MLRO  ·  AUTHOR",    id:"HS-MLRO-0428", date:dateStr },
    { name:"FIU goAML",       role:"SUBMISSION PENDING",     id:"FIU-AE-DMCC-0428", date:"—" },
    { name:"Senior Management",role:"AWARENESS",             id:"Not to be disclosed to subject", date:dateStr },
  ]);

  const total = doc.getNumberOfPages()-1;
  for (let p=2; p<=doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    contentFrame(doc, ref, "FDL 10/2025 ART.14  ·  CBUAE AML STANDARDS","§8  ·  FATF R.20", p-1, total);
  }

  doc.save(`${ref}.pdf`);
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
