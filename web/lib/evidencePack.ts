// MLRO Advisor Evidence Pack — redesigned cover-style PDF report.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PW, ML, MR, CW, CONTENT_Y, BOTTOM_Y,
  PINK, BLACK, GRAY_D, GRAY_M, GRAY_L, WHITE,
  coverFrame, contentFrame, coverLogo, coverFooter,
  dropCapTitle, twoCards, metaGrid,
  partHeader, verdictBadge, kvRows, dropCapPara, sigFooter,
} from "./pdf/pdfDesign";

export interface EvidencePackEntry {
  question: string;
  askedAt: string;
  mode: string;
  verdict: string;
  narrative?: string;
  guidance?: string;
  elapsedMs: number;
  partial: boolean;
  charterIntegrityHash?: string;
  reasoningTrail?: Array<{
    stepNo: number;
    actor: string;
    modelId: string;
    at: string;
    summary: string;
    body: string;
  }>;
  charterIssues?: string[];
  classifier?: {
    primaryTopic?: string;
    jurisdictions?: string[];
    regimes?: string[];
    fatfRecs?: Array<{ num: number; title: string; citation: string }>;
    doctrines?: string[];
    redFlags?: string[];
    typologies?: string[];
    commonSenseRules?: string[];
  };
  challenge?: {
    outcome?: "UPHELD" | "PARTIALLY_UPHELD" | "OVERTURNED";
    steelman?: string;
    weakCitations: Array<{ citation: string; why: string }>;
    alternativeReadings: string[];
    hardenSuggestions: string[];
  };
  conflicts?: Array<{
    title: string;
    severity: "high" | "medium" | "low";
    jurisdictions: string[];
    description: string;
    mitigation: string[];
    authorities: string[];
  }>;
}

type ATDoc = { lastAutoTable: { finalY: number } };

function makeRef(askedAt: string): string {
  const d = new Date(askedAt);
  return `EVIDENCE-${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}-001`;
}

function fmtDt(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"});
  const time = d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"Asia/Dubai"})+" GST";
  return { date, time };
}

function addPage(doc: jsPDF): number {
  doc.addPage();
  return CONTENT_Y;
}

function guard(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > BOTTOM_Y) return addPage(doc);
  return y;
}

