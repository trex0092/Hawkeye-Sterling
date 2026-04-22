// Hawkeye Sterling — pipeline result exporter.
// Converts a MlroPipelineResult into JSON / Markdown / HTML envelopes
// suitable for:
//   - attaching to an Asana task (JSON)
//   - pasting into a goAML free-text field (Markdown stripped of headers)
//   - printing / archiving (HTML, self-contained)

import type { MlroPipelineResult } from './mlro-pipeline.js';

export interface ExportEnvelope {
  format: 'json' | 'markdown' | 'html';
  mimeType: string;
  filename: string;
  content: string;
}

export function exportResult(
  result: MlroPipelineResult,
  opts: { caseId: string; subjectName: string; format: 'json' | 'markdown' | 'html' },
): ExportEnvelope {
  switch (opts.format) {
    case 'json': return exportJson(result, opts);
    case 'markdown': return exportMarkdown(result, opts);
    case 'html': return exportHtml(result, opts);
  }
}

function fname(base: string, format: string): string {
  const safe = base.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 60);
  const ext = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'html';
  return `${safe}.${ext}`;
}

function exportJson(result: MlroPipelineResult, opts: { caseId: string; subjectName: string }): ExportEnvelope {
  const envelope = {
    product: 'Hawkeye Sterling V2',
    caseId: opts.caseId,
    subject: opts.subjectName,
    generatedAt: new Date().toISOString(),
    result,
  };
  return {
    format: 'json',
    mimeType: 'application/json',
    filename: fname(`${opts.caseId}_${opts.subjectName}`, 'json'),
    content: JSON.stringify(envelope, null, 2),
  };
}

