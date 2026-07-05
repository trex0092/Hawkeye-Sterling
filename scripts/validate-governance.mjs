#!/usr/bin/env node
// Governance-consistency validator.
//
// Enforces that the repository's governance surface stays internally consistent,
// so the documentation is a checked control rather than prose that silently rots.
// Runs in CI (.github/workflows/governance-check.yml) and locally:
//
//   node scripts/validate-governance.mjs
//
// Zero dependencies — plain Node ESM, deterministic, no network.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (msg) => errors.push(msg);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ── 1. Required governance files exist ──────────────────────────────────────
const REQUIRED_FILES = [
  'README.md',
  'LICENSE',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'GOVERNANCE.md',
  'MAINTAINERS.md',
  'SUPPORT.md',
  'SECURITY.md',
  'SECURITY-INSIGHTS.yml',
  'CITATION.cff',
  'RELEASING.md',
  '.github/CODEOWNERS',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/config.yml',
  'web/public/.well-known/security.txt',
  'docs/adr/README.md',
  'docs/security/THREAT_MODEL.md',
  'docs/DATA-CLASSIFICATION.md',
];
for (const f of REQUIRED_FILES) {
  if (!existsSync(join(ROOT, f))) fail(`Required governance file missing: ${f}`);
}

// ── 2. Label taxonomy (source of truth) ─────────────────────────────────────
const knownLabels = new Set();
try {
  for (const line of read('.github/labels.yml').split('\n')) {
    const m = line.match(/^\s*-\s*name:\s*['"]?([^'"]+?)['"]?\s*$/);
    if (m) knownLabels.add(m[1]);
  }
  if (knownLabels.size === 0) fail('.github/labels.yml parsed zero labels');
} catch {
  fail('.github/labels.yml is unreadable');
}

// ── 3. Issue-template labels must exist in the taxonomy ──────────────────────
const tplDir = '.github/ISSUE_TEMPLATE';
for (const file of readdirSync(join(ROOT, tplDir))) {
  if (!file.endsWith('.md')) continue;
  const body = read(join(tplDir, file));
  const fm = body.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { fail(`${tplDir}/${file}: missing YAML front-matter`); continue; }
  const labelsLine = fm[1].match(/^labels:\s*(.+)$/m);
  if (!labelsLine) continue; // labels are optional
  for (const raw of labelsLine[1].split(',')) {
    const label = raw.trim().replace(/^['"]|['"]$/g, '');
    if (label && !knownLabels.has(label)) {
      fail(`${tplDir}/${file}: label "${label}" is not defined in .github/labels.yml`);
    }
  }
}

// ── 4. Labeler config labels must exist in the taxonomy ─────────────────────
if (existsSync(join(ROOT, '.github/labeler.yml'))) {
  for (const line of read('.github/labeler.yml').split('\n')) {
    const m = line.match(/^['"]([^'"]+)['"]\s*:/);
    if (m && !knownLabels.has(m[1])) {
      fail(`.github/labeler.yml: label "${m[1]}" is not defined in .github/labels.yml`);
    }
  }
}

// ── 5. ADR index ↔ ADR files are in sync ────────────────────────────────────
const adrDir = 'docs/adr';
const adrFiles = readdirSync(join(ROOT, adrDir))
  .filter((f) => /^\d{4}-.*\.md$/.test(f) && f !== '0000-template.md');
const adrReadme = read(join(adrDir, 'README.md'));
const indexed = new Set(
  [...adrReadme.matchAll(/\]\(\.\/(\d{4}-[a-z0-9-]+\.md)\)/g)].map((m) => m[1]),
);
for (const f of adrFiles) {
  if (!indexed.has(f)) fail(`ADR ${f} exists but is not listed in ${adrDir}/README.md index`);
}
for (const f of indexed) {
  if (!existsSync(join(ROOT, adrDir, f))) fail(`${adrDir}/README.md indexes ${f}, which does not exist`);
}
// ADR files must declare a Status line
for (const f of adrFiles) {
  if (!/^\s*-\s*\*\*Status:\*\*/m.test(read(join(adrDir, f)))) {
    fail(`ADR ${f}: missing "**Status:**" line`);
  }
}

// ── 6. CODEOWNERS literal (non-glob) paths must exist ───────────────────────
for (const line of read('.github/CODEOWNERS').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const pattern = trimmed.split(/\s+/)[0];
  if (pattern === '*' || /[*?\[]/.test(pattern)) continue; // skip globs
  const rel = pattern.replace(/^\//, '').replace(/\/$/, '');
  if (!existsSync(join(ROOT, rel))) {
    fail(`.github/CODEOWNERS references "${pattern}", which does not exist`);
  }
}

// ── 7. security.txt Expires must be in the future ───────────────────────────
const sec = read('web/public/.well-known/security.txt');
const exp = sec.match(/^Expires:\s*(.+)$/m);
if (!exp) {
  fail('web/public/.well-known/security.txt: missing Expires field (RFC 9116)');
} else {
  const when = Date.parse(exp[1].trim());
  if (Number.isNaN(when)) fail(`security.txt: Expires is not a valid date: ${exp[1]}`);
  else if (when < Date.now()) fail(`security.txt: Expires is in the past (${exp[1]}) — renew it`);
}

// ── Report ──────────────────────────────────────────────────────────────────
if (errors.length) {
  console.error(`✗ Governance validation failed (${errors.length} issue${errors.length > 1 ? 's' : ''}):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error('');
  process.exit(1);
}
console.log('✓ Governance surface is consistent (files, labels, ADR index, CODEOWNERS, security.txt).');
