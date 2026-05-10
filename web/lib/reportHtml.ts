// Hawkeye Sterling — shared HTML report generator.
// All 8 PDF reports use this design system (reference: Google Drive design files).

export function escHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const REPORT_CSS = `
/* Hawkeye Sterling — Report design system
   Aesthetic: editorial luxury · audit-grade typography · A4 portrait
   Source: Drive design reference (2026-05-05)
*/
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --paper: oklch(97.5% 0.008 85);
  --paper-edge: oklch(94% 0.012 80);
  --ink: oklch(22% 0.012 250);
  --ink-2: oklch(38% 0.012 250);
  --ink-3: oklch(55% 0.012 250);
  --hair: oklch(22% 0.012 250 / 0.18);
  --hair-2: oklch(22% 0.012 250 / 0.08);
  --brass: #d61e6f;
  --brass-2: #a01250;
  --pink: #d61e6f;
  --pink-soft: rgba(214,30,111,0.08);
  --ember: #c4185f;
  --sage: oklch(45% 0.06 155);
  --amber: oklch(60% 0.11 70);
  --serif: 'Cormorant Garamond','GT Sectra',Georgia,serif;
  --sans: 'Inter Tight','Inter',system-ui,sans-serif;
  --mono: 'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
}

html,body{margin:0;padding:0;background:oklch(28% 0.012 250);font-family:var(--sans);color:var(--ink);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}

.hs-doc{display:flex;flex-direction:column;gap:28px;align-items:center;padding:28px}

/* Page */
.hs-page{width:794px;height:1123px;background:var(--paper);background-image:radial-gradient(ellipse at 20% 0%,oklch(99% 0.005 85 / 0.6),transparent 50%),radial-gradient(ellipse at 80% 100%,oklch(94% 0.014 80 / 0.5),transparent 55%);position:relative;box-shadow:0 0 0 1px oklch(22% 0.012 250 / 0.08),0 30px 60px -30px oklch(0% 0 0 / 0.4),0 60px 120px -40px oklch(0% 0 0 / 0.25);overflow:hidden;color:var(--ink)}
.hs-page::before,.hs-page::after{content:'';position:absolute;left:0;right:0;height:6px;background:linear-gradient(180deg,var(--paper-edge),transparent);pointer-events:none}
.hs-page::before{top:0}
.hs-page::after{bottom:0;transform:scaleY(-1)}

.hs-pg-body{position:absolute;top:62px;left:56px;right:56px;bottom:78px;display:flex;flex-direction:column;overflow:hidden}
.hs-pg-body>*:last-child{margin-bottom:0}
/* Print pagination — keep blocks together where it matters and allow
   long content to flow naturally onto a new sheet rather than clipping. */
@media print {
  .hs-page{height:auto;min-height:1123px;break-inside:avoid-page}
  .scr-sh,.hs-section-h{break-after:avoid;break-inside:avoid}
  .scr-rec,.scr-cbg,.scr-sigb,.scr-ag,.scr-sigs,.scr-table,.hs-finis-row{break-inside:avoid}
  ul,ol,table,.scr-regl{break-inside:auto}
  li,tr{break-inside:avoid}
}

/* Page header */
.hs-pgheader{position:absolute;top:22px;left:56px;right:56px;display:flex;justify-content:space-between;align-items:center;font-size:8.5px;letter-spacing:0.32em;text-transform:uppercase;color:var(--ink-2);border-bottom:0.5px solid var(--hair);padding-bottom:10px;font-weight:500}
.hs-pgheader-l{display:flex;gap:12px;align-items:center}
.hs-pgheader-r{display:flex;gap:14px;align-items:center}
.hs-wm{letter-spacing:0.45em;font-weight:600;color:var(--ink)}
.hs-pgheader-conf{color:var(--pink);letter-spacing:0.36em}
.hs-pgheader-r .hs-mono-s{font-size:9px;letter-spacing:0.08em;color:var(--ink-2)}

/* Page footer */
.hs-pgfooter{position:absolute;bottom:22px;left:56px;right:56px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;font-size:8px;letter-spacing:0.28em;text-transform:uppercase;color:var(--ink-3);border-top:0.5px solid var(--hair);padding-top:10px}
.hs-pgfooter-c{text-align:center}
.hs-pgfooter>div:last-child{text-align:right}
.hs-pg-num{font-family:var(--serif);font-size:14px;letter-spacing:0.04em;color:var(--ink);font-weight:500}
.hs-pg-sep,.hs-pg-tot{font-family:var(--serif);color:var(--ink-3);font-size:11px}

/* Microprint */
.hs-microprint{position:absolute;top:8px;left:18px;right:18px;font-family:var(--mono);font-size:3.6px;letter-spacing:0.05em;color:oklch(22% 0.012 250 / 0.45);white-space:nowrap;overflow:hidden;pointer-events:none;user-select:none;text-transform:uppercase}

/* Atoms */
.hs-sc{display:inline-block;font-size:8.5px;letter-spacing:0.28em;text-transform:uppercase;color:var(--ink-3);font-weight:500}
.hs-rule{height:0.5px;background:var(--hair);margin:16px 0}
.hs-doublerule{display:flex;flex-direction:column;gap:2px}
.hs-doublerule>div:first-child{height:0.5px;background:var(--ink)}
.hs-doublerule>div:last-child{height:1.5px;background:var(--ink)}
.hs-mono-s{font-family:var(--mono);font-size:9.5px;letter-spacing:0.04em}
.hs-mono-xs{font-family:var(--mono);font-size:8px;letter-spacing:0.02em;word-break:break-all}
.hs-dot{color:var(--ink-3);margin:0 6px}

/* Cover */
.hs-cover{display:flex;flex-direction:column;gap:22px;flex:1;padding-top:14px}
.hs-cover-top{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:22px}
.hs-cover-bureau{text-align:center;display:flex;flex-direction:column;gap:6px}
.hs-bureau-line{font-family:var(--serif);font-size:26px;letter-spacing:0.42em;font-weight:500;color:var(--ink);padding-left:0.42em}
.hs-bureau-est{font-size:8px;letter-spacing:0.32em;color:var(--ink-3);text-transform:uppercase}
.hs-cover-class{display:flex;justify-content:flex-end}
.hs-class-stamp{border:1px solid var(--pink);padding:8px 12px;text-align:center;transform:rotate(-2deg);background:var(--pink-soft)}
.hs-class-stamp-l{font-family:var(--serif);font-size:13px;letter-spacing:0.3em;color:var(--pink);font-weight:600}
.hs-class-stamp-s{font-size:6.5px;letter-spacing:0.32em;color:var(--pink);text-transform:uppercase;margin-top:2px}
.hs-cover-rule{height:1px;background:var(--ink);position:relative}
.hs-cover-rule::before,.hs-cover-rule::after{content:'';position:absolute;height:0.5px;background:var(--ink);left:0;right:0}
.hs-cover-rule::before{top:-3px}
.hs-cover-rule::after{top:3px}
.hs-cover-doctype{display:flex;flex-direction:column;gap:8px;text-align:center;margin:4px 0}
.hs-cover-title{font-family:var(--serif);font-size:36px;font-weight:400;letter-spacing:-0.01em;margin:4px 0 0 0;color:var(--ink);font-style:italic;line-height:1.1}
.hs-cover-title::first-letter{color:var(--pink);font-size:48px;padding-right:2px}
.hs-cover-sub{font-size:11px;color:var(--ink-2);max-width:480px;margin:4px auto 0;line-height:1.5;text-wrap:pretty}
.hs-cover-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-top:6px}
.hs-cover-subject{border:0.5px solid var(--hair);padding:18px 20px;display:flex;flex-direction:column;gap:6px;background:oklch(98% 0.005 85 / 0.4)}
.hs-subject-name{font-family:var(--serif);font-size:28px;letter-spacing:-0.01em;font-weight:500;line-height:1.05;color:var(--ink);margin-top:4px}
.hs-subject-meta{display:flex;align-items:center;flex-wrap:wrap;gap:0;font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:var(--ink-2);margin-top:6px}
.hs-cover-band{border:0.5px solid var(--hair);padding:16px 18px;background:oklch(98% 0.005 85 / 0.4)}
.hs-cover-band-row{display:flex;gap:14px;align-items:center;margin-top:6px}
.hs-cover-band-tx{display:flex;flex-direction:column;gap:4px}
.hs-cover-band-band{font-family:var(--serif);font-size:30px;font-weight:500;letter-spacing:0.04em;line-height:1}
.hs-cover-band-note{font-size:9.5px;color:var(--ink-2);line-height:1.4;max-width:18ch}
.hs-band-ember .hs-cover-band-band{color:var(--pink)}
.hs-band-sage .hs-cover-band-band{color:var(--sage)}
.hs-band-amber .hs-cover-band-band{color:var(--amber)}
.hs-cover-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:18px 32px;margin-top:4px}
.hs-cover-meta>div{display:flex;flex-direction:column;gap:4px;border-left:0.5px solid var(--hair);padding-left:12px}
.hs-cover-meta>div>div:nth-of-type(1){font-family:var(--serif);font-size:14px;font-weight:500;color:var(--ink)}
.hs-meta-sub{font-size:8.5px;letter-spacing:0.18em;text-transform:uppercase;color:var(--ink-3)}
.hs-cover-foot{margin-top:auto;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;padding-top:18px;border-top:0.5px solid var(--hair)}
.hs-cover-foot-l{font-size:9px;letter-spacing:0.06em;color:var(--ink-2);line-height:1.7;font-style:italic;font-family:var(--serif);max-width:60ch}
.hs-cover-foot-r{display:flex;flex-direction:column;align-items:center;gap:10px}
.hs-seal-row{display:flex;align-items:center;gap:10px;width:180px}
.hs-seal-line{flex:1;height:0.5px;background:var(--hair)}

/* Sections */
.hs-section{margin-bottom:18px;display:flex;flex-direction:column}
.hs-section-tight{margin-bottom:10px}
.hs-section-h{display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:end;border-bottom:0.5px solid var(--ink);padding-bottom:8px;margin-bottom:14px}
.hs-section-num{font-family:var(--serif);font-size:32px;font-weight:400;font-style:italic;color:var(--brass);line-height:1}
.hs-section-titles{display:flex;flex-direction:column;gap:3px}
.hs-section-titles h2{font-family:var(--serif);font-size:20px;font-weight:500;margin:0;letter-spacing:-0.005em;color:var(--ink)}

/* KV grid */
.hs-kvgrid{display:grid;grid-template-columns:max-content 1fr;column-gap:24px;row-gap:6px;margin-top:8px}
.hs-kv-k{font-family:var(--sans);font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:var(--ink-3);font-weight:600;padding-top:1px}
.hs-kv-v{font-size:11px;color:var(--ink);font-family:var(--serif)}

/* Narrative */
.hs-narrative{font-family:var(--serif);font-size:12.5px;line-height:1.65;color:var(--ink);margin:8px 0 0;text-align:justify;hyphens:auto}
.hs-narrative+.hs-narrative{margin-top:10px}
.hs-narrative-lead::first-letter{font-family:var(--serif);font-size:38px;line-height:0.9;font-weight:500;color:var(--pink);float:left;padding:4px 6px 0 0;font-style:italic}

/* Confidential note */
.hs-cnote{border-top:0.5px solid var(--hair);border-bottom:0.5px solid var(--hair);padding:8px 0;margin-top:14px;font-family:var(--serif);font-style:italic;font-size:10.5px;color:var(--ink-2);line-height:1.55}

/* Table */
.hs-table{width:100%;border-collapse:collapse;font-size:9.5px;margin-top:8px}
.hs-table thead th{text-align:left;font-family:var(--sans);font-size:8px;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;color:var(--ink-2);padding:8px 10px;border-top:0.5px solid var(--ink);border-bottom:0.5px solid var(--ink);background:oklch(98% 0.005 85 / 0.4)}
.hs-table tbody td{padding:7px 10px;border-bottom:0.5px solid var(--hair);vertical-align:top}
.hs-table tbody tr:nth-child(odd) td{background:oklch(96% 0.008 85 / 0.35)}
.hs-table .hs-mono-s{font-size:9px}
.hs-table-num{text-align:right;font-variant-numeric:tabular-nums}
.hs-table-c{text-align:center}

/* Pills */
.hs-pill{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:9px;letter-spacing:0.18em;text-transform:uppercase;padding:4px 10px;border:0.5px solid currentColor;border-radius:0}
.hs-pill-lg{font-size:11px;padding:6px 14px;letter-spacing:0.22em}
.hs-pill-dot{width:5px;height:5px;background:currentColor;border-radius:50%}
.hs-pill-ember{color:var(--pink);background:var(--pink-soft)}
.hs-pill-amber{color:var(--amber);background:oklch(60% 0.11 70 / 0.06)}
.hs-pill-sage{color:var(--sage);background:oklch(45% 0.06 155 / 0.06)}
.hs-pill-ink{color:var(--ink);background:oklch(20% 0 0 / 0.04)}

/* Severity */
.hs-sev{display:inline-flex;align-items:center;gap:6px;font-size:8.5px;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:3px 6px;border:0.5px solid currentColor}
.hs-sev-dot{width:5px;height:5px;background:currentColor;border-radius:50%}
.hs-sev-ember{color:var(--pink);background:var(--pink-soft)}
.hs-sev-amber{color:var(--amber)}
.hs-sev-sage{color:var(--sage)}
.hs-sev-ink{color:var(--ink-2)}

/* Score boxes */
.hs-scorebox{border:0.5px solid var(--hair);padding:12px 14px;display:flex;flex-direction:column;gap:4px;background:oklch(98% 0.005 85 / 0.4)}
.hs-scorebox-n{font-family:var(--serif);font-size:36px;font-weight:500;line-height:1;color:var(--ink)}
.hs-scorebox-n.is-ember{color:var(--pink)}
.hs-scorebox-n.is-amber{color:var(--amber)}
.hs-scorebox-n.is-sage{color:var(--sage)}
.hs-scorebox-l{font-family:var(--sans);font-size:7.5px;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.hs-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:10px 0 16px}

/* Findings + numbered list */
.hs-findings{display:flex;flex-direction:column;gap:8px;list-style:none;padding:0;margin:8px 0 0}
.hs-findings li{font-size:11px;line-height:1.55;padding-left:18px;position:relative;color:var(--ink)}
.hs-findings li::before{content:'';position:absolute;left:0;top:8px;width:8px;height:1px;background:var(--pink)}
.hs-numlist{list-style:none;padding:0;margin:8px 0 0;counter-reset:rec;display:flex;flex-direction:column;gap:10px}
.hs-numlist li{counter-increment:rec;position:relative;padding-left:28px;font-size:11px;line-height:1.55;color:var(--ink)}
.hs-numlist li::before{content:counter(rec,decimal-leading-zero);position:absolute;left:0;top:0;font-family:var(--serif);font-style:italic;font-size:16px;color:var(--pink);line-height:1}

/* Signature */
.hs-sigs{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:22px;margin-top:auto;padding-top:16px}
.hs-sig{display:flex;flex-direction:column;gap:4px}
.hs-sig-line{height:28px;border-bottom:0.5px solid var(--ink)}
.hs-sig-name{font-family:var(--serif);font-style:italic;font-size:13px;color:var(--ink);font-weight:500}
.hs-sig-lic{font-size:9px;color:var(--ink-2)}
.hs-sig-date{color:var(--ink-3)}

/* Finis */
.hs-finis{margin-top:14px}
.hs-finis-row{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center;margin-top:10px}
.hs-finis-row>.hs-sc:first-child{font-family:var(--serif);font-style:italic;text-transform:lowercase;letter-spacing:0.3em;font-size:11px;color:var(--ink)}
.hs-finis-mono{text-align:center;font-size:8px;letter-spacing:0.24em;text-transform:uppercase;color:var(--ink-3)}
.hs-finis-row>.hs-monogram-sm{justify-self:end}

/* Bar (EWRA) */
.hs-bar-track{display:inline-block;width:70px;height:6px;background:oklch(22% 0.012 250 / 0.08);position:relative;vertical-align:middle;margin-right:8px}
.hs-bar-fill{height:100%}

/* Print */
@media print{
  body{background:white!important;padding:0!important;margin:0}
  .hs-doc{gap:0;padding:0;display:block}
  .hs-page{box-shadow:none;break-after:page;margin:0 auto}
  .hs-no-print{display:none!important}
  @page{size:A4;margin:0}
}
`;

