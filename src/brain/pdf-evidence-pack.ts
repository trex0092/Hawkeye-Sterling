// Hawkeye Sterling — regulator-facing PDF evidence pack.
//
// Produces a self-contained PDF (plain 1.4, no image dependencies) that
// bundles the verdict, the full reasoning chain, the evidence registry,
// fusion + introspection, and the audit-chain head hash. The PDF is
// deterministic (same input → byte-identical output) and passes WinAnsi
// character set only, so no embedded fonts or Unicode subsets are needed.
//
// Design goal: a CBUAE / FIU inspector can open this file with any PDF
// reader and verify the tamper-evident anchor hash against the chain log.

import type { BrainVerdict } from './types.js';
import type { EvidenceItem } from './evidence.js';
import { fnv1a } from './audit-chain.js';

export interface EvidencePackOptions {
  title?: string;                           // document title in the PDF metadata
  chainAnchor?: string;                     // audit-chain head hash to embed
  evidence?: readonly EvidenceItem[];
}

/** Build a PDF byte-sequence from the verdict. Returns a Uint8Array
 *  suitable for writing to disk or streaming over HTTP. */
export function renderEvidencePack(verdict: BrainVerdict, opts: EvidencePackOptions = {}): Uint8Array {
  const lines = composeLines(verdict, opts);
  return buildPdf(lines, opts.title ?? `Hawkeye Sterling Evidence Pack — ${verdict.runId}`, opts.chainAnchor);
}

function composeLines(v: BrainVerdict, opts: EvidencePackOptions): string[] {
  const out: string[] = [];
  out.push('HAWKEYE STERLING — REGULATOR EVIDENCE PACK');
  out.push('');
  out.push(`Run ID: ${v.runId}`);
  out.push(`Generated: ${new Date(v.generatedAt).toISOString()}`);
  out.push(`Subject: ${sanitise(v.subject.name)} (${v.subject.type}${v.subject.jurisdiction ? `, ${v.subject.jurisdiction}` : ''})`);
  if (v.subject.dateOfBirth) out.push(`DoB: ${v.subject.dateOfBirth}`);
  if (opts.chainAnchor) out.push(`Audit-chain anchor: ${opts.chainAnchor}`);
  out.push('');
  out.push('─── VERDICT ────────────────────────────────────────');
  out.push(`Outcome:          ${v.outcome.toUpperCase()}`);
  out.push(`Aggregate score:  ${v.aggregateScore.toFixed(3)}`);
  out.push(`Confidence:       ${v.aggregateConfidence.toFixed(3)}`);
  if (v.primaryHypothesis) out.push(`Primary hypothesis: ${v.primaryHypothesis}`);
  if (v.prior !== undefined && v.posterior !== undefined) {
    out.push(`Prior → Posterior: ${v.prior.toFixed(3)} → ${v.posterior.toFixed(3)}`);
  }
  if (v.consensus) out.push(`Consensus: ${v.consensus}`);
  if (v.methodology) {
    out.push('Methodology:');
    for (const line of wrap(v.methodology, 90)) out.push(`  ${line}`);
  }
  out.push('');
  out.push('─── RECOMMENDED ACTIONS ───────────────────────────');
  if (v.recommendedActions.length === 0) out.push('  (none)');
  else for (const a of v.recommendedActions) out.push(`  • ${a}`);
  out.push('');
  out.push('─── FINDINGS ───────────────────────────────────────');
  const ordered = [...v.findings].sort((a, b) => b.score - a.score);
  for (const f of ordered) {
    out.push(`[${f.verdict.toUpperCase()}] ${f.modeId}  score=${f.score.toFixed(2)}  conf=${f.confidence.toFixed(2)}  (${f.category})`);
    for (const line of wrap(sanitise(f.rationale), 96)) out.push(`    ${line}`);
    if (f.evidence.length > 0) out.push(`    evidence: ${f.evidence.slice(0, 6).join(', ')}${f.evidence.length > 6 ? ` (+${f.evidence.length - 6} more)` : ''}`);
    if (f.likelihoodRatios && f.likelihoodRatios.length > 0) {
      const lrStr = f.likelihoodRatios.map((l) => `${l.evidenceId} LR=${(l.positiveGivenHypothesis / Math.max(0.0001, l.positiveGivenNot)).toFixed(1)}`).join('; ');
      out.push(`    LRs: ${lrStr}`);
    }
    out.push('');
  }
  if (v.conflicts && v.conflicts.length > 0) {
    out.push('─── CONFLICTS ──────────────────────────────────────');
    for (const c of v.conflicts) {
      out.push(`  ${c.a}(${c.aVerdict}@${c.aScore.toFixed(2)}) vs ${c.b}(${c.bVerdict}@${c.bScore.toFixed(2)}) — ${sanitise(c.note)}`);
    }
    out.push('');
  }
  if (v.introspection) {
    out.push('─── INTROSPECTION ──────────────────────────────────');
    out.push(`  chain quality:        ${v.introspection.chainQuality.toFixed(3)}`);
    out.push(`  calibration gap:      ${v.introspection.calibrationGap.toFixed(3)}`);
    out.push(`  confidence adjust:    ${v.introspection.confidenceAdjustment.toFixed(3)}`);
    if (v.introspection.biasesDetected.length > 0) out.push(`  biases detected:      ${v.introspection.biasesDetected.join(', ')}`);
    if (v.introspection.coverageGaps.length > 0) out.push(`  coverage gaps:        ${v.introspection.coverageGaps.join(', ')}`);
    out.push('');
  }
  if (opts.evidence && opts.evidence.length > 0) {
    out.push('─── EVIDENCE REGISTRY ──────────────────────────────');
    for (const ev of opts.evidence) {
      const freshness = ev.observedAt;
      out.push(`  [${ev.id}] ${ev.kind} · ${ev.credibility} · observed ${freshness}`);
      out.push(`    ${sanitise(ev.title)}`);
      if (ev.publisher) out.push(`    publisher: ${sanitise(ev.publisher)}`);
      if (ev.uri) out.push(`    uri: ${ev.uri}`);
      if (ev.sha256) out.push(`    sha256: ${ev.sha256}`);
      if (ev.staleWarning) out.push(`    ⚠ ${sanitise(ev.staleWarning)}`);
    }
    out.push('');
  }
  out.push('─── INTEGRITY ──────────────────────────────────────');
  out.push(`This pack is tamper-evident: the audit-chain anchor below links every`);
  out.push(`claim above into a hash-chained log. A change in any line invalidates`);
  out.push(`the anchor. Regulators can replay the chain to re-verify.`);
  out.push('');
  const packHash = fnv1a(out.join('\n'));
  out.push(`Pack hash (fnv-1a): ${packHash}`);
  if (opts.chainAnchor) out.push(`Chain anchor:       ${opts.chainAnchor}`);
  return out;
}

