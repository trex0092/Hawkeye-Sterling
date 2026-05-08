// Hawkeye Sterling — SCR HTML renderer.
// Produces a pixel-faithful, self-contained HTML document matching the
// bureau's 14-section Screening Compliance Report design.

import type {
  ScreeningComplianceReport,
  SCRDisposition,
  SCRAdjudicatorFinding,
  SCRSectionFindingColour,
  SCRAdjudicationState,
  SCRStatutoryFilingRow,
  SCRAdverseMediaHit,
  SCRPepHit,
  SCRSanctionsHit,
} from './ScreeningComplianceReport.js';

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --brand:       #C8185A;
  --brand-light: #FAE8EF;
  --black:       #0F0F0F;
  --ink:         #1A1A1A;
  --ink2:        #2E2E2E;
  --muted:       #6B6B6B;
  --faint:       #9A9A9A;
  --rule:        #D8D4CE;
  --bg:          #FAFAF8;
  --chip-bg:     #EDE9E3;
  --green-bg:    #F0FDF4;
  --green-bdr:   #22C55E;
  --amber-bg:    #FFFBEB;
  --amber-bdr:   #F59E0B;
  --red-bg:      #FFF1F2;
  --red-bdr:     #E11D48;
  --neutral-bg:  #F5F5F5;
  --neutral-bdr: #AAAAAA;
  --badge-auto:  #D1FAE5;
  --badge-auto-text: #065F46;
  --badge-hr:    #DBEAFE;
  --badge-hr-text: #1E40AF;
  --badge-dec:   #EDE9FE;
  --badge-dec-text: #5B21B6;
  --badge-att:   #FEF3C7;
  --badge-att-text: #92400E;
  --badge-seal:  #F3F4F6;
  --badge-seal-text: #374151;
}

body {
  font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 9.5pt;
  color: var(--ink);
  background: var(--bg);
  line-height: 1.45;
}

/* ── Page wrapper ── */
.page {
  max-width: 900px;
  margin: 0 auto;
  background: #fff;
}

/* ── Cover header strip ── */
.cover-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 20px;
  border-bottom: 1px solid var(--rule);
  font-size: 7.5pt;
  font-family: 'Courier New', Courier, monospace;
  letter-spacing: 0.02em;
  color: var(--muted);
}
.cover-strip .bureau-name { font-weight: 600; color: var(--ink); }
.cover-strip .report-ref  { color: var(--muted); }
.cover-strip .confidential-badge {
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  font-size: 7pt;
}

/* ── Cover body ── */
.cover-body {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: 20px;
  padding: 20px 20px 0;
  align-items: start;
}

/* ── Document-of-record banner ── */
.doc-of-record {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin-bottom: 16px;
  font-family: 'Courier New', Courier, monospace;
}
.doc-of-record::before {
  content: '';
  display: inline-block;
  width: 8px; height: 8px;
  background: var(--brand);
}
.doc-of-record::after {
  content: '';
  display: inline-block;
  width: 6px; height: 6px;
  background: var(--brand);
  opacity: .5;
}

/* ── Main title ── */
.main-title {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 32pt;
  font-weight: 700;
  line-height: 1.1;
  color: var(--black);
  margin-bottom: 8px;
  letter-spacing: -0.01em;
}
.main-title em { font-style: italic; color: var(--brand); }
.cover-subtitle {
  font-size: 9pt;
  color: var(--ink2);
  line-height: 1.55;
  max-width: 460px;
  margin-bottom: 16px;
  font-style: italic;
}

/* ── Cover subject grid ── */
.cover-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  border: 1px solid var(--rule);
  margin-bottom: 0;
}
.cover-grid .cell {
  padding: 8px 10px;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.cover-grid .cell:nth-child(3n) { border-right: none; }
.cover-grid .cell:nth-last-child(-n+3) { border-bottom: none; }

/* ── Document control ── */
.doc-control {
  border: 1px solid var(--rule);
}
.doc-control .dc-title {
  background: var(--ink);
  color: #fff;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 5px 8px;
  font-family: 'Courier New', Courier, monospace;
}
.dc-row {
  display: flex;
  border-bottom: 1px solid var(--rule);
  font-size: 7.5pt;
}
.dc-row:last-child { border-bottom: none; }
.dc-row .dc-key {
  width: 80px;
  min-width: 80px;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-size: 6.5pt;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  padding: 3px 6px;
  text-transform: uppercase;
  border-right: 1px solid var(--rule);
}
.dc-row .dc-val {
  padding: 3px 6px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 7.5pt;
  color: var(--ink);
  word-break: break-all;
}

/* ── Regulatory basis bar ── */
.reg-basis-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 20px;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  margin-top: 0;
  background: #fff;
}
.reg-basis-bar .badges { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.reg-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--ink2);
  font-family: 'Courier New', Courier, monospace;
}
.reg-badge::before {
  content: '●';
  color: var(--brand);
  font-size: 7pt;
}
.reg-basis-bar .right-label {
  font-size: 6.5pt;
  font-family: 'Courier New', Courier, monospace;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

/* ── Contents block ── */
.contents-block {
  padding: 16px 20px;
  border-bottom: 1px solid var(--rule);
}
.contents-header {
  display: flex;
  justify-content: space-between;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  margin-bottom: 10px;
}
.contents-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 24px;
}
.contents-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 8.5pt;
  padding: 1px 0;
  border-bottom: 1px dotted var(--rule);
}
.contents-row .cnum {
  font-weight: 700;
  color: var(--brand);
  width: 20px;
  min-width: 20px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 8pt;
}
.contents-row .ctitle { flex: 1; color: var(--ink); }
.contents-row .cpage {
  font-family: 'Courier New', Courier, monospace;
  font-size: 7.5pt;
  color: var(--muted);
}

/* ── Section divider ── */
.section-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px 6px;
}
.section-chip {
  background: var(--chip-bg);
  color: var(--ink2);
  font-family: 'Courier New', Courier, monospace;
  font-weight: 700;
  font-size: 8.5pt;
  padding: 3px 8px;
  border-radius: 3px;
  min-width: 28px;
  text-align: center;
  letter-spacing: 0.02em;
}
.section-heading {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 17pt;
  font-weight: 700;
  color: var(--black);
  line-height: 1.2;
}
.section-heading em { font-style: italic; color: var(--brand); }

/* ── Authorities line ── */
.auth-line {
  padding: 3px 20px 8px;
  font-size: 7.5pt;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  border-bottom: 1px solid var(--rule);
}
.auth-line strong { color: var(--ink2); font-weight: 600; }

