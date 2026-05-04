"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfSection {
  type: "header" | "subheader" | "paragraph" | "table" | "keyvalue" | "divider" | "badge";
  content?: string;
  rows?: string[][];
  columns?: string[];
  pairs?: Array<{ label: string; value: string; tone?: "red" | "amber" | "green" | "neutral" }>;
  tone?: "red" | "amber" | "green" | "neutral";
}

export interface PdfExportOptions {
  title: string;
  subtitle?: string;
  moduleName: string;
  reportRef: string;
  generatedBy?: string;
  institution?: string;
  regulatoryBasis?: string;
  sections: PdfSection[];
  confidential?: boolean;
}

export function exportToPdf(options: PdfExportOptions): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Header band
  doc.setFillColor(15, 15, 20); // dark bg
  doc.rect(0, 0, 210, 28, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(options.title, 14, 12);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text(`${options.moduleName} · ${options.institution ?? "Hawkeye Sterling DPMS"}`, 14, 20);

  // Confidential stamp if needed
  if (options.confidential) {
    doc.setTextColor(220, 50, 50);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("CONFIDENTIAL — MLRO USE ONLY", 210 - 14, 20, { align: "right" });
  }

  // Metadata bar
  doc.setFillColor(30, 30, 35);
  doc.rect(0, 28, 210, 10, "F");
  doc.setTextColor(140, 140, 150);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  const meta = [
    `Ref: ${options.reportRef}`,
    `Generated: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })} GST`,
    options.generatedBy ? `By: ${options.generatedBy}` : "",
  ].filter(Boolean).join("   |   ");
  doc.text(meta, 14, 34.5);

  let y = 46;

  // Render sections
  for (const section of options.sections) {
    if (y > 265) { doc.addPage(); y = 20; }

    if (section.type === "header") {
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 40);
      doc.text(section.content ?? "", 14, y);
      y += 7;
    } else if (section.type === "subheader") {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 100);
      doc.text((section.content ?? "").toUpperCase(), 14, y);
      doc.setDrawColor(200, 200, 210);
      doc.line(14, y + 1.5, 196, y + 1.5);
      y += 7;
    } else if (section.type === "paragraph") {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 60);
      const lines = doc.splitTextToSize(section.content ?? "", 182);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 3;
    } else if (section.type === "divider") {
      doc.setDrawColor(220, 220, 230);
      doc.line(14, y, 196, y);
      y += 5;
    } else if (section.type === "badge") {
      const colors: Record<string, [number, number, number]> = {
        red: [220, 50, 50], amber: [245, 158, 11], green: [34, 197, 94], neutral: [100, 100, 120],
      };
      const rgb = colors[section.tone ?? "neutral"] ?? ([100, 100, 120] as [number, number, number]);
      const [r, g, b] = rgb;
      doc.setFillColor(r, g, b);
      doc.roundedRect(14, y - 4, 40, 7, 1.5, 1.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text((section.content ?? "").toUpperCase(), 34, y, { align: "center" });
      doc.setTextColor(50, 50, 60);
      y += 9;
    } else if (section.type === "keyvalue") {
      for (const pair of section.pairs ?? []) {
        if (y > 265) { doc.addPage(); y = 20; }
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80, 80, 100);
        doc.text(pair.label, 14, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 40);
        const valLines = doc.splitTextToSize(String(pair.value), 130);
        doc.text(valLines, 70, y);
        y += valLines.length * 5 + 1;
      }
      y += 3;
    } else if (section.type === "table" && section.rows && section.columns) {
      autoTable(doc, {
        startY: y,
        head: [section.columns],
        body: section.rows,
        margin: { left: 14, right: 14 },
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [30, 30, 40], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 248, 252] },
        didDrawPage: () => { y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5; },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(245, 245, 248);
    doc.rect(0, 284, 210, 13, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 140);
    doc.text("This document is confidential and intended solely for regulatory compliance purposes.", 14, 289.5);
    if (options.regulatoryBasis) {
      doc.text(options.regulatoryBasis, 14, 293.5);
    }
    doc.text(`Page ${i} of ${pageCount}`, 196, 291.5, { align: "right" });
  }

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  doc.save(`${options.reportRef}-${dd}-${mm}-${yyyy}.pdf`);
}
