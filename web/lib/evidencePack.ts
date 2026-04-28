// Client-side evidence-pack PDF builder. Renders a regulator-facing audit
// document for an MLRO Advisor verdict — question, mode, verdict, narrative,
// reasoning trail, classifier hits, and the charter-integrity hash that
// proves which build produced the answer. Uses jsPDF + jspdf-autotable
// which are already in web deps; no server round-trip, so Netlify function
// timeouts never apply.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
}

const MARGIN = 40;
const PAGE_WIDTH = 595; // A4 portrait, points
const TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

export function renderAdvisorEvidencePack(entry: EvidencePackEntry): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("MLRO Advisor — Evidence Pack", MARGIN, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    `Generated ${new Date().toISOString()} · Hawkeye-Sterling`,
    MARGIN,
    y,
  );
  y += 8;
  if (entry.charterIntegrityHash) {
    doc.text(`Charter integrity: ${entry.charterIntegrityHash}`, MARGIN, y);
    y += 14;
  } else {
    y += 6;
  }
  doc.setTextColor(0);

  autoTable(doc, {
    startY: y,
    head: [["Field", "Value"]],
    body: [
      ["Question", entry.question],
      ["Asked at", entry.askedAt],
      ["Mode", entry.mode],
      ["Verdict", entry.verdict.replace(/_/g, " ")],
      ["Elapsed", `${entry.elapsedMs} ms${entry.partial ? " · partial" : ""}`],
    ],
    styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    columnStyles: { 0: { cellWidth: 90, fontStyle: "bold" }, 1: { cellWidth: TEXT_WIDTH - 90 } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  if (entry.charterIssues && entry.charterIssues.length > 0) {
    y = sectionHeader(doc, "Charter issues", y);
    for (const issue of entry.charterIssues) {
      y = wrappedText(doc, `• ${issue}`, y, { color: [180, 60, 0] });
    }
    y += 6;
  }

  if (entry.guidance) {
    y = sectionHeader(doc, "Guidance", y);
    y = wrappedText(doc, entry.guidance, y);
    y += 6;
  }

  if (entry.narrative) {
    y = sectionHeader(doc, "Regulator-facing narrative", y);
    y = wrappedText(doc, entry.narrative, y);
    y += 6;
  }

  const c = entry.classifier;
  if (c && (c.primaryTopic || c.jurisdictions?.length || c.regimes?.length || c.fatfRecs?.length)) {
    y = sectionHeader(doc, "Brain classifier", y);
    const rows: string[][] = [];
    if (c.primaryTopic) rows.push(["Primary topic", c.primaryTopic.replace(/_/g, " ")]);
    if (c.jurisdictions?.length) rows.push(["Jurisdictions", c.jurisdictions.join(", ")]);
    if (c.regimes?.length) rows.push(["Regimes", c.regimes.join(", ")]);
    if (c.doctrines?.length) rows.push(["Doctrines", c.doctrines.join(", ")]);
    if (c.typologies?.length) rows.push(["Typologies", c.typologies.join(", ")]);
    if (c.redFlags?.length) rows.push(["Red flags", c.redFlags.join(", ")]);
    autoTable(doc, {
      startY: y,
      body: rows,
      styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 110, fontStyle: "bold" }, 1: { cellWidth: TEXT_WIDTH - 110 } },
      margin: { left: MARGIN, right: MARGIN },
      theme: "grid",
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

    if (c.fatfRecs?.length) {
      y = sectionHeader(doc, "FATF Recommendations anchored", y);
      autoTable(doc, {
        startY: y,
        head: [["#", "Title", "Citation"]],
        body: c.fatfRecs.map((r) => [`R.${r.num}`, r.title, r.citation]),
        styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [200, 140, 0], textColor: 255 },
        columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 280 }, 2: { cellWidth: TEXT_WIDTH - 330 } },
        margin: { left: MARGIN, right: MARGIN },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    }

    if (c.commonSenseRules?.length) {
      y = sectionHeader(doc, "Common-sense rules applied", y);
      c.commonSenseRules.forEach((rule, i) => {
        y = wrappedText(doc, `${i + 1}. ${rule}`, y);
      });
      y += 6;
    }
  }

  if (entry.reasoningTrail && entry.reasoningTrail.length > 0) {
    y = sectionHeader(doc, "Reasoning trail", y);
    for (const step of entry.reasoningTrail) {
      const header = `Step ${step.stepNo} · ${step.actor.toUpperCase()} · ${step.modelId} · ${step.at}`;
      y = wrappedText(doc, header, y, { bold: true, color: [60, 60, 60] });
      if (step.summary) y = wrappedText(doc, step.summary, y);
      if (step.body) y = wrappedText(doc, step.body, y, { mono: true, fontSize: 8 });
      y += 4;
    }
  }

  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text(
    "This evidence pack was generated by Hawkeye-Sterling MLRO Advisor. The charter-integrity hash above identifies the build that produced this answer; regulators can use it to verify provenance.",
    MARGIN,
    820,
    { maxWidth: TEXT_WIDTH },
  );

  return doc.output("blob");
}

function sectionHeader(doc: jsPDF, title: string, y: number): number {
  if (y > 760) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(title, MARGIN, y);
  return y + 14;
}

function wrappedText(
  doc: jsPDF,
  text: string,
  y: number,
  opts: { bold?: boolean; color?: [number, number, number]; mono?: boolean; fontSize?: number } = {},
): number {
  doc.setFont(opts.mono ? "courier" : "helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(opts.fontSize ?? 9);
  doc.setTextColor(...(opts.color ?? [30, 30, 30]));
  const lines = doc.splitTextToSize(text, TEXT_WIDTH);
  for (const line of lines) {
    if (y > 800) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, MARGIN, y);
    y += (opts.fontSize ?? 9) + 3;
  }
  doc.setTextColor(0);
  return y;
}

export function downloadEvidencePack(entry: EvidencePackEntry): void {
  const blob = renderAdvisorEvidencePack(entry);
  const url = URL.createObjectURL(blob);
  const safe = entry.question
    .slice(0, 48)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "advisor";
  const a = document.createElement("a");
  a.href = url;
  a.download = `mlro-evidence-${safe}-${Date.now()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