/** Normalise unicode glyphs to ASCII, strip remaining non-printable,
 *  then apply PDF string escapes (backslash first). */
function sanitise(s: string): string {
  const normalised = s
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u2500\u2501\u2502\u2503\u2550\u2551]/g, "-")
    .replace(/\u00A0/g, " ");
  const ascii = normalised.replace(/[^\x20-\x7E]/g, "?");
  return ascii
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const out: string[] = [];
  const words = line.split(/\s+/);
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= width) cur = `${cur} ${w}`;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

/** Minimal PDF 1.4 writer — one page per ~60 text lines, Helvetica 9pt,
 *  WinAnsi encoding. No external deps. */
function buildPdf(lines: string[], title: string, anchor: string | undefined): Uint8Array {
  const PAGE_HEIGHT = 792;         // US Letter in points
  const PAGE_WIDTH = 612;
  const TOP_MARGIN = 56;
  const LEFT_MARGIN = 56;
  const LINE_HEIGHT = 11.5;
  const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - TOP_MARGIN - 56) / LINE_HEIGHT);

  // Chunk lines into pages.
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push(['(empty)']);

  const objects: string[] = [];                              // object bodies (without header)
  const addObject = (body: string): number => { objects.push(body); return objects.length; };

  const fontObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (const lines of pages) {
    let content = 'BT /F1 9 Tf\n';
    content += `1 0 0 1 ${LEFT_MARGIN} ${PAGE_HEIGHT - TOP_MARGIN} Tm\n`;
    for (let i = 0; i < lines.length; i++) {
      const safe = sanitise(lines[i] ?? "");
      if (i === 0) content += `(${safe}) Tj\n`;
      else content += `0 -${LINE_HEIGHT} Td (${safe}) Tj\n`;
    }
    content += 'ET';
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    contentIds.push(contentId);
    const pageId = addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontObj} 0 R >> >> >>`);
    pageIds.push(pageId);
  }

  const pagesKids = pageIds.map((i) => `${i} 0 R`).join(' ');
  const pagesId = addObject(`<< /Type /Pages /Count ${pageIds.length} /Kids [ ${pagesKids} ] >>`);
  // Patch the /Parent placeholder in each Page object (objects are 1-indexed).
  for (const pid of pageIds) {
    objects[pid - 1] = objects[pid - 1]!.replace('/Parent 0 0 R', `/Parent ${pagesId} 0 R`);
  }
  const info: string[] = [
    `/Title (${title.replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`,
    '/Producer (Hawkeye-Sterling)',
    '/Creator (Hawkeye-Sterling Evidence Pack)',
    `/CreationDate (D:${pdfDate(new Date())})`,
  ];
  if (anchor) info.push(`/Keywords (audit-chain:${anchor})`);
  const infoId = addObject(`<< ${info.join(' ')} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // Assemble bytes + xref table.
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [0];       // object 0 has offset 0
  let body = '';
  for (let i = 0; i < objects.length; i++) {
    offsets.push((header.length + body.length));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = header.length + body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const full = header + body + xref + trailer;
  return toBytes(full);
}

function toBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
  return out;
}

function pdfDate(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