/* ── Section content wrapper ── */
.section-body { padding: 0 20px; }

/* ── Data grid (2 or 3 columns) ── */
.data-grid {
  display: grid;
  border: 1px solid var(--rule);
  margin: 10px 0;
}
.data-grid.cols-2 { grid-template-columns: 1fr 1fr; }
.data-grid.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
.data-grid.cols-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }

.data-cell {
  padding: 7px 10px;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.data-grid.cols-2 .data-cell:nth-child(2n)   { border-right: none; }
.data-grid.cols-3 .data-cell:nth-child(3n)   { border-right: none; }
.data-grid.cols-4 .data-cell:nth-child(4n)   { border-right: none; }
.data-grid.cols-2 .data-cell:nth-last-child(-n+2) { border-bottom: none; }
.data-grid.cols-3 .data-cell:nth-last-child(-n+3) { border-bottom: none; }
.data-grid.cols-4 .data-cell:nth-last-child(-n+4) { border-bottom: none; }

.dc-label {
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--brand);
  font-family: 'Courier New', Courier, monospace;
  margin-bottom: 2px;
  text-transform: uppercase;
}
.dc-value {
  font-size: 9pt;
  color: var(--ink);
  font-weight: 500;
}
.dc-evidence {
  font-size: 7pt;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  margin-top: 2px;
}
.tag-badge {
  display: inline-block;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 2px;
  margin-left: 4px;
  vertical-align: middle;
  font-family: 'Courier New', Courier, monospace;
}
.tag-orange { background: #FEF3C7; color: #92400E; }
.tag-pink   { background: var(--brand-light); color: var(--brand); }
.tag-green  { background: var(--badge-auto); color: var(--badge-auto-text); }

/* ── Adjudicator finding box ── */
.adj-finding {
  display: grid;
  grid-template-columns: 1fr 200px;
  border-left: 4px solid var(--neutral-bdr);
  background: var(--neutral-bg);
  margin: 14px 0;
  font-size: 9pt;
}
.adj-finding.green  { border-left-color: var(--green-bdr);  background: var(--green-bg); }
.adj-finding.amber  { border-left-color: var(--amber-bdr);  background: var(--amber-bg); }
.adj-finding.red    { border-left-color: var(--red-bdr);    background: var(--red-bg); }
.adj-finding.neutral{ border-left-color: var(--neutral-bdr);background: var(--neutral-bg); }

.adj-main {
  padding: 14px 16px;
  border-right: 1px solid var(--rule);
}
.adj-section-ref {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  margin-bottom: 6px;
  text-transform: uppercase;
}
.adj-text { font-size: 9pt; line-height: 1.65; color: var(--ink); }
.adj-text strong { font-weight: 700; }
.adj-text em { font-style: italic; }

.adj-meta {
  padding: 14px 14px;
  font-size: 7.5pt;
  font-family: 'Courier New', Courier, monospace;
  line-height: 1.8;
}
.adj-meta .meta-label {
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--muted);
  text-transform: uppercase;
  display: block;
  margin-top: 6px;
}
.adj-meta .meta-label:first-child { margin-top: 0; }
.adj-meta .meta-val { color: var(--ink); font-size: 7.5pt; }

