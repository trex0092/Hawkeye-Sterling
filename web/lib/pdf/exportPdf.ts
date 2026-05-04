"use client";

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

const TONE_HEX: Record<string, string> = {
  red: "#c4185f",
  amber: "#b9650f",
  green: "#5e7752",
  neutral: "#3d5a7a",
};

const TONE_BG: Record<string, string> = {
  red: "rgba(196,24,95,0.08)",
  amber: "rgba(185,101,15,0.08)",
  green: "rgba(94,119,82,0.08)",
  neutral: "rgba(61,90,122,0.08)",
};

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSection(s: PdfSection, idx: number): string {
  switch (s.type) {
    case "header":
      return `<div class="hs-section-header">${escHtml(s.content ?? "")}</div>`;

    case "subheader":
      return `
        <div class="hs-subheader">
          <span class="hs-sub-num">${String(idx).padStart(2, "0")}</span>
          <span class="hs-sub-text">${escHtml(s.content ?? "")}</span>
        </div>`;

    case "paragraph":
      return `<p class="hs-para">${escHtml(s.content ?? "").replace(/\n/g, "<br>")}</p>`;

    case "divider":
      return `<div class="hs-rule"></div>`;

    case "badge": {
      const tone = s.tone ?? "neutral";
      const color = TONE_HEX[tone];
      const bg = TONE_BG[tone];
      return `<div class="hs-badge" style="color:${color};background:${bg};border-color:${color}">${escHtml(s.content ?? "")}</div>`;
    }

    case "keyvalue":
      return `
        <div class="hs-kv-grid">
          ${(s.pairs ?? []).map((p) => `
            <div class="hs-kv-row">
              <span class="hs-kv-label">${escHtml(p.label)}</span>
              <span class="hs-kv-value">${escHtml(String(p.value))}</span>
            </div>`).join("")}
        </div>`;

    case "table":
      if (!s.rows || !s.columns) return "";
      return `
        <div class="hs-table-wrap">
          <table class="hs-table">
            <thead>
              <tr>${s.columns.map((c) => `<th>${escHtml(c)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${s.rows.map((row) => `<tr>${row.map((cell) => `<td>${escHtml(cell)}</td>`).join("")}</tr>`).join("")}
            </tbody>
          </table>
        </div>`;

    default:
      return "";
  }
}

function buildHtml(options: PdfExportOptions): string {
  const now = new Date();
  const dateStr = now.toLocaleString("en-GB", { timeZone: "Asia/Dubai", hour12: false }) + " GST";
  const institution = options.institution ?? "Hawkeye Sterling DPMS";

  let sectionIdx = 0;
  const bodyHtml = options.sections
    .map((s) => {
      if (s.type === "subheader") sectionIdx++;
      return renderSection(s, sectionIdx);
    })
    .join("\n");

  const classificationLabel = options.confidential ? "CONFIDENTIAL" : "INTERNAL";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(options.title)} — Hawkeye Sterling</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --paper:   #f6f1e6;
    --paper-2: #efe9da;
    --ink:     #1a1614;
    --ink-2:   #4a443e;
    --ink-3:   #8a8478;
    --pink:    #d61e6f;
    --pink-2:  #a01250;
    --hair:    rgba(26,22,20,0.15);
    --serif:   'Cormorant Garamond', Georgia, serif;
    --sans:    'Inter', 'Helvetica Neue', sans-serif;
    --mono:    'JetBrains Mono', 'IBM Plex Mono', monospace;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    background: var(--paper-2);
    font-family: var(--serif);
    color: var(--ink);
  }

  /* ── Screen wrapper ── */
  .hs-sheet {
    width: 794px;
    min-height: 1123px;
    background: var(--paper);
    margin: 40px auto;
    box-shadow: 0 0 0 1px rgba(26,22,20,0.08), 0 30px 60px -30px rgba(0,0,0,0.22);
    padding: 64px 56px 72px;
    position: relative;
  }

  /* ── Cover header ── */
  .hs-cover-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 40px;
    padding-bottom: 22px;
    border-bottom: 0.5px solid var(--hair);
  }
  .hs-lockup-name {
    font-family: var(--serif);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--ink);
    line-height: 1.2;
  }
  .hs-lockup-tag {
    font-family: var(--sans);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-top: 3px;
  }
  .hs-class-stamp {
    border: 1px solid var(--pink);
    padding: 6px 12px;
    transform: rotate(-2deg);
    background: rgba(214,30,111,0.06);
    text-align: center;
  }
  .hs-class-stamp-label {
    font-family: var(--sans);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--pink);
  }
  .hs-class-stamp-sub {
    font-family: var(--sans);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-top: 2px;
  }

  /* ── Cover title ── */
  .hs-cover-title {
    margin-bottom: 28px;
  }
  .hs-cover-title h1 {
    font-family: var(--serif);
    font-size: 42px;
    font-weight: 400;
    font-style: italic;
    letter-spacing: -0.01em;
    line-height: 1.05;
    color: var(--ink);
  }
  .hs-cover-title h1 .hs-dropcap {
    color: var(--pink);
    font-size: 56px;
    line-height: 0.85;
    vertical-align: -0.05em;
    margin-right: 1px;
  }
  .hs-cover-title p {
    font-family: var(--sans);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.01em;
    color: var(--ink-2);
    margin-top: 10px;
    max-width: 440px;
    line-height: 1.5;
  }

  /* ── Meta strip ── */
  .hs-meta-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0 18px;
    margin-bottom: 32px;
    padding-bottom: 22px;
    border-bottom: 0.5px solid var(--hair);
  }
  .hs-meta-item {
    border-left: 0.5px solid var(--hair);
    padding-left: 12px;
  }
  .hs-meta-value {
    font-family: var(--serif);
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    line-height: 1.3;
  }
  .hs-meta-label {
    font-family: var(--sans);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-top: 3px;
  }

  /* ── Double rule ── */
  .hs-doublerule {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 24px 0;
  }
  .hs-doublerule span {
    display: block;
    height: 0.5px;
    background: var(--ink);
  }
  .hs-doublerule span:last-child {
    height: 1.5px;
  }

  /* ── Section header ── */
  .hs-section-header {
    font-family: var(--serif);
    font-size: 26px;
    font-weight: 500;
    font-style: italic;
    color: var(--ink);
    letter-spacing: -0.01em;
    margin: 28px 0 16px;
    padding-bottom: 10px;
    border-bottom: 0.5px solid var(--hair);
  }

  /* ── Subheader ── */
  .hs-subheader {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin: 22px 0 10px;
  }
  .hs-sub-num {
    font-family: var(--serif);
    font-size: 34px;
    font-weight: 500;
    font-style: italic;
    color: var(--pink);
    line-height: 1;
    min-width: 36px;
  }
  .hs-sub-text {
    font-family: var(--sans);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--ink-2);
  }

  /* ── Paragraph ── */
  .hs-para {
    font-family: var(--serif);
    font-size: 13.5px;
    font-weight: 400;
    line-height: 1.6;
    color: var(--ink-2);
    margin: 0 0 10px;
    max-width: 600px;
  }

  /* ── Divider ── */
  .hs-rule {
    height: 0.5px;
    background: var(--hair);
    margin: 18px 0;
  }

  /* ── Badge ── */
  .hs-badge {
    display: inline-block;
    font-family: var(--sans);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    padding: 5px 12px;
    border: 1px solid;
    border-radius: 2px;
    margin: 8px 0 14px;
  }

  /* ── Key-value grid ── */
  .hs-kv-grid {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 10px 0 14px;
    border: 0.5px solid var(--hair);
  }
  .hs-kv-row {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 0;
    border-bottom: 0.5px solid var(--hair);
  }
  .hs-kv-row:last-child { border-bottom: none; }
  .hs-kv-label {
    font-family: var(--sans);
    font-size: 8.5px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding: 10px 14px 10px 16px;
    border-right: 0.5px solid var(--hair);
    background: rgba(26,22,20,0.02);
  }
  .hs-kv-value {
    font-family: var(--serif);
    font-size: 13px;
    font-weight: 400;
    color: var(--ink);
    padding: 8px 14px;
    line-height: 1.5;
  }

  /* ── Table ── */
  .hs-table-wrap {
    overflow-x: auto;
    margin: 10px 0 14px;
  }
  .hs-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--sans);
    font-size: 9px;
  }
  .hs-table thead tr {
    background: rgba(26,22,20,0.05);
  }
  .hs-table th {
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding: 8px 10px;
    border: 0.5px solid var(--hair);
    text-align: left;
    white-space: nowrap;
  }
  .hs-table td {
    padding: 7px 10px;
    border: 0.5px solid var(--hair);
    color: var(--ink-2);
    line-height: 1.4;
    vertical-align: top;
  }
  .hs-table tbody tr:nth-child(even) td {
    background: rgba(26,22,20,0.015);
  }

  /* ── Footer ── */
  .hs-doc-footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 0.5px solid var(--hair);
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .hs-footer-left {
    font-family: var(--sans);
    font-size: 7.5px;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--ink-3);
    line-height: 1.6;
  }
  .hs-footer-right {
    font-family: var(--mono);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    text-align: right;
    line-height: 1.6;
  }

  /* ── Print ── */
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { background: white !important; margin: 0 !important; }
    .hs-sheet {
      width: 100%;
      min-height: auto;
      margin: 0;
      box-shadow: none;
      padding: 18mm 16mm 20mm;
    }
    .hs-subheader, .hs-kv-grid, .hs-table-wrap, .hs-para { break-inside: avoid; }
    .hs-table tr { break-inside: avoid; }
  }
  @page { size: A4 portrait; margin: 12mm; }
</style>
</head>
<body>
<div class="hs-sheet">

  <!-- Cover header -->
  <div class="hs-cover-header">
    <div>
      <div class="hs-lockup-name">Hawkeye Sterling</div>
      <div class="hs-lockup-tag">AML Compliance Platform · UAE</div>
    </div>
    <div class="hs-class-stamp">
      <div class="hs-class-stamp-label">${escHtml(classificationLabel)}</div>
      <div class="hs-class-stamp-sub">MLRO USE ONLY</div>
    </div>
  </div>

  <!-- Title -->
  <div class="hs-cover-title">
    <h1><span class="hs-dropcap">${escHtml(options.title.charAt(0))}</span>${escHtml(options.title.slice(1))}</h1>
    ${options.subtitle ? `<p>${escHtml(options.subtitle)}</p>` : ""}
  </div>

  <!-- Meta strip -->
  <div class="hs-meta-strip">
    <div class="hs-meta-item">
      <div class="hs-meta-value">${escHtml(institution)}</div>
      <div class="hs-meta-label">Institution</div>
    </div>
    <div class="hs-meta-item">
      <div class="hs-meta-value">${escHtml(options.reportRef)}</div>
      <div class="hs-meta-label">Report Reference</div>
    </div>
    <div class="hs-meta-item">
      <div class="hs-meta-value">${escHtml(dateStr)}</div>
      <div class="hs-meta-label">Generated</div>
    </div>
  </div>

  <div class="hs-doublerule"><span></span><span></span></div>

  <!-- Body sections -->
  ${bodyHtml}

  <!-- Document footer -->
  <div class="hs-doc-footer">
    <div class="hs-footer-left">
      ${options.moduleName ? `${escHtml(options.moduleName)}<br>` : ""}
      ${options.regulatoryBasis ? escHtml(options.regulatoryBasis) : ""}
    </div>
    <div class="hs-footer-right">
      ${escHtml(options.reportRef)}<br>
      Hawkeye Sterling · Precision Screening · UAE
    </div>
  </div>

</div>
</body>
</html>`;
}

export function exportToPdf(options: PdfExportOptions): void {
  const html = buildHtml(options);
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) {
    alert("Pop-up blocked — please allow pop-ups for this site and try again.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.addEventListener("load", () => {
    w.focus();
    // Small delay lets Google Fonts finish loading before the print dialog opens.
    setTimeout(() => w.print(), 800);
  });
}