const MONOGRAM_SVG = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="19" stroke="oklch(22% 0.012 250)" stroke-width="0.8" fill="none"/>
  <text x="20" y="25" text-anchor="middle" font-family="Cormorant Garamond,Georgia,serif" font-size="13" font-weight="500" fill="oklch(22% 0.012 250)" letter-spacing="1">HS</text>
</svg>`;

const MONOGRAM_SM = `<svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="19" stroke="oklch(22% 0.012 250)" stroke-width="0.8" fill="none"/>
  <text x="20" y="25" text-anchor="middle" font-family="Cormorant Garamond,Georgia,serif" font-size="13" font-weight="500" fill="oklch(22% 0.012 250)" letter-spacing="1">HS</text>
</svg>`;

function microprint(reportId: string): string {
  const seg = `HAWKEYE STERLING · ${reportId} · CONFIDENTIAL · DO NOT REDISTRIBUTE · `;
  return seg.repeat(20);
}

export function hsPage(opts: {
  reportId: string;
  pageNum: number;
  pageTotal: number;
  regs: string;
  label: string;
  content: string;
}): string {
  const { reportId, pageNum, pageTotal, regs, label, content } = opts;
  return `
<div class="hs-page">
  <div class="hs-microprint">${microprint(reportId)}</div>
  <div class="hs-pgheader">
    <div class="hs-pgheader-l">
      <span class="hs-wm">HAWKEYE · STERLING</span>
      <span class="hs-sc">${label}</span>
    </div>
    <span class="hs-pgheader-conf hs-sc">CONFIDENTIAL · MLRO USE ONLY</span>
    <div class="hs-pgheader-r">
      <span class="hs-mono-s">${reportId}</span>
    </div>
  </div>
  <div class="hs-pg-body">
    ${content}
  </div>
  <div class="hs-pgfooter">
    <div>${regs}</div>
    <div class="hs-pgfooter-c">
      <span class="hs-pg-num">${String(pageNum).padStart(2,"0")}</span>
      <span class="hs-pg-sep"> / </span>
      <span class="hs-pg-tot">${String(pageTotal).padStart(2,"0")}</span>
    </div>
    <div>${label}</div>
  </div>