function exportMarkdown(result: MlroPipelineResult, opts: { caseId: string; subjectName: string }): ExportEnvelope {
  const lines: string[] = [];
  lines.push(`# Deep-Reasoning result — ${opts.caseId}`);
  lines.push('');
  lines.push(`Subject: **${opts.subjectName}**  `);
  lines.push(`Generated: ${new Date().toISOString()} UTC  `);
  lines.push(`Budget: ${result.budgetMs / 1000}s · elapsed: ${Math.round(result.totalElapsedMs)}ms  `);
  lines.push(`Charter egress: ${result.charterGate.allowed ? '✓ passed' : '✗ blocked'}  `);
  if (result.partial) {
    lines.push('');
    lines.push(`> ⚠ Partial reply — ${result.guidance ?? 'budget exceeded'}`);
  }
  lines.push('');
  lines.push('## Reasoning chain');
  for (let i = 0; i < result.stepResults.length; i++) {
    const s = result.stepResults[i]!;
    lines.push('');
    lines.push(`### ${i + 1}. \`${s.modeId}\` — ${s.elapsedMs}ms ${s.partial ? '(partial)' : s.ok ? '' : '(failed)'}`);
    lines.push('');
    lines.push('```');
    lines.push(s.text);
    lines.push('```');
  }
  if (Object.keys(result.sections).length > 0) {
    lines.push('');
    lines.push('## Merged sections');
    for (const [h, body] of Object.entries(result.sections)) {
      lines.push('');
      lines.push(`### ${h}`);
      lines.push('');
      lines.push(body);
    }
  }
  lines.push('');
  lines.push('## Audit chain');
  lines.push('');
  lines.push('| # | mode | at | elapsed | ok | entryHash |');
  lines.push('|---|------|----|--------:|:--:|-----------|');
  for (const a of result.audit) {
    lines.push(`| ${a.seq} | \`${a.modeId}\` | ${a.at} | ${a.elapsedMs}ms | ${a.ok ? '✓' : a.partial ? '⋯' : '✗'} | \`${a.entryHash}\` |`);
  }
  lines.push('');
  lines.push('> Decision support, not a decision. MLRO review required (FDL 10/2025 Art.20-21).');
  return {
    format: 'markdown',
    mimeType: 'text/markdown',
    filename: fname(`${opts.caseId}_${opts.subjectName}`, 'markdown'),
    content: lines.join('\n'),
  };
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function exportHtml(result: MlroPipelineResult, opts: { caseId: string; subjectName: string }): ExportEnvelope {
  const steps = result.stepResults.map((s, i) => `
    <section class="step">
      <header>
        <span class="n">${i + 1}</span>
        <code>${escape(s.modeId)}</code>
        <span class="ms">${s.elapsedMs}ms</span>
        <span class="flag flag-${s.partial ? 'partial' : s.ok ? 'ok' : 'fail'}">${s.partial ? 'partial' : s.ok ? 'ok' : 'fail'}</span>
      </header>
      <pre>${escape(s.text)}</pre>
    </section>`).join('');
  const sections = Object.entries(result.sections).map(([h, body]) => `
    <section class="sec"><h3>${escape(h)}</h3><pre>${escape(body)}</pre></section>`).join('');
  const audit = result.audit.map((a) => `
    <tr>
      <td>${a.seq}</td><td><code>${escape(a.modeId)}</code></td><td class="mono">${a.at}</td>
      <td>${a.elapsedMs}ms</td><td>${a.ok ? '✓' : a.partial ? '⋯' : '✗'}</td>
      <td class="mono">${a.entryHash}</td>
    </tr>`).join('');
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>Deep reasoning — ${escape(opts.caseId)}</title>
<style>
body{background:#08090B;color:#E5E7EB;font:14px/1.55 system-ui;margin:0;padding:24px}
h1,h2,h3{color:#F0ABFC;letter-spacing:.01em}
.mono,code,pre{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px}
pre{background:#06070A;padding:12px;border-radius:8px;border:1px solid #1f2128;white-space:pre-wrap}
.step{margin:12px 0;padding:12px;border:1px solid #1f2128;border-radius:8px;background:#0B0D13}
.step header{display:flex;gap:10px;align-items:baseline}
.step .n{color:#E879F9;font-weight:600}
.step .ms{color:#9CA3AF}
.flag{margin-left:auto;padding:2px 8px;border-radius:999px;border:1px solid #334;font-size:11px}
.flag-ok{color:#34D399;border-color:rgba(52,211,153,.5)}
.flag-partial{color:#FCD34D;border-color:rgba(252,211,77,.5)}
.flag-fail{color:#F87171;border-color:rgba(248,113,113,.5)}
.sec{margin:10px 0}
table{border-collapse:collapse;width:100%;margin:10px 0}
th,td{padding:6px 8px;border-bottom:1px solid #1f2128;text-align:left}
.foot{color:#9CA3AF;margin-top:24px;border-top:1px solid #1f2128;padding-top:12px;font-size:12px}
.warn{color:#FCD34D;background:rgba(252,211,77,.08);padding:10px 12px;border-radius:8px;border:1px solid rgba(252,211,77,.4);margin:12px 0}
</style></head><body>
<h1>Deep-Reasoning result</h1>
<p><strong>${escape(opts.subjectName)}</strong> · ${escape(opts.caseId)} · ${new Date().toISOString()} UTC</p>
<p>Budget: ${result.budgetMs / 1000}s · elapsed: ${Math.round(result.totalElapsedMs)}ms · charter egress: ${result.charterGate.allowed ? '<span style="color:#34D399">passed</span>' : '<span style="color:#F87171">blocked</span>'}</p>
${result.partial ? `<div class="warn">Partial reply — ${escape(result.guidance ?? 'budget exceeded')}</div>` : ''}
<h2>Reasoning chain</h2>${steps}
${sections ? '<h2>Merged sections</h2>' + sections : ''}
<h2>Audit chain</h2>
<table><thead><tr><th>#</th><th>mode</th><th>at</th><th>elapsed</th><th>ok</th><th>entryHash</th></tr></thead><tbody>${audit}</tbody></table>
<p class="foot">Decision support, not a decision. MLRO review required (FDL 10/2025 Art.20-21).</p>
</body></html>`;
  return {
    format: 'html',
    mimeType: 'text/html',
    filename: fname(`${opts.caseId}_${opts.subjectName}`, 'html'),
    content: html,
  };
}
