'use strict';
const fs = require('fs');
function items(path) {
  return fs.readFileSync(path, 'utf8').split(',').map(s => s.trim()).filter(Boolean);
}
function slug(s) {
  return s.toLowerCase()
    .replace(/\(|\)/g, '')
    .replace(/&/g, 'and')
    .replace(/\//g, '_')
    .replace(/\+/g, 'plus')
    .replace(/%/g, 'pct')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
const groups = [
  { key: 'transaction',  file: '/tmp/rf-transaction.txt',  label: 'Transaction-level' },
  { key: 'customer',     file: '/tmp/rf-customer.txt',     label: 'Customer-level' },
  { key: 'supplier',     file: '/tmp/rf-supplier.txt',     label: 'Supplier / counterparty' },
  { key: 'geographic',   file: '/tmp/rf-geographic.txt',   label: 'Geographic' },
  { key: 'product',      file: '/tmp/rf-product.txt',      label: 'Product / instrument' },
  { key: 'behavioral',   file: '/tmp/rf-behavioral.txt',   label: 'Behavioral / pattern' },
  { key: 'regulatory',   file: '/tmp/rf-regulatory.txt',   label: 'Regulatory / enforcement' },
];

const seen = new Set();
const entries = [];
let total = 0;
const byBucket = {};

for (const g of groups) {
  const arr = items(g.file);
  byBucket[g.key] = [];
  let collisions = 0;
  for (const label of arr) {
    let id = slug(label);
    // Prefix with bucket if collision (handles the "Gold bars origin undocumented" duplicate in product list).
    if (seen.has(id)) {
      id = g.key.slice(0, 4) + '_' + id;
      collisions++;
      if (seen.has(id)) continue;  // drop exact duplicate
    }
    seen.add(id);
    entries.push({ id, label, bucket: g.key });
    byBucket[g.key].push(id);
    total++;
  }
  if (collisions) process.stderr.write(`${g.key}: ${collisions} collisions re-prefixed\n`);
}

process.stderr.write(`total red flags: ${total} across ${groups.length} buckets\n`);

const out = [];
out.push("// Hawkeye Sterling — MLRO red-flag taxonomy.");
out.push("// AUTO-GENERATED from operator input (scripts/gen-redflags.cjs).");
out.push("// 7 buckets × ~700 flags. Stable ids, human labels.");
out.push("");
out.push("export type RedFlagBucket = 'transaction' | 'customer' | 'supplier' | 'geographic' | 'product' | 'behavioral' | 'regulatory';");
out.push("");
out.push("export interface MlroRedFlag {");
out.push("  id: string;");
out.push("  label: string;");
out.push("  bucket: RedFlagBucket;");
out.push("}");
out.push("");
out.push("export const MLRO_RED_FLAGS_TAXONOMY: ReadonlyArray<MlroRedFlag> = [");
for (const e of entries) {
  out.push(`  { id: ${JSON.stringify(e.id)}, label: ${JSON.stringify(e.label)}, bucket: '${e.bucket}' },`);
}
out.push("];");
out.push("");
out.push("export const MLRO_RED_FLAG_BY_ID: Map<string, MlroRedFlag> = new Map(MLRO_RED_FLAGS_TAXONOMY.map((rf) => [rf.id, rf]));");
out.push("");
out.push("export const MLRO_RED_FLAGS_BY_BUCKET: Record<RedFlagBucket, MlroRedFlag[]> = {");
for (const g of groups) {
  out.push(`  ${g.key}: [`);
  for (const id of byBucket[g.key]) {
    out.push(`    MLRO_RED_FLAG_BY_ID.get(${JSON.stringify(id)})!,`);
  }
  out.push("  ],");
}
out.push("};");
out.push("");
out.push("export const MLRO_RED_FLAG_BUCKET_LABELS: Record<RedFlagBucket, string> = {");
for (const g of groups) {
  out.push(`  ${g.key}: ${JSON.stringify(g.label)},`);
}
out.push("};");
out.push("");
out.push("export function searchRedFlags(query: string): MlroRedFlag[] {");
out.push("  const q = query.trim().toLowerCase();");
out.push("  if (!q) return [];");
out.push("  const tokens = q.split(/\\s+/).filter(Boolean);");
out.push("  return MLRO_RED_FLAGS_TAXONOMY.filter((rf) => {");
out.push("    const hay = (rf.label + ' ' + rf.id + ' ' + rf.bucket).toLowerCase();");
out.push("    return tokens.every((t) => hay.includes(t));");
out.push("  });");
out.push("}");
process.stdout.write(out.join('\n') + '\n');