</div>`;
}

export interface CoverMeta { label: string; value: string; sub?: string }
export interface CoverData {
  reportId: string;
  regs: string;
  module?: string;
  title: string;
  subtitle: string;
  subjectLabel: string;
  subjectName: string;
  subjectMeta: string;
  verdictLabel: string;
  verdictBand: string;  // "ember" | "amber" | "sage"
  verdictNote: string;
  meta: CoverMeta[];   // exactly 6 items
  footerLegal?: string;
}

export function hsCover(d: CoverData): string {
  const metaHtml = d.meta.map(m => `
    <div>
      <div>${m.value}${m.sub ? `<br><span class="hs-meta-sub">${m.sub}</span>` : ""}</div>
      <div class="hs-meta-sub">${m.label}</div>
    </div>`).join("");

  const legal = d.footerLegal ?? `Issued in confidence to the addressee. Reproduction, transmission or storage outside the controlled domain of the recipient institution is prohibited under the terms of the engagement.`;

  return `
<div class="hs-cover">
  <div class="hs-cover-top">
    <div class="hs-monogram">${MONOGRAM_SVG}</div>
    <div class="hs-cover-bureau">
      <div class="hs-bureau-line">HAWKEYE  ·  STERLING</div>
      <div class="hs-bureau-est">${d.module ?? "STR WORKBENCH"}</div>
    </div>
    <div class="hs-cover-class">
      <div class="hs-class-stamp">
        <div class="hs-class-stamp-l">CONFIDENTIAL</div>
        <div class="hs-class-stamp-s">MLRO USE ONLY</div>
      </div>
    </div>
  </div>

  <div class="hs-cover-rule"></div>

  <div class="hs-cover-doctype">
    <div class="hs-sc">DOCUMENT TYPE</div>
    <h1 class="hs-cover-title">${d.title}</h1>
    <p class="hs-cover-sub">${d.subtitle}</p>
  </div>

  <div class="hs-cover-grid">
    <div class="hs-cover-subject">
      <div class="hs-sc">${d.subjectLabel}</div>
      <div class="hs-subject-name">${d.subjectName}</div>
      <div class="hs-subject-meta">${d.subjectMeta}</div>
    </div>
    <div class="hs-cover-band hs-band-${d.verdictBand}">
      <div class="hs-sc">VERDICT</div>
      <div class="hs-cover-band-row">
        <div class="hs-cover-band-tx">
          <div class="hs-cover-band-band">${d.verdictLabel}</div>
          <div class="hs-cover-band-note">${d.verdictNote}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="hs-cover-meta">${metaHtml}</div>

  <div class="hs-cover-foot">
    <div class="hs-cover-foot-l">${legal}</div>
    <div class="hs-cover-foot-r">
      <div class="hs-seal-row">
        <div class="hs-seal-line"></div>
        ${MONOGRAM_SM}
        <div class="hs-seal-line"></div>
      </div>
    </div>
  </div>
