// Hawkeye Sterling — regulator-readable verdict exporter.
//
// Converts a BrainVerdict into Markdown or HTML. Every section foregrounds
// the charter's mandatory 7-section output structure plus the new fusion
// observables (posterior, conflicts, firepower, introspection) so a
// regulator reading the output sees every dimension of the brain's work.
//
// Charter P9 (opaque scoring) is honoured by emitting:
//   · prior + posterior
//   · per-finding score × confidence × contributing LRs
//   · per-faculty activation table
//   · methodology string
//   · introspection chain-quality and confidence adjustment.

import type { BrainVerdict, FindingConflict } from '../brain/types.js';

export interface ExportOptions {
  includeChain?: boolean;         // default true
  includeFindings?: boolean;      // default true
  includeFirepower?: boolean;     // default true
  includeIntrospection?: boolean; // default true
  includeConflicts?: boolean;     // default true
  auditLine?: string;             // optional custom audit footer
}

export function verdictToMarkdown(v: BrainVerdict, opts: ExportOptions = {}): string {
  const lines: string[] = [];
  const o = {
    includeChain: opts.includeChain ?? true,
    includeFindings: opts.includeFindings ?? true,
    includeFirepower: opts.includeFirepower ?? true,
    includeIntrospection: opts.includeIntrospection ?? true,
    includeConflicts: opts.includeConflicts ?? true,
  };

  // 1. Subject identifiers.
  lines.push(`# Hawkeye Sterling — Verdict`);
  lines.push('');
  lines.push(`## 1. Subject Identifiers`);
  lines.push(`- **Name:** ${v.subject.name}`);
  lines.push(`- **Type:** ${v.subject.type}`);
  if (v.subject.jurisdiction) lines.push(`- **Jurisdiction:** ${v.subject.jurisdiction}`);
  if (v.subject.dateOfBirth) lines.push(`- **Date of birth:** ${v.subject.dateOfBirth}`);
  if (v.subject.dateOfIncorporation) lines.push(`- **Date of incorporation:** ${v.subject.dateOfIncorporation}`);
  if (v.subject.identifiers) {
    for (const [k, val] of Object.entries(v.subject.identifiers)) {
      lines.push(`- **${k}:** ${val}`);
    }
  }
  lines.push('');

  // 2. Scope declaration.
  lines.push(`## 2. Scope Declaration`);
  lines.push(`- **Run ID:** \`${v.runId}\``);
  lines.push(`- **Generated at:** ${new Date(v.generatedAt).toISOString()}`);
  lines.push(`- **Modes run:** ${v.findings.length}`);
  if (v.primaryHypothesis) {
    lines.push(`- **Primary hypothesis:** \`${v.primaryHypothesis}\``);
  }
  if (v.prior !== undefined && v.posterior !== undefined) {
    lines.push(`- **Prior P(H):** ${v.prior.toFixed(3)}`);
    lines.push(`- **Posterior P(H|E):** ${v.posterior.toFixed(3)}`);
  }
  if (v.consensus) lines.push(`- **Consensus:** ${v.consensus}`);
  lines.push('');

  // 3. Verdict + aggregate scores.
  lines.push(`## 3. Verdict`);
  lines.push(`- **Outcome:** \`${v.outcome}\``);
  lines.push(`- **Aggregate score:** ${v.aggregateScore.toFixed(3)}`);
  lines.push(`- **Aggregate confidence:** ${v.aggregateConfidence.toFixed(3)}`);
  if (v.methodology) {
    lines.push('');
    lines.push(`**Methodology:** ${v.methodology}`);
  }
  lines.push('');

  // 4. Findings (per-mode).
  if (o.includeFindings && v.findings.length > 0) {
    lines.push(`## 4. Findings`);
    lines.push('');
    lines.push(`| # | Mode | Category | Faculties | Verdict | Score | Confidence | Rationale |`);
    lines.push(`|---|------|----------|-----------|---------|-------|------------|-----------|`);
    v.findings.forEach((f, i) => {
      const r = shorten(f.rationale, 120);
      lines.push(`| ${i + 1} | \`${f.modeId}\` | ${f.category} | ${f.faculties.join(', ')} | ${f.verdict} | ${f.score.toFixed(2)} | ${f.confidence.toFixed(2)} | ${r} |`);
    });
    lines.push('');
  }

  // 5. Gaps — evidence gaps and faculty blind spots (mandatory section per HS-GOV-001).
  {
    const gapFindings = v.findings.filter((f) => f.verdict === 'inconclusive' && f.score === 0);
    const coverageGaps = v.introspection?.coverageGaps ?? [];
    const metaWarnings = (v.introspection?.metaCheckWarnings ?? []).filter((w) => w.startsWith('MC-2:'));
    if (gapFindings.length > 0 || coverageGaps.length > 0 || metaWarnings.length > 0) {
      lines.push(`## 5. Gaps`);
      lines.push('');
      for (const f of gapFindings) {
        lines.push(`- **[${f.modeId}]** ${shorten(f.rationale, 200)}`);
      }
      for (const g of coverageGaps) lines.push(`- ${g}`);
      for (const w of metaWarnings) lines.push(`- ${w}`);
      lines.push('');
    }
  }

  // 6. Red flags — typology indicators with score > 0.5 (mandatory section per HS-GOV-001).
  {
    const RED_FLAG_CATEGORIES = new Set<string>([
      'sectoral_typology', 'predicate_crime', 'proliferation', 'behavioral_signals',
    ]);
    const redFlags = v.findings.filter(
      (f) => RED_FLAG_CATEGORIES.has(f.category) && f.score > 0.5,
    );
    if (redFlags.length > 0) {
      lines.push(`## 6. Red Flags`);
      lines.push('');
      for (const f of redFlags) {
        lines.push(`- **[${f.modeId}]** ${f.category} · score ${f.score.toFixed(2)} · ${shorten(f.rationale, 200)}`);
      }
      lines.push('');
    }
  }

  // 7. Hypothesis posteriors (breadcrumb for under-explored hypotheses).
  if (v.posteriorsByHypothesis && Object.keys(v.posteriorsByHypothesis).length > 0) {
    lines.push(`## 7. Hypothesis Posteriors`);
    lines.push('');
    lines.push(`| Hypothesis | Posterior |`);
    lines.push(`|------------|-----------|`);
    for (const [h, p] of Object.entries(v.posteriorsByHypothesis)) {
      lines.push(`| \`${h}\` | ${p === undefined ? 'n/a' : p.toFixed(3)} |`);
    }
    lines.push('');
  }

  // 8. Conflicts.
  if (o.includeConflicts && v.conflicts && v.conflicts.length > 0) {
    lines.push(`## 8. Conflicts (escalate rather than average away)`);
    lines.push('');
    for (const c of v.conflicts) lines.push(`- ${renderConflict(c)}`);
    lines.push('');
  }

  // 9. Firepower.
  if (o.includeFirepower && v.firepower) {
    lines.push(`## 9. Cognitive Firepower`);
    lines.push('');
    lines.push(`- **Modes fired:** ${v.firepower.modesFired}`);
    lines.push(`- **Faculties engaged:** ${v.firepower.facultiesEngaged} / ${v.firepower.activations.length}`);
    lines.push(`- **Categories spanned:** ${v.firepower.categoriesSpanned}`);
    lines.push(`- **Independent evidence items:** ${v.firepower.independentEvidenceCount}`);
    lines.push(`- **Composite firepower score:** ${v.firepower.firepowerScore.toFixed(3)}`);
    lines.push('');
    lines.push(`| Faculty | Status | Modes fired | Weighted score | Weighted confidence |`);
    lines.push(`|---------|--------|-------------|----------------|---------------------|`);
    for (const a of v.firepower.activations) {
      lines.push(`| ${a.facultyId} | ${a.status} | ${a.modesFired} | ${a.weightedScore.toFixed(2)} | ${a.weightedConfidence.toFixed(2)} |`);
    }
    lines.push('');
  }

  // 10. Introspection.
  if (o.includeIntrospection && v.introspection) {
    lines.push(`## 10. Introspection`);
    lines.push('');
    lines.push(`- **Chain quality:** ${v.introspection.chainQuality.toFixed(3)}`);
    lines.push(`- **Calibration gap:** ${v.introspection.calibrationGap.toFixed(3)}`);
    lines.push(`- **Confidence adjustment:** ${v.introspection.confidenceAdjustment >= 0 ? '+' : ''}${v.introspection.confidenceAdjustment.toFixed(3)}`);
    if (v.introspection.biasesDetected.length > 0) {
      lines.push(`- **Biases detected:** ${v.introspection.biasesDetected.join(', ')}`);
    }
    if (v.introspection.coverageGaps.length > 0) {
      lines.push(`- **Coverage gaps:** ${v.introspection.coverageGaps.join(', ')}`);
    }
    lines.push('');
    if (v.introspection.notes.length > 0) {
      lines.push(`**Notes:** ${v.introspection.notes.join('; ')}`);
      lines.push('');
    }
  }

  // 11. Reasoning chain (optional, can be long).
  if (o.includeChain && v.chain.length > 0) {
    lines.push(`## 11. Reasoning Chain`);
    lines.push('');
    for (const node of v.chain) {
      lines.push(`${node.step}. [${node.faculty}] \`${node.modeId}\` — ${shorten(node.summary, 180)}`);
    }
    lines.push('');
  }

  // 12. Recommended next steps.
  lines.push(`## 12. Recommended Next Steps`);
  for (const a of v.recommendedActions) lines.push(`- ${a}`);
  lines.push('');

  // 13. Audit line.
  lines.push(`## 13. Audit Line`);
  lines.push(`- Produced by Hawkeye Sterling brain engine, run \`${v.runId}\`, ${new Date(v.generatedAt).toISOString()}.`);
  if (opts.auditLine) lines.push(`- ${opts.auditLine}`);
  lines.push('');

  return lines.join('\n');
}

