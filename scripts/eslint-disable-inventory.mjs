#!/usr/bin/env node
// Hawkeye Sterling — eslint-disable inventory script.
//
// Forensic audit finding ESLINT-DISABLE-USAGE-DOCUMENTED noted ~318
// eslint-disable* directives across 35+ files. This script gives ops a
// scoped, machine-readable snapshot so cleanup work can be prioritized by
// rule, file, and directive style — and so a CI gate can later flag PRs
// that introduce *more* disables than baseline.
//
// Usage:
//   node scripts/eslint-disable-inventory.mjs              # print summary
//   node scripts/eslint-disable-inventory.mjs --json       # machine output
//   node scripts/eslint-disable-inventory.mjs --top 10     # top-N files / rules
//   node scripts/eslint-disable-inventory.mjs --rule X     # filter to one rule
//
// Exit code:
//   0 — always (inventory tool, not a gate). Use --check-baseline <n> to
//       exit 1 if the total directive count exceeds n.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["src", "netlify", "scripts", "web/app", "web/lib", "web/components"];
const IGNORE = new Set(["node_modules", "dist", ".next", "coverage", ".netlify", "playwright-report", "test-results"]);
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
// Files whose contents reference eslint-disable as documentation / patterns
// rather than real source-level directives.
const IGNORE_FILES = new Set([
  "scripts/eslint-disable-inventory.mjs",
]);

// Patterns we count. eslint supports several forms; we capture all of them so
// a contributor can't sidestep the inventory by switching styles.
//   /* eslint-disable */                  — file-level (turns ALL rules off)
//   /* eslint-disable-next-line foo */    — next-line, one rule
//   /* eslint-disable-line foo */         — same-line, one rule
//   // eslint-disable-next-line foo       — line-comment variant
//   /* eslint-disable foo, bar */         — file-level, scoped to rules
const DIRECTIVE_RE = /(?:\/\*|\/\/)\s*eslint-disable(?:-next-line|-line)?\b([^*\n]*)/g;

function listFiles(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (IGNORE.has(name)) continue;
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      listFiles(full, out);
    } else {
      const lastDot = name.lastIndexOf(".");
      const ext = lastDot >= 0 ? name.slice(lastDot) : "";
      if (EXTENSIONS.has(ext)) out.push(full);
    }
  }
}

function parseRulesFromDirective(rest) {
  // The remainder after `eslint-disable[-next-line|-line]` may contain rule
  // names separated by commas, possibly followed by `*/` or whitespace.
  // An empty body means "disable ALL rules" — represented as the special
  // string "*".
  const trimmed = rest.replace(/\*\//, "").trim();
  if (!trimmed) return ["*"];
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function scanFile(file) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const hits = [];
  let m;
  DIRECTIVE_RE.lastIndex = 0;
  while ((m = DIRECTIVE_RE.exec(content)) !== null) {
    const matchedAt = m.index;
    const lineNumber = content.slice(0, matchedAt).split("\n").length;
    const rules = parseRulesFromDirective(m[1] ?? "");
    for (const rule of rules) hits.push({ rule, lineNumber });
  }
  return hits;
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (name, def = false) => {
    const i = argv.indexOf(name);
    if (i < 0) return def;
    const next = argv[i + 1];
    return next && !next.startsWith("--") ? next : true;
  };
  const wantJson = argv.includes("--json");
  const top = Number(flag("--top", "10"));
  const ruleFilter = flag("--rule", null);
  const baseline = flag("--check-baseline", null);

  const files = [];
  for (const root of SOURCE_ROOTS) listFiles(join(ROOT, root), files);
  files.sort();

  const perFile = new Map();
  const perRule = new Map();
  let total = 0;
  for (const f of files) {
    const rel = relative(ROOT, f).split(sep).join("/");
    if (IGNORE_FILES.has(rel)) continue;
    const hits = scanFile(f);
    if (hits.length === 0) continue;
    const filtered = ruleFilter ? hits.filter((h) => h.rule === ruleFilter) : hits;
    if (filtered.length === 0) continue;
    perFile.set(rel, filtered.length);
    for (const h of filtered) {
      perRule.set(h.rule, (perRule.get(h.rule) ?? 0) + 1);
      total++;
    }
  }

  const summary = {
    total,
    fileCount: perFile.size,
    distinctRules: perRule.size,
    topRules: [...perRule.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([rule, count]) => ({ rule, count })),
    topFiles: [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([file, count]) => ({ file, count })),
    ruleFilter,
    scannedRoots: SOURCE_ROOTS,
  };

  if (wantJson) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`\nHawkeye Sterling — eslint-disable inventory\n`);
    process.stdout.write(`============================================\n`);
    process.stdout.write(`Total directives:       ${summary.total}\n`);
    process.stdout.write(`Files containing them:  ${summary.fileCount}\n`);
    process.stdout.write(`Distinct rules waived:  ${summary.distinctRules}\n`);
    if (ruleFilter) process.stdout.write(`Filter:                  rule=${ruleFilter}\n`);
    process.stdout.write(`\nTop ${top} rules:\n`);
    for (const r of summary.topRules) process.stdout.write(`  ${String(r.count).padStart(4)}  ${r.rule}\n`);
    process.stdout.write(`\nTop ${top} files:\n`);
    for (const f of summary.topFiles) process.stdout.write(`  ${String(f.count).padStart(4)}  ${f.file}\n`);
  }

  if (baseline !== null && baseline !== false) {
    const baselineNum = Number(baseline);
    if (!Number.isFinite(baselineNum)) {
      process.stderr.write(`[eslint-disable-inventory] --check-baseline expects a number, got: ${baseline}\n`);
      process.exit(2);
    }
    if (total > baselineNum) {
      process.stderr.write(`\n[eslint-disable-inventory] FAIL: ${total} directives > baseline ${baselineNum}\n`);
      process.exit(1);
    }
    process.stdout.write(`\n[eslint-disable-inventory] PASS: ${total} <= baseline ${baselineNum}\n`);
  }
}

main();