</div>`;
}

export function hsSection(opts: {
  num: string;
  kicker: string;
  title: string;
  content: string;
  tight?: boolean;
}): string {
  return `
<div class="hs-section${opts.tight ? " hs-section-tight" : ""}">
  <div class="hs-section-h">
    <div class="hs-section-num">${opts.num}</div>
    <div class="hs-section-titles">
      <span class="hs-sc">${opts.kicker}</span>
      <h2>${opts.title}</h2>
    </div>
  </div>
  ${opts.content}
</div>`;
}

export function hsPill(tone: "ember"|"amber"|"sage"|"ink", text: string, large = false): string {
  return `<span class="hs-pill hs-pill-${tone}${large ? " hs-pill-lg" : ""}"><span class="hs-pill-dot"></span>${text}</span>`;
}

export function hsKvGrid(rows: Array<{k: string; v: string}>): string {
  return `<div class="hs-kvgrid">${rows.map(r =>
    `<div class="hs-kv-k">${r.k}</div><div class="hs-kv-v">${r.v}</div>`
  ).join("")}</div>`;
}

export function hsNarrative(text: string, lead = false): string {
  return `<p class="hs-narrative${lead ? " hs-narrative-lead" : ""}">${escHtml(text)}</p>`;
}

export function hsTable(headers: string[], rows: string[][]): string {
  return `<table class="hs-table">
  <thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>