export function verdictToHtml(v: BrainVerdict, opts: ExportOptions = {}): string {
  const md = verdictToMarkdown(v, opts);
  return wrapHtml(v.subject.name, markdownToHtml(md));
}

// ── helpers ────────────────────────────────────────────────────────────

function shorten(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length <= n ? clean : clean.slice(0, n - 1) + '…';
}

function renderConflict(c: FindingConflict): string {
  return `**${c.a}** (${c.aVerdict}@${c.aScore.toFixed(2)}) vs **${c.b}** (${c.bVerdict}@${c.bScore.toFixed(2)}), Δ=${c.delta.toFixed(2)}${c.hypothesis ? ` [H=${c.hypothesis}]` : ''} — ${c.note}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Minimal Markdown → HTML for the subset we actually produce here (#, ##, -,
// |…| tables, inline `code` and **bold**). Not a full CommonMark parser.
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inTable = false;
  let inList = false;
  const flushList = (): void => { if (inList) { out.push('</ul>'); inList = false; } };
  const flushTable = (): void => {
    if (inTable) { out.push('</tbody></table>'); inTable = false; }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw;
    if (/^# /.test(line)) { flushList(); flushTable(); out.push(`<h1>${inline(esc(line.slice(2)))}</h1>`); continue; }
    if (/^## /.test(line)) { flushList(); flushTable(); out.push(`<h2>${inline(esc(line.slice(3)))}</h2>`); continue; }
    if (/^### /.test(line)) { flushList(); flushTable(); out.push(`<h3>${inline(esc(line.slice(4)))}</h3>`); continue; }
    if (/^- /.test(line)) {
      flushTable();
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(esc(line.slice(2)))}</li>`);
      continue;
    }
    if (/^\|.+\|$/.test(line)) {
      flushList();
      const cells = line.slice(1, -1).split('|').map((c) => c.trim());
      const next = lines[i + 1] ?? '';
      if (!inTable && /^\|[\s\-:|]+\|$/.test(next)) {
        out.push('<table><thead><tr>');
        for (const c of cells) out.push(`<th>${inline(esc(c))}</th>`);
        out.push('</tr></thead><tbody>');
        inTable = true;
        i++; // skip separator
        continue;
      }
      if (inTable) {
        out.push('<tr>');
        for (const c of cells) out.push(`<td>${inline(esc(c))}</td>`);
        out.push('</tr>');
        continue;
      }
    }
    if (line.trim() === '') { flushList(); flushTable(); out.push(''); continue; }
    flushList(); flushTable();
    out.push(`<p>${inline(esc(line))}</p>`);
  }
  flushList(); flushTable();
  return out.join('\n');
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function wrapHtml(title: string, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>Hawkeye Sterling — ${esc(title)}</title>`,
    '<style>',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#1b2432;}',
    'h1{border-bottom:2px solid #0b3a5b;padding-bottom:0.25rem;}',
    'h2{color:#0b3a5b;margin-top:2rem;}',
    'table{border-collapse:collapse;width:100%;margin:0.5rem 0;}',
    'th,td{border:1px solid #ccd3dc;padding:0.4rem 0.6rem;text-align:left;font-size:0.9rem;}',
    'th{background:#eef2f7;}',
    'code{background:#f2f4f8;padding:0 0.25rem;border-radius:3px;}',
    'ul{padding-left:1.25rem;}',
    '</style>',
    '</head><body>',
    body,
    '</body></html>',
  ].join('\n');
}

export interface VerdictDigest {
  outcome: string;
  score: number;
  confidence: number;
  posterior?: number;
  chainQuality?: number;
  firepower?: number;
  conflicts: number;
  biases: number;
  modesFired: number;
}

/** One-line TL;DR of a verdict — handy for logs / executive tiles. */
export function digest(v: BrainVerdict): VerdictDigest {
  const d: VerdictDigest = {
    outcome: v.outcome,
    score: v.aggregateScore,
    confidence: v.aggregateConfidence,
    conflicts: v.conflicts?.length ?? 0,
    biases: v.introspection?.biasesDetected.length ?? 0,
    modesFired: v.findings.length,
  };
  if (v.posterior !== undefined) d.posterior = v.posterior;
  if (v.introspection?.chainQuality !== undefined) d.chainQuality = v.introspection.chainQuality;
  if (v.firepower?.firepowerScore !== undefined) d.firepower = v.firepower.firepowerScore;
  return d;
}

