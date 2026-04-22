'use strict';
const fs = require('fs');
function items(path) {
  return fs.readFileSync(path, 'utf8').split(',').map(s => s.trim()).filter(Boolean);
}
function slug(s) {
  return s.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\/]/g, '_')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
const groups = {
  competencies: items('/tmp/competencies.txt'),
  reasoning: items('/tmp/reasoning.txt'),
  analysis: items('/tmp/analysis.txt'),
};
const out = [];
out.push("// Hawkeye Sterling — MLRO competencies, reasoning types, and analysis catalogue.");
out.push("// Surfaced in the Module 01 Subject Screening tool as a queryable tag set.");
out.push("// Sourced from operator input; every entry has a stable id + human label.");
out.push("");
out.push("export interface MlroCapability {");
out.push("  id: string;");
out.push("  label: string;");
out.push("  bucket: 'competency' | 'reasoning' | 'analysis';");
out.push("}");
out.push("");
const seen = new Set();
for (const bucket of Object.keys(groups)) {
  const arr = groups[bucket];
  const varname = bucket === 'competencies' ? 'MLRO_COMPETENCIES'
    : bucket === 'reasoning' ? 'MLRO_REASONING_TYPES'
    : 'MLRO_ANALYSIS_TYPES';
  out.push(`export const ${varname}: ReadonlyArray<MlroCapability> = [`);
  for (const label of arr) {
    let id = slug(label);
    // If a collision with an earlier bucket, prefix with bucket.
    if (seen.has(id)) id = (bucket === 'competencies' ? 'comp' : bucket === 'reasoning' ? 'reas' : 'anal') + '_' + id;
    seen.add(id);
    const b = bucket === 'competencies' ? 'competency' : bucket === 'reasoning' ? 'reasoning' : 'analysis';
    out.push(`  { id: ${JSON.stringify(id)}, label: ${JSON.stringify(label)}, bucket: '${b}' },`);
  }
  out.push(`];`);
  out.push('');
}
out.push("export const MLRO_CAPABILITIES: ReadonlyArray<MlroCapability> = [");
out.push("  ...MLRO_COMPETENCIES,");
out.push("  ...MLRO_REASONING_TYPES,");
out.push("  ...MLRO_ANALYSIS_TYPES,");
out.push("];");
out.push("");
out.push("export const MLRO_CAPABILITY_BY_ID: Map<string, MlroCapability> = new Map(MLRO_CAPABILITIES.map((c) => [c.id, c]));");
out.push("");
out.push("export const MLRO_CAPABILITIES_BY_BUCKET: Record<MlroCapability['bucket'], MlroCapability[]> = {");
out.push("  competency: [...MLRO_COMPETENCIES],");
out.push("  reasoning: [...MLRO_REASONING_TYPES],");
out.push("  analysis: [...MLRO_ANALYSIS_TYPES],");
out.push("};");
out.push("");
out.push("export function searchCapabilities(query: string): MlroCapability[] {");
out.push("  const q = query.trim().toLowerCase();");
out.push("  if (!q) return [];");
out.push("  const tokens = q.split(/\\s+/).filter(Boolean);");
out.push("  return MLRO_CAPABILITIES.filter((c) => {");
out.push("    const hay = (c.label + ' ' + c.id).toLowerCase();");
out.push("    return tokens.every((t) => hay.includes(t));");
out.push("  });");
out.push("}");
process.stdout.write(out.join('\n') + '\n');
