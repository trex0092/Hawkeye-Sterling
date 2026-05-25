// Generates a tamper-evident audit trail PDF using pdf-lib.
// Returns a Uint8Array (PDF bytes) suitable for a Response body.
//
// Layout: A4 portrait, monospace Courier font, two-column header,
// per-entry table, HMAC validity badge, footer with page numbers.

import { PDFDocument, rgb, StandardFonts, type RGB } from "pdf-lib";

interface AuditEntry {
  sequence?: number;
  id: string;
  at: string;
  actor?: { name?: string; role?: string } | string;
  action?: string;
  target?: string;
  valid: boolean | null;
}

interface AuditPdfOptions {
  entries: AuditEntry[];
  exportedAt: string;
  totalEntries: number;
  chainValid: boolean;
  secretConfigured: boolean;
  invalidCount: number;
}

const MARGIN = 40;
const PAGE_W = 595.28; // A4 width in points
const PAGE_H = 841.89; // A4 height in points
const BODY_W = PAGE_W - MARGIN * 2;
const LINE_H = 13;
const SECTION_GAP = 6;
const HEADER_BG: RGB = rgb(0.09, 0.09, 0.12);
const VALID_GREEN: RGB = rgb(0.18, 0.65, 0.39);
const INVALID_RED: RGB = rgb(0.85, 0.25, 0.25);
const WARN_AMBER: RGB = rgb(0.95, 0.65, 0.1);
const BODY_TEXT: RGB = rgb(0.15, 0.15, 0.15);
const MUTED: RGB = rgb(0.45, 0.45, 0.5);
const DIVIDER: RGB = rgb(0.82, 0.82, 0.87);

export async function generateAuditPdf(opts: AuditPdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Hawkeye Sterling — Audit Trail Export");
  doc.setAuthor("Hawkeye Sterling Compliance Platform");
  doc.setSubject(`Audit export ${opts.exportedAt.slice(0, 10)}`);
  doc.setCreator("Hawkeye Sterling /api/audit/view");

  const mono = await doc.embedFont(StandardFonts.Courier);
  const monoBold = await doc.embedFont(StandardFonts.CourierBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPage(): void {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    drawPageHeader();
  }

  function ensureSpace(needed: number): void {
    if (y - needed < MARGIN + 20) newPage();
  }

  function drawPageHeader(): void {
    page.drawRectangle({ x: 0, y: PAGE_H - 36, width: PAGE_W, height: 36, color: HEADER_BG });
    page.drawText("HAWKEYE STERLING — AUDIT TRAIL", {
      x: MARGIN, y: PAGE_H - 24, size: 10, font: sansBold, color: rgb(1, 1, 1),
    });
    const pagesLabel = `Page ${doc.getPageCount()}`;
    page.drawText(pagesLabel, {
      x: PAGE_W - MARGIN - sans.widthOfTextAtSize(pagesLabel, 8),
      y: PAGE_H - 24, size: 8, font: sans, color: rgb(0.7, 0.7, 0.7),
    });
  }

  function drawText(text: string, size: number, font = sans, color = BODY_TEXT, indent = 0): void {
    page.drawText(text.slice(0, 120), { x: MARGIN + indent, y, size, font, color });
    y -= LINE_H;
  }

  function drawDivider(): void {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: DIVIDER });
    y -= SECTION_GAP;
  }

  function drawKv(label: string, value: string, labelW = 70): void {
    page.drawText(label, { x: MARGIN, y, size: 7.5, font: monoBold, color: MUTED });
    page.drawText(value.slice(0, 90), { x: MARGIN + labelW, y, size: 7.5, font: mono, color: BODY_TEXT });
    y -= LINE_H;
  }

  // ── Cover header ────────────────────────────────────────────────────────────
  drawPageHeader();
  y = PAGE_H - MARGIN - 20;

  drawText("AUDIT TRAIL EXPORT", 14, sansBold, BODY_TEXT);
  y -= 4;
  drawText(`Exported: ${opts.exportedAt}`, 8, mono, MUTED);
  drawText(`Total entries: ${opts.totalEntries}  |  Shown: ${opts.entries.length}  |  Invalid signatures: ${opts.invalidCount}`, 8, mono, MUTED);

  const chainStatus = opts.chainValid ? "CHAIN VALID ✓" : opts.invalidCount > 0 ? "CHAIN INVALID ⚠" : "NOT VERIFIED";
  const chainColor = opts.chainValid ? VALID_GREEN : opts.invalidCount > 0 ? INVALID_RED : WARN_AMBER;
  page.drawRectangle({ x: MARGIN, y: y + LINE_H - 2, width: BODY_W, height: LINE_H + 4, color: opts.chainValid ? rgb(0.9, 1, 0.93) : opts.invalidCount > 0 ? rgb(1, 0.93, 0.93) : rgb(1, 0.97, 0.87) });
  drawText(chainStatus, 8.5, monoBold, chainColor);

  y -= SECTION_GAP;
  drawDivider();

  // ── Entries ──────────────────────────────────────────────────────────────────
  for (const entry of opts.entries) {
    ensureSpace(LINE_H * 6 + SECTION_GAP * 2);

    const seqLabel = entry.sequence !== undefined ? `#${entry.sequence}` : "#?";
    const validBadge = entry.valid === true ? " [VALID]" : entry.valid === false ? " [INVALID ⚠]" : "";
    const validColor: RGB = entry.valid === true ? VALID_GREEN : entry.valid === false ? INVALID_RED : MUTED;

    // Entry header row
    page.drawText(`${seqLabel}  ${entry.at}`, { x: MARGIN, y, size: 8, font: monoBold, color: BODY_TEXT });
    if (validBadge) {
      const badgeX = MARGIN + monoBold.widthOfTextAtSize(`${seqLabel}  ${entry.at}`, 8) + 6;
      page.drawText(validBadge, { x: badgeX, y, size: 8, font: monoBold, color: validColor });
    }
    y -= LINE_H;

    const actorStr = typeof entry.actor === "string" ? entry.actor
      : entry.actor?.name ?? entry.actor?.role ?? "system";
    drawKv("ID:",     entry.id);
    drawKv("Actor:",  actorStr);
    drawKv("Action:", entry.action ?? "—");
    if (entry.target) drawKv("Target:", entry.target);

    y -= SECTION_GAP / 2;
    drawDivider();
  }

  // ── Footer ────────────────────────────────────────────────────────────────────
  const footerY = MARGIN / 2;
  for (let i = 0; i < doc.getPageCount(); i++) {
    const p = doc.getPage(i);
    p.drawText(`Hawkeye Sterling — Confidential — ${opts.exportedAt.slice(0, 10)}  |  Page ${i + 1} of ${doc.getPageCount()}`, {
      x: MARGIN, y: footerY, size: 7, font: sans, color: MUTED,
    });
  }

  return doc.save();
}