/* ── Standard table ── */
.scr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8pt;
  margin: 8px 0;
}
.scr-table thead tr {
  background: var(--black);
  color: #fff;
}
.scr-table thead th {
  padding: 6px 8px;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-align: left;
  font-family: 'Courier New', Courier, monospace;
  text-transform: uppercase;
  border-right: 1px solid #333;
}
.scr-table thead th:last-child { border-right: none; }
.scr-table tbody tr { border-bottom: 1px solid var(--rule); }
.scr-table tbody tr:last-child { border-bottom: none; }
.scr-table tbody td {
  padding: 5px 8px;
  font-size: 8pt;
  vertical-align: top;
  border-right: 1px solid var(--rule);
}
.scr-table tbody td:last-child { border-right: none; }
.scr-table tbody tr:nth-child(even) { background: #FAFAFA; }

.scr-table .hits-zero { color: var(--muted); }
.scr-table .hits-pos  { color: var(--brand); font-weight: 700; }
.scr-table .check-full { color: #22C55E; font-weight: 600; }

/* ── Table section label ── */
.table-section-label {
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ink);
  font-family: 'Courier New', Courier, monospace;
  text-transform: uppercase;
  margin: 10px 0 4px;
}

/* ── Score badge in hits table ── */
.score-badge {
  display: inline-block;
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  font-size: 8pt;
  padding: 1px 5px;
  border-radius: 2px;
  font-family: 'Courier New', Courier, monospace;
}

/* ── Adverse-media category tag ── */
.am-tag {
  display: inline-block;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 2px;
  font-family: 'Courier New', Courier, monospace;
}
.am-red    { background: #FFF1F2; color: #BE123C; border: 1px solid #FECDD3; }
.am-orange { background: #FFF7ED; color: #C2410C; border: 1px solid #FED7AA; }
.am-blue   { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
.am-purple { background: #FAF5FF; color: #7E22CE; border: 1px solid #E9D5FF; }

/* ── Aggregate disposition ── */
.agg-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr) 1.6fr;
  border: 1px solid var(--rule);
  margin: 8px 0;
}
.agg-cell {
  padding: 8px 10px;
  border-right: 1px solid var(--rule);
}
.agg-cell:last-child { border-right: none; }
.agg-label {
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  text-transform: uppercase;
  margin-bottom: 3px;
}
.agg-value {
  font-size: 9.5pt;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.3;
}
.agg-sub {
  font-size: 7pt;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  margin-top: 1px;
}
.agg-disposition-label {
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.disposition-stamp {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 18pt;
  font-weight: 400;
  font-style: italic;
  line-height: 1.2;
  color: var(--ink);
}
.disposition-stamp.green  { color: #15803D; }
.disposition-stamp.amber  { color: #B45309; }
.disposition-stamp.red    { color: var(--brand); }
.disposition-stamp.neutral{ color: var(--ink); }
.disposition-sub {
  font-size: 7pt;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  margin-top: 3px;
  line-height: 1.5;
}

/* ── Statutory rows ── */
.stat-row {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  border-bottom: 1px solid var(--rule);
  padding: 7px 0;
  align-items: start;
  gap: 0 6px;
}
.stat-row:last-child { border-bottom: none; }
.stat-ref {
  font-family: 'Courier New', Courier, monospace;
  font-size: 8pt;
  font-weight: 700;
  color: var(--ink2);
  padding-top: 1px;
}
.stat-content { font-size: 8.5pt; color: var(--ink); line-height: 1.5; }
.stat-content strong { font-weight: 700; }
.stat-right-ref {
  font-family: 'Courier New', Courier, monospace;
  font-size: 7.5pt;
  color: var(--muted);
  white-space: nowrap;
}

/* ── Statutory filings table ── */
.filing-state {
  display: inline-block;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 2px;
  font-family: 'Courier New', Courier, monospace;
}
.filing-ack      { background: #D1FAE5; color: #065F46; }
.filing-sched    { background: #FEF3C7; color: #92400E; }
.filing-pending  { background: #DBEAFE; color: #1E40AF; }

/* ── Adjudication chain ── */
.chain-table { margin: 6px 0 12px; }
.state-badge {
  display: inline-block;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px 6px;
  border-radius: 2px;
  font-family: 'Courier New', Courier, monospace;
}
.state-AUTOMATED    { background: var(--badge-auto);  color: var(--badge-auto-text); }
.state-HUMAN_REVIEW { background: var(--badge-hr);    color: var(--badge-hr-text); }
.state-DECISION     { background: var(--badge-dec);   color: var(--badge-dec-text); }
.state-ATTESTED     { background: var(--badge-att);   color: var(--badge-att-text); }
.state-SEALED       { background: var(--badge-seal);  color: var(--badge-seal-text); }

/* ── Governance cells ── */
.gov-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1px solid var(--rule);
  margin: 8px 0;
}
.gov-cell {
  padding: 8px 10px;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.gov-cell:nth-child(2n)  { border-right: none; }
.gov-cell:nth-last-child(-n+2) { border-bottom: none; }
.gov-label {
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--brand);
  font-family: 'Courier New', Courier, monospace;
  text-transform: uppercase;
  margin-bottom: 3px;
}
.gov-value { font-size: 8.5pt; color: var(--ink); }

/* ── Attestation box ── */
.attestation-box {
  border: 1px solid var(--rule);
  margin: 10px 0;
  display: grid;
  grid-template-columns: 1fr 220px;
}
.attest-left { padding: 14px 16px; }
.attest-title {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.attest-heading {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  text-transform: uppercase;
  margin-bottom: 8px;
  padding: 8px 14px 4px;
  border-bottom: 1px solid var(--rule);
}
.attest-text { font-size: 9pt; line-height: 1.6; color: var(--ink); }
.attest-text strong { font-weight: 700; }
.attest-right {
  padding: 12px 14px;
  border-left: 1px solid var(--rule);
  background: #FAFAFA;
}
.seal-block {
  margin-bottom: 10px;
}
.seal-label {
  font-size: 6pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--muted);
  font-family: 'Courier New', Courier, monospace;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.seal-value {
  font-size: 7.5pt;
  font-family: 'Courier New', Courier, monospace;
  color: var(--ink2);
  word-break: break-all;
  line-height: 1.5;
}
.seal-footer {
  margin-top: 10px;
  font-size: 7.5pt;
  font-family: 'Courier New', Courier, monospace;
  color: var(--muted);
}
.seal-footer span { color: var(--green-bdr); font-weight: 700; }

/* ── Index columns ── */
.index-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 24px;
  padding: 0 20px 20px;
}
.index-col-title {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--ink);
  font-family: 'Courier New', Courier, monospace;
  text-transform: uppercase;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--rule);
}
.idx-entry {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 0 6px;
  padding: 4px 0;
  border-bottom: 1px solid var(--rule);
  font-size: 8pt;
}
.idx-ref {
  font-family: 'Courier New', Courier, monospace;
  font-size: 7.5pt;
  color: var(--muted);
  font-weight: 700;
}
.idx-body { line-height: 1.5; }
.idx-body strong { font-weight: 700; }
.idx-body em { font-style: italic; font-size: 7.5pt; color: var(--muted); font-family: 'Courier New', Courier, monospace; }

/* ── Timeline (statutory actions for Prohibited) ── */
.timeline-row {
  display: grid;
  grid-template-columns: 56px 18px 1fr auto;
  gap: 0 8px;
  border-bottom: 1px solid var(--rule);
  padding: 7px 0;
  align-items: start;
}
.timeline-row:last-child { border-bottom: none; }
.timeline-time {
  font-family: 'Courier New', Courier, monospace;
  font-size: 7.5pt;
  color: var(--brand);
  font-weight: 700;
  white-space: nowrap;
}
.timeline-dot {
  width: 7px; height: 7px;
  background: var(--brand);
  border-radius: 50%;
  margin-top: 4px;
}
.timeline-title {
  font-size: 8.5pt;
  font-weight: 700;
  color: var(--ink);
}
.timeline-detail {
  font-size: 8pt;
  color: var(--muted);
  margin-top: 2px;
}
.timeline-refs {
  font-family: 'Courier New', Courier, monospace;
  font-size: 7pt;
  color: var(--muted);
  text-align: right;
  white-space: nowrap;
}

/* ── Page footer ── */
.page-footer {
  padding: 6px 20px;
  border-top: 1px solid var(--rule);
  display: flex;
  justify-content: space-between;
  font-size: 6.5pt;
  font-family: 'Courier New', Courier, monospace;
  color: var(--muted);
  margin-top: 20px;
}

/* ── Utility ── */
.mono { font-family: 'Courier New', Courier, monospace; }
.muted { color: var(--muted); }
.brand { color: var(--brand); }
.bold { font-weight: 700; }
.small { font-size: 7.5pt; }
.mb8 { margin-bottom: 8px; }
.hr { border: none; border-top: 1px solid var(--rule); margin: 8px 20px; }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stateClass(s: SCRAdjudicationState): string {
  return 'state-' + s.replace(/\s+/g, '_').toUpperCase();
}

function findingClass(c: SCRSectionFindingColour): string {
  return c;
}

function dispositionStampClass(d: SCRDisposition): string {
  if (d === 'standard_cdd') return 'green';
  if (d === 'cleared') return 'green';
  if (d === 'edd_continuance') return 'amber';
  if (d === 'prohibited') return 'red';
  return 'neutral';
}

// ── Section renderers ─────────────────────────────────────────────────────────

function renderAdjFinding(f: SCRAdjudicatorFinding): string {
  const cls = findingClass(f.colour);
  const extraParas = (f.additionalParagraphs ?? [])
    .map((p) => `<p style="margin-top:6px">${esc(p)}</p>`)
    .join('');

  const metaRows: string[] = [];
  metaRows.push(`<span class="meta-label">REVIEWER</span><span class="meta-val">${esc(f.reviewer)}</span>`);
  if (f.countersign !== undefined) {
    metaRows.push(`<span class="meta-label">COUNTERSIGN</span><span class="meta-val">${esc(f.countersign)}</span>`);
  }
  if (f.qaSample) {
    metaRows.push(`<span class="meta-label">QA SAMPLE</span><span class="meta-val">${esc(f.qaSample)}</span>`);
  }
  if (f.evidenceFile) {
    metaRows.push(`<span class="meta-label">EVIDENCE FILE</span><span class="meta-val">${esc(f.evidenceFile)}</span>`);
  }
  metaRows.push(`<span class="meta-label">CONFIDENCE</span><span class="meta-val">${esc(f.confidence)}</span>`);
  if (f.sourceIndependence) {
    metaRows.push(`<span class="meta-label">SOURCE INDEPENDENCE</span><span class="meta-val">${esc(f.sourceIndependence)}</span>`);
  }
  if (f.pepConfidence) {
    metaRows.push(`<span class="meta-label">PEP CONFIDENCE</span><span class="meta-val">${esc(f.pepConfidence)}</span>`);
  }
  if (f.amConfidence) {
    metaRows.push(`<span class="meta-label">AM CONFIDENCE</span><span class="meta-val">${esc(f.amConfidence)}</span>`);
  }
  if (f.rescreen) {
    metaRows.push(`<span class="meta-label">RE-SCREEN</span><span class="meta-val">${esc(f.rescreen)}</span>`);
  }
  if (f.sla) {
    metaRows.push(`<span class="meta-label">SLA</span><span class="meta-val">${esc(f.sla)}</span>`);
  }

  return `
<div class="adj-finding ${cls}" style="border:1px solid var(--rule)">
  <div class="adj-main">
    <div class="adj-section-ref">${esc(f.sectionRef)} — ADJUDICATOR FINDING</div>
    <div class="adj-text">${esc(f.text)}${extraParas}</div>
  </div>
  <div class="adj-meta">
    ${metaRows.join('\n    ')}
  </div>
</div>`;
}

function renderSectionDivider(num: string, heading: string): string {
  // Wrap the last word before the period in <em> to get italic pink style
  // Heading format comes in as plain string; we italicise the *marked* word.
  const html = esc(heading).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return `
<div class="section-divider">
  <span class="section-chip">${esc(num)}</span>
  <h2 class="section-heading">${html}</h2>
</div>`;
}

function renderAuthLine(text: string): string {
  return `<div class="auth-line">${esc(text)}</div>`;
}

function renderDataGrid(
  cells: Array<{ label: string; value: string; evidence?: string; tag?: string; tagColour?: 'orange' | 'pink' | 'green' }>,
  cols: 2 | 3 = 2,
): string {
  const items = cells.map((c) => {
    const tagHtml = c.tag
      ? `<span class="tag-badge tag-${c.tagColour ?? 'orange'}">${esc(c.tag)}</span>`
      : '';
    const evHtml = c.evidence
      ? `<div class="dc-evidence">${esc(c.evidence)}</div>`
      : '';
    return `<div class="data-cell">
  <div class="dc-label">${esc(c.label)}</div>
  <div class="dc-value">${esc(c.value)}${tagHtml}</div>${evHtml}
</div>`;
  }).join('\n');
  return `<div class="data-grid cols-${cols}">${items}</div>`;
}

function renderStatutoryRows(rows: ScreeningComplianceReport['statutoryAction']['rows']): string {
  return rows.map((r) => `
<div class="stat-row">
  <span class="stat-ref">${esc(r.ref)}</span>
  <span class="stat-content">${r.bold ? `<strong>${esc(r.label)}</strong>` : esc(r.label)} ${esc(r.detail)}</span>
  <span class="stat-right-ref">${esc(r.rightRef)}</span>
</div>`).join('');
}

function renderFilingsTable(filings: SCRStatutoryFilingRow[]): string {
  const rows = filings.map((f) => {
    const stateCls = f.state === 'ACKNOWLEDGED' ? 'filing-ack'
      : f.state === 'SCHEDULED' ? 'filing-sched'
      : 'filing-pending';
    return `<tr>
      <td>${esc(f.authority)}</td>
      <td>${esc(f.form)}</td>
      <td class="mono">${esc(f.reference)}</td>
      <td>${esc(f.window)}</td>
      <td class="mono">${esc(f.filed)}</td>
      <td><span class="filing-state ${stateCls}">${esc(f.state)}</span></td>
    </tr>`;
  }).join('');
  return `
<div class="table-section-label">TABLE 9.A — STATUTORY FILINGS · ACKNOWLEDGEMENTS</div>
<table class="scr-table">
  <thead><tr>
    <th>AUTHORITY</th><th>FORM</th><th>REFERENCE</th>
    <th>WINDOW</th><th>FILED</th><th>STATE</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function renderSanctionsHits(hits: SCRSanctionsHit[]): string {
  const rows = hits.map((h) => `<tr>
    <td>${esc(h.source)}</td>
    <td>${esc(h.matchType)}</td>
    <td><span class="score-badge">${esc(h.score)}</span></td>
    <td><strong>${esc(h.listedEntity)}</strong></td>
    <td>${esc(h.discriminatorDivergence ?? '')}</td>
    ${hasDes ? `<td class="mono">${esc(h.designated ?? '')}</td>` : ''}
  </tr>`).join('');
  const hasDes = hits.some((h) => h.designated);
  return `
<div class="table-section-label">TABLE 5.A — ${hits.length > 0 && hits[0]!.discriminatorDivergence !== undefined ? 'PHONETIC MATCH · ADJUDICATED' : 'HITS, SANCTIONS REGISTERS'}</div>
<table class="scr-table">
  <thead><tr>
    <th>SOURCE</th><th>MATCH TYPE</th><th>SCORE</th>
    <th>LISTED ENTITY</th><th>DISCRIMINATOR DIVERGENCE</th>
    ${hasDes ? '<th>DESIGNATED</th>' : ''}
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function renderPepHits(hits: SCRPepHit[]): string {
  const rows = hits.map((h) => `<tr>
    <td>${esc(h.provider)}</td>
    <td><strong>${esc(h.record)}</strong></td>
    <td class="mono">${esc(h.entered)}</td>
    <td>${esc(h.category)}</td>
    <td><span class="tag-badge tag-pink">${esc(h.tier)}</span></td>
  </tr>`).join('');
  return `
<div class="table-section-label">TABLE 6.A — POLITICALLY-EXPOSED PERSONS DESIGNATION</div>
<table class="scr-table">
  <thead><tr><th>PROVIDER</th><th>RECORD</th><th>ENTERED</th><th>CATEGORY</th><th>TIER</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function renderAdverseMediaHits(hits: SCRAdverseMediaHit[]): string {
  const rows = hits.map((h) => {
    const amCls = h.categoryColour
      ? `am-${h.categoryColour}`
      : 'am-orange';
    const sourceCell = h.source
      ? `<strong style="font-size:8pt;letter-spacing:0.04em">${esc(h.source)}</strong>${h.sourceOutlets ? `<br/><span style="font-size:7.5pt;color:var(--ink);line-height:1.4">${esc(h.sourceOutlets)}</span>` : ''}<br/><span class="mono" style="font-size:6.5pt;color:var(--muted)">${esc(h.sourceTier)}</span>`
      : `<span class="mono">${esc(h.sourceTier)}</span>`;
    return `<tr>
      <td>${sourceCell}</td>
      <td class="mono">${esc(h.date)}</td>
      <td><span class="am-tag ${amCls}">${esc(h.category)}</span></td>
      <td style="font-size:8.5pt;line-height:1.5">${esc(h.substance)}</td>
      <td class="mono" style="font-size:7.5pt">${esc(h.corroboration)}</td>
    </tr>`;
  }).join('');
  return `
<div class="table-section-label">TABLE 6.B — ADVERSE-MEDIA · 10-YEAR LOOKBACK</div>
<table class="scr-table">
  <thead><tr><th>SOURCE</th><th>DATE</th><th>CATEGORY</th><th>SUBSTANCE</th><th>CORROBORATION</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderSCR(r: ScreeningComplianceReport): string {
  const dc = r.docControl;
  const cs = r.coverSummary;
  const es = r.executiveSummary;
  const tr = r.trigger;
  const me = r.methodology;
  const d1 = r.domainI;
  const d23 = r.domainIIIII;
  const d4 = r.domainIV;
  const ag = r.aggregateRisk;
  const sa = r.statutoryAction;
  const rc = r.reviewerChain;
  const ix = r.indices;
  const at = r.attestation;

  const dispClass = dispositionStampClass(r.disposition);

  // Contents table entries
  const contentsLeft = [
    ['01', 'Executive summary & disposition', 'p.02'],
    ['02', 'Subject of record', 'p.03'],
    ['03', 'Screening trigger & risk basis', 'p.04'],
    ['04', 'Methodology & engine configuration', 'p.05'],
    ['05', 'Domain I — Targeted financial sanctions', 'p.06'],
    ['06', 'Domain II & III — PEP & adverse media', 'p.07'],
    ['07', 'Domain IV — Beneficial-ownership & RCA', 'p.08'],
  ];
  const contentsRight = [
    ['08', 'Aggregate risk & final disposition', 'p.09'],
    ['09', 'Statutory action & reports filed', 'p.10'],
    ['10', 'Tipping-off, retention & record-keeping', 'p.11'],
    ['11', 'Reviewer chain & four-eyes governance', 'p.12'],
    ['12', 'Index of authorities', 'p.13'],
    ['13', 'Index of evidence', 'p.13'],
    ['14', 'Attestation, seal & distribution', 'p.14'],
  ];

  const contentsHtml = `
<div class="contents-block">
  <div class="contents-header">
    <span>CONTENTS</span>
    <span>${r.totalSections} SECTIONS · ${r.totalParagraphs} NUMBERED PARAGRAPHS · 2 INDICES</span>
  </div>
  <div class="contents-grid">
    <div>${contentsLeft.map(([n, t, p]) => `<div class="contents-row"><span class="cnum">${esc(n!)}</span><span class="ctitle">${esc(t!)}</span><span class="cpage">${esc(p!)}</span></div>`).join('')}</div>
    <div>${contentsRight.map(([n, t, p]) => `<div class="contents-row"><span class="cnum">${esc(n!)}</span><span class="ctitle">${esc(t!)}</span><span class="cpage">${esc(p!)}</span></div>`).join('')}</div>
  </div>
</div>`;

  // Regulatory basis bar
  const regBar = `
<div class="reg-basis-bar">
  <div class="badges">
    ${r.regulatoryBasisBar.badges.map((b) => `<span class="reg-badge">${esc(b)}</span>`).join('')}
  </div>
  <span class="right-label">${esc(r.regulatoryBasisBar.rightLabel)}</span>
</div>`;

  // Cover grid
  const coverGridHtml = `
<div class="cover-grid">
  <div class="cell"><div class="dc-label">SUBJECT</div><div class="dc-value">${esc(cs.subject)}</div></div>
  <div class="cell"><div class="dc-label">SUBJECT TYPE</div><div class="dc-value">${esc(cs.subjectType)}</div></div>
  <div class="cell"><div class="dc-label">UBO OF RECORD</div><div class="dc-value">${esc(cs.uboOfRecord)}</div></div>
  <div class="cell"><div class="dc-label">SCREENING TRIGGER</div><div class="dc-value">${esc(cs.screeningTrigger)}</div></div>
  <div class="cell"><div class="dc-label">EWRA RISK TIER</div><div class="dc-value">${esc(cs.ewraRiskTier)}</div></div>
  <div class="cell"><div class="dc-label">DISPOSITION</div><div class="dc-value">${esc(cs.disposition)}</div></div>
</div>`;

  // Document control
  const dcHtml = `
<div class="doc-control">
  <div class="dc-title">DOCUMENT CONTROL</div>
  ${[
    ['REPORT NO.', dc.reportNo],
    ['ALERT REF.', dc.alertRef],
    ['SESSION', dc.session],
    ['VERSION', dc.version],
    ['ISSUED', dc.issued],
    ['EFFECTIVE', dc.effective],
    ['RETENTION', dc.retention],
    ['CLASSIFICATION', dc.classification],
    ['BUREAU', dc.bureau],
    ['APPROVED', dc.approved],
    ['SLA', dc.sla],
  ].map(([k, v]) => `<div class="dc-row"><span class="dc-key">${esc(k!)}</span><span class="dc-val">${esc(v!)}</span></div>`).join('')}
</div>`;

  // Section 01 — Executive summary
  const sec01 = `
${renderSectionDivider('01', 'Executive *summary* & disposition.')}
<div class="auth-line" style="border-bottom:1px solid var(--rule);padding-bottom:6px;">
  Purpose. A reader-of-record briefing of the screening, the regulatory basis, the four screening domains, the adjudication, and the action taken.
  <strong>Audience.</strong> MLRO · Compliance Committee · Internal Audit · MoE · CBUAE · FIU · EOCN · external auditors.
</div>
<div class="section-body">
  ${[
    { ref: '1.1', label: es.finding, text: es.findingDetail, bold: true },
    { ref: '1.2', label: 'Action taken.', text: es.actionTaken, bold: true },
    { ref: '1.3', label: 'Confidence.', text: es.confidence, bold: true },
  ].map((row) => `
  <div class="stat-row">
    <span class="stat-ref">${esc(row.ref)}</span>
    <span class="stat-content"><strong>${esc(row.label)}</strong> ${esc(row.text)}</span>
    <span class="stat-right-ref"></span>
  </div>`).join('')}
</div>`;

  // Section 02 — Subject of record
  const sec02 = `
${renderSectionDivider('02', 'Subject *of record*.')}
${renderAuthLine('Basis. ' + r.subjectOfRecord.basis)}
<div class="section-body">
  ${renderDataGrid(r.subjectOfRecord.cells, 3)}
</div>`;

  // Section 03 — Trigger
  const lookbackLabel = tr.tenYrLookbackApplied
    ? `${esc(tr.tenYrLookback)} <span class="tag-badge tag-pink">APPLIED</span>`
    : esc(tr.tenYrLookback);
  const sec03 = `
${renderSectionDivider('03', 'Screening *trigger* & risk basis.')}
${renderAuthLine('Authorities. FDL 10/2025 Art. 4 · MoE Circular 2/2024 · Cab. Res. 109/2023 · Enterprise-Wide Risk Assessment v.4.1.')}
<div class="section-body">
  <div class="data-grid cols-4" style="margin:10px 0">
    <div class="data-cell"><div class="dc-label">3.1 TRIGGER EVENT</div><div class="dc-value">${esc(tr.triggerEvent)}</div></div>
    <div class="data-cell"><div class="dc-label">3.2 EWRA TIER</div><div class="dc-value">${esc(tr.ewraTier)}</div></div>
    <div class="data-cell"><div class="dc-label">3.3 CADENCE</div><div class="dc-value">${esc(tr.cadence)}</div></div>
    <div class="data-cell"><div class="dc-label">3.4 BUREAU · OPERATOR</div><div class="dc-value">${esc(tr.bureauOperator)}</div></div>
    <div class="data-cell"><div class="dc-label">3.5 DPMS THRESHOLD</div><div class="dc-value">${esc(tr.dpmsThreshold)}</div></div>
    <div class="data-cell"><div class="dc-label">3.6 VA TRAVEL RULE</div><div class="dc-value">${esc(tr.vaTravelRule)}</div></div>
    <div class="data-cell"><div class="dc-label">3.7 10-YR LOOKBACK</div><div class="dc-value">${lookbackLabel}</div></div>
    <div class="data-cell"><div class="dc-label">3.8 SESSION REF</div><div class="dc-value mono">${esc(tr.sessionRef)}</div></div>
  </div>
</div>`;

  // Section 04 — Methodology
  const methodRows = me.rows.map((row) => `<tr>
    <td class="mono bold" style="width:160px;font-size:7.5pt">${esc(row.id)}</td>
    <td style="max-width:340px">${esc(row.value)}</td>
    <td class="mono muted small" style="width:160px">${esc(row.ref ?? '')}</td>
  </tr>`).join('');
  const sec04 = `
${renderSectionDivider('04', '*Methodology* & engine configuration.')}
${renderAuthLine('Purpose. To document the matching algorithm and its parameters such that the screening can be re-run on the same inputs to identical outputs (deterministic reproducibility). Authorities. FATF Rec. 6 · MoE Circular 08/AML/2021 5–7 · EOCN Guidance 01/2023.')}
<div class="section-body">
  <table class="scr-table" style="margin:10px 0">
    <tbody>${methodRows}</tbody>
  </table>
</div>`;

  // Section 05 — Domain I
  const regTableRows = d1.registers.map((reg) => `<tr>
    <td>${esc(reg.register)}</td>
    <td class="mono">${esc(reg.version)}</td>
    <td class="mono">${typeof reg.records === 'number' ? reg.records.toLocaleString() : esc(reg.records)}</td>
    <td class="${reg.hits === 0 ? 'hits-zero' : 'hits-pos'}">${reg.hits}</td>
    <td class="check-full">${esc(reg.coverage)}</td>
    <td class="mono muted">${esc(reg.authority)}</td>
  </tr>`).join('');

  const hasHits = !!(d1.hits && d1.hits.length > 0);
  const zeroHitsLabel = `<div class="table-section-label">TABLE 5.A — SANCTIONS REGISTERS CONSULTED &nbsp;(${d1.registers.length} MUTUALLY-INDEPENDENT SOURCES · SCORE THRESHOLD ≥ 85% · ZERO RECORDS RETURNED)</div>`;

  const sec05 = `
${renderSectionDivider('05', 'Domain I · Targeted *Financial Sanctions*.')}
${renderAuthLine('Authorities. FATF Rec. 6 · UNSC Res. 1267 / 1989 / 2253 / 2231 · Cabinet Resolution 74/2020 · EOCN Guidance 01/2023 · OFAC E.O. 13382 · EU CFSP 2014/145.')}
<div class="section-body">
  ${hasHits ? renderSanctionsHits(d1.hits!) : zeroHitsLabel}
  <table class="scr-table" style="margin:8px 0">
    <thead><tr><th>REGISTER</th><th>VERSION · REFRESH</th><th>RECORDS</th><th>HITS</th><th>COVERAGE</th><th>AUTHORITY</th></tr></thead>
    <tbody>${regTableRows}</tbody>
  </table>
  ${renderAdjFinding(d1.adjudicatorFinding)}
</div>`;

  // Section 06 — Domains II & III
  const pepRegRows = d23.pepRegisters.map((pr) => `<tr>
    <td>${esc(pr.provider)}</td>
    <td class="mono">${esc(pr.version)}</td>
    <td class="mono">${esc(pr.records)}</td>
    <td class="${pr.hits === 0 ? 'hits-zero' : 'hits-pos'}">${pr.hits}</td>
    <td>${esc(pr.coverage)}</td>
  </tr>`).join('');

  const amRows = d23.adverseMediaCorpora.map((c) => `<tr>
    <td>${esc(c.corpus)}</td>
    <td>${esc(c.scope)}</td>
    <td class="${c.hits === 0 ? 'hits-zero' : 'hits-pos'}">${c.hits}</td>
  </tr>`).join('');

  const pepHitsHtml = d23.pepHits && d23.pepHits.length > 0 ? renderPepHits(d23.pepHits) : '';
  const amHitsHtml = d23.adverseMediaHits && d23.adverseMediaHits.length > 0 ? renderAdverseMediaHits(d23.adverseMediaHits) : '';

  const sec06 = `
${renderSectionDivider('06', 'Domains II & III · *PEP* & adverse media.')}
${renderAuthLine('Authorities. FATF Rec. 12 (PEP) · FDL 10/2025 Art. 11 · Cabinet Res. 109/2023 · FATF Rec. 10 · MoE Circular 08/AML/2021 10 (adverse media) · FDL 10/2025 Art. 19 (10-yr lookback).')}
<div class="section-body">
  ${pepHitsHtml}
  <div class="table-section-label">TABLE 6.A — PEP REGISTERS CONSULTED (4 COMMERCIAL · ${d23.pepRegisters.reduce((s, p) => s + p.hits, 0) === 0 ? 'ZERO HITS' : 'HITS'})</div>
  <table class="scr-table" style="margin:6px 0 10px">
    <thead><tr><th>PROVIDER</th><th>VERSION</th><th>RECORDS</th><th>HITS</th><th>COVERAGE</th></tr></thead>
    <tbody>${pepRegRows}</tbody>
  </table>
  ${amHitsHtml}
  <div class="table-section-label">TABLE 6.B — ADVERSE-MEDIA CORPORA · 10-YEAR LOOKBACK (${d23.adverseMediaCorpora.reduce((s, c) => s + c.hits, 0) === 0 ? 'ZERO HITS' : 'HITS'})</div>
  <table class="scr-table" style="margin:6px 0 10px">
    <thead><tr><th>CORPUS</th><th>SCOPE</th><th>HITS</th></tr></thead>
    <tbody>${amRows}</tbody>
  </table>
  ${renderAdjFinding(d23.adjudicatorFinding)}
</div>`;

  // Section 07 — Domain IV
  const uboGridHtml = d4.cells && d4.cells.length > 0
    ? renderDataGrid(d4.cells, 2)
    : '';
  const sec07 = `
${renderSectionDivider('07', 'Domain IV · *Beneficial-ownership* & RCA graph.')}
${renderAuthLine('Authorities. FATF Rec. 24/25 · FDL 26/2021 (UBO) · MoE Circular 2/2024 – 25% beneficial threshold.')}
<div class="section-body">
  ${uboGridHtml}
  ${renderAdjFinding(d4.adjudicatorFinding)}
</div>`;

  // Section 08 — Aggregate risk
  const sec08 = `
${renderSectionDivider('08', 'Aggregate *risk* & final disposition.')}
${renderAuthLine('Basis. MoE Circular 08/AML/2021 12 risk-matrix · four-eyes adjudication.')}
<div class="section-body">
  <div class="agg-grid">
    <div class="agg-cell">
      <div class="agg-label">SANCTIONS</div>
      <div class="agg-value">${esc(ag.sanctions.label)}</div>
      <div class="agg-sub">${esc(ag.sanctions.sub)}</div>
    </div>
    <div class="agg-cell">
      <div class="agg-label">PEP</div>
      <div class="agg-value">${esc(ag.pep.label)}</div>
      <div class="agg-sub">${esc(ag.pep.sub)}</div>
    </div>
    <div class="agg-cell">
      <div class="agg-label">ADVERSE MEDIA</div>
      <div class="agg-value">${esc(ag.adverseMedia.label)}</div>
      <div class="agg-sub">${esc(ag.adverseMedia.sub)}</div>
    </div>
    <div class="agg-cell">
      <div class="agg-label">UBO / RCA</div>
      <div class="agg-value">${esc(ag.uboRca.label)}</div>
      <div class="agg-sub">${esc(ag.uboRca.sub)}</div>
    </div>
    <div class="agg-cell">
      <div class="agg-disposition-label">8.1 AGGREGATE DISPOSITION</div>
      <div class="disposition-stamp ${dispClass}">${esc(ag.dispositionLabel)}</div>
      <div class="disposition-sub">${esc(ag.dispositionSub)}</div>
    </div>
  </div>
</div>`;

  // Section 09 — Statutory action
  const sec09 = `
${renderSectionDivider('09', 'Statutory *action* & reports filed.')}
${renderAuthLine('Authorities. FDL 10/2025 Arts. 15 & 17 · Cabinet Resolution 134/2025 Art. 18 · Cabinet Resolution 74/2020 Art. 17 2 · goAML v4.4.')}
<div class="section-body">
  ${renderStatutoryRows(sa.rows)}
  ${sa.filings ? renderFilingsTable(sa.filings) : ''}
</div>`;

  // Section 10 — Tipping-off & retention
  const sec10 = `
${renderSectionDivider('10', 'Tipping-off, *retention* & record-keeping.')}
${renderAuthLine('Authorities. FDL 10/2025 Art. 22 (tipping-off) · FDL 10/2025 Art. 24 3–7 (retention) · WORM & HSM controls.')}
<div class="section-body">
  ${r.retentionRows.map((row) => `
  <div class="stat-row">
    <span class="stat-ref">${esc(row.ref)}</span>
    <span class="stat-content">${row.bold ? `<strong>${esc(row.label)}</strong>` : esc(row.label)} ${esc(row.detail)}</span>
    <span class="stat-right-ref">${esc(row.rightRef)}</span>
  </div>`).join('')}
</div>`;

  // Section 11 — Reviewer chain
  const chainRows = rc.chain.map((row) => `<tr>
    <td class="mono">${esc(row.stage)}</td>
    <td>${esc(row.role)}</td>
    <td><strong>${esc(row.person)}</strong></td>
    <td>${esc(row.action)}</td>
    <td class="mono">${esc(row.timeGst)}</td>
    <td><span class="state-badge ${stateClass(row.state)}">${esc(row.state)}</span></td>
  </tr>`).join('');

  const sec11 = `
${renderSectionDivider('11', 'Reviewer *chain* & four-eyes governance.')}
${renderAuthLine('Standard. Cabinet Resolution 134/2025 Art. 14 2–3 – four-eyes attestation for confirmed positive findings.')}
<div class="section-body">
  <div class="table-section-label">TABLE 11.A — ADJUDICATION CHAIN</div>
  <table class="scr-table chain-table">
    <thead><tr><th>STAGE</th><th>ROLE</th><th>PERSON</th><th>ACTION</th><th>TIME (GST)</th><th>STATE</th></tr></thead>
    <tbody>${chainRows}</tbody>
  </table>
  <div class="gov-grid">
    <div class="gov-cell"><div class="gov-label">11.1 INDEPENDENCE</div><div class="gov-value">${esc(rc.independence)}</div></div>
    <div class="gov-cell"><div class="gov-label">11.2 CONFLICT-OF-INTEREST</div><div class="gov-value">${esc(rc.conflictOfInterest)}</div></div>
    <div class="gov-cell"><div class="gov-label">11.3 DISTRIBUTION</div><div class="gov-value">${esc(rc.distribution)}</div></div>
    <div class="gov-cell"><div class="gov-label">11.4 NOTIFICATION</div><div class="gov-value">${esc(rc.notification)}</div></div>
  </div>
</div>`;

  // Section 14 — Attestation
  const sealHtml = `
<div class="seal-block">
  <div class="seal-label">REPORT DIGEST</div>
  <div class="seal-value">${esc(at.seal.reportDigest)}</div>
</div>
<div class="seal-block">
  <div class="seal-label">WORM-SEQ · CASE BUNDLE</div>
  <div class="seal-value">${esc(at.seal.wormSeqCaseBundle)}</div>
</div>
<div class="seal-block">
  <div class="seal-label">SESSION</div>
  <div class="seal-value">${esc(at.seal.session)}</div>
</div>
<div class="seal-block">
  <div class="seal-label">DISTRIBUTION</div>
  <div class="seal-value">${esc(at.seal.distribution)}</div>
</div>
<div class="seal-footer"><span>✓</span> HSM-bound · 10-yr retention · WORM-sealed</div>`;

  const sec14 = `
<div style="border:1px solid var(--rule);margin:10px 20px 0">
  <div style="padding:6px 14px;font-size:7pt;font-weight:700;letter-spacing:.08em;font-family:'Courier New',monospace;color:var(--muted);border-bottom:1px solid var(--rule);display:flex;justify-content:space-between">
    <span>14 — ATTESTATION, CRYPTOGRAPHIC SEAL &amp; DISTRIBUTION</span>
    <span>CONFIDENTIAL — RESTRICTED · 10-YR RETENTION · WORM-BOUND</span>
  </div>
  <div class="attestation-box" style="border:none;margin:0">
    <div class="attest-left">
      <div class="attest-text">${esc(at.certificationText)}</div>
    </div>
    <div class="attest-right">
      <div class="attest-heading">14.3 — CRYPTOGRAPHIC SEAL</div>
      ${sealHtml}
    </div>
  </div>
</div>`;

  // Sections 12 & 13 — Indices
  const authEntries = ix.authorities.map((a) => `
<div class="idx-entry">
  <span class="idx-ref">${esc(a.ref)}</span>
  <span class="idx-body"><strong>${esc(a.citation)}</strong> ${esc(a.description)}</span>
</div>`).join('');

  const evEntries = ix.evidence.map((e) => `
<div class="idx-entry">
  <span class="idx-ref">${esc(e.ref)}</span>
  <span class="idx-body"><strong>${esc(e.id)}</strong> <em>— ${esc(e.description)}</em></span>
</div>`).join('');

  const sec1213 = `
${renderSectionDivider('12 · 13', 'Indices · *authorities* & evidence.')}
${renderAuthLine('Purpose. Permits the auditor to reconstruct the regulatory and evidential basis of every paragraph of this report.')}
<div class="index-grid">
  <div>
    <div class="index-col-title">12 — INDEX OF AUTHORITIES</div>
    ${authEntries}
  </div>
  <div>
    <div class="index-col-title">13 — INDEX OF EVIDENCE (CASE FILE)</div>
    ${evEntries}
  </div>
</div>`;

  // Footer
  const footer = `
<div class="page-footer">
  <span>Hawkeye Sterling · Bureau of Record · DXB&nbsp;&nbsp;&nbsp;${esc(r.footerCitations)}</span>
  <span>PAGE 01 OF ${r.pageCount} — CONFIDENTIAL — RESTRICTED</span>
</div>`;

  // Assemble the full document
  const body = `
<div class="page">

  <!-- Cover strip -->
  <div class="cover-strip">
    <span><span class="bureau-name">HAWKEYE STERLING</span> · BUREAU OF RECORD · PRECISION SCREENING</span>
    <span class="report-ref">${esc(dc.reportNo)} · PAGE 01 OF ${r.pageCount}</span>
    <span class="confidential-badge">CONFIDENTIAL — RESTRICTED</span>
  </div>

  <!-- Cover body -->
  <div class="cover-body">
    <div>
      <!-- Document-of-record banner -->
      <div class="doc-of-record">DOCUMENT OF RECORD · ISSUED BY THE BUREAU UNDER FDL 10/2025</div>

      <!-- Main title -->
      <div class="main-title">Screening<br>Compliance <em>Report</em></div>
      <div class="cover-subtitle">${esc(cs.subtitle)}</div>

      <!-- Subject grid -->
      ${coverGridHtml}
    </div>

    <!-- Document control (right column) -->
    ${dcHtml}
  </div>

  <!-- Regulatory basis bar -->
  ${regBar}

  <!-- Contents -->
  ${contentsHtml}

  <!-- Section 01 -->
  ${sec01}
  <hr class="hr">

  <!-- Section 02 -->
  ${sec02}
  <hr class="hr">

  <!-- Section 03 -->
  ${sec03}
  <hr class="hr">

  <!-- Section 04 -->
  ${sec04}
  <hr class="hr">

  <!-- Section 05 -->
  ${sec05}
  <hr class="hr">

  <!-- Section 06 -->
  ${sec06}
  <hr class="hr">

  <!-- Section 07 -->
  ${sec07}
  <hr class="hr">

  <!-- Section 08 -->
  ${sec08}
  <hr class="hr">

  <!-- Section 09 -->
  ${sec09}
  <hr class="hr">

  <!-- Section 10 -->
  ${sec10}
  <hr class="hr">

  <!-- Section 11 -->
  ${sec11}
  <hr class="hr">

  <!-- Sections 12 & 13 -->
  ${sec1213}

  <!-- Section 14 -->
  ${sec14}

  <!-- Footer -->
  ${footer}

</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Hawkeye Sterling — ${esc(dc.reportNo)}</title>
<style>${CSS}</style>
</head>
<body>${body}</body>
</html>`;
}