</table>`;
}

export function hsSeverityCell(s: string): string {
  const norm = s.toLowerCase();
  const tone =
    norm === "critical" || norm === "high" || norm === "edd required" || norm === "escalate" || norm === "hit" ? "ember" :
    norm === "medium" || norm === "amber" || norm === "review" ? "amber" :
    norm === "low" || norm === "clear" || norm === "pass" || norm === "sage" ? "sage" : "ink";
  return `<span class="hs-sev hs-sev-${tone}"><span class="hs-sev-dot"></span>${s}</span>`;
}

export function hsFindings(items: string[]): string {
  return `<ul class="hs-findings">${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
}

export function hsNumList(items: string[]): string {
  return `<ol class="hs-numlist">${items.map(i => `<li>${i}</li>`).join("")}</ol>`;
}

export function hsSignatureBlock(signers: Array<{name: string; role: string; lic: string; date: string}>): string {
  return `<div class="hs-sigs">${signers.map(s => `
  <div class="hs-sig">
    <div class="hs-sig-line"></div>
    <div class="hs-sig-name">${s.name}</div>
    <div class="hs-sc">${s.role}</div>
    <div class="hs-sig-lic">${s.lic}</div>
    <div class="hs-sig-lic hs-sig-date">${s.date}</div>
  </div>`).join("")}</div>`;
}