export function renderAdvisorEvidencePack(entry: EvidencePackEntry): Blob {
  const doc = new jsPDF({ unit:"pt", format:"a4" });
  const ref = makeRef(entry.askedAt);
  const dt  = fmtDt(entry.askedAt);
  const verdict = entry.verdict.replace(/_/g," ").toUpperCase();
  const engineModel  = entry.reasoningTrail?.find(s=>s.actor==="advisor")?.modelId  ?? "claude-opus-4-7";
  const execModel    = entry.reasoningTrail?.find(s=>s.actor==="executor")?.modelId ?? "claude-sonnet-4-6";
  const hashShort    = entry.charterIntegrityHash ? entry.charterIntegrityHash.slice(0,20)+"..." : "—";

  // ── COVER ──────────────────────────────────────────────────────────────────
  coverFrame(doc, ref);
  coverLogo(doc, ML+22, 105);

  doc.setFont("helvetica","bold"); doc.setFontSize(22); doc.setCharSpace(6);
  doc.setTextColor(BLACK[0],BLACK[1],BLACK[2]);
  doc.text("HAWKEYE  ·  STERLING", PW/2, 147, {align:"center"});
  doc.setCharSpace(0);

  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setCharSpace(2);
  doc.setTextColor(GRAY_D[0],GRAY_D[1],GRAY_D[2]);
  doc.text("MLRO ADVISOR  —  MULTI-MODAL AI", PW/2, 163, {align:"center"});
  doc.setCharSpace(0);

  doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setCharSpace(0.5);
  doc.setTextColor(GRAY_D[0],GRAY_D[1],GRAY_D[2]);
  doc.text(ref, PW-MR, 147, {align:"right"}); doc.setCharSpace(0);

  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setCharSpace(2.5);
  doc.setTextColor(GRAY_M[0],GRAY_M[1],GRAY_M[2]);
  doc.text("DOCUMENT TYPE", PW/2, 210, {align:"center"}); doc.setCharSpace(0);

  dropCapTitle(doc, "M", "LRO Advisor Evidence Pack", 250);

  doc.setFont("helvetica","normal"); doc.setFontSize(8.5);
  doc.setTextColor(GRAY_D[0],GRAY_D[1],GRAY_D[2]);
  const desc = "Reasoning trail and classifier evidence supporting the advisor's verdict. Hash-chained for tamper-evident review under UAE FDL 10/2025 Art.14 and FATF R.20.";
  doc.text(doc.splitTextToSize(desc, 380), PW/2, 272, {align:"center"});

  const modeStr = entry.mode.replace(/_/g," · ").toUpperCase();
  twoCards(doc, 308,
    { label:"ADVISOR SESSION", title:entry.question.slice(0,50), tags:`${modeStr}  ·  ${ref}  ·  ${entry.elapsedMs.toLocaleString()} MS` },
    { label:"VERDICT", value:verdict, sub:entry.guidance?.slice(0,80) }
  );

  metaGrid(doc, 568, [
    { label:"DATE / TIME",     value:dt.date,        sub:dt.time },
    { label:"ENGINE",          value:engineModel,     sub:"Advisor Model" },
    { label:"EXECUTOR",        value:execModel,       sub:"Tool-calling" },
    { label:"OFFICER",         value:"L. Fernanda",   sub:"CO/MLRO" },
    { label:"INTEGRITY HASH",  value:hashShort,       sub:"HMAC-Verified" },
    { label:"RETENTION",       value:"10 years",      sub:"FDL 10/2025" },
  ]);
  coverFooter(doc);

  // ── CONTENT PAGE(S) ────────────────────────────────────────────────────────
  doc.addPage();
  let y = CONTENT_Y;

  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(BLACK[0],BLACK[1],BLACK[2]);
  doc.text("MLRO Advisor Evidence Pack", ML, y); y+=18;
  y = verdictBadge(doc, verdict, y);

  // Part 1 — Session details
  y = guard(doc, y, 50); y = partHeader(doc,"PART ONE","01","Session details",y);
  y = kvRows(doc, [
    ["QUESTION",      entry.question],
    ["MODE",          entry.mode.replace(/_/g," · ")],
    ["VERDICT",       verdict+(entry.guidance ? "  —  "+entry.guidance.slice(0,60) : "")],
    ["ELAPSED",       entry.elapsedMs.toLocaleString()+" ms"],
    ["DATE / TIME",   dt.date+"  ·  "+dt.time],
    ...(entry.charterIntegrityHash ? [["INTEGRITY HASH", entry.charterIntegrityHash+" (HMAC-verified)"] as [string,string]] : []),
  ], y);

  // Part 2 — Narrative
  if (entry.narrative) {
    y = guard(doc, y, 80); y = partHeader(doc,"PART TWO","02","Narrative",y);
    y = dropCapPara(doc, entry.narrative, y);
  }

  // Part 3 — Reasoning trail
  if (entry.reasoningTrail && entry.reasoningTrail.length > 0) {
    y = guard(doc, y, 80); y = partHeader(doc,"PART THREE","03","Reasoning trail",y);
    autoTable(doc, {
      startY: y,
      head: [["STEP","ACTOR","MODEL","SUMMARY"]],
      body: entry.reasoningTrail.map(s => [
        String(s.stepNo),
        s.actor.charAt(0).toUpperCase()+s.actor.slice(1),
        s.modelId,
        s.summary || s.body.slice(0,80),
      ]),
      margin: { left:ML, right:MR, top:CONTENT_Y },
      styles: { fontSize:8, cellPadding:4, overflow:"linebreak", textColor:[30,30,30] as [number,number,number] },
      headStyles: { fillColor:WHITE, textColor:BLACK, fontStyle:"bold", fontSize:7, lineWidth:0.3, lineColor:GRAY_L },
      bodyStyles: { lineWidth:0.3, lineColor:GRAY_L },
      columnStyles: { 0:{cellWidth:32}, 1:{cellWidth:60}, 2:{cellWidth:115}, 3:{cellWidth:CW-207} },
      theme:"plain",
    });
    y = (doc as unknown as ATDoc).lastAutoTable.finalY+16;
  }

  // Part 4 — Classifier hits
  const c = entry.classifier;
  if (c && (c.primaryTopic || c.fatfRecs?.length || c.redFlags?.length)) {
    y = guard(doc, y, 80); y = partHeader(doc,"PART FOUR","04","Classifier hits",y);
    const rows: Array<[string,string]> = [];
    if (c.primaryTopic)    rows.push(["PRIMARY TOPIC",        c.primaryTopic.replace(/_/g," ")]);
    if (c.fatfRecs?.length) rows.push(["FATF RECOMMENDATIONS", c.fatfRecs.map(r=>`R.${r.num} (${r.title})`).join("  ·  ")]);
    if (c.redFlags?.length) rows.push(["RED FLAGS",            c.redFlags.join("  ·  ")]);
    if (c.jurisdictions?.length) rows.push(["JURISDICTIONS",  c.jurisdictions.join("  ·  ")]);
    if (c.regimes?.length)  rows.push(["REGIMES",             c.regimes.join("  ·  ")]);
    y = kvRows(doc, rows, y, 150);
  }

  // Signature footer
  y = guard(doc, y, 90);
  const sigY = Math.max(y+20, BOTTOM_Y-60);
  sigFooter(doc, sigY, ref, [
    { name:"L. Fernanda",       role:"CO/MLRO  ·  REVIEWER",  id:"HS-MLRO-0428", date:dt.date },
    { name:"Advisor Model",     role:"CLAUDE-OPUS-4-7",        id:entry.charterIntegrityHash?.slice(0,20)??"—", extra:"AUTO-SIGNED" },
    { name:"Senior Management", role:"APPROVAL REQUIRED",      id:"—", date:"—" },
  ]);

  // Final pass: draw content page headers with correct page count
  const total = doc.getNumberOfPages()-1;
  for (let p=2; p<=doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    contentFrame(doc, ref, "FDL 10/2025 ART.14  ·  FATF R.1-40  ·  CBUAE","AML STANDARDS", p-1, total);
  }

  return doc.output("blob");
}

export function downloadEvidencePack(entry: EvidencePackEntry): void {
  void fetch("/api/evidence-pack-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry),
  }).then(async res => {
    if (!res.ok) return;
    const html = await res.text();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    if (!w) alert("Pop-up blocked — allow pop-ups to open the PDF report.");
  });
}
