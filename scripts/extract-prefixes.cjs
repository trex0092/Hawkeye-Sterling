'use strict';
const fs = require('fs');

const src = fs.readFileSync('public/deep-reasoning.js', 'utf8');

// Walk through the file and pull out every `{ id: '...' ... }` object
// literal, whether multi-line or inline-single-line, with string + escape
// awareness across ' " and `.
const blocks = [];
let i = 0;
while (i < src.length) {
  const open = src.indexOf('{', i);
  if (open === -1) break;
  const head = src.substring(open + 1, open + 200);
  if (!/^\s*id:\s*['"][a-z_]+['"]/.test(head)) { i = open + 1; continue; }
  let depth = 0, j = open, inStr = false, quote = '';
  for (; j < src.length; j++) {
    const ch = src[j];
    const prev = j > 0 ? src[j - 1] : '';
    if (inStr) {
      if (ch === '\\') { j++; continue; }
      if (ch === quote) { inStr = false; quote = ''; }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      if (prev !== '\\') { inStr = true; quote = ch; continue; }
    }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  blocks.push(src.substring(open, j));
  i = j;
}

// Each extracted block is a valid JS object literal. Wrap in parens and
// eval via Function constructor — strings (however long, however escaped)
// come out correctly every time.
const prefixes = new Map();
const questions = new Map();
let evalFailures = 0;
for (const b of blocks) {
  let obj;
  try { obj = Function('"use strict"; return (' + b + ');')(); }
  catch (_err) { evalFailures++; continue; }
  if (!obj || typeof obj.id !== 'string') continue;
  const label = typeof obj.label === 'string' ? obj.label : obj.id;
  const description = typeof obj.description === 'string' ? obj.description : '';
  if (typeof obj.prefix === 'string' && !prefixes.has(obj.id)) {
    prefixes.set(obj.id, { id: obj.id, label, description, prefix: obj.prefix });
  } else if (typeof obj.question === 'string' && !questions.has(obj.id)) {
    questions.set(obj.id, { id: obj.id, label, description, question: obj.question });
  }
}
if (evalFailures > 0) console.error('eval failures:', evalFailures);

console.error('extracted', prefixes.size, 'prefixes +', questions.size, 'question templates from', blocks.length, 'blocks');

const lines = [];
lines.push("// AUTO-GENERATED — do not hand-edit.");
lines.push("// Extracted from public/deep-reasoning.js via scripts/extract-prefixes.cjs.");
lines.push("// Re-run: node scripts/extract-prefixes.cjs > src/brain/mlro-prefixes.generated.ts");
lines.push("");
lines.push("export interface MlroPrefix {");
lines.push("  id: string;");
lines.push("  label: string;");
lines.push("  description: string;");
lines.push("  prefix: string;");
lines.push("}");
lines.push("");
lines.push("export interface MlroQuestionTemplate {");
lines.push("  id: string;");
lines.push("  label: string;");
lines.push("  description: string;");
lines.push("  question: string;");
lines.push("}");
lines.push("");
lines.push("export const MLRO_PREFIXES: ReadonlyArray<MlroPrefix> = [");
for (const m of prefixes.values()) {
  lines.push('  { id: ' + JSON.stringify(m.id)
    + ', label: ' + JSON.stringify(m.label)
    + ', description: ' + JSON.stringify(m.description)
    + ', prefix: ' + JSON.stringify(m.prefix) + ' },');
}
lines.push("];");
lines.push("");
lines.push("export const MLRO_QUESTION_TEMPLATES: ReadonlyArray<MlroQuestionTemplate> = [");
for (const m of questions.values()) {
  lines.push('  { id: ' + JSON.stringify(m.id)
    + ', label: ' + JSON.stringify(m.label)
    + ', description: ' + JSON.stringify(m.description)
    + ', question: ' + JSON.stringify(m.question) + ' },');
}
lines.push("];");
lines.push("");
lines.push("export const MLRO_PREFIX_BY_ID: Map<string, MlroPrefix> = new Map(MLRO_PREFIXES.map((m) => [m.id, m]));");
lines.push("export const MLRO_QUESTION_BY_ID: Map<string, MlroQuestionTemplate> = new Map(MLRO_QUESTION_TEMPLATES.map((m) => [m.id, m]));");
lines.push("");
lines.push("export function prefixFor(id: string): string | undefined {");
lines.push("  return MLRO_PREFIX_BY_ID.get(id)?.prefix;");
lines.push("}");
lines.push("");
lines.push("export function questionFor(id: string): string | undefined {");
lines.push("  return MLRO_QUESTION_BY_ID.get(id)?.question;");
lines.push("}");
process.stdout.write(lines.join('\n') + '\n');