export function hsFinis(reportId: string, pageNum: number, pageTotal: number): string {
  return `<div class="hs-finis">
  <div class="hs-rule"></div>
  <div class="hs-finis-row">
    <span class="hs-sc" style="font-family:var(--serif);font-style:italic;text-transform:lowercase;letter-spacing:0.3em;font-size:11px;color:var(--ink)">finis</span>
    <div class="hs-finis-mono">${reportId} · END OF DOCUMENT · ${String(pageNum).padStart(2,"0")} of ${String(pageTotal).padStart(2,"0")}</div>
    <div class="hs-monogram-sm" style="justify-self:end">${MONOGRAM_SM}</div>
  </div>
</div>`;
}

export function hsScorebox(n: string, label: string, tone: "ember"|"amber"|"sage"|""): string {
  return `<div class="hs-scorebox">
  <div class="hs-scorebox-n${tone ? ` is-${tone}` : ""}">${n}</div>
  <div class="hs-scorebox-l">${label}</div>
</div>`;
}

export function hsBar(value: number, tone: "pink"|"amber"|"sage"|"ink" = "pink"): string {
  const colors: Record<string,string> = { pink:"var(--pink)", amber:"var(--amber)", sage:"var(--sage)", ink:"var(--ink-2)" };
  return `<span class="hs-bar-track"><span class="hs-bar-fill" style="width:${value}%;background:${colors[tone]??colors.pink}"></span></span><span class="hs-mono-s">${value}</span>`;
}

export function buildHtmlDoc(opts: {
  title: string;
  pages: string[];
  autoprint?: boolean;
}): string {
  const { title, pages, autoprint = true } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="hs-no-print" style="position:fixed;top:16px;right:16px;z-index:100;display:flex;gap:8px">
  <button onclick="window.print()" style="background:var(--ink,#141414);color:#fff;border:none;padding:10px 20px;font-family:var(--mono,'JetBrains Mono',monospace);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;cursor:pointer">⬇ Save as PDF</button>
</div>
<div class="hs-doc">
${pages.join("\n")}
</div>
${autoprint ? `<script>setTimeout(function(){window.print()},400)</script>` : ""}
</body>
</html>`;
}

export function nowMeta(): { dateStr: string; time: string } {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = d.getFullYear();
  const time = d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dubai"})+" GST";
  return { dateStr:`${dd}/${mm}/${yyyy}`, time };
}
